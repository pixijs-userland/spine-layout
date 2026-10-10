import type { ManifestAssetLike, ManifestLike } from '../config/types';

type Bundle = ManifestLike['bundles'][number];

/** A `PIXI.loader` resource, down to what tells a pixi-spine skeleton from any other file. */
export type LoaderResourceLike = { url?: string; spineData?: unknown };

export type SpineAssetData = {
    skel: string;
    /**
     * The skeleton's atlas, absent for a skeleton that attaches no image.
     *
     * Spine exports such a skeleton as the JSON alone — there is nothing for an atlas to
     * describe — and it is read with an empty one. A skeleton whose whole job is to place and
     * drive other spines is exactly that: bones, slots and animations, no art.
     */
    atlas?: string;
    texture?: string;
};

export class ManifestParser {
    static getSpineAssets(manifest: ManifestLike): SpineAssetData[] {
        const result: SpineAssetData[] = [];
        const folders = ManifestParser.spineFolders(manifest);

        manifest.bundles.forEach((bundle: Bundle) => {
            const skeletons = ManifestParser.getAssetByType(bundle, 'skel') ?? [];
            const jsons = ManifestParser.getAssetByType(bundle, 'json') ?? [];
            const atlases = ManifestParser.getAssetByType(bundle, 'atlas') ?? [];
            const pngs = ManifestParser.getAssetByType(bundle, 'png') ?? [];
            const packed = new Set<string>();

            atlases.forEach((atlas) => {
                const atlasID = trimExtension(atlas);
                const hasJSON = jsons.includes(`${atlasID}.json`);
                const hasSKEL = skeletons.includes(`${atlasID}.skel`);
                const hasPNG = pngs.includes(`${atlasID}.png`);

                packed.add(atlasID);

                if ((hasJSON || hasSKEL) && hasPNG) {
                    result.push({
                        atlas,
                        skel: hasJSON ? `${atlasID}.json` : `${atlasID}.skel`,
                        texture: `${atlasID}.png`,
                    });
                }
            });

            // The atlas-less skeletons, which a manifest cannot tell from any other file of the
            // same extension — a `texts.json` is not a skeleton. What separates them is where
            // they sit: the folders the atlases are in are the folders the spines are in.
            ManifestParser.aliasesByType(bundle, 'skel')
                .concat(ManifestParser.aliasesByType(bundle, 'json'))
                .forEach((alias) => {
                    const skel = basename(alias);

                    if (packed.has(trimExtension(skel))) return;
                    if (!folders.has(directory(alias))) return;

                    result.push({ skel });
                });
        });

        return result;
    }

    /**
     * A manifest over what a `PIXI.loader` holds. pixi-spine's middleware reads a skeleton's
     * atlas and pages under names of its own, so a skeleton it parsed is listed with the
     * `.atlas` and `.png` aliases the pairing looks for; the assets port answers them from the
     * `spineData` the loader already built.
     */
    static fromLoaderResources(resources: Record<string, LoaderResourceLike>): ManifestLike {
        const assets: ManifestAssetLike[] = [];

        Object.entries(resources).forEach(([name, resource]) => {
            if (/_atlas($|_page_)/.test(name)) return;

            assets.push({ alias: [name], src: resource.url });

            if (!resource.spineData) return;

            const id = trimExtension(name);

            ['atlas', 'png'].forEach((type) => {
                const alias = `${id}.${type}`;

                if (!(alias in resources)) assets.push({ alias: [alias], src: resource.url });
            });
        });

        return { bundles: [{ name: 'loader', assets }] };
    }

    static getAssetByType(bundle: Bundle, type: string): string[] | undefined {
        if (Array.isArray(bundle.assets)) {
            return ManifestParser.aliasesByType(bundle, type).map(basename);
        }
    }

    /** Where the spines live: every folder an atlas was found in, across the whole manifest. */
    private static spineFolders(manifest: ManifestLike): Set<string> {
        const folders = new Set<string>();

        manifest.bundles.forEach((bundle: Bundle) => {
            ManifestParser.aliasesByType(bundle, 'atlas').forEach((alias) =>
                folders.add(directory(alias)),
            );
        });

        return folders;
    }

    private static aliasesByType(bundle: Bundle, type: string): string[] {
        if (!Array.isArray(bundle.assets)) return [];

        return bundle.assets.map(({ alias }) => alias![0]).filter((alias) => alias.endsWith(type));
    }
}

function basename(alias: string): string {
    return alias.split('/').pop()!;
}

function directory(alias: string): string {
    return alias.includes('/') ? alias.slice(0, alias.lastIndexOf('/')) : '';
}

function trimExtension(filename: string): string {
    return filename.replace(/\.[^.]+$/, '');
}
