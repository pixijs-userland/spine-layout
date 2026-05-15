---
title: SkinsController
sidebar_position: 3
---

Manages skin registration and application across all spine instances. Accessed via `layout.skins`.

## Methods

### getList

```ts
getList(): Map<SpineID, string[]>
```

Returns the raw map of spineID → registered skin names.

---

### getAll

```ts
getAll(): Set<string>
```

Returns a flat set of every registered skin name across all spines.

---

### getSpineSkinsBySkinID

```ts
getSpineSkinsBySkinID(skinID: string): string[]
```

Returns all skin names registered under the given skin ID.

---

### apply

```ts
apply(skin: string)
```

Applies a skin by name to every spine that has it defined.

---

### applyBySpineID

```ts
applyBySpineID(spineID: string, skinName: string)
```

Applies a skin by name to a specific spine instance.

---

### registerSkin

```ts
registerSkin(spineID: string, skinName: string)
```

Records a skin name as available for the given spine (used during initialization).
