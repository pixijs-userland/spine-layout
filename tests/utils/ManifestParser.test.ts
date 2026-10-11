import { describe, expect, it } from 'vitest';
import type { AssetsManifest } from 'pixi.js';
import { ManifestParser } from '../../src/core/utils/ManifestParser';

const bundle = (assets: Array<{ alias: string[] }>) => ({ name: 'b', assets });

const manifest = (...bundles: Array<{ name: string; assets: Array<{ alias: string[] }> }>) =>
    ({ bundles }) as unknown as AssetsManifest;

describe('ManifestParser.getAssetByType', () => {
    it('returns only filenames whose alias ends with the given type', () => {
        const b = bundle([
            { alias: ['assets/foo.png'] },
            { alias: ['assets/bar.atlas'] },
            { alias: ['assets/foo.skel'] },
            { alias: ['assets/baz.json'] },
        ]);

        expect(ManifestParser.getAssetByType(b, 'png')).toEqual(['foo.png']);
        expect(ManifestParser.getAssetByType(b, 'atlas')).toEqual(['bar.atlas']);
        expect(ManifestParser.getAssetByType(b, 'skel')).toEqual(['foo.skel']);
        expect(ManifestParser.getAssetByType(b, 'json')).toEqual(['baz.json']);
    });

    it('returns undefined when the bundle has no assets array', () => {
        expect(ManifestParser.getAssetByType({ name: 'b' } as never, 'png')).toBeUndefined();
    });
});

describe('ManifestParser.getSpineAssets', () => {
    it('pairs an atlas with the matching skel + png', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(
                bundle([
                    { alias: ['assets/hero.atlas'] },
                    { alias: ['assets/hero.skel'] },
                    { alias: ['assets/hero.png'] },
                ]),
            ),
        );

        expect(result).toEqual([{ atlas: 'hero.atlas', skel: 'hero.skel', texture: 'hero.png' }]);
    });

    it('prefers json over skel when both exist', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(
                bundle([
                    { alias: ['assets/hero.atlas'] },
                    { alias: ['assets/hero.skel'] },
                    { alias: ['assets/hero.json'] },
                    { alias: ['assets/hero.png'] },
                ]),
            ),
        );

        expect(result).toEqual([{ atlas: 'hero.atlas', skel: 'hero.json', texture: 'hero.png' }]);
    });

    it('skips atlases that lack a png', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(bundle([{ alias: ['assets/hero.atlas'] }, { alias: ['assets/hero.skel'] }])),
        );

        expect(result).toEqual([]);
    });

    it('skips atlases that lack both skel and json', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(bundle([{ alias: ['assets/hero.atlas'] }, { alias: ['assets/hero.png'] }])),
        );

        expect(result).toEqual([]);
    });

    it('collects spine assets across multiple bundles', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(
                bundle([
                    { alias: ['assets/a.atlas'] },
                    { alias: ['assets/a.skel'] },
                    { alias: ['assets/a.png'] },
                ]),
                bundle([
                    { alias: ['assets/b.atlas'] },
                    { alias: ['assets/b.json'] },
                    { alias: ['assets/b.png'] },
                ]),
            ),
        );

        expect(result).toEqual([
            { atlas: 'a.atlas', skel: 'a.skel', texture: 'a.png' },
            { atlas: 'b.atlas', skel: 'b.json', texture: 'b.png' },
        ]);
    });
});

describe('ManifestParser.getSpineAssets — skeletons with no atlas', () => {
    it('takes a lone skeleton sitting where the atlases are', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(
                bundle([
                    { alias: ['spine/hero.atlas'] },
                    { alias: ['spine/hero.json'] },
                    { alias: ['spine/hero.png'] },
                    { alias: ['spine/root.json'] },
                ]),
            ),
        );

        expect(result).toEqual([
            { atlas: 'hero.atlas', skel: 'hero.json', texture: 'hero.png' },
            { skel: 'root.json' },
        ]);
    });

    it('leaves json that is not in a spine folder alone', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(
                bundle([
                    { alias: ['spine/hero.atlas'] },
                    { alias: ['spine/hero.json'] },
                    { alias: ['spine/hero.png'] },
                    { alias: ['settings/texts.json'] },
                    { alias: ['sprites'] },
                ]),
            ),
        );

        expect(result).toEqual([{ atlas: 'hero.atlas', skel: 'hero.json', texture: 'hero.png' }]);
    });

    it('reads the spine folders from the whole manifest, not one bundle', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(
                bundle([
                    { alias: ['spine/hero.atlas'] },
                    { alias: ['spine/hero.json'] },
                    { alias: ['spine/hero.png'] },
                ]),
                bundle([{ alias: ['spine/root.json'] }]),
            ),
        );

        expect(result).toEqual([
            { atlas: 'hero.atlas', skel: 'hero.json', texture: 'hero.png' },
            { skel: 'root.json' },
        ]);
    });

    it('finds nothing at all when the manifest holds no atlas to locate the spines by', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(bundle([{ alias: ['spine/root.json'] }])),
        );

        expect(result).toEqual([]);
    });
});

describe('ManifestParser.fromLoaderResources', () => {
    it('lists a parsed skeleton with the atlas and page aliases the pairing looks for', () => {
        const manifest = ManifestParser.fromLoaderResources({
            'spines/root.json': { url: 'assets/spines/root.json', spineData: {} },
            'spines/root.json_atlas': { url: 'assets/spines/root.atlas' },
            'settings/texts.json': { url: 'assets/settings/texts.json' },
        });

        expect(ManifestParser.getSpineAssets(manifest)).toEqual([
            { atlas: 'root.atlas', skel: 'root.json', texture: 'root.png' },
        ]);
        expect(manifest.bundles[0].assets).toContainEqual({
            alias: ['settings/texts.json'],
            src: 'assets/settings/texts.json',
        });
    });

    it('names a skeleton added under a bare name by its data: JSON, or binary .skel', () => {
        const manifest = ManifestParser.fromLoaderResources({
            hero: { url: 'assets/hero.json', data: {}, spineData: {} },
            hero_atlas: { url: 'assets/hero.atlas' },
            'hero_atlas_page_hero.png': { url: 'assets/hero.png' },
            'spines/boss': { url: 'assets/boss.skel', data: new ArrayBuffer(4), spineData: {} },
        });

        expect(ManifestParser.getSpineAssets(manifest)).toEqual([
            { atlas: 'hero.atlas', skel: 'hero.json', texture: 'hero.png' },
            { atlas: 'boss.atlas', skel: 'boss.skel', texture: 'boss.png' },
        ]);
    });

    it('leaves a resource the loader holds under a real atlas alias alone', () => {
        const manifest = ManifestParser.fromLoaderResources({
            'spines/root.json': { spineData: {} },
            'spines/root.atlas': { url: 'x' },
        });
        const aliases = (manifest.bundles[0].assets as { alias: string[] }[]).map(
            (a) => a.alias[0],
        );

        expect(aliases.filter((alias) => alias === 'spines/root.atlas')).toHaveLength(1);
    });
});
