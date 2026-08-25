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
