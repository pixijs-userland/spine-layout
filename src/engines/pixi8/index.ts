import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import type { RuntimePin } from '../../core/versions/pickRuntime';
import type { Engine, PoseClaimEntry } from '../../engine/Engine';
import type { SkeletonDataLike } from '../../engine/runtime';
import { createCore43, esotericRuntime } from '../esoteric';
import { createPixi8Engine as createEngine, type Pixi8EngineOptions } from './engine';
import type { Pixi8Spine, Pixi8Types } from './types';

export type { Pixi8Spine, Pixi8Types } from './types';
export type { LazyEsotericRuntime, Pixi8EngineOptions, Pixi8Runtime } from './engine';

const spine43 = esotericRuntime(SP43);

const everyExportTo43: RuntimePin = new Proxy({}, { get: () => spine43.minor });

const core43 = createCore43(SP43);

type Collect = (
    instructionSet: unknown,
    renderer: { renderPipes: Record<string, unknown> },
    layer: unknown,
) => void;

const SHARED_PIPE_TAKEN =
    "[SpineLayout] A spine-pixi-v8 4.3 Spine made outside the engine draws nothing: pixi's " +
    'shared "spine" render pipe is another runtime\'s, as a spine-pixi-v8 4.2 imported before ' +
    '@pixijs-userland/spine-layout takes it. Import spine-layout first, or load 4.2 with import() ' +
    "or as a lazy runtime: { minor: '4.2', load: () => import(…) }.";

/**
 * pixi draws every spine whose `renderPipeId` is `'spine'` through the first pipe registered under
 * that name, and a 4.2 imported ahead of this module registers its own there: a 4.3 Spine the game
 * makes itself then draws nothing, and nothing throws. Says so the first time one is collected.
 */
function warnWhenSharedPipeIsNot43(): void {
    const prototype = SP43.Spine.prototype as unknown as { collectRenderablesSimple: Collect };
    const collect = prototype.collectRenderablesSimple;
    let checked = false;

    prototype.collectRenderablesSimple = function (
        this: { renderPipeId: string },
        instructionSet,
        renderer,
        layer,
    ) {
        if (!checked && this.renderPipeId === 'spine') {
            checked = true;
            if (!(renderer.renderPipes.spine instanceof SP43.SpinePipe)) {
                console.warn(SHARED_PIPE_TAKEN);
            }
        }
        collect.call(this, instructionSet, renderer, layer);
    };
}

warnWhenSharedPipeIsNot43();

/** Sorts one of spine-pixi-v8 4.3's `"<Property>|<index>"` labels into what it poses. */
export const classifyPropertyId = (id: string): PoseClaimEntry =>
    core43.classify(id, {} as SkeletonDataLike);

/**
 * With no options, the engine games had before runtimes were picked per skeleton: spine-pixi-v8
 * 4.3 reads every export that names its Spine version, whatever the version, and says nothing.
 * With `runtimes`, each export is read by the runtime its version picks, and the 4.3 imported
 * here is one of them unless `runtimes` holds a 4.3 of its own.
 */
export function createPixi8Engine(): Engine<Pixi8Types>;
export function createPixi8Engine(options: Pixi8EngineOptions): Engine<Pixi8Types<Pixi8Spine>>;
export function createPixi8Engine(
    options?: Pixi8EngineOptions,
): Engine<Pixi8Types> | Engine<Pixi8Types<Pixi8Spine>> {
    if (!options) {
        const engine = createEngine({ runtimes: [spine43], pin: everyExportTo43, warn: () => {} });
        return engine as unknown as Engine<Pixi8Types>;
    }

    const { runtimes } = options;
    const own43 = runtimes.some((runtime) => runtime.minor === spine43.minor);

    return createEngine({ ...options, runtimes: own43 ? runtimes : [spine43, ...runtimes] });
}

export const pixi8Engine = createPixi8Engine();
