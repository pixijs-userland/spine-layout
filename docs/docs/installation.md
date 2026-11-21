---
title: Installation
---

The package is [`@pixi/spine-layout`](https://www.npmjs.com/package/@pixi/spine-layout) on npm.

## From npm

Install the layout with the Pixi stack it renders on:

```bash
pnpm add @pixi/spine-layout pixi.js @esotericsoftware/spine-pixi-v8 howler
```

`npm install` and `yarn add` take the same package names.

The Pixi and the Spine runtime are yours to pick, so they are not bundled with the layout: install
the versions that read your Spine exports. The line above is Pixi 8 with spine-pixi-v8 4.3, for
4.3 exports. Exports from 4.0 to 4.2 need spine-pixi-v8 4.2, and 3.x exports need Pixi 7 or
older; the [Spine version](./engines.md#spine-version) table lists every pair.

`howler` is only for the built-in sound player. `/core` and the Pixi 4–7 entries never import it,
so leave it out there unless you pass that player in. The default entry and `/pixi8` import it
whether the player is on or not, so with them it stays in the install line.

| Peer dependency                   | Version | Needed for                                          |
| --------------------------------- | ------- | --------------------------------------------------- |
| `pixi.js`                         | ^8.19   | The default entry and `/pixi8`                      |
| `@esotericsoftware/spine-pixi-v8` | ^4.3.7  | The default entry and `/pixi8`                      |
| `howler`                          | ^2.2.4  | The built-in sound player; `/core` never imports it |

On Pixi 4 to 7 the Pixi and Spine runtimes are loaded by the page, not installed as peers. See
[Engines](./engines.md).

## From the repository

To work against the sources, or to pin a commit that is not released yet, add the repository as a
submodule and depend on the folder:

```bash
git submodule add https://github.com/pixijs-userland/spine-layout.git packages/spine-layout
pnpm add ./packages/spine-layout pixi.js @esotericsoftware/spine-pixi-v8 howler
```

The repository has no built `dist`. Every entry also has a `source` export condition that points
at the TypeScript, so tell the bundler to take it. In `vite.config.ts`:

```ts
export default defineConfig({
    resolve: { conditions: ['source'] },
});
```

Or build it once, and the default `import` condition resolves:

```bash
pnpm --dir packages/spine-layout install
pnpm --dir packages/spine-layout build
```

## First scene

```ts
import { Application, Assets } from 'pixi.js';
import { SpineLayout } from '@pixi/spine-layout';

const manifest = {
    bundles: [
        {
            name: 'game',
            assets: [
                { alias: 'spine/root.json', src: 'spine/root.json' },
                { alias: 'spine/hero.json', src: 'spine/hero.json' },
                { alias: 'spine/hero.atlas', src: 'spine/hero.atlas' },
                { alias: 'spine/hero.png', src: 'spine/hero.png' },
            ],
        },
    ],
};

const app = new Application();
await app.init({ resizeTo: window });
document.body.appendChild(app.canvas);

await Assets.init({ manifest });
await Assets.loadBundle('game');

const layout = new SpineLayout();
await layout.createInstancesFromManifest(manifest, 'spine');
app.stage.addChild(layout);
```

`root` is built first and every `spine_<id>` slot under it gets its spine. From here:

- [Initialization](./initialization.md) for the other ways to build a scene.
- [Slot Naming](./slot-naming.md) and [Animation System](./animation-system.md) for the
  conventions the Spine files follow.
- [Spine View](./spine-view.md) to see a folder of exports as the layout builds it, before any
  of this code exists.
