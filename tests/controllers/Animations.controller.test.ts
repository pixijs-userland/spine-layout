import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/controllers/Sounds.controller', () => ({
    sounds: { playFX: vi.fn(), stopFX: vi.fn(), playMusic: vi.fn() },
}));

import { AnimationsController } from '../../src/controllers/Animations.controller';
import { sounds } from '../../src/controllers/Sounds.controller';
import { asSpineMap, createFakeSpine, type FakeSpine } from '../helpers/fakeSpine';
import { log } from '../../src/utils/Log';

const soundsMock = sounds as unknown as {
    playFX: ReturnType<typeof vi.fn>;
    stopFX: ReturnType<typeof vi.fn>;
    playMusic: ReturnType<typeof vi.fn>;
};

function makeHero(extra: Parameters<typeof createFakeSpine>[0] = {}): FakeSpine {
    return createFakeSpine({
        animations: [
            { name: 'state_idle/breathe', duration: 1 },
            { name: 'state_idle/blink_loop', duration: 0.5 },
            { name: 'event_click/jump', duration: 0.4 },
            { name: 'misc/wave', duration: 0.2 },
        ],
        ...extra,
    });
}

describe('AnimationsController – registration & getters', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('indexes animations by name (stripping _loop/_next modifiers) and exposes via getAll', () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(ctl.getAll().sort()).toEqual(
            ['event_click/jump', 'misc/wave', 'state_idle/blink', 'state_idle/breathe'].sort(),
        );
    });

    it('buckets animations under state_<name>/ into getStates', () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(ctl.getStates()).toEqual(['idle']);
    });

    it('buckets animations under event_<name>/ into getEvents', () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(ctl.getEvents()).toEqual(['click']);
    });

    it('warns when state_/event_ animation has no name segment after the slash prefix', () => {
        const hero = createFakeSpine({ animations: [{ name: 'state_' }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(warn).toHaveBeenCalledWith('Animation state_ does not have a state name.');
    });

    it('returns empty arrays for active/looping until something is played', () => {
        const ctl = new AnimationsController(new Map());
        expect(ctl.getActive()).toEqual([]);
        expect(ctl.getLooping()).toEqual([]);
    });

    it('attaches an event listener to the spine state during registration', () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(hero.__listeners.length).toBe(1);
    });
});

describe('AnimationsController – playback', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('playByName triggers setAnimation on every spine that has it', async () => {
        const hero = makeHero();
        const enemy = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero, enemy }));
        ctl.registerSpine('hero', hero as never);
        ctl.registerSpine('enemy', enemy as never);

        const promise = ctl.playByName('misc/wave');
        await vi.runAllTimersAsync();
        await promise;

        expect(hero.__setAnimationCalls).toEqual([{ track: 0, name: 'misc/wave', loop: false }]);
        expect(enemy.__setAnimationCalls).toEqual([{ track: 0, name: 'misc/wave', loop: false }]);
    });

    it('play increments track IDs per spine across calls', async () => {
        const hero = createFakeSpine({
            animations: [
                { name: 'a', duration: 0.1 },
                { name: 'b', duration: 0.1 },
            ],
        });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const p1 = ctl.play('hero', 'a');
        const p2 = ctl.play('hero', 'b');
        await vi.runAllTimersAsync();
        await Promise.all([p1, p2]);

        expect(hero.__setAnimationCalls.map((c) => c.track)).toEqual([0, 1]);
    });

    it('play treats _loop suffix as a looping animation tracked in getLooping', async () => {
        const hero = createFakeSpine({
            animations: [{ name: 'idle_loop', duration: 1 }],
        });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const promise = ctl.play('hero', 'idle_loop');
        expect(hero.__setAnimationCalls[0]).toMatchObject({ name: 'idle_loop', loop: true });
        expect(ctl.getLooping()).toEqual(['hero']);
        expect(ctl.getActive()).toEqual([]);

        await vi.runAllTimersAsync();
        await promise;
    });

    it('play with playSolo clears existing tracks before starting', async () => {
        const hero = createFakeSpine({
            animations: [
                { name: 'a', duration: 1 },
                { name: 'b', duration: 1 },
            ],
        });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        // Start "a" non-solo so an active animation is recorded.
        void ctl.play('hero', 'a');
        // Now run "b" solo, which should stop "a" first.
        const promise = ctl.play('hero', 'b', true);

        expect(hero.__clearTracksCalls).toBeGreaterThan(0);
        await vi.runAllTimersAsync();
        await promise;
    });

    it('play logs error and resolves when spine is unknown', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctl = new AnimationsController(new Map());
        await ctl.play('missing', 'anim');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('play deduplicates re-plays of an already-active animation', async () => {
        const hero = createFakeSpine({
            animations: [{ name: 'a', duration: 1 }],
        });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        // The first call uses track 0; the second should be deduped even though
        // the recorded track ID is the falsy value 0.
        void ctl.play('hero', 'a');
        void ctl.play('hero', 'a');

        expect(hero.__setAnimationCalls.length).toBe(1);

        await vi.runAllTimersAsync();
    });

    it('playState dispatches to all spines that have an animation in that state', async () => {
        const hero = makeHero();
        const enemy = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero, enemy }));
        ctl.registerSpine('hero', hero as never);
        ctl.registerSpine('enemy', enemy as never);

        const promise = ctl.playState('idle');
        await vi.runAllTimersAsync();
        await promise;

        const heroNames = hero.__setAnimationCalls.map((c) => c.name).sort();
        const enemyNames = enemy.__setAnimationCalls.map((c) => c.name).sort();
        expect(heroNames).toEqual(['state_idle/blink_loop', 'state_idle/breathe']);
        expect(enemyNames).toEqual(['state_idle/blink_loop', 'state_idle/breathe']);
    });

    // A state's log table must be printed when the state is dispatched, not when its
    // animations finish — otherwise a long state (`init`) is logged after everything
    // that was dispatched while it played, and the console order lies about the
    // actual order of events.
    it.each([
        ['playState', (ctl: AnimationsController) => ctl.playState('idle'), '🎬 Play State [idle]'],
        [
            'playEvent',
            (ctl: AnimationsController) => ctl.playEvent('click', 'hero'),
            '⚡ Play event [click]',
        ],
    ])('%s logs its group on dispatch, before the animations complete', async (_, run, label) => {
        const group = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        vi.spyOn(console, 'table').mockImplementation(() => {});
        vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
        log.enabled = true;

        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const promise = run(ctl);

        expect(group).toHaveBeenCalledWith(label);

        await vi.runAllTimersAsync();
        await promise;

        log.enabled = false;
        vi.restoreAllMocks();
    });

    it('playEvent invokes registered listeners and plays event animations', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const listener = vi.fn();
        ctl.addEventListener('click', listener);

        const promise = ctl.playEvent('click', 'hero');
        await vi.runAllTimersAsync();
        await promise;

        expect(listener).toHaveBeenCalledWith('hero', hero, { eventName: 'click' });
        expect(hero.__setAnimationCalls.some((c) => c.name === 'event_click/jump')).toBe(true);
    });

    it('routes skeleton events through playEvent (registered via registerSpine)', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const listener = vi.fn();
        ctl.addEventListener('click', listener);

        hero.triggerEvent('click');
        await vi.runAllTimersAsync();

        expect(listener).toHaveBeenCalled();
    });

    it('vibration_<ms> skeleton events invoke navigator.vibrate', async () => {
        const vibrate = vi.fn();
        // navigator may already exist (with no vibrate). Replace minimally for the test.
        const original = (globalThis as { navigator?: unknown }).navigator;
        Object.defineProperty(globalThis, 'navigator', {
            value: { vibrate },
            configurable: true,
        });

        try {
            const hero = makeHero();
            const ctl = new AnimationsController(asSpineMap({ hero }));
            ctl.registerSpine('hero', hero as never);

            hero.triggerEvent('vibration_50');
            await vi.runAllTimersAsync();

            expect(vibrate).toHaveBeenCalledWith(50);
        } finally {
            Object.defineProperty(globalThis, 'navigator', {
                value: original,
                configurable: true,
            });
        }
    });

    it('playSolo stops all tracks then plays the named animation', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 0.1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        await ctl.playSolo('a');
        await vi.runAllTimersAsync();

        expect(hero.__clearTracksCalls).toBeGreaterThan(0);
        expect(hero.__setAnimationCalls[0].name).toBe('a');
    });

    it('speed setter propagates to all spines', () => {
        const hero = createFakeSpine();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.speed = 2;

        expect(hero.state.timeScale).toBe(2);
        expect(ctl.speed).toBe(2);
    });

    it('pauseBySpineID sets timeScale to 0 on the target spine', () => {
        const hero = createFakeSpine();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        hero.state.timeScale = 1;
        ctl.pauseBySpineID('hero');
        expect(hero.state.timeScale).toBe(0);
    });

    it('stopAll clears tracks, resets pose, and empties registries on every spine', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 0.1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        expect(ctl.getActive()).toEqual(['hero']);

        ctl.stopAll();

        expect(hero.__clearTracksCalls).toBeGreaterThan(0);
        expect(hero.__setupPoseCount).toBeGreaterThan(0);
        expect(ctl.getActive()).toEqual([]);

        await vi.runAllTimersAsync();
    });

    it('stop clears the right track for the named animation', async () => {
        const hero = createFakeSpine({
            animations: [
                { name: 'a', duration: 1 },
                { name: 'b_loop', duration: 1 },
            ],
        });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        void ctl.play('hero', 'b_loop');

        ctl.stop('hero', 'a');
        ctl.stop('hero', 'b_loop');

        // tracks were 0 and 1
        expect(hero.__clearTrackCalls.sort()).toEqual([0, 1]);
        await vi.runAllTimersAsync();
    });

    it('stopState stops every animation under the state and optionally resets pose', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const promise = ctl.playState('idle');
        await vi.runAllTimersAsync();
        await promise;

        await ctl.stopState('idle');
        expect(hero.__setupPoseCount).toBeGreaterThan(0);
    });

    it('clear empties all internal maps', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);
        ctl.addEventListener('click', () => {});

        ctl.clear();

        expect(ctl.getAll()).toEqual([]);
        expect(ctl.getStates()).toEqual([]);
        expect(ctl.getEvents()).toEqual([]);
        expect(ctl.getActive()).toEqual([]);
        expect(ctl.getLooping()).toEqual([]);
        expect(ctl.speed).toBe(1);
    });
});

describe('AnimationsController – pause', () => {
    let err: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        err = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('logs an error when the spine is unknown', () => {
        const ctl = new AnimationsController(new Map());
        ctl.pause('missing', 'a');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('is a no-op when the animation is not currently tracked on the spine', () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        ctl.pause('hero', 'a');

        expect(hero.state.tracks.length).toBe(0);
        expect(hero.__worldTransformUpdates).toBe(0);
    });

    it('freezes the active track at its current trackTime', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        const entry = hero.state.tracks[0]!;
        entry.trackTime = 0.42;

        ctl.pause('hero', 'a');

        expect(entry.timeScale).toBe(0);
        expect(entry.trackEnd).toBe(0.42);
        expect(hero.__worldTransformUpdates).toBeGreaterThan(0);

        await vi.runAllTimersAsync();
    });

    it('freezes a looping track when the animation was started with _loop modifier', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'idle_loop', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'idle_loop');
        const entry = hero.state.tracks[0]!;
        entry.trackTime = 0.7;

        ctl.pause('hero', 'idle_loop');

        expect(entry.timeScale).toBe(0);
        expect(entry.trackEnd).toBe(0.7);

        await vi.runAllTimersAsync();
    });
});

describe('AnimationsController – reset', () => {
    let err: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        err = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('logs an error when the spine is unknown', () => {
        const ctl = new AnimationsController(new Map());
        ctl.reset('missing', 'a');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('clears the active track and restores bones+slots to setup pose', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        expect(ctl.getActive()).toEqual(['hero']);

        ctl.reset('hero', 'a');

        expect(hero.__clearTrackCalls).toEqual([0]);
        expect(hero.__bonesSetupPoseCount).toBe(1);
        expect(hero.__setupPoseCount).toBe(1);
        expect(hero.__worldTransformUpdates).toBeGreaterThan(0);

        // Idempotent: a second reset should be a no-op clear (animation
        // entry was already removed from the internal track map).
        ctl.reset('hero', 'a');
        expect(hero.__clearTrackCalls).toEqual([0]);

        await vi.runAllTimersAsync();
    });

    it('clears the looping track when called on a _loop animation', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'idle_loop', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'idle_loop');
        expect(ctl.getLooping()).toEqual(['hero']);

        ctl.reset('hero', 'idle_loop');

        expect(hero.__clearTrackCalls).toEqual([0]);

        await vi.runAllTimersAsync();
    });

    it('still resets the pose even when the animation is not tracked', () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        ctl.reset('hero', 'a');

        expect(hero.__clearTrackCalls).toEqual([]);
        expect(hero.__bonesSetupPoseCount).toBe(1);
        expect(hero.__setupPoseCount).toBe(1);
    });
});

describe('AnimationsController – animation-triggered FX', () => {
    function makeSpineWithFX(): FakeSpine {
        return createFakeSpine({
            animations: [
                { name: 'a', duration: 1 },
                { name: 'b', duration: 1 },
            ],
        });
    }

    beforeEach(() => {
        soundsMock.playFX.mockClear();
        soundsMock.stopFX.mockClear();
        soundsMock.playMusic.mockClear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('stop stops the FX the animation triggered', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');
        expect(soundsMock.playFX).toHaveBeenCalledWith('whoosh', false);

        ctl.stop('hero', 'a');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('treats a *_loop event as a looping FX, not music, and stops it with the animation', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('spin_loop', 'a');

        expect(soundsMock.playFX).toHaveBeenCalledWith('spin', true);
        expect(soundsMock.playMusic).not.toHaveBeenCalled();

        ctl.stop('hero', 'a');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('spin');
        await vi.runAllTimersAsync();
    });

    it('stop leaves FX triggered by a different animation playing', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        void ctl.play('hero', 'b');
        hero.triggerEvent('whoosh', 'a');

        ctl.stop('hero', 'b');

        expect(soundsMock.stopFX).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
    });

    it('leaves music alone — a music_* event is not stopped with its animation', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('music_loop', 'a');
        expect(soundsMock.playMusic).toHaveBeenCalledWith('music');
        expect(soundsMock.playFX).not.toHaveBeenCalled();

        ctl.stop('hero', 'a');

        expect(soundsMock.stopFX).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
    });

    it('routes a music track without the _loop suffix to the music channel too', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('music2', 'a');

        expect(soundsMock.playMusic).toHaveBeenCalledWith('music2');
        expect(soundsMock.playFX).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
    });

    it('keeps an FX playing while another running animation also triggered it', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        void ctl.play('hero', 'b');
        hero.triggerEvent('whoosh', 'a');
        hero.triggerEvent('whoosh', 'b');

        // 'b' still holds the shared Sounds instance for 'whoosh'
        ctl.stop('hero', 'a');
        expect(soundsMock.stopFX).not.toHaveBeenCalled();

        // ...once it stops too, nothing holds it any more
        ctl.stop('hero', 'b');
        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');

        await vi.runAllTimersAsync();
    });

    it('reset stops the FX the animation triggered', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');

        ctl.reset('hero', 'a');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('stopState stops the FX triggered by the state animations', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.playState('idle');
        hero.triggerEvent('whoosh', 'state_idle/breathe');

        await ctl.stopState('idle');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('stopAllForSpine stops that spine FX and leaves other spines untouched', async () => {
        const hero = makeSpineWithFX();
        const enemy = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero, enemy }));
        ctl.registerSpine('hero', hero as never);
        ctl.registerSpine('enemy', enemy as never);

        void ctl.play('hero', 'a');
        void ctl.play('enemy', 'a');
        hero.triggerEvent('whoosh', 'a');
        enemy.triggerEvent('growl', 'a');

        ctl.stopAllForSpine('hero');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        expect(soundsMock.stopFX).not.toHaveBeenCalledWith('growl');
        await vi.runAllTimersAsync();
    });

    it('stopAll stops the FX triggered on every spine', async () => {
        const hero = makeSpineWithFX();
        const enemy = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero, enemy }));
        ctl.registerSpine('hero', hero as never);
        ctl.registerSpine('enemy', enemy as never);

        void ctl.play('hero', 'a');
        void ctl.play('enemy', 'a');
        hero.triggerEvent('whoosh', 'a');
        enemy.triggerEvent('growl', 'a');

        ctl.stopAll();

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        expect(soundsMock.stopFX).toHaveBeenCalledWith('growl');
        await vi.runAllTimersAsync();
    });

    it('clear stops the FX triggered by all animations', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');

        ctl.clear();

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('unregisterSpine stops the FX that spine triggered', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');

        ctl.unregisterSpine('hero');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('re-triggers and re-stops the FX after the animation is replayed', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');
        ctl.stop('hero', 'a');

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');
        ctl.stop('hero', 'a');

        expect(soundsMock.stopFX).toHaveBeenCalledTimes(2);
        await vi.runAllTimersAsync();
    });

    it('does not throw when an event fires without a track entry', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        expect(() => hero.triggerEvent('whoosh')).not.toThrow();

        ctl.stop('hero', 'a');
        expect(soundsMock.stopFX).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
    });
});

describe('AnimationsController – addEventListener / removeEventListener', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('registered listener is invoked when the matching event fires via playEvent', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const cb = vi.fn();
        ctl.addEventListener('click', cb);

        const promise = ctl.playEvent('click', 'hero');
        await vi.runAllTimersAsync();
        await promise;

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith('hero', hero, { eventName: 'click' });
    });

    it('payload is merged into the listener event object', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const cb = vi.fn();
        ctl.addEventListener('balance_change', cb);

        const promise = ctl.playEvent('balance_change', 'hero', { from: '100', to: '250' });
        await vi.runAllTimersAsync();
        await promise;

        expect(cb).toHaveBeenCalledWith('hero', hero, {
            eventName: 'balance_change',
            from: '100',
            to: '250',
        });
    });

    it('a payload cannot override eventName', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const cb = vi.fn();
        ctl.addEventListener('real', cb);

        const promise = ctl.playEvent('real', 'hero', { eventName: 'spoofed' });
        await vi.runAllTimersAsync();
        await promise;

        expect(cb).toHaveBeenCalledWith('hero', hero, { eventName: 'real' });
    });

    it('multiple listeners on the same event are all invoked', async () => {
        const ctl = new AnimationsController(new Map());

        const a = vi.fn();
        const b = vi.fn();
        ctl.addEventListener('spin', a);
        ctl.addEventListener('spin', b);

        await ctl.playEvent('spin', 'hero');
        await vi.runAllTimersAsync();

        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('"*" wildcard listener receives every skeleton event', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const wildcard = vi.fn();
        ctl.addEventListener('*', wildcard);

        hero.triggerEvent('anything');
        await vi.runAllTimersAsync();

        expect(wildcard).toHaveBeenCalledTimes(1);
    });

    it('removeEventListener stops the callback from being called', async () => {
        const ctl = new AnimationsController(new Map());

        const cb = vi.fn();
        ctl.addEventListener('win', cb);
        ctl.removeEventListener('win', cb);

        await ctl.playEvent('win', 'hero');
        await vi.runAllTimersAsync();

        expect(cb).not.toHaveBeenCalled();
    });

    it('removeEventListener removes only the specified listener, leaving others intact', async () => {
        const ctl = new AnimationsController(new Map());

        const keep = vi.fn();
        const remove = vi.fn();
        ctl.addEventListener('bonus', keep);
        ctl.addEventListener('bonus', remove);
        ctl.removeEventListener('bonus', remove);

        await ctl.playEvent('bonus', 'hero');
        await vi.runAllTimersAsync();

        expect(keep).toHaveBeenCalledTimes(1);
        expect(remove).not.toHaveBeenCalled();
    });

    it('removeEventListener is a no-op when no listeners exist for the event', () => {
        const ctl = new AnimationsController(new Map());
        expect(() => ctl.removeEventListener('nonexistent', vi.fn())).not.toThrow();
    });

    it('removeEventListener is a no-op when the function was never registered', async () => {
        const ctl = new AnimationsController(new Map());

        const registered = vi.fn();
        const unregistered = vi.fn();
        ctl.addEventListener('free', registered);
        ctl.removeEventListener('free', unregistered);

        await ctl.playEvent('free', 'hero');
        await vi.runAllTimersAsync();

        expect(registered).toHaveBeenCalledTimes(1);
    });
});

describe('AnimationsController – playLastFrame', () => {
    it('warns when spine is unknown', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctl = new AnimationsController(new Map());
        await ctl.playLastFrame('missing', 'anim');
        expect(err).toHaveBeenCalledWith('Track spine not found');
    });

    it('seeks to the end of the animation via trackEntry.trackTime', async () => {
        const trackEntry = { trackTime: 0, animationEnd: 5 };
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 5 }] });
        hero.state.getTrack = () => trackEntry;

        const ctl = new AnimationsController(asSpineMap({ hero }));
        await ctl.playLastFrame('hero', 'a');

        expect(trackEntry.trackTime).toBe(5);
    });
});
