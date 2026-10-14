---
title: Engines
sidebar_position: 8
---

spine-layout is one core behind a narrow `Engine` interface, with an engine for every Pixi major
from 4 to 8. A game picks its Pixi when it creates the engine; the engine then reads each skeleton
with the Spine runtime its export version picks, among the runtimes registered for that Pixi:

| Engine  | Pixi         | Spine runtimes                                                                              | Entry                                                                  |
| ------- | ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pixi8` | pixi.js v8   | spine-pixi-v8 4.2 and 4.3; the default entry bundles 4.3                                    | `@pixijs-userland/spine-layout`, `@pixijs-userland/spine-layout/pixi8` |
| `pixi7` | 7.2 or later | `@pixi-spine/*` 4.0.6 runtime-3.7, 3.8 and 4.1 (4.0 through 4.1); spine-pixi-v7 4.2 and 4.3 | `@pixijs-userland/spine-layout/pixi7`                                  |
| `pixi6` | 6            | `@pixi-spine/*` 3.1.2 runtime-3.7, 3.8, 4.0 and 4.1                                         | `@pixijs-userland/spine-layout/pixi6`                                  |
| `pixi5` | 5            | pixi-spine 2.1.14 (3.8) or 2.0.5 (3.7), one per page                                        | `@pixijs-userland/spine-layout/pixi5`                                  |
| `pixi4` | 4.8.9        | pixi-spine 1.6.2 (3.8) or 1.5.23 (3.7), one per page                                        | `@pixijs-userland/spine-layout/pixi4`                                  |

`SpineLayout` and its controllers never import `pixi.js` or a Spine runtime; they call the
engine they are given. A game on any stack gets the same slot naming, state/event animation,
texts, skins and pointer bones.

`pixi.js` and `@esotericsoftware/spine-pixi-v8` are optional peer dependencies. The default entry
imports both, `/pixi8` imports `pixi.js` alone, and every other entry imports neither: the Pixi 4–7
engines take the `PIXI` namespace and the Spine runtimes the game loaded as parameters. A Pixi 4–7
build installs neither.

## Entry points

| Import                                   | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pixijs-userland/spine-layout`          | The Pixi 8 build with spine-pixi-v8 4.3: `SpineLayout`, `pixi8Engine`, `createPixi8Engine`, `SpineLayoutCore`, `ParticlesController`, `Sounds`/`sounds`, `skeletonVersion`, `isBinarySkeleton`, the version helpers of `/core`, `UnsupportedSpineVersionError`, `Pixi8EngineOptions`, `Pixi8Runtime`, `LazyEsotericRuntime`, `Pixi8Spine`, `Pixi8Types`, the config types and the `Engine` types                                                                                                          |
| `@pixijs-userland/spine-layout/core`     | Engine-free: `SpineLayoutCore`, every controller, `ManifestParser`, `Sounds`/`sounds`, `skeletonVersion`, `isBinarySkeleton`, `UnsupportedSpineVersionError`, the config and `Engine` types, and the version helpers `RUNTIME_MATRIX`, `runtimesOf`, `PIXI_MAJORS`, `DEFAULT_PIXI`, `ONE_RUNTIME_PER_PAGE`, `JSON_ONLY_MINORS`, `choosePixi`, `pickRuntime`, `pixiMajorsFor`, `minorOf`, `compareMinors`, `UNVERSIONED`, `PRE_PASSES`, `applyPrePasses` and `constraintLists`. Imports no rendering stack |
| `@pixijs-userland/spine-layout/pixi8`    | Everything in `/core`, plus `createPixi8Engine`, `Pixi8EngineOptions`, `Pixi8Runtime`, `LazyEsotericRuntime`, `Pixi8Spine` and `Pixi8Types`. Imports `pixi.js` and no Spine runtime                                                                                                                                                                                                                                                                                                                       |
| `@pixijs-userland/spine-layout/pixi7`    | Everything in `/core`, plus `createPixi7Engine`, `Pixi7Engine`, `Pixi7EngineOptions`, `Pixi7Runtime`, `Pixi7LazyRuntime`, `Pixi7Namespace`, `Pixi7Types`, `LegacyAssetsPort` and the `Legacy*` types                                                                                                                                                                                                                                                                                                      |
| `@pixijs-userland/spine-layout/pixi6`    | Everything in `/core`, plus `createPixi6Engine`, `Pixi6Engine`, `Pixi6EngineOptions`, `Pixi6Runtime`, `Pixi6LazyRuntime`, `Pixi6AssetsPort` and the `Pixi6*` types                                                                                                                                                                                                                                                                                                                                        |
| `@pixijs-userland/spine-layout/pixi5`    | Everything in `/core`, plus `createPixi5Engine`, `Pixi5Engine`, `Pixi5EngineOptions`, `Pixi5Namespace`, `Pixi5Spine`, `Pixi5Types` and `LegacyAssetsPort`                                                                                                                                                                                                                                                                                                                                                 |
| `@pixijs-userland/spine-layout/pixi4`    | Everything in `/core`, plus `createPixi4Engine`, `Pixi4Engine`, `Pixi4EngineOptions`, `Pixi4AssetsPort` and the `Pixi4*` / `Spine38*` types                                                                                                                                                                                                                                                                                                                                                               |
| `@pixijs-userland/spine-layout/runtimes` | `esotericRuntime`, `pixiSpineLegacy`, `pixiSpineModular` and `minorOfRuntime`, which wrap a runtime's namespace; `esotericAdapter`, `pixiSpineAdapters`, `runtimeAdapters` and `lazyRuntime`, which bind runtimes to a Pixi; `discoverGlobalRuntimes`; and their types (`SpineRuntime`, `EsotericRuntime`, `PixiSpineRuntime`, `SpineRuntimeAdapter`, `LazySpineRuntimeAdapter`, …). Imports no rendering stack                                                                                           |

Every engine is handed to the layout the same way: `new SpineLayoutCore({ engine })`, or
`new SpineLayout({ engine })` from the default entry. A game that wraps the layout in a class of
its own passes the same `{ engine }`.

## Pixi 8

The default entry is unchanged. `new SpineLayout(options)` builds on `pixi8Engine`, whose
spine-pixi-v8 4.3 reads every export, whatever its version or none, and warns about nothing:

```ts
import { SpineLayout } from '@pixijs-userland/spine-layout';

const layout = new SpineLayout();
await layout.createInstancesFromManifest(manifest, 'spines');
```

`createPixi8Engine` builds an engine that reads each export with the runtime its version picks:

| Call                                           | `@pixijs-userland/spine-layout`                                   | `@pixijs-userland/spine-layout/pixi8` |
| ---------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `createPixi8Engine()`                          | The default engine, as `pixi8Engine` is                           | Not available                         |
| `createPixi8Engine({ runtimes, pin?, warn? })` | `runtimes`, and the bundled 4.3 unless `runtimes` holds a 4.3 too | `runtimes` alone                      |

| Option     | Value                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtimes` | Required. spine-pixi-v8 runtimes, one per minor: `esotericRuntime(module)`; a lazy `{ minor, load }` (`LazyEsotericRuntime`), whose `load` returns the module or its `esotericRuntime`; or an adapter (`esotericAdapter`, `lazyRuntime`) |
| `pin`      | The runtime the game reads an export minor with: see [Choosing a runtime per skeleton](#choosing-a-runtime-per-skeleton)                                                                                                                 |
| `warn`     | Where a skeleton read by a runtime other than its own is reported; `console.warn` by default                                                                                                                                             |

```ts
import { Application } from 'pixi.js';
import { createPixi8Engine, SpineLayout } from '@pixijs-userland/spine-layout';

const engine = createPixi8Engine({
    runtimes: [{ minor: '4.2', load: () => import('spine-pixi-v8-42') }],
});

const app = new Application();
await app.init({ width: 1280, height: 720 });

const layout = new SpineLayout({ engine });
await layout.createInstancesFromManifest(manifest, 'spines');
app.stage.addChild(layout);
```

`spine-pixi-v8-42` is the game's npm alias of `@esotericsoftware/spine-pixi-v8@4.2`. With a lazy
runtime, `createInstancesFromManifest` returns a promise: the layout loads the runtimes its exports
need before it reads any skeleton.

spine-pixi-v8 4.2 and 4.3 both register their render pipe as `'spine'`, and pixi keeps the first
for both. The engine renders each runtime through a pipe of its own, `spine-4.2` and `spine-4.3`,
and gives every `Spine` it creates that `renderPipeId`. Create the engine before the renderer: a
lazy runtime's pipe is reserved then, and the renderer builds it as it starts. A pipe registered
after the renderer started is added to it when it first collects one of that runtime's spines. A
4.3 `Spine` the game creates itself still draws through the shared `'spine'` pipe: import
spine-layout before any 4.2, or load 4.2 with `import()`; otherwise the first such spine logs a
warning and draws nothing.

On Pixi 8 the runtimes' `Assets` loaders do not clash: a skeleton in `Assets` is read by the
runtime its export version picks, and each runtime takes an atlas another one's loader parsed.

## Pixi 7

`createPixi7Engine(PIXI, options?)`. `PIXI` is a pixi.js 7.2 or later namespace: `window.PIXI`,
or `import * as PIXI from 'pixi.js'` in a bundled game. Another major, or no Spine runtime, throws.

| Option      | Value                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtimes`  | `Pixi7Runtime`s: one from `esotericRuntime` or `pixiSpineModular` for the engine to bind, one bound already (`esotericAdapter`, `pixiSpineAdapters`), or a lazy `Pixi7LazyRuntime`. By default what `discoverGlobalRuntimes` finds on the page. A runtime `RUNTIME_MATRIX[7]` does not list is passed over when discovered and refused when given, but for a given runtime-4.0 (below) |
| `particles` | `@pixi/particle-emitter` 5, where it is not on `PIXI.particles`                                                                                                                                                                                                                                                                                                                        |
| `pin`       | The runtime the game reads an export minor with                                                                                                                                                                                                                                                                                                                                        |
| `warn`      | Where a skeleton read by a runtime other than its own, or a runtime left out, is reported; `console.warn` by default                                                                                                                                                                                                                                                                   |

A script-tag game, its runtimes found on the page:

```ts
import { createPixi7Engine, SpineLayoutCore } from '@pixijs-userland/spine-layout/pixi7';

const app = new PIXI.Application({ width: 1280, height: 720 });
const engine = createPixi7Engine(PIXI);

const layout = new SpineLayoutCore({ engine });
app.stage.addChild(layout);
```

A bundled game, its runtimes passed in:

```ts
import * as PIXI from 'pixi.js';
import * as particles from '@pixi/particle-emitter';
import * as base from '@pixi-spine/base';
import * as runtime38 from '@pixi-spine/runtime-3.8';
import * as runtime41 from '@pixi-spine/runtime-4.1';
import * as spine43 from '@esotericsoftware/spine-pixi-v7';
import { createPixi7Engine } from '@pixijs-userland/spine-layout/pixi7';
import { esotericRuntime, pixiSpineModular } from '@pixijs-userland/spine-layout/runtimes';

const pixiSpine = pixiSpineModular(
    base,
    { '3.8': runtime38, '4.1': runtime41 },
    { packageVersion: '4.0.6' },
);

const engine = createPixi7Engine(PIXI, {
    runtimes: [...pixiSpine, esotericRuntime(spine43)],
    particles,
});
```

Pixi 7 reads 4.0 exports with `@pixi-spine/runtime-4.1`, after the 4.0 → 4.1 pre-pass, as
pixi-spine's own loader does: `@pixi-spine/runtime-4.0` 4.0.6 turns chain path constraints wrongly,
and `RUNTIME_MATRIX[7]` has no 4.0 runtime. A runtime-4.0 passed in `runtimes` is left out with a
warning. A 4.0 `.skel` has no reader on Pixi 7; Pixi 6's runtime-4.0 reads one.

The engine reads skeletons from their source, atlas text and page textures: pixi-spine's and
spine-pixi-v7's `Assets` loaders claim each other's files (see
[Loading on Pixi 4–7](#loading-on-pixi-47)).

## Pixi 6

`createPixi6Engine(PIXI, options?)`. `PIXI` is a pixi.js 6 namespace. Another major, or no Spine
runtime, throws.

| Option      | Value                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtimes`  | `Pixi6Runtime`s, one per minor: from `pixiSpineModular` or `discoverGlobalRuntimes`, or a lazy `Pixi6LazyRuntime`; the engine binds each itself and refuses one bound already. By default the first of each minor the page's scripts loaded |
| `particles` | pixi-particles 4 or `@pixi/particle-emitter` 5, where it is not on `PIXI.particles`                                                                                                                                                         |
| `renderer`  | Its interaction manager reports every pointer move, hit or not                                                                                                                                                                              |
| `loaders`   | Loaders besides `PIXI.Loader.shared` whose resources count as assets, e.g. an `app.loader`                                                                                                                                                  |
| `pin`       | The runtime the game reads an export minor with                                                                                                                                                                                             |
| `warn`      | Where a skeleton read by a runtime other than its own, or a runtime the page loaded twice, is reported; `console.warn` by default                                                                                                           |

```ts
import { createPixi6Engine, SpineLayoutCore } from '@pixijs-userland/spine-layout/pixi6';

const app = new PIXI.Application({ width: 1280, height: 720 });
const engine = createPixi6Engine(PIXI, { renderer: app.renderer });

const layout = new SpineLayoutCore({ engine });
app.stage.addChild(layout);
```

`@pixi-spine/*` 3.1's `dist/runtime-*.js` scripts read their base from `PIXI.spine.base`, which
`dist/base.js` does not set: set `PIXI.spine.base = PIXI.spine` between the two.

## Pixi 5

`createPixi5Engine(PIXI, options?)`. `PIXI` is a pixi.js 5 namespace with pixi-spine 2.x on it, and
pixi-particles 4 on `PIXI.particles` for particles. Another major, or no pixi-spine, throws.

| Option     | Value                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime`  | The page's one pixi-spine: 2.1 reads 3.8 exports, 2.0 reads 3.7, and both own `PIXI.spine`. By default the one there; `pixiSpineLegacy(PIXI.spine, { packageVersion })` names its exact version, and `discoverGlobalRuntimes` finds one kept on a global of its own |
| `renderer` | Its interaction manager reports every pointer move, hit or not                                                                                                                                                                                                      |
| `loaders`  | Loaders besides `PIXI.Loader.shared` whose resources count as assets, e.g. an `app.loader`                                                                                                                                                                          |
| `pin`      | Reads the other minor's exports with the page's runtime. Their skins do not survive it: 2.1.14 finds none in a 3.7 export, and 2.0.5 throws on a 3.8 one's                                                                                                          |
| `warn`     | Where such a cross-read is reported; `console.warn` by default                                                                                                                                                                                                      |

```ts
import { createPixi5Engine, SpineLayoutCore } from '@pixijs-userland/spine-layout/pixi5';

const app = new PIXI.Application({ width: 1280, height: 720 });
const engine = createPixi5Engine(PIXI, { renderer: app.renderer });

const layout = new SpineLayoutCore({ engine });
app.stage.addChild(layout);
```

## Pixi 4

Load the legacy stack as plain scripts, in this order, so everything lands on `window.PIXI`:

```html
<script src="pixi.js@4.8.9/dist/pixi.min.js"></script>
<script src="pixi-spine@1.6.2/dist/pixi-spine.js"></script>
<script src="pixi-particles@4.3.0/dist/pixi-particles.min.js"></script>
```

`pixi-spine@1.6.x` (npm tag `pixi4-spine3.8`) is the Spine 3.8 runtime for Pixi v4, and 1.5.23
the 3.7 one. pixi-spine 2.x is for Pixi v5, so a "v4 + Spine 3.8" bundle is 1.6.x. pixi-particles
is optional: without it the engine has no particles port.

`createPixi4Engine(PIXI, options?)`. The engine takes the `PIXI` namespace as a parameter and never
resolves `pixi.js` itself.

| Option     | Value                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `renderer` | Its interaction manager reports every pointer move, hit or not                                                                                                                                                                                               |
| `runtime`  | The pixi-spine 1.x to render with, on a page without `PIXI.spine`: from `pixiSpineLegacy` or `discoverGlobalRuntimes`. Where `PIXI.spine` is loaded too, `PIXI.loader` reads every skeleton with that one, and `readSkeletonFromAssets` refuses what it read |
| `pin`      | The runtime minor the game reads an export minor with, e.g. `{ '3.7': '3.8' }`                                                                                                                                                                               |
| `warn`     | Where a skeleton read by a runtime other than its own is reported; `console.warn` by default                                                                                                                                                                 |

```ts
import { createPixi4Engine, SpineLayoutCore } from '@pixijs-userland/spine-layout/pixi4';

const app = new PIXI.Application({ width: 1280, height: 720 });
const engine = createPixi4Engine(PIXI, { renderer: app.renderer });

const layout = new SpineLayoutCore({ engine });
app.stage.addChild(layout);
```

`createPixi4Engine` throws when `PIXI` is not v4, when no `runtime` is given and `PIXI.spine` is
missing, and when the runtime is not a pixi-spine 1.x whose `Spine` is a container of this `PIXI`.
The legacy ports add `copyFrom` to v4's `Point` and `ObservablePoint`, which the core uses.

## Loading on Pixi 4–7

The legacy assets port reads, in order: the resources of the shared loader (`PIXI.loader` on 4,
`PIXI.Loader.shared` on 5 and 6) and of `loaders`; its own registry; `PIXI.Assets` on 7; and the
texture cache. `readSkeletonFromAssets` takes the `spineData` a pixi-spine loader already built
from a skeleton `.json` and its sibling `.atlas`, if one of the engine's runtimes made it, and
otherwise reads the skeleton from its source, atlas text and page textures:

```ts
import { ManifestParser } from '@pixijs-userland/spine-layout/pixi4';

PIXI.loader
    .add('spines/root.json')
    .add('settings/texts.json')
    .load((_loader, resources) => {
        const manifest = ManifestParser.fromLoaderResources(resources);

        layout.createInstancesFromManifest(manifest, 'spines');
    });
```

`fromLoaderResources` lists every resource under its loader name, and a skeleton pixi-spine
parsed with the `.atlas` and `.png` aliases the manifest pairing expects. On Pixi 5 and 6 the
loader is `PIXI.Loader.shared`.

Pixi 7 has no loader resources: load into `PIXI.Assets`. A pixi-spine runtime reads atlas text, so
an atlas an `Assets` loader would parse is loaded with `loadParser: 'loadTxt'`; an atlas
spine-pixi-v7's loader parsed is read by the Esoteric runtime the export picks.

Or from raw data, with no loader:

```ts
layout.createInstancesFromDataArray([
    { name: 'root', skeleton: json, atlasText, textures: { 'page.png': texture } },
]);
```

`textures` are the engine's `Texture`s by atlas page name. A project without a loader behind it
(the editor) can fill the assets port directly with `engine.assets.set(alias, value)`.

## Spine version

A Spine export is read by the runtime of its own editor major.minor. spine-ts does not check the
version, so another minor's export throws deep in the reader or loads with data missing.
`skeletonVersion` tells you which a file is:

```ts
import { skeletonVersion } from '@pixijs-userland/spine-layout/core';

skeletonVersion(json); // "3.8.99"
skeletonVersion(skelBytes); // "4.3.23"
skeletonVersion(unknown); // undefined
```

It takes a parsed `.json` or the bytes of a `.skel` (`ArrayBuffer` or `Uint8Array`), and returns
`undefined` when the file does not say. `minorOf` gives the major.minor that picks the runtime:
`4.1-from-4.2.43` is a 4.1 export.

`RUNTIME_MATRIX` holds the runtimes each Pixi has, and `runtimesOf(pixi)` lists them. What reads
each export minor, with no pin:

| Export | Pixi 4            | Pixi 5            | Pixi 6        | Pixi 7                         | Pixi 8                              | `DEFAULT_PIXI` |
| ------ | ----------------- | ----------------- | ------------- | ------------------------------ | ----------------------------------- | -------------- |
| 3.7    | pixi-spine 1.5.23 | pixi-spine 2.0.5  | `runtime-3.7` | `runtime-3.7`                  | —                                   | 4              |
| 3.8    | pixi-spine 1.6.2  | pixi-spine 2.1.14 | `runtime-3.8` | `runtime-3.8`                  | —                                   | 4              |
| 4.0    | —                 | —                 | `runtime-4.0` | `runtime-4.1` after `4.0->4.1` | 4.2 after `4.0->4.1` and `4.1->4.2` | 7              |
| 4.1    | —                 | —                 | `runtime-4.1` | `runtime-4.1`                  | 4.2 after `4.1->4.2`                | 7              |
| 4.2    | —                 | —                 | —             | spine-pixi-v7 4.2              | spine-pixi-v8 4.2                   | 8              |
| 4.3    | —                 | —                 | —             | spine-pixi-v7 4.3              | spine-pixi-v8 4.3                   | 8              |

`runtime-*` is `@pixi-spine/runtime-*`, 3.1.2 on Pixi 6 and 4.0.6 on Pixi 7. Pixi 8 reads 4.0 and
4.1 only with its 4.2 runtime registered. A pre-pass rewrites JSON, so where one is named a `.skel`
of that minor has no reader. 3.7 is JSON only on every Pixi
(`JSON_ONLY_MINORS`), and Pixi 4 and 5 load one pixi-spine per page (`ONE_RUNTIME_PER_PAGE`).
`pixiMajorsFor(minor)` lists the Pixi majors that read a minor.

One Pixi major is live per page. The layout's prototype chain is linked to the container class of
the engine built last, and the Pixi 4–7 scripts all write `window.PIXI`, so a page cannot run
layouts on two Pixi majors at once. Several runtimes on one Pixi are fine.

## Choosing a runtime per skeleton

Every engine reads a skeleton with the runtime `pickRuntime` gives its export version, in this
order:

| Step     | Runtime                                                                                | Reported                                                                    |
| -------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Pin      | The registered runtime `pin` names for the export's minor, reading the export as it is | A warning naming what the cross-read loses                                  |
| Exact    | The runtime of the export's own major.minor                                            | Nothing                                                                     |
| Pre-pass | The nearest newer runtime the JSON pre-passes reach, after those pre-passes            | A warning naming the pre-passes                                             |
| Skip     | None: `UnsupportedSpineVersionError`                                                   | The layout logs `[SpineLayout] Skipped spine "<id>": …` and builds the rest |

The pre-passes, `PRE_PASSES`, chain: a 4.0 export reaches a 4.2 runtime through both. They rewrite
the parsed JSON (`applyPrePasses`), never a `.skel`.

| Pre-pass   | Rewrite                            |
| ---------- | ---------------------------------- |
| `4.0->4.1` | Animation `deform` → `attachments` |
| `4.1->4.2` | Bone `transform` → `inherit`       |

### Pins

A pin, `RuntimePin`, maps an export minor to the runtime minor the game reads it with, as a game
that ships one runtime does:

```ts
createPixi8Engine({ runtimes, pin: { '4.2': '4.3', '*': '4.3' } });
```

The key `"*"` (`UNVERSIONED`) is for exports that name no Spine version: they have no minor to
route by, so without it they are skipped. A pin to the export's own minor, or to a runtime the
engine does not have, is passed over. `choosePixi` takes the same pin as `spine`, beside the Pixi
a project ships with (`ProjectPin`).

A cross-read reads the export with no pre-pass. What the warning names it losing:

| Cross-read | Lost                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.2 → 4.3  | The top-level `ik`/`transform`/`path`/`physics` constraint lists, which 4.3 does not read; it may throw. Given the JSON, the warning names the lists this export holds, or says it holds none |
| 4.1 → 4.3  | Bone `transform` and every constraint; some exports throw                                                                                                                                     |
| 4.1 → 4.2  | Bone `transform`: every bone inherits its full transform                                                                                                                                      |
| 4.0 → 4.1  | Mesh deform keys; on `@pixi-spine/runtime-4.1`, nothing measured: it converts a 4.0 export itself                                                                                             |
| Any other  | The runtime reads its own minor only: expect missing data, wrong poses or a throw                                                                                                             |

### Warnings and skips

Every read by a runtime other than the export's own goes to the engine's `warn`, naming the
skeleton's file where it is known. The default Pixi 8 engine is the exception: it pins every minor to 4.3, `"*"`
included, and reports nothing, as before.

An export no registered runtime reads throws `UnsupportedSpineVersionError`, whose `file`,
`version`, `registered` (the engine's runtime minors) and `pixiMajors` (the Pixi majors that could
render it) are also in its message; for a `.skel` it names the JSON-only runtimes. The layout
catches it per skeleton, logs it and builds the rest.

Where a runtime is lazy (Pixi 6, 7 and 8), `engine.spine.prepare(minors)` loads the ones the
exports need, and the layout awaits it before it reads anything. A runtime that fails to load fails only the skeletons it
would read, each logged and skipped; the next `prepare` that needs it tries again.

### Choosing the Pixi

A game picks its Pixi. `choosePixi(exportVersions, pin?)` is the choice for a folder of exports,
as the editor makes it: the pinned Pixi; else `DEFAULT_PIXI` of the newest export minor, if that
Pixi reads every export; else the newest Pixi that does; else that default, the exports it cannot
read skipped. It returns the `pixi`, the `reason`, a one-line `message`, the `runtimes` the exports
need and the runtime of each file (`perFile`).

## Several runtimes on one engine

An engine's `spine` port is a composite over one `SpineRuntimeAdapter` per runtime: the runtime's
`SpineRuntimeInfo`, its own port, `owns(object)` and `readsBinary`.

- `readSkeleton` picks the runtime, runs the pick's pre-passes and reads with that runtime.
- Every other call goes to the runtime that `owns` its argument, by `instanceof` against that
  runtime's own classes (`SkeletonData`, `Spine`, `Skeleton`, `Bone`, `Slot`, `Animation`,
  attachments).
- `engine.spine.runtimes` lists the runtimes; `engine.spine.runtimeOf(spineOrData)` names the one
  that read a skeleton or built a spine.
- Two runtimes of one minor throw.

`readSkeleton`, from source, atlas text and page textures, is the read that works over any mix of
runtimes, and `createInstancesFromDataArray` reads that way: on Pixi 7, pixi-spine's and
spine-pixi-v7's `Assets` loaders claim each other's files. The Pixi 6, 7 and 8 engines still serve
`readSkeletonFromAssets` across their runtimes, by the runtime the export picks.

`/runtimes` turns what a game imported or loaded into runtimes:

| Function                                               | Does                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `esotericRuntime(module, version?)`                    | Wraps a spine-pixi-v7 or spine-pixi-v8 module; the minor is read off the module                                                                                                                                  |
| `pixiSpineLegacy(namespace, { packageVersion })`       | Wraps pixi-spine 1.x or 2.x, `PIXI.spine`                                                                                                                                                                        |
| `pixiSpineModular(base, runtimes, { packageVersion })` | Wraps `@pixi-spine/base` and its runtimes, keyed by minor                                                                                                                                                        |
| `discoverGlobalRuntimes(scope?)`                       | The runtimes a page's scripts left on `scope` (`globalThis`): `PIXI.spine`, `PIXI.spine37` … `spine41`, Esoteric's `spine`, and app-magic-editor's `SpineRuntime_*` bundles; not pixi-spine's all-in-one bundles |
| `esotericAdapter(runtime, pixi, options?)`             | Binds an Esoteric runtime to its Pixi; on v8 this registers its render pipe                                                                                                                                      |
| `pixiSpineAdapters(runtimes, host)`                    | Binds pixi-spine runtimes to their Pixi and the engine's asset cache, over one port                                                                                                                              |
| `runtimeAdapters(runtimes, host)`                      | Binds any mix of the two                                                                                                                                                                                         |
| `lazyRuntime(info, load)`                              | An adapter loaded on demand: `info` names the runtime, so the engine routes to it before it loads                                                                                                                |

The engines bind the runtimes they are given. Pixi 7 and 8 also take adapters bound already;
Pixi 4–6 take runtimes only.

## Differences between the engines

| Area                | Pixi 8                                                                                                                                                                          | Pixi 4–7                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events              | Federated: `eventMode`, and pointer moves from `globalpointermove`                                                                                                              | Pixi 4–6: the interaction manager, `interactive`; pointer moves from `renderer`'s interaction manager when it is given, else from `pointermove` on an empty interactive child. Pixi 7: federated, as on Pixi 8                                                                                     |
| Hit-testing         | `eventMode` and `hitArea`; `shieldFromHitTesting` overrides `containsPoint`, since every child of an interactive ancestor answers. A spine-pixi-v8 `Spine` answers as one shape | `interactive` (4–6) or `eventMode` (7), and `hitArea`; `shieldFromHitTesting` overrides `containsPoint` likewise. pixi-spine and spine-pixi-v7 spines answer through their sprites and meshes, each shielded, those made later included; a `BitmapText`'s glyphs get `interactiveChildren = false` |
| Slot objects        | spine-pixi-v8 attaches them to the slot                                                                                                                                         | pixi-spine has none: the engine hangs the object off a holder that cancels the slot container's transform and alpha, so it follows the bone as on Pixi 8 (`TransformBase` on 4, `setFromMatrix` on 5–7). spine-pixi-v7 attaches them itself                                                        |
| Text `justify`      | Supported                                                                                                                                                                       | `Text`: not supported, `align: "justify"` becomes `left`. `BitmapText`: from Pixi 6 (`text.capabilities.byNode.bitmapText.justify`). `text.capabilities.justify`, what both can, is `false`                                                                                                        |
| Text `maxHeight`    | Supported                                                                                                                                                                       | Supported                                                                                                                                                                                                                                                                                          |
| Bitmap font `.fnt`  | Text or XML                                                                                                                                                                     | Text or XML. On 4 to 5.2 the engine parses it and registers it with `BitmapText.registerFont`; from 5.3 `BitmapFont.install` reads it                                                                                                                                                              |
| `lineHeight`        | A style key                                                                                                                                                                     | A `Text` style key. No legacy `BitmapText` has one: kept per node and applied to the font while that node lays out                                                                                                                                                                                 |
| Physics, sequences  | Both, in 4.2 and 4.3                                                                                                                                                            | As the skeleton's runtime reads them: neither in 3.7 or 3.8; sequences from `@pixi-spine/runtime-4.1`; both in spine-pixi-v7 4.2 and 4.3                                                                                                                                                           |
| Draw order to setup | 4.3 has `drawOrder.setupPose()`; on 4.2 the `'drawOrder'` scope assigns it by hand                                                                                              | spine-ts up to 4.2 resets draw order only inside `setSlotsToSetupPose`, so the `'drawOrder'` scope assigns it by hand. spine-pixi-v7 4.3 as on Pixi 8                                                                                                                                              |
| Particles           | No port: one warning, every call a no-op                                                                                                                                        | pixi-particles 4.3 on Pixi 4–6, `@pixi/particle-emitter` 5 on Pixi 6 and 7, from `PIXI.particles` or the `particles` option (6, 7). pixi-particles on Pixi 7 is refused with a warning                                                                                                             |

## Examples

The repo's `examples/` folder has one scene per Pixi major, each built with that major's engine:

| Scene   | Engine and runtimes                                                        | Layout                                         |
| ------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| `pixi8` | `createPixi8Engine`: spine-pixi-v8 4.3, and 4.2 as a lazy runtime          | A 4.3 popup and a 4.2 button, one scene        |
| `pixi7` | `createPixi7Engine`: `@pixi-spine/runtime-3.8` 4.0.6 and spine-pixi-v7 4.3 | The 3.8 layout and the 4.3 popup, side by side |
| `pixi6` | `createPixi6Engine`: `@pixi-spine/runtime-3.8` 3.1.2                       | The 3.8 layout                                 |
| `pixi5` | `createPixi5Engine`: pixi-spine 2.1.14                                     | The 3.8 layout                                 |
| `pixi4` | `createPixi4Engine`: pixi-spine 1.6.2, or 1.5.23 with `?spine=3.7`         | The 3.8 layout, or a 3.7 export                |

Pixi 4 to 7 are loaded the way a legacy game loads them, as `<script>` globals; the runtimes that
ship no browser script of their own are bundled into `examples/vendor/` as the server starts. Each
page says which runtime read which skeleton. From the package, after `pnpm install`:

```sh
pnpm examples --port <port> --strictPort --no-open
```

Then open `http://localhost:<port>/examples/`.

## Testing

`tests/engine-contract/contract.ts` is the shared contract suite: it is written against `Engine`
alone and runs per engine and per runtime, against that runtime's real package. Each runtime reads
the contract fixture of its export minor (`CONTRACT_FIXTURES`): `contract-4.3.*` for 4.3 and 4.2,
`contract-3.8.*` for 3.8 and, under their own version, 4.1 and 4.0, and `contract-3.7.json` for
3.7. `twoRuntimesContract` runs one engine over two runtimes, their objects interleaved. A new
engine passes it or it is not an engine.

The legacy stacks load from devDependencies aliased to avoid the v8 install: `pixi.js-v4` to
`pixi.js-v7`, `pixi-spine-v4` (1.6.2), `pixi-spine-v4-37` (1.5.23), `pixi-spine-v5-37` (2.0.5),
`pixi-spine-v5-38` (2.1.14), `@pixi-spine-v6/*` (3.1.2), `@pixi-spine-v7/*` (4.0.6),
`spine-pixi-v7-42`, `spine-pixi-v7-43`, `pixi-particles` (4.3.0) and `@pixi/particle-emitter-v5`,
under happy-dom with a stubbed canvas 2D context. `spine-pixi-v8-42` is the second Pixi 8 runtime.

## Writing another engine

An `Engine` is five ports. A port that is `undefined` is a feature the engine does not have, and
the core degrades instead of throwing.

| Port        | Job                                                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spine`     | Reads skeletons, creates and updates the `Spine`, and exposes bones, slots, setup poses, track claims and slot objects; names its `runtimes`, and `prepare`s lazy ones |
| `display`   | The container class the layout is an instance of, plus sprites, textures, hit areas, pointer events and hit-test shielding                                             |
| `text`      | `Text` and `BitmapText` nodes, `texts.json` entry to style translation, bitmap fonts and measuring, and its `capabilities`                                             |
| `assets`    | `get(alias)` and `has(alias)`, the engine's asset cache                                                                                                                |
| `particles` | Optional. `createEmitter(parent, textures, config)` returning an emitter with `emit`, `update`, `playOnce` and `destroy`                                               |

An engine over several runtimes builds `spine` with `createCompositeSpinePort`
(`src/engines/shared/compositeSpinePort.ts`) from one adapter per runtime.

Boundaries the repo enforces:

- ESLint: `src/core/**`, `src/engine/**` and `src/core.ts` may not import a rendering stack
  (`pixi.js`, `@pixi/*`, `pixi-spine`, `@pixi-spine/*`, `@esotericsoftware/*`, `pixi-particles` and
  their npm aliases) or anything under `engines/` or `runtimes/`. Every engine but pixi8 —
  `src/engines/{pixi4,pixi5,pixi6,pixi7,legacy,pixiSpine,esoteric,shared}/**`, `src/runtimes/**`
  and `src/pixi4.ts` to `src/pixi8.ts` — may import a rendering stack's types only; it is handed
  its `PIXI` and its runtimes. `src/engines/pixi8/**` and `src/index.ts` may not use the `PIXI`
  global.
- TypeScript: `tsconfig.core.json` (`types: []`) compiles the core, `Engine` and `engines/shared`
  with no rendering types in scope. `tsconfig.legacy.json`, `tsconfig.pixiSpine.json`,
  `tsconfig.esoteric.json`, `tsconfig.runtimes.json`, `tsconfig.pixi4.json` and
  `tsconfig.entries.json` build on it with `types: []` too; `tsconfig.pixi8.json` builds pixi8
  with pixi.js's types. `pnpm build` builds them all; `pnpm check-types` runs `tsconfig.core.json`
  and `tsconfig.check.json`.
