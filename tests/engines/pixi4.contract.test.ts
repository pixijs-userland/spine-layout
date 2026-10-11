import type { Engine } from '../../src/engine/Engine';
import { createPixi4Engine } from '../../src/engines/pixi4';
import { engineContract } from '../engine-contract/contract';
import { canvasTexture, loadPixi4 } from './pixi4/loadPixi4';

// Left in the node environment, with a happy-dom page installed by hand: a DOM environment
// transforms modules for the web, which rewrites the suite's `new URL(…, import.meta.url)`
// fixture paths into server URLs that `readFileSync` cannot open.
engineContract('pixi4', async () => {
    const PIXI = loadPixi4();
    const engine = createPixi4Engine(PIXI);

    // the suite fills the atlas page with the white texture, but v4 checks every region's frame
    // against its page and its `Texture.WHITE` is 10×10: a white page the size the atlas names
    const page = canvasTexture(PIXI, 64, 32);
    const display = Object.create(engine.display, { whiteTexture: { value: page } });

    return { ...engine, display } as Engine;
});
