import { Physics, type Spine } from '@esotericsoftware/spine-pixi-v8';
import type {
    AnimationName,
    AnimationsRegistry,
    AnimationTrackRegistry,
    PlayOptions,
    SpineID,
} from '../config/types';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';
import { parcePointers } from '../config/parcePointers';
import { claimsCollide, EMPTY_CLAIM, poseClaims } from '../utils/poseClaims';
import { sounds } from './Sounds.controller';

type EventsListeners = Map<string, ((spineID: string, spine?: Spine, event?: unknown) => void)[]>;

export class AnimationsController {
    private animations: Map<SpineID, AnimationsRegistry> = new Map();
    private stateAnimations: Map<string, string[]> = new Map();
    private eventAnimations: Map<string, string[]> = new Map();
    private activeAnimations: Map<string, AnimationTrackRegistry> = new Map();
    private loopingAnimations: Map<string, AnimationTrackRegistry> = new Map();
    /**
     * FX started by a spine event, grouped by the animation whose timeline fired it
     * (`spineID -> animation -> fx names`), so stopping that animation can stop its FX.
     *
     * Music events (`music*`) are intentionally *not* tracked: a track keeps playing until
     * another one replaces it, regardless of the animation that started it.
     */
    private triggeredFX: Map<SpineID, Map<AnimationName, Set<string>>> = new Map();
    #eventsListeners: EventsListeners = new Map();
    #speed = 1;
    /**
     * How fast single spines run compared with the rest of the layout — a multiplier on
     * {@link speed}, `1` for everything not in here (see {@link setSpineSpeed}). Kept here
     * rather than left on the spine because every {@link play} re-applies the layout's speed
     * to the spine it plays on, so a `timeScale` set from the outside would be overwritten by
     * the next animation.
     */
    #spineSpeeds: Map<SpineID, number> = new Map();

    constructor(private spines: Map<SpineID, Spine>) { }

    // ─── Registration ────────────────────────────────────────────────────────────

    /** Registers a spine instance, wiring up its animation metadata and event listeners. */
    registerSpine(spineID: string, spine: Spine) {
        spine.state.addListener({
            event: (entry, event) => {
                // NB: don't JSON.stringify(event.data) — since spine-pixi-v8 4.3.7, EventData
                // holds a `setupPose: Event` whose `.data` points back to it, so the EventData
                // is circular. Log the fired event's runtime values instead.
                const { time, intValue, floatValue, stringValue, volume, balance } = event;
                log.add(
                    LOG.EVENT,
                    spineID,
                    `${event.data.name} -> ${JSON.stringify({ time, intValue, floatValue, stringValue, volume, balance })}`,
                );

                if ('vibrate' in navigator && event.data.name.startsWith('vibration_')) {
                    const duration = parseInt(event.data.name.replace('vibration_', ''), 10);
                    if (!isNaN(duration) && duration > 0) {
                        navigator.vibrate(duration);
                        log.add(LOG.EVENT, spineID, `Vibration for ${duration}ms`);
                    }
                }

                // Any event with `music` in its name is a music track: it loops on the music
                // channel until another track replaces it, so it needs no `_loop` modifier.
                // The suffix is still stripped so older events (`fs_music_loop`) resolve to
                // their file (`fs_music`). Everything else is FX owned by the animation that
                // fired it, where `_loop` marks a looping FX (`spin_loop`) that would
                // otherwise loop on forever after its animation stops.
                const looping = event.data.name.endsWith(parcePointers.mod.loop);
                const sound = looping
                    ? event.data.name.slice(0, -parcePointers.mod.loop.length)
                    : event.data.name;

                if (sound.includes(parcePointers.sound.music)) {
                    sounds.playMusic(sound);
                } else {
                    sounds.playFX(sound, looping);
                    // remember which animation owns this FX so `stop`/`reset` can cut it short
                    this.rememberTriggeredFX(spineID, entry?.animation?.name, sound);
                }

                // playEvent already notifies the named listeners — dispatching
                // them here as well would call every listener twice per event
                this.playEvent(event.data.name, spineID);

                this.#eventsListeners
                    .get('*')
                    ?.forEach((cb) => cb(spineID, spine, event.data));

                // TODO: this should be handled inside spineLayout
            },
        });

        spine.state.data.skeletonData.animations.forEach((a) => {
            const animation = a.name;
            const noMod = this.stripModificators(animation);

            if (!this.animations.has(noMod)) {
                log.add(LOG.SPINES, spineID, noMod);
                this.animations.set(noMod, new Map());
            }

            if (animation.startsWith(parcePointers.folder.state)) {
                const stateName = this.getStateName(noMod);
                if (!stateName) {
                    console.warn(`Animation ${noMod} does not have a state name.`);
                    return;
                }
                const list = this.stateAnimations.get(stateName) ?? [];
                if (!list.includes(noMod)) {
                    list.push(noMod);
                    log.add(LOG.STATES, spineID, `${stateName} -> ${noMod}`);
                    this.stateAnimations.set(stateName, list);
                }
            }

            if (animation.startsWith(parcePointers.folder.event)) {
                const eventName = this.getEventName(noMod);
                if (!eventName) {
                    console.warn(`Animation ${noMod} does not have an event name.`);
                    return;
                }

                const list = this.eventAnimations.get(eventName) ?? [];
                if (!list.includes(noMod)) {
                    list.push(noMod);
                    log.add(LOG.EVENTS, spineID, `${eventName} -> ${noMod}`);
                    this.eventAnimations.set(eventName, list);
                }
            }

            const spineAnims = this.animations.get(noMod)?.get(spineID) ?? [];
            spineAnims.push(animation);
            this.animations.get(noMod)?.set(spineID, spineAnims);
        });

        spine.state.data.skeletonData.events.forEach((event) => {
            log.add(LOG.SPINE_EVENTS, spineID, event.name);
        });
    }

    /** Removes a spine from the animation registries (the inverse of `registerSpine`). */
    unregisterSpine(spineID: string) {
        this.animations.forEach((registry) => registry.delete(spineID));
        this.activeAnimations.delete(spineID);
        this.loopingAnimations.delete(spineID);
        this.stopAllTriggeredFX(spineID);
    }

    // ─── Getters ─────────────────────────────────────────────────────────────────

    /** Returns all registered animation names (without modifiers). */
    getAll(): string[] {
        return Array.from(this.animations.keys());
    }
    /**
     * Returns a map of spineID → the animation names (without modifiers) that spine holds,
     * for each spine that has any. An animation authored in several spine files appears
     * under each of them — which is exactly what {@link playByName} plays it on.
     */
    getBySpine(): Map<SpineID, string[]> {
        const result = new Map<SpineID, string[]>();

        this.spines.forEach((_, spineID) => {
            const names: string[] = [];
            this.animations.forEach((registry, animation) => {
                if (registry.has(spineID)) names.push(animation);
            });
            if (names.length > 0) result.set(spineID, names);
        });

        return result;
    }
    /** Returns all registered state names (from `state_<name>/` folders). */
    getStates(): string[] {
        return Array.from(this.stateAnimations.keys());
    }
    /** Returns all registered event names (from `event_<name>/` folders). */
    getEvents(): string[] {
        return Array.from(this.eventAnimations.keys());
    }
    /** Returns the names of all currently playing (non-looping) animations. */
    getActive(): string[] {
        return Array.from(this.activeAnimations.keys());
    }
    /** Returns the names of all currently looping animations. */
    getLooping(): string[] {
        return Array.from(this.loopingAnimations.keys());
    }

    // ─── Event listeners ─────────────────────────────────────────────────────────

    /** Subscribes a callback to a named Spine skeleton event. Use `'*'` to listen to all events. Multiple listeners per event are supported. */
    addEventListener(event: string, fn: (event: unknown) => void) {
        if (!this.#eventsListeners.has(event)) this.#eventsListeners.set(event, []);
        this.#eventsListeners.get(event)!.push(fn);
    }

    /** Removes a previously registered event listener. */
    removeEventListener(event: string, fn: (event: unknown) => void) {
        const listeners = this.#eventsListeners.get(event);
        if (!listeners) return;
        const index = listeners.indexOf(fn as (spineID: string, spine?: Spine, event?: unknown) => void);
        if (index !== -1) listeners.splice(index, 1);
    }

    // ─── Playback ────────────────────────────────────────────────────────────────

    /**
     * Plays all animations grouped under the given state name (e.g. `"idle"` triggers every
     * animation in `state_idle/`).
     *
     * Where each animation lands is decided by {@link allocateTrack} from what it poses — a
     * state that has to outrank whatever else is on the spine does so because it claims the
     * same properties, not because a caller reserved an index for it.
     */
    async playState(stateName: string) {
        const logName = `${LOG.STATE} [${stateName}]`;
        log.open(logName);

        const promises: Promise<void>[] = [];

        this.stateAnimations.get(stateName)?.forEach((animation) => {
            this.animations.get(animation)?.forEach((animations, spineID) => {
                animations.forEach(async (animation) => {
                    promises.push(this.play(spineID, animation));
                    log.add(logName, spineID, `${stateName} -> ${animation}`);
                });
            });
        });

        // Printed on dispatch, not on completion: `play()` resolves only when the animation
        // ends, so closing after the await held the table back for the state's whole duration
        // and printed it after everything dispatched in the meantime — `init`, whose animations
        // are the longest, landing in the console below the events that came after it. Closing
        // here also keeps open→add→close synchronous, so two overlapping calls for the same
        // state can't share the label and wipe each other's rows.
        log.close(logName);

        await Promise.all(promises);
    }

    /** Stops all animations grouped under the given state name. And resets all elements the their initial state. */
    async stopState(stateName: string, resetPose = true) {
        const logName = `${LOG.STATE} [${stateName}] stop`;
        log.open(logName);

        const affectedSpineIDs = new Set<SpineID>();

        this.stateAnimations.get(stateName)?.forEach((animation) => {
            this.animations.get(animation)?.forEach((animations, spineID) => {
                animations.forEach((animation) => {
                    this.stop(spineID, animation);
                    affectedSpineIDs.add(spineID);
                    log.add(logName, spineID, `${stateName} -> ${animation}`);
                });
            });
        });

        if (resetPose) {
            affectedSpineIDs.forEach((spineID) => {
                this.spines.get(spineID)?.skeleton.setupPose();
            });
        }

        log.close(logName);
    }

    /**
     * Plays all animations grouped under the given event name and notifies registered listeners.
     *
     * `payload` is merged into the object handed to the listeners alongside `eventName`, so
     * synthetic events can carry context (e.g. a text change's previous and next value).
     * `eventName` is applied last and always wins, so a payload can never spoof it.
     */
    async playEvent(eventName: string, spineID: string, payload?: Record<string, unknown>) {
        const logName = `${LOG.EVENT} [${eventName}]`;
        log.open(logName);

        const promises: Promise<void>[] = [];

        this.#eventsListeners.get(eventName)?.forEach((cb) => {
            cb(spineID, this.spines.get(spineID), { ...payload, eventName });
        });

        this.eventAnimations.get(eventName)?.forEach((animation) => {
            this.animations.get(animation)?.forEach((animations, spineID) => {
                animations.forEach(async (animation) => {
                    promises.push(this.play(spineID, animation));
                    log.add(logName, spineID, `${eventName} -> ${animation}`);
                });
            });
        });

        // Closed on dispatch for the same reason as `playState` — and here the label repeats
        // constantly (`spin_click` every round), so a group left open across the await was
        // routinely reopened, and wiped, by the next fire of the same event.
        log.close(logName);

        await Promise.all(promises);
    }

    /**
     * Plays the named animation on every spine that has it. Pass `playSolo=true` to stop all
     * other animations first, and `onSpineID` to play it on that one file alone — the same
     * animation authored in several files is otherwise indivisible from the outside.
     */
    async playByName(animationName: string, playSolo = false, onSpineID?: SpineID) {
        const promises: Promise<void>[] = [];

        this.animations.get(animationName)?.forEach((animations, spineID) => {
            if (onSpineID !== undefined && spineID !== onSpineID) return;
            animations.forEach(async (animation) => {
                promises.push(this.play(spineID, animation, playSolo));
                log.add(LOG.PLAY_ANIMATION, spineID, `${animationName} -> ${animation}`);
            });
        });

        await Promise.all(promises);
    }

    /** Stops all running animations, then plays the named animation on all spines that have it. */
    async playSolo(animationName: string) {
        this.stopAll();
        this.playByName(animationName);
    }

    /**
     * Picks the track an animation plays on. Callers never choose one.
     *
     * A track is a *claim* on a set of skeleton properties — the bone and slot properties the
     * animation's timelines actually write (see {@link poseClaims}). Allocation upholds one
     * invariant: **nothing that poses the same properties is ever left on a track above this
     * one.** Higher tracks are applied last and win, so a stale entry above would silently
     * override the animation that just started.
     *
     * - **A colliding track is taken over.** Alternatives of the same thing — a panel's
     *   `show`/`hide`, a button's `hover`/`down`/`up`/`out` — therefore take turns on one
     *   track instead of stacking, and a finished one can never hold its end pose over its
     *   own successor.
     * - **Several colliding tracks: the highest wins, the lower ones are stopped.** They are
     *   superseded for the properties at stake, and leaving them would recreate the masking
     *   this exists to prevent.
     * - **No collision: the lowest free track, else a new one on top.** An independent layer
     *   (a spin button held hidden for a whole feature, a win counter) keeps its own track
     *   and is never evicted by an unrelated animation that merely started later.
     *
     * This replaces counting the registries. A count moves with how many animations happen
     * to be running, and finished-but-uncleared entries keep applying their end pose, so
     * indices got recycled while still occupied: a popup's fade-in could land *under* the
     * fade-out that closed the previous one (invisible popup), or land *on* an unrelated
     * state's track and evict a pose that was meant to hold.
     */
    private allocateTrack(spineID: SpineID, spine: Spine, animation: string): number {
        const claims = poseClaims(spine.state.data.skeletonData);
        const claim = claims.get(animation) ?? EMPTY_CLAIM;
        const tracks = spine.state.tracks;
        const colliding: number[] = [];

        for (let index = 0; index < tracks.length; index++) {
            const running = tracks[index]?.animation?.name;
            if (!running) continue;
            if (claimsCollide(claim, claims.get(running) ?? EMPTY_CLAIM)) colliding.push(index);
        }

        const owner = colliding.pop();

        if (owner !== undefined) {
            colliding.forEach((index) => this.evictTrack(spineID, spine, index));
            return owner;
        }

        const free = tracks.findIndex((entry) => !entry);

        return free === -1 ? tracks.length : free;
    }

    /**
     * Puts a spine back to its setup pose before a track is taken over, in the one case Spine
     * cannot undo the animation being replaced.
     *
     * A replaced animation is given one last apply, in which every property it posed and its
     * replacement does not is driven back to the setup pose. That is what makes an animation
     * which only *fades a slot out* safe to replace with one that never mentions that slot —
     * a symbol's `inactive`, which takes the sharp art's alpha to zero, replaced by its `idle`,
     * which only re-attaches the art.
     *
     * An entry replaced in the same frame it was set never gets that apply. Three entries then
     * sit in one mix chain, and the middle one is mixed out against the pose standing on the
     * skeleton rather than against the setup pose, which leaves it applied: the symbol's art is
     * attached, at the alpha `inactive` left it on, and the cell is empty until something poses
     * that alpha again.
     *
     * Two poses in one frame is not a caller's mistake to avoid. The win presentation re-poses
     * the board on a timer and a press of the spin button poses it back to `idle`, and the two
     * land in the same frame whenever the press falls on the wrong moment — so the unapplied
     * entry is dropped and the pose put back here instead, which is what Spine's own undo pass
     * would have left behind. The tracks that are still live re-apply over it on the next
     * update, before anything is drawn.
     *
     * An unapplied entry replaced by *its own animation* is left alone: Spine's `setAnimation`
     * drops such an entry itself instead of mixing from it, and an entry that never applied
     * left nothing on the skeleton to undo. The reset here would wipe poses set from outside
     * the animation state, which no live track re-applies. That is how a payline placed by
     * hand ended up drawn from the skeleton origin — the middle of the screen: in a hidden tab
     * the ticker never applies `show`, while the win loop, on wall-clock timers, keeps
     * replaying it, and each replay snapped the point bones back to the setup pose.
     */
    private undoUnappliedEntry(spine: Spine, track: number, animation: string) {
        const entry = spine.state.tracks[track];

        // every apply stamps `nextTrackLast`, so -1 is an entry that has not had one
        if (!entry || entry.nextTrackLast !== -1) return;
        if (entry.animation?.name === animation) return;

        spine.state.clearTrack(track);
        spine.skeleton.setupPoseBones();
        spine.skeleton.setupPoseSlots();
    }

    /**
     * Stops whatever holds a track, so a superseded entry stops applying its pose.
     *
     * Routed through {@link stop} rather than a bare `clearTrack` so the animation also
     * leaves the active/looping registries and its triggered FX are cut — an evicted
     * looping animation would otherwise keep its sound running with nothing on screen.
     */
    private evictTrack(spineID: SpineID, spine: Spine, index: number) {
        const animation = spine.state.tracks[index]?.animation?.name;

        if (animation) this.stop(spineID, animation);
        else spine.state.clearTrack(index);
    }

    /** Plays a specific animation on a single spine by ID. Resolves when the animation completes (looping animations resolve immediately). */
    async play(
        spineID: string,
        animation: string,
        playSolo = false,
        options?: PlayOptions,
    ): Promise<void> {
        const mod = Object.values(parcePointers.mod).filter((m) => animation.includes(m));
        const spine = this.spines.get(spineID);
        let nextAnimation: string | undefined;

        if (mod.includes(parcePointers.mod.next)) {
            nextAnimation = animation.match(/next_(\w+)_?/)?.[1];
            animation.replace(/next_\w+_?/g, '');
        }

        if (!spine) {
            console.error(`Spine ${spineID} not found`);
            return;
        }
        // An already-running animation is not restarted from zero — unless the caller asks
        // for it (see `PlayOptions.restart`).
        if (
            !options?.restart &&
            this.activeAnimations.get(spineID)?.get(animation) !== undefined
        ) {
            return;
        }

        const loop = mod.includes(parcePointers.mod.loop);

        if (playSolo) {
            if (this.activeAnimations.has(spineID) || this.loopingAnimations.has(spineID)) {
                this.stopAllForSpine(spineID);
            }
        }

        const playTrack = this.allocateTrack(spineID, spine, animation);

        this.undoUnappliedEntry(spine, playTrack, animation);
        spine.state.setAnimation(playTrack, animation, loop);
        spine.state.timeScale = this.timeScaleFor(spineID);

        if (!playSolo) {
            if (loop) this.addLoopingAnimation(spineID, animation, playTrack);
            else this.addActiveAnimation(spineID, animation, playTrack);
        }

        const track = ` track ${playTrack}${playSolo ? ' (solo)' : ''}`;
        let logString = `🎬 ${spineID}(${animation})${track}`;
        if (nextAnimation) logString += `, next ${nextAnimation}`;

        log.add(LOG.PLAY_ANIMATION, spineID, logString);

        const animationData = spine.state.data.skeletonData.findAnimation(animation);

        return new Promise<void>((resolve) => {
            if (animationData) {
                const duration = animationData.duration / spine.state.timeScale;

                setTimeout(() => {
                    this.removeActiveAnimation(spineID, animation);
                    resolve();
                }, duration * 1000);
            } else {
                resolve();
            }
        }).then(() => {
            if (nextAnimation) this.playByName(nextAnimation, playSolo);
        });
    }

    /** Plays an animation then immediately seeks to its last frame, effectively showing the end pose. */
    async playLastFrame(spineID: string, animation: string, playSolo = false) {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.error('Track spine not found');
            return;
        }

        const mod = Object.values(parcePointers.mod).filter((m) => animation.includes(m));
        const loop = mod.includes(parcePointers.mod.loop);

        if (
            playSolo &&
            (this.activeAnimations.has(spineID) || this.loopingAnimations.has(spineID))
        ) {
            this.stopAllForSpine(spineID);
        }

        const playTrack = this.allocateTrack(spineID, spine, animation);

        this.undoUnappliedEntry(spine, playTrack, animation);
        spine.state.setAnimation(playTrack, animation, loop);
        // the entry just set, not track 0 — allocation picks the track from what the
        // animation poses, so it is only track 0 when nothing else claims those properties
        const trackEntry = spine.state.getTrack(playTrack);

        if (trackEntry) {
            trackEntry.trackTime = trackEntry.animationEnd;
            spine.skeleton.updateWorldTransform(Physics.update);
        }
    }

    // ─── Stop / Pause ────────────────────────────────────────────────────────────

    /** Stops all animations on all spines and resets them to their setup pose. */
    stopAll() {
        this.spines.forEach((spine, spineID) => {
            if (spine?.state) {
                spine.state.clearTracks();
                spine.skeleton.setupPose();
            }
            this.activeAnimations.delete(spineID);
            this.loopingAnimations.delete(spineID);
        });
        this.stopAllTriggeredFX();
    }

    /** Stops all animations on a specific spine and resets it to the setup pose. */
    stopAllForSpine(spineID: string) {
        const spine = this.spines.get(spineID);
        if (!spine) return;
        spine.state.clearTracks();
        spine.skeleton.setupPose();
        this.activeAnimations.delete(spineID);
        this.loopingAnimations.delete(spineID);
        this.stopAllTriggeredFX(spineID);
    }

    /** Stops a specific animation on a specific spine, clearing its track. */
    stop(spineID: string, animation: string) {
        const spineState = this.spines.get(spineID)?.state;
        if (!spineState) {
            console.error(`Spine ${spineID} not found`);
            return;
        }
        log.log(`spine stop: ${spineID}(${animation})`);

        const track = this.activeAnimations.get(spineID)?.get(animation);
        if (track !== undefined) spineState.clearTrack(track);

        const loopingTrack = this.loopingAnimations.get(spineID)?.get(animation);
        if (loopingTrack !== undefined) spineState.clearTrack(loopingTrack);

        // a finished animation leaves the registries but its end pose keeps
        // applying on its track — scan the actual tracks so stale entries are
        // cleared too, not just the currently registered ones
        spineState.tracks.forEach((trackEntry, index) => {
            if (trackEntry?.animation?.name === animation) {
                spineState.clearTrack(index);
            }
        });

        this.removeLoopingAnimation(spineID, animation);
        this.removeActiveAnimation(spineID, animation);
        this.stopTriggeredFX(spineID, animation);
    }

    /**
     * Pauses every animation belonging to the given state, on every spine that holds it.
     *
     * Implemented per-animation (via `pauseAnimation`) — *not* by freezing the whole spine —
     * so unrelated tracks on the same spine keep advancing and subsequent `setAnimation`
     * calls (e.g. `showGame` after `hideGame`) animate normally.
     */
    pauseState(stateName: string) {
        this.stateAnimations.get(stateName)?.forEach((noModAnimation) => {
            this.animations.get(noModAnimation)?.forEach((fullAnimations, spineID) => {
                fullAnimations.forEach((fullAnimation) => {
                    this.pause(spineID, fullAnimation);
                });
            });
        });
    }

    /** Pauses a specific spine by setting its `timeScale` to 0. Resume by setting `speed` or calling `setAnimation` again. */
    pauseBySpineID(spineID: string) {
        const spine = this.spines.get(spineID);
        if (!spine) return;
        spine.state.timeScale = 0;
    }

    /**
     * Pauses a single animation on a specific spine, freezing it at its current frame.
     *
     * Locates the track entry by scanning `spine.state.tracks` for one whose animation name
     * matches, so this still works after the animation has completed and been removed from
     * the internal registry. Sets `trackEntry.timeScale = 0` and clamps `trackEnd` so the
     * entry stops advancing. Other tracks on the same spine are unaffected.
     */
    pause(spineID: string, animation: string) {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.error(`Spine ${spineID} not found`);
            return;
        }

        for (let i = 0; i < spine.state.tracks.length; i++) {
            const trackEntry = spine.state.tracks[i];
            if (trackEntry?.animation?.name !== animation) continue;

            const frozenTime = trackEntry.trackTime;
            trackEntry.timeScale = 0;
            trackEntry.trackEnd = frozenTime;
            spine.skeleton.updateWorldTransform(Physics.update);

            log.log(`spine pause: ${spineID}(${animation}) @ ${frozenTime.toFixed(2)}s`);
            return;
        }
    }

    /**
     * Resets a single animation on a specific spine back to its setup pose.
     *
     * Scans `spine.state.tracks` and clears every track holding the named animation —
     * this is necessary because a non-looping animation that has finished is still applied
     * on its track (at its end pose) until explicitly cleared, even though it's no longer
     * in `activeAnimations`. Then resets bones+slots to setup pose and forces a transform
     * update so the change shows immediately.
     */
    reset(spineID: string, animation: string) {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.error(`Spine ${spineID} not found`);
            return;
        }

        spine.state.tracks.forEach((trackEntry, index) => {
            if (trackEntry?.animation?.name === animation) {
                spine.state.clearTrack(index);
            }
        });

        spine.skeleton.setupPoseBones();
        spine.skeleton.setupPoseSlots();
        // a zero-delta update instead of a bare updateWorldTransform: it also
        // re-applies the remaining tracks and syncs slot-object children
        // (nested spines follow the spine's ticker update, so without this
        // they keep their stale transforms until the next tick and the reset
        // shows up one rendered frame late)
        spine.update(0);

        this.removeActiveAnimation(spineID, animation);
        this.removeLoopingAnimation(spineID, animation);
        this.stopTriggeredFX(spineID, animation);
    }

    // ─── Speed ───────────────────────────────────────────────────────────────────

    set speed(value: number) {
        this.#speed = value;
        this.spines.forEach((spine, spineID) => {
            // a spine given a pace of its own keeps it, measured against the new layout
            // speed — that pace says how it runs compared with everything else, so moving
            // the layout moves it too
            spine.state.timeScale = this.timeScaleFor(spineID);
        });
    }

    get speed(): number {
        return this.#speed;
    }

    /**
     * Runs one spine faster or slower than the rest of the layout — what a game needs when a
     * single skeleton has to speed up on its own (reels on a fast spin setting) while
     * everything around it keeps playing as authored.
     *
     * `value` is a multiplier on the layout-wide {@link speed}, not a replacement for it: `2`
     * is twice whatever the layout is running at, so moving {@link speed} still moves this
     * spine with it. `1` hands the spine back to the layout's own pace.
     *
     * Applied at once and re-applied by every {@link play} on that spine, so it holds across
     * the animations that follow instead of lasting only until the next one starts. It is the
     * *spine's* scale, so a `play()` on it also resolves at the pace it is running at.
     */
    setSpineSpeed(spineID: SpineID, value: number) {
        const spine = this.spines.get(spineID);

        if (!spine) {
            console.error(`Spine ${spineID} not found`);
            return;
        }

        if (value === 1) this.#spineSpeeds.delete(spineID);
        else this.#spineSpeeds.set(spineID, value);

        spine.state.timeScale = this.timeScaleFor(spineID);
    }

    /** How fast a spine runs compared with the rest of the layout — `1` unless it was given a pace. */
    getSpineSpeed(spineID: SpineID): number {
        return this.#spineSpeeds.get(spineID) ?? 1;
    }

    /** The `timeScale` a spine actually runs on: the layout's speed at that spine's own pace. */
    private timeScaleFor(spineID: SpineID): number {
        return this.#speed * this.getSpineSpeed(spineID);
    }

    // ─── Track management (private) ──────────────────────────────────────────────

    private addActiveAnimation(spineID: string, animation: string, trackID: number) {
        const map = this.activeAnimations.get(spineID) ?? new Map<AnimationName, number>();
        map.set(animation, trackID);
        this.activeAnimations.set(spineID, map);
    }

    private removeActiveAnimation(spineID: string, animation: string) {
        this.activeAnimations.get(spineID)?.delete(animation);
    }

    private addLoopingAnimation(spineID: string, animation: string, trackID: number) {
        const map = this.loopingAnimations.get(spineID) ?? new Map<AnimationName, number>();
        map.set(animation, trackID);
        this.loopingAnimations.set(spineID, map);
    }

    private removeLoopingAnimation(spineID: string, animation: string) {
        this.loopingAnimations.get(spineID)?.delete(animation);
    }

    // ─── Animation-triggered FX (private) ────────────────────────────────────────

    private rememberTriggeredFX(spineID: SpineID, animation: string | undefined, fx: string) {
        if (!animation) return;

        const perAnimation = this.triggeredFX.get(spineID) ?? new Map<AnimationName, Set<string>>();
        const fxNames = perAnimation.get(animation) ?? new Set<string>();

        fxNames.add(fx);
        perAnimation.set(animation, fxNames);
        this.triggeredFX.set(spineID, perAnimation);
    }

    /**
     * Stops the FX this animation's timeline started — the inverse of the event listener's
     * `playFX` — and forgets them. A long one-shot is cut short instead of outliving the
     * animation that triggered it.
     *
     * FX another *still-running* animation also triggered are left playing: `Sounds` keeps one
     * instance per FX name, so stopping it here would cut the other animation's audio too.
     * Called after the animation has left `activeAnimations`/`loopingAnimations`, so an
     * animation never counts as holding its own FX.
     */
    private stopTriggeredFX(spineID: SpineID, animation: string) {
        const fxNames = this.triggeredFX.get(spineID)?.get(animation);
        if (!fxNames) return;

        this.triggeredFX.get(spineID)!.delete(animation);

        fxNames.forEach((fx) => {
            if (this.isFXHeldByRunningAnimation(fx)) return;
            sounds.stopFX(fx);
        });
    }

    /** Stops the FX triggered by every animation of a spine, or of all spines when omitted. */
    private stopAllTriggeredFX(spineID?: SpineID) {
        const spineIDs = spineID ? [spineID] : Array.from(this.triggeredFX.keys());

        spineIDs.forEach((id) => {
            Array.from(this.triggeredFX.get(id)?.keys() ?? []).forEach((animation) =>
                this.stopTriggeredFX(id, animation),
            );
            this.triggeredFX.delete(id);
        });
    }

    private isFXHeldByRunningAnimation(fx: string): boolean {
        return Array.from(this.triggeredFX).some(([spineID, perAnimation]) =>
            Array.from(perAnimation).some(
                ([animation, fxNames]) =>
                    fxNames.has(fx) &&
                    (this.activeAnimations.get(spineID)?.has(animation) ||
                        this.loopingAnimations.get(spineID)?.has(animation)),
            ),
        );
    }

    // ─── Name parsing (private) ──────────────────────────────────────────────────

    private getStateName(animationName: string): string | undefined {
        const split = animationName.split('/');
        if (split[0].startsWith(parcePointers.folder.state))
            return split[0].replace(parcePointers.folder.state, '');
    }

    private getEventName(animationName: string): string | undefined {
        const split = animationName.split('/');
        if (split[0].startsWith(parcePointers.folder.event))
            return split[0].replace(parcePointers.folder.event, '');
    }

    private stripModificators(animationName: string): string {
        const mod = Object.values(parcePointers.mod).find((m) => animationName.includes(m));
        return mod ? animationName.split(mod)[0] : animationName;
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────────────

    clear() {
        this.animations.clear();
        this.stateAnimations.clear();
        this.eventAnimations.clear();
        this.activeAnimations.clear();
        this.loopingAnimations.clear();
        // after the registries are cleared, so nothing counts as still holding its FX
        this.stopAllTriggeredFX();
        this.#eventsListeners.clear();
        this.#speed = 1;
        this.#spineSpeeds.clear();
    }
}
