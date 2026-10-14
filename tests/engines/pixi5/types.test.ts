import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { gameDiagnostics } from '../../helpers/gameTypes';

const require = createRequire(import.meta.url);

const GAME = fileURLToPath(new URL('./game.ts', import.meta.url));

/** A Pixi 5 game's own source, typed by pixi.js 5's and pixi-spine 2.1's declarations alone. */
const SOURCE = `/// <reference path="${require.resolve('pixi.js-v5/pixi.js.d.ts')}" />
/// <reference path="${require.resolve('pixi-spine-v5-38/dist/pixi-spine.d.ts')}" />
import { createPixi5Engine } from '../../../src/pixi5';
import { pixiSpineLegacy } from '../../../src/runtimes';

const app = new PIXI.Application();
const runtime = pixiSpineLegacy(PIXI.spine, { packageVersion: '2.1.14' });

createPixi5Engine(PIXI);
createPixi5Engine(PIXI, { renderer: app.renderer, loaders: [app.loader, PIXI.Loader.shared] });
createPixi5Engine(PIXI, { runtime });

// @ts-expect-error
createPixi5Engine({ VERSION: 5 });
`;

it('takes the PIXI and pixi-spine of a game typed by their own declarations, with its renderer and loaders', () => {
    expect(gameDiagnostics(GAME, SOURCE)).toEqual([]);
}, 30_000);
