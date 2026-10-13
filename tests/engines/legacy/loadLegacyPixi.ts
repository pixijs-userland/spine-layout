import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

// the whole of a PIXI namespace, which the ports' structural types only cover the used part of
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LoadedPixi = any;

export type LegacyMajor = 4 | 5 | 6 | 7;
export type ParticlesLibrary = 'pixi-particles' | 'particle-emitter';

const BUNDLES: Record<LegacyMajor, [alias: string, file: string]> = {
    4: ['pixi.js-v4', 'dist/pixi.js'],
    5: ['pixi.js-v5', 'dist/pixi.js'],
    6: ['pixi.js-v6', 'dist/browser/pixi.js'],
    7: ['pixi.js-v7', 'dist/pixi.js'],
};

const PARTICLES: Record<ParticlesLibrary, [alias: string, file: string]> = {
    'pixi-particles': ['pixi-particles', 'dist/pixi-particles.js'],
    'particle-emitter': ['@pixi/particle-emitter-v5', 'dist/particle-emitter.js'],
};

/** A file of an npm-aliased package, found from its entry point: pixi.js 6+ export no `package.json`. */
function packageFile([alias, file]: [string, string]) {
    let dir = dirname(require.resolve(alias));
    while (!existsSync(join(dir, file)) && dirname(dir) !== dir) dir = dirname(dir);
    return readFileSync(join(dir, file), 'utf8');
}

/**
 * happy-dom's canvas has no 2D context, and PIXI draws its white texture and measures every
 * `Text` with one. This one draws nothing and measures 10px a character. WebGL stays absent, as
 * PIXI 5+ expects of a page without it: a mesh then skips compiling its shader up front.
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

    HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
        return (type === '2d' ? context : null) as never;
    } as typeof HTMLCanvasElement.prototype.getContext;
}

/**
 * PIXI the way a legacy game has it: the browser bundle a `<script>` tag runs. v4's sets the
 * global `PIXI`; v5 to v7 declare `var PIXI`, which a script would make global.
 */
export function loadPixi(major: LegacyMajor): LoadedPixi {
    stubCanvas2d();

    const global = globalThis as Record<string, unknown>;
    delete global.PIXI;

    const source = packageFile(BUNDLES[major]);
    const declared = new Function(
        `${source}\n;return typeof PIXI === 'undefined' ? undefined : PIXI;`,
    )();
    const PIXI = (declared ?? global.PIXI) as LoadedPixi;
    if (PIXI?.VERSION?.[0] !== String(major))
        throw new Error(`no PIXI ${major} in ${BUNDLES[major]}`);

    if (major < 7) PIXI.utils.skipHello();
    global.PIXI = PIXI;
    return PIXI;
}

/**
 * `PIXI` with a particles library on it, as its browser bundle adds `PIXI.particles`, in a
 * namespace of its own so that both libraries can be tried against one PIXI.
 */
export function withParticles(PIXI: LoadedPixi, library: ParticlesLibrary): LoadedPixi {
    const namespace = Object.create(PIXI, { particles: { value: undefined, writable: true } });
    new Function('PIXI', packageFile(PARTICLES[library])).call({ PIXI: namespace }, namespace);
    return namespace;
}

export function canvasTexture(PIXI: LoadedPixi, width: number, height: number, resolution = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const base =
        PIXI.VERSION[0] === '4'
            ? new PIXI.BaseTexture(canvas, undefined, resolution)
            : new PIXI.BaseTexture(canvas, { resolution });
    return new PIXI.Texture(base);
}

/** What the renderer does before it draws or hit-tests: brings every world transform up to date. */
export function updateTransforms(PIXI: LoadedPixi, view: object) {
    const root = view as { parent: unknown; updateTransform(): void };
    const parent = root.parent;
    root.parent = new PIXI.Container();
    root.updateTransform();
    root.parent = parent;
}
