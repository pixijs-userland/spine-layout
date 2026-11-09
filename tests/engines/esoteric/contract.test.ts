import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import * as PIXI from 'pixi.js';
import type { Engine } from '../../../src/engine/Engine';
import {
    coreShimFor,
    createEsotericSpinePort,
    createV8Display,
} from '../../../src/engines/esoteric';
import { assetsPort } from '../../../src/engines/pixi8/assets.port';
import { createDisplayPort } from '../../../src/engines/pixi8/display.port';
import { textPort } from '../../../src/engines/pixi8/text.port';
import { engineContract } from '../../engine-contract/contract';

// the pixi8 engine with its spine port swapped for the esoteric one; left in the node
// environment, as the suite reads its fixtures off disk
engineContract('pixi8 over the esoteric port, 4.3', async () => {
    const spine = createEsotericSpinePort({
        SP: SP43,
        core: coreShimFor(SP43),
        display: createV8Display(SP43, PIXI),
    });

    return {
        name: 'pixi8',
        spine,
        display: createDisplayPort(spine as never),
        text: textPort,
        assets: assetsPort,
    } as Engine;
});
