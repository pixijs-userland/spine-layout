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

Parses a Pixi.js `AssetsManifest` for spine assets, creates single and multiple instances (based on `multipleInstancesPatterns`), then calls `render()` to wire the full scene.

---

### createInstancesFromDataArray

```ts
createInstancesFromDataArray(data: SpineInstanceData[])
```

Creates spine instances from raw skeleton data objects (atlas text + texture map). Used when assets are loaded outside the Pixi.js asset pipeline.

---

### createInstanceFromData

```ts
createInstanceFromData(data: SpineInstanceData, skipAttachBones?: boolean, skipMultipleInstances?: boolean)
```

Creates a single spine instance from raw data. Handles multiple-instance patterns by looking up bone counts with the `spine_<id>` prefix convention.

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
