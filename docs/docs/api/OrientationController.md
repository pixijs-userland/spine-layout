---
title: OrientationController
sidebar_position: 8
---

Poses the layout for the shape of the screen and re-poses it on every turn: a window taller
than it is wide plays `state_portrait/`, a window wider than it is tall plays
`state_landscape/`. Accessed via `layout.orientation`.

Like the rest of the conventions it needs no code — the two folders are ordinary states, so an
artist authors them in the Spine editor and the layout plays them for itself. A layout that has
neither never listens for a resize.

```
state_landscape/
  logo_wide          ← plays when the window is wider than it is tall
  reels_wide
state_portrait/
  logo_tall          ← plays when the window is taller than it is wide
  reels_tall
```

Author both halves, even when only one of them moves anything. The pair pose the same bones, so
they take turns on one track (see [track allocation](./AnimationsController.md)) and each undoes
the other by replacing it. A state authored on its own has nothing to hand the pose back to, so
it holds in both orientations.

A square window counts as landscape.

## Methods

### attach

```ts
attach();
```

Poses the layout for the screen it is on and starts following it. Called for you once the scene
is built and its `init` state has played.

Idempotent, and free for layouts that never author the two folders: with neither state
registered there is nothing to play and no listener is added. Safe to call again once more
spines are registered — a layout already posed keeps the pose it has, so a late spine is posed
by the next turn of the screen rather than by re-running the state over everything standing.

---

### setSize

```ts
setSize(width: number, height: number)
```

Measures the screen by hand, for a layout that does not fill the window — a canvas in a panel, a
test. The size given stands until another replaces it, so a layout driven this way is oriented
by its own resize rather than by the window's.

---

### update

```ts
update();
```

Re-reads the screen and plays the state for it if it has turned since the last read. Called for
you on every resize; call it by hand after moving the layout somewhere the window's own size
does not describe.

---

### clear

```ts
clear();
```

Stops following the screen and forgets the orientation the layout was posed for. Called by
`SpineLayout.reset()`.

## Properties

### current

```ts
if (layout.orientation.current === 'portrait') { … }
```

The orientation the layout is posed for — what the screen was the last time the states were
played, which is what game code should branch on. `undefined` until the first one.

### enabled

```ts
layout.orientation.enabled = false;
```

Whether the layout follows the screen at all. Switching it back on poses the layout for the
orientation the screen is in now, which may have turned while it was off.

## Notes

- The measurement is `window.innerWidth` against `window.innerHeight`, so a layout that fills
  the window needs nothing else. Where there is no window to measure — SSR, a test — nothing is
  posed until `setSize()` names a size.
- `resize` and `orientationchange` are both listened for, because older mobile Safari can turn
  without reporting a resize. Firing twice costs nothing: the state plays only when the
  orientation actually changed, not on every resize.
