import { skeletonVersion } from '../../core/utils/skeletonVersion';
import { minorOf } from '../../core/versions/minorOf';
import { applyPrePasses } from '../../core/versions/prePasses';
import { pickRuntime, type RuntimePin } from '../../core/versions/pickRuntime';
import type { BonePose, PointLike, SpinePort, SpineRuntimeInfo } from '../../engine/Engine';
import { isBinarySkeleton, type SkeletonDataLike, type SkeletonSource } from '../../engine/runtime';
import { createHookSet } from '../shared/hookSet';
import { claimTimeline, constraintToSetup } from './cores';
import { degreesOf } from './groupD8';
import type { SlotHolderTransform } from './holder';
import type { PixiSpineRuntime } from './runtimes';
import { createSlotObjects } from './slotObjects';
import {
    SHAPE_FACTORIES,
    type PixiSpineAnimation,
    type PixiSpineBaseTexture,
    type PixiSpineBone,
    type PixiSpineContainer,
    type PixiSpineDisplayClasses,
    type PixiSpineMeshAttachment,
    type PixiSpineRegionAttachment,
    type PixiSpineSequence,
    type PixiSpineSkeleton,
    type PixiSpineSkeletonData,
    type PixiSpineSlot,
    type PixiSpineTexture,
    type PixiSpineTextureRegion,
    type PixiSpineTypes,
    type PixiSpineView,
} from './types';
import { onSpineUpdate } from './updateHooks';

/** The engine's asset cache, as far as reading a skeleton from it goes. */
export interface PixiSpineAssets<Texture> {
    get<A = unknown>(alias: string): A | undefined;
    /** What a game's own loader made of an alias; pixi-spine's loaders leave `spineData` on it. */
    resource(alias: string): { spineData?: unknown } | undefined;
    /** An atlas page's texture by its file name, as the game's loader keyed it. */
    pageTexture(page: string, atlasAlias?: string): Texture | undefined;
}

export interface PixiSpinePortOptions<T extends PixiSpineTypes> {
    PIXI: PixiSpineDisplayClasses;
    /** From `pixiSpineLegacy` or `pixiSpineModular`; one per export minor. */
    runtimes: readonly PixiSpineRuntime[];
    holderTransform: SlotHolderTransform;
    assets: PixiSpineAssets<T['Texture']>;
    /** The runtime a project's game reads an export minor with, where it is another minor's. */
    pin?: RuntimePin;
    /** Where a skeleton read by a runtime other than its own is reported. */
    warn?: (message: string) => void;
}

export interface PixiSpinePort<T extends PixiSpineTypes = PixiSpineTypes> extends SpinePort<T> {
    /** Reads with `runtime` as given: no runtime picking, no pre-passes. */
    readSkeletonWith(
        runtime: SpineRuntimeInfo,
        source: SkeletonSource,
        atlasText: string,
        textures: Record<string, T['Texture']>,
    ): SkeletonDataLike;
}

const beforeWorldTransforms = createHookSet<PixiSpineView['state'], []>((state, run) => {
    const previous = state.apply;

    state.apply = (skeleton) => {
        const applied = previous.call(state, skeleton);
        run();
        return applied;
    };

    return () => {
        state.apply = previous;
    };
});

const never = () => false;
const NO_HIT = { contains: never };

/**
 * A clip mask keeps its `containsPoint`: Pixi asks the mask before it descends into the slots it
 * clips. It answers no as a target through a hit area instead.
 */
function shield(view: PixiSpineContainer, isMask = !!view.isMask) {
    if (isMask) view.hitArea = NO_HIT;
    else view.containsPoint = never;
}

const skeletonOf = (skeleton: unknown) => skeleton as PixiSpineSkeleton;
const boneOf = (bone: unknown) => bone as PixiSpineBone;
const slotOf = (slot: unknown) => slot as PixiSpineSlot;

/**
 * `RegionAttachment.updateOffset` (3.x) / `updateRegion` (4.1): pixi-spine leaves `offset` empty
 * on read, and 1.x/2.x warn on every read of `region.offsetY`.
 */
function regionCorners(
    attachment: PixiSpineRegionAttachment,
    region: PixiSpineTextureRegion | null | undefined,
): number[] | undefined {
    if (!region) return undefined;

    const { width, height, scaleX, scaleY, x, y, rotation } = attachment;

    const regionScaleX = (width / region.originalWidth) * scaleX;
    const regionScaleY = (height / region.originalHeight) * scaleY;
    const left = (-width / 2) * scaleX + region.offsetX * regionScaleX;
    const bottom = (-height / 2) * scaleY + region.spineOffsetY * regionScaleY;
    const right = left + region.width * regionScaleX;
    const top = bottom + region.height * regionScaleY;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const corner = (cx: number, cy: number) => [cx * cos - cy * sin + x, cy * cos + cx * sin + y];

    return [
        ...corner(left, bottom),
        ...corner(left, top),
        ...corner(right, top),
        ...corner(right, bottom),
    ];
}

/** The region of frame `index`, or of the setup frame for -1, as 4.1's `Sequence.apply` picks it. */
function frameOf({ regions, setupIndex }: PixiSpineSequence, index = -1) {
    return regions[Math.min(index < 0 ? setupIndex : index, regions.length - 1)];
}

/** The region a sequence shows for `slot`. */
function sequenceRegion(
    attachment: PixiSpineRegionAttachment | PixiSpineMeshAttachment,
    slot?: PixiSpineSlot,
): PixiSpineTextureRegion | null | undefined {
    const { sequence } = attachment;
    if (!sequence) return attachment.region;

    return slot ? frameOf(sequence, slot.sequenceIndex) : sequence.regions[0];
}

/**
 * The export as one of `minor` where its header names no version: pixi-spine's 3.8 and 4.x readers
 * take the first three characters of `skeleton.spine`, and throw where there is none.
 */
function versioned(source: object, minor: string): object {
    const { skeleton } = source as { skeleton?: { spine?: unknown } };
    if (!skeleton || minorOf(skeletonVersion(source as SkeletonSource))) return source;

    return { ...source, skeleton: { ...skeleton, spine: minor } };
}

/**
 * pixi-spine 3.1.2 builds the mesh of a 4.1 sequence before any frame is applied, with no
 * texture, and Pixi 6's `MeshMaterial` throws on its first update. Each sequence starts on its
 * setup frame instead, as 4.0.6 does for itself.
 */
function showSetupFrames(data: PixiSpineSkeletonData) {
    data.skins.forEach((skin) =>
        skin.attachments.forEach((bySlot) =>
            Object.values(bySlot ?? {}).forEach((value) => {
                const attachment = value as PixiSpineRegionAttachment;
                if (attachment?.sequence && !attachment.region) {
                    attachment.region = frameOf(attachment.sequence) ?? null;
                }
            }),
        ),
    );
}

/**
 * The SpinePort over pixi-spine's runtimes on Pixi 4 to 7. Each skeleton is read by the runtime
 * of its export version (`pickRuntime`); every later call goes to the runtime whose classes
 * built its argument.
 */
export function createPixiSpinePort<T extends PixiSpineTypes = PixiSpineTypes>({
    PIXI,
    runtimes,
    holderTransform,
    assets,
    pin,
    warn = (message) => console.warn(message),
}: PixiSpinePortOptions<T>): PixiSpinePort<T> {
    if (!runtimes.length) throw new Error('createPixiSpinePort: no runtime given');

    const infos = runtimes.map((runtime) => runtime.info);
    const poses = new WeakMap<PixiSpineBone, BonePose>();
    const pages = new WeakMap<PixiSpineBaseTexture, PixiSpineTexture>();
    const framed = new WeakSet<PixiSpineSkeletonData>();

    const kindOf = (attachment: unknown) => {
        for (const runtime of runtimes) {
            const kind = runtime.kindOf(attachment);
            if (kind) return kind;
        }
        return undefined;
    };

    const slotObjects = createSlotObjects(
        PIXI,
        holderTransform,
        (attachment) => !!kindOf(attachment),
    );

    type Owned = 'SkeletonData' | 'Skeleton' | 'Bone';

    function ownerOf(target: unknown, of: Owned): PixiSpineRuntime {
        const owner = runtimes.find((runtime) => target instanceof runtime.classes[of]);
        if (!owner) throw new Error(`No pixi-spine runtime of this engine made this ${of}`);
        return owner;
    }

    const spineOwner = (spine: PixiSpineView) => {
        const owner = runtimes.find((runtime) => spine instanceof runtime.Spine);
        if (!owner) throw new Error('No pixi-spine runtime of this engine made this spine');
        return owner;
    };

    function runtimeFor(info: SpineRuntimeInfo): PixiSpineRuntime {
        const runtime = runtimes.find(
            ({ info: own }) =>
                own.minor === info.minor &&
                own.family === info.family &&
                own.packageName === info.packageName &&
                own.packageVersion === info.packageVersion,
        );
        if (!runtime) throw new Error(`Not a runtime of this engine: Spine ${info.minor}`);
        return runtime;
    }

    function read(
        runtime: PixiSpineRuntime,
        source: SkeletonSource,
        atlasText: string,
        texture: (page: string) => PixiSpineTexture | undefined,
    ): PixiSpineSkeletonData {
        const atlas = new runtime.TextureAtlas(atlasText, (page, load) => {
            const found = texture(page);
            if (!found) throw new Error(`Missing texture for page: ${page}`);
            load(found.baseTexture);
        });
        const loader = new runtime.classes.AtlasAttachmentLoader(atlas);

        if (!isBinarySkeleton(source)) {
            return new runtime.classes.SkeletonJson(loader).readSkeletonData(
                versioned(source, runtime.info.minor),
            );
        }

        const { SkeletonBinary } = runtime.classes;
        if (!SkeletonBinary)
            throw new Error(`The Spine ${runtime.info.minor} runtime reads no .skel`);

        const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
        return new SkeletonBinary(loader).readSkeletonData(bytes);
    }

    function route(source: SkeletonSource, file?: string) {
        const binary = isBinarySkeleton(source);
        const pick = pickRuntime(skeletonVersion(source), infos, pin, { file, binary });

        if (pick.warning) warn(pick.warning);

        return {
            runtime: runtimeFor(pick.runtime),
            source: pick.prePasses.length ? applyPrePasses(source, pick.prePasses) : source,
        };
    }

    function skeletonToRoot<P extends PointLike>(
        runtime: PixiSpineRuntime,
        skeleton: PixiSpineSkeleton,
        point: P,
    ): P {
        const { x, y, scaleX, scaleY } = skeleton;
        // pixi-spine flips y inside `updateWorldTransformWith`, so `skeleton.scaleY` stays positive
        const sy = runtime.yDown() ? -scaleY : scaleY;

        point.x = scaleX ? (point.x - x) / scaleX : 0;
        point.y = sy ? (point.y - y) / sy : 0;
        return point;
    }

    /** pixi-spine's own sprites, meshes and clipping graphics: every slot container child but ours. */
    const shapesOf = (spine: PixiSpineView) =>
        spine.slotContainers.flatMap((container) =>
            container.children.filter((view) => !slotObjects.isHolder(view) && view.containsPoint),
        );

    return {
        runtimes: infos,
        runtimeOf(spineOrData) {
            const owner = runtimes.find(
                (runtime) =>
                    spineOrData instanceof runtime.Spine ||
                    spineOrData instanceof runtime.classes.SkeletonData,
            );
            return owner?.info;
        },

        readSkeleton(source, atlasText, textures) {
            const routed = route(source);
            return read(routed.runtime, routed.source, atlasText, (page) => textures[page]);
        },

        readSkeletonWith: (runtime, source, atlasText, textures) =>
            read(runtimeFor(runtime), source, atlasText, (page) => textures[page]),

        readSkeletonFromAssets(skeletonAlias, atlasAlias) {
            const ready = assets.resource(skeletonAlias)?.spineData;
            if (ready) {
                ownerOf(ready, 'SkeletonData');
                return ready as SkeletonDataLike;
            }

            const source = assets.get<SkeletonSource>(skeletonAlias);
            if (!source) throw new Error(`No skeleton loaded as "${skeletonAlias}"`);

            const atlasText = atlasAlias ? assets.get<string>(atlasAlias) : '';
            if (atlasText === undefined) throw new Error(`No atlas loaded as "${atlasAlias}"`);

            const routed = route(source, skeletonAlias);
            return read(routed.runtime, routed.source, atlasText, (page) =>
                assets.pageTexture(page, atlasAlias),
            );
        },

        create(data) {
            const skeletonData = data as PixiSpineSkeletonData;
            const { Spine } = ownerOf(skeletonData, 'SkeletonData');

            if (!framed.has(skeletonData)) {
                framed.add(skeletonData);
                showSetupFrames(skeletonData);
            }
            return new Spine(skeletonData) as T['Spine'];
        },
        update: (spine, dt) => spine.update(dt),

        onUpdate: onSpineUpdate,

        bonePose(target) {
            const bone = boneOf(target);
            let pose = poses.get(bone);

            if (!pose) {
                const runtime = ownerOf(bone, 'Bone');

                pose = {
                    get x() {
                        return bone.x;
                    },
                    set x(value) {
                        bone.x = value;
                    },
                    get y() {
                        return bone.y;
                    },
                    set y(value) {
                        bone.y = value;
                    },
                    get worldX() {
                        return bone.worldX;
                    },
                    get worldY() {
                        return bone.worldY;
                    },
                    worldToParent: (point, skeleton) =>
                        bone.parent
                            ? bone.parent.worldToLocal(point)
                            : skeletonToRoot(runtime, skeletonOf(skeleton), point),
                };
                poses.set(bone, pose);
            }

            return pose;
        },
        boneSetup: (bone) => boneOf(bone).data,
        slotAttachment: (slot) => slotOf(slot).attachment,
        slotAlpha: (slot) => slotOf(slot).color.a,

        setupPose(target, scope) {
            const skeleton = skeletonOf(target);

            if (scope === 'all') skeleton.setToSetupPose();
            else if (scope === 'bones') skeleton.setBonesToSetupPose();
            else if (scope === 'slots') skeleton.setSlotsToSetupPose();
            else skeleton.slots.forEach((slot, index) => (skeleton.drawOrder[index] = slot));
        },
        boneToSetup: (bone) => boneOf(bone).setToSetupPose(),
        slotToSetup: (slot) => slotOf(slot).setToSetupPose(),

        constraintToSetup(target, index) {
            const skeleton = skeletonOf(target);
            constraintToSetup(ownerOf(skeleton, 'Skeleton').core, skeleton, index);
        },
        updateWorldTransform: (skeleton) => skeletonOf(skeleton).updateWorldTransform(),
        drawOrder: (skeleton) => skeletonOf(skeleton).drawOrder,

        claimOf(animation, target) {
            const data = target as PixiSpineSkeletonData;
            const { core } = ownerOf(data, 'SkeletonData');

            return (animation as PixiSpineAnimation).timelines.flatMap((timeline) =>
                claimTimeline(core, timeline, data),
            );
        },

        beforeWorldTransforms: (spine, hook) => beforeWorldTransforms(spine.state, hook),

        hitPolygon(slot, attachment) {
            const kind = kindOf(attachment);
            let vertices: ArrayLike<number> | undefined;

            if (kind === 'region') {
                const region = attachment as PixiSpineRegionAttachment;
                vertices = regionCorners(region, sequenceRegion(region, slot && slotOf(slot)));
            } else if (kind === 'mesh') {
                const mesh = attachment as PixiSpineMeshAttachment;
                if (!mesh.bones) vertices = Array.from(mesh.vertices).slice(0, mesh.hullLength);
            }
            if (!vertices?.length) return undefined;

            const points: number[] = [];
            for (let i = 0; i < vertices.length; i += 2) points.push(vertices[i], -vertices[i + 1]);

            return points;
        },

        regionTexture(attachment, slot) {
            const kind = kindOf(attachment);
            if (kind !== 'region' && kind !== 'mesh') return null;

            const region = sequenceRegion(
                attachment as PixiSpineRegionAttachment | PixiSpineMeshAttachment,
                slot && slotOf(slot),
            );
            const texture = region?.texture;
            if (!texture) return null;

            const { baseTexture, frame } = texture;
            const { resolution } = baseTexture;
            const rotate = degreesOf(texture.rotate);
            const turned = rotate % 180 !== 0;

            let page = pages.get(baseTexture);
            if (!page) {
                page = new PIXI.Texture(baseTexture);
                pages.set(baseTexture, page);
            }

            return {
                page,
                x: frame.x * resolution,
                y: frame.y * resolution,
                width: (turned ? frame.height : frame.width) * resolution,
                height: (turned ? frame.width : frame.height) * resolution,
                rotate,
                resolution,
            };
        },

        shieldShapes(spine) {
            spineOwner(spine);
            const prototype = Object.getPrototypeOf(spine) as PixiSpineView;

            shapesOf(spine).forEach((view) => shield(view));

            // a sprite or clip mask is made when its attachment first shows, long after this runs
            SHAPE_FACTORIES.forEach((factory) => {
                const create = prototype[factory] as (...args: unknown[]) => PixiSpineContainer;

                spine[factory] = ((...args: unknown[]) => {
                    const view = create.apply(spine, args);
                    shield(view, factory === 'newGraphics');
                    return view;
                }) as never;
            });
        },

        exposeShapes(spine) {
            SHAPE_FACTORIES.forEach((factory) => {
                if (Object.hasOwn(spine, factory)) delete spine[factory];
            });
            shapesOf(spine).forEach((view) => {
                if (Object.hasOwn(view, 'containsPoint')) delete view.containsPoint;
                if (view.hitArea === NO_HIT) delete view.hitArea;
            });
        },

        attachSlotObject: (spine, slotName, child) => slotObjects.attach(spine, slotName, child),
        getSlotObject: (spine, slotName) =>
            slotObjects.get(spine, slotName) as T['Container'] | undefined,
        detachSlotObject: (spine, slotOrChild) => slotObjects.detach(spine, slotOrChild),
        syncSlotObjectsWithDrawOrder: () => {},
    };
}
