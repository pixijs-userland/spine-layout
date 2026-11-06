import { expect, it } from 'vitest';
import type { Engine } from '../../../src/engine/Engine';
import { contractFixture, engineContract } from '../../engine-contract/contract';
import { contractSkeleton } from '../pixiSpine/fixtures';
import { contractEngine, loadPixi5 } from './loadPixi5';

let engine: Engine | undefined;

it('reads the contract skeleton for 3.7 as the pixi-spine suite converts it', () => {
    expect(contractFixture('3.7').skeleton).toEqual(contractSkeleton('3.7'));
});

engineContract(
    'pixi5 + pixi-spine 2.0.5',
    async () => (engine ??= contractEngine(loadPixi5('3.7'))),
    '3.7',
);
