---
title: SpineController
sidebar_position: 5
---

Query and utility layer over the spine registry — bone/slot lookups, world-space positions, texture extraction, and cloning. Accessed via `layout.spine`.

## Methods

### clone

```ts
clone(spine: Spine, newSpineID: string): Spine
```

Clones a Spine instance, registers it under `newSpineID`, and offsets its position by 100px so it does not overlap the source.

---

### cloneBySpineID

```ts
cloneBySpineID(spineID: string, newSpineID: string): Spine | null
```

Looks up a registered spine by ID then clones it. Returns `null` if the source spine is not found.

---

### getBonesByNamePattern

```ts
getBonesByNamePattern(pattern: string): BoneData[]
```

Returns all bone definitions whose names start with `pattern`, across all registered spines.

---

### getSlotsByNamePattern

```ts
getSlotsByNamePattern(pattern: string): SlotData[]
```

Returns all slot definitions whose names start with `pattern`, across all registered spines.

---

### getSlotByName

```ts
getSlotByName(name: string): Slot | undefined
```

Finds the first live slot with the given name across all registered spines.

---

### getSpinesByNamePattern

```ts
getSpinesByNamePattern(pattern: string, options?: { not?: string[] }): Map<string, Spine>
```

Returns all registered spines whose IDs start with `pattern`. Pass `options.not` to exclude IDs containing those substrings.

---

### getBoneGlobalPosition

```ts
getBoneGlobalPosition(spineID: string, boneName: string): Point | undefined
```

Returns the world-space position of the first bone matching `boneName` on the given spine.

---

### getBonesGlobalPositionsByNamePattern

```ts
getBonesGlobalPositionsByNamePattern(pattern: string): Record<string, Point>
```

Returns a name→Point map of world-space positions for all bones matching the prefix, across all spines.

---

### getSlotsGlobalPositionsByNamePattern

```ts
getSlotsGlobalPositionsByNamePattern(pattern: string): Record<string, Point>
```

Returns a name→Point map of world-space positions for all slots matching the prefix, across all spines.

---

### getSlotTexture

```ts
getSlotTexture(spineName: string, slotName: string): Texture | null
```

Extracts the Pixi.js `Texture` from a slot's attachment. Returns `null` if the slot has no region/mesh attachment.
