---
title: SceneController
sidebar_position: 6
---

Wires the full scene hierarchy: nests child spines into parent slots, creates text nodes, and activates interactive button sprites. Accessed via `layout.scene`.

## Methods

### attachBones

```ts
attachBones(only?: Set<SpineID>)
```

Nests child spines into the slot that names them (via `spine_<id>` naming). Pass `only` to run over a subset of the registry — the spines a `createInstance` call just built — leaving the ones already wired alone; `attachTexts`, `activateButtonBones` and `syncSlotObjectsWithDrawOrder` take the same argument.

---

### attachTexts

```ts
attachTexts(only?: Set<SpineID>);
```

Scans all spines for `text_<key>` slots and creates `Text`/`BitmapText` nodes inside them per `settings/texts.json`.

---

### activateButtonBones

```ts
activateButtonBones(only?: Set<SpineID>);
```

Creates invisible interactive sprites over `button_<key>` slots and wires pointer events to animation events (`<key>_click`, `<key>_hover`, etc.).

The sprite's hit area is the shape of the slot's attachment — a region's quad, with its own offset, rotation and scale from the bone, or a mesh's hull — so the whole of the art the player sees answers the pointer, clipped where the skeleton's clipping attachment clips the art. No skeleton answers a hit-test with its own art: Pixi hands an interactive ancestor's mode down to every child, and a `Spine` would otherwise claim its whole bounding box, so a hero or a popup drawn over a button would swallow the click. Only what a `button_` bone wraps is a hit target of its own.

---

### addSlotChild

```ts
addSlotChild(spineID: string, slotName: string, child: Container)
```

Manually attaches any Pixi.js `Container` into a named slot on a specific spine.
