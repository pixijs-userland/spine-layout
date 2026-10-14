import type { Engine } from '../../../src/engine/Engine';
import { createPixi6Engine } from '../../../src/pixi6';
import { discoverGlobalRuntimes } from '../../../src/runtimes';
import {
    cacheInRegistry,
    engineContract,
    twoRuntimesContract,
} from '../../engine-contract/contract';
import { canvasPage, loadPixi6, MINORS, type LoadedPixi6, type Minor } from './loadPixi6';

// left in the node environment with a happy-dom page installed by the loader, as the suite reads
// its fixtures off disk

let PIXI: Promise<LoadedPixi6> | undefined;
const engines = new Map<string, Promise<Engine>>();

/**
 * The engine over the page's runtimes, or over `only` of them, its white texture a page the size
 * the atlas names: pixi-spine checks every region's frame against its page.
 */
function engineOver(only?: Minor): () => Promise<Engine> {
    return () => {
        const key = only ?? 'all';
        if (!engines.has(key)) {
            engines.set(
                key,
                (PIXI ??= loadPixi6()).then((pixi) => {
                    const runtimes = only
                        ? discoverGlobalRuntimes().filter(({ info }) => info.minor === only)
                        : undefined;
                    const engine = createPixi6Engine(pixi, { runtimes });
                    const page = canvasPage(pixi, 64, 32);
                    const display = Object.create(engine.display, {
                        whiteTexture: { value: page },
                    });

                    return { ...engine, display } as Engine;
                }),
            );
        }
        return engines.get(key)!;
    };
}

MINORS.forEach((minor) => {
    engineContract(`pixi6 over @pixi-spine runtime-${minor} alone`, engineOver(minor));
    engineContract(`pixi6 over runtime-3.7 to 4.1, a ${minor} export`, engineOver(), minor);
});

twoRuntimesContract('pixi6 over runtime-3.7 to 4.1', engineOver(), ['3.8', '4.1'], {
    cache: cacheInRegistry,
});
twoRuntimesContract('pixi6 over runtime-3.7 to 4.1', engineOver(), ['3.7', '4.0'], {
    cache: cacheInRegistry,
});
