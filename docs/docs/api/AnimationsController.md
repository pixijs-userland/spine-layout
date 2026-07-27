---
title: AnimationsController
sidebar_position: 2
---

Manages animation playback, state/event grouping, track allocation, and Spine event listeners. Accessed via `layout.animations`.

## Methods

### registerSpine

```ts
registerSpine(spineID: string, spine: Spine)
```

Registers a spine instance, wiring up its animation metadata and event listeners. Called internally during spine creation.

---

### getAall

```ts
getAall(): string[]
```

Returns all registered animation names (without modifiers).

---

### getStates

```ts
getStates(): string[]
```

Returns all registered state names (from `state_<name>/` folders).

---

### getEvents

```ts
getEvents(): string[]
```

Returns all registered event names (from `event_<name>/` folders).

---

### getActive

```ts
getActive(): string[]
```

Returns the names of all currently playing (non-looping) animations.

---

### getLooping

```ts
getLooping(): string[]
```

Returns the names of all currently looping animations.

---

### addEventListener

```ts
addEventListener(event: string, fn: (event: unknown) => void)
```

Subscribes a callback to a named Spine skeleton event. Multiple listeners per event are supported.

---

### playState

```ts
playState(stateName: string): Promise<void>
```

Plays all animations grouped under the given state name (e.g. `"idle"` triggers every animation in `state_idle/`).

---

### playEvent

```ts
playEvent(eventName: string, spineID: string, payload?: Record<string, unknown>): Promise<void>
```

Plays all animations grouped under the given event name and notifies registered listeners.
`payload` is merged into the object handed to the listeners alongside `eventName`, so synthetic
events can carry context (e.g. a text change's `from`/`to` values).

---

### playAnimationByName

```ts
playAnimationByName(animationName: string, playSolo?: boolean, trackID?: number): Promise<void>
```

Plays the named animation on every spine that has it. Pass `playSolo=true` to stop all other animations first.

---

### playSolo

```ts
playSolo(animationName: string): Promise<void>
```

Stops all running animations, then plays the named animation on all spines that have it.

---

### playInstanceAnimation

```ts
playInstanceAnimation(spineID: string, animation: string, playSolo?: boolean, trackID?: number): Promise<void>
```

Plays a specific animation on a single spine by ID. Resolves when the animation completes (looping animations resolve immediately).

---

### playInstanceAnimationLastFrame

```ts
playInstanceAnimationLastFrame(spineID: string, animation: string, playSolo?: boolean): Promise<void>
```

Plays an animation then immediately seeks to its last frame, effectively showing the end pose.

---

### stopAll

```ts
stopAll();
```

Stops all animations on all spines and resets them to their setup pose.

---

### stopAllBySpineID

```ts
stopAllBySpineID(spineID: string)
```

Stops all animations on a specific spine and resets it to the setup pose.

---

### stopAnimation

```ts
stopAnimation(spineID: string, animation: string)
```

Stops a specific animation on a specific spine, clearing its track.

---

### pauseState

```ts
pauseState(stateName: string)
```

Pauses all spines involved in the given state by setting their `timeScale` to 0.

---

### pauseSpineByID

```ts
pauseSpineByID(spineID: string)
```

Pauses a specific spine by setting its `timeScale` to 0.

---

### speed (setter)

```ts
set speed(value: number)
```

Sets the global playback speed for all spines (`timeScale`).
