import { fileURLToPath } from 'node:url';
import { cacheBuster } from '@assetpack/core/cache-buster';
import { compress, mipmap } from '@assetpack/core/image';
import { json } from '@assetpack/core/json';
import { pixiManifest } from '@assetpack/core/manifest';
import { spineAtlasCacheBuster, spineAtlasCompress } from '@assetpack/core/spine';
import { spinePacker, spinePackerManifestMod } from '@pixijs-userland/spine-layout/assetpack';

export const RESOLUTIONS = { default: 1, low: 0.5 };

const MANIFEST = 'manifest.json';

/**
 * @param {{ output: string, production: boolean }} options
 * @returns {import('@assetpack/core').AssetPackConfig}
 */
export function assetpackConfig({ output, production }) {
    return {
        entry: fileURLToPath(new URL('./raw-assets', import.meta.url)),
        output,
        cache: !production,
        cacheLocation: fileURLToPath(new URL('./.assetpack', import.meta.url)),
        pipes: [
            spinePacker({
                spineAtlas: { maximumTextureSize: 2048, padding: 4, allowRotation: true },
                resolutionOptions: { resolutions: RESOLUTIONS },
            }),
            json(),
            mipmap({ resolutions: RESOLUTIONS }),
            compress({
                png: production && { quality: 90 },
                webp: production && { quality: 90, alphaQuality: 90 },
                avif: production && { quality: 70, chromaSubsampling: '4:4:4' },
                jpg: false,
            }),
            ...(production
                ? [
                      spineAtlasCompress({ png: true, webp: true, avif: true }),
                      cacheBuster(),
                      spineAtlasCacheBuster(),
                  ]
                : []),
            pixiManifest({ output: MANIFEST, createShortcuts: true }),
            spinePackerManifestMod({ output: MANIFEST }),
        ],
    };
}
