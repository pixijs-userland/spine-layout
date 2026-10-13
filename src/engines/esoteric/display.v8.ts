import type { SkeletonDataLike } from '../../engine/runtime';
import { pruneDuplicateSpineLoaders } from './assets';
import { esotericMinorOf } from './core';
import { ensureSpinePipe, registerSpinePipe } from './pipes';
import type {
    DisplayShim,
    EsotericClasses,
    EsotericModule,
    EsotericSpine,
    PipeRendererLike,
    PixiV8Like,
} from './types';

type Collect = (instructionSet: unknown, renderer: PipeRendererLike, layer: unknown) => void;

interface V8Spine extends EsotericSpine {
    renderPipeId: string;
    didViewUpdate: boolean;
    collectRenderablesSimple: Collect;
    _updateAndApplyState(time: number): void;
}

interface V8Texture {
    source: { resolution: number };
}

const never = () => false;

/**
 * spine-pixi-v8, 4.2 or 4.3. Creating it registers the runtime's render pipe; a renderer that
 * started earlier gets that pipe when it first collects one of the spines it creates.
 */
export function createV8Display(SP: EsotericModule, pixi: PixiV8Like): DisplayShim {
    const { Spine, SpineTexture } = SP as unknown as EsotericClasses;
    const minor = esotericMinorOf(SP);
    const pipeId = registerSpinePipe(pixi, SP);

    pruneDuplicateSpineLoaders(pixi.Assets);

    return {
        pixi: 8,
        minor,

        create(data) {
            const spine = new Spine(data) as V8Spine;
            const collect = spine.collectRenderablesSimple;

            spine.renderPipeId = pipeId;
            // pixi validates every spine with a pending view update through its pipe, drawn or
            // not; starting out pending keeps it off that list until a renderer has collected it,
            // and so built its pipe
            spine.didViewUpdate = true;
            spine.collectRenderablesSimple = function (
                this: V8Spine,
                instructionSet,
                renderer,
                layer,
            ) {
                ensureSpinePipe(pixi, renderer, pipeId);
                collect.call(this, instructionSet, renderer, layer);
            };

            return spine;
        },
        update: (spine, dt) => spine.update(dt),

        // `update(dt)` and the ticker's `internalUpdate` both land here; the ticker holds its own
        // reference to `internalUpdate`, so wrapping that would miss it
        installUpdateHook(target, run) {
            const spine = target as V8Spine;
            const previous = spine._updateAndApplyState;

            spine._updateAndApplyState = function (this: V8Spine, time: number) {
                previous.call(this, time);
                run(time);
            };

            return () => {
                spine._updateAndApplyState = previous;
            };
        },

        spineTexture: (texture) => SpineTexture.from((texture as V8Texture).source),
        pageResolution: (page) => (page as V8Texture).source.resolution,

        asset: (alias) => pixi.Assets.get(alias),

        // the pixi cache is global and both runtimes key a read `${skeleton}-${atlas}-${scale}`
        cached(key, read) {
            const own = `${key}@${minor}`;
            if (pixi.Cache.has(own)) return pixi.Cache.get(own) as SkeletonDataLike;

            const data = read();
            pixi.Cache.set(own, data);
            return data;
        },

        // spine-pixi-v8 draws through its render pipe, not with children: the `Spine` answering
        // for its bounds is the one shape to take out
        shieldShapes(spine) {
            spine.containsPoint = never;
        },
        exposeShapes(spine) {
            if (Object.hasOwn(spine, 'containsPoint')) delete spine.containsPoint;
        },

        detach: (spine, slotOrChild) => spine.removeSlotObject(slotOrChild),

        syncSlotObjects(spine, drawOrder) {
            drawOrder.forEach((slot) => {
                const child = spine.getSlotObject(slot);
                if (child?.parent === spine) spine.setChildIndex(child, spine.children.length - 1);
            });
        },
    };
}
