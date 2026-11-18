import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssetPack } from '@assetpack/core';
import { defineConfig } from 'vite';
import { assetpackConfig } from './assetpack.config.mjs';

const EXAMPLE = dirname(fileURLToPath(import.meta.url));

/** Packs `raw-assets/` into `public/assets/`: once for a build, and watching under the dev server. */
function assetpack() {
    let command;
    let watcher;

    return {
        name: 'assetpack',
        configResolved(config) {
            command = config.command;
        },
        async buildStart() {
            const config = assetpackConfig({
                output: resolve(EXAMPLE, 'public/assets'),
                production: command === 'build',
            });

            if (command === 'build') {
                await new AssetPack(config).run();
            } else if (!watcher) {
                watcher = new AssetPack(config);
                await watcher.watch();
            }
        },
        async buildEnd() {
            await watcher?.stop();
            watcher = undefined;
        },
    };
}

export default defineConfig({
    root: EXAMPLE,
    plugins: [assetpack()],
    // In a game this is `pnpm add @pixi/spine-layout`; here it is the package's own source.
    resolve: {
        alias: [
            {
                find: /^@pixi\/spine-layout$/,
                replacement: resolve(EXAMPLE, '../../src/index.ts'),
            },
        ],
    },
    build: { outDir: 'dist', emptyOutDir: true },
});
