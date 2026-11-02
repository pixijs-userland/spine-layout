---
title: SpineLayout
sidebar_position: 1
---

Main entry point — a Pixi.js `Container` that manages a hierarchy of Spine skeletons. Exposes five sub-controllers via getters and provides high-level lifecycle methods.

## Methods

### constructor

```ts
constructor(options?: SpineLayoutOptions)
```

Creates the layout and its five controllers. If `options.manifest` is provided the spines are instantiated immediately.

---

### createInstancesFromManifest

```ts
createInstancesFromManifest(manifest: AssetsManifest, folderName?: string)
```

Parses a Pixi.js `AssetsManifest` for spine assets, builds the scene from its root — the root spine, then whatever the `spine_<id>` slots beneath it embed, down the whole tree — and wires it up. A skeleton nothing embeds is left unbuilt; see `createInstance`.

---

### createInstancesFromDataArray

```ts
createInstancesFromDataArray(data: SpineInstanceData[])
```

Creates spine instances from raw skeleton data objects (atlas text + texture map), from the root down, exactly as `createInstancesFromManifest` does. Used when assets are loaded outside the Pixi.js asset pipeline.

---

### createInstance

```ts
createInstance(spineID: SpineID): Spine | undefined
```

Builds a spine the tree does not reach, and everything that one embeds in turn — a skeleton that was loaded but is embedded nowhere, so automatic building never got to it. The instance is registered and wired like any other (nested children, texts, buttons), but it is given no place on screen, since nothing named one: attach it with `scene.addSlotChild()`, or `addChild()` it into the layout.

Returns the instance — an already-built one included — or `undefined` when no skeleton by that name was loaded.

---

### reset

```ts
reset(options?: { keepListeners?: boolean });
```

Takes the scene down and leaves the layout empty, ready to build again. The spines are destroyed with their children — the text nodes, button overlays and particle containers the layout built — and the controllers, listeners and ticker subscriptions are cleared. What the game hung on a slot with `scene.addSlotChild()` is detached intact first, not destroyed.

`keepListeners` leaves the game's `animations.addEventListener` subscriptions registered, so a scene rebuilt in place fires its events at the same subscribers; by default they go with everything else.

---

### destroy

```ts
destroy();
```

Calls `reset()`, then `sounds.dispose()` when this layout was the one that ran `sounds.init` (a layout built from a manifest), then the parent Pixi.js `Container.destroy()`.

---

### getSpinesByNamePattern

```ts
getSpinesByNamePattern(pattern: string, options?: { not?: string[] }): Map<string, Spine>
```

Returns all registered spines whose IDs start with `pattern`. Delegates to `SpineController`.
