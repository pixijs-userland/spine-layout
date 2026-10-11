import type { Engine } from '../engine/Engine';

/**
 * The base of the layout, which makes the layout an instance of the engine's own container
 * class: the engine's constructor runs on it, and that class's prototype sits right above
 * this one, so the layout can be added to a stage, moved and scaled like any container.
 *
 * The prototype link is shared by every layout, so it follows the engine of the latest one
 * built — one rendering stack at a time, which is what a page runs.
 */
export class LayoutHost {
    constructor(engine: Engine) {
        const Base = engine.display.containerClass;

        if (Object.getPrototypeOf(LayoutHost.prototype) !== Base.prototype) {
            Object.setPrototypeOf(LayoutHost.prototype, Base.prototype);
        }

        return Reflect.construct(Base, [], new.target) as unknown as LayoutHost;
    }

    /** The container class's own `destroy`, which the layout's overrides and then calls. */
    protected destroyHost() {
        const host = Object.getPrototypeOf(LayoutHost.prototype) as { destroy?(): void };

        host.destroy?.call(this);
    }
}
