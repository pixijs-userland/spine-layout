import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import {
    pixiSpineLegacy,
    pixiSpineModular,
    setFromMatrixHolder,
    transformBaseHolder,
    type PixiSpineMinor,
    type PixiSpineRuntime,
    type SlotHolderTransform,
} from '../../../src/engines/pixiSpine';

const require = createRequire(import.meta.url);

// a whole Pixi and pixi-spine, of which the port's structural types cover the used part
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loaded = any;

export interface Stack {
    name: string;
    PIXI: Loaded;
    runtimes: PixiSpineRuntime[];
    holderTransform: SlotHolderTransform;
    /** Each runtime's own namespace by the minor it reads, to build its objects by hand. */
    namespaces: Partial<Record<PixiSpineMinor, Loaded>>;
    /** Each runtime's `Spine` class by the minor it reads. */
    spines: Partial<Record<PixiSpineMinor, Loaded>>;
    makeInteractive(view: Loaded): void;
    /** What a click at `x, y` under `root` lands on, as the stack's own event system finds it. */
    hitTest(root: Loaded, x: number, y: number): unknown;
}

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
 * A happy-dom page, with a 2D context that draws nothing and measures 10px a character: Pixi
 * draws its white texture with one on load. Pixi 6 asks WebGL for shader precision to build
 * a mesh.
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

const packageDir = (name: string) =>
    require.resolve(name).replace(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\/.*$/, '$1');

const spinesOf = (namespaces: Record<string, Loaded>) =>
    Object.fromEntries(Object.entries(namespaces).map(([minor, ns]) => [minor, ns.Spine]));

const runScript = (file: string) =>
    vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });

function interactionManagerHitTest(PIXI: Loaded, Manager: Loaded) {
    return (root: Loaded, x: number, y: number) => {
        const view = document.createElement('canvas');
        const manager = new Manager({ view, resolution: 1, plugins: {} });
        const hit = manager.hitTest(new PIXI.Point(x, y), root);
        manager.destroy();
        return hit;
    };
}

/**
 * pixi-spine 1.x or 2.x the way a game has it: pixi.js puts itself on `window.PIXI` and the
 * pixi-spine bundle adds `PIXI.spine` to the `PIXI` in its scope.
 */
export function loadLegacyStack(
    pixi: 'pixi.js-v4' | 'pixi.js-v5',
    spine: string,
    packageVersion: string,
): Stack {
    installDom();

    const PIXI = require(pixi);
    PIXI.utils.skipHello();
    new Function('PIXI', readFileSync(require.resolve(spine), 'utf8')).call({}, PIXI);

    const runtime = pixiSpineLegacy(PIXI.spine, { packageVersion });
    const v4 = pixi === 'pixi.js-v4';

    return {
        name: `${pixi} + pixi-spine ${packageVersion}`,
        PIXI,
        runtimes: [runtime],
        holderTransform: v4 ? transformBaseHolder(PIXI) : setFromMatrixHolder,
        namespaces: { [runtime.info.minor]: PIXI.spine.core },
        spines: { [runtime.info.minor]: PIXI.spine.Spine },
        makeInteractive: (view) => (view.interactive = true),
        hitTest: interactionManagerHitTest(
            PIXI,
            v4 ? PIXI.interaction.InteractionManager : PIXI.InteractionManager,
        ),
    };
}

/**
 * pixi-spine 1.6.2 on `PIXI` and 1.5.23 beside it: the second bundle runs against an object
 * that inherits `PIXI`, so its `PIXI.spine` does not overwrite the first's.
 */
export function loadTwoLegacyCores(): Stack {
    const stack = loadLegacyStack('pixi.js-v4', 'pixi-spine-v4', '1.6.2');
    const scoped = Object.create(stack.PIXI);
    new Function('PIXI', readFileSync(require.resolve('pixi-spine-v4-37'), 'utf8')).call(
        {},
        scoped,
    );

    const runtime = pixiSpineLegacy(scoped.spine, { packageVersion: '1.5.23' });

    return {
        ...stack,
        name: 'pixi.js 4.8.9 + pixi-spine 1.6.2 and 1.5.23',
        runtimes: [...stack.runtimes, runtime],
        namespaces: { ...stack.namespaces, '3.7': scoped.spine.core },
        spines: { ...stack.spines, '3.7': scoped.spine.Spine },
    };
}

/**
 * Pixi 6 and `@pixi-spine/*` 3.1.2 from their browser bundles on one global `PIXI`: the CommonJS
 * builds would pull the one `@pixi/core` this workspace has, 7.4.3. Every runtime bundle but
 * 3.7's reads its base as `PIXI.spine.base`, which nothing defines.
 */
export function loadPixi6Stack(minors: PixiSpineMinor[]): Stack {
    installDom();

    runScript(`${packageDir('pixi.js-v6')}/dist/browser/pixi.js`);
    const PIXI = (globalThis as Loaded).PIXI;
    PIXI.utils.skipHello();

    runScript(`${packageDir('@pixi-spine-v6/base')}/dist/base.js`);
    PIXI.spine.base = PIXI.spine;

    const namespaces = Object.fromEntries(
        minors.map((minor) => {
            runScript(`${packageDir(`@pixi-spine-v6/runtime-${minor}`)}/dist/runtime-${minor}.js`);
            return [minor, PIXI[`spine${minor.replace('.', '')}`]];
        }),
    );

    return {
        name: 'pixi.js 6.5.10 + @pixi-spine 3.1.2',
        PIXI,
        runtimes: pixiSpineModular(PIXI.spine, namespaces, { packageVersion: '3.1.2' }),
        holderTransform: setFromMatrixHolder,
        namespaces,
        spines: spinesOf(namespaces),
        makeInteractive: (view) => (view.interactive = true),
        hitTest: interactionManagerHitTest(PIXI, PIXI.InteractionManager),
    };
}

/** Pixi 7 and `@pixi-spine/*` 4.0.6 as a bundler would build them, from their CommonJS builds. */
export function loadPixi7Stack(minors: PixiSpineMinor[]): Stack {
    installDom();

    const PIXI = require('pixi.js-v7');
    PIXI.utils.skipHello();

    const base = require('@pixi-spine-v7/base');
    const namespaces = Object.fromEntries(
        minors.map((minor) => [minor, require(`@pixi-spine-v7/runtime-${minor}`)]),
    );

    return {
        name: 'pixi.js 7.4.3 + @pixi-spine 4.0.6',
        PIXI,
        runtimes: pixiSpineModular(base, namespaces, { packageVersion: '4.0.6' }),
        holderTransform: setFromMatrixHolder,
        namespaces,
        spines: spinesOf(namespaces),
        makeInteractive: (view) => (view.eventMode = 'static'),
        hitTest: (root, x, y) => new PIXI.EventBoundary(root).hitTest(x, y),
    };
}

/** A blank page the size the atlas names: Pixi checks every region's frame against its page. */
export function canvasPage(PIXI: Loaded, width: number, height: number, resolution = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const base = PIXI.VERSION.startsWith('4.')
        ? new PIXI.BaseTexture(canvas, undefined, resolution)
        : new PIXI.BaseTexture(canvas, { resolution });

    return new PIXI.Texture(base);
}

/** What the renderer does before it draws: brings every world transform up to date. */
export function updateTransforms(PIXI: Loaded, view: Loaded) {
    const parent = view.parent;
    view.parent = new PIXI.Container();
    view.updateTransform();
    view.parent = parent;
}
