---
'@pixijs-userland/spine-layout': minor
---

Engines for every Pixi from 4 to 8, with the Spine runtime picked per skeleton

A game picks its Pixi when it creates the engine, and each skeleton is read by the runtime of
its own export version among the runtimes registered for that Pixi:

- `@pixijs-userland/spine-layout/pixi8` — `createPixi8Engine({ runtimes })`: spine-pixi-v8 4.2
  and 4.3 in one scene, each through its own render pipe.
- `@pixijs-userland/spine-layout/pixi7` — `createPixi7Engine(PIXI, …)`: `@pixi-spine/*` 4.0
  (3.7, 3.8, 4.1; 4.0 exports through 4.1) and spine-pixi-v7 4.2 and 4.3.
- `@pixijs-userland/spine-layout/pixi6` — `createPixi6Engine(PIXI, …)`: `@pixi-spine/*` 3.1
  (3.7, 3.8, 4.0, 4.1).
- `@pixijs-userland/spine-layout/pixi5` — `createPixi5Engine(PIXI, …)`: pixi-spine 2.1 (3.8) or
  2.0 (3.7).
- `@pixijs-userland/spine-layout/pixi4` — now also reads 3.7 exports on pixi-spine 1.5.
- `@pixijs-userland/spine-layout/runtimes` — adapters that bind a runtime package to an engine,
  lazy runtimes, and `discoverGlobalRuntimes()` for runtimes a page loaded as scripts.

`/core` gains the runtime matrix, `choosePixi()` and `pickRuntime()`: a project pin wins, then
the runtime of the exact export minor, then a JSON pre-pass to the next runtime (4.0 → 4.1,
4.1 → 4.2); a skeleton no runtime reads is skipped with an `UnsupportedSpineVersionError`
warning, and a runtime that fails to load skips only its own skeletons. `"*"` pins exports that
name no version.

The default entry is unchanged for games: spine-pixi-v8 4.3, now on the shared esoteric port.

Fixes: on spine-core 4.3, bone world positions read the applied pose; the layout no longer hides
`Container#render`; 3.7 skins load; texts are destroyed on `reset()`; a reset during a lazy load
no longer builds into the old layout; `texts.json` is looked up without cache-miss warnings.

`examples/` has a runnable scene for each Pixi major (`pnpm examples`).
