import { Assets } from 'pixi.js';
import type { AssetsPort } from '../../engine/Engine';

export const assetsPort: AssetsPort = {
    get: <A = unknown>(alias: string) => Assets.get<A>(alias),
};
