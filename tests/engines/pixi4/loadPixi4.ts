import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

/** A happy-dom page for a test file left in the node environment. */
function installDom() {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') return;

    const { Window } = require('happy-dom');
    const window = new Window();
    const define = (key: string, value: unknown) =>
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

    define('window', window);
    DOM_GLOBALS.forEach((key) => define(key, window[key]));
}

/**
 * happy-dom's canvas has no 2D context, and PIXI v4 draws its white texture and measures every
 * `Text` with one on load. This one draws nothing and measures 10px a character: text metrics
 * under test are made up, everything else is the real v4.
 */
function stubCanvas2d() {
    const context = new Proxy({} as Record<PropertyKey, unknown>, {
        get(target, key) {
            if (key in target) return target[key];
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

    HTMLCanvasElement.prototype.getContext = function getContext() {
        return context as never;
    } as typeof HTMLCanvasElement.prototype.getContext;
}

// the whole of PIXI v4, which the engine's structural types only cover the used part of
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadedPixi4 = any;

/** pixi-spine 1.6.2 reads Spine 3.8; 1.5.23 reads 3.7. A page loads one of them as `PIXI.spine`. */
export type PixiSpine1 = 'pixi-spine-v4' | 'pixi-spine-v4-37';

const runBundle = (name: string, PIXI: object) =>
    new Function('PIXI', readFileSync(require.resolve(name), 'utf8')).call({ PIXI }, PIXI);

const LOADED_SPINE = Symbol.for('spine-layout.tests.pixi-spine');

/**
 * PIXI v4 the way a legacy game has it: pixi.js puts itself on `window.PIXI`, the pixi-spine
 * bundle adds `PIXI.spine` and pixi-particles' browser bundle adds `PIXI.particles` (its
 * CommonJS build would `require('pixi.js')` and get this package's v8).
 */
export function loadPixi4(spine: PixiSpine1 = 'pixi-spine-v4'): LoadedPixi4 {
    const global = globalThis as Record<PropertyKey, unknown>;
    const loaded = global.PIXI as LoadedPixi4;
    if (loaded?.spine) {
        if (global[LOADED_SPINE] !== spine) {
            throw new Error(`This page has ${String(global[LOADED_SPINE])}, not ${spine}`);
        }
        return loaded;
    }

    installDom();
    stubCanvas2d();

    const PIXI = require('pixi.js-v4') as LoadedPixi4;
    PIXI.utils.skipHello();
    global.PIXI = PIXI;
    runBundle(spine, PIXI);
    global[LOADED_SPINE] = spine;
    runBundle('pixi-particles/dist/pixi-particles.js', PIXI);

    return PIXI;
}

/** `PIXI.spine` of another pixi-spine, run against an object inheriting `PIXI` so it stays apart. */
export function scopedPixiSpine(PIXI: LoadedPixi4, spine: PixiSpine1): LoadedPixi4 {
    const scope = Object.create(PIXI);
    runBundle(spine, scope);
    return scope.spine;
}

/** `PIXI.spine` of pixi-spine 2.1.14, the 3.8 runtime of Pixi 5, on a Pixi 5 of its own. */
export function pixi5Spine(): LoadedPixi4 {
    const PIXI5 = require('pixi.js-v5');
    PIXI5.utils.skipHello();

    const scope = Object.create(PIXI5);
    runBundle('pixi-spine-v5-38', scope);
    return scope.spine;
}

export function canvasTexture(PIXI: LoadedPixi4, width: number, height: number, resolution = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const base = new PIXI.BaseTexture(canvas, undefined, resolution);
    return new PIXI.Texture(base);
}

/** What the renderer does before it draws: brings every world transform up to date. */
export function updateTransforms(PIXI: LoadedPixi4, view: object) {
    const root = view as { parent: unknown; updateTransform(): void };
    const parent = root.parent;
    root.parent = new PIXI.Container();
    root.updateTransform();
    root.parent = parent;
}
