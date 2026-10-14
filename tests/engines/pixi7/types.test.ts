import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { gameDiagnostics } from '../../helpers/gameTypes';

const GAME = fileURLToPath(new URL('./game.ts', import.meta.url));

/** A Pixi 7 game's own source, typed by the declarations of what it imports alone. */
const SOURCE = `import * as PIXI from 'pixi.js-v7';
import * as particles from '@pixi/particle-emitter-v5';
import * as base from '@pixi-spine-v7/base';
import * as runtime37 from '@pixi-spine-v7/runtime-3.7';
import * as runtime38 from '@pixi-spine-v7/runtime-3.8';
import * as runtime41 from '@pixi-spine-v7/runtime-4.1';
import * as spine42 from 'spine-pixi-v7-42';
import * as spine43 from 'spine-pixi-v7-43';
import { createPixi7Engine } from '../../../src/pixi7';
import { esotericRuntime, pixiSpineModular } from '../../../src/runtimes';

const modular = pixiSpineModular(
    base,
    { '3.7': runtime37, '3.8': runtime38, '4.1': runtime41 },
    { packageVersion: '4.0.6' },
);

createPixi7Engine(PIXI, {
    runtimes: [...modular, esotericRuntime(spine42), esotericRuntime(spine43)],
    particles,
});

// @ts-expect-error
createPixi7Engine(PIXI, { particles: { upgradeConfig: particles.upgradeConfig } });
`;

it('takes the PIXI, Spine runtimes and particles of a game typed by their own declarations', () => {
    expect(gameDiagnostics(GAME, SOURCE)).toEqual([]);
}, 30_000);
