---
title: Installation
---

The package is `@pixijs-userland/spine-layout`. It is published to GitHub Packages, not to
npmjs.com, so the registry has to be named once per project.

## From GitHub Packages

Add an `.npmrc` beside your `package.json`:

```ini
@pixijs-userland:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

GitHub Packages asks for a token even for a public package. Create a
[personal access token (classic)](https://github.com/settings/tokens) with the `read:packages`
scope and export it as `GITHUB_TOKEN`, in your shell and in CI. Keep the token itself out of the
committed file.

Then install the layout with the Pixi stack it renders on:

```bash
pnpm add @pixijs-userland/spine-layout pixi.js @esotericsoftware/spine-pixi-v8 howler
```

`npm install` and `yarn add` take the same package names.

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
import { SpineLayout } from '@pixijs-userland/spine-layout';

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
