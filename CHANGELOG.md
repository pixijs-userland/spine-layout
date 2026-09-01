# @pixijs-userland/spine-layout

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
