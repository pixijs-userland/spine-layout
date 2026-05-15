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

export class AnimationsController {
    private animations: Map<SpineID, AnimationsRegistry> = new Map();
    private stateAnimations: Map<string, string[]> = new Map();
    private eventAnimations: Map<string, string[]> = new Map();
    private activeAnimations: Map<string, AnimationTrackRegistry> = new Map();
    private loopingAnimations: Map<string, AnimationTrackRegistry> = new Map();
    private activeTracks: Map<SpineID, number> = new Map();
    #eventsListeners: Map<string, ((spineID: string, spine?: Spine, event?: unknown) => void)[]> =
        new Map();
    #speed = 1;

    constructor(private spines: Map<SpineID, Spine>) { }

    // ─── Registration ────────────────────────────────────────────────────────────

    /** Registers a spine instance, wiring up its animation metadata and event listeners. */
    registerSpine(spineID: string, spine: Spine) {
        spine.state.addListener({
            event: (_, event) => {
                log.add(LOG.EVENT, spineID, `${event.data.name} -> ${JSON.stringify(event.data)}`);

                if ('vibrate' in navigator && event.data.name.startsWith('vibration_')) {
                    const duration = parseInt(event.data.name.replace('vibration_', ''), 10);
                    if (!isNaN(duration) && duration > 0) {
                        navigator.vibrate(duration);
                        log.add(LOG.EVENT, spineID, `Vibration for ${duration}ms`);
                    }
                }

                this.playEvent(event.data.name, spineID);

                this.#eventsListeners
                    .get(event.data.name)
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
    }

    // ─── Getters ─────────────────────────────────────────────────────────────────

    /** Returns all registered animation names (without modifiers). */
    getAall(): string[] {
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

    /** Subscribes a callback to a named Spine skeleton event. Multiple listeners per event are supported. */
    addEventListener(event: string, fn: (event: unknown) => void) {
        if (!this.#eventsListeners.has(event)) this.#eventsListeners.set(event, []);
        this.#eventsListeners.get(event)!.push(fn);
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
                    promises.push(this.playInstanceAnimation(spineID, animation));
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
                    this.stopAnimation(spineID, animation);
                    affectedSpineIDs.add(spineID);
                    log.add(logName, spineID, `${stateName} -> ${animation}`);
                });
            });
        });

        if (resetPose) {
            affectedSpineIDs.forEach((spineID) => {
                this.spines.get(spineID)?.skeleton.setToSetupPose();
            });
        }

        log.close(logName);
    }

    /** Plays all animations grouped under the given event name and notifies registered listeners. */
    async playEvent(eventName: string, spineID: string) {
        const logName = `${LOG.EVENT} [${eventName}]`;
        log.open(logName);

        const promises: Promise<void>[] = [];

        this.#eventsListeners.get(eventName)?.forEach((cb) => {
            cb(spineID, this.spines.get(spineID), { eventName });
        });

        this.eventAnimations.get(eventName)?.forEach((animation) => {
            this.animations.get(animation)?.forEach((animations, spineID) => {
                animations.forEach(async (animation) => {
                    promises.push(this.playInstanceAnimation(spineID, animation));
                    log.add(logName, spineID, `${eventName} -> ${animation}`);
                });
            });
        });

        await Promise.all(promises);
        log.close(logName);
    }

    /** Plays the named animation on every spine that has it. Pass `playSolo=true` to stop all other animations first. */
    async playAnimationByName(animationName: string, playSolo = false, trackID?: number) {
        const promises: Promise<void>[] = [];
        this.animations.get(animationName)?.forEach((animations, spineID) => {
            animations.forEach(async (animation) => {
                promises.push(this.playInstanceAnimation(spineID, animation, playSolo, trackID));
                log.add(LOG.PLAY_ANIMATION, spineID, `${animationName} -> ${animation}`);
            });
        });
        await Promise.all(promises);
    }

    /** Stops all running animations, then plays the named animation on all spines that have it. */
    async playSolo(animationName: string) {
        this.stopAll();
        this.playAnimationByName(animationName);
    }

    private getTrackID(spineID: SpineID): number {
        const next = (this.activeTracks.get(spineID) ?? -1) + 1;
        this.activeTracks.set(spineID, next);
        return next;
    }

    /** Plays a specific animation on a single spine by ID. Resolves when the animation completes (looping animations resolve immediately). */
    async playInstanceAnimation(
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
        if (this.activeAnimations.get(spineID)?.get(animation)) return;

        const loop = mod.includes(parcePointers.mod.loop);

        if (playSolo) {
            if (this.activeAnimations.has(spineID) || this.loopingAnimations.has(spineID)) {
                this.stopAllBySpineID(spineID);
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
            if (nextAnimation) this.playAnimationByName(nextAnimation, playSolo, trackID);
        });
    }

    /** Plays an animation then immediately seeks to its last frame, effectively showing the end pose. */
    async playInstanceAnimationLastFrame(spineID: string, animation: string, playSolo = false) {
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
            this.stopAllBySpineID(spineID);
        }

        const playTrack = this.getTrackID(spineID);

        spine.state.setAnimation(playTrack, animation, loop);
        const trackEntry = spine.state.getCurrent(0);

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
                spine.skeleton.setToSetupPose();
            }
            this.activeAnimations.delete(spineID);
            this.loopingAnimations.delete(spineID);
        });
    }

    /** Stops all animations on a specific spine and resets it to the setup pose. */
    stopAllBySpineID(spineID: string) {
        const spine = this.spines.get(spineID);
        if (!spine) return;
        spine.state.clearTracks();
        spine.skeleton.setToSetupPose();
        this.activeAnimations.delete(spineID);
        this.loopingAnimations.delete(spineID);
    }

    /** Stops a specific animation on a specific spine, clearing its track. */
    stopAnimation(spineID: string, animation: string) {
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

        this.removeLoopingAnimation(spineID, animation);
        this.removeActiveAnimation(spineID, animation);
    }

    /** Pauses all spines involved in the given state by setting their `timeScale` to 0. */
    pauseState(stateName: string) {
        this.stateAnimations.get(stateName)?.forEach((animation) => {
            this.animations.get(animation)?.forEach((_, spineID) => {
                this.pauseSpineByID(spineID);
            });
        });
    }

    /** Pauses a specific spine by setting its `timeScale` to 0. Resume by setting `speed` or calling `setAnimation` again. */
    pauseSpineByID(spineID: string) {
        const spine = this.spines.get(spineID);
        if (!spine) return;
        spine.state.timeScale = 0;
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
        this.activeTracks.clear();
        this.#eventsListeners.clear();
        this.#speed = 1;
    }
}
