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
    /** Cancels the pose queued by {@link settle}, `undefined` when none is waiting. */
    #settling?: () => void;

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
     * once more spines are registered — the pose is played again for everything standing, so a
     * spine built after the layout was oriented is posed for the screen rather than left in its
     * setup pose until the screen turns.
     */
    attach() {
        if (!this.authored()) return;

        this.listen();

        if (!this.#current) this.update();

        this.settle();
    }

    /**
     * Plays the state for the screen once more, when the frame the layout was built in is over.
     *
     * A layout is built in one synchronous burst, and the orientation states go out in the
     * middle of it: `init` first, then the screen, then whatever the game plays the moment
     * `createInstancesFromManifest` returns. An animation dispatched after them that poses the
     * same bones takes their track ({@link AnimationsController.allocateTrack} hands a claim to
     * the newcomer), and the scene is left standing in the pose the setup or `init` gave it —
     * right in landscape, where the two usually agree, and wrong in portrait until the screen
     * turns and the state is played again.
     *
     * So the pose is played twice: once now, so no frame is ever drawn unoriented, and once
     * more when nothing is queued behind it. The second pass restarts the state rather than
     * leaving a running one alone: a state whose track was taken is still registered as running
     * — the newcomer replaced the entry rather than stopping it — so the pass that has to put it
     * back is exactly the pass the registry would talk out of playing.
     */
    private settle() {
        this.#settling?.();
        this.#settling = afterFrame(() => {
            this.#settling = undefined;

            const posed = this.#current;

            if (!this.#enabled || !posed) return;
            if (!this.animations.getStates().includes(posed)) return;

            void this.animations.playState(posed, { restart: true });
        });
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
        this.#settling?.();
        this.#settling = undefined;

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

/**
 * Runs `fn` once the frame in progress is drawn, and returns the cancel for it.
 *
 * A frame rather than a task, so the wait is over the work the layout was built by and not over
 * a fixed number of milliseconds. Where there is no frame clock to wait on — a test, a layout
 * built off-screen — the next task is as close as it gets.
 */
function afterFrame(fn: () => void): () => void {
    const request = globalThis.requestAnimationFrame;

    if (typeof request !== 'function') {
        const timer = setTimeout(fn, 0);

        return () => clearTimeout(timer);
    }

    const frame = request(() => fn());

    return () => globalThis.cancelAnimationFrame(frame);
}

/** The window's own size, or `undefined` where there is no window to measure (SSR, a test). */
function viewport(): Size | undefined {
    const { innerWidth: width, innerHeight: height } = globalThis.window ?? {};

    return typeof width === 'number' && typeof height === 'number' ? { width, height } : undefined;
}
