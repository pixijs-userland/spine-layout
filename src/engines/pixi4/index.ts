import type { Engine, PointLike } from '../../engine/Engine';
import { createAssetsPort, type Pixi4AssetsPort } from './assets.port';
import { createDisplayPort } from './display.port';
import { createParticlesPort } from './particles.port';
import type { Pixi4Namespace, Pixi4Renderer, Pixi4Types } from './pixi4.types';
import { createSlotObjects } from './slotObjects';
import { createSpinePort } from './spine.port';
import { createTextPort } from './text.port';

export interface Pixi4EngineOptions {
    /** Its interaction manager reports every pointer move, hit or not. */
    renderer?: Pixi4Renderer;
}

export interface Pixi4Engine extends Engine<Pixi4Types> {
    readonly assets: Pixi4AssetsPort;
}

function copyFrom(this: PointLike & { set(x: number, y?: number): void }, point: PointLike) {
    this.set(point.x, point.y);
    return this;
}

/** v4 points spell it `copy`; the core uses v5+'s `copyFrom`. */
function addCopyFrom(prototype: object) {
    if ('copyFrom' in prototype) return;
    Object.defineProperty(prototype, 'copyFrom', {
        value: copyFrom,
        configurable: true,
        writable: true,
    });
}

/**
 * The engine over a PIXI v4 namespace — `window.PIXI` with pixi-spine (and optionally
 * pixi-particles) already on it. Nothing here reads a global: everything comes from `PIXI`.
 */
export function createPixi4Engine(
    PIXI: Pixi4Namespace,
    options: Pixi4EngineOptions = {},
): Pixi4Engine {
    if (!PIXI.spine?.Spine) {
        throw new Error('createPixi4Engine: PIXI.spine is missing — load pixi-spine first');
    }

    addCopyFrom(PIXI.Point.prototype);
    addCopyFrom(PIXI.ObservablePoint.prototype);

    const assets = createAssetsPort(PIXI);
    const slotObjects = createSlotObjects(PIXI);
    const particles = createParticlesPort(PIXI);

    return {
        name: 'pixi4',
        spine: createSpinePort(PIXI, assets, slotObjects),
        display: createDisplayPort(PIXI, slotObjects, options.renderer),
        text: createTextPort(PIXI),
        assets,
        ...(particles && { particles }),
    };
}
