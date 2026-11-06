import type { PointLike, PoseClaimEntry } from '../../engine/Engine';
import type { BoneLike, SkeletonDataLike, SkeletonLike, SlotLike } from '../../engine/runtime';
import type {
    AtlasLike,
    AtlasRegionLike,
    CoreShim,
    EsotericMinor,
    EsotericModule,
    SlotPoseLike,
    WorldPoseLike,
} from './types';

/**
 * spine-core 4.2's `Property`, which it keeps module-local (4.2.120 `Animation.js`): a timeline's
 * property ids are `"<Property>|<index>"` and `import { Property }` is a link error on 4.2.
 */
export const PROPERTY_42 = {
    rotate: 0,
    x: 1,
    y: 2,
    scaleX: 3,
    scaleY: 4,
    shearX: 5,
    shearY: 6,
    inherit: 7,
    rgb: 8,
    alpha: 9,
    rgb2: 10,
    attachment: 11,
    deform: 12,
    event: 13,
    drawOrder: 14,
    ikConstraint: 15,
    transformConstraint: 16,
    pathConstraintPosition: 17,
    pathConstraintSpacing: 18,
    pathConstraintMix: 19,
    physicsConstraintInertia: 20,
    physicsConstraintStrength: 21,
    physicsConstraintDamping: 22,
    physicsConstraintMass: 23,
    physicsConstraintWind: 24,
    physicsConstraintGravity: 25,
    physicsConstraintMix: 26,
    physicsConstraintReset: 27,
    sequence: 28,
} as const;

/** The spine-core minor of a spine-pixi module: 4.3 alone exports `DrawOrder`, 4.2 has `Physics`. */
export function esotericMinorOf(SP: EsotericModule): EsotericMinor {
    if ('DrawOrder' in SP) return '4.3';
    if ('Physics' in SP) return '4.2';

    throw new Error('Not a spine-pixi module of spine-core 4.2 or 4.3');
}

/** The Pixi major a spine-pixi module renders on: v8 alone has a render pipe, v7 slot meshes. */
export function esotericPixiOf(SP: EsotericModule): 7 | 8 {
    if ('SpinePipe' in SP) return 8;
    if ('SlotMesh' in SP) return 7;

    throw new Error('Not a spine-pixi-v7 or spine-pixi-v8 module');
}

interface Sequence {
    regions: AtlasRegionLike[];
    setupIndex: number;
}

type Reset = { setToSetupPose(): void };

interface Bone42 extends BoneLike, PointLike, WorldPoseLike, Reset {
    data: BoneLike['data'] & PointLike;
}

interface Slot42 extends SlotLike, SlotPoseLike, Reset {
    sequenceIndex: number;
}

interface Skeleton42 extends SkeletonLike, Reset {
    slots: Slot42[];
    drawOrder: Slot42[];
    ikConstraints: Reset[];
    transformConstraints: Reset[];
    pathConstraints: Reset[];
    physicsConstraints: Reset[];
    setBonesToSetupPose(): void;
    setSlotsToSetupPose(): void;
}

interface SkeletonData42 extends SkeletonDataLike {
    ikConstraints: unknown[];
    transformConstraints: unknown[];
    pathConstraints: unknown[];
}

interface Attachment42 {
    region: AtlasRegionLike | null;
    offset?: ArrayLike<number>;
    sequence: (Sequence & { apply(slot: SlotLike, attachment: object): void }) | null;
}

const NO_INDEX = -1;

const indexOf = (value: number) => (Number.isInteger(value) && value >= 0 ? value : NO_INDEX);

interface PropertyTable {
    inherit: number;
    deform: number;
    event: number;
    drawOrder: number;
    sequence: number;
    drawOrderFolder?: number;
}

function classifyWith(
    table: PropertyTable,
    id: string,
    constraintIndex: (property: number, index: number) => number,
): PoseClaimEntry {
    if (id === `${table.event}`) return { kind: 'event' };

    const [property, index] = id.split('|').map(Number);

    if (property <= table.inherit) return { kind: 'bone', index, id };
    if (property <= table.deform || property === table.sequence) return { kind: 'slot', index, id };
    if (property === table.drawOrder || property === table.drawOrderFolder) {
        return { kind: 'drawOrder', id };
    }

    return { kind: 'constraint', index: constraintIndex(property, index), id };
}

/**
 * 4.2 keeps one list per constraint type and its timelines index into that list. Flattened in
 * the order of {@link CoreShim.constraints}: ik, transform, path, physics.
 */
function flatConstraintIndex(data: SkeletonData42, property: number, index: number): number {
    if (indexOf(index) === NO_INDEX) return NO_INDEX;

    const ik = data.ikConstraints.length;
    const transform = data.transformConstraints.length;
    const path = data.pathConstraints.length;

    if (property === PROPERTY_42.ikConstraint) return index;
    if (property === PROPERTY_42.transformConstraint) return ik + index;
    if (property <= PROPERTY_42.pathConstraintMix) return ik + transform + index;

    return ik + transform + path + index;
}

function sequenceFrame(sequence: Sequence, index: number): number {
    return Math.min(index === -1 ? sequence.setupIndex : index, sequence.regions.length - 1);
}

export function createCore42(SP: EsotericModule): CoreShim {
    const { AtlasAttachmentLoader } = SP as unknown as {
        AtlasAttachmentLoader: new (atlas: AtlasLike) => object;
    };
    const constraints = (skeleton: SkeletonLike) => {
        const target = skeleton as Skeleton42;

        return [
            ...target.ikConstraints,
            ...target.transformConstraints,
            ...target.pathConstraints,
            ...target.physicsConstraints,
        ];
    };

    return {
        minor: '4.2',
        local: (bone) => bone as Bone42,
        world: (bone) => bone as Bone42,
        boneSetup: (bone) => (bone as Bone42).data,
        boneToSetup: (bone) => (bone as Bone42).setToSetupPose(),
        slotPose: (slot) => slot as Slot42,
        slotToSetup: (slot) => (slot as Slot42).setToSetupPose(),

        setupPose(skeleton, scope) {
            const target = skeleton as Skeleton42;

            if (scope === 'all') target.setToSetupPose();
            else if (scope === 'bones') target.setBonesToSetupPose();
            else if (scope === 'slots') target.setSlotsToSetupPose();
            else target.slots.forEach((slot, index) => (target.drawOrder[index] = slot));
        },

        constraints,
        constraintToSetup: (skeleton, index) =>
            (constraints(skeleton)[index] as Reset | undefined)?.setToSetupPose(),
        drawOrder: (skeleton) => (skeleton as Skeleton42).drawOrder,

        classify: (id, data) =>
            classifyWith(PROPERTY_42, id, (property, index) =>
                flatConstraintIndex(data as SkeletonData42, property, index),
            ),

        // A sequence's region and offsets are its current frame's once applied, which the
        // renderer does to the shared attachment before every draw.
        regionOffsets(slot, attachment) {
            const target = attachment as Attachment42;
            target.sequence?.apply(slot, target);

            return target.offset;
        },

        region(attachment, slot) {
            const { sequence, region } = attachment as Attachment42;
            if (!sequence) return region;

            const frame = slot ? sequenceFrame(sequence, (slot as Slot42).sequenceIndex) : 0;
            return sequence.regions[frame];
        },

        attachmentLoader: (atlas) => new AtlasAttachmentLoader(atlas),
    };
}

interface Pose43 extends PointLike, WorldPoseLike {}

interface Bone43 extends BoneLike {
    pose: Pose43;
    appliedPose: Pose43;
    data: BoneLike['data'] & { setupPose: PointLike };
    setupPose(): void;
}

interface Slot43 extends SlotLike {
    appliedPose: SlotPoseLike & { sequenceIndex: number };
    setupPose(): void;
}

interface Skeleton43 extends SkeletonLike {
    drawOrder: { appliedPose: SlotLike[]; setupPose(): void };
    constraints: { setupPose(): void }[];
    setupPose(): void;
    setupPoseBones(): void;
    setupPoseSlots(): void;
}

interface Attachment43 {
    sequence: Sequence & { resolveIndex(pose: object): number };
    getOffsets?(pose: object): ArrayLike<number>;
}

export function createCore43(SP: EsotericModule): CoreShim {
    const { AtlasAttachmentLoader, Property } = SP as unknown as {
        AtlasAttachmentLoader: new (atlas: AtlasLike) => object;
        Property: PropertyTable;
    };

    return {
        minor: '4.3',
        local: (bone) => (bone as Bone43).pose,
        world: (bone) => (bone as Bone43).appliedPose,
        boneSetup: (bone) => (bone as Bone43).data.setupPose,
        boneToSetup: (bone) => (bone as Bone43).setupPose(),
        slotPose: (slot) => (slot as Slot43).appliedPose,
        slotToSetup: (slot) => (slot as Slot43).setupPose(),

        setupPose(skeleton, scope) {
            const target = skeleton as Skeleton43;

            if (scope === 'all') target.setupPose();
            else if (scope === 'bones') target.setupPoseBones();
            else if (scope === 'slots') target.setupPoseSlots();
            else target.drawOrder.setupPose();
        },

        constraints: (skeleton) => (skeleton as Skeleton43).constraints,
        constraintToSetup: (skeleton, index) =>
            (skeleton as Skeleton43).constraints?.[index]?.setupPose(),
        drawOrder: (skeleton) => (skeleton as Skeleton43).drawOrder.appliedPose,

        classify: (id) => classifyWith(Property, id, (_property, index) => indexOf(index)),

        regionOffsets: (slot, attachment) =>
            (attachment as Attachment43).getOffsets?.((slot as Slot43).appliedPose),

        region(attachment, slot) {
            const { sequence } = attachment as Attachment43;
            const frame = slot ? sequence.resolveIndex((slot as Slot43).appliedPose) : 0;

            return sequence.regions[frame] ?? sequence.regions[0];
        },

        attachmentLoader: (atlas) => new AtlasAttachmentLoader(atlas),
    };
}

export const coreShimFor = (SP: EsotericModule): CoreShim =>
    esotericMinorOf(SP) === '4.3' ? createCore43(SP) : createCore42(SP);
