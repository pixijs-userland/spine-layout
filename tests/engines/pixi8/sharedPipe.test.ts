// @vitest-environment happy-dom
import * as SP42 from 'spine-pixi-v8-42';
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import { CanvasRenderer, Container, Texture, TextureSource, Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pixi8Engine } from '../../../src/index';
import { RIG_ATLAS, RIGS } from '../esoteric/harness';

Ticker.shared.autoStart = false;
Ticker.shared.stop();

interface Started {
    renderPipes: Record<string, object>;
    renderGroup: { _updateRenderGroups(group: unknown): void };
    config: { systems: unknown; renderPipes: unknown; renderPipeAdaptors: unknown };
    _addSystems(systems: unknown): void;
    _addPipes(pipes: unknown, adaptors: unknown): void;
}

const renderer = (() => {
    const started = new CanvasRenderer() as unknown as Started;
    started._addSystems(started.config.systems);
    started._addPipes(started.config.renderPipes, started.config.renderPipeAdaptors);
    return started;
})();

const read = () =>
    pixi8Engine.spine.readSkeleton(RIGS['4.3'], RIG_ATLAS, {
        'rig.png': new Texture({ source: new TextureSource({ width: 64, height: 64 }) }),
    });

function draw(...spines: Container[]) {
    const stage = new Container({ isRenderGroup: true });
    stage.addChild(...spines);
    renderer.renderGroup._updateRenderGroups(stage.renderGroup);
    stage.destroy({ children: true });
}

const RULE = /Import spine-layout first, or load 4\.2 with import\(\) or as a lazy runtime/;

// spine-pixi-v8 4.2 is imported above spine-layout here, as a game's `main.ts` might
describe('spine-pixi-v8 4.2 imported before the "." entry', () => {
    afterEach(() => vi.restoreAllMocks());

    it('has pixi\'s shared "spine" pipe, which no 4.3 Spine draws through', () => {
        expect(renderer.renderPipes.spine).toBeInstanceOf(SP42.SpinePipe);
        expect(renderer.renderPipes.spine).not.toBeInstanceOf(SP43.SpinePipe);
    });

    it("says nothing while only the engine's spines are drawn, through pipes of their own", () => {
        const warn = vi.spyOn(console, 'warn');

        draw(pixi8Engine.spine.create(read()) as unknown as Container);

        expect(warn).not.toHaveBeenCalled();
    });

    it('warns, once, when a 4.3 Spine made outside the engine is drawn', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        draw(new SP43.Spine(read() as SP43.SkeletonData));
        draw(new SP43.Spine(read() as SP43.SkeletonData));

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(RULE));
    });
});
