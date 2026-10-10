import {
    AtlasAttachmentLoader,
    MeshAttachment,
    Physics,
    Property,
    RegionAttachment,
    SkeletonBinary,
    SkeletonJson,
    Spine,
    SpineTexture,
    TextureAtlas,
    type Animation,
    type Bone,
    type Skeleton,
    type SkeletonData,
    type Slot,
    type TextureAtlasRegion,
} from '@esotericsoftware/spine-pixi-v8';
import { Assets, Cache, type Container, type Texture } from 'pixi.js';
import type { BonePose, PoseClaimEntry, SpinePort } from '../../engine/Engine';
import {
    isBinarySkeleton,
    type AnimationLike,
    type BoneLike,
    type SkeletonLike,
    type SkeletonSource,
    type SlotLike,
} from '../../engine/runtime';
import type { Pixi8Types } from './types';

/**
 * Reads a skeleton — a parsed `.json` or the bytes of a `.skel` — against an atlas.
 *
 * The atlas may hold no pages: an attachment is what reaches into it, so a skeleton of nothing
 * but bones, slots and animations never looks a region up.
 */
function readSkeletonData(skeleton: SkeletonSource, atlas: TextureAtlas): SkeletonData {
    const loader = new AtlasAttachmentLoader(atlas);

    return isBinarySkeleton(skeleton)
        ? new SkeletonBinary(loader).readSkeletonData(skeleton)
        : new SkeletonJson(loader).readSkeletonData(skeleton);
}

/** `Spine.createOptions`, minus the `Spine`: the same cache key, so the two share a read. */
function readCachedSkeletonData(skeleton: string, atlas: string): SkeletonData {
    const scale = 1;
    const cacheKey = `${skeleton}-${atlas}-${scale}`;

    if (Cache.has(cacheKey)) return Cache.get<SkeletonData>(cacheKey);

    const loader = new AtlasAttachmentLoader(Assets.get<TextureAtlas>(atlas), false);
    const source = Assets.get(skeleton);
    const parser = source instanceof Uint8Array ? new SkeletonBinary(loader) : new SkeletonJson(loader);

    parser.scale = scale;

    const data = parser.readSkeletonData(source);

    Cache.set(cacheKey, data);

    return data;
}

const EVENT_PROPERTY_ID = `${Property.event}`;

/** Sorts one of the runtime's `"<Property>|<index>"` labels into what it poses. */
export function classifyPropertyId(id: string): PoseClaimEntry {
    if (id === EVENT_PROPERTY_ID) return { kind: 'event' };

    const [property, index] = id.split('|').map(Number);

    if (property <= Property.inherit) return { kind: 'bone', index, id };
    if (property <= Property.deform || property === Property.sequence) {
        return { kind: 'slot', index, id };
    }
    if (property === Property.drawOrder || property === Property.drawOrderFolder) {
        return { kind: 'drawOrder', id };
    }

    return { kind: 'constraint', index, id };
}

type SpineUpdateInternals = { _updateAndApplyState(time: number): void };

const slotOf = (slot: SlotLike) => slot as Slot;
const boneOf = (bone: BoneLike) => bone as Bone;
const skeletonOf = (skeleton: SkeletonLike) => skeleton as unknown as Skeleton;

export const spinePort: SpinePort<Pixi8Types> = {
    readSkeleton(source, atlasText, textures) {
        const atlas = new TextureAtlas(atlasText);

        for (const page of atlas.pages) {
            const texture = textures[page.name];
            if (!texture) throw new Error(`Missing texture for page: ${page.name}`);
            page.setTexture(SpineTexture.from(texture.source));
        }

        return readSkeletonData(source, atlas);
    },

    // A skeleton with no atlas is read with an empty one. `Spine.from` cannot: it looks the
    // atlas up in the asset cache, so a missing one is a warning and then a null attachment
    // loader, rather than the skeleton of bones and animations that was exported.
    readSkeletonFromAssets(skeletonAlias, atlasAlias) {
        if (!atlasAlias) return readSkeletonData(Assets.get(skeletonAlias), new TextureAtlas(''));

        return readCachedSkeletonData(skeletonAlias, atlasAlias);
    },

    create: (data) => new Spine(data as unknown as SkeletonData),
    update: (spine, dt) => spine.update(dt),

    bonePose: (bone) => boneOf(bone).pose as unknown as BonePose,
    boneSetup: (bone) => boneOf(bone).data.setupPose,
    slotAttachment: (slot) => slotOf(slot).pose.attachment,
    slotAlpha: (slot) => slotOf(slot).pose.color.a,

    setupPose(skeleton, scope) {
        const target = skeletonOf(skeleton);

        if (scope === 'all') target.setupPose();
        else if (scope === 'bones') target.setupPoseBones();
        else if (scope === 'slots') target.setupPoseSlots();
        else target.drawOrder.setupPose();
    },
    boneToSetup: (bone) => boneOf(bone).setupPose(),
    slotToSetup: (slot) => slotOf(slot).setupPose(),
    constraintToSetup: (skeleton, index) => skeletonOf(skeleton).constraints?.[index]?.setupPose(),
    updateWorldTransform: (skeleton) => skeletonOf(skeleton).updateWorldTransform(Physics.update),
    drawOrder: (skeleton) => skeletonOf(skeleton).drawOrder.appliedPose,

    claimOf: (animation: AnimationLike) =>
        (animation as Animation).timelines.flatMap((timeline) =>
            (timeline.propertyIds ?? []).map(classifyPropertyId),
        ),

    beforeWorldTransforms(spine, hook) {
        const previous = spine.beforeUpdateWorldTransforms;

        spine.beforeUpdateWorldTransforms = (target) => {
            previous(target);
            hook();
        };

        return () => {
            spine.beforeUpdateWorldTransforms = previous;
        };
    },

    // `_updateAndApplyState` is where the ticker's `internalUpdate` and `update(dt)` both land;
    // the ticker holds its own reference to `internalUpdate`, so wrapping that would miss it.
    onUpdate(spine, hook) {
        const target = spine as unknown as SpineUpdateInternals;
        const previous = target._updateAndApplyState;

        target._updateAndApplyState = function (this: SpineUpdateInternals, time: number) {
            previous.call(this, time);
            hook(time);
        };

        return () => {
            target._updateAndApplyState = previous;
        };
    },

    hitPolygon(slot, attachment) {
        let vertices: ArrayLike<number> | undefined;

        if (attachment instanceof RegionAttachment) {
            vertices = attachment.getOffsets(slotOf(slot).pose);
        } else if (attachment instanceof MeshAttachment && !attachment.bones) {
            vertices = Array.from(attachment.vertices).slice(0, attachment.hullLength);
        }
        if (!vertices?.length) return undefined;

        // a slot object lives in bone space with its y axis the other way up (see
        // `Spine.updateSlotObject`)
        const points: number[] = [];
        for (let i = 0; i < vertices.length; i += 2) points.push(vertices[i], -vertices[i + 1]);

        return points;
    },

    regionTexture(attachment) {
        if (!(attachment instanceof RegionAttachment || attachment instanceof MeshAttachment)) {
            return null;
        }

        // In spine 4.3+ every region/mesh attachment stores its region(s) in a
        // Sequence — static attachments are single-frame sequences.
        const rawRegion = attachment.sequence?.regions?.[0];
        if (!rawRegion) {
            console.warn('Invalid attachment or region');
            return null;
        }

        const region = rawRegion as TextureAtlasRegion & { rotate: boolean };
        const page: Texture = region.texture.texture;

        return {
            page,
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
            rotate: region.degrees === 90 || region.rotate === true ? 90 : region.degrees,
            resolution: page.source.resolution,
        };
    },

    attachSlotObject: (spine, slotName, child) => spine.addSlotObject(slotName, child),
    getSlotObject: (spine, slotName) => spine.getSlotObject(slotName),
    detachSlotObject: (spine, slotOrChild) => spine.removeSlotObject(slotOrChild as string | Container),

    syncSlotObjectsWithDrawOrder(spine) {
        spine.skeleton.drawOrder.appliedPose.forEach((slot) => {
            const container = spine.getSlotObject(slot);
            if (container?.parent === spine) {
                spine.setChildIndex(container, spine.children.length - 1);
            }
        });
    },
};
