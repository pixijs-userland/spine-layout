---
'@pixijs-userland/spine-layout': patch
---

A `button_<key>` on a bounding box, `playState` that leaves a running state alone, spines that
know their id, and what a scene rebuilt in place needs

- A bounding box attachment is a button's hit area, as a region's quad and a mesh's hull are: a
  skeleton that packs no image — a root of nothing but bones, the engine's own buttons — draws
  its buttons as bounding boxes, and such a button used to get the overlay's one-pixel texture
  for a hit area, so a "press anywhere" box over the whole screen answered nothing.
- `playState` on a state the spine already sits in is now a no-op: an animation still running
  on its track, a loop included, is left where it is instead of being set again from frame 0.
  Only `activeAnimations` was checked before, so a resumed game re-entering its feature state
  snapped every ambience loop back to its first frame. `{ restart: true }` still starts over,
  a loop whose track moved on behind the registry still replays, and so does a paused one.
- Every instance the layout builds, a multiplied one and a clone included, carries its id as
  its `label` (`name` on PIXI v4), and `layout.spine.idOf(spine)` answers the registry id of a
  `Spine` a consumer holds.
- `scene.releaseSlotChildren()` returns `{ spineID, slotName, child }` for each object instead
  of the bare container, so a rebuild can hang it on the same slot of the new scene without
  reading the runtime's own tables.
- `layout.reset({ keepListeners: true })` leaves the game's `animations.addEventListener`
  subscriptions registered across the rebuild; a plain `reset()` drops them as before.
- `animations.activeStates()` lists the states `playState` played and nothing has stopped
  since, oldest first, a replay moved last; the layout's own `init`, `landscape` and `portrait`
  are left out unless `{ builtIn: true }` asks for them.
