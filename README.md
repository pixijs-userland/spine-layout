# spine-layout

A spine composition framework built on Pixi.js. It lets you assemble flexible scenes with Spine skeletons, and provides a powerful animation system with minimal code.

Full documentation: [userland.pixijs.io/spine-layout](https://userland.pixijs.io/spine-layout/)

---

## Architecture

`SpineLayout` is a Pixi.js `Container` that acts as a facade over seven specialized controllers:

```
SpineLayout (Container)
├── AnimationsController  — playback, states, events, track management
├── SkinsController       — skin switching across spines
├── SpineController       — bone/slot queries, global positions, cloning
├── TextsController       — dynamic text rendering & number animation
├── SceneController       — hierarchical composition (nest spines, attach texts/buttons)
├── PointerController     — bones that follow the mouse or finger
└── OrientationController — poses the layout for the shape of the screen
```

All spines are stored in a central `Map<SpineID, Spine>` registry and each controller operates against that registry.

---

## Engines

The core renders through an `Engine`, so one scene runs on every Pixi from 4 to 8. A game picks its
Pixi when it creates the engine; the Spine runtime is then picked per skeleton from that
skeleton's export version, among the runtimes registered for that Pixi:

| Entry                                 | Pixi                        | Spine runtimes                                                                  |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `@pixijs-userland/spine-layout`       | pixi.js v8                  | spine-pixi-v8 4.3 (unchanged default entry)                                     |
| `@pixijs-userland/spine-layout/pixi8` | pixi.js v8                  | spine-pixi-v8 4.2 and 4.3                                                       |
| `@pixijs-userland/spine-layout/pixi7` | Pixi 7 (`window.PIXI`)      | `@pixi-spine/*` 4.0 (3.7, 3.8, 4.1; 4.0 through 4.1), spine-pixi-v7 4.2 and 4.3 |
| `@pixijs-userland/spine-layout/pixi6` | Pixi 6 (`window.PIXI`)      | `@pixi-spine/*` 3.1 (3.7, 3.8, 4.0, 4.1)                                        |
| `@pixijs-userland/spine-layout/pixi5` | Pixi 5 (`window.PIXI`)      | pixi-spine 2.1 (3.8) or 2.0 (3.7), one per page                                 |
| `@pixijs-userland/spine-layout/pixi4` | PIXI v4.8.9 (`window.PIXI`) | pixi-spine 1.6 (3.8) or 1.5 (3.7), one per page                                 |
| `@pixijs-userland/spine-layout/core`  | none                        | `SpineLayoutCore`, the runtime matrix, `choosePixi`, `pickRuntime`              |

`@pixijs-userland/spine-layout/runtimes` binds runtime packages to an engine and discovers the ones
a page loaded as globals. A Spine export is read by the runtime of its own editor major.minor; a
project pin can name another, and 4.0 and 4.1 exports reach the next runtime through a JSON
pre-pass. On Pixi 4–7 the stack is loaded as `<script>` tags and the engine is handed
`window.PIXI`:

```typescript
import { createPixi4Engine, SpineLayoutCore } from '@pixijs-userland/spine-layout/pixi4';

const engine = createPixi4Engine(PIXI, { renderer: app.renderer });
const layout = new SpineLayoutCore({ engine });
```

`skeletonVersion(skeleton)` reads an export's version from a `.json` or `.skel`. One Pixi major is
live per page. See the [Engines guide](https://userland.pixijs.io/spine-layout/engines) for
loading, the differences between the engines and how to write another.

---

## Examples

`examples/` has one scene per Pixi major, each built with that major's engine from the exports in
`examples/assets/`: Pixi 8 with spine-pixi-v8 4.3 and a lazily loaded 4.2 in one scene, Pixi 7
with a Spine 3.8 and a 4.3 layout on one engine, and Pixi 6, 5 and 4 each on their own pixi-spine
with the 3.8 layout (texts, a bitmap font, a button, a second skin and particles). From this
package, after `pnpm install`:

```sh
pnpm examples --port <port> --strictPort --no-open
```

Then open `http://localhost:<port>/examples/`. Vite serves the layout from `src`; the legacy
stacks load as `<script>` globals, and the runtimes with no browser script of their own
(`@pixi-spine/*`, spine-pixi-v7) are bundled into `examples/vendor/` as the server starts.

---

## Initialization

### From a Pixi.js manifest (recommended)

```typescript
const layout = new SpineLayout({ debug: true });
await layout.createInstancesFromManifest(manifest, 'spines');
```

`createInstancesFromManifest` parses the manifest for `.atlas` / `.json` / `.png` triplets, builds the scene from its root, then wires the full hierarchy.

The scene has one entry point — `root`, or whatever `options.root` names. It is built first, its
`spine_<id>` slots name the spines built next, theirs name the ones after that, and so on down the
tree; the layout container holds the root and nothing else. A skeleton that is loaded but embedded
nowhere is not instanced at all — nothing points at it, so nothing would place it. `createInstance`
builds one anyway, together with everything it embeds in turn.

A skeleton that attaches no image needs no atlas and no page: Spine exports it as the JSON alone, and it is read with an empty atlas. It is picked up from the folder the atlases are in — a manifest cannot otherwise tell a skeleton from any other `.json`.

### From raw data

```typescript
await layout.createInstancesFromDataArray([
    {
        skeleton: skeletonJson,
        atlasText: '...', // empty for a skeleton with no images
        textures: { 'page.png': texture },
    },
]);
```

---

## Slot-naming conventions

The scene is assembled by scanning slot names. No code changes are needed when the Spine file uses the right prefixes:

| Prefix            | Effect                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| `spine_<id>`      | Attach the child spine with that ID into this slot                           |
| `text_<key>`      | Create a text node here (configured via `settings/texts.json`)               |
| `button_<key>`    | Create an invisible interactive sprite; fires `<key>_click/hover/...` events |
| `particles_<key>` | Hang a particle emitter here (configured via `settings/particles.json`)      |

Names also carry modifiers — suffixes that change what a bone or slot does:

| Suffix           | Effect                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| `_followPointer` | The **bone** tracks the pointer; on a slot, the bone it hangs from does |

---

## Bones that follow the pointer

Name a bone `<name>_followPointer` and it sits wherever the pointer is — the mouse on desktop,
the finger being dragged on a touch screen — carrying everything hanging from it: attachments,
nested spines, text nodes. No code is needed; naming the bone is the whole setup.

```
crosshair_followPointer   ← bone: sits under the pointer
  spine_wand              ← nested spine under that bone: comes along
glow_followPointer        ← slot: moves the bone it hangs from
```

Typical uses are an IK target (the arm aims where the mouse is), a crosshair, or a parallax
layer that drifts only part of the way:

```typescript
layout.pointer.strength = 0.2; // every follow bone travels a fifth of the way
layout.pointer.setStrength('clouds_followPointer', 0.05); // this one barely at all
layout.pointer.setPosition(x, y); // drive it from a gamepad instead of a pointer
layout.pointer.enabled = false; // bones back to their setup position
```

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

### Orientation

Two state folders the layout plays for itself, from the shape of the screen — no code, and no
call from the game:

```
state_landscape/   ← plays while the window is wider than it is tall
state_portrait/    ← plays while the window is taller than it is wide
```

They are ordinary states, so everything else about them is unchanged: several spines can each
hold their own animation in the folder, `_loop` still loops. Author both halves — the pair pose
the same bones, so they take turns on one track and each undoes the other; a state authored
alone has nothing to hand the pose back to and holds in both orientations.

```typescript
layout.orientation.current; // 'landscape' | 'portrait' — what the layout is posed for
layout.orientation.setSize(width, height); // a layout that does not fill the window
layout.orientation.enabled = false; // stop following the screen
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

## Particles

A `particles_<key>` slot gets a container that follows its bone, with an emitter inside it.
Configuration lives in `settings/particles.json`, keyed by spine id like `texts.json`:

```json
{
    "hero": {
        "sparks": { "textures": ["spark.png"], "config": { "frequency": 0.01 }, "autoplay": true }
    }
}
```

`textures` are asset aliases; `config` is handed to the engine's emitter as it is (a pixi-particles
4.3 config on Pixi 4–6, or a `@pixi/particle-emitter` 5 config on Pixi 6 and 7). Emitters advance with their spine, at its `state.timeScale`
— the layout `speed`, a per-spine speed, a pause. On a multiple-instance spine the key is
`<spineID>_<key>`, and the instance's section is merged over the base spine's. A bare key with no
spine id reaches that key on every spine.

`emitOnce` plays a config with an `emitterLifetime` for that lifetime; a looping one
(`emitterLifetime` unset or `<= 0`) spawns a single wave and stops. An emitter already emitting
keeps going.

```typescript
layout.particles.play('sparks'); // or play('sparks', 'hero')
layout.particles.stop('sparks');
layout.particles.emitOnce('sparks');
layout.particles.isPlaying('sparks');
layout.particles.setConfig('sparks', config); // rebuilds the emitter, keeps it playing
layout.particles.getAll(); // registered keys
layout.particles.getBySpine(); // Map<spineID, particles_ slot keys>
```

Skeleton events `particles_<key>_start`, `particles_<key>_stop` and `particles_<key>_once` do
the same from an animation.

Particles need an engine with a particles port. `pixi8` has none (there is no emitter for Pixi
v8 yet): the layout warns once and every call is a no-op.

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
