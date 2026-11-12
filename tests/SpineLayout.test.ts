import { afterEach, describe, expect, it, vi } from 'vitest';
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import { Assets, Container, Ticker, type AssetsManifest } from 'pixi.js';
import { MixedSpineVersionsError, pixi8Engine, SpineLayout, sounds } from '../src/index';
import { createPixi8Engine } from '../src/pixi8';
import { esotericRuntime } from '../src/runtimes';

/**
 * What Spine exports for a skeleton that attaches no image: bones, slots and animations, no
 * `skins` key at all, and — since there is nothing to pack — no atlas and no page beside it.
 */
const bonesOnly = {
    skeleton: { hash: 'aaaa', spine: '4.3.23' },
    bones: [{ name: 'root' }, { name: 'spine_bg', parent: 'root', y: -10 }],
    slots: [{ name: 'spine_bg', bone: 'spine_bg' }],
    animations: { init: { bones: { spine_bg: { translate: [{}] } } } },
};

const manifest = (aliases: string[]): AssetsManifest =>
    ({
        bundles: [{ name: 'default', assets: aliases.map((alias) => ({ alias: [alias] })) }],
    }) as unknown as AssetsManifest;

describe('SpineLayout — options', () => {
    it("keeps the caller's options object, so debug writes back to it and controllers read it live", () => {
        const options: { debug?: boolean; skipAttachingSpinesPatterns?: string[] } = {};
        const layout = new SpineLayout(options);

        layout.debug = true;
        expect(options.debug).toBe(true);
        layout.debug = false;

        options.skipAttachingSpinesPatterns = ['bg'];
        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: bonesOnly, atlasText: '', textures: {} },
            {
                name: 'bg',
                skeleton: { ...bonesOnly, bones: [{ name: 'root' }], slots: [] },
                atlasText: '',
                textures: {},
            },
        ]);

        expect(layout.spines.get('bg')?.parent).toBeFalsy();
    });
});

describe('SpineLayout — a skeleton with no atlas', () => {
    afterEach(() => vi.restoreAllMocks());

    it('loads from raw data with no atlas text and no textures', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: bonesOnly, atlasText: '', textures: {} },
        ]);

        expect([...layout.spines.keys()]).toEqual(['root']);
        expect(layout.spines.get('root')!.skeleton.findBone('spine_bg')).toBeTruthy();
        expect(errors).not.toHaveBeenCalled();
    });

    it('loads from a manifest entry that names only the skeleton', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

        Assets.cache.set('spine/root.json', bonesOnly);

        const layout = new SpineLayout();

        layout.createInstancesFromManifest(
            manifest(['spine/hero.atlas', 'spine/root.json']),
            'spine',
        );

        expect([...layout.spines.keys()]).toEqual(['root']);
        expect(errors).not.toHaveBeenCalled();

        Assets.cache.remove('spine/root.json');
    });
});

/**
 * A skeleton of nothing but bones and slots — what a spine whose job is to place other spines
 * exports. Every slot hangs from a bone of the same name, as the Spine editor writes it.
 */
const skeleton = (slots: string[] = []) => ({
    skeleton: { hash: `hash-${slots.join('-')}`, spine: '4.3.23' },
    bones: [{ name: 'root' }, ...slots.map((name) => ({ name, parent: 'root' }))],
    slots: slots.map((name) => ({ name, bone: name })),
    animations: {},
});

const instance = (name: string, slots: string[] = []) => ({
    name,
    skeleton: skeleton(slots),
    atlasText: '',
    textures: {},
});

describe('SpineLayout — building the scene from its root', () => {
    afterEach(() => vi.restoreAllMocks());

    it('builds the root, then whatever the tree beneath it embeds', () => {
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('root', ['spine_bg']),
            instance('bg', ['spine_logo']),
            instance('logo'),
        ]);

        expect([...layout.spines.keys()]).toEqual(['root', 'bg', 'logo']);
    });

    it('leaves a skeleton nothing embeds unbuilt', () => {
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('root', ['spine_bg']),
            instance('bg'),
            instance('popup', ['spine_okButton']),
            instance('okButton'),
        ]);

        expect([...layout.spines.keys()]).toEqual(['root', 'bg']);
    });

    it('builds a pool from the template the counted pointers name', () => {
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('root', ['spine_reel_1', 'spine_reel_2']),
            instance('reel', ['spine_symbol0', 'spine_symbol1']),
            instance('symbol'),
        ]);

        // the `reel` and `symbol` templates are consumed by their instances
        expect([...layout.spines.keys()]).toEqual([
            'root',
            'reel_1',
            'reel_2',
            'symbol1',
            'symbol2',
            'symbol3',
            'symbol4',
        ]);
    });

    it('labels every instance with its id, a multiplied one with its own', () => {
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('root', ['spine_reel_1', 'spine_reel_2']),
            instance('reel'),
        ]);

        expect(
            [...layout.spines].map(([id, spine]) => [id, spine.label, layout.spine.idOf(spine)]),
        ).toEqual([
            ['root', 'root', 'root'],
            ['reel_1', 'reel_1', 'reel_1'],
            ['reel_2', 'reel_2', 'reel_2'],
        ]);
    });

    it('keeps a numbered pointer that names a real export as that export, not a copy of the base', () => {
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('root', ['spine_bg']),
            instance('bg', ['spine_hero_1', 'spine_hero_2']),
            instance('hero'),
            instance('hero_2', ['hero2Only']),
        ]);

        // `hero` is consumed by the one instance `spine_hero_1` asks for; `hero_2` is untouched
        expect([...layout.spines.keys()]).toEqual(['root', 'bg', 'hero_2', 'hero_1']);

        const hero2 = layout.spines.get('hero_2')!;

        expect(hero2.skeleton.findSlot('hero2Only')).toBeTruthy();
        expect(layout.spines.get('hero_1')!.skeleton.findSlot('hero2Only')).toBeFalsy();
        expect(hero2.parent).toBe(layout.spines.get('bg'));
    });

    it('holds the root, and only the root, in the layout container', () => {
        const layout = new SpineLayout({ skipAttachingSpinesPatterns: ['loose'] });

        layout.createInstancesFromDataArray([
            instance('root', ['spine_bg', 'spine_loose']),
            instance('bg'),
            instance('loose'),
        ]);

        expect(layout.children).toEqual([layout.spines.get('root')]);
        // built, since the root points at it, but placed by the game rather than by its slot
        expect(layout.spines.get('loose')!.parent).toBe(null);
    });

    it('starts from the spine the options name instead of `root`', () => {
        const layout = new SpineLayout({ root: 'main' });

        layout.createInstancesFromDataArray([
            instance('main', ['spine_bg']),
            instance('bg'),
            instance('root'),
        ]);

        expect([...layout.spines.keys()]).toEqual(['main', 'bg']);
        expect(layout.children).toEqual([layout.spines.get('main')]);
    });

    it('warns and builds every skeleton when there is no root to start from', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('menu', ['spine_button']),
            instance('button'),
        ]);

        expect([...layout.spines.keys()]).toEqual(['menu', 'button']);
        expect(layout.children).toEqual([layout.spines.get('menu')]);
        expect(warn.mock.calls[0][0]).toContain('No root spine "root"');
    });
});

describe('SpineLayout.createInstance — building what the tree does not reach', () => {
    afterEach(() => vi.restoreAllMocks());

    const withPopup = () => {
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('root', ['spine_bg']),
            instance('bg'),
            instance('popup', ['spine_okButton']),
            instance('okButton'),
        ]);

        return layout;
    };

    it('builds the spine and everything it embeds in turn', () => {
        const layout = withPopup();

        const popup = layout.createInstance('popup');

        expect(popup).toBe(layout.spines.get('popup'));
        expect([...layout.spines.keys()]).toEqual(['root', 'bg', 'popup', 'okButton']);
        expect(popup!.getSlotObject('spine_okButton')).toBe(layout.spines.get('okButton'));
    });

    it('gives it no place on screen — nothing embedded it', () => {
        const layout = withPopup();

        layout.createInstance('popup');

        expect(layout.children).toEqual([layout.spines.get('root')]);
        expect(layout.spines.get('popup')!.parent).toBe(null);
    });

    it('returns the instance already built, without building a second one', () => {
        const layout = withPopup();

        expect(layout.createInstance('bg')).toBe(layout.spines.get('bg'));
        expect([...layout.spines.keys()]).toEqual(['root', 'bg']);
    });

    it('leaves a spine that is already standing where it is, and copies it for the newcomer', () => {
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            instance('root', ['spine_bg']),
            instance('bg'),
            instance('popup', ['spine_bg']),
        ]);

        const bg = layout.spines.get('bg')!;

        layout.createInstance('popup');

        expect(layout.spines.get('bg')).toBe(bg);
        expect(bg.parent).toBe(layout.spines.get('root'));
        expect(layout.spines.get('popup')!.getSlotObject('spine_bg')).toBe(
            layout.spines.get('bg_popup'),
        );
        // its texts are configured per instance, as any shared child's are
        expect(layout.multipleInstanceIds).toContain('bg_popup');
    });

    it('errors on a name no loaded skeleton carries', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const layout = withPopup();

        expect(layout.createInstance('nothing')).toBeUndefined();
        expect(errors.mock.calls[0][0]).toContain('Cannot create "nothing"');
    });
});

describe('SpineLayout.addInstancesFromDataArray — skeletons that arrive after the scene', () => {
    afterEach(() => vi.restoreAllMocks());

    /** A scene whose `bg` names a `popup` that has not been loaded yet. */
    const waitingForPopup = (options?: ConstructorParameters<typeof SpineLayout>[0]) => {
        const layout = new SpineLayout(options);

        layout.createInstancesFromDataArray([
            instance('root', ['spine_bg']),
            instance('bg', ['spine_popup']),
        ]);

        return layout;
    };

    it('builds nothing into a slot whose skeleton has not arrived', () => {
        const layout = waitingForPopup();

        expect([...layout.spines.keys()]).toEqual(['root', 'bg']);
        expect(layout.spines.get('bg')!.getSlotObject('spine_popup')).toBeFalsy();
    });

    it('puts the late skeleton, and what it embeds, into the slot waiting for it', () => {
        const layout = waitingForPopup();

        layout.addInstancesFromDataArray([
            instance('popup', ['spine_okButton']),
            instance('okButton'),
        ]);

        const popup = layout.spines.get('popup')!;

        expect([...layout.spines.keys()]).toEqual(['root', 'bg', 'popup', 'okButton']);
        expect(layout.spines.get('bg')!.getSlotObject('spine_popup')).toBe(popup);
        expect(popup.getSlotObject('spine_okButton')).toBe(layout.spines.get('okButton'));
    });

    it('leaves what the layout already holds as it is', () => {
        const layout = waitingForPopup();
        const bg = layout.spines.get('bg');

        layout.addInstancesFromDataArray([instance('bg', ['spine_popup']), instance('popup')]);

        expect(layout.spines.get('bg')).toBe(bg);
        expect([...layout.spines.keys()]).toEqual(['root', 'bg', 'popup']);
    });

    it('builds a slot the options skip, and leaves its placing to the game', () => {
        const layout = waitingForPopup({ skipAttachingSpinesPatterns: ['popup'] });

        layout.addInstancesFromDataArray([instance('popup')]);

        expect(layout.spines.get('popup')!.parent).toBe(null);
    });

    it('poses the newcomer in its `init`', () => {
        const layout = waitingForPopup();
        const popup = instance('popup');

        popup.skeleton.animations = { init: { bones: { root: { translate: [{}] } } } };
        layout.addInstancesFromDataArray([popup]);

        expect(playing(layout, 'popup')).toEqual(['init']);
    });

    it('builds nothing for a skeleton no slot names', () => {
        const layout = waitingForPopup();

        layout.addInstancesFromDataArray([instance('stray')]);

        expect([...layout.spines.keys()]).toEqual(['root', 'bg']);
    });
});

/** A skeleton posed differently for each shape of screen, plus the `init` every scene has. */
const oriented = {
    skeleton: { hash: 'oriented', spine: '4.3.23' },
    bones: [{ name: 'root' }, { name: 'logo', parent: 'root' }],
    slots: [{ name: 'logo', bone: 'logo' }],
    animations: {
        init: { bones: { root: { translate: [{}] } } },
        'state_landscape/wide': { bones: { logo: { translate: [{ x: 100 }] } } },
        'state_portrait/tall': { bones: { logo: { translate: [{ y: 100 }] } } },
    },
};

/** A window of the given size, whose resize the test fires. */
function stubWindow(width: number, height: number) {
    const listeners = new Set<() => void>();
    const win = {
        innerWidth: width,
        innerHeight: height,
        addEventListener: (type: string, fn: () => void) => {
            if (type === 'resize') listeners.add(fn);
        },
        removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
        resizeTo(nextWidth: number, nextHeight: number) {
            win.innerWidth = nextWidth;
            win.innerHeight = nextHeight;
            listeners.forEach((fn) => fn());
        },
    };

    vi.stubGlobal('window', win);

    return win;
}

const playing = (layout: SpineLayout, spineID: string) =>
    layout.spines
        .get(spineID)!
        .state.tracks.map((entry) => entry?.animation?.name)
        .filter(Boolean);

describe('SpineLayout — posing the scene for the screen', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('plays the state for the shape of the screen once the scene is built', () => {
        stubWindow(1280, 720);
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: oriented, atlasText: '', textures: {} },
        ]);

        expect(layout.orientation.current).toBe('landscape');
        expect(playing(layout, 'root')).toContain('state_landscape/wide');
    });

    it('plays the other one when the screen turns', () => {
        const win = stubWindow(1280, 720);
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: oriented, atlasText: '', textures: {} },
        ]);

        win.resizeTo(720, 1280);

        expect(layout.orientation.current).toBe('portrait');
        // the pair pose the same bone, so the turn takes the track over rather than stacking
        expect(playing(layout, 'root')).toContain('state_portrait/tall');
        expect(playing(layout, 'root')).not.toContain('state_landscape/wide');
    });

    it('leaves a scene that authors neither state unposed', () => {
        stubWindow(1280, 720);
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([instance('root')]);

        expect(layout.orientation.current).toBeUndefined();
    });
});

describe('SpineLayout — an engine that loads its runtimes lazily', () => {
    afterEach(() => vi.restoreAllMocks());

    const lazyEngine = () => {
        const loaded: (() => void)[] = [];
        const prepare = vi.fn(() => new Promise<void>((resolve) => loaded.push(resolve)));
        const engine = { ...pixi8Engine, spine: { ...pixi8Engine.spine, prepare } };

        return { engine, prepare, load: () => loaded.splice(0).forEach((resolve) => resolve()) };
    };
    const downgraded = { ...bonesOnly, skeleton: { hash: 'old', spine: '4.1-from-4.2.43' } };

    it('builds at once, and returns nothing, when the engine needs no preparing', () => {
        const layout = new SpineLayout();

        expect(layout.createInstancesFromDataArray([instance('root')])).toBeUndefined();
        expect([...layout.spines.keys()]).toEqual(['root']);
    });

    it('prepares the one export minor of its skeletons before it reads any', async () => {
        const { engine, prepare, load } = lazyEngine();
        const layout = new SpineLayout({ engine });
        const patched = { ...bonesOnly, skeleton: { hash: 'patched', spine: '4.3.08' } };

        const building = layout.createInstancesFromDataArray([
            { name: 'root', skeleton: bonesOnly, atlasText: '', textures: {} },
            { name: 'popup', skeleton: patched, atlasText: '', textures: {} },
            { name: 'again', skeleton: bonesOnly, atlasText: '', textures: {} },
        ]);

        expect(building).toBeInstanceOf(Promise);
        expect(prepare).toHaveBeenCalledWith(['4.3']);
        expect(layout.spines.size).toBe(0);

        load();
        await building;

        expect([...layout.spines.keys()]).toEqual(['root']);
    });

    it('refuses skeletons of two export minors, naming each file, and prepares and builds nothing', () => {
        const { engine, prepare } = lazyEngine();
        const layout = new SpineLayout({ engine });

        const building = () =>
            layout.createInstancesFromDataArray([
                { name: 'root', skeleton: bonesOnly, atlasText: '', textures: {} },
                { name: 'popup', skeleton: downgraded, atlasText: '', textures: {} },
                { name: 'again', skeleton: bonesOnly, atlasText: '', textures: {} },
            ]);

        expect(building).toThrow(MixedSpineVersionsError);
        expect(building).toThrow(
            expect.objectContaining({
                filesByMinor: { '4.3': ['root', 'again'], '4.1': ['popup'] },
            }),
        );
        expect(prepare).not.toHaveBeenCalled();
        expect(layout.spines.size).toBe(0);
    });

    it('refuses a manifest whose cached skeletons are of two export minors', () => {
        const { engine, prepare } = lazyEngine();
        Assets.cache.set('spine/root.json', bonesOnly);
        Assets.cache.set('spine/popup.json', downgraded);
        const layout = new SpineLayout({ engine });

        const building = () =>
            layout.createInstancesFromManifest(
                manifest(['spine/hero.atlas', 'spine/root.json', 'spine/popup.json']),
                'spine',
            );

        expect(building).toThrow(MixedSpineVersionsError);
        expect(building).toThrow(
            expect.objectContaining({
                filesByMinor: { '4.3': ['root.json'], '4.1': ['popup.json'] },
            }),
        );
        expect(prepare).not.toHaveBeenCalled();
        expect(layout.spines.size).toBe(0);
        Assets.cache.remove('spine/root.json');
        Assets.cache.remove('spine/popup.json');
    });

    it('builds skeletons of two patches of one minor beside one that names no version', () => {
        const root = instance('root', ['spine_patched', 'spine_odd']);
        const patched = instance('patched');
        patched.skeleton.skeleton.spine = '4.3.08';
        const odd = { ...instance('odd'), skeleton: { ...skeleton(), skeleton: { hash: 'odd' } } };
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([root, patched, odd]);

        expect([...layout.spines.keys()].sort()).toEqual(['odd', 'patched', 'root']);
    });

    it('prepares the runtime pinned under "*" for a skeleton that names no version', async () => {
        const { engine, prepare, load } = lazyEngine();
        const root = { ...bonesOnly, skins: [] };
        const unversioned = { ...root, skeleton: { hash: 'odd' } };
        const layout = new SpineLayout({ engine });

        const building = layout.createInstancesFromDataArray([
            { name: 'root', skeleton: root, atlasText: '', textures: {} },
            { name: 'odd', skeleton: unversioned, atlasText: '', textures: {} },
        ]);

        expect(prepare).toHaveBeenCalledWith(['4.3', '*']);
        load();
        await building;
    });

    it('prepares what a manifest put in the asset cache', async () => {
        const { engine, prepare, load } = lazyEngine();
        Assets.cache.set('spine/root.json', bonesOnly);

        const layout = new SpineLayout({ engine });
        const loading = layout.loadInstancesFromManifest(
            manifest(['spine/hero.atlas', 'spine/root.json']),
            'spine',
        );

        expect(prepare).toHaveBeenCalledWith(['4.3']);
        expect(layout.spines.size).toBe(0);

        load();
        await loading;

        expect([...layout.spines.keys()]).toEqual(['root']);
        Assets.cache.remove('spine/root.json');
    });

    it('prepares a manifest handed to the constructor, then builds it', async () => {
        const { engine, prepare, load } = lazyEngine();
        Assets.cache.set('root.json', bonesOnly);

        const layout = new SpineLayout({ engine, manifest: manifest(['hero.atlas', 'root.json']) });

        expect(prepare).toHaveBeenCalledWith(['4.3']);
        expect(layout.spines.size).toBe(0);

        load();
        await vi.waitFor(() => expect([...layout.spines.keys()]).toEqual(['root']));
        Assets.cache.remove('root.json');
    });

    it('always returns a promise from the load variants', async () => {
        const layout = new SpineLayout();
        const loading = layout.loadInstancesFromDataArray([instance('root')]);

        expect(loading).toBeInstanceOf(Promise);
        await loading;
        expect([...layout.spines.keys()]).toEqual(['root']);
    });
});

describe('SpineLayout — a skeleton it cannot build', () => {
    afterEach(() => vi.restoreAllMocks());

    it('skips a skeleton no runtime of the engine reads with a single warning line', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const engine = createPixi8Engine({ runtimes: [esotericRuntime(SP43)] });
        const old = instance('root');
        old.skeleton.skeleton.spine = '3.8.99';
        const layout = new SpineLayout({ engine });

        layout.createInstancesFromDataArray([old]);

        expect(layout.spines.size).toBe(0);
        expect(warn.mock.calls).toEqual([
            [
                '[SpineLayout] Skipped spine "root": root: Spine 3.8.99 — registered runtimes: 4.3; ' +
                    'Pixi 4, 5, 6, 7 can render it',
            ],
        ]);
        expect(error).not.toHaveBeenCalled();
    });

    it('logs any other error with the error itself', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const broken = new Error('no page named hero.png');
        const readSkeleton = () => {
            throw broken;
        };
        const layout = new SpineLayout({
            engine: { ...pixi8Engine, spine: { ...pixi8Engine.spine, readSkeleton } },
        });

        layout.createInstancesFromDataArray([instance('root')]);

        expect(layout.spines.size).toBe(0);
        expect(error.mock.calls).toEqual([['[SpineLayout] Error loading spine "root":', broken]]);
    });
});

/** A window that counts what is listening to it, whatever the event. */
function listeningWindow(width = 1280, height = 720) {
    const live = new Set<unknown>();
    const win = {
        innerWidth: width,
        innerHeight: height,
        addEventListener: (_type: string, fn: unknown) => live.add(fn),
        removeEventListener: (_type: string, fn: unknown) => live.delete(fn),
        live,
    };

    vi.stubGlobal('window', win);

    return win;
}

/** The oriented root, plus a label the layout builds a text node for and a hook for the game's own object. */
const furnished = {
    ...oriented,
    bones: [
        ...oriented.bones,
        { name: 'text_label', parent: 'root' },
        { name: 'hook', parent: 'root' },
    ],
    slots: [
        ...oriented.slots,
        { name: 'text_label', bone: 'text_label' },
        { name: 'hook', bone: 'hook' },
    ],
};

describe('SpineLayout — destroy', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('takes the window listeners and ticker subscriptions down with it', () => {
        const win = listeningWindow();
        const ticking = Ticker.shared.count;
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: furnished, atlasText: '', textures: {} },
        ]);
        void layout.animations.playState('landscape');

        expect(win.live.size).toBeGreaterThan(0);
        expect(Ticker.shared.count).toBeGreaterThan(ticking);

        layout.destroy();

        expect(win.live.size).toBe(0);
        expect(Ticker.shared.count).toBe(ticking);
        expect(layout.spines.size).toBe(0);
        expect(layout.destroyed).toBe(true);
    });

    it('destroys the text nodes it built, and hands back what the game hung on a slot', () => {
        listeningWindow();
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: furnished, atlasText: '', textures: {} },
        ]);

        const label = layout.texts.getInstances().get('label')!;
        const own = new Container();
        layout.scene.addSlotChild('root', 'hook', own);
        expect(own.parent).toBe(layout.spines.get('root'));

        layout.destroy();

        expect(label.destroyed).toBe(true);
        expect(own.destroyed).toBe(false);
        expect(own.parent).toBeNull();
    });

    it('forgets what the game took back off a slot, by object or by slot name', () => {
        listeningWindow();
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: furnished, atlasText: '', textures: {} },
        ]);

        const byObject = new Container();
        layout.scene.addSlotChild('root', 'hook', byObject);
        layout.removeSlotAttachments('root', byObject);

        const bySlot = new Container();
        layout.scene.addSlotChild('root', 'hook', bySlot);
        layout.removeSlotAttachments('root', 'hook');

        expect(byObject.parent).toBeNull();
        expect(bySlot.parent).toBeNull();
        expect(layout.scene.releaseSlotChildren()).toEqual([]);
    });

    it('forgets a slot child another one replaced', () => {
        listeningWindow();
        const layout = new SpineLayout();

        layout.createInstancesFromDataArray([
            { name: 'root', skeleton: furnished, atlasText: '', textures: {} },
        ]);

        const first = new Container();
        const second = new Container();
        layout.scene.addSlotChild('root', 'hook', first);
        layout.scene.addSlotChild('root', 'hook', second);

        expect(layout.scene.releaseSlotChildren()).toEqual([
            { spineID: 'root', slotName: 'hook', child: second },
        ]);
    });

    it('reset keeps the game listeners across a rebuild only when told to', () => {
        listeningWindow();
        const layout = new SpineLayout();
        const build = () =>
            layout.createInstancesFromDataArray([
                { name: 'root', skeleton: furnished, atlasText: '', textures: {} },
            ]);
        const heard: string[] = [];

        build();
        layout.animations.addEventListener('hook_click', () => heard.push('click'));

        layout.reset({ keepListeners: true });
        build();
        void layout.animations.playEvent('hook_click', 'root');
        expect(heard).toEqual(['click']);

        layout.reset();
        build();
        void layout.animations.playEvent('hook_click', 'root');
        expect(heard).toEqual(['click']);

        layout.destroy();
    });

    it('leaves listener, ticker and text counts flat over twenty mount → play → destroy cycles', () => {
        const win = listeningWindow();
        const ticking = Ticker.shared.count;
        const labels: Container[] = [];

        for (let cycle = 0; cycle < 20; cycle++) {
            const layout = new SpineLayout();

            layout.createInstancesFromDataArray([
                { name: 'root', skeleton: furnished, atlasText: '', textures: {} },
            ]);
            void layout.animations.playState('landscape');
            labels.push(layout.texts.getInstances().get('label')!);

            layout.destroy();

            expect(win.live.size).toBe(0);
            expect(Ticker.shared.count).toBe(ticking);
        }

        expect(labels.every((label) => label.destroyed)).toBe(true);
    });

    it('disposes the sounds singleton only when it was the layout that initialized it', () => {
        listeningWindow();
        const init = vi.spyOn(sounds, 'init').mockImplementation(() => {});
        const dispose = vi.spyOn(sounds, 'dispose').mockImplementation(() => {});

        const fromData = new SpineLayout();
        fromData.createInstancesFromDataArray([instance('root')]);
        fromData.destroy();

        expect(init).not.toHaveBeenCalled();
        expect(dispose).not.toHaveBeenCalled();

        Assets.cache.set('spine/root.json', bonesOnly);
        const fromManifest = new SpineLayout();
        fromManifest.createInstancesFromManifest(manifest(['spine/root.json']), 'spine');
        fromManifest.destroy();
        Assets.cache.remove('spine/root.json');

        expect(init).toHaveBeenCalledTimes(1);
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('leaves the sounds singleton alone with sounds: false', () => {
        listeningWindow();
        const init = vi.spyOn(sounds, 'init').mockImplementation(() => {});
        const dispose = vi.spyOn(sounds, 'dispose').mockImplementation(() => {});

        Assets.cache.set('spine/root.json', bonesOnly);
        const layout = new SpineLayout({ sounds: false });
        layout.createInstancesFromManifest(manifest(['spine/root.json']), 'spine');
        layout.destroy();
        Assets.cache.remove('spine/root.json');

        expect(init).not.toHaveBeenCalled();
        expect(dispose).not.toHaveBeenCalled();
    });

    it('still reads the deprecated builtInSounds: false as sounds: false', () => {
        listeningWindow();
        const init = vi.spyOn(sounds, 'init').mockImplementation(() => {});

        Assets.cache.set('spine/root.json', bonesOnly);
        const layout = new SpineLayout({ builtInSounds: false });
        layout.createInstancesFromManifest(manifest(['spine/root.json']), 'spine');
        layout.destroy();
        Assets.cache.remove('spine/root.json');

        expect(init).not.toHaveBeenCalled();
    });

    it('inits and disposes the adapter it is given instead of the singleton', () => {
        listeningWindow();
        const init = vi.spyOn(sounds, 'init').mockImplementation(() => {});
        const adapter = {
            init: vi.fn(),
            dispose: vi.fn(),
            playMusic: vi.fn(),
            playFX: vi.fn(),
            stopFX: vi.fn(),
        };

        Assets.cache.set('spine/root.json', bonesOnly);
        const layout = new SpineLayout({ sounds: adapter });
        const assets = manifest(['spine/root.json']);
        layout.createInstancesFromManifest(assets, 'spine');
        layout.destroy();
        Assets.cache.remove('spine/root.json');

        expect(init).not.toHaveBeenCalled();
        expect(adapter.init).toHaveBeenCalledWith(assets);
        expect(adapter.dispose).toHaveBeenCalledTimes(1);
    });
});
