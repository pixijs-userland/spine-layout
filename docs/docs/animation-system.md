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

### Custom event listeners

```ts
layout.animations.addEventListener('win', (spineID, spine, eventData) => {
    console.log('win event from', spineID);
});
```

Spine skeleton events also trigger built-in behaviour automatically:

- Event name `vibration_<ms>` → calls `navigator.vibrate(ms)`
- Event data `audioPath` → plays the sound via the built-in `sounds` system
