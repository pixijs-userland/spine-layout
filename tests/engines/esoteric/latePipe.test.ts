// @vitest-environment happy-dom
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import * as PIXI from 'pixi.js';
import { CanvasRenderer, Container, Texture, TextureSource, Ticker } from 'pixi.js';
import * as SP42 from 'spine-pixi-v8-42';
import { afterEach, describe, expect, it } from 'vitest';
import {
    coreShimFor,
    createEsotericSpinePort,
    createV8Display,
    deferSpinePipe,
    type EsotericModule,
    type EsotericSpine,
} from '../../../src/engines/esoteric';
import { RIG_ATLAS, RIGS } from './harness';

Ticker.shared.autoStart = false;
Ticker.shared.stop();

interface Started {
    renderPipes: Record<string, unknown>;
    renderGroup: { _updateRenderGroups(group: unknown): void };
}

interface Starting extends Started {
    config: { systems: unknown; renderPipes: unknown; renderPipeAdaptors: unknown };
    _addSystems(systems: unknown): void;
    _addPipes(pipes: unknown, adaptors: unknown): void;
}

interface RenderGroup {
    instructionSet: { instructions: unknown[]; instructionSize: number };
}

/** A renderer as `init()` leaves it, as magic-slot has one before it builds its layout. */
function started(): Started {
    const renderer = new CanvasRenderer() as unknown as Starting;
    renderer._addSystems(renderer.config.systems);
    renderer._addPipes(renderer.config.renderPipes, renderer.config.renderPipeAdaptors);
    return renderer;
}

// each before anything esoteric registers a pipe: pixi's config list is shared and grows
const renderers = {
    visible: started(),
    hidden: started(),
    hiddenParent: started(),
    deferred: started(),
};

const page = () =>
    new Texture({ source: new TextureSource({ width: 64, height: 64, resolution: 1 }) });

function scene(SP: EsotericModule, minor: string) {
    const port = createEsotericSpinePort({
        SP,
        core: coreShimFor(SP),
        display: createV8Display(SP, PIXI),
    });
    const stage = new Container({ isRenderGroup: true });
    const holder = new Container();
    const spine = port.create(port.readSkeleton(RIGS[minor], RIG_ATLAS, { 'rig.png': page() }));

    holder.addChild(spine as unknown as Container);
    stage.addChild(holder);
    spine.state.setAnimation(0, 'pose', true);

    return { port, stage, holder, spine };
}

const renderGroupOf = (stage: Container) => stage.renderGroup as unknown as RenderGroup;

/** The frame's render-group pass, which is where pixi looks a spine's pipe up. */
function frame(renderer: Started, stage: Container) {
    renderer.renderGroup._updateRenderGroups(renderGroupOf(stage));
}

const drawn = (stage: Container, spine: EsotericSpine) => {
    const { instructions, instructionSize } = renderGroupOf(stage).instructionSet;
    return instructions.slice(0, instructionSize).includes(spine);
};

describe('a renderer that started before the engine', () => {
    const spines: EsotericSpine[] = [];

    afterEach(() => {
        spines.splice(0).forEach((spine) => spine.destroy());
    });

    it('builds the pipe it lacks for a spine, and draws it', () => {
        const renderer = renderers.visible;
        const { port, stage, spine } = scene(SP43, '4.3');
        spines.push(spine);

        expect(renderer.renderPipes['spine-4.3']).toBeUndefined();

        frame(renderer, stage);
        port.update(spine, 0.1);
        frame(renderer, stage);
        port.update(spine, 0.1);
        frame(renderer, stage);

        expect(renderer.renderPipes['spine-4.3']).toBeInstanceOf(SP43.SpinePipe);
        expect(renderer.renderPipes['spine-4.3']).not.toBe(renderer.renderPipes.spine);
        expect(drawn(stage, spine)).toBe(true);
    });

    it.each([
        ['hidden', 'the spine'],
        ['hiddenParent', 'its parent'],
    ] as const)('animates a spine while %s, without the pipe, until shown', (name, hide) => {
        const renderer = renderers[name];
        const { port, stage, holder, spine } = scene(SP43, '4.3');
        const hidden = hide === 'the spine' ? (spine as unknown as Container) : holder;
        spines.push(spine);
        hidden.visible = false;

        frame(renderer, stage);
        port.update(spine, 0.1);
        frame(renderer, stage);
        port.update(spine, 0.1);
        frame(renderer, stage);

        expect(drawn(stage, spine)).toBe(false);

        hidden.visible = true;
        frame(renderer, stage);
        port.update(spine, 0.1);
        frame(renderer, stage);

        expect(renderer.renderPipes['spine-4.3']).toBeInstanceOf(SP43.SpinePipe);
        expect(drawn(stage, spine)).toBe(true);
    });

    it('builds a pipe deferred after it started, once the runtime has loaded', () => {
        const renderer = renderers.deferred;
        const id = deferSpinePipe(PIXI, '4.2');
        const { port, stage, spine } = scene(SP42, '4.2');
        spines.push(spine);

        frame(renderer, stage);
        port.update(spine, 0.1);
        frame(renderer, stage);

        expect((renderer.renderPipes[id] as object).constructor.name).toBe('DeferredSpinePipe');
        expect(drawn(stage, spine)).toBe(true);
    });
});
