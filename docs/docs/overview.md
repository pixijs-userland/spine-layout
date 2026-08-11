---
title: Overview
slug: /
sidebar_position: 1
---

**spine-layout** is a composition framework for game UIs, layouts and animations built on top of Pixi.js. It combines three layers:

- **Spine animation** — assemble multiple Spine skeletons into a single hierarchical scene, driven by state/event-based logic through slot-naming conventions
- **@pixi/layout** — responsive CSS-like layout engine for Pixi.js containers: https://layout.pixijs.io/ ⚠️ WIP
- **@pixi/ui** — pre-built interactive UI components for Pixi.js: https://pixijs.io/ui/ ⚠️ WIP

```
SpineLayout (Container)
├── AnimationsController  — playback, states, events, track management       ✓ stable
├── SkinsController       — skin switching across spines                      ✓ stable
├── SpineController       — bone/slot queries, global positions, cloning      ✓ stable
├── TextsController       — dynamic text rendering & number animation         ✓ stable
├── SceneController       — hierarchical composition (spines, texts, buttons) ✓ stable
├── PointerController     — bones that follow the mouse or finger             ✓ stable
├── @pixi/layout          — responsive layout for Pixi.js containers          ⚠ WIP
└── @pixi/ui              — interactive UI component library                  ⚠ WIP

Sounds (singleton)        — FX + music playback via Howler.js                ✓ stable
```

All Spine instances are stored in a central `Map<SpineID, Spine>` registry and each controller operates against that registry.
