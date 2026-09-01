import { afterEach, describe, expect, it, vi } from 'vitest';
import { Assets, type AssetsManifest } from 'pixi.js';
import { SpineLayout } from '../src/SpineLayout';

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

        layout.createInstancesFromManifest(manifest(['spine/hero.atlas', 'spine/root.json']), 'spine');

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

        layout.createInstancesFromDataArray([instance('menu', ['spine_button']), instance('button')]);

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
