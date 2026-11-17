---
title: Spine View
---

[spineview.dev](https://spineview.dev) is a free viewer for spine-layout scenes. It runs in the
browser, needs no account and no install, and is built on this library: what it shows is what
`SpineLayout` builds from the same files in a game.

**Open it: [spineview.dev](https://spineview.dev)**

## What it is for

An animator names slots and animation folders in Spine; a developer calls them by those names.
Spine View is where both check the result without a game build:

- Open a folder of Spine exports. The scene is assembled from `root` down through the `spine_`
  slots, with texts, buttons, sounds and particles wired from the names.
- Play every state, event and animation the layout found, on all spines at once or on one.
- Switch skins, type into text nodes, click the `button_` slots.
- Chain animations into a sequence and save it with the project.
- Edit `settings/texts.json` and `settings/particles.json` in a panel and save them back to the
  folder.

The folder is read in place through the browser's file access. Nothing is uploaded.

## Pixi and Spine versions

The viewer reads the Spine version of each export and loads the Pixi that renders it, from Pixi 4
with Spine 3.7 up to Pixi 8 with Spine 4.3, through the same [engines](./engines.md) a game
uses. A `settings/project.json` in the folder pins the Pixi your game ships with.

## Examples

Its documentation has a runnable example for each convention: slot embedding, states and events,
skins, buttons, looping, texts, sequences, sounds and particles. Each opens in the viewer and can
be downloaded as a folder to start from.

## From the viewer to a game

The folder you open in Spine View is the folder the game loads. See
[Installation](./installation.md) for the code that builds it, and
[Packing atlases](./atlas-packing.md) for turning its loose images into atlases at build time.

For bitmap fonts, GitHub sync and the per-spine draw-call report, see [Magic Editor](./magic-editor.md).
