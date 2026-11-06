import type { Engine, SpinePort } from '../../src/engine/Engine';
import { createLegacyPorts, type LegacyTypes } from '../../src/engines/legacy';
import { createCompositeSpinePort } from '../../src/engines/shared/compositeSpinePort';
import { pixiSpineAdapters } from '../../src/runtimes';
import { canvasPage, loadPixi7Stack } from '../engines/pixiSpine/stacks';
import { engineContract, twoRuntimesContract } from './contract';

// left in the node environment with a happy-dom page installed by the stack, as the suite reads
// its fixtures off disk
function build(): Engine {
    const { PIXI, runtimes } = loadPixi7Stack(['3.8', '4.1']);
    const legacy = createLegacyPorts(PIXI, { spine: () => spine });
    const spine: SpinePort<LegacyTypes> = createCompositeSpinePort(
        pixiSpineAdapters(runtimes, { PIXI, assets: legacy.assets }),
    ) as never;

    // pixi-spine checks every region's frame against its page: a white page the size the atlas names
    const page = canvasPage(PIXI, 64, 32);
    const display = Object.create(legacy.display, { whiteTexture: { value: page } });

    return { name: 'pixi7', spine, display, text: legacy.text, assets: legacy.assets } as Engine;
}

let engine: Engine | undefined;
const load = async () => (engine ??= build());

twoRuntimesContract('pixi7 over @pixi-spine runtime-3.8 and 4.1', load, ['3.8', '4.1']);
engineContract('pixi7 over @pixi-spine runtime-3.8 and 4.1, a 3.8 export', load, '3.8');
engineContract('pixi7 over @pixi-spine runtime-3.8 and 4.1, a 4.1 export', load, '4.1');
