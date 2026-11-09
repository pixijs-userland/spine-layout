import { minorOf } from '../../core/versions/minorOf';
import { esotericMinorOf } from './core';
import type {
    EsotericMinor,
    EsotericModule,
    PipeRendererLike,
    PixiV8Like,
    SpinePipeClass,
    SpinePipeLike,
} from './types';

type Extensions = PixiV8Like['extensions'];

interface PipeEntry {
    /** The extension added under the pipe's id. */
    pipe: object;
    runtime?: EsotericModule;
    deferred?: { pipe?: SpinePipeClass };
}

const registries = new WeakMap<Extensions, Map<string, PipeEntry>>();

function registryOf(extensions: Extensions): Map<string, PipeEntry> {
    let registry = registries.get(extensions);
    if (!registry) registries.set(extensions, (registry = new Map()));
    return registry;
}

/** The render pipe a runtime's spines name in `renderPipeId`: never pixi's shared `'spine'`. */
export const spinePipeId = (minor: string) => `spine-${minor}`;

function spinePipeOf(SP: EsotericModule): SpinePipeClass {
    const pipe = (SP as unknown as { SpinePipe?: SpinePipeClass }).SpinePipe;
    if (!pipe) throw new Error('Not a spine-pixi-v8 module: it has no SpinePipe');
    return pipe;
}

function deferredSpinePipe(
    types: PixiV8Like['ExtensionType'],
    name: string,
    slot: { pipe?: SpinePipeClass },
): new (renderer: unknown) => SpinePipeLike {
    return class DeferredSpinePipe implements SpinePipeLike {
        static extension = {
            type: [types.WebGLPipes, types.WebGPUPipes, types.CanvasPipes],
            name,
        };

        private readonly renderer: unknown;
        private impl?: SpinePipeLike;

        // pixi builds every pipe when the renderer starts and calls them by name from then on;
        // anything the runtime's own pipe adds is handed through once it has loaded
        constructor(renderer: unknown) {
            this.renderer = renderer;

            return new Proxy(this, {
                get(target, key, receiver) {
                    if (key in target || !slot.pipe) return Reflect.get(target, key, receiver);

                    const pipe = target.pipe;
                    const value: unknown = Reflect.get(pipe, key);
                    return typeof value === 'function' ? value.bind(pipe) : value;
                },
            });
        }

        private get pipe(): SpinePipeLike {
            if (!slot.pipe) throw new Error(`${name}: its Spine runtime has not loaded yet`);
            return (this.impl ??= new slot.pipe(this.renderer));
        }

        validateRenderable(renderable: unknown) {
            return this.pipe.validateRenderable(renderable);
        }
        addRenderable(renderable: unknown, instructionSet: unknown) {
            this.pipe.addRenderable(renderable, instructionSet);
        }
        updateRenderable(renderable: unknown) {
            this.pipe.updateRenderable(renderable);
        }
        execute(renderable: unknown) {
            this.pipe.execute?.(renderable);
        }
        destroyRenderable(renderable: unknown) {
            this.pipe.destroyRenderable(renderable);
        }
        destroy() {
            this.impl?.destroy();
        }
    };
}

function esotericMinor(version: string): EsotericMinor {
    const minor = minorOf(version);
    if (minor === '4.2' || minor === '4.3') return minor;

    throw new Error(`spine-pixi-v8 has no runtime for Spine ${version}, only 4.2 and 4.3`);
}

/**
 * Reserves the pipe of a runtime that loads later, so that a renderer starting in between builds
 * it as it starts, through pixi's public API alone. A spine of that runtime must not render
 * before {@link registerSpinePipe} hands the runtime over.
 */
export function deferSpinePipe(pixi: PixiV8Like, minor: EsotericMinor): string {
    const id = spinePipeId(esotericMinor(minor));
    const registry = registryOf(pixi.extensions);
    if (registry.has(id)) return id;

    const deferred: PipeEntry['deferred'] = {};
    const pipe = deferredSpinePipe(pixi.ExtensionType, id, deferred);
    pixi.extensions.add(pipe);
    registry.set(id, { pipe, deferred });

    return id;
}

/**
 * Renders a spine-pixi-v8 runtime through a pipe of its own, `spine-<minor>`: 4.2 and 4.3 both
 * register theirs as `'spine'`, and pixi keeps whichever came first for both. A renderer that
 * started before it gets the pipe from {@link ensureSpinePipe}.
 */
export function registerSpinePipe(pixi: PixiV8Like, SP: EsotericModule): string {
    const minor = esotericMinorOf(SP);
    const id = spinePipeId(minor);
    const registry = registryOf(pixi.extensions);
    const entry = registry.get(id);

    if (entry?.runtime === SP) return id;
    if (entry?.runtime) throw new Error(`${id} already renders another spine-pixi-v8 ${minor}`);

    const base = spinePipeOf(SP);

    if (entry?.deferred) {
        entry.deferred.pipe = base;
        entry.runtime = SP;
        return id;
    }

    class RenamedSpinePipe extends base {
        static extension = { ...base.extension, name: id };
    }

    pixi.extensions.add(RenamedSpinePipe);
    registry.set(id, { pipe: RenamedSpinePipe, runtime: SP });

    return id;
}

/**
 * Builds pipe `id` into a renderer that started before it was registered, as the renderer's
 * `init()` built every pipe registered by then. pixi skips a spine whose pipe the renderer lacks
 * and then throws on its next view update.
 */
export function ensureSpinePipe(pixi: PixiV8Like, renderer: PipeRendererLike, id: string): void {
    if (renderer.renderPipes[id]) return;

    const entry = registryOf(pixi.extensions).get(id);
    if (!entry) throw new Error(`${id} is not a registered render pipe`);
    if (!renderer._addPipes) {
        throw new Error(
            `${id} was registered after this renderer started: create the engine before the renderer`,
        );
    }

    renderer._addPipes([{ name: id, value: entry.pipe }], []);
}
