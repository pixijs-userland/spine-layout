import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { EsotericRuntime } from '../../../src/engines/esoteric';
import type { LegacyParticles } from '../../../src/engines/legacy';
import type { PixiSpineMinor, PixiSpineRuntime } from '../../../src/engines/pixiSpine';
import { esotericRuntime, pixiSpineModular } from '../../../src/runtimes';

const require = createRequire(import.meta.url);

// pixi.js and its runtimes whole, of which the engine's structural types cover the used part
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loaded = any;

export interface Pixi7Stack {
    PIXI: Loaded;
    particles: LegacyParticles;
    /** `@pixi-spine/*` 4.0.6, runtime-4.0 among them, by the minor each reads. */
    pixiSpine: Record<PixiSpineMinor, PixiSpineRuntime>;
    /** spine-pixi-v7 4.2.120 and 4.3.13. */
    esoteric: Record<'4.2' | '4.3', EsotericRuntime>;
    modules: {
        base: Loaded;
        pixiSpine: Record<PixiSpineMinor, Loaded>;
        esoteric: Record<'4.2' | '4.3', Loaded>;
    };
}

const DOM_GLOBALS = [
    'document',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'HTMLVideoElement',
    'Image',
    'Event',
    'MouseEvent',
    'PointerEvent',
];

/**
 * A happy-dom page with a 2D context that draws nothing and measures 10px a character, as Pixi 7
 * draws its white texture with one. The environment stays `node`: a DOM one rewrites the contract
 * suite's `new URL(…, import.meta.url)` fixture paths into server URLs.
 */
function installDom() {
    const { Window } = require('happy-dom');
    const window = new Window();
    const define = (key: string, value: unknown) =>
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

    define('window', window);
    DOM_GLOBALS.forEach((key) => define(key, window[key]));
    define('addEventListener', window.addEventListener.bind(window));
    define('removeEventListener', window.removeEventListener.bind(window));

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

    window.HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
        return type === '2d' ? context : null;
    };
}

/** @pixi/particle-emitter's browser bundle, run against `PIXI` without writing to it. */
function particleEmitter(PIXI: Loaded): LegacyParticles {
    let dir = dirname(require.resolve('@pixi/particle-emitter-v5'));
    while (!dir.endsWith('particle-emitter')) dir = dirname(dir);

    const holder = { PIXI: {} as { particles?: LegacyParticles } };
    const source = readFileSync(join(dir, 'dist/particle-emitter.js'), 'utf8');
    new Function('PIXI', source).call(holder, PIXI);

    return holder.PIXI.particles!;
}

let stack: Promise<Pixi7Stack> | undefined;

/**
 * Pixi 7.4.3, `@pixi-spine/*` 4.0.6 and spine-pixi-v7 4.2.120 and 4.3.13 the way a bundled game
 * has them: as ES modules over one `@pixi/core`. spine-pixi-v7 ships no CommonJS build, and a
 * CommonJS Pixi beside it would be a second `@pixi/core`.
 */
export function loadPixi7(): Promise<Pixi7Stack> {
    return (stack ??= (async () => {
        installDom();

        const PIXI = await import('pixi.js-v7');
        const base = await import('@pixi-spine-v7/base');
        const pixiSpine = {
            '3.7': await import('@pixi-spine-v7/runtime-3.7'),
            '3.8': await import('@pixi-spine-v7/runtime-3.8'),
            '4.0': await import('@pixi-spine-v7/runtime-4.0'),
            '4.1': await import('@pixi-spine-v7/runtime-4.1'),
        };
        const esoteric = {
            '4.2': await import('spine-pixi-v7-42'),
            '4.3': await import('spine-pixi-v7-43'),
        };

        PIXI.Ticker.shared.autoStart = false;
        PIXI.Ticker.shared.stop();

        const modular = pixiSpineModular(base as Loaded, pixiSpine as Loaded, {
            packageVersion: '4.0.6',
        });

        return {
            PIXI,
            particles: particleEmitter(PIXI),
            pixiSpine: Object.fromEntries(
                modular.map((runtime) => [runtime.info.minor, runtime]),
            ) as Pixi7Stack['pixiSpine'],
            esoteric: {
                '4.2': esotericRuntime(esoteric['4.2'] as Loaded, '4.2.120'),
                '4.3': esotericRuntime(esoteric['4.3'] as Loaded, '4.3.13'),
            },
            modules: { base, pixiSpine, esoteric },
        };
    })());
}

/** A blank page the size the atlas names: pixi-spine checks every region's frame against it. */
export function canvasPage(PIXI: Loaded, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return new PIXI.Texture(new PIXI.BaseTexture(canvas));
}

/** What the renderer does before it draws or hit-tests: every world transform brought up to date. */
export function updateTransforms(root: Loaded) {
    const parent = root.enableTempParent();
    root.updateTransform();
    root.disableTempParent(parent);
}
