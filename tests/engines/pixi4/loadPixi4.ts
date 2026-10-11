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

/**
 * PIXI v4 the way a legacy game has it: pixi.js puts itself on `window.PIXI`, pixi-spine reads
 * that global and adds `PIXI.spine`, and pixi-particles' browser bundle adds `PIXI.particles`
 * (its CommonJS build would `require('pixi.js')` and get this package's v8).
 */
export function loadPixi4(): LoadedPixi4 {
    const global = globalThis as Record<string, unknown>;
    if (global.PIXI && (global.PIXI as LoadedPixi4).spine) return global.PIXI as LoadedPixi4;

    installDom();
    stubCanvas2d();

    const PIXI = require('pixi.js-v4') as LoadedPixi4;
    PIXI.utils.skipHello();
    global.PIXI = PIXI;
    require('pixi-spine-v4');

    const particles = readFileSync(
        require.resolve('pixi-particles/dist/pixi-particles.js'),
        'utf8',
    );
    new Function('PIXI', particles).call({ PIXI }, PIXI);

    return PIXI;
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
