import { Physics, type Spine } from '@esotericsoftware/spine-pixi-v8';
import type {
    AnimationName,
    AnimationsRegistry,
    AnimationTrackRegistry,
    SpineID,
} from '../config/types';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';
import { parcePointers } from '../config/parcePointers';
import { sounds } from './Sounds.controller';

type EventsListeners = Map<string, ((spineID: string, spine?: Spine, event?: unknown) => void)[]>;

export class AnimationsController {
    private animations: Map<SpineID, AnimationsRegistry> = new Map();
    private stateAnimations: Map<string, string[]> = new Map();
    private eventAnimations: Map<string, string[]> = new Map();
    private activeAnimations: Map<string, AnimationTrackRegistry> = new Map();
    private loopingAnimations: Map<string, AnimationTrackRegistry> = new Map();
    #eventsListeners: EventsListeners = new Map();
    #speed = 1;

    constructor(private spines: Map<SpineID, Spine>) { }

    // ─── Registration ────────────────────────────────────────────────────────────

    /** Registers a spine instance, wiring up its animation metadata and event listeners. */
    registerSpine(spineID: string, spine: Spine) {
        spine.state.addListener({
            event: (_, event) => {
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

                if (event.data.name.endsWith('_loop')) {
                    sounds.playMusic(event.data.name.slice(0, -5))
                } else {
                    sounds.playFX(event.data.name);
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
    }

    // ─── Getters ─────────────────────────────────────────────────────────────────

    /** Returns all registered animation names (without modifiers). */
    getAll(): string[] {
        return Array.from(this.animations.keys());
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

    /** Plays all animations grouped under the given state name (e.g. `"idle"` triggers every animation in `state_idle/`). */
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

        await Promise.all(promises);
        log.close(logName);
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

        await Promise.all(promises);
        log.close(logName);
    }

    /** Plays the named animation on every spine that has it. Pass `playSolo=true` to stop all other animations first. */
    async playByName(animationName: string, playSolo = false, trackID?: number) {
        const promises: Promise<void>[] = [];

        this.animations.get(animationName)?.forEach((animations, spineID) => {
            animations.forEach(async (animation) => {
                promises.push(this.play(spineID, animation, playSolo, trackID));
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
     * Computes the next free track index for a spine.
     *
     * Tracks are allocated as `activeAnimations.size + loopingAnimations.size`.
     * Because finished non-looping animations remove themselves from `activeAnimations`
     * (via the completion timer), the index naturally recycles to the lowest free slot.
     * The resulting `state.setAnimation(track, …)` then *replaces* the previous, finished
     * entry on the Spine track rather than stacking a new track on top of stale end poses.
     *
     * If we used a monotonically-incrementing counter instead, each completed animation's
     * end pose would keep being applied on its own track forever (until `clearTrack`),
     * leading to visible artifacts like "the finish-line bones never disappear".
     */
    private getTrackID(spineID: SpineID): number {
        const active = this.activeAnimations.get(spineID)?.size ?? 0;
        const looping = this.loopingAnimations.get(spineID)?.size ?? 0;
        return active + looping;
    }

    /** Plays a specific animation on a single spine by ID. Resolves when the animation completes (looping animations resolve immediately). */
    async play(
        spineID: string,
        animation: string,
        playSolo = false,
        trackID?: number,
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
        if (this.activeAnimations.get(spineID)?.get(animation) !== undefined) return;

        const loop = mod.includes(parcePointers.mod.loop);

        if (playSolo) {
            if (this.activeAnimations.has(spineID) || this.loopingAnimations.has(spineID)) {
                this.stopAllForSpine(spineID);
            }
        }

        const playTrack = trackID ?? this.getTrackID(spineID);

        spine.state.setAnimation(playTrack, animation, loop);
        spine.state.timeScale = this.#speed;

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
            if (nextAnimation) this.playByName(nextAnimation, playSolo, trackID);
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

        const playTrack = this.getTrackID(spineID);

        spine.state.setAnimation(playTrack, animation, loop);
        const trackEntry = spine.state.getTrack(0);

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
    }

    /** Stops all animations on a specific spine and resets it to the setup pose. */
    stopAllForSpine(spineID: string) {
        const spine = this.spines.get(spineID);
        if (!spine) return;
        spine.state.clearTracks();
        spine.skeleton.setupPose();
        this.activeAnimations.delete(spineID);
        this.loopingAnimations.delete(spineID);
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
    }

    // ─── Speed ───────────────────────────────────────────────────────────────────

    set speed(value: number) {
        this.#speed = value;
        this.spines.forEach((spine) => {
            spine.state.timeScale = value;
        });
    }

    get speed(): number {
        return this.#speed;
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
        this.#eventsListeners.clear();
        this.#speed = 1;
    }
}
