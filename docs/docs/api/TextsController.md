---
title: TextsController
sidebar_position: 4
---

Creates and manages dynamic Pixi.js `Text`/`BitmapText` nodes attached to Spine slots. Accessed via `layout.texts`.

## Methods

### getInstances

```ts
getInstances(): Map<SpineID, Text | BitmapText>
```

Returns all active text instances (both `Text` and `BitmapText`) keyed by bone name.

---

### getBitmapInstances

```ts
getBitmapInstances(): Map<SpineID, BitmapText>
```

Returns only the `BitmapText` instances, keyed by bone name.

---

### getBySpine

```ts
getBySpine(): Map<string, string[]>
```

Returns a map of spineID → list of text slot names for each spine that has text slots.

---

### getVal

```ts
getVal(textID: string): string | undefined
```

Returns the current string value of a text node by its bone name.

---

### set

```ts
set(boneName: string, text: string, animate?: boolean)
```

Sets the text value. When `animate=true` (or `animateNumber` is set in config), numeric values count up/down over 500ms.

---

### setOffset

```ts
setOffset(boneName: string, offset: { x: number; y: number })
```

Moves a text node by the given pixel offset relative to its bone position.

---

### setMaxWidth

```ts
setMaxWidth(boneName: string, maxWidth: number)
```

Constrains a text node to a max pixel width by scaling it down uniformly when it overflows.

---

### setStyle

```ts
setStyle(boneName: string, style: Partial<Text["style"]>)
```

Applies a partial Pixi.js `TextStyle` to the named text node.

---

### setTextType

```ts
setTextType(boneName: string, newType: "text" | "bitmapText")
```

Swaps a text node between `Text` and `BitmapText` at runtime, preserving its current value.

---

### settings (setter)

```ts
set settings(settings: Record<string, TextsJsonEntry>)
```

Overrides the text configuration loaded from `settings/texts.json`.
