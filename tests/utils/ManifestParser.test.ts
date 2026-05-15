import { describe, expect, it } from 'vitest';
import type { AssetsManifest } from 'pixi.js';
import { ManifestParser } from '../../src/utils/ManifestParser';

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
            manifest(
                bundle([
                    { alias: ['assets/hero.atlas'] },
                    { alias: ['assets/hero.skel'] },
                ]),
            ),
        );

        expect(result).toEqual([]);
    });

    it('skips atlases that lack both skel and json', () => {
        const result = ManifestParser.getSpineAssets(
            manifest(
                bundle([
                    { alias: ['assets/hero.atlas'] },
                    { alias: ['assets/hero.png'] },
                ]),
            ),
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
