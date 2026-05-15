import type { AssetsManifest, UnresolvedAsset } from 'pixi.js';

export type SpineAssetData = {
    atlas: string;
    skel: string;
    texture: string;
};

export class ManifestParser {
    static getSpineAssets(manifest: AssetsManifest): SpineAssetData[] {
        const result: SpineAssetData[] = [];

        manifest.bundles.forEach((bundle: UnresolvedAsset) => {
            const skeletons = ManifestParser.getAssetByType(bundle, 'skel');
            const jsons = ManifestParser.getAssetByType(bundle, 'json');
            const atlases = ManifestParser.getAssetByType(bundle, 'atlas');
            const pngs = ManifestParser.getAssetByType(bundle, 'png');

            // TODO: consider some spines may not have atlas
            atlases?.forEach((atlas) => {
                const atlasID = atlas.replace(/\.atlas/, '');
                const hasJSON = jsons?.includes(`${atlasID}.json`);
                const hasSKEL = skeletons?.includes(`${atlasID}.skel`);
                const hasPNG = pngs?.includes(`${atlasID}.png`);

                if ((hasJSON || hasSKEL) && hasPNG) {
                    result.push({
                        atlas,
                        skel: hasJSON ? `${atlasID}.json` : `${atlasID}.skel`,
                        texture: `${atlasID}.png`,
                    });
                }
            });
        });

        return result;
    }

    static getAssetByType(bundle: UnresolvedAsset, type: string): string[] | undefined {
        if (Array.isArray(bundle.assets)) {
            return bundle.assets
                .filter(({ alias }) => alias[0].endsWith(type))
                .map(({ alias }) => alias[0].split('/').pop()!);
        }
    }
}
