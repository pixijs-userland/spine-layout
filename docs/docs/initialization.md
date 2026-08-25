---
title: Initialization
sidebar_position: 2
---

### From a Pixi.js manifest (recommended)

```ts
const layout = new SpineLayout({ debug: true });
await layout.createInstancesFromManifest(manifest, 'spines');
```

`createInstancesFromManifest` parses the manifest for `.atlas` / `.skel` triplets, builds the scene from its root, then wires the hierarchy up.

A skeleton that attaches no image needs no atlas and no page: Spine exports it as the JSON alone, and it is read with an empty atlas. It is picked up from the folder the atlases are in — a manifest cannot otherwise tell a skeleton from any other `.json`.

### The scene is built from its root

There is one entry point: `root`, or whatever [`options.root`](./options.md#root) names. It is
built first, its `spine_<id>` slots name the spines built next, theirs name the ones after that,
and so on down the tree. The layout container holds the root and nothing else — every other
spine is a child of the spine embedding it.

A skeleton that is loaded but embedded nowhere is not instanced at all. Nothing points at it, so
nothing would place it. Build one anyway with `createInstance`:

```ts
const popup = layout.createInstance('popup'); // and everything `popup` embeds in turn
layout.scene.addSlotChild('root', 'spine_overlay', popup);
```

A pointer at a pool (`spine_symbol0`…`spine_symbol4`) builds the template it clones, so a
skeleton reached only as a template is built like any other.

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
