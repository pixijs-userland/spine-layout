// @vitest-environment happy-dom
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import { CanvasRenderer, Container, Texture, TextureSource, Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkeletonDataLike } from '../../../src/engine/runtime';
import { createPixi8Engine, pixi8Engine } from '../../../src/index';
import { esotericRuntime } from '../../../src/runtimes';
import { RIG_ATLAS, RIGS } from '../esoteric/harness';

Ticker.shared.autoStart = false;
Ticker.shared.stop();

const SP42 = await import('spine-pixi-v8-42');

interface Pipe {
    addRenderable(renderable: unknown, instructionSet: unknown): void;
}

interface Started {
    renderPipes: Record<string, Pipe>;
    renderGroup: { _updateRenderGroups(group: unknown): void };
    config: { systems: unknown; renderPipes: unknown; renderPipeAdaptors: unknown };
    _addSystems(systems: unknown): void;
    _addPipes(pipes: unknown, adaptors: unknown): void;
}

/** A renderer as `init()` leaves it, started once the runtimes are in. */
function started(): Started {
    const renderer = new CanvasRenderer() as unknown as Started;
    renderer._addSystems(renderer.config.systems);
    renderer._addPipes(renderer.config.renderPipes, renderer.config.renderPipeAdaptors);
    return renderer;
}

const pages = () => ({
    'rig.png': new Texture({ source: new TextureSource({ width: 64, height: 64, resolution: 1 }) }),
});

describe('the pixi8 engine with 4.2 added to the 4.3 of the "." entry', () => {
    const engine = createPixi8Engine({ runtimes: [esotericRuntime(SP42)] });
    const renderer = started();
    const read = (minor: string): SkeletonDataLike =>
        engine.spine.readSkeleton(RIGS[minor], RIG_ATLAS, pages());
    const destroyed: Container[] = [];

    afterEach(() => {
        destroyed.splice(0).forEach((view) => view.destroy({ children: true }));
        vi.restoreAllMocks();
    });

    it('leaves the shared "spine" pipe to 4.3, a pipe of its own to each runtime', () => {
        const { spine, 'spine-4.3': own43, 'spine-4.2': own42 } = renderer.renderPipes;

        expect(spine).toBeInstanceOf(SP43.SpinePipe);
        expect(spine).not.toBeInstanceOf(SP42.SpinePipe);
        expect(own43).toBeInstanceOf(SP43.SpinePipe);
        expect(own43).not.toBe(spine);
        expect(own42).toBeInstanceOf(SP42.SpinePipe);
    });

    it("draws its spines through their runtime's pipe, and a 4.3 Spine made outside it through 4.3's own", () => {
        const warn = vi.spyOn(console, 'warn');
        const spines = {
            'spine-4.3': engine.spine.create(read('4.3')) as unknown as Container,
            'spine-4.2': engine.spine.create(read('4.2')) as unknown as Container,
            'spine-4.3 (default engine)': pixi8Engine.spine.create(
                pixi8Engine.spine.readSkeleton(RIGS['4.3'], RIG_ATLAS, pages()),
            ) as unknown as Container,
            spine: new SP43.Spine(read('4.3') as SP43.SkeletonData),
        };
        const stage = new Container({ isRenderGroup: true });
        stage.addChild(...Object.values(spines));
        destroyed.push(stage);

        const drawnBy = new Map<unknown, string>();
        Object.entries(renderer.renderPipes)
            .filter(([id]) => id.startsWith('spine'))
            .forEach(([id, pipe]) => {
                const add = pipe.addRenderable.bind(pipe);
                vi.spyOn(pipe, 'addRenderable').mockImplementation((renderable, set) => {
                    drawnBy.set(renderable, id);
                    add(renderable, set);
                });
            });

        renderer.renderGroup._updateRenderGroups(stage.renderGroup);
        Object.values(spines).forEach((spine) => (spine as SP43.Spine).update(0.1));
        renderer.renderGroup._updateRenderGroups(stage.renderGroup);

        expect(
            Object.fromEntries(Object.entries(spines).map(([at, s]) => [at, drawnBy.get(s)])),
        ).toEqual({
            'spine-4.3': 'spine-4.3',
            'spine-4.2': 'spine-4.2',
            'spine-4.3 (default engine)': 'spine-4.3',
            spine: 'spine',
        });
        expect(warn).not.toHaveBeenCalled();
    });
});
