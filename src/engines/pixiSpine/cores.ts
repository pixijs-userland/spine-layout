import type { PoseClaimEntry } from '../../engine/Engine';
import type {
    PixiSpineConstraint,
    PixiSpineSkeleton,
    PixiSpineSkeletonData,
    PixiSpineTimeline,
} from './types';

/** What a timeline writes, in the runtime's own labels; `pose` ids each name one property. */
export type TimelineProperties =
    | { kind: 'event' }
    | { kind: 'drawOrder'; id: string }
    | { kind: 'pose'; ids: string[] };

type ConstraintKind = 'ik' | 'transform' | 'path';

/** What one spine-ts generation spells differently: timeline ids and constraint mix fields. */
export interface CoreShim {
    readonly name: 'core3' | 'core4';
    propertiesOf(timeline: PixiSpineTimeline): TimelineProperties;
    /** The fields a constraint's setup pose restores, where its data has them. */
    readonly constraintFields: Readonly<Record<ConstraintKind, readonly string[]>>;
}

// spine-ts 3.7/3.8 TimelineType, read off the id so the shim needs no runtime's classes
const TYPE_SHIFT = 24;
const COLOR = 5;
const EVENT = 7;
const DRAW_ORDER = 8;
const TWO_COLOR = 14;

export const core3: CoreShim = {
    name: 'core3',

    propertiesOf(timeline) {
        const id = timeline.getPropertyId!();

        if (id === EVENT << TYPE_SHIFT) return { kind: 'event' };
        if (id === DRAW_ORDER << TYPE_SHIFT) return { kind: 'drawOrder', id: `${id}` };

        const slot = timeline.slotIndex;

        // 4.x keys color and two-color alike, so they compete as they do there
        if (id >>> TYPE_SHIFT === TWO_COLOR) {
            return { kind: 'pose', ids: [`${id}`, `${(COLOR << TYPE_SHIFT) + slot!}`] };
        }
        // 3.x sums slot and attachment into one number, which lets different pairs collide
        if (timeline.attachment && slot !== undefined) {
            return { kind: 'pose', ids: [`deform|${slot}|${timeline.attachment.id}`] };
        }

        return { kind: 'pose', ids: [`${id}`] };
    },

    constraintFields: {
        ik: ['mix', 'softness', 'bendDirection', 'compress', 'stretch'],
        transform: ['rotateMix', 'translateMix', 'scaleMix', 'shearMix'],
        path: ['position', 'spacing', 'rotateMix', 'translateMix'],
    },
};

// spine-ts 4.0/4.1 Property, which neither runtime exports
const EVENT_PROPERTY = 12;
const DRAW_ORDER_PROPERTY = 13;

export const core4: CoreShim = {
    name: 'core4',

    propertiesOf(timeline) {
        const ids = timeline.getPropertyIds!();
        const property = Number(ids[0]?.split('|')[0]);

        if (property === EVENT_PROPERTY) return { kind: 'event' };
        if (property === DRAW_ORDER_PROPERTY) return { kind: 'drawOrder', id: ids[0] };

        return { kind: 'pose', ids };
    },

    constraintFields: {
        ik: ['mix', 'softness', 'bendDirection', 'compress', 'stretch'],
        transform: ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'],
        path: ['position', 'spacing', 'mixRotate', 'mixX', 'mixY'],
    },
};

type Target = { kind: 'bone' | 'slot' | 'constraint'; index: number };

/** Constraints are one list to the core: IK, then transform, then path, as 4.3 orders them. */
function targetOf(timeline: PixiSpineTimeline, data: PixiSpineSkeletonData): Target | undefined {
    const ik = data.ikConstraints.length;
    const transform = data.transformConstraints.length;

    if (timeline.boneIndex !== undefined) return { kind: 'bone', index: timeline.boneIndex };
    if (timeline.slotIndex !== undefined) return { kind: 'slot', index: timeline.slotIndex };
    if (timeline.ikConstraintIndex !== undefined) {
        return { kind: 'constraint', index: timeline.ikConstraintIndex };
    }
    if (timeline.transformConstraintIndex !== undefined) {
        return { kind: 'constraint', index: ik + timeline.transformConstraintIndex };
    }
    if (timeline.pathConstraintIndex !== undefined) {
        return { kind: 'constraint', index: ik + transform + timeline.pathConstraintIndex };
    }

    return undefined;
}

export function claimTimeline(
    core: CoreShim,
    timeline: PixiSpineTimeline,
    data: PixiSpineSkeletonData,
): PoseClaimEntry[] {
    const properties = core.propertiesOf(timeline);

    if (properties.kind !== 'pose') return [properties];

    const target = targetOf(timeline, data);
    if (!target) return [{ kind: 'event' }];

    return properties.ids.map((id) => ({ ...target, id }));
}

export function constraintToSetup(core: CoreShim, skeleton: PixiSpineSkeleton, index: number) {
    const { ikConstraints, transformConstraints, pathConstraints } = skeleton;
    const lists: [ConstraintKind, PixiSpineConstraint[]][] = [
        ['ik', ikConstraints],
        ['transform', transformConstraints],
        ['path', pathConstraints],
    ];
    let at = index;

    for (const [kind, list] of lists) {
        if (at < list.length) {
            const constraint = list[at] as PixiSpineConstraint & Record<string, unknown>;
            const setup = constraint.data as Record<string, unknown>;

            core.constraintFields[kind].forEach((field) => {
                if (field in setup) constraint[field] = setup[field];
            });
            return;
        }
        at -= list.length;
    }
}
