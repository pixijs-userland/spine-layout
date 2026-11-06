# @pixijs-userland/spine-layout

## 0.7.0

### Minor Changes

- 770f044: Sound adapters (#6): the `sounds` option takes a `SoundAdapter` (`playMusic`, `playFX`, `stopFX`, optional `init` / `dispose`) that plays the sounds the skeletons ask for, so a game can play them through its own audio system; `animations.onSound` keeps reporting every play and stop. The pixi8 `SpineLayout` keeps the built-in Howler player by default (`sounds: false` turns it off; `builtInSounds: false` still works and is deprecated). `./core` and `./pixi4` no longer import Howler: `SpineLayoutCore` plays nothing unless given an adapter, and the Howler player (`sounds`, `Sounds`) moves to the new `./howler` entry — a PIXI 4 game that played sound through it passes `sounds` from there.

## 0.6.0

### Minor Changes

- 59f0616: Add `builtInSounds: false` to turn the built-in Howler player off, and `animations.onSound` to receive every sound play and stop the skeletons ask for, so a game can play them through its own audio system.

## 0.5.2

### Patch Changes

- 09d7135: A slot child taken back by hand is forgotten, and a tap before `sounds.init` unlocks audio again

  `removeSlotAttachments` detached an `addSlotChild` object but kept it in the scene's list of slot
  children until the next `reset()` or `destroy()`, so a game that hangs and destroys one sprite per
  prize held every destroyed sprite for the session. Detaching it — by object or by slot name — now
  drops it from that list, and so does hanging another object on the same slot.

  0.5.0 moved the one-time `pointerdown` that unlocks audio into `sounds.init`, so a tap before
  `init` — a launcher's first click, a loading screen — no longer counted and sound stayed muted
  until the next tap. The listener is installed on import again and stays until the first tap,
  across `dispose`; `init` still installs the visibility listener and mutes.

## 0.5.1

### Patch Changes

- 57fafcd: Two animations that key a property to the same value no longer compete for a track

  Exports key every slot an animation shows, so a tutorial played over a charge animation often
  keys the same attachment, colour and draw order the charge already holds. The track allocator
  read that as a collision and handed the tutorial the charge's track, dropping the charge: the
  slot it faded in went back to its setup alpha, and whatever hung off that slot vanished.

  A claim now records, per property, the one value its timeline keys throughout. Two animations
  holding the same value there — within one 8-bit colour step — do not collide, so the later one
  stacks on its own track above the earlier. A property keyed to different values, or changed
  over the animation, collides as before. Both engines report holds; deform, folder draw-order and
  event timelines report none.

## 0.5.0

### Minor Changes

- 812cec3: Engine-agnostic core, and a PIXI v4 / Spine 3.8 engine

  `SpineLayout` and its controllers no longer import `pixi.js` or a Spine runtime; they render
  through an `Engine` of five ports (`spine`, `display`, `text`, `assets`, `particles`). The
  default entry is the pixi8 engine and behaves as before. Two entries are new:

  - `@pixijs-userland/spine-layout/core` — `SpineLayoutCore`, the controllers and the `Engine`
    types, with no rendering stack.
  - `@pixijs-userland/spine-layout/pixi4` — `createPixi4Engine(PIXI, { renderer })`, which runs the
    layout on PIXI v4.8.9 + pixi-spine 1.6 (spine-ts 3.8) + pixi-particles 4.3.0 handed in as
    `window.PIXI`.

  Also new: a `ParticlesController` (`layout.particles`) that hangs an emitter off every
  `particles_<key>` slot, configured by `settings/particles.json` and started by skeleton events
  (pixi4 only for now; pixi8 warns once and no-ops), and `skeletonVersion()`, which reads the Spine
  version of a `.json` or `.skel`. `pixi.js` and `@esotericsoftware/spine-pixi-v8` are now optional
  peer dependencies.

  Public type changes:

  - Bone and slot position getters return `PointLike` instead of Pixi's `Point`.
  - `SpineLayout` is no longer `instanceof`-checkable against `SpineLayoutCore` subclasses such as
    `MagicLayout`.
  - `SpineInstanceData` is generic over the engine's types and defaults to pixi8.
  - `getSlotTexture` on pixi8 cuts a rotated region turned the way the atlas packed it, upright
    and at its own size: it was turned the other way, with width and height swapped.

- e80163e: `layout.destroy()` releases everything the layout built, and the `sounds` singleton has a `dispose()`.

  Spines are destroyed with their children, so the text nodes (and their canvas textures), button
  overlays and particle containers the layout made go with them; a mount → play → destroy cycle
  leaves the window listeners, the shared ticker and the text count where they were. What a game
  hung on a slot through `addSlotChild` stays the game's: it is detached intact before the spines
  go (`scene.releaseSlotChildren()` does the same by hand). A `play()` still waiting on its
  animation resolves on destroy instead of holding the layout until its timer fires.

  `sounds.dispose()` unloads every `Howl`, empties the caches and takes the window listeners off,
  and `destroy()` calls it on the layout that ran `sounds.init` — the one built from a manifest. The
  listeners and the global mute are now installed on the first `init` rather than when the module is
  imported.

  The debug log keeps the last 500 entries while disabled instead of every one for the page's
  lifetime, and a row added to a label nothing opened — every animation played, every skeleton
  event — is written straight through instead of collecting in a table nothing closes.

### Patch Changes

- e80163e: A `button_<key>` on a bounding box, `playState` that leaves a running state alone, spines that
  know their id, and what a scene rebuilt in place needs

  - A bounding box attachment is a button's hit area, as a region's quad and a mesh's hull are: a
    skeleton that packs no image — a root of nothing but bones, the engine's own buttons — draws
    its buttons as bounding boxes, and such a button used to get the overlay's one-pixel texture
    for a hit area, so a "press anywhere" box over the whole screen answered nothing.
  - `playState` on a state the spine already sits in is now a no-op: an animation still running
    on its track, a loop included, is left where it is instead of being set again from frame 0.
    Only `activeAnimations` was checked before, so a resumed game re-entering its feature state
    snapped every ambience loop back to its first frame. `{ restart: true }` still starts over,
    a loop whose track moved on behind the registry still replays, and so does a paused one.
  - Every instance the layout builds, a multiplied one and a clone included, carries its id as
    its `label` (`name` on PIXI v4), and `layout.spine.idOf(spine)` answers the registry id of a
    `Spine` a consumer holds.
  - `scene.releaseSlotChildren()` returns `{ spineID, slotName, child }` for each object instead
    of the bare container, so a rebuild can hang it on the same slot of the new scene without
    reading the runtime's own tables.
  - `layout.reset({ keepListeners: true })` leaves the game's `animations.addEventListener`
    subscriptions registered across the rebuild; a plain `reset()` drops them as before.
  - `animations.activeStates()` lists the states `playState` played and nothing has stopped
    since, oldest first, a replay moved last; the layout's own `init`, `landscape` and `portrait`
    are left out unless `{ builtIn: true }` asks for them.

- e80163e: A skeleton with no atlas is also picked up from a folder of its own name beside the atlases'
  own folders — `spine/root/root.json` next to `spine/bg/bg.atlas`, the layout of a build that
  packs each skeleton in a folder of its own. Before, only a folder that itself held an atlas
  counted, so such a root was never instanced.

## 0.4.1

### Patch Changes

- d65c8a4: Buttons stay clickable under masks and other skeletons

  A `button_<key>` overlay now takes the shape of the slot's attachment — a region's quad with
  its own offset, rotation and scale, a mesh's hull — instead of the raw texture at the bone, so
  the whole of the art answers the pointer; the skeleton's clipping still bounds it, as it bounds
  the art. No skeleton answers a hit-test with its own art any more: Pixi
  hands an interactive ancestor's mode down and a `Spine` claims its whole bounding box, so a hero
  or a popup drawn over a button used to swallow the click. Only what a `button_` bone wraps is a
  hit target, text slot objects stay out of hit-testing, and the pointer controller listens for
  moves on an empty child instead of turning the layout `static`.

## 0.4.0

### Minor Changes

- 639d9ba: Play `state_landscape/` and `state_portrait/` for the shape of the screen

  Two state folders the layout now plays for itself and re-plays whenever the screen turns —
  landscape while the window is wider than it is tall, portrait while it is taller than it is
  wide. Naming the folders in the Spine editor is the whole setup; a layout that authors neither
  never listens for a resize. `layout.orientation` exposes what the layout is posed for, a
  `setSize()` for a layout that does not fill the window, and an `enabled` switch.

## 0.3.1

### Patch Changes

- c7f9d5a: A named child pool is multiplied per parent rather than once for all of them. `spine_<id>_<n>`
  pointers declared on a template that is itself multiplied — five reels each carrying
  `spine_symbol_0`…`spine_symbol_4` — produced five symbols for twenty-five slots, and since a
  child can only live under one parent, every reel took the same five off the one before it until
  the whole grid sat on the reel attached last. Such a pointer now expands to one instance per
  carrier, `<id>_<n>_<parent>`, as a shared plain pointer already did.

## 0.3.0

### Minor Changes

- a143e53: The scene is built from its root, and only what the root embeds is built.

  There is one entry point now — `root`, or whatever the new `root` option names. It is instanced
  first, its `spine_<id>` slots name the spines instanced next, theirs name the ones after that,
  down the whole tree. The layout container holds the root and nothing else: every other spine is a
  child of the spine embedding it, including one whose slot `skipAttachingSpinesPatterns` held back,
  which is built and left for the game to place rather than dropped at the layout's origin.

  A skeleton that is loaded but embedded nowhere is no longer instanced. Nothing points at it, so
  nothing would place it, and it used to sit at the top left of the layout on top of the scene.
  `createInstance(spineID)` builds one anyway, together with everything it embeds in turn — the way
  in for a spine the game positions itself.

  With no root to start from, every skeleton is built and each one nothing embedded is rooted in the
  layout, as before, behind a warning naming the ids that were loaded.

  `SceneController.attachBones()` no longer takes the `addChildToLayout` callback — the layout roots
  itself now. It, `attachTexts`, `activateButtonBones` and `syncSlotObjectsWithDrawOrder` all take an
  optional set of ids to run over instead, which is what wires a late `createInstance` without
  rewiring the spines already standing.

## 0.2.0

### Minor Changes

- 0d73fde: A skeleton that attaches no image loads without an atlas. Spine exports one as the JSON alone —
  there is nothing to pack — which is what a skeleton whose job is to place and drive other spines
  looks like: bones, slots and animations, no art. Both entry points now take it.

  `createInstancesFromManifest` picks such a skeleton up from the folder the atlases are in, since a
  manifest cannot otherwise tell a skeleton from any other `.json`, and reads it with an empty atlas
  instead of asking the asset cache for one that was never built. A spine's id now comes from its
  skeleton rather than its atlas, which for a packed skeleton is the same name it always was.

  `createInstancesFromDataArray` accepts empty `atlasText` and no textures, and no longer throws on
  the missing `skins` key — that was a real crash for the editor, where a bones-only skeleton failed
  to register its skins and logged a `TypeError` instead.

  `SpineInstanceData.skeleton` is typed as what it holds — the parsed `.json` or the bytes of a
  `.skel` — rather than as a runtime `SkeletonData`. A `.skel` is now read with `SkeletonBinary`;
  before, the binary path went to the JSON parser.

## 0.1.0

### Minor Changes

- f63ea11: Rewrote track control in the animations controller. Tracks are now assigned per spine as
  animations start, instead of being passed in by callers, so two animations on one spine no
  longer land on the same track and cut each other off.

  The `trackID` argument is gone from `playByName()` and `play()`. `playByName()` takes a
  spine ID in that third slot now — `playByName('idle', false, 'reel_1')` plays the animation
  on that one spine, where before it played on every spine holding a matching name.

  Also new: `setSpineSpeed()`/`getSpineSpeed()` pace a single spine against the rest of the
  layout, `getBySpine()` reports which spine each animation was drawn in, and `playEvent()`
  takes a payload that reaches the listeners alongside the event name.

- f63ea11: `button_<key>` bones become composite button wrappers: everything under the bone is part of
  the button, not just the one slot. A button that embeds its own spine plays that spine's
  feedback animations on hover and press rather than needing them wired up by hand.

  `press(key)` triggers a button from code — the keyboard shortcut path, or a tutorial driving
  the UI.

- f63ea11: Bones that follow the pointer. Name a bone `<name>_followPointer` and it sits wherever the
  pointer is, carrying everything hanging from it — attachments, nested spines, text nodes.
  Naming the bone is the whole setup; a slot with the suffix moves the bone it hangs from.

  The new `layout.pointer` controller tunes it: `strength` for how far every follow bone
  travels (a parallax layer can drift a twentieth of the way), `setStrength()` to single one
  bone out, `setPosition()` to drive it from a gamepad instead of a pointer, and `enabled` to
  put the bones back at their setup position.

- f63ea11: Sounds are loaded up front at `init()` instead of on first use, so the first click is not
  the one that waits for the file.

  One name can stand for a set of files, picked at random per play — three coin sounds under
  `coin` stop the tenth coin sounding like the first. Names the manifest shortened are
  resolved back, and three places asking for the same sound in the same frame hear it once.

  Channels follow the event name: one starting with `music` plays on the music channel,
  everything else is FX, looping when the name ends in `_loop`. A looping FX belongs to the
  animation whose timeline fired it and stops with it, so a spin loop cannot outlive the spin
  — though it keeps going while another running animation still wants it, which is what makes
  five reels sharing one loop stop it only on the last.

  The authored mix is scaled by the player's music and FX dials rather than replaced by them,
  so relative levels set in the editor survive the volume slider.

- f63ea11: Text nodes sit centred on their bone — the middle of the value, measured off the glyphs on
  every change, not the corner of a line box. They stay centred as the value grows, wraps, or
  is scaled down to fit.

  Bitmap text gained the rest of what the system font already had: wrapping at `maxWidth`
  rather than Pixi's default of 100, a `maxHeight` twin, per-line alignment, and multi-line
  spacing measured from the glyphs. A word the atlas has no pictures for is drawn instead of
  dropped silently.

  New on the controller: `has()` to ask whether a text node exists, `seed()` to set a value
  without announcing it, `setMaxHeight()`, `getBySpine()` and `getBitmapInstances()`.

  Changing a text value now fires a synthetic `<key>_change` animation event, so a spine can
  animate its own field — a balance that flashes when it goes up needs no code.

### Patch Changes

- f63ea11: Fixes:

  - A slot texture's frame is sized against the page's logical size, so art on a half-size
    atlas no longer samples at half UV and comes out blurred on some devices.
  - Slot-texture extraction follows the Spine 4.3 sequence API.
  - A pose Spine cannot undo itself is put back on stop, and an entry that never applied is
    left alone when it replays, instead of stamping a pose that was never shown.
  - Bitmap fonts scale from the right anchor.
  - A shared spine child is multiplied into one instance per parent rather than being moved
    to the last one.
  - Dropped the unpaired FX stop log line.

## 0.0.2

### Patch Changes

- 0ce1768: Publish to GitHub Packages under the @pixijs-userland scope.
