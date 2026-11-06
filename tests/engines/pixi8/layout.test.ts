// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import 'pixi.js/events';
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import {
    Assets,
    CanvasRenderer,
    Container,
    EventBoundary,
    Point,
    Ticker,
    updateRenderGroupTransforms,
} from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManifestLike } from '../../../src/core/config/types';
import { createPixi8Engine, SpineLayout, type Pixi8Spine } from '../../../src/index';
import { esotericRuntime } from '../../../src/runtimes';
import { pagesOf, spineExport } from './exports';

const SP42 = await import('spine-pixi-v8-42');

Ticker.shared.autoStart = false;
Ticker.shared.stop();

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

const fnt = readFileSync(`${import.meta.dirname}/../../fixtures/contract.fnt`, 'utf8');

/** okButton, 4.3, with settingsButton, 4.2, in a `spine_settings` slot, and a text on each. */
function folder() {
    const root = spineExport('okButton-4.3');
    root.skeleton.bones.push(
        { name: 'at_settings', parent: 'okButton', x: 400 },
        { name: 'at_title', parent: 'okButton', y: 200 },
    );
    root.skeleton.slots.push(
        { name: 'spine_settings', bone: 'at_settings' },
        { name: 'text_title', bone: 'at_title' },
    );

    const settings = spineExport('settingsButton-4.2');
    settings.skeleton.slots.push({ name: 'text_caption', bone: 'settingsButton' });

    return { root, settings };
}

const asData = (name: string, { skeleton, atlasText }: ReturnType<typeof spineExport>) => ({
    name,
    skeleton,
    atlasText,
    textures: pagesOf(atlasText),
});

/** What a 4.3 loader leaves in the asset cache: the JSON as is, the atlas parsed by 4.3. */
function cache(name: string, { skeleton, atlasText }: ReturnType<typeof spineExport>) {
    const atlas = new SP43.TextureAtlas(atlasText);
    const pages = pagesOf(atlasText);
    atlas.pages.forEach((page) => page.setTexture(SP43.SpineTexture.from(pages[page.name].source)));

    Assets.cache.set(`${name}.json`, skeleton);
    Assets.cache.set(`${name}.atlas`, atlas);

    return [`${name}.json`, `${name}.atlas`, `${name}.png`];
}

const manifestOf = (aliases: string[]): ManifestLike => ({
    bundles: [{ name: 'spine', assets: aliases.map((alias) => ({ alias: [alias], src: alias })) }],
});

const runtimeOf = (spine: Pixi8Spine) =>
    spine instanceof SP42.Spine ? '4.2' : spine instanceof SP43.Spine ? '4.3' : 'neither';

describe('SpineLayout over the "." engine with 4.2 added', () => {
    const engine = createPixi8Engine({ runtimes: [esotericRuntime(SP42)] });
    const fontFamily = engine.text.registerBitmapFont(fnt, {
        'contract.png': engine.display.whiteTexture,
    });
    const layouts: SpineLayout<Pixi8Spine>[] = [];
    const cached: string[] = [];

    async function build() {
        const { root, settings } = folder();
        const layout = new SpineLayout({ engine });
        layouts.push(layout);

        await layout.loadInstancesFromDataArray([
            asData('root', root),
            asData('settings', settings),
        ]);

        return {
            layout,
            root: layout.getSpineByID('root')!,
            settings: layout.getSpineByID('settings')!,
        };
    }

    afterEach(() => {
        layouts.splice(0).forEach((layout) => layout.destroyed || layout.destroy());
        cached.splice(0).forEach((alias) => Assets.cache.remove(alias));
        vi.restoreAllMocks();
    });

    it('nests a 4.2 export in a slot of a 4.3 one, each read and drawn by its own runtime', async () => {
        const errors = vi.spyOn(console, 'error');
        const { layout, root, settings } = await build();

        const renderer = new CanvasRenderer() as unknown as Started;
        renderer._addSystems(renderer.config.systems);
        renderer._addPipes(renderer.config.renderPipes, renderer.config.renderPipeAdaptors);

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

        const stage = new Container({ isRenderGroup: true });
        stage.addChild(layout as unknown as Container);
        [root, settings].forEach((spine) => engine.spine.update(spine, 0.1));
        renderer.renderGroup._updateRenderGroups(stage.renderGroup);

        // a Canvas renderer's spine pipe draws the skeleton alone; a WebGL one collects each slot
        // object as it reaches its slot, as here
        const { instructionSet } = stage.renderGroup as unknown as { instructionSet: never };
        settings.includeInBuild = true;
        settings.collectRenderables(instructionSet, renderer as never, null as never);
        settings.includeInBuild = false;

        const bone = root.skeleton.findBone('at_settings')!;
        const at = engine.spine.bonePose(bone);

        expect([runtimeOf(root), runtimeOf(settings)]).toEqual(['4.3', '4.2']);
        expect([root.renderPipeId, settings.renderPipeId]).toEqual(['spine-4.3', 'spine-4.2']);
        expect([drawnBy.get(root), drawnBy.get(settings)]).toEqual(['spine-4.3', 'spine-4.2']);
        expect(settings.parent).toBe(root);
        expect(settings.toGlobal(new Point(0, 0))).toMatchObject(
            root.toGlobal(new Point(at.worldX, at.worldY)),
        );
        expect(errors).not.toHaveBeenCalled();

        stage.removeChildren();
    });

    it('sets a text on a 4.2 slot as on a 4.3 one', async () => {
        Assets.cache.set('texts.json', {
            root: { title: { type: 'text', value: 'Hello', fontSize: 24 } },
            settings: { caption: { type: 'bitmapText', fontFamily, value: 'A A', fontSize: 1 } },
        });
        cached.push('texts.json');

        const { layout, root, settings } = await build();
        const texts = layout.getTextInstances();
        const holderOf = (spine: Pixi8Spine, slot: string) =>
            engine.spine.getSlotObject(spine, slot) as Container;
        const within = (node: Container, holder: Container) => {
            for (let at: Container | null = node; at; at = at.parent)
                if (at === holder) return true;
            return false;
        };

        expect(texts.get('title')).toMatchObject({ text: 'Hello' });
        expect(texts.get('caption')).toMatchObject({ text: 'A A' });
        expect(texts.get('caption')!.constructor.name).toBe('BitmapText');
        expect(within(texts.get('title') as Container, holderOf(root, 'text_title'))).toBe(true);
        expect(within(texts.get('caption') as Container, holderOf(settings, 'text_caption'))).toBe(
            true,
        );
    });

    it('hit-tests a 4.2 button under a static stage, and plays its animation on a press', async () => {
        const { layout, root, settings } = await build();
        const stage = new Container({ isRenderGroup: true, eventMode: 'static' });
        stage.addChild(layout as unknown as Container);
        [root, settings].forEach((spine) => engine.spine.update(spine, 0));
        updateRenderGroupTransforms(stage.renderGroup, true);

        const boundary = new EventBoundary(stage);
        const hit = (spine: Pixi8Spine) => {
            const { x, y } = spine.toGlobal(new Point(0, 0));
            return boundary.hitTest(x, y);
        };
        const button = hit(settings);

        expect(button === engine.spine.getSlotObject(settings, 'button_settings')).toBe(true);
        expect(hit(root) === engine.spine.getSlotObject(root, 'button_ok')).toBe(true);
        expect(boundary.hitTest(-1000, -1000)).toBeNull();

        button!.emit('pointerdown', {} as never);

        expect(settings.state.tracks.map((track) => track?.animation?.name)).toContain(
            'event_settings_down/button-down',
        );

        stage.removeChildren();
    });

    it('clones a 4.2 spine with its runtime, and destroys every spine with the layout', async () => {
        const { layout, root, settings } = await build();
        const clone = layout.cloneSpine(settings, 'settings_2');
        const all = [root, settings, clone];

        expect(runtimeOf(clone)).toBe('4.2');
        expect(clone.renderPipeId).toBe('spine-4.2');
        expect(engine.spine.runtimeOf(clone)?.minor).toBe('4.2');

        layout.destroy();

        expect(all.map((spine) => spine.destroyed)).toEqual([true, true, true]);
        expect(layout.getSpines().size).toBe(0);
    });

    it('builds from a manifest, each skeleton in the asset cache read by its own runtime', async () => {
        const errors = vi.spyOn(console, 'error');
        const { root, settings } = folder();
        cached.push(...cache('root', root), ...cache('settings', settings));

        const layout = new SpineLayout({ engine });
        layouts.push(layout);
        await layout.loadInstancesFromManifest(manifestOf(cached));

        const spines = layout.getSpines();

        expect([...spines.keys()]).toEqual(['root', 'settings']);
        expect([...spines.values()].map(runtimeOf)).toEqual(['4.3', '4.2']);
        expect(spines.get('settings')!.parent === spines.get('root')).toBe(true);
        expect(errors).not.toHaveBeenCalled();
    });

    it('builds from a manifest with 4.2 loaded lazily, once the cache names it', async () => {
        const load = vi.fn(() => import('spine-pixi-v8-42'));
        const lazy = createPixi8Engine({ runtimes: [{ minor: '4.2', load }] });
        const { root, settings } = folder();
        cached.push(...cache('root', root), ...cache('settings', settings));

        const layout = new SpineLayout({ engine: lazy });
        layouts.push(layout);
        await layout.loadInstancesFromManifest(manifestOf(cached));

        expect(load).toHaveBeenCalledTimes(1);
        expect([...layout.getSpines().values()].map(runtimeOf)).toEqual(['4.3', '4.2']);
    });

    it('reads a skeleton from the asset cache by the runtime the pin names, saying what it does not read', () => {
        const warn = vi.fn();
        const pinned = createPixi8Engine({
            runtimes: [esotericRuntime(SP42)],
            pin: { '4.2': '4.3' },
            warn,
        });
        const settings = spineExport('settingsButton-4.2');
        settings.skeleton.ik = [
            { name: 'aim', bones: ['settingsButton'], target: 'settingsButton' },
        ];
        cached.push(...cache('settings', settings));

        const data = pinned.spine.readSkeletonFromAssets('settings.json', 'settings.atlas');

        expect(data).toBeInstanceOf(SP43.SkeletonData);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(
                /^settings\.json: Spine 4\.2\.43 cross-read by the 4\.3 runtime.*: its top-level ik constraints are not read; it may throw$/,
            ),
        );
    });

    it('names what is missing when the asset cache holds no such skeleton', () => {
        expect(() => engine.spine.readSkeletonFromAssets('nothing.json')).toThrow(
            'No skeleton loaded as "nothing.json"',
        );
    });
});
