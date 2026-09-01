---
title: Animation System
sidebar_position: 4
---

### Folder-based categorization

Animations are grouped by their folder name in the Spine editor:

| Folder prefix   | Type             | Triggered by                                 |
| --------------- | ---------------- | -------------------------------------------- |
| `state_<name>/` | State animation  | `layout.animations.playState(name)`          |
| `event_<name>/` | Event animation  | `layout.animations.playEvent(name)`          |
| _(none)_        | Direct animation | `layout.animations.playAnimationByName(...)` |

### Modifiers (suffixes in animation names)

- `_loop` — plays the animation looping
- `_next_<name>` — queues `<name>` automatically after the animation ends

### Example

```
state_idle/
  background_loop      ← loops while idle state is active
  character_loop
event_win/
  coins_next_idle      ← plays once, then transitions to idle
```

```ts
layout.animations.playState('idle');
layout.animations.playEvent('win');
```

### Orientation states

Two state folders the layout plays for itself, from the shape of the screen. Nothing calls them:
naming the folders is the whole setup, and the pair are re-played whenever the screen turns.

| Folder             | Plays while                          |
| ------------------ | ------------------------------------ |
| `state_landscape/` | the window is wider than it is tall  |
| `state_portrait/`  | the window is taller than it is wide |

They are ordinary states in every other respect — several spines can each hold their own
animation in the folder, `_loop` still loops, `playState('portrait')` still works by hand.

Author both halves, even when only one of them moves anything: the pair pose the same bones, so
they take turns on one track and each undoes the other by replacing it. A state authored on its
own has nothing to hand the pose back to and holds in both orientations. A square window counts
as landscape.

See [OrientationController](./api/OrientationController.md) for a layout that does not fill the
window, and for switching the following off.

### Custom event listeners

```ts
layout.animations.addEventListener('win', (spineID, spine, eventData) => {
    console.log('win event from', spineID);
});
```

Spine skeleton events also trigger built-in behaviour automatically:

- Event name `vibration_<ms>` → calls `navigator.vibrate(ms)`
- Event data `audioPath` → plays the sound via the built-in `sounds` system
- Event name ending in `_loop` → plays the sound as a **looping** FX (`spin_loop` → the `spin` sound on repeat)
- Event name starting with `music` → plays on the **music** channel (`music_loop` → `playMusic('music')`)

### Which channel a sound lands on

`_loop` means the sound repeats, *not* that it is music. Only the `music` prefix picks the music
channel, and the two channels behave differently on purpose:

| Event | Channel | Stops when |
|---|---|---|
| `click` | FX (one-shot) | its animation stops |
| `spin_loop` | FX (looping) | its animation stops |
| `music_loop`, `music2` | Music | another music track starts |

FX belong to the animation whose timeline fired them: stopping that animation (`stop`, `stopState`,
`stopAll`, `stopAllBySpineID`, `reset`) also stops its FX, so a looping spin sound cannot outlive the
spin. An FX is left playing when another still-running animation triggered the same sound — the spin
loop keeps going until the *last* reel stops. Music is never stopped this way; only another track
replaces it.
