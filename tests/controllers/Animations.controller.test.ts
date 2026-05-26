import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/controllers/Sounds.controller', () => ({
    sounds: { playFX: vi.fn() },
}));

import { AnimationsController } from '../../src/controllers/Animations.controller';
import { asSpineMap, createFakeSpine, type FakeSpine } from '../helpers/fakeSpine';

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

    it('pauseSpineByID sets timeScale to 0 on the target spine', () => {
        const hero = createFakeSpine();
        const ctl = new AnimationsController(asSpineMap({ hero }));
        hero.state.timeScale = 1;
        ctl.pauseSpineByID('hero');
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

    it('stopAnimation clears the right track for the named animation', async () => {
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

        ctl.stopAnimation('hero', 'a');
        ctl.stopAnimation('hero', 'b_loop');

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

describe('AnimationsController – pauseAnimation', () => {
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
        ctl.pauseAnimation('missing', 'a');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('is a no-op when the animation is not currently tracked on the spine', () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        ctl.pauseAnimation('hero', 'a');

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

        ctl.pauseAnimation('hero', 'a');

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

        ctl.pauseAnimation('hero', 'idle_loop');

        expect(entry.timeScale).toBe(0);
        expect(entry.trackEnd).toBe(0.7);

        await vi.runAllTimersAsync();
    });
});

describe('AnimationsController – resetAnimation', () => {
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
        ctl.resetAnimation('missing', 'a');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('clears the active track and restores bones+slots to setup pose', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        expect(ctl.getActive()).toEqual(['hero']);

        ctl.resetAnimation('hero', 'a');

        expect(hero.__clearTrackCalls).toEqual([0]);
        expect(hero.__bonesSetupPoseCount).toBe(1);
        expect(hero.__setupPoseCount).toBe(1);
        expect(hero.__worldTransformUpdates).toBeGreaterThan(0);

        // Idempotent: a second reset should be a no-op clear (animation
        // entry was already removed from the internal track map).
        ctl.resetAnimation('hero', 'a');
        expect(hero.__clearTrackCalls).toEqual([0]);

        await vi.runAllTimersAsync();
    });

    it('clears the looping track when called on a _loop animation', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'idle_loop', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'idle_loop');
        expect(ctl.getLooping()).toEqual(['hero']);

        ctl.resetAnimation('hero', 'idle_loop');

        expect(hero.__clearTrackCalls).toEqual([0]);

        await vi.runAllTimersAsync();
    });

    it('still resets the pose even when the animation is not tracked', () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        ctl.resetAnimation('hero', 'a');

        expect(hero.__clearTrackCalls).toEqual([]);
        expect(hero.__bonesSetupPoseCount).toBe(1);
        expect(hero.__setupPoseCount).toBe(1);
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

describe('AnimationsController – playInstanceAnimationLastFrame', () => {
    it('warns when spine is unknown', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctl = new AnimationsController(new Map());
        await ctl.playInstanceAnimationLastFrame('missing', 'anim');
        expect(err).toHaveBeenCalledWith('Track spine not found');
    });

    it('seeks to the end of the animation via trackEntry.trackTime', async () => {
        const trackEntry = { trackTime: 0, animationEnd: 5 };
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 5 }] });
        hero.state.getCurrent = () => trackEntry;

        const ctl = new AnimationsController(asSpineMap({ hero }));
        await ctl.playInstanceAnimationLastFrame('hero', 'a');

        expect(trackEntry.trackTime).toBe(5);
    });
});
