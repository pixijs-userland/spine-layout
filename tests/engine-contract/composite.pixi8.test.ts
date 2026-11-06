import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import * as PIXI from 'pixi.js';
import * as SP42 from 'spine-pixi-v8-42';
import type { Engine } from '../../src/engine/Engine';
import { assetsPort } from '../../src/engines/pixi8/assets.port';
import { createDisplayPort } from '../../src/engines/pixi8/display.port';
import { textPort } from '../../src/engines/pixi8/text.port';
import { createCompositeSpinePort } from '../../src/engines/shared/compositeSpinePort';
import { esotericAdapter, esotericRuntime } from '../../src/runtimes';
import { engineContract, twoRuntimesContract } from './contract';

// left in the node environment, as the suite reads its fixtures off disk
function build(): Engine {
    const spine = createCompositeSpinePort([
        esotericAdapter(esotericRuntime(SP42, '4.2.120'), PIXI),
        esotericAdapter(esotericRuntime(SP43, '4.3.7'), PIXI),
    ]);

    return {
        name: 'pixi8',
        spine,
        display: createDisplayPort(spine as never),
        text: textPort,
        assets: assetsPort,
    } as Engine;
}

let engine: Engine | undefined;
const load = async () => (engine ??= build());

twoRuntimesContract('pixi8 over spine-pixi-v8 4.2 and 4.3', load, ['4.2', '4.3']);
engineContract('pixi8 over spine-pixi-v8 4.2 and 4.3, a 4.2 export', load, '4.2');
engineContract('pixi8 over spine-pixi-v8 4.2 and 4.3, a 4.3 export', load, '4.3');
