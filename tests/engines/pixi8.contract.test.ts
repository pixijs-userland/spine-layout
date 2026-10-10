import { pixi8Engine } from '../../src/engines/pixi8';
import { engineContract } from '../engine-contract/contract';

engineContract('pixi8', async () => pixi8Engine);
