---
title: Integrations
sidebar_position: 6
---

spine-layout is designed to grow beyond Spine animation into a full game-UI composition layer by integrating two additional Pixi.js libraries. Both integrations are currently **work in progress**.

## @pixi/layout ⚠️ WIP

**@pixi/layout** is a responsive layout engine for Pixi.js that brings CSS Flexbox-style rules to containers and display objects.

Docs & source: https://layout.pixijs.io/

The planned integration will allow you to define the spatial arrangement of Spine skeletons, texts, and UI components using declarative layout configs instead of manual `x`/`y` positioning. This means scenes will be able to reflow automatically when the canvas is resized.

## @pixi/ui ⚠️ WIP

**@pixi/ui** is a library of pre-built interactive UI components (buttons, sliders, checkboxes, scroll views, etc.) that run natively inside a Pixi.js renderer.

Docs & source: https://pixijs.io/ui/

The planned integration mirrors the existing `texts` controller pattern: a dedicated UI controller will instantiate components from a settings file, attach them to named Spine slots, and wire their interaction events into the animation event system — no manual component wiring needed.

## Current state

| Layer                             | Status                    |
| --------------------------------- | ------------------------- |
| Spine animation + SceneController | ✓ Stable                  |
| TextsController                   | ✓ Stable                  |
| Sounds (Howler.js)                | ✓ Stable                  |
| @pixi/layout integration          | ⚠ WIP — not yet available |
| @pixi/ui integration              | ⚠ WIP — not yet available |
