---
'@pixijs-userland/spine-layout': minor
---

Engine-agnostic core, and a PIXI v4 / Spine 3.8 engine

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
