---
title: PointerController
sidebar_position: 7
---

Moves every bone named `<name>_followPointer` to wherever the pointer is — the mouse on
desktop, the finger being dragged on a touch screen. Accessed via `layout.pointer`.

The convention needs no code: name the bone in the Spine editor and it follows, together with
everything hanging from it (attachments, nested spines, text nodes). A **slot** carrying the
modifier moves the bone it hangs from, so an artist can mark the image instead.

```
crosshair_followPointer   ← bone: sits under the pointer
spine_wand               ← nested spine under that bone: comes along
glow_followPointer       ← slot: moves the bone it hangs from
```

The bone is posed between the animations being applied and the world transforms being
computed, so child bones, attachments and slot objects all land in the same frame — the
place the Spine runtime expects application code to move a bone. A typical follow bone is an
IK target (the arm aims where the mouse is), a crosshair, or a parallax layer.

## Methods

### attach

```ts
attach();
```

Scans every registered spine for `_followPointer` bones and starts following. Called for you
by `SpineLayout.render()`; call it again after registering spines later (a clone, a late
instance) to pick up their follow bones too — a spine already followed is skipped.

Listening starts the first time a follow bone is found, and makes the layout container
interactive (`eventMode = 'static'`): Pixi delivers `globalpointermove` to interactive objects
on every pointer move, wherever the pointer is, so nothing has to be covered with a hit area.
A layout with no follow bone in it is left untouched.

---

### setPosition

```ts
setPosition(x: number, y: number)
```

Moves the pointer by hand, in stage coordinates — a gamepad stick, a keyboard, a test. The
bones follow it exactly as they follow a real pointer, and the next real pointer move takes
over again.

---

### setStrength

```ts
setStrength(boneName: string, value: number)
```

Overrides [`strength`](#strength) for one bone, by name, across every spine that has it.

---

### getPosition

```ts
getPosition(): Point | undefined
```

The last pointer position in stage coordinates, or `undefined` before the pointer first moves.
Until then the bones are left exactly as the animations posed them.

---

### getBones

```ts
getBones(): Map<SpineID, string[]>
```

The names of the bones following the pointer, by spine id — the same thing the debug log
prints under `🖱️ Bones following pointer`.

---

### clear

```ts
clear();
```

Stops following: the bones return to their setup position, each spine gets its own update hook
back, and the pointer listener is removed. Called by `SpineLayout.reset()`.

## Properties

### enabled

```ts
layout.pointer.enabled = false;
```

Whether the follow bones track the pointer at all. Switching it off returns them to their setup
position — a bone no animation poses would otherwise stay where the pointer last left it.

### strength

```ts
layout.pointer.strength = 0.2; // a fifth of the way: a parallax drift
```

How far a bone travels from its setup position toward the pointer. `1` (the default) puts it
right under the pointer, `0` pins it home, and values outside `0..1` overshoot or mirror.

The travel is measured from the bone's **setup** position, not from where an animation put it —
so a partly-following bone is one the animations leave alone. A bone at full strength sits on
the pointer whatever else poses it.

## Notes

- Following happens inside the spine's own update, so a spine with `autoUpdate = false` that is
  never updated does not follow.
- The hook a spine already carried on `beforeUpdateWorldTransforms` is kept and called first,
  so game code using it keeps working. Assigning that property _after_ `attach()` replaces the
  following — chain it yourself, or call `attach()` again.
