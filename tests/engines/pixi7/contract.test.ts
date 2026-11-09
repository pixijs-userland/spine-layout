import type { Engine } from '../../../src/engine/Engine';
import { createPixi7Engine, type Pixi7Runtime } from '../../../src/engines/pixi7';
import {
    cacheInRegistry,
    engineContract,
    twoRuntimesContract,
} from '../../engine-contract/contract';
import { canvasPage, loadPixi7, type Pixi7Stack } from './loadPixi7';

const MINORS = ['3.8', '4.1', '4.2', '4.3'] as const;
type Minor = (typeof MINORS)[number];

const runtimeOf = (stack: Pixi7Stack, minor: Minor): Pixi7Runtime =>
    minor === '4.2' || minor === '4.3' ? stack.esoteric[minor] : stack.pixiSpine[minor];

/** pixi-spine checks every region's frame against its page: a white page the size the atlas names. */
async function engineOver(minors: readonly Minor[]): Promise<Engine> {
    const stack = await loadPixi7();
    const engine = createPixi7Engine(stack.PIXI, {
        runtimes: minors.map((minor) => runtimeOf(stack, minor)),
        particles: stack.particles,
    });
    const display = Object.create(engine.display, {
        whiteTexture: { value: canvasPage(stack.PIXI, 64, 32) },
    });

    return { ...engine, display } as Engine;
}

function cached(minors: readonly Minor[]) {
    let engine: Promise<Engine> | undefined;
    return () => (engine ??= engineOver(minors));
}

MINORS.forEach((minor) => {
    engineContract(`pixi7 over the ${minor} runtime alone`, cached([minor]), minor);
});

const mixed = cached(MINORS);

MINORS.forEach((minor) => {
    engineContract(`pixi7 over 3.8, 4.1, 4.2 and 4.3, a ${minor} export`, mixed, minor);
});

(
    [
        ['3.8', '4.2'],
        ['4.1', '4.3'],
        ['3.8', '4.1'],
        ['4.2', '4.3'],
    ] as [Minor, Minor][]
).forEach((pair) => {
    twoRuntimesContract(`pixi7 over 3.8, 4.1, 4.2 and 4.3: ${pair.join(' and ')}`, mixed, pair, {
        cache: cacheInRegistry,
    });
});
