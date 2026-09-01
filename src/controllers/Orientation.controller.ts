import { LOG } from '../config/logs';
import { parcePointers } from '../config/parcePointers';
import type { Orientation } from '../config/types';
import { log } from '../utils/Log';
import type { AnimationsController } from './Animations.controller';

type Size = { width: number; height: number };

/**
 * Poses the layout for the shape of the screen and re-poses it on every turn: a window taller
 * than it is wide plays `state_portrait/`, a window wider than it is tall plays
 * `state_landscape/`. Accessed via `layout.orientation`.
 *
 * Like the rest of the conventions it needs no code — the two folders are ordinary states, so
 * an artist authors them in the Spine editor and the layout plays them for itself. A layout
 * that has neither never listens for a resize.
 *
 * Author both halves, even when only one of them moves anything. The pair pose the same bones,
 * so they take turns on one track (see {@link AnimationsController.allocateTrack}) and each
 * undoes the other by replacing it; a state authored on its own has nothing to hand the pose
 * back to and holds it in both orientations.
 */
export class OrientationController {
    /** The orientation the layout has been posed for, `undefined` before the first one. */
    #current?: Orientation;
    /** The size {@link setSize} named, for a layout that does not fill the window. */
    #size?: Size;
    #enabled = true;
    #listening = false;

    constructor(private animations: AnimationsController) { }

    // ─── setters / getters ───────────────────────────────────────────────────────

    /**
     * Whether the layout follows the screen at all. Switching it back on poses the layout for
     * the orientation the screen is in now, which may have turned while it was off.
     */
    set enabled(value: boolean) {
        if (this.#enabled === value) return;
        this.#enabled = value;
        if (value) this.update();
    }
    get enabled(): boolean {
        return this.#enabled;
    }

    /**
     * The orientation the layout is posed for — what the screen was the last time the states
     * were played, which is what game code should branch on. `undefined` until the first one.
     */
    get current(): Orientation | undefined {
        return this.#current;
    }

    // ─── Following the screen ────────────────────────────────────────────────────

    /**
     * Poses the layout for the screen it is on and starts following it.
     *
     * Idempotent, and free for the layouts that never author the two folders: with neither
     * state registered there is nothing to play and no listener is added. Safe to call again
     * once more spines are registered — a layout already posed keeps the pose it has, so a
     * late spine is posed by the next turn of the screen rather than by re-running the state
     * on everything standing.
     */
    attach() {
        if (!this.authored()) return;

        this.listen();

        if (!this.#current) this.update();
    }

    /**
     * Measures the screen by hand, for a layout that does not fill the window — a canvas in a
     * panel, a test. The size given stands until another replaces it, so a layout driven this
     * way is oriented by its own resize rather than by the window's.
     */
    setSize(width: number, height: number) {
        this.#size = { width, height };
        this.update();
    }

    /**
     * Re-reads the screen and plays the state for it if it has turned since the last read.
     * Called for you on every resize; call it by hand after moving the layout somewhere the
     * window's own size does not describe.
     */
    update() {
        if (!this.#enabled) return;

        const size = this.#size ?? viewport();

        if (!size) return;

        const next = orientationOf(size);

        if (next === this.#current) return;

        this.#current = next;

        log.log(LOG.ORIENTATION, `${next} (${size.width}×${size.height})`);

        // A state the layout never authored is not a mistake — half a pair is a scene that
        // only rearranges itself one way round — so the other orientation simply plays
        // nothing and leaves the pose standing.
        if (this.animations.getStates().includes(next)) void this.animations.playState(next);
    }

    private authored(): boolean {
        const states = this.animations.getStates();

        return Object.values(parcePointers.orientation).some((state) => states.includes(state));
    }

    private listen() {
        if (this.#listening || typeof window === 'undefined') return;

        this.#listening = true;
        window.addEventListener('resize', this.onResize);
        // Older mobile Safari can turn without reporting a resize; the two together fire twice
        // on a turn, which costs nothing — `update` plays only when the orientation changed.
        window.addEventListener('orientationchange', this.onResize);
    }

    private onResize = () => this.update();

    // ─── Lifecycle ───────────────────────────────────────────────────────────────

    clear() {
        if (this.#listening) {
            window.removeEventListener('resize', this.onResize);
            window.removeEventListener('orientationchange', this.onResize);
            this.#listening = false;
        }

        this.#current = undefined;
        this.#size = undefined;
    }
}

/** A screen taller than it is wide is portrait; square counts as landscape. */
function orientationOf({ width, height }: Size): Orientation {
    const { portrait, landscape } = parcePointers.orientation;

    return height > width ? portrait : landscape;
}

/** The window's own size, or `undefined` where there is no window to measure (SSR, a test). */
function viewport(): Size | undefined {
    const { innerWidth: width, innerHeight: height } = globalThis.window ?? {};

    return typeof width === 'number' && typeof height === 'number' ? { width, height } : undefined;
}
