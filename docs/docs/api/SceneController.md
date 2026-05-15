---
title: SceneController
sidebar_position: 6
---

Wires the full scene hierarchy: nests child spines into parent slots, creates text nodes, and activates interactive button sprites. Accessed via `layout.scene`.

## Methods

### attachBones

```ts
attachBones(addChildToLayout: (spine: Spine) => void)
```

Nests child spines into their parent slot objects (via `spine_<id>` naming) and adds root spines to the layout container.

---

### attachTexts

```ts
attachTexts();
```

Scans all spines for `text_<key>` slots and creates `Text`/`BitmapText` nodes inside them per `settings/texts.json`.

---

### activateButtonBones

```ts
activateButtonBones();
```

Creates invisible interactive sprites over `button_<key>` slots and wires pointer events to animation events (`<key>_click`, `<key>_hover`, etc.).

---

### addSlotChild

```ts
addSlotChild(spineID: string, slotName: string, child: Container)
```

Manually attaches any Pixi.js `Container` into a named slot on a specific spine.
