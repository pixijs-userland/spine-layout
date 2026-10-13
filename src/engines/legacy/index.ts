import type { DisplayPort, ParticlesPort, PointLike } from '../../engine/Engine';
import { createAssetsPort, type LegacyAssetsRegistry } from './assets.port';
import { legacyCompat, type LegacyCompat } from './compat';
import { createDisplayPort } from './display.port';
import type {
    LegacyContainer,
    LegacyLoader,
    LegacyNamespace,
    LegacyRenderer,
    LegacySpine,
    LegacyTypes,
    SpineShapes,
} from './legacy.types';
import { createParticlesPort } from './particles.port';
import { createTextPort, type LegacyTextPort } from './text.port';

export interface LegacyPortsOptions<S extends LegacySpine = LegacySpine> {
    /** v4–v6: its interaction manager reports every pointer move, hit or not. */
    renderer?: LegacyRenderer;
    /** Loaders besides the shared one whose resources count as assets, e.g. an `app.loader`. */
    loaders?: readonly LegacyLoader[];
    /**
     * The engine's spine port, which shields its own spines' shapes. Called when a view is
     * shielded, so the port can be built after these, from their assets.
     */
    spine?: () => SpineShapes<S>;
}

export interface LegacyPorts<S extends LegacySpine = LegacySpine> {
    readonly compat: LegacyCompat;
    readonly containerClass: new () => LegacyContainer;
    readonly display: DisplayPort<LegacyTypes<S>>;
    readonly text: LegacyTextPort<S>;
    readonly assets: LegacyAssetsRegistry;
    readonly particles?: ParticlesPort<LegacyTypes<S>>;
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
 * The display, text, assets and particles ports over a PIXI 4.8, 5.x, 6.x or 7.2+ namespace —
 * the one a game loaded, with pixi-particles or @pixi/particle-emitter on it if it has particles.
 * Nothing here reads a global: everything comes from `PIXI`.
 */
export function createLegacyPorts<S extends LegacySpine = LegacySpine>(
    PIXI: LegacyNamespace,
    options: LegacyPortsOptions<S> = {},
): LegacyPorts<S> {
    const compat = legacyCompat(PIXI);

    addCopyFrom(PIXI.Point.prototype);
    addCopyFrom(PIXI.ObservablePoint.prototype);

    const particles = createParticlesPort<S>(PIXI, compat);

    return {
        compat,
        containerClass: PIXI.Container,
        display: createDisplayPort(PIXI, compat, options.spine, options.renderer),
        text: createTextPort<S>(PIXI, compat),
        assets: createAssetsPort(PIXI, compat, options.loaders),
        ...(particles && { particles }),
    };
}

export { legacyCompat, type BitmapLayoutRule, type LegacyCompat } from './compat';
export type { LegacyAssetsPort, LegacyAssetsRegistry } from './assets.port';
export type { LegacyTextCapabilities, LegacyTextPort } from './text.port';
export type * from './legacy.types';
