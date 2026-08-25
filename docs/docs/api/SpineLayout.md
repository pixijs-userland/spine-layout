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
reset();
```

Destroys all spine instances, clears controller state, and removes all children from the container.

---

### destroy

```ts
destroy();
```

Calls `reset()` then the parent Pixi.js `Container.destroy()`.

---

### getSpinesByNamePattern

```ts
getSpinesByNamePattern(pattern: string, options?: { not?: string[] }): Map<string, Spine>
```

Returns all registered spines whose IDs start with `pattern`. Delegates to `SpineController`.
