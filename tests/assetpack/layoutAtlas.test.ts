import { describe, expect, it } from 'vitest';
import { atlasPageRoom, layoutAtlas, type AtlasRegionSize } from '../../src/assetpack/atlas.js';

const region = (name: string, width: number, height: number): AtlasRegionSize => ({
    name,
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    trimLeft: 0,
    trimTop: 0,
    trimmed: false,
});

const editorOptions = { maximumTextureSize: 2048, padding: 8 };
const pageNames = (pages: ReturnType<typeof layoutAtlas>) =>
    pages.map((page) => page.rects.map((rect) => rect.name));

describe('layoutAtlas', () => {
    it('gives a region within the page but not within its padding a page of its own', () => {
        const pages = layoutAtlas(
            [region('fg_reel', 2048, 2043), region('cog', 200, 200)],
            editorOptions,
        );

        expect(pageNames(pages)).toEqual([['cog'], ['fg_reel']]);
        expect(pages[1].rects[0]).toMatchObject({ x: 0, y: 0, rot: false });
    });

    it('gives a region larger than the page a page of its own', () => {
        const pages = layoutAtlas(
            [region('bg', 3000, 3000), region('cog', 200, 200)],
            editorOptions,
        );

        expect(pageNames(pages)).toEqual([['cog'], ['bg']]);
    });

    it('still packs the largest region that fits inside the padding', () => {
        const room = atlasPageRoom(editorOptions);
        const pages = layoutAtlas([region('fill', room, room)], editorOptions);

        expect(room).toBe(2032);
        expect(pageNames(pages)).toEqual([['fill']]);
        expect(pages[0].rects[0]).toMatchObject({ x: 8, y: 8 });
    });

    it('loses no region however many are too large', () => {
        const regions = [
            region('a', 2048, 10),
            region('b', 10, 2041),
            region('c', 4000, 4000),
            region('d', 100, 100),
        ];

        expect(pageNames(layoutAtlas(regions, editorOptions)).flat().sort()).toEqual([
            'a',
            'b',
            'c',
            'd',
        ]);
    });
});
