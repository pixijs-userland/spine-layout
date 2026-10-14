import type { ContainerLike, PointLike } from '../../engine/Engine';
import type { SkeletonDataLike, SlotLike } from '../../engine/runtime';
import { pruneDuplicateSpineLoaders } from './assets';
import { esotericMinorOf } from './core';
import type {
    DisplayShim,
    EsotericClasses,
    EsotericModule,
    EsotericSpine,
    PixiV7Like,
} from './types';

type Update = (this: V7Spine, frame?: number, seconds?: number) => void;

interface Shape extends ContainerLike {
    containsPoint?(point: PointLike): boolean;
}

interface V7Spine extends EsotericSpine {
    ticker: { deltaMS: number };
    internalUpdate: Update;
    slotMeshFactory: () => Shape;
    meshesCache: Map<SlotLike, Shape>;
    slotsObject: Map<SlotLike, { container: ContainerLike }>;
    renderMeshes(): void;
}

interface V7Texture {
    baseTexture: { resolution: number };
}

const never = () => false;

/**
 * The ticker holds the `internalUpdate` it was handed when `autoUpdate` went on: swapping the
 * method only reaches the ticker with `autoUpdate` off around the swap.
 */
function swapOnTicker(spine: V7Spine, swap: () => void) {
    const auto = spine.autoUpdate;

    spine.autoUpdate = false;
    swap();
    spine.autoUpdate = auto;
}

export function createV7Display(SP: EsotericModule, pixi: PixiV7Like): DisplayShim {
    if (!('SlotMesh' in SP)) throw new Error('Not a spine-pixi-v7 module: it has no SlotMesh');

    const { Spine, SpineTexture } = SP as unknown as EsotericClasses & {
        Spine: { skeletonCache: Record<string, SkeletonDataLike> };
    };
    const factories = new WeakMap<V7Spine, () => Shape>();

    pruneDuplicateSpineLoaders(pixi.Assets);

    return {
        pixi: 7,
        minor: esotericMinorOf(SP),

        create: (data) => new Spine(data),

        // v7 moves slot objects while it renders; an update re-applies the pose for whoever
        // reads them before that
        update(target, dt) {
            const spine = target as V7Spine;

            spine.update(dt);
            if (spine.slotsObject.size) spine.renderMeshes();
        },

        installUpdateHook(target, run) {
            const spine = target as V7Spine;
            const own = Object.hasOwn(spine, 'internalUpdate');
            const previous = spine.internalUpdate;

            swapOnTicker(spine, () => {
                spine.internalUpdate = function (frame, seconds) {
                    previous.call(this, frame, seconds);
                    run(seconds ?? this.ticker.deltaMS / 1000);
                };
            });

            return () =>
                swapOnTicker(spine, () => {
                    if (own) spine.internalUpdate = previous;
                    else delete (spine as Partial<V7Spine>).internalUpdate;
                });
        },

        spineTexture: (texture) => SpineTexture.from((texture as V7Texture).baseTexture),
        pageResolution: (page) => (page as V7Texture).baseTexture.resolution,

        asset: (alias) => pixi.Assets.get(alias),

        // each runtime's `Spine` keeps a cache of its own, under `Spine.from`'s key
        cached(key, read) {
            return (Spine.skeletonCache[key] ??= read());
        },

        // its shapes are meshes, one per slot as it first shows; clipping masks are never hit
        shieldShapes(target) {
            const spine = target as V7Spine;
            spine.meshesCache.forEach((mesh) => (mesh.containsPoint = never));

            if (factories.has(spine)) return;

            const create = spine.slotMeshFactory;
            factories.set(spine, create);
            spine.slotMeshFactory = () => {
                const mesh = create();
                mesh.containsPoint = never;
                return mesh;
            };
        },

        exposeShapes(target) {
            const spine = target as V7Spine;
            const create = factories.get(spine);

            if (create) {
                spine.slotMeshFactory = create;
                factories.delete(spine);
            }
            spine.meshesCache.forEach((mesh) => {
                if (Object.hasOwn(mesh, 'containsPoint')) delete mesh.containsPoint;
            });
        },

        // `removeSlotObject` takes a slot, and ignores a container
        detach(target, slotOrChild) {
            const spine = target as V7Spine;
            if (typeof slotOrChild === 'string') return spine.removeSlotObject(slotOrChild);

            for (const [slot, { container }] of spine.slotsObject) {
                if (container !== slotOrChild) continue;

                spine.removeSlotObject(slot, container);
                return;
            }
        },

        // v7 orders slot objects by `zIndex` every render
        syncSlotObjects: () => {},
    };
}
