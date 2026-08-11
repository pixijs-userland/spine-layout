# spine-layout

A spine composition framework built on Pixi.js. It lets you assemble flexible scenes with Spine skeletons, and provides a powerful animation system with minimal code.

Full documentation: [userland.pixijs.io/spine-layout](https://userland.pixijs.io/spine-layout/)

---

## Architecture

`SpineLayout` is a Pixi.js `Container` that acts as a facade over five specialized controllers:

```
SpineLayout (Container)
├── AnimationsController  — playback, states, events, track management
├── SkinsController       — skin switching across spines
├── SpineController       — bone/slot queries, global positions, cloning
├── TextsController       — dynamic text rendering & number animation
└── SceneController       — hierarchical composition (nest spines, attach texts/buttons)
```

All spines are stored in a central `Map<SpineID, Spine>` registry and each controller operates against that registry.

---

## Initialization

### From a Pixi.js manifest (recommended)

```typescript
const layout = new SpineLayout({ debug: true });
await layout.createInstancesFromManifest(manifest, 'spines');
```

`createInstancesFromManifest` parses the manifest for `.atlas` / `.json` / `.png` triplets, instantiates each spine, then calls `render()` which wires the full hierarchy.

### From raw data

```typescript
await layout.createInstancesFromDataArray([
    {
        skeleton: SkeletonData,
        atlasText: '...',
        textures: { 'page.png': texture },
    },
]);
```

---

## Slot-naming conventions

The scene is assembled by scanning slot names. No code changes are needed when the Spine file uses the right prefixes:

| Prefix         | Effect                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| `spine_<id>`   | Attach the child spine with that ID into this slot                           |
| `text_<key>`   | Create a text node here (configured via `settings/texts.json`)               |
| `button_<key>` | Create an invisible interactive sprite; fires `<key>_click/hover/...` events |

---

## Animation system

### Folder-based categorization

Animations are grouped by their folder name in the Spine editor:

| Folder prefix   | Type             | Triggered by                                 |
| --------------- | ---------------- | -------------------------------------------- |
| `state_<name>/` | State animation  | `layout.animations.playState(name)`          |
| `event_<name>/` | Event animation  | `layout.animations.playEvent(name)`          |
| _(none)_        | Direct animation | `layout.animations.playAnimationByName(...)` |

### Modifiers (suffixes in animation names)

- `_loop` — plays the animation looping
- `_next_<name>` — queues `<name>` automatically after the animation ends

### Example

```
state_idle/
  background_loop      ← loops while idle state is active
  character_loop
event_win/
  coins_next_idle      ← plays once, then transitions to idle
```

```typescript
layout.animations.playState('idle');
layout.animations.playEvent('win');
```

---

## Texts

Text nodes are positioned inside Spine bone slots. Configuration lives in `settings/texts.json`:

```json
{
    "score": {
        "type": "bitmapText",
        "fontFamily": "MyFont",
        "fontSize": 48,
        "align": "center",
        "maxWidth": 200
    }
}
```

A node sits centred on its bone — the middle of the value, not the corner of a line box —
measured off the glyphs on every change, so it stays centred as the value grows, wraps, or is
scaled down to fit `maxWidth`/`maxHeight`. Add an `offset` to move it off the bone on purpose.

Updating text with optional number animation:

```typescript
layout.texts.set('score', '1250', true); // animates from previous number
```

---

## Skins

```typescript
layout.skins.apply('gold'); // apply to all spines that have this skin
layout.skins.applyBySpineID('character', 'gold');
layout.skins.getAll(); // Set<string> of all available skins
```

---

## Events

Spine skeleton events can trigger sounds and vibration automatically:

- Event name `vibration_*` → calls `navigator.vibrate()`
- Event data `audioPath` → plays the sound via the built-in `sounds` system

You can also register custom listeners:

```typescript
layout.animations.addEventListener('win', (spineID, spine, eventData) => {
    console.log('win event from', spineID);
});
```

---

## Spine queries & utilities

```typescript
// World-space bone positions
const pos = layout.spine.getBoneGlobalPosition('character', 'hand');

// Search by pattern
const slots = layout.spine.getSlotsByNamePattern('weapon');
const bones = layout.spine.getBonesGlobalPositionsByNamePattern('particle_');

// Extract texture from a slot
const tex = layout.spine.getSlotTexture('character', 'portrait');

// Clone a spine instance
layout.spine.cloneBySpineID('enemy', 'enemy-2');
```

---

## Options

```typescript
type SpineLayoutOptions = {
    debug?: boolean; // verbose console logging
    manifest?: AssetsManifest; // auto-initialize on construction
    skipAttachingSpinesPatterns?: string[]; // don't nest spines matching these IDs
    multipleInstancesPatterns?: string[]; // auto-create N instances from bone count
};
```

---

## Debug logging

When `debug: true`, every major operation is logged to the console via grouped `console.table` output — spine registration, state mappings, event mappings, bone attachments, button activations, and animation track assignments.

---

## Exports

```typescript
export { SpineLayout }; // main class
export * from './config/types'; // SpineID, SpineLayoutOptions, SpineInstanceData, ...
export { sounds }; // Howler.js sound manager singleton
export { log }; // debug logger singleton
```
