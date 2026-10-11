---
title: Engines
sidebar_position: 8
---

spine-layout is one core behind a narrow `Engine` interface, with two implementations:

| Engine  | Rendering stack                                              | Spine runtime | Entry                                 |
| ------- | ------------------------------------------------------------ | ------------- | ------------------------------------- |
| `pixi8` | pixi.js v8 + `@esotericsoftware/spine-pixi-v8`               | 4.3           | `@pixijs-userland/spine-layout`       |
| `pixi4` | PIXI v4.8.9 + pixi-spine 1.6 (spine-ts 3.8) + pixi-particles | 3.8           | `@pixijs-userland/spine-layout/pixi4` |

`SpineLayout` and its controllers never import `pixi.js` or a Spine runtime; they call the
engine they are given. A game on either stack gets the same slot naming, state/event animation,
texts, skins and pointer bones.

## Entry points

| Import                                | Exports                                                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pixijs-userland/spine-layout`       | The pixi8 build: `SpineLayout`, `pixi8Engine`, `createPixi8Engine`, `SpineLayoutCore`, `ParticlesController`, `sounds`, `skeletonVersion`, the config types and the `Engine` types      |
| `@pixijs-userland/spine-layout/core`  | Engine-free: `SpineLayoutCore`, every controller, `ManifestParser`, `Sounds`/`sounds`, `skeletonVersion`, `isBinarySkeleton`, the config and `Engine` types. Imports no rendering stack |
| `@pixijs-userland/spine-layout/pixi4` | Everything in `/core`, plus `createPixi4Engine`, `Pixi4Engine`, `Pixi4EngineOptions`, `Pixi4AssetsPort` and the `Pixi4*` / `Spine38*` types                                             |

`pixi.js` and `@esotericsoftware/spine-pixi-v8` are optional peer dependencies. A PIXI v4 build
installs neither.

## Default entry: pixi8

Unchanged. `new SpineLayout(options)` builds its own `pixi8Engine`; nothing to configure.

```ts
import { SpineLayout } from '@pixijs-userland/spine-layout';

const layout = new SpineLayout();
await layout.createInstancesFromManifest(manifest, 'spines');
```

## PIXI v4

Load the legacy stack as plain scripts, in this order, so everything lands on `window.PIXI`:

```html
<script src="pixi.js@4.8.9/dist/pixi.min.js"></script>
<script src="pixi-spine@1.6.2/dist/pixi-spine.js"></script>
<script src="pixi-particles@4.3.0/dist/pixi-particles.min.js"></script>
```

`pixi-spine@1.6.x` (npm tag `pixi4-spine3.8`) is the Spine 3.8 runtime for Pixi v4. pixi-spine
2.x is for Pixi v5, so a "v4 + Spine 3.8" bundle is 1.6.x. pixi-particles is optional: without
it the engine has no particles port.

The engine takes the `PIXI` namespace as a parameter and never resolves `pixi.js` itself. Pass
the renderer so the layout hears every pointer move:

```ts
import { createPixi4Engine, SpineLayoutCore } from '@pixijs-userland/spine-layout/pixi4';

const app = new PIXI.Application({ width: 1280, height: 720 });
const engine = createPixi4Engine(PIXI, { renderer: app.renderer });

const layout = new SpineLayoutCore({ engine });
app.stage.addChild(layout);
```

`createPixi4Engine` throws if `PIXI.spine` is missing. It adds `copyFrom` to v4's `Point` and
`ObservablePoint`, which the core uses.

A game that wraps the layout in its own class (`MagicLayout`) passes the same `{ engine }`.

### Loading

Through `PIXI.loader`. The engine's assets port reads `PIXI.loader.resources`, and
`readSkeletonFromAssets` takes the `spineData` pixi-spine's loader already built from a skeleton
`.json` and its sibling `.atlas`:

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
parsed with the `.atlas` and `.png` aliases the manifest pairing expects.

Or from raw data, with no loader:

```ts
layout.createInstancesFromDataArray([
    { name: 'root', skeleton: json, atlasText, textures: { 'page.png': texture } },
]);
```

`textures` are `PIXI.Texture`s by atlas page name. A project without a `PIXI.loader` behind it
(the editor) can fill the assets port directly with `engine.assets.set(alias, value)`.

## Differences between the engines

| Area                  | pixi8                                    | pixi4                                                                                                                                                    |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slot objects          | spine-pixi-v8 attaches them to the slot  | pixi-spine has none: the engine hangs the object off a holder that cancels the slot container's transform and alpha, so it follows the bone like v8 does |
| Rotated atlas regions | Handled by Pixi's texture                | `subTexture` rotates through `groupD8` and divides the page pixels by the page's resolution                                                              |
| Hit-testing           | `eventMode` and `hitArea`                | `interactive`; `shieldFromHitTesting` overrides `containsPoint`, since v4 asks every child of an interactive ancestor                                    |
| Text `justify`        | Supported                                | Not supported; `align: "justify"` becomes `left` (`text.capabilities.justify` is `false`)                                                                |
| Text `maxHeight`      | Supported                                | Supported                                                                                                                                                |
| Bitmap font `.fnt`    | Text or XML                              | The engine parses both text and XML `.fnt`, and registers it with `BitmapText.registerFont`                                                              |
| `lineHeight`          | A style key                              | Not a v4 style key: kept per node and applied to the font while that node lays out                                                                       |
| Physics, sequences    | Spine 4.3 features                       | Not in Spine 3.8                                                                                                                                         |
| `setSlotsToSetupPose` | Draw order is a separate call            | Also resets draw order; the `'drawOrder'` scope assigns it by hand                                                                                       |
| Particles             | No port: one warning, every call a no-op | pixi-particles through `particles.port`                                                                                                                  |

## Spine version

A project is one Spine version. A 3.8 export cannot be read by the 4.3 runtime, and a 4.3 export
cannot be read by the 3.8 one. `skeletonVersion` tells you which a file is, before you pick an
engine:

```ts
import { skeletonVersion } from '@pixijs-userland/spine-layout/core';

skeletonVersion(json); // "3.8.99"
skeletonVersion(skelBytes); // "4.3.23"
skeletonVersion(unknown); // undefined
```

It takes a parsed `.json` or the bytes of a `.skel` (`ArrayBuffer` or `Uint8Array`), and returns
`undefined` when the file does not say.

One engine family is live per page. The layout's prototype chain is linked to the container
class of the engine built last, so a page cannot run a pixi8 layout and a pixi4 layout at once.

## Testing

`tests/engine-contract/contract.ts` is the shared contract suite: it is written against `Engine`
alone and runs once per engine, against that engine's real runtime and its own fixture
(`contract-4.3.*` for pixi8, `contract-3.8.*` for pixi4). A new engine passes it or it is not an
engine.

The pixi4 tests load the real stack from devDependencies aliased to avoid the v8 install:
`pixi.js-v4` (`pixi.js@4.8.9`), `pixi-spine-v4` (`pixi-spine@1.6.2`) and `pixi-particles`
(4.3.0), under happy-dom with a stubbed canvas 2D context.

`examples/pixi4` is a hand-run harness: the legacy stack as `<script>` tags and
`tests/fixtures/contract-3.8.json` on a loop. See its README for the Vite command.

## Writing another engine

An `Engine` is five ports. A port that is `undefined` is a feature the engine does not have, and
the core degrades instead of throwing.

| Port        | Job                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `spine`     | Reads skeletons, creates and updates the `Spine`, and exposes bones, slots, setup poses, track claims and slot objects     |
| `display`   | The container class the layout is an instance of, plus sprites, textures, hit areas, pointer events and hit-test shielding |
| `text`      | `Text` and `BitmapText` nodes, `texts.json` entry to style translation, bitmap fonts and measuring, and its `capabilities` |
| `assets`    | `get(alias)` and `has(alias)`, the engine's asset cache                                                                    |
| `particles` | Optional. `createEmitter(parent, textures, config)` returning an emitter with `emit`, `update`, `playOnce` and `destroy`   |

Boundaries the repo enforces:

- ESLint: `src/core/**`, `src/engine/**` and `src/core.ts` may not import `pixi.js`, `@esotericsoftware/*`,
  `pixi-spine`, `pixi-particles` or anything under `engines/`. `src/engines/pixi4/**` and `src/pixi4.ts` may not
  import a rendering stack either; they receive `PIXI`. `src/engines/pixi8/**` and `src/index.ts` may not use
  the `PIXI` global.
- TypeScript: `tsconfig.core.json` (`types: []`) compiles the core and `Engine` with no rendering types
  in scope; `tsconfig.pixi4.json` builds the pixi4 engine on top of it. `pnpm check-types` runs both
  plus `tsconfig.check.json` for pixi8.
