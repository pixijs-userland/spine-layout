import type {
    AssetsLike,
    AtlasLike,
    AtlasPageLike,
    AtlasRegionLike,
    EsotericClasses,
    EsotericModule,
} from './types';

const SPINE_LOADERS = new Set(['spineTextureAtlasLoader', 'spineSkeletonLoader']);

/**
 * Drops every spine loader but the first of each name. Each runtime adds its own under the same
 * name, which pixi warns about on the first load; their code is the same, and the first one
 * parses every atlas either way. Returns the names dropped.
 */
export function pruneDuplicateSpineLoaders(assets: AssetsLike): string[] {
    const { parsers } = assets.loader;
    const seen = new Set<string>();
    const dropped: string[] = [];

    for (let i = 0; i < parsers.length; i++) {
        const name = parsers[i].id ?? parsers[i].name;
        if (!name || !SPINE_LOADERS.has(name)) continue;

        if (seen.has(name)) {
            dropped.push(name);
            parsers.splice(i--, 1);
        } else {
            seen.add(name);
        }
    }

    return dropped;
}

export const isAtlas = (value: unknown): value is AtlasLike =>
    Array.isArray((value as AtlasLike | undefined)?.pages) &&
    Array.isArray((value as AtlasLike).regions);

const adopted = new WeakMap<object, WeakMap<AtlasLike, AtlasLike>>();

/**
 * `atlas` in `SP`'s own classes. An atlas the asset loader parsed belongs to whichever runtime
 * registered its loader first, and a mesh read against another runtime's region takes the wrong
 * UVs (`MeshAttachment.updateRegion` tests the region with `instanceof`). Same fields, same page
 * textures, new prototypes.
 */
export function adoptAtlas(SP: EsotericModule, atlas: AtlasLike): AtlasLike {
    const { TextureAtlas, TextureAtlasPage, TextureAtlasRegion } = SP as unknown as EsotericClasses;
    if ((atlas as object) instanceof TextureAtlas) return atlas;

    let byAtlas = adopted.get(SP);
    if (!byAtlas) adopted.set(SP, (byAtlas = new WeakMap()));

    const known = byAtlas.get(atlas);
    if (known) return known;

    const copy = new TextureAtlas('');
    const pages = new Map<AtlasPageLike, AtlasPageLike>();

    for (const page of atlas.pages) {
        const own: AtlasPageLike = Object.assign(Object.create(TextureAtlasPage.prototype), page, {
            regions: [],
        });
        pages.set(page, own);
        copy.pages.push(own);
    }
    for (const region of atlas.regions) {
        const page = pages.get(region.page)!;
        const own: AtlasRegionLike = Object.assign(
            Object.create(TextureAtlasRegion.prototype),
            region,
            { page },
        );
        page.regions.push(own);
        copy.regions.push(own);
    }

    byAtlas.set(atlas, copy);
    return copy;
}
