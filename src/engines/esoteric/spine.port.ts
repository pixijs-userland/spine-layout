import { skeletonVersion } from '../../core/utils/skeletonVersion';
import { pickRuntime, type RuntimePin } from '../../core/versions/pickRuntime';
import { applyPrePasses } from '../../core/versions/prePasses';
import { RUNTIME_MATRIX } from '../../core/versions/runtimeMatrix';
import type { BonePose, EngineTypes, SpinePort, SpineRuntimeInfo } from '../../engine/Engine';
import {
    isBinarySkeleton,
    type BoneLike,
    type SkeletonDataLike,
    type SkeletonSource,
} from '../../engine/runtime';
import { createHookSet } from '../shared/hookSet';
import { adoptAtlas, isAtlas } from './assets';
import { esotericMinorOf, esotericPixiOf } from './core';
import type {
    AtlasLike,
    CoreShim,
    DisplayShim,
    EsotericClasses,
    EsotericModule,
    EsotericSpine,
    EsotericTypes,
} from './types';

export interface EsotericPortOptions {
    SP: EsotericModule;
    core: CoreShim;
    display: DisplayShim;
    /** What the port reports itself as; by default the runtime matrix's entry. */
    runtime?: SpineRuntimeInfo;
    /** The runtime a project's game reads an export minor with, where it is another minor's. */
    pin?: RuntimePin;
    /** Where a skeleton read by a runtime other than its own is reported. */
    warn?: (message: string) => void;
}

interface Timeline {
    propertyIds?: string[];
}

interface MeshAttachment {
    bones: number[] | null;
    vertices: ArrayLike<number>;
    hullLength: number;
}

const isSkeletonExport = (value: unknown): value is SkeletonSource =>
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    Array.isArray((value as { bones?: unknown } | null)?.bones);

/**
 * The SpinePort of one Esoteric runtime: spine-pixi-v7 or v8 over spine-core 4.2 or 4.3, all four
 * the same port, with what parts them in `core` and `display`. It reads the exports `pickRuntime`
 * gives its runtime; an engine with several runtimes routes each skeleton to its runtime's port.
 */
export function createEsotericSpinePort<T extends EngineTypes = EsotericTypes>({
    SP,
    core,
    display,
    runtime,
    pin,
    warn = (message) => console.warn(message),
}: EsotericPortOptions): SpinePort<T> {
    const classes = SP as unknown as EsotericClasses;
    const minor = esotericMinorOf(SP);
    const pixi = esotericPixiOf(SP);

    if (core.minor !== minor || display.minor !== minor || display.pixi !== pixi) {
        throw new Error(
            `A spine-pixi-v${pixi} ${minor} port needs its core and display from the same module: ` +
                `got a ${core.minor} core and a v${display.pixi} ${display.minor} display`,
        );
    }

    const info: SpineRuntimeInfo = runtime ?? { minor, ...RUNTIME_MATRIX[pixi][minor] };

    if (info.minor !== minor) {
        throw new Error(`A Spine ${minor} runtime cannot report itself as ${info.minor}`);
    }

    const poses = new WeakMap<BoneLike, BonePose>();

    const beforeWorldTransforms = createHookSet<EsotericSpine, []>((spine, run) => {
        const previous = spine.beforeUpdateWorldTransforms;

        spine.beforeUpdateWorldTransforms = (target) => {
            previous(target);
            run();
        };

        return () => {
            spine.beforeUpdateWorldTransforms = previous;
        };
    });
    const onUpdate = createHookSet<EsotericSpine, [number]>(display.installUpdateHook);

    /** The export as this runtime reads it; throws `UnsupportedSpineVersionError` for another's. */
    function readable(source: SkeletonSource, file?: string): SkeletonSource {
        const binary = isBinarySkeleton(source);
        const pick = pickRuntime(skeletonVersion(source), [info], pin, { file, binary });
        if (pick.warning) warn(pick.warning);

        return applyPrePasses(source, pick.prePasses);
    }

    function read(source: SkeletonSource, atlas: AtlasLike): SkeletonDataLike {
        const loader = core.attachmentLoader(atlas);

        if (!isBinarySkeleton(source))
            return new classes.SkeletonJson(loader).readSkeletonData(source);

        const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
        return new classes.SkeletonBinary(loader).readSkeletonData(bytes);
    }

    function skeletonAsset(alias: string): SkeletonSource {
        const value = display.asset(alias);
        if (value === undefined || value === null) {
            throw new Error(`No skeleton loaded as "${alias}"`);
        }
        if (!isSkeletonExport(value)) {
            throw new Error(`"${alias}" is not a skeleton export (another loader parsed it)`);
        }
        return readable(value, alias);
    }

    function atlasAsset(alias: string): AtlasLike {
        const value = display.asset(alias);
        if (!isAtlas(value)) throw new Error(`No atlas loaded as "${alias}"`);
        return value;
    }

    /**
     * World values come off the pose a bone was drawn with. A root bone is posed in skeleton
     * space: offset and scaled by the skeleton, yDown flip included.
     */
    function bonePose(bone: BoneLike): BonePose {
        let pose = poses.get(bone);
        if (pose) return pose;

        pose = {
            get x() {
                return core.local(bone).x;
            },
            set x(value) {
                core.local(bone).x = value;
            },
            get y() {
                return core.local(bone).y;
            },
            set y(value) {
                core.local(bone).y = value;
            },
            get worldX() {
                return core.world(bone).worldX;
            },
            get worldY() {
                return core.world(bone).worldY;
            },
            worldToParent(point, skeleton) {
                if (bone.parent) return core.world(bone.parent).worldToLocal(point);

                const { x, y, scaleX, scaleY } = skeleton;
                point.x = scaleX ? (point.x - x) / scaleX : 0;
                point.y = scaleY ? (point.y - y) / scaleY : 0;
                return point;
            },
        };
        poses.set(bone, pose);

        return pose;
    }

    const port: SpinePort<EsotericTypes> = {
        runtimes: [info],
        runtimeOf: (spineOrData) =>
            spineOrData instanceof classes.Spine || spineOrData instanceof classes.SkeletonData
                ? info
                : undefined,

        readSkeleton(source, atlasText, textures) {
            const skeleton = readable(source);
            const atlas = new classes.TextureAtlas(atlasText);

            for (const page of atlas.pages) {
                const texture = textures[page.name];
                if (!texture) throw new Error(`Missing texture for page: ${page.name}`);
                page.setTexture(display.spineTexture(texture));
            }

            return read(skeleton, atlas);
        },

        readSkeletonFromAssets(skeletonAlias, atlasAlias) {
            if (!atlasAlias)
                return read(skeletonAsset(skeletonAlias), new classes.TextureAtlas(''));

            return display.cached(`${skeletonAlias}-${atlasAlias}-1`, () =>
                read(skeletonAsset(skeletonAlias), adoptAtlas(SP, atlasAsset(atlasAlias))),
            );
        },

        create: (data) => display.create(data),
        update: (spine, dt) => display.update(spine, dt),

        bonePose,
        boneSetup: (bone) => core.boneSetup(bone),
        slotAttachment: (slot) => core.slotPose(slot).attachment,
        slotAlpha: (slot) => core.slotPose(slot).color.a,

        setupPose: (skeleton, scope) => core.setupPose(skeleton, scope),
        boneToSetup: (bone) => core.boneToSetup(bone),
        slotToSetup: (slot) => core.slotToSetup(slot),
        constraintToSetup: (skeleton, index) => core.constraintToSetup(skeleton, index),
        updateWorldTransform: (skeleton) =>
            (
                skeleton as unknown as { updateWorldTransform(physics: unknown): void }
            ).updateWorldTransform(classes.Physics.update),
        drawOrder: (skeleton) => core.drawOrder(skeleton),

        claimOf: (animation, data) =>
            (animation.timelines as Timeline[]).flatMap((timeline) =>
                (timeline.propertyIds ?? []).map((id) => core.classify(id, data)),
            ),

        beforeWorldTransforms,
        onUpdate,

        hitPolygon(slot, attachment) {
            let vertices: ArrayLike<number> | undefined;

            if (attachment instanceof classes.RegionAttachment) {
                vertices = core.regionOffsets(slot, attachment);
            } else if (attachment instanceof classes.MeshAttachment) {
                const mesh = attachment as MeshAttachment;
                if (!mesh.bones) vertices = Array.from(mesh.vertices).slice(0, mesh.hullLength);
            }
            if (!vertices?.length) return undefined;

            // a slot object lives in bone space with its y axis the other way up
            const points: number[] = [];
            for (let i = 0; i < vertices.length; i += 2) points.push(vertices[i], -vertices[i + 1]);

            return points;
        },

        regionTexture(attachment, slot) {
            if (
                !(
                    attachment instanceof classes.RegionAttachment ||
                    attachment instanceof classes.MeshAttachment
                )
            ) {
                return null;
            }

            const region = core.region(attachment, slot);
            if (!region) return null;

            const page = region.texture.texture;

            return {
                page,
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height,
                rotate: region.degrees === 90 || region.rotate === true ? 90 : region.degrees,
                resolution: display.pageResolution(page),
            };
        },

        shieldShapes: (spine) => display.shieldShapes(spine),
        exposeShapes: (spine) => display.exposeShapes(spine),

        attachSlotObject: (spine, slotName, child) => spine.addSlotObject(slotName, child),
        getSlotObject: (spine, slotName) => spine.getSlotObject(slotName),
        detachSlotObject: (spine, slotOrChild) => display.detach(spine, slotOrChild),
        syncSlotObjectsWithDrawOrder: (spine) =>
            display.syncSlotObjects(spine, core.drawOrder(spine.skeleton)),
    };

    return port as unknown as SpinePort<T>;
}
