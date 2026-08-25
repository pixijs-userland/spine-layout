---
'@pixijs-userland/spine-layout': minor
---

The scene is built from its root, and only what the root embeds is built.

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
