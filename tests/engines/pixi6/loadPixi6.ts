import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import type { Plugin } from 'esbuild';

const require = createRequire(import.meta.url);
const PACKAGE_DIR = new URL('../../..', import.meta.url).pathname;

// the whole of PIXI 6 and pixi-spine, of which the engine's structural types cover the used part
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadedPixi6 = any;

export const MINORS = ['3.7', '3.8', '4.0', '4.1'] as const;
export type Minor = (typeof MINORS)[number];

/** The global app-magic-editor's `scripts/build-runtimes.mjs` gives `@pixi-spine/*` 3.1.2. */
export const RUNTIMES_GLOBAL = 'SpineRuntime_pixiSpine_3_1_2';

const DOM_GLOBALS = [
    'document',
    'navigator',
    'location',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'HTMLVideoElement',
    'Image',
    'XMLHttpRequest',
    'Event',
    'MouseEvent',
    'PointerEvent',
    'TouchEvent',
];

/**
 * A happy-dom page for a test file left in the node environment, where the contract suite reads
 * its fixtures off disk. Its canvas context draws nothing and measures 10px a character; Pixi 6
 * asks it for shader precision to build a mesh.
 */
function installDom() {
    const { Window } = require('happy-dom');
    const window = new Window();
    const define = (key: string, value: unknown) =>
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

    define('window', window);
    define('self', globalThis);
    DOM_GLOBALS.forEach((key) => define(key, window[key]));
    define('addEventListener', window.addEventListener.bind(window));
    define('removeEventListener', window.removeEventListener.bind(window));

    const context = new Proxy({} as Record<PropertyKey, unknown>, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'getShaderPrecisionFormat') {
                return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
            }
            if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
            if (key === 'getImageData') {
                return (_x: number, _y: number, width: number, height: number) => ({
                    data: new Uint8ClampedArray(Math.max(1, width * height * 4)),
                });
            }
            if (key === 'createLinearGradient' || key === 'createPattern')
                return () => ({ addColorStop() {} });
            return () => {};
        },
        set(target, key, value) {
            target[key] = value;
            return true;
        },
    });

    window.HTMLCanvasElement.prototype.getContext = function getContext() {
        return context;
    };
}

/** A file of an npm-aliased package, found from its entry point: pixi.js 6 exports no `package.json`. */
function packageFile(alias: string, file: string) {
    let dir = dirname(require.resolve(alias));
    while (!existsSync(join(dir, file)) && dirname(dir) !== dir) dir = dirname(dir);
    return join(dir, file);
}

const runScript = (file: string) =>
    vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });

/** As the editor's build maps them: every `@pixi/*` package is a part of the page's `PIXI`. */
const pixiGlobal: Plugin = {
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

let bundled: Promise<string> | undefined;

/**
 * `@pixi-spine/*` 3.1.2 as app-magic-editor ships them to a Pixi 6 page: one IIFE exposing
 * `{ base, runtime37, runtime38, runtime40, runtime41 }` as {@link RUNTIMES_GLOBAL}, its `@pixi/*`
 * imports read off the page's `PIXI`. Their CommonJS builds would bring this workspace's
 * `@pixi/core` 7.4.3 instead.
 */
export function bundleRuntimes(): Promise<string> {
    bundled ??= import('esbuild').then(async ({ build }) => {
        const entry = [
            "export * as base from '@pixi-spine-v6/base';",
            ...MINORS.map(
                (minor) =>
                    `export * as runtime${minor.replace('.', '')} from '@pixi-spine-v6/runtime-${minor}';`,
            ),
        ].join('\n');
        const { outputFiles } = await build({
            stdin: { contents: entry, resolveDir: PACKAGE_DIR, loader: 'js' },
            bundle: true,
            format: 'iife',
            globalName: RUNTIMES_GLOBAL,
            platform: 'browser',
            target: 'es2020',
            write: false,
            logLevel: 'warning',
            plugins: [pixiGlobal],
        });
        return outputFiles[0].text;
    });
    return bundled;
}

/**
 * A Pixi 6 page as the editor builds one: pixi.js's browser bundle on `window.PIXI`, then
 * pixi-particles 4.3's onto `PIXI.particles`, then the runtimes ({@link bundleRuntimes}).
 */
export async function loadPixi6(): Promise<LoadedPixi6> {
    const runtimes = await bundleRuntimes();
    const global = globalThis as Record<string, unknown>;

    installDom();
    runScript(packageFile('pixi.js-v6', 'dist/browser/pixi.js'));
    const PIXI = global.PIXI as LoadedPixi6;
    PIXI.utils.skipHello();

    runScript(packageFile('pixi-particles', 'dist/pixi-particles.js'));
    vm.runInThisContext(runtimes, { filename: `${RUNTIMES_GLOBAL}.js` });

    return PIXI;
}

/** A blank page the size the atlas names: pixi-spine checks every region's frame against its page. */
export function canvasPage(PIXI: LoadedPixi6, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return new PIXI.Texture(new PIXI.BaseTexture(canvas));
}

/** What the renderer does before it draws or hit-tests: brings every world transform up to date. */
export function updateTransforms(PIXI: LoadedPixi6, view: LoadedPixi6) {
    const parent = view.parent;
    view.parent = new PIXI.Container();
    view.updateTransform();
    view.parent = parent;
}

/** What a click at `x, y` under `root` lands on, as Pixi 6's interaction manager finds it. */
export function hitTest(PIXI: LoadedPixi6, root: LoadedPixi6, x: number, y: number) {
    const view = document.createElement('canvas');
    const manager = new PIXI.InteractionManager({ view, resolution: 1, plugins: {} });
    const hit = manager.hitTest(new PIXI.Point(x, y), root);
    manager.destroy();
    return hit;
}
