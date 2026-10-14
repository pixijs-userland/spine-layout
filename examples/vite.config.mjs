import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { defineConfig } from 'vite';

const EXAMPLES = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(EXAMPLES);
const VENDOR = join(EXAMPLES, 'vendor');
const STAMP = join(VENDOR, 'inputs.sha256');

// Named as app-magic-editor names its runtime bundles, which discoverGlobalRuntimes reads the
// package version from.
const BUNDLES = [
    {
        file: 'pixi-spine-v6.js',
        global: 'pixiSpine',
        packages: { base: '@pixi-spine-v6/base', runtime38: '@pixi-spine-v6/runtime-3.8' },
    },
    {
        file: 'pixi-spine-v7.js',
        global: 'pixiSpine',
        packages: { base: '@pixi-spine-v7/base', runtime38: '@pixi-spine-v7/runtime-3.8' },
    },
    { file: 'spine-pixi-v7-43.js', global: 'spinePixiV7', packages: { '*': 'spine-pixi-v7-43' } },
];

const installed = (alias) => {
    const dir = realpathSync(join(PACKAGE, 'node_modules', alias));
    return { dir, version: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version };
};

const pixiGlobal = {
    name: 'pixi-global',
    setup(build) {
        build.onResolve({ filter: /^(pixi\.js|@pixi\/[^/]+)$/ }, ({ path }) => ({
            path,
            namespace: 'pixi-global',
        }));
        build.onLoad({ filter: /.*/, namespace: 'pixi-global' }, ({ path }) => ({
            contents: `module.exports = globalThis.PIXI${path === '@pixi/utils' ? '.utils' : ''};`,
            loader: 'js',
        }));
    },
};

// spine-pixi-v7 points a global `require` at window.PIXI for its own IIFE; pixiGlobal does that here
const dropRequireShim = {
    name: 'drop-require-shim',
    setup(build) {
        build.onLoad({ filter: /[\\/]require-shim\.js$/ }, () => ({
            contents: 'export {}',
            loader: 'js',
        }));
    },
};

function packagesIn(metafile) {
    const dirs = new Map();
    for (const input of Object.keys(metafile.inputs)) {
        const match = /^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(input);
        if (!match) continue;
        const [, dir, name] = match;
        dirs.set(name, (dirs.get(name) ?? new Set()).add(realpathSync(join(PACKAGE, dir))));
    }
    return dirs;
}

async function bundle({ file, global, packages }) {
    const aliases = Object.values(packages);
    const globalName = `SpineRuntime_${global}_${installed(aliases[0]).version.replaceAll('.', '_')}`;
    const entry = Object.entries(packages)
        .map(([name, alias]) =>
            name === '*' ? `export * from '${alias}';` : `export * as ${name} from '${alias}';`,
        )
        .join('\n');

    const { outputFiles, metafile } = await esbuild.build({
        stdin: { contents: entry, resolveDir: PACKAGE, sourcefile: file, loader: 'js' },
        absWorkingDir: PACKAGE,
        bundle: true,
        format: 'iife',
        globalName,
        platform: 'browser',
        target: 'es2020',
        minify: true,
        write: false,
        metafile: true,
        logLevel: 'warning',
        plugins: [pixiGlobal, dropRequireShim],
    });

    for (const [name, dirs] of packagesIn(metafile)) {
        if (name === 'pixi.js' || name.startsWith('@pixi/')) {
            throw new Error(`${file} bundles ${name}; Pixi must come from globalThis.PIXI`);
        }
        if (dirs.size > 1) throw new Error(`${file} bundles ${dirs.size} copies of ${name}`);
    }
    writeFileSync(join(VENDOR, file), outputFiles[0].text);
}

async function buildVendor() {
    const hash = createHash('sha256')
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .update(esbuild.version);
    BUNDLES.flatMap(({ packages }) => Object.values(packages)).forEach((alias) =>
        hash.update(JSON.stringify([alias, installed(alias)])),
    );
    const inputs = hash.digest('hex');

    const built = BUNDLES.every(({ file }) => existsSync(join(VENDOR, file)));
    if (built && existsSync(STAMP) && readFileSync(STAMP, 'utf8') === inputs) return;

    mkdirSync(VENDOR, { recursive: true });
    await Promise.all(BUNDLES.map(bundle));
    writeFileSync(STAMP, inputs);
    console.log(
        `[examples] built ${BUNDLES.map(({ file }) => file).join(', ')} into examples/vendor`,
    );
}

export default defineConfig({
    root: PACKAGE,
    plugins: [{ name: 'examples-vendor', configResolved: buildVendor }],
    optimizeDeps: { entries: ['examples/**/*.html'] },
});
