import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { gameDiagnostics } from '../../helpers/gameTypes';

const GAME = fileURLToPath(new URL('./game.ts', import.meta.url));

/** pixi-spine's TextureAtlas drops a page whose loader hands it `null`, in every version. */
const SOURCE = `import type { Spine38TextureLoader } from '../../../src/pixi4';

export const withoutPages: Spine38TextureLoader = (_page, load) => load(null);
`;

it('lets a game’s atlas texture loader drop a page with null', () => {
    expect(gameDiagnostics(GAME, SOURCE)).toEqual([]);
}, 30_000);
