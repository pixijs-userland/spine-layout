import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { gameDiagnostics } from '../../helpers/gameTypes';

const GAME = fileURLToPath(new URL('./game.ts', import.meta.url));

/** A Pixi 6 game's own source, typed by the declarations of what it imports alone. */
const SOURCE = `import * as PIXI from 'pixi.js-v6';
import * as particles from 'pixi-particles';
import * as base from '@pixi-spine-v6/base';
import * as runtime37 from '@pixi-spine-v6/runtime-3.7';
import * as runtime38 from '@pixi-spine-v6/runtime-3.8';
import * as runtime40 from '@pixi-spine-v6/runtime-4.0';
import * as runtime41 from '@pixi-spine-v6/runtime-4.1';
import { createPixi6Engine } from '../../../src/pixi6';
import { pixiSpineModular } from '../../../src/runtimes';

const app = new PIXI.Application();
const runtimes = pixiSpineModular(
    base,
    { '3.7': runtime37, '3.8': runtime38, '4.0': runtime40, '4.1': runtime41 },
    { packageVersion: '3.1.2' },
);

createPixi6Engine(PIXI, {
    runtimes,
    renderer: app.renderer,
    loaders: [app.loader, PIXI.Loader.shared],
    particles,
});

// @ts-expect-error
pixiSpineModular({ TextureAtlas: base.TextureAtlas }, {}, { packageVersion: '3.1.2' });
`;

it('takes the PIXI, @pixi-spine modules and particles of a game typed by their own declarations', () => {
    expect(gameDiagnostics(GAME, SOURCE)).toEqual([]);
}, 30_000);
