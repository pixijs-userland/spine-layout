// @vitest-environment happy-dom
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import { CanvasRenderer, Container, Texture, TextureSource, Ticker } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { SpineLayout } from '../../../src/index';
import { createPixi8Engine } from '../../../src/pixi8';
import { esotericRuntime } from '../../../src/runtimes';
import { RIG_ATLAS, RIGS } from '../esoteric/harness';
import { pagesOf, spineExport, type ExportName } from './exports';

Ticker.shared.autoStart = false;
Ticker.shared.stop();

interface Started {
    renderPipes: Record<string, object>;
    renderGroup: { _updateRenderGroups(group: unknown): void };
    config: { systems: unknown; renderPipes: unknown; renderPipeAdaptors: unknown };
    _addSystems(systems: unknown): void;
    _addPipes(pipes: unknown, adaptors: unknown): void;
}

interface RenderGroup {
    instructionSet: { instructions: unknown[]; instructionSize: number };
}

const load = vi.fn(() => import('spine-pixi-v8-42'));

const engine = createPixi8Engine({
    runtimes: [esotericRuntime(SP43), { minor: '4.2', load }],
});

/** Started between the engine and the load, as a game's `app.init()` is. */
const renderer = (() => {
    const started = new CanvasRenderer() as unknown as Started;
    started._addSystems(started.config.systems);
    started._addPipes(started.config.renderPipes, started.config.renderPipeAdaptors);
    return started;
})();

const textures = () => ({
    'rig.png': new Texture({ source: new TextureSource({ width: 64, height: 64, resolution: 1 }) }),
});

describe('createPixi8Engine with a lazy 4.2', () => {
    it('names the runtime it will load, and reserves its pipe in a renderer started before', () => {
        expect(
            engine.spine.runtimes.map(({ minor, packageVersion }) => [minor, packageVersion]),
        ).toEqual([
            ['4.3', '4.3.x'],
            ['4.2', '4.2.120'],
        ]);
        expect(renderer.renderPipes['spine-4.2'].constructor.name).toBe('DeferredSpinePipe');
        expect(load).not.toHaveBeenCalled();
    });

    it('reads a 4.3 export at once, and a 4.2 one only once prepared', () => {
        expect(engine.spine.readSkeleton(RIGS['4.3'], RIG_ATLAS, textures())).toBeInstanceOf(
            SP43.SkeletonData,
        );
        expect(() => engine.spine.readSkeleton(RIGS['4.2'], RIG_ATLAS, textures())).toThrow(
            /The Spine 4\.2 runtime has not loaded/,
        );
    });

    it('loads 4.2 as a layout of a 4.2 export builds, and draws it through the reserved pipe', async () => {
        const layout = new SpineLayout({ engine });

        await layout.loadInstancesFromDataArray([
            { name: 'root', skeleton: RIGS['4.2'], atlasText: RIG_ATLAS, textures: textures() },
        ]);

        const SP42 = await import('spine-pixi-v8-42');
        const root = layout.getSpineByID('root')!;
        const stage = new Container({ isRenderGroup: true });
        stage.addChild(root as unknown as Container);

        renderer.renderGroup._updateRenderGroups(stage.renderGroup);
        engine.spine.update(root, 0.1);
        renderer.renderGroup._updateRenderGroups(stage.renderGroup);

        const { instructions, instructionSize } = (stage.renderGroup as unknown as RenderGroup)
            .instructionSet;

        expect(load).toHaveBeenCalledTimes(1);
        expect(root).toBeInstanceOf(SP42.Spine);
        expect(engine.spine.runtimeOf(root)?.minor).toBe('4.2');
        expect(root.renderPipeId).toBe('spine-4.2');
        expect(instructions.slice(0, instructionSize)).toContain(root);
        expect(renderer.renderPipes['spine-4.2'].constructor.name).toBe('DeferredSpinePipe');

        stage.destroy({ children: true });
    });
});

describe('a layout over a lazy 4.2, its folder holding an export no runtime reads', () => {
    afterEach(() => vi.restoreAllMocks());

    const asData = (name: string, from: ExportName, version?: string) => {
        const { skeleton, atlasText } = spineExport(from);
        if (version) skeleton.skeleton.spine = version;
        if (name === 'root') skeleton.slots.push({ name: 'spine_settings', bone: 'okButton' });
        return { name, skeleton, atlasText, textures: pagesOf(atlasText) };
    };

    it('loads 4.2, builds what its runtimes read, and skips the 3.8 export alone', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const engine = createPixi8Engine({
            runtimes: [
                esotericRuntime(SP43),
                { minor: '4.2', load: () => import('spine-pixi-v8-42') },
            ],
        });
        const layout = new SpineLayout({ engine });

        await expect(
            layout.loadInstancesFromDataArray([
                asData('root', 'okButton-4.3'),
                asData('settings', 'settingsButton-4.2'),
                asData('old', 'settingsButton-4.2', '3.8.99'),
            ]),
        ).resolves.toBeUndefined();

        expect([...layout.getSpines().keys()]).toEqual(['root', 'settings']);
        expect(engine.spine.runtimeOf(layout.getSpineByID('settings')!)?.minor).toBe('4.2');

        layout.createInstance('old');

        expect(errors).toHaveBeenCalledWith(
            '[SpineLayout] Error loading spine "old":',
            expect.any(UnsupportedSpineVersionError),
        );
        expect(layout.getSpineByID('old')).toBeUndefined();

        layout.destroy();
    });

    it('still rejects what is not a version no runtime reads: a runtime that fails to load', async () => {
        const failure = new Error('chunk failed to load');
        const engine = createPixi8Engine({
            runtimes: [
                esotericRuntime(SP43),
                { minor: '4.2', load: () => Promise.reject(failure) },
            ],
        });

        await expect(engine.spine.prepare!(['4.3', '4.2', '3.8'])).rejects.toBe(failure);
    });
});

describe('a layout over a lazy 4.2, gone before 4.2 is in', () => {
    const gated = () => {
        let open!: () => void;
        const gate = new Promise<void>((resolve) => (open = resolve));
        const engine = createPixi8Engine({
            runtimes: [
                esotericRuntime(SP43),
                { minor: '4.2', load: () => gate.then(() => import('spine-pixi-v8-42')) },
            ],
        });
        return { engine, open };
    };

    const folder = () => {
        const { skeleton, atlasText } = spineExport('settingsButton-4.2');
        return [{ name: 'root', skeleton, atlasText, textures: pagesOf(atlasText) }];
    };

    it.each(['destroy', 'reset'] as const)('builds nothing once %s ran in between', async (end) => {
        const { engine, open } = gated();
        const layout = new SpineLayout({ engine });

        const loading = layout.createInstancesFromDataArray(folder());
        layout[end]();
        open();
        await loading;

        expect(layout.getSpines().size).toBe(0);
        expect(layout.children?.length ?? 0).toBe(0);
    });

    it('builds what a later call asked for, not what the reset one did', async () => {
        const { engine, open } = gated();
        const layout = new SpineLayout({ engine });

        const first = layout.createInstancesFromDataArray(folder());
        layout.reset();
        const second = layout.createInstancesFromDataArray(folder());
        open();
        await Promise.all([first, second]);

        expect([...layout.getSpines().keys()]).toEqual(['root']);
        expect(layout.children.length).toBe(1);

        layout.destroy();
    });
});
