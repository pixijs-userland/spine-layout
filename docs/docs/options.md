---
title: Options
sidebar_position: 5
---

```ts
type SpineLayoutOptions = {
    debug?: boolean; // verbose console logging
    manifest?: AssetsManifest; // auto-initialize on construction
    skipAttachingSpinesPatterns?: string[]; // don't nest spines matching these IDs
    root?: SpineID; // the spine the scene is built from, `root` by default
};
```

### root

The entry point: the one skeleton instanced on its own account, and the spine the layout
container holds. Everything else is instanced because a `spine_<id>` slot somewhere in the tree
beneath it asks for it — see [Initialization](./initialization.md).

Defaults to `root`. Name another id here when the entry point is called something else:

```ts
const layout = new SpineLayout({ root: 'main' });
```

### debug

When `debug: true`, every major operation is logged to the console via grouped `console.table` output — spine registration, state mappings, event mappings, bone attachments, button activations, and animation track assignments.

### Multiple instances

Not an option: a spine is instantiated once per `spine_<id>` slot pointing at it, wherever those
slots sit in the tree. Five `spine_reel_1`…`spine_reel_5` pointers make five reels out of one
`reel` export, and the repeated `spine_symbol0`…`spine_symbol4` slots on each of those make a
pool of twenty-five symbols. Naming the slots is the whole setup.

### skipAttachingSpinesPatterns

Prevents the auto-nesting logic from attaching spines with matching IDs into their parent slots. Useful when you want to position a child spine manually.
