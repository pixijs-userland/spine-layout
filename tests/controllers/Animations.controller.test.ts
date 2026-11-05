import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/controllers/Sounds.controller', () => ({
    sounds: { playFX: vi.fn(), stopFX: vi.fn(), playMusic: vi.fn() },
}));

import {
    AlphaTimeline,
    Animation,
    AnimationState,
    AnimationStateData,
    AttachmentTimeline,
    BoneData,
    Property,
    RotateTimeline,
    Skeleton,
    SkeletonData,
    SlotData,
    type Spine,
} from '@esotericsoftware/spine-pixi-v8';
import { AnimationsController } from '../../src/core/controllers/Animations.controller';
import { pixi8Engine } from '../../src/engines/pixi8';
import { sounds } from '../../src/core/controllers/Sounds.controller';
import { asSpineMap, createFakeSpine, fakeEngine, type FakeSpine } from '../helpers/fakeEngine';
import { log } from '../../src/core/utils/Log';

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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(ctl.getAll().sort()).toEqual(
            ['event_click/jump', 'misc/wave', 'state_idle/blink', 'state_idle/breathe'].sort(),
        );
    });

    it('buckets animations under state_<name>/ into getStates', () => {
        const hero = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(ctl.getStates()).toEqual(['idle']);
    });

    it('buckets animations under event_<name>/ into getEvents', () => {
        const hero = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(ctl.getEvents()).toEqual(['click']);
    });

    it('groups animations by the spine that holds them via getBySpine, listing shared ones under each', () => {
        const hero = makeHero();
        const prop = createFakeSpine({ animations: [{ name: 'misc/wave' }, { name: 'spin_loop' }] });
        const mute = createFakeSpine({ animations: [] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero, prop, mute }));
        ctl.registerSpine('hero', hero as never);
        ctl.registerSpine('prop', prop as never);
        ctl.registerSpine('mute', mute as never);

        const bySpine = ctl.getBySpine();

        expect([...bySpine.keys()]).toEqual(['hero', 'prop']);
        expect(bySpine.get('hero')!.sort()).toEqual(
            ['event_click/jump', 'misc/wave', 'state_idle/blink', 'state_idle/breathe'].sort(),
        );
        expect(bySpine.get('prop')!.sort()).toEqual(['misc/wave', 'spin'].sort());
    });

    it('warns when state_/event_ animation has no name segment after the slash prefix', () => {
        const hero = createFakeSpine({ animations: [{ name: 'state_' }] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(warn).toHaveBeenCalledWith('Animation state_ does not have a state name.');
    });

    it('returns empty arrays for active/looping until something is played', () => {
        const ctl = new AnimationsController(fakeEngine, new Map());
        expect(ctl.getActive()).toEqual([]);
        expect(ctl.getLooping()).toEqual([]);
    });

    it('attaches an event listener to the spine state during registration', () => {
        const hero = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        expect(hero.__listeners.length).toBe(1);
    });
});

describe('AnimationsController – track allocation', () => {
    /** The `ui` skeleton's real claims: what each animation poses in reel-of-the-dead. */
    const UI = [
        { name: 'state_winInfo/show_win_text', duration: 1.5, poses: ['bone:text_win'] },
        { name: 'state_freeSpinTrigger/hide_spin_button', duration: 0.167, poses: ['bone:button_spin'] },
        { name: 'state_freeSpinEnd/show_spin_button', duration: 0.167, poses: ['bone:button_spin'] },
        { name: 'state_popup/show_popup', duration: 0.333, poses: ['bone:spine_popup', 'slot:spine_popup'] },
        { name: 'event_accept_popup_click/hide_popup', duration: 0.333, poses: ['bone:spine_popup', 'slot:spine_popup'] },
    ];

    /** Which animation each occupied track currently applies. */
    const held = (ui: FakeSpine) =>
        ui.state.tracks.map((entry) => entry?.animation.name ?? null);

    const trackOf = (ui: FakeSpine, animation: string) =>
        ui.state.tracks.findIndex((entry) => entry?.animation.name === animation);

    let ui: FakeSpine;
    let ctl: AnimationsController;

    beforeEach(() => {
        vi.useFakeTimers();
        ui = createFakeSpine({ animations: UI });
        ctl = new AnimationsController(fakeEngine, asSpineMap({ ui }));
        ctl.registerSpine('ui', ui as never);
    });

    afterEach(() => vi.useRealTimers());

    it('keeps animations that pose the same properties on one shared track', async () => {
        void ctl.playState('popup');
        const opened = trackOf(ui, 'state_popup/show_popup');

        await vi.advanceTimersByTimeAsync(400); // show_popup finishes, still holding its pose
        void ctl.playEvent('accept_popup_click', 'ui');

        // hide_popup takes over show_popup's own track instead of stacking above or below it
        expect(trackOf(ui, 'event_accept_popup_click/hide_popup')).toBe(opened);
        expect(held(ui).filter(Boolean)).toEqual(['event_accept_popup_click/hide_popup']);
    });

    it('never lands an animation under a stale entry that poses the same properties', async () => {
        // the round that reproduced the invisible popup: a win, a trigger, a popup, a dismiss
        void ctl.playState('winInfo');
        void ctl.playState('freeSpinTrigger');
        await vi.advanceTimersByTimeAsync(200);
        void ctl.playState('popup');
        await vi.advanceTimersByTimeAsync(400);
        ctl.stopState('popup', false);
        void ctl.playEvent('accept_popup_click', 'ui');
        await vi.advanceTimersByTimeAsync(3000); // everything finishes; nothing clears its track

        const stale = trackOf(ui, 'event_accept_popup_click/hide_popup');
        expect(stale).toBeGreaterThanOrEqual(0); // the fade-out is still applied somewhere

        void ctl.playState('popup'); // the next popup

        // it reuses the fade-out's track, so no hidden pose is left above it
        expect(trackOf(ui, 'state_popup/show_popup')).toBe(stale);
        expect(held(ui).includes('event_accept_popup_click/hide_popup')).toBe(false);
    });

    it('leaves a holding state alone when an unrelated animation starts', async () => {
        void ctl.playState('freeSpinTrigger'); // holds the spin button hidden
        await vi.advanceTimersByTimeAsync(200); // finishes, but must keep applying
        const holding = trackOf(ui, 'state_freeSpinTrigger/hide_spin_button');

        void ctl.playState('popup'); // poses spine_popup — nothing to do with button_spin

        expect(trackOf(ui, 'state_freeSpinTrigger/hide_spin_button')).toBe(holding);
        expect(trackOf(ui, 'state_popup/show_popup')).not.toBe(holding);
    });

    it('replaces a holding state with its opposite on the same track', async () => {
        void ctl.playState('freeSpinTrigger');
        await vi.advanceTimersByTimeAsync(200);
        const holding = trackOf(ui, 'state_freeSpinTrigger/hide_spin_button');

        void ctl.playState('freeSpinEnd'); // shows the button again — same bone

        expect(trackOf(ui, 'state_freeSpinEnd/show_spin_button')).toBe(holding);
        expect(held(ui).includes('state_freeSpinTrigger/hide_spin_button')).toBe(false);
    });

    it('stops the lower of several colliding tracks and takes over the highest', async () => {
        const spine = createFakeSpine({
            animations: [
                { name: 'head', duration: 1, poses: ['bone:head'] },
                { name: 'tail', duration: 1, poses: ['bone:tail'] },
                { name: 'whole_body', duration: 1, poses: ['bone:head', 'bone:tail'] },
            ],
        });
        const controller = new AnimationsController(fakeEngine, asSpineMap({ beast: spine }));
        controller.registerSpine('beast', spine as never);

        void controller.play('beast', 'head'); // track 0
        void controller.play('beast', 'tail'); // track 1
        void controller.play('beast', 'whole_body'); // collides with both

        expect(spine.state.tracks.map((e) => e?.animation.name ?? null)).toEqual([
            null,
            'whole_body',
        ]);
        expect(controller.getActive()).toEqual(['beast']);

        await vi.runAllTimersAsync();
    });

    it('lands on the lowest free track when a shorter animation ends before a longer one', async () => {
        // a slot's round: a long win presentation under a short button flash, then a
        // counter that poses something else again — three disjoint claims
        const spine = createFakeSpine({
            animations: [
                { name: 'win', duration: 2, poses: ['bone:win'] },
                { name: 'flash', duration: 0.2, poses: ['bone:button'] },
                { name: 'count', duration: 0.5, poses: ['bone:counter'] },
            ],
        });
        const controller = new AnimationsController(fakeEngine, asSpineMap({ reels: spine }));
        controller.registerSpine('reels', spine as never);

        void controller.play('reels', 'win'); // track 0
        void controller.play('reels', 'flash'); // track 1
        await vi.advanceTimersByTimeAsync(300); // flash is over, win is not
        controller.stop('reels', 'flash'); // its track is free again

        void controller.play('reels', 'count');

        // the freed track, under the one still running — never over it
        expect(trackOf(spine, 'count')).toBe(1);
        expect(trackOf(spine, 'win')).toBe(0);
        expect(spine.state.tracks.length).toBe(2);

        await vi.runAllTimersAsync();
    });

    it('never grows the track list past the number of concurrent claims, spin after spin', async () => {
        const spine = createFakeSpine({
            animations: [
                { name: 'state_spin/turn', duration: 0.3, poses: ['bone:reel'] },
                { name: 'state_stop/land', duration: 0.1, poses: ['bone:reel'] },
                { name: 'state_win/glow', duration: 0.5, poses: ['slot:frame'] },
                { name: 'state_idle/rest', duration: 0.2, poses: ['slot:frame'] },
            ],
        });
        const controller = new AnimationsController(fakeEngine, asSpineMap({ reels: spine }));
        controller.registerSpine('reels', spine as never);

        for (let round = 0; round < 200; round++) {
            void controller.playState('spin');
            await vi.advanceTimersByTimeAsync(300);
            void controller.playState('stop'); // the reel's own track, taken over
            void controller.playState(round % 2 ? 'win' : 'idle'); // the frame's own track
            await vi.advanceTimersByTimeAsync(round % 2 ? 500 : 200);
        }

        expect(spine.state.tracks.length).toBe(2);
    });

    it('parks animations that pose nothing on one track instead of growing the list', async () => {
        const spine = createFakeSpine({
            animations: [
                { name: 'ping', duration: 0.1 },
                { name: 'pong', duration: 0.1 },
            ],
        });
        const controller = new AnimationsController(fakeEngine, asSpineMap({ bell: spine }));
        controller.registerSpine('bell', spine as never);

        void controller.play('bell', 'ping');
        void controller.play('bell', 'pong');

        expect(spine.__setAnimationCalls.map((c) => c.track)).toEqual([0, 0]);

        await vi.runAllTimersAsync();
    });
});

describe('AnimationsController – animations that hold the same value', () => {
    /**
     * The f2p slingshot: `charge1` shows the `sling` slot that carries the ball, and the
     * tutorial played over it keys the spare `ball1` the same way `charge1` does. Exports key
     * every slot like that, so the shared key decides nothing about which animation wins.
     */
    function slingshot(tutorialBall: string) {
        const data = new SkeletonData();
        const root = new BoneData(0, 'root', null);
        data.bones.push(root);

        const sling = new SlotData(0, 'sling', root);
        const hand = new SlotData(2, 'hand', root);
        sling.setupPose.color.a = 0;
        hand.setupPose.color.a = 0;
        data.slots.push(sling, new SlotData(1, 'ball1', root), hand);

        const slingShown = new AlphaTimeline(1, 0, 0);
        slingShown.setFrame(0, 0, 1);
        const chargeBall = new AttachmentTimeline(1, 1);
        chargeBall.setFrame(0, 0, 'ball');
        data.animations.push(new Animation('charge1', [slingShown, chargeBall], 0.5));

        const handFadesIn = new AlphaTimeline(2, 0, 2);
        handFadesIn.setFrame(0, 0, 0);
        handFadesIn.setFrame(1, 0.5, 1);
        const tutorialBall1 = new AttachmentTimeline(1, 1);
        tutorialBall1.setFrame(0, 0, tutorialBall);
        data.animations.push(new Animation('show_tutorial', [handFadesIn, tutorialBall1], 0.5));

        return {
            skeleton: new Skeleton(data),
            state: new AnimationState(new AnimationStateData(data)),
        } as unknown as Spine;
    }

    const running = (spine: Spine) =>
        spine.state.tracks.map((entry) => entry?.animation?.name ?? null).filter(Boolean);

    function startRound(spine: Spine) {
        const ctl = new AnimationsController(pixi8Engine, new Map([['slingshot', spine]]));
        ctl.registerSpine('slingshot', spine);

        void ctl.playByName('charge1', true);
        void ctl.playByName('show_tutorial');
        spine.state.update(0.1);
        spine.state.apply(spine.skeleton);
    }

    it('keeps the charge applying under a tutorial that only holds what the charge holds', () => {
        const spine = slingshot('ball');

        startRound(spine);

        expect(running(spine)).toEqual(['charge1', 'show_tutorial']);
        expect(spine.skeleton.findSlot('sling')!.appliedPose.color.a).toBe(1);
    });

    it('still hands the track over when the tutorial holds a value of its own', () => {
        const spine = slingshot('ball_spent');

        startRound(spine);

        expect(running(spine)).toEqual(['show_tutorial']);
    });

    /** One slot, `idle` holding its alpha at 1, and `pulse` keyed 1 to 1 over a bezier that dips. */
    function glow() {
        const data = new SkeletonData();
        const root = new BoneData(0, 'root', null);
        data.bones.push(root);
        data.slots.push(new SlotData(0, 'glow', root));

        const held = new AlphaTimeline(1, 0, 0);
        held.setFrame(0, 0, 1);
        data.animations.push(new Animation('idle', [held], 0.2));

        const dips = new AlphaTimeline(2, 1, 0);
        dips.setFrame(0, 0, 1);
        dips.setFrame(1, 1, 1);
        dips.setBezier(0, 0, 0, 0, 1, 0.3, 0, 0.7, 0, 1, 1);
        data.animations.push(new Animation('pulse', [dips], 1));

        const spine = {
            skeleton: new Skeleton(data),
            state: new AnimationState(new AnimationStateData(data)),
        } as unknown as Spine;
        const ctl = new AnimationsController(pixi8Engine, new Map([['glow', spine]]));
        ctl.registerSpine('glow', spine);

        return { spine, ctl };
    }

    it('replays an animation that only holds values on its own track', async () => {
        vi.useFakeTimers();
        const { spine, ctl } = glow();

        for (let round = 0; round < 5; round++) {
            void ctl.play('glow', 'idle');
            spine.state.update(0.3);
            await vi.advanceTimersByTimeAsync(300);
        }
        vi.useRealTimers();

        expect(running(spine)).toEqual(['idle']);
    });

    it('does not take keys that are equal around a bezier for a held value', () => {
        const { spine, ctl } = glow();

        void ctl.play('glow', 'pulse');
        void ctl.play('glow', 'idle');

        expect(running(spine)).toEqual(['idle']);
    });
});

describe('AnimationsController – never-applied entries', () => {
    // A hidden tab freezes the ticker, so an entry is set but never applied
    // (`nextTrackLast` stays -1) while the game keeps flowing on wall-clock
    // timers. The fake never applies anything, which models exactly that.

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('leaves the pose alone when the same animation replays over its never-applied entry', async () => {
        // the payline case: point bones are posed by hand after cloning, then the win
        // loop replays `show` on a timer — a setup-pose reset here wiped the points
        // and the line drew from the skeleton origin, the middle of the screen
        const payline = createFakeSpine({
            animations: [{ name: 'show', duration: 1, poses: ['slot:glow'] }],
        });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ payline }));
        ctl.registerSpine('payline', payline as never);

        void ctl.play('payline', 'show', true);
        await vi.advanceTimersByTimeAsync(1000); // resolves on wall-clock; no frame applied

        void ctl.play('payline', 'show', true); // the win loop's replay

        expect(payline.__bonesSetupPoseCount).toBe(0);
        expect(payline.__setupPoseCount).toBe(0);
        // the entry is handed to Spine untouched — setAnimation drops a
        // never-applied entry itself instead of mixing from it
        expect(payline.__clearTrackCalls).toEqual([]);
        expect(payline.__setAnimationCalls).toEqual([
            { track: 0, name: 'show', loop: false },
            { track: 0, name: 'show', loop: false },
        ]);
    });

    it('still drops a never-applied entry replaced by a different animation and undoes its pose', async () => {
        const board = createFakeSpine({
            slots: [{ name: 'symbol' }],
            animations: [
                { name: 'inactive', duration: 1, poses: [`${Property.attachment}|0`] },
                { name: 'idle', duration: 1, poses: [`${Property.attachment}|0`] },
            ],
        });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ board }));
        ctl.registerSpine('board', board as never);

        void ctl.play('board', 'inactive');
        void ctl.play('board', 'idle'); // same frame — `inactive` never applied

        expect(board.__clearTrackCalls).toEqual([0]);
        expect(board.__slotSetupPoseCalls).toEqual(['symbol']);
        expect(board.state.tracks[0]?.animation.name).toBe('idle');

        await vi.runAllTimersAsync();
    });

    it('leaves every bone and slot the dropped entry never claimed exactly where it stood', async () => {
        // the reel-position case: a whole-skeleton reset here once snapped a spin still
        // turning, or a hand raised outside the animation state, back to setup pose the
        // instant an unrelated entry on the same skeleton was replaced before Spine applied it
        const board = createFakeSpine({
            slots: [{ name: 'symbol' }],
            bones: [{ name: 'reel', setupX: 0, setupY: 0 }],
            animations: [
                { name: 'inactive', duration: 1, poses: [`${Property.attachment}|0`] },
                { name: 'idle', duration: 1, poses: [`${Property.attachment}|0`] },
            ],
        });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ board }));
        ctl.registerSpine('board', board as never);

        const reel = board.skeleton.bones[0]!;
        reel.pose.x = 42; // driven by something outside the animation state entirely

        void ctl.play('board', 'inactive');
        void ctl.play('board', 'idle'); // same frame — `inactive` never applied

        expect(board.__boneSetupPoseCalls).toEqual([]);
        expect(reel.pose.x).toBe(42);

        await vi.runAllTimersAsync();
    });

    it('leaves an applied entry to Spine own mixing', async () => {
        const board = createFakeSpine({
            animations: [
                { name: 'inactive', duration: 1, poses: ['slot:symbol'] },
                { name: 'idle', duration: 1, poses: ['slot:symbol'] },
            ],
        });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ board }));
        ctl.registerSpine('board', board as never);

        void ctl.play('board', 'inactive');
        board.state.tracks[0]!.nextTrackLast = 0; // a frame ran; the entry applied

        void ctl.play('board', 'idle');

        expect(board.__clearTrackCalls).toEqual([]);
        expect(board.__boneSetupPoseCalls).toEqual([]);
        expect(board.__slotSetupPoseCalls).toEqual([]);
        expect(board.state.tracks[0]?.animation.name).toBe('idle');

        await vi.runAllTimersAsync();
    });

    /**
     * The payline scenario against the real runtime: a skeleton whose `show` keys only the
     * root, with a point bone posed by hand the way `placePoints` does it. The runtime is
     * what guarantees the safety of skipping the undo — `setAnimation` drops a never-applied
     * entry replaced by its own animation instead of mixing from it — so that contract is
     * pinned here against runtime upgrades.
     */
    it('a hand-posed bone survives a replay that lands before any frame is applied', async () => {
        const data = new SkeletonData();
        const root = new BoneData(0, 'root', null);
        data.bones.push(root, new BoneData(1, 'point1', root));

        const rotate = new RotateTimeline(1, 0, 0);
        rotate.setFrame(0, 0, 45);
        data.animations.push(new Animation('show', [rotate], 1));

        const spine = {
            skeleton: new Skeleton(data),
            state: new AnimationState(new AnimationStateData(data)),
        } as unknown as Spine;

        const ctl = new AnimationsController(fakeEngine, new Map([['payline', spine]]));
        ctl.registerSpine('payline', spine);

        const point = spine.skeleton.findBone('point1')!;
        point.pose.setPosition(400, 300);

        void ctl.play('payline', 'show', true); // the tab goes hidden: nothing applies
        await vi.advanceTimersByTimeAsync(1000); // the win loop moves on regardless
        void ctl.play('payline', 'show', true); // the replay

        spine.state.apply(spine.skeleton); // the tab is visible again: first frame

        expect(point.pose.x).toBe(400);
        expect(point.pose.y).toBe(300);
    });

    /**
     * The other half of the payline fix: against the real runtime, undoing a genuinely
     * replaced (not merely re-set) never-applied entry must not cost its neighbours their
     * pose — only what the dropped entry itself claimed comes back to setup.
     */
    it('undoes only what the dropped entry claimed, leaving an unrelated bone as it was', () => {
        const data = new SkeletonData();
        const root = new BoneData(0, 'root', null);
        const point1 = new BoneData(1, 'point1', root);
        const reel = new BoneData(2, 'reel', root);

        data.bones.push(root, point1, reel);

        const show = new RotateTimeline(1, 0, 1); // point1
        show.setFrame(0, 0, 45);
        data.animations.push(new Animation('show', [show], 1));

        const hide = new RotateTimeline(1, 0, 1); // point1 too — a genuine collision
        hide.setFrame(0, 0, -45);
        data.animations.push(new Animation('hide', [hide], 1));

        const spine = {
            skeleton: new Skeleton(data),
            state: new AnimationState(new AnimationStateData(data)),
        } as unknown as Spine;

        const ctl = new AnimationsController(fakeEngine, new Map([['payline', spine]]));
        ctl.registerSpine('payline', spine);

        const reelBone = spine.skeleton.findBone('reel')!;
        const point1Bone = spine.skeleton.findBone('point1')!;

        reelBone.pose.rotation = 90; // driven by something outside the animation state entirely
        point1Bone.pose.rotation = 999; // stands in for whatever `show` would have posed it to

        void ctl.play('payline', 'show');
        void ctl.play('payline', 'hide'); // same frame — `show` never applied, and claims point1 too

        expect(point1Bone.pose.rotation).toBe(0); // `show`'s claim, undone back to setup
        expect(reelBone.pose.rotation).toBe(90); // claimed by neither — untouched
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero, enemy }));
        ctl.registerSpine('hero', hero as never);
        ctl.registerSpine('enemy', enemy as never);

        const promise = ctl.playByName('misc/wave');
        await vi.runAllTimersAsync();
        await promise;

        expect(hero.__setAnimationCalls).toEqual([{ track: 0, name: 'misc/wave', loop: false }]);
        expect(enemy.__setAnimationCalls).toEqual([{ track: 0, name: 'misc/wave', loop: false }]);
    });

    it('playByName leaves the other spines alone when given one to play on', async () => {
        const hero = makeHero();
        const enemy = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero, enemy }));
        ctl.registerSpine('hero', hero as never);
        ctl.registerSpine('enemy', enemy as never);

        const promise = ctl.playByName('misc/wave', false, 'hero');
        await vi.runAllTimersAsync();
        await promise;

        expect(hero.__setAnimationCalls).toEqual([{ track: 0, name: 'misc/wave', loop: false }]);
        expect(enemy.__setAnimationCalls).toEqual([]);
    });

    it('play gives animations that pose different things a track each', async () => {
        const hero = createFakeSpine({
            animations: [
                { name: 'a', duration: 0.1, poses: ['bone:head'] },
                { name: 'b', duration: 0.1, poses: ['bone:tail'] },
            ],
        });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, new Map());
        await ctl.play('missing', 'anim');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('play deduplicates re-plays of an already-active animation', async () => {
        const hero = createFakeSpine({
            animations: [{ name: 'a', duration: 1 }],
        });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        // The first call uses track 0; the second should be deduped even though
        // the recorded track ID is the falsy value 0.
        void ctl.play('hero', 'a');
        void ctl.play('hero', 'a');

        expect(hero.__setAnimationCalls.length).toBe(1);

        await vi.runAllTimersAsync();
    });

    describe('playState on a state the spine already sits in', () => {
        const LOOP = 'state_freeSpins/ambience_loop';
        const ENTER = 'state_freeSpins/enter';

        const freeSpins = () => {
            const hero = createFakeSpine({
                animations: [
                    { name: LOOP, duration: 2, poses: ['bone:fx'] },
                    { name: ENTER, duration: 1, poses: ['slot:banner'] },
                ],
            });
            const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
            ctl.registerSpine('hero', hero as never);
            const entryOf = (name: string) =>
                hero.state.tracks.find((entry) => entry?.animation.name === name)!;

            return { hero, ctl, entryOf };
        };

        it('leaves its loops and its still-running one-shots on their tracks, time intact', async () => {
            const { hero, ctl, entryOf } = freeSpins();

            void ctl.playState('freeSpins');
            const loop = entryOf(LOOP);
            const enter = entryOf(ENTER);
            loop.trackTime = 1.5;
            enter.trackTime = 0.4;

            void ctl.playState('freeSpins'); // a resumed game, already in free spins

            expect(hero.__setAnimationCalls).toHaveLength(2);
            expect(entryOf(LOOP)).toBe(loop);
            expect(loop.trackTime).toBe(1.5);
            expect(entryOf(ENTER)).toBe(enter);
            expect(enter.trackTime).toBe(0.4);

            await vi.runAllTimersAsync();
        });

        it('still restarts them when asked to', async () => {
            const { hero, ctl, entryOf } = freeSpins();

            void ctl.playState('freeSpins');
            const loop = entryOf(LOOP);

            void ctl.playState('freeSpins', { restart: true });

            expect(hero.__setAnimationCalls).toHaveLength(4);
            expect(entryOf(LOOP)).not.toBe(loop);

            await vi.runAllTimersAsync();
        });

        it('replays a loop whose track moved on behind the registry, and a paused one', async () => {
            const { hero, ctl, entryOf } = freeSpins();

            void ctl.playState('freeSpins');
            hero.state.clearTracks(); // Spine's own mixing, or a game's bare clear
            void ctl.playState('freeSpins');
            expect(hero.__setAnimationCalls).toHaveLength(4);

            const loop = entryOf(LOOP);
            ctl.pause('hero', LOOP);
            void ctl.play('hero', LOOP); // how a paused loop gets going again
            expect(entryOf(LOOP)).not.toBe(loop);
            expect(entryOf(LOOP).timeScale).toBe(1);

            await vi.runAllTimersAsync();
        });
    });

    it('playState dispatches to all spines that have an animation in that state', async () => {
        const hero = makeHero();
        const enemy = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero, enemy }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
            const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        await ctl.playSolo('a');
        await vi.runAllTimersAsync();

        expect(hero.__clearTracksCalls).toBeGreaterThan(0);
        expect(hero.__setAnimationCalls[0].name).toBe('a');
    });

    it('speed setter propagates to all spines', () => {
        const hero = createFakeSpine();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.speed = 2;

        expect(hero.state.timeScale).toBe(2);
        expect(ctl.speed).toBe(2);
    });

    it('setSpineSpeed paces one spine against the layout speed, leaving the others on it', () => {
        const hero = createFakeSpine();
        const villain = createFakeSpine();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero, villain }));

        ctl.setSpineSpeed('hero', 2);

        expect(hero.state.timeScale).toBe(2);
        expect(ctl.getSpineSpeed('hero')).toBe(2);
        expect(ctl.getSpineSpeed('villain')).toBe(1);

        // the layout-wide speed moves both — the paced spine stays twice as fast as the rest
        ctl.speed = 0.5;

        expect(hero.state.timeScale).toBe(1);
        expect(villain.state.timeScale).toBe(0.5);
    });

    it('play keeps a spine on its own speed instead of the layout speed', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);
        ctl.setSpineSpeed('hero', 2);

        const played = ctl.play('hero', 'a');

        expect(hero.state.timeScale).toBe(2);

        // and it resolves at the pace it is running at: a 1s animation at 2x is done in 500ms
        await vi.advanceTimersByTimeAsync(500);
        await expect(played).resolves.toBeUndefined();
    });

    it('setSpineSpeed hands a spine back to the layout pace when given 1', () => {
        const hero = createFakeSpine();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));

        ctl.setSpineSpeed('hero', 2);
        ctl.setSpineSpeed('hero', 1);
        ctl.speed = 0.5;

        expect(ctl.getSpineSpeed('hero')).toBe(1);
        expect(hero.state.timeScale).toBe(0.5);
    });

    it('pauseBySpineID sets timeScale to 0 on the target spine', () => {
        const hero = createFakeSpine();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        hero.state.timeScale = 1;
        ctl.pauseBySpineID('hero');
        expect(hero.state.timeScale).toBe(0);
    });

    it('stopAll clears tracks, resets pose, and empties registries on every spine', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 0.1 }] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
                { name: 'a', duration: 1, poses: ['bone:head'] },
                { name: 'b_loop', duration: 1, poses: ['bone:tail'] },
            ],
        });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const promise = ctl.playState('idle');
        await vi.runAllTimersAsync();
        await promise;

        await ctl.stopState('idle');
        expect(hero.__setupPoseCount).toBeGreaterThan(0);
    });

    describe('activeStates', () => {
        const scene = () => {
            const hero = createFakeSpine({
                animations: [
                    { name: 'state_init/enter', duration: 1 },
                    { name: 'state_landscape/wide', duration: 1, poses: ['bone:frame'] },
                    { name: 'state_portrait/tall', duration: 1, poses: ['bone:frame'] },
                    { name: 'state_idle/breathe_loop', duration: 1, poses: ['bone:chest'] },
                    { name: 'state_freeSpins/ambience_loop', duration: 2, poses: ['bone:fx'] },
                    { name: 'state_overlay/show', duration: 0.5, poses: ['slot:overlay'] },
                ],
            });
            const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
            ctl.registerSpine('hero', hero as never);

            return ctl;
        };

        it('lists the states played and not stopped since, oldest first, a replay moved last', async () => {
            const ctl = scene();

            void ctl.playState('idle');
            void ctl.playState('freeSpins');
            void ctl.playState('overlay');
            void ctl.stopState('overlay', false);
            void ctl.playState('idle');

            expect(ctl.activeStates()).toEqual(['freeSpins', 'idle']);

            await vi.runAllTimersAsync();
        });

        it('keeps a state whose one-shots finished: it is still what the scene was told to be in', async () => {
            const ctl = scene();

            void ctl.playState('overlay');
            await vi.runAllTimersAsync();

            expect(ctl.activeStates()).toEqual(['overlay']);
        });

        it("leaves out the layout's own states unless asked for them", async () => {
            const ctl = scene();

            void ctl.playState('init');
            void ctl.playState('landscape');
            void ctl.playState('idle');
            void ctl.playState('portrait');

            expect(ctl.activeStates()).toEqual(['idle']);
            expect(ctl.activeStates({ builtIn: true })).toEqual(['init', 'landscape', 'idle', 'portrait']);

            await vi.runAllTimersAsync();
        });

        it('ignores a state no skeleton authors, and empties on stopAll and clear', async () => {
            const ctl = scene();

            void ctl.playState('nothingLikeIt');
            void ctl.playState('idle');
            expect(ctl.activeStates()).toEqual(['idle']);

            ctl.stopAll();
            expect(ctl.activeStates()).toEqual([]);

            void ctl.playState('idle');
            ctl.clear();
            expect(ctl.activeStates()).toEqual([]);

            await vi.runAllTimersAsync();
        });
    });

    it('clear keeps the game listeners when asked to, and drops them by default', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);
        const heard: string[] = [];
        ctl.addEventListener('spin_click', () => heard.push('spin'));

        ctl.clear({ keepListeners: true });
        ctl.registerSpine('hero', hero as never); // the rebuilt scene
        void ctl.playEvent('spin_click', 'hero');
        expect(heard).toEqual(['spin']);

        ctl.clear();
        void ctl.playEvent('spin_click', 'hero');
        expect(heard).toEqual(['spin']);

        await vi.runAllTimersAsync();
    });

    it('clear empties all internal maps', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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

describe('AnimationsController – clear', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('resolves every play() still waiting on its animation, and holds no timer for it', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        let settled = false;
        void ctl.play('hero', 'state_idle/breathe').then(() => {
            settled = true;
        });

        ctl.clear();
        await vi.advanceTimersByTimeAsync(0);

        expect(settled).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
        expect(ctl.getActive()).toEqual([]);
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
        const ctl = new AnimationsController(fakeEngine, new Map());
        ctl.pause('missing', 'a');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('is a no-op when the animation is not currently tracked on the spine', () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        ctl.pause('hero', 'a');

        expect(hero.state.tracks.length).toBe(0);
        expect(hero.__worldTransformUpdates).toBe(0);
    });

    it('freezes the active track at its current trackTime', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, new Map());
        ctl.reset('missing', 'a');
        expect(err).toHaveBeenCalledWith('Spine missing not found');
    });

    it('clears the active track and restores bones+slots to setup pose', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'idle_loop');
        expect(ctl.getLooping()).toEqual(['hero']);

        ctl.reset('hero', 'idle_loop');

        expect(hero.__clearTrackCalls).toEqual([0]);

        await vi.runAllTimersAsync();
    });

    it('still resets the pose even when the animation is not tracked', () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 1 }] });
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');
        expect(soundsMock.playFX).toHaveBeenCalledWith('whoosh', false);

        ctl.stop('hero', 'a');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('hands only particles_<key>_start|_stop|_once to the particles, and plays any other particles_ event', () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        const handleEvent = vi.fn();
        ctl.particles = { handleEvent } as never;
        ctl.registerSpine('hero', hero as never);

        hero.triggerEvent('particles_sparks_once');
        hero.triggerEvent('particles_whoosh');

        expect(handleEvent).toHaveBeenCalledTimes(1);
        expect(handleEvent).toHaveBeenCalledWith('particles_sparks_once', 'hero');
        expect(soundsMock.playFX).toHaveBeenCalledWith('particles_whoosh', false);
        expect(soundsMock.playFX).toHaveBeenCalledTimes(1);
    });

    it('treats a *_loop event as a looping FX, not music, and stops it with the animation', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('music2', 'a');

        expect(soundsMock.playMusic).toHaveBeenCalledWith('music2');
        expect(soundsMock.playFX).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
    });

    it('routes an event with music anywhere in its name to the music channel', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('fs_music_loop', 'a');

        expect(soundsMock.playMusic).toHaveBeenCalledWith('fs_music');
        expect(soundsMock.playFX).not.toHaveBeenCalled();

        ctl.stop('hero', 'a');

        expect(soundsMock.stopFX).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
    });

    it('keeps an FX playing while another running animation also triggered it', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');

        ctl.reset('hero', 'a');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('stopState stops the FX triggered by the state animations', async () => {
        const hero = makeHero();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero, enemy }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero, enemy }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');

        ctl.clear();

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('unregisterSpine stops the FX that spine triggered', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        void ctl.play('hero', 'a');
        hero.triggerEvent('whoosh', 'a');

        ctl.unregisterSpine('hero');

        expect(soundsMock.stopFX).toHaveBeenCalledWith('whoosh');
        await vi.runAllTimersAsync();
    });

    it('re-triggers and re-stops the FX after the animation is replayed', async () => {
        const hero = makeSpineWithFX();
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const cb = vi.fn();
        ctl.addEventListener('real', cb);

        const promise = ctl.playEvent('real', 'hero', { eventName: 'spoofed' });
        await vi.runAllTimersAsync();
        await promise;

        expect(cb).toHaveBeenCalledWith('hero', hero, { eventName: 'real' });
    });

    it('multiple listeners on the same event are all invoked', async () => {
        const ctl = new AnimationsController(fakeEngine, new Map());

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
        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        ctl.registerSpine('hero', hero as never);

        const wildcard = vi.fn();
        ctl.addEventListener('*', wildcard);

        hero.triggerEvent('anything');
        await vi.runAllTimersAsync();

        expect(wildcard).toHaveBeenCalledTimes(1);
    });

    it('removeEventListener stops the callback from being called', async () => {
        const ctl = new AnimationsController(fakeEngine, new Map());

        const cb = vi.fn();
        ctl.addEventListener('win', cb);
        ctl.removeEventListener('win', cb);

        await ctl.playEvent('win', 'hero');
        await vi.runAllTimersAsync();

        expect(cb).not.toHaveBeenCalled();
    });

    it('removeEventListener removes only the specified listener, leaving others intact', async () => {
        const ctl = new AnimationsController(fakeEngine, new Map());

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
        const ctl = new AnimationsController(fakeEngine, new Map());
        expect(() => ctl.removeEventListener('nonexistent', vi.fn())).not.toThrow();
    });

    it('removeEventListener is a no-op when the function was never registered', async () => {
        const ctl = new AnimationsController(fakeEngine, new Map());

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
        const ctl = new AnimationsController(fakeEngine, new Map());
        await ctl.playLastFrame('missing', 'anim');
        expect(err).toHaveBeenCalledWith('Track spine not found');
    });

    it('seeks to the end of the animation via trackEntry.trackTime', async () => {
        const hero = createFakeSpine({ animations: [{ name: 'a', duration: 5 }] });

        const ctl = new AnimationsController(fakeEngine, asSpineMap({ hero }));
        await ctl.playLastFrame('hero', 'a');

        expect(hero.state.tracks[0]?.trackTime).toBe(5);
    });
});
