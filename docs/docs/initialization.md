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

A skeleton that attaches no image needs no atlas and no page: Spine exports it as the JSON alone, and it is read with an empty atlas. It is picked up from the folder the atlases are in — a manifest cannot otherwise tell a skeleton from any other `.json`.

### From raw data

```ts
await layout.createInstancesFromDataArray([
    {
        skeleton: skeletonJson,
        atlasText: '...', // empty for a skeleton with no images
        textures: { 'page.png': texture },
    },
]);
```
