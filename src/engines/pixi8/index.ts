import type { Engine } from '../../engine/Engine';
import { assetsPort } from './assets.port';
import { createDisplayPort } from './display.port';
import { spinePort } from './spine.port';
import { textPort } from './text.port';
import type { Pixi8Types } from './types';

export type { Pixi8Spine, Pixi8Types } from './types';
export { classifyPropertyId } from './spine.port';

export function createPixi8Engine(): Engine<Pixi8Types> {
    return {
        name: 'pixi8',
        spine: spinePort,
        display: createDisplayPort(spinePort),
        text: textPort,
        assets: assetsPort,
    };
}

export const pixi8Engine = createPixi8Engine();
