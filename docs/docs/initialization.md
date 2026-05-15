---
title: Initialization
sidebar_position: 2
---

### From a Pixi.js manifest (recommended)

```ts
const layout = new SpineLayout({ debug: true });
await layout.createInstancesFromManifest(manifest, 'spines');
```

`createInstancesFromManifest` parses the manifest for `.atlas` / `.skel` triplets, instantiates each spine, then calls `render()` which wires the full hierarchy.

### From raw data

```ts
await layout.createInstancesFromDataArray([
    {
        skeleton: SkeletonData,
        atlasText: '...',
        textures: { 'page.png': texture },
    },
]);
```
