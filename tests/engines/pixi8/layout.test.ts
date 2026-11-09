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
import {
    createPixi8Engine,
    MixedSpineVersionsError,
    SpineLayout,
    type Pixi8Spine,
} from '../../../src/index';
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

/** okButton, 4.3, and settingsButton, 4.2, each the root of a layout of its own, a text on each. */
function scenes() {
    const root = spineExport('okButton-4.3');
    root.skeleton.bones.push({ name: 'at_title', parent: 'okButton', y: 200 });
    root.skeleton.slots.push({ name: 'text_title', bone: 'at_title' });

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
        const { root, settings } = scenes();
        const ok = new SpineLayout({ engine });
        const other = new SpineLayout({ engine, root: 'settings' });
        layouts.push(ok, other);

        await ok.loadInstancesFromDataArray([asData('root', root)]);
        await other.loadInstancesFromDataArray([asData('settings', settings)]);

        return {
            layouts: [ok, other],
            root: ok.getSpineByID('root')!,
            settings: other.getSpineByID('settings')!,
        };
    }

    afterEach(() => {
        layouts.splice(0).forEach((layout) => layout.destroyed || layout.destroy());
        cached.splice(0).forEach((alias) => Assets.cache.remove(alias));
        vi.restoreAllMocks();
    });

    it('draws a 4.3 layout and a 4.2 one on one stage, each read and drawn by its own runtime', async () => {
        const errors = vi.spyOn(console, 'error');
        const { layouts: built, root, settings } = await build();

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
        stage.addChild(...(built as unknown as Container[]));
        [root, settings].forEach((spine) => engine.spine.update(spine, 0.1));
        renderer.renderGroup._updateRenderGroups(stage.renderGroup);

        expect([runtimeOf(root), runtimeOf(settings)]).toEqual(['4.3', '4.2']);
        expect([root.renderPipeId, settings.renderPipeId]).toEqual(['spine-4.3', 'spine-4.2']);
        expect([drawnBy.get(root), drawnBy.get(settings)]).toEqual(['spine-4.3', 'spine-4.2']);
        expect(errors).not.toHaveBeenCalled();

        stage.removeChildren();
    });

    it('refuses to nest a 4.2 export in a slot of a 4.3 one, and builds neither', () => {
        const { root, settings } = scenes();
        root.skeleton.bones.push({ name: 'at_settings', parent: 'okButton', x: 400 });
        root.skeleton.slots.push({ name: 'spine_settings', bone: 'at_settings' });
        const layout = new SpineLayout({ engine });
        layouts.push(layout);

        expect(() =>
            layout.createInstancesFromDataArray([
                asData('root', root),
                asData('settings', settings),
            ]),
        ).toThrow(MixedSpineVersionsError);
        expect(layout.spines.size).toBe(0);
    });

    it('sets a text on a 4.2 slot as on a 4.3 one', async () => {
        Assets.cache.set('texts.json', {
            root: { title: { type: 'text', value: 'Hello', fontSize: 24 } },
            settings: { caption: { type: 'bitmapText', fontFamily, value: 'A A', fontSize: 1 } },
        });
        cached.push('texts.json');

        const { layouts: built, root, settings } = await build();
        const [title, caption] = built.map((layout) => layout.getTextInstances());
        const holderOf = (spine: Pixi8Spine, slot: string) =>
            engine.spine.getSlotObject(spine, slot) as Container;
        const within = (node: Container, holder: Container) => {
            for (let at: Container | null = node; at; at = at.parent)
                if (at === holder) return true;
            return false;
        };

        expect(title.get('title')).toMatchObject({ text: 'Hello' });
        expect(caption.get('caption')).toMatchObject({ text: 'A A' });
        expect(caption.get('caption')!.constructor.name).toBe('BitmapText');
        expect(within(title.get('title') as Container, holderOf(root, 'text_title'))).toBe(true);
        expect(
            within(caption.get('caption') as Container, holderOf(settings, 'text_caption')),
        ).toBe(true);
    });

    it('hit-tests a 4.2 button under a static stage, and plays its animation on a press', async () => {
        const { layouts: built, root, settings } = await build();
        const stage = new Container({ isRenderGroup: true, eventMode: 'static' });
        stage.addChild(...(built as unknown as Container[]));
        stage.children[1].x = 400;
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

    it('clones a 4.2 spine with its runtime, and destroys every spine with its layout', async () => {
        const { layouts: built, root, settings } = await build();
        const [ok, other] = built;
        const clone = other.cloneSpine(settings, 'settings_2');

        expect(runtimeOf(clone)).toBe('4.2');
        expect(clone.renderPipeId).toBe('spine-4.2');
        expect(engine.spine.runtimeOf(clone)?.minor).toBe('4.2');

        other.destroy();

        expect([settings, clone].map((spine) => spine.destroyed)).toEqual([true, true]);
        expect(other.getSpines().size).toBe(0);
        expect(root.destroyed).toBe(false);

        ok.destroy();

        expect(root.destroyed).toBe(true);
    });

    it('builds a layout from a manifest of each version, each skeleton read by its own runtime', async () => {
        const errors = vi.spyOn(console, 'error');
        const { root, settings } = scenes();
        const okAliases = cache('root', root);
        const settingsAliases = cache('settings', settings);
        cached.push(...okAliases, ...settingsAliases);

        const ok = new SpineLayout({ engine });
        const other = new SpineLayout({ engine, root: 'settings' });
        layouts.push(ok, other);
        await ok.loadInstancesFromManifest(manifestOf(okAliases));
        await other.loadInstancesFromManifest(manifestOf(settingsAliases));

        expect([...ok.getSpines().keys()]).toEqual(['root']);
        expect([...other.getSpines().keys()]).toEqual(['settings']);
        expect([...ok.getSpines().values(), ...other.getSpines().values()].map(runtimeOf)).toEqual([
            '4.3',
            '4.2',
        ]);
        expect(errors).not.toHaveBeenCalled();
    });

    it('builds from a manifest with 4.2 loaded lazily, once the cache names it', async () => {
        const load = vi.fn(() => import('spine-pixi-v8-42'));
        const lazy = createPixi8Engine({ runtimes: [{ minor: '4.2', load }] });
        const { root, settings } = scenes();
        const okAliases = cache('root', root);
        const settingsAliases = cache('settings', settings);
        cached.push(...okAliases, ...settingsAliases);

        const ok = new SpineLayout({ engine: lazy });
        layouts.push(ok);
        await ok.loadInstancesFromManifest(manifestOf(okAliases));

        expect(load).not.toHaveBeenCalled();

        const other = new SpineLayout({ engine: lazy, root: 'settings' });
        layouts.push(other);
        await other.loadInstancesFromManifest(manifestOf(settingsAliases));

        expect(load).toHaveBeenCalledTimes(1);
        expect([...ok.getSpines().values(), ...other.getSpines().values()].map(runtimeOf)).toEqual([
            '4.3',
            '4.2',
        ]);
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
