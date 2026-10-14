import type { Engine } from '../../../src/engine/Engine';
import { engineContract } from '../../engine-contract/contract';
import { contractEngine, loadPixi5 } from './loadPixi5';

let engine: Engine | undefined;

// left in the node environment with a happy-dom page installed by the loader, as the suite reads
// its fixtures off disk
engineContract(
    'pixi5 + pixi-spine 2.1.14',
    async () => (engine ??= contractEngine(loadPixi5('3.8'))),
    '3.8',
);
