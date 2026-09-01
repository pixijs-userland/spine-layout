import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/controllers/Sounds.controller', () => ({
    sounds: { playFX: vi.fn(), stopFX: vi.fn(), playMusic: vi.fn() },
}));

import { AnimationsController } from '../../src/controllers/Animations.controller';
import { OrientationController } from '../../src/controllers/Orientation.controller';
import { asSpineMap, createFakeSpine, type FakeSpine } from '../helpers/fakeSpine';

type Listener = () => void;

/** A window whose size the test sets, and whose resize the test fires. */
function fakeWindow(width: number, height: number) {
    const listeners = new Map<string, Set<Listener>>();

    return {
        innerWidth: width,
        innerHeight: height,
        addEventListener(type: string, fn: Listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(fn);
        },
        removeEventListener(type: string, fn: Listener) {
            listeners.get(type)?.delete(fn);
        },
        listenerCount(type: string) {
            return listeners.get(type)?.size ?? 0;
        },
        resizeTo(nextWidth: number, nextHeight: number) {
            this.innerWidth = nextWidth;
            this.innerHeight = nextHeight;
            listeners.get('resize')?.forEach((fn) => fn());
        },
    };
}

function stubWindow(width: number, height: number) {
    const win = fakeWindow(width, height);

    vi.stubGlobal('window', win);

    return win;
}

/** A scene posed by both orientation states, plus one animation neither of them touches. */
function scene(animations = ['state_landscape/wide', 'state_portrait/tall']) {
    const spine = createFakeSpine({
        animations: [
            ...animations.map((name) => ({ name, duration: 1, poses: ['bone:logo'] })),
            { name: 'state_idle/breathe_loop', duration: 1, poses: ['bone:chest'] },
        ],
    });
    const animationsController = new AnimationsController(asSpineMap({ bg: spine }));

    animationsController.registerSpine('bg', spine as never);

    return { spine, animations: animationsController };
}

function played(spine: FakeSpine): string[] {
    return spine.__setAnimationCalls.map((call) => call.name);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('OrientationController – attach', () => {
    it('poses a window wider than it is tall with state_landscape/', () => {
        stubWindow(1280, 720);
        const { spine, animations } = scene();

        new OrientationController(animations).attach();

        expect(played(spine)).toEqual(['state_landscape/wide']);
    });

    it('poses a window taller than it is wide with state_portrait/', () => {
        stubWindow(720, 1280);
        const { spine, animations } = scene();

        new OrientationController(animations).attach();

        expect(played(spine)).toEqual(['state_portrait/tall']);
    });

    it('counts a square window as landscape', () => {
        stubWindow(900, 900);
        const { spine, animations } = scene();
        const orientation = new OrientationController(animations);

        orientation.attach();

        expect(orientation.current).toBe('landscape');
        expect(played(spine)).toEqual(['state_landscape/wide']);
    });

    it('leaves a layout that authors neither folder alone, and listens for nothing', () => {
        const win = stubWindow(1280, 720);
        const { spine, animations } = scene([]);

        new OrientationController(animations).attach();

        expect(played(spine)).toEqual([]);
        expect(win.listenerCount('resize')).toBe(0);
    });

    it('does not re-pose a layout that is already oriented', () => {
        stubWindow(1280, 720);
        const { spine, animations } = scene();
        const orientation = new OrientationController(animations);

        orientation.attach();
        orientation.attach();

        expect(played(spine)).toEqual(['state_landscape/wide']);
        expect(spine.__setAnimationCalls).toHaveLength(1);
    });
});

describe('OrientationController – following the screen', () => {
    it('plays the other state when the screen turns', () => {
        const win = stubWindow(1280, 720);
        const { spine, animations } = scene();
        const orientation = new OrientationController(animations);

        orientation.attach();
        win.resizeTo(720, 1280);

        expect(played(spine)).toEqual(['state_landscape/wide', 'state_portrait/tall']);
        expect(orientation.current).toBe('portrait');
    });

    it('plays nothing on a resize that leaves the orientation as it was', () => {
        const win = stubWindow(1280, 720);
        const { spine, animations } = scene();

        new OrientationController(animations).attach();
        win.resizeTo(1024, 600);

        expect(played(spine)).toEqual(['state_landscape/wide']);
    });

    it('takes the two states in turns on one track, so each undoes the other', () => {
        const win = stubWindow(1280, 720);
        const { spine, animations } = scene();

        new OrientationController(animations).attach();
        win.resizeTo(720, 1280);

        expect(spine.__setAnimationCalls.map((call) => call.track)).toEqual([0, 0]);
    });

    it('records the orientation of a half-authored pair, and plays what is there', () => {
        const win = stubWindow(720, 1280);
        const { spine, animations } = scene(['state_landscape/wide']);
        const orientation = new OrientationController(animations);

        orientation.attach();

        expect(orientation.current).toBe('portrait');
        expect(played(spine)).toEqual([]);

        win.resizeTo(1280, 720);

        expect(orientation.current).toBe('landscape');
        expect(played(spine)).toEqual(['state_landscape/wide']);
    });

    it('is oriented by the size given to setSize, not by the window', () => {
        stubWindow(1280, 720);
        const { spine, animations } = scene();
        const orientation = new OrientationController(animations);

        orientation.setSize(400, 800);

        expect(orientation.current).toBe('portrait');
        expect(played(spine)).toEqual(['state_portrait/tall']);
    });

    it('stops following while disabled, and catches up when switched back on', () => {
        const win = stubWindow(1280, 720);
        const { spine, animations } = scene();
        const orientation = new OrientationController(animations);

        orientation.attach();
        orientation.enabled = false;
        win.resizeTo(720, 1280);

        expect(played(spine)).toEqual(['state_landscape/wide']);

        orientation.enabled = true;

        expect(played(spine)).toEqual(['state_landscape/wide', 'state_portrait/tall']);
    });

    it('stops listening on clear', () => {
        const win = stubWindow(1280, 720);
        const { spine, animations } = scene();
        const orientation = new OrientationController(animations);

        orientation.attach();
        orientation.clear();
        win.resizeTo(720, 1280);

        expect(win.listenerCount('resize')).toBe(0);
        expect(played(spine)).toEqual(['state_landscape/wide']);
    });

    it('poses nothing where there is no window to measure', () => {
        vi.stubGlobal('window', undefined);
        const { spine, animations } = scene();
        const orientation = new OrientationController(animations);

        orientation.attach();

        expect(orientation.current).toBeUndefined();
        expect(played(spine)).toEqual([]);
    });
});
