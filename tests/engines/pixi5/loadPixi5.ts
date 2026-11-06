import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Engine } from '../../../src/engine/Engine';
import { pixiSpineLegacy, type PixiSpineRuntime } from '../../../src/engines/pixiSpine';
import { createPixi5Engine, type Pixi5EngineOptions } from '../../../src/engines/pixi5';
import { canvasPage, loadLegacyStack, type Loaded, type Stack } from '../pixiSpine/stacks';

const require = createRequire(import.meta.url);

export type Pixi5Minor = '3.7' | '3.8';

export const PIXI_SPINE: Record<Pixi5Minor, { alias: string; version: string }> = {
    '3.7': { alias: 'pixi-spine-v5-37', version: '2.0.5' },
    '3.8': { alias: 'pixi-spine-v5-38', version: '2.1.14' },
};

export const PIXI_SPINE_1: Record<Pixi5Minor, { alias: string; version: string }> = {
    '3.7': { alias: 'pixi-spine-v4-37', version: '1.5.23' },
    '3.8': { alias: 'pixi-spine-v4', version: '1.6.2' },
};

function scopedPixiSpine(PIXI: Loaded, { alias, version }: { alias: string; version: string }) {
    const scoped = Object.create(PIXI);
    new Function('PIXI', readFileSync(require.resolve(alias), 'utf8')).call({}, scoped);

    return pixiSpineLegacy(scoped.spine, { packageVersion: version });
}

/**
 * Pixi 4's pixi-spine for `minor`, run against an object that inherits this Pixi 5 `PIXI`, so the
 * page keeps its own `PIXI.spine`. It loads, with a deprecation warning for each Pixi 4 name.
 */
export const pixiSpine1On = (PIXI: Loaded, minor: Pixi5Minor): PixiSpineRuntime =>
    scopedPixiSpine(PIXI, PIXI_SPINE_1[minor]);

/** The Pixi 5 pixi-spine for `minor`, beside the page's own as {@link pixiSpine1On} loads 1.x. */
export const pixiSpine2On = (PIXI: Loaded, minor: Pixi5Minor): PixiSpineRuntime =>
    scopedPixiSpine(PIXI, PIXI_SPINE[minor]);

/**
 * A Pixi 5 page as a game has it: pixi.js with the deprecated names its browser bundle keeps,
 * then the one pixi-spine that reads `minor` adding `PIXI.spine`, and pixi-particles' browser
 * bundle adding `PIXI.particles`.
 */
export function loadPixi5(minor: Pixi5Minor): Stack {
    const { alias, version } = PIXI_SPINE[minor];
    const stack = loadLegacyStack('pixi.js-v5', alias, version);
    stack.PIXI.useDeprecated();

    const particles = readFileSync(
        require.resolve('pixi-particles/dist/pixi-particles.js'),
        'utf8',
    );

    new Function('PIXI', particles).call({ PIXI: stack.PIXI }, stack.PIXI);
    return stack;
}

/**
 * The engine over that page, as the contract suite runs it: the suite fills the atlas page with
 * the white texture, and Pixi 5 checks every region's frame against its page.
 */
export function contractEngine(stack: Stack, options?: Pixi5EngineOptions): Engine {
    const engine = createPixi5Engine(stack.PIXI, options);
    const page = canvasPage(stack.PIXI, 64, 32);
    const display = Object.create(engine.display, { whiteTexture: { value: page } });

    return { ...engine, display } as Engine;
}
