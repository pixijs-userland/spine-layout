---
title: Options
sidebar_position: 5
---

```ts
type SpineLayoutOptions = {
    debug?: boolean; // verbose console logging
    manifest?: AssetsManifest; // auto-initialize on construction
    skipAttachingSpinesPatterns?: string[]; // don't nest spines matching these IDs
    multipleInstancesPatterns?: string[]; // auto-create N instances from bone count
};
```

### debug

When `debug: true`, every major operation is logged to the console via grouped `console.table` output — spine registration, state mappings, event mappings, bone attachments, button activations, and animation track assignments.

### multipleInstancesPatterns

Spines matching one of these IDs will be instantiated multiple times — once per matching `spine_<id>` slot found in parent spines. Useful for coin stacks, crowds, or any repeated element driven by the layout.

### skipAttachingSpinesPatterns

Prevents the auto-nesting logic from attaching spines with matching IDs into their parent slots. Useful when you want to position a child spine manually.
