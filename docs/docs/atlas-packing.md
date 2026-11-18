---
title: Packing atlases
---

[Spine View](./spine-view.md) and [Magic Editor](./magic-editor.md) open a layout straight from
Spine's raw export: a skeleton JSON beside a folder of loose images. That is the right format
to work in, because an animator re-exports and the scene updates with nothing in between. It is
the wrong format to ship. A browser would fetch every image on its own, the GPU would bind a
texture per attachment, and there would be no smaller copy for a phone and no AVIF or WebP.

So a game keeps the raw export in its sources and lets the build pack it. The
`@pixi/spine-layout/assetpack` entry is a pair of [AssetPack](https://pixijs.io/assetpack/)
pipes that turn each skeleton's loose images into a real Spine atlas, the same `.atlas` and page
that Spine's own packer writes. The rest of AssetPack then compresses, scales and cache-busts it
like any other texture.

```
raw-assets/game{m}/                  build output, assets/game/
├─ root.json   root/bg.png           ├─ root.json   root.atlas   root.png
├─ hero.json   hero/*.png            ├─ hero.json   hero.atlas   hero.png
├─ hero.spine  root.spine            │  … and @0.5x, .webp, .avif of each
├─ settings/texts.json               ├─ settings/texts.json
└─ .editor{ignore}/                  └─ manifest.json (one level up)
```

The folder on the left is exactly the folder you open in Spine View. Nothing is renamed or moved
for the build.

A runnable copy of everything on this page is in
[`examples/assetpack`](https://github.com/pixijs-userland/spine-layout/tree/main/examples/assetpack).

## Exporting from Spine

Export each skeleton as **JSON** with **texture packing turned off**. Spine then writes
`<name>.json` and leaves the images where the project keeps them. Point the skeleton's images
path at a folder beside the JSON (`./hero/`), which is what Spine View expects anyway.

A `.json` with a `.atlas` of the same name beside it is left alone. A game can therefore pack some
skeletons in Spine and leave others to the build while it migrates.

## Install

```bash
pnpm add -D @assetpack/core sharp
```

`@pixi/spine-layout` is already a dependency of the game. Its `assetpack` entry runs in
Node at build time and never reaches the browser bundle. `@assetpack/core` (1.7 or later) and
`sharp` are optional peer dependencies, needed only by a project that imports this entry.

## Configuring AssetPack

```js title="assetpack.config.mjs"
import { cacheBuster } from '@assetpack/core/cache-buster';
import { compress, mipmap } from '@assetpack/core/image';
import { json } from '@assetpack/core/json';
import { pixiManifest } from '@assetpack/core/manifest';
import { spineAtlasCacheBuster, spineAtlasCompress } from '@assetpack/core/spine';
import { spinePacker, spinePackerManifestMod } from '@pixi/spine-layout/assetpack';

const RESOLUTIONS = { default: 1, low: 0.5 };
const MANIFEST = 'manifest.json';

export function assetpackConfig({ output, production }) {
    return {
        entry: './raw-assets',
        output,
        cache: !production,
        pipes: [
            spinePacker({
                spineAtlas: { maximumTextureSize: 2048, padding: 4, allowRotation: true },
                resolutionOptions: { resolutions: RESOLUTIONS },
            }),
            json(),
            mipmap({ resolutions: RESOLUTIONS }),
            compress({
                png: production && { quality: 90 },
                webp: production && { quality: 90, alphaQuality: 90 },
                avif: production && { quality: 70, chromaSubsampling: '4:4:4' },
                jpg: false,
            }),
            ...(production
                ? [
                      spineAtlasCompress({ png: true, webp: true, avif: true }),
                      cacheBuster(),
                      spineAtlasCacheBuster(),
                  ]
                : []),
            pixiManifest({ output: MANIFEST, createShortcuts: true }),
            spinePackerManifestMod({ output: MANIFEST }),
        ],
    };
}
```

The order matters in three places:

- **`spinePacker` comes before `json`, `mipmap` and `compress`.** It claims the skeleton JSON, the
  loose images and the `.spine` files, so the later pipes never see the source images. The packed
  pages it writes are already at their final size and are marked so that `mipmap` does not scale
  them again. `compress` still converts them to WebP and AVIF.
- **`spineAtlasCompress` comes before the cache busters.** It writes one atlas per format, each
  naming that format's page, and the cache busters then hash the pages and rewrite the names
  inside the atlases.
- **`spinePackerManifestMod` comes after `pixiManifest`.** `pixiManifest` lists everything a
  skeleton produced under a single entry. The mod splits that entry into the `.json`, `.atlas` and
  `.png` the layout looks for, with each resolution and format as a `src` of one alias, so the
  Pixi resolver chooses between them.

In development the config above skips compression and hashing, so a save rebuilds quickly and the
files keep readable names.

### Alongside spritesheets

A game that also packs spritesheets runs AssetPack's `texturePacker` next to `spinePacker`. Both
packers go ahead of `json` and `mipmap`, both compressors go ahead of the cache busters, and the
two can share one resolutions object so a phone gets the same rung of every texture:

```js title="assetpack.config.mjs"
import {
    texturePacker,
    texturePackerCacheBuster,
    texturePackerCompress,
} from '@assetpack/core/texture-packer';

const RESOLUTIONS = { resolutions: { default: 1, low: 0.5 }, fixedResolution: 'default' };

pipes: [
    spinePacker({
        spineAtlas: { maximumTextureSize: 2048, padding: 8 },
        resolutionOptions: RESOLUTIONS,
    }),
    texturePacker({
        texturePacker: { width: 2048, height: 2048, padding: 8, allowRotation: true },
        resolutionOptions: { ...RESOLUTIONS, maximumTextureSize: 2048 },
    }),
    json(),
    mipmap(RESOLUTIONS),
    compress({ /* … */ }),
    ...(production
        ? [
              spineAtlasCompress({ png: true, webp: true, avif: true }),
              texturePackerCompress({ png: true, webp: true, avif: true }),
              cacheBuster(),
              texturePackerCacheBuster(),
              spineAtlasCacheBuster(),
          ]
        : []),
    pixiManifest({ output: MANIFEST, createShortcuts: true }),
    spinePackerManifestMod({ output: MANIFEST }),
],
```

`spinePackerManifestMod` only rewrites the entries `spinePacker` produced, so spritesheets stay in
the manifest exactly as `pixiManifest` wrote them.

### Running it from Vite

AssetPack writes into Vite's `public/` folder. The dev server watches the sources, and a build
packs once before Vite copies `public/` into `dist/`:

```js title="vite.config.mjs"
import { AssetPack } from '@assetpack/core';
import { defineConfig } from 'vite';
import { assetpackConfig } from './assetpack.config.mjs';

function assetpack() {
    let command;
    let watcher;

    return {
        name: 'assetpack',
        configResolved(config) {
            command = config.command;
        },
        async buildStart() {
            const config = assetpackConfig({
                output: 'public/assets',
                production: command === 'build',
            });

            if (command === 'build') {
                await new AssetPack(config).run();
            } else if (!watcher) {
                watcher = new AssetPack(config);
                await watcher.watch();
            }
        },
        async buildEnd() {
            await watcher?.stop();
            watcher = undefined;
        },
    };
}

export default defineConfig({ plugins: [assetpack()] });
```

Add `public/assets/` and `.assetpack/` to `.gitignore`. Both are build output.

## Loading it in the game

```js
import { SpineLayout } from '@pixi/spine-layout';
import { Application, Assets } from 'pixi.js';

const app = new Application();
await app.init({ resizeTo: window });
document.body.appendChild(app.canvas);

const manifest = await fetch('assets/manifest.json').then((response) => response.json());

await Assets.init({
    manifest,
    basePath: 'assets',
    texturePreference: {
        resolution: Math.min(screen.width, screen.height) < 600 ? 0.5 : 1,
        format: ['avif', 'webp', 'png'],
    },
});
await Assets.loadBundle('game');

const layout = new SpineLayout();
await layout.createInstancesFromManifest(manifest, 'game');
app.stage.addChild(layout);
```

`{m}` on a folder makes it a manifest bundle named after the folder, so `raw-assets/game{m}/`
becomes the bundle `game`. Its files are aliased under `game/`, and that is the folder name passed
to `createInstancesFromManifest`. `texturePreference` chooses one atlas per skeleton: a phone
gets the `@0.5x` AVIF, and a browser without AVIF falls back to WebP and then PNG. The atlas names
its own page, so only that one page is downloaded. `settings/texts.json` is found under its
shortcut alias, `texts.json`, with no code.

## How the images are found

These rules are the ones Spine View and Magic Editor use to show the same raw export, so the
packed game and the viewer cannot disagree about the art.

**The image folder.** A skeleton takes its images from the first folder beside it that matches:

1. a folder of its own name: `hero.json` uses `hero/`;
2. its plural, when no skeleton has that name: `symbol.json` uses `symbols/`, which is where a
   template skeleton's per-skin art usually lives;
3. a shared `img/`, `images/` or `pictures/` folder used by every skeleton beside it.

Folders can be nested to any depth. The rules apply in whichever folder the skeleton sits.

**The region names.** A region is the image's path inside that folder, without the extension
(`hero/eyes/blink.png` is `eyes/blink`). It can also be the bare file name, when the skeleton
refers to the image that way. Spine's own packer can flatten folders, so a skeleton can ask for
`blink`.

**Only what is used is packed.** The packer reads each skeleton's attachments and packs the regions
they reference, nothing else. A shared `img/` folder therefore does not put every texture of the
game into every atlas. An image used by two skeletons is packed into both of their pages, as a
per-skeleton Spine export would do.

**One atlas per skeleton.** The layout pairs `<id>.json`, `<id>.atlas` and `<id>.png`, so each
skeleton gets its own atlas, normally on a single page. A skeleton too large for one page
produces a warning; raise `maximumTextureSize` or split the skeleton.

**No images, no atlas.** A skeleton that attaches no image, such as one that only places and
drives other spines, is written as the JSON alone, the way Spine exports it. The layout reads it
with an empty atlas.

**Meshes are not trimmed.** Transparent borders are cut off region attachments to save page space.
A mesh samples its region's original rectangle, so any image a `mesh` or `linkedmesh` uses is
packed at full size.

**Sources are not shipped.** Loose images and `.spine` project files are consumed by the packer.
Spine View keeps its own state in `.editor{ignore}/`, and AssetPack's `{ignore}` tag leaves that
out as well.

## Options

`spinePacker(options)`:

| Option                              | Default          | What it does                                                                       |
| ----------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `spineAtlas.maximumTextureSize`     | `2048`           | Largest page side. A skeleton that does not fit spills onto a second page.         |
| `spineAtlas.padding`                | `2`              | Pixels between regions and around the page edge.                                   |
| `spineAtlas.allowTrim`              | `true`           | Cuts transparent borders off region attachments. Meshes are never trimmed.         |
| `spineAtlas.allowRotation`          | `false`          | Lets the packer turn regions 90° to fit more on a page.                            |
| `spineAtlas.powerOfTwo`             | `false`          | Rounds page sizes up to a power of two.                                            |
| `spineAtlas.alphaThreshold`         | `0`              | Alpha at or below which a border pixel counts as transparent when trimming.        |
| `resolutionOptions.resolutions`     | `{ default: 1 }` | The resolutions to pack, the same shape as `mipmap`'s. Each gets its own atlas.    |
| `resolutionOptions.fixedResolution` | `'default'`      | The only resolution packed for a skeleton tagged `{fix}`.                          |
| `resolutionOptions.template`        | `'@%%x'`         | The suffix that names a resolution in the file names, as Pixi's resolver reads it. |

Smaller resolutions reuse the full-size layout with every coordinate scaled. Each region is
resized on its own rather than by shrinking the finished page, so neighbouring regions do not
blur into each other's edges.

Tag a skeleton `{fix}` (`logo{fix}.json`) to keep it at full size on every device. Use it for
art that visibly suffers at the smaller resolution, such as hard-edged line art or a logo. The
tag can also be set from the config, without renaming the file:

```js
assetSettings: [{ files: ['**/logo.json'], metaData: { fix: true } }],
```

`spinePackerManifestMod({ output })` takes the same `output` as `pixiManifest`.

Both pipes do nothing for a skeleton that already has its own `.atlas`, so they are safe to add
to an existing project.

## Warnings worth reading

The packer reports through AssetPack's logger, and `strict` builds stop on its errors:

- **references regions with no image.** An attachment names an image that is not in the
  skeleton's folder. Spine View shows the same attachment as missing.
- **also matches … packing … instead.** Two images answer to one region and the packer chose
  one by its rules. Rename one if the choice was not intended.
- **is claimed by two images.** Two images match equally well, so only the first is packed.
  Reported as an error.
- **did not fit on one page.** Raise `maximumTextureSize` or split the skeleton.

## Watch mode

AssetPack normally rebuilds only the files that changed. When an image changes, the packer also
marks its skeleton as changed, so the atlas is repacked on the next save. In the example, saving
a PNG under `raw-assets/game{m}/hero/` rebuilds `hero.atlas` and `hero.png`.

## The atlas it writes

The output is Spine 4's text atlas format, with `bounds`, `offsets` and `rotate` lines and no
indentation, and it is read by the same `TextureAtlas` code as an atlas Spine exported. Two of its
conventions are easy to get backwards:

- **`rotate:90` is counter-clockwise.** A rotated region is stored on the page turned 90°
  counter-clockwise, and turning it 90° clockwise recovers the image. AssetPack's own
  `texturePacker` rotates the other way for Pixi spritesheets, which is why this packer composites
  its pages itself instead of reusing that one.
- **`offsets` measures Y from the bottom.** Spine's local space is Y-up, so a trimmed region has
  `offsetY = originalHeight - trimTop - trimmedHeight`.

The width and height in `bounds` are in the region's own orientation. A `rotate:90` region takes
up `height × width` on the page.

### Checking a change to the packer

After changing how regions are trimmed, rotated or placed, rebuild every region from a packed page
using nothing but its atlas, and compare it with the source image. Crop `bounds` out of the page,
turn it 90° clockwise if it has `rotate:90`, and draw it at
`(offsetX, originalHeight - offsetY - height)` on an empty `originalWidth × originalHeight`
canvas. It should match the source, apart from a difference of up to 2 in one colour channel on
semi-transparent pixels, which is `sharp` rounding premultiplied alpha while it composites.

## The example

`examples/assetpack` is a complete Vite and AssetPack project laid out as described above. From
the package root, after `pnpm install`:

```sh
pnpm examples:assetpack --port <port> --strictPort
pnpm examples:assetpack:build
```

The first command starts the dev server with AssetPack watching `raw-assets/`. The second writes
a production build to `examples/assetpack/dist`, with AVIF, WebP and PNG at 1x and 0.5x, all
cache-busted. To start a game from it, copy the folder and replace the `resolve.alias` in its
`vite.config.mjs` with an installed `@pixi/spine-layout`.
