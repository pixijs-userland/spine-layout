---
title: Sounds
sidebar_position: 8
---

Standalone audio controller built on [Howler.js](https://howlerjs.com/). Manages two categories of audio — **FX** (one-shots) and **Music** (looping tracks) — with a browser user-interaction gate and automatic tab-visibility muting.

A ready-made singleton is exported alongside the class:

```ts
import { sounds, Sounds, type SoundSettings } from 'spine-layout';
```

A module-level `pointerdown` listener calls `sounds.onUserInteraction()` automatically on first user interaction, so you typically only need to call `init()` yourself.

---

## Setup

### constructor

```ts
new Sounds(settings?: Partial<SoundSettings>)
```

Creates a new instance with optional initial settings. The constructor immediately mutes global audio (Howler-level) and registers a `visibilitychange` listener for auto-mute on tab switch.

---

### init

```ts
init(pixiManifest: AssetsManifest, settings?: Partial<SoundSettings>): void
```

Reads sound asset entries from the PixiJS manifest bundle named `sounds` (or `${prefix}/sounds` when a prefix is configured), then unmutes audio if user interaction has already occurred.

```ts
sounds.init(manifest, {
  prefix: 'game1',
  musicVolume: 0.1,
  fxVolume: 0.8,
  soundsVolumes: { 'game1/coin': 0.5 },
});
```

---

## User Interaction

### onUserInteraction

```ts
onUserInteraction(): void
```

Unlocks audio playback. Called automatically by the module-level `pointerdown` listener on the `sounds` singleton. Call manually on custom interaction events if needed.

---

### onActivation

```ts
onActivation(callback: () => void): void
```

Registers a callback that fires once when `onUserInteraction()` is called. Use to defer sound-dependent logic until playback is actually permitted.

```ts
sounds.onActivation(() => sounds.playMusic('bgm_main'));
```

---

### activated

```ts
activated: boolean
```

`true` after `onUserInteraction()` has been called at least once.

---

## Playback

### playFX

```ts
playFX(fx?: string | string[], loop?: boolean): Promise<void>
```

Plays a sound effect. Pass an array to pick one entry at random each call. Uses the per-sound override from `soundsVolumes` if present, otherwise `fxVolume`. No-ops until `init()` has been called.

A name ending in `_loop` is played as a looping FX under its stripped name, so `playFX('spin_loop')`
and `playFX('spin', true)` are the same call and both are stopped by `stopFX('spin')`. Re-requesting
a looping FX that is still playing is a no-op rather than a second, overlapping instance — a looping
animation can fire its sound event every cycle without stacking.

```ts
sounds.playFX('coin');
sounds.playFX(['hit1', 'hit2', 'hit3']);   // random pick
sounds.playFX('laser', true);              // looping FX
sounds.playFX('laser_loop');               // the same looping FX
```

---

### stopFX

```ts
stopFX(fx: string): void
```

Stops a named FX sound (useful for looping FX started with `playFX(..., true)`).

---

### playMusic

```ts
playMusic(music: string): Promise<void>
```

Starts a looping music track. If a different track is already playing it is stopped first — but only once the new track has actually started, so requesting a track that is missing from the manifest leaves the current music playing. Only other music stops music: FX never do, whatever their name. Calling `playMusic` with the same track name that is already active is a no-op.

```ts
sounds.playMusic('bgm_main');
```

---

## Volume & Mute

### mute / unmute

```ts
mute(): void
unmute(): void
```

Global mute/unmute via Howler. `unmute()` is a no-op if `muted` is `true` in settings, or if user interaction has not yet occurred.

---

### updateSettings

```ts
updateSettings(settings: Partial<SoundSettings>): void
```

Hot-updates any combination of settings. Immediately applies mute states and volumes to all active sounds.

```ts
sounds.updateSettings({
  muted: false,
  musicVolume: 0.2,
  fxVolume: 0.6,
  soundsVolumes: { 'game1/explosion': 1.0 },
});
```

---

## SoundSettings

| Field | Type | Default | Description |
|---|---|---|---|
| `muted` | `boolean` | `false` | Global mute (all audio) |
| `musicMuted` | `boolean` | `false` | Mute music tracks only |
| `fxMuted` | `boolean` | `false` | Mute FX tracks only |
| `musicVolume` | `number` | `0.1` | Default music volume (0–1) |
| `fxVolume` | `number` | `0.8` | Default FX volume (0–1) |
| `soundsVolumes` | `Record<string, number>` | — | Per-sound FX volume overrides, keyed by the prefixed asset name (e.g. `'game1/coin'`) |
| `prefix` | `string` | — | Prefix prepended to the manifest bundle name and all asset key lookups |
| `debug` | `boolean` | `false` | Logs all operations to the console |

---

## Behaviour Notes

- **Tab visibility** — automatically mutes when `document.hidden` becomes `true` and restores when the tab is visible again (respects the `muted` flag).
- **Asset resolution** — sound names are resolved as `${prefix}/${soundName}` against the manifest. The resolved URL becomes `assets/${prefix}/${soundName}.ogg` for string entries or the raw array for multi-source entries.
- **Singleton** — the exported `sounds` instance is shared across the whole app. Create a `new Sounds()` instance only when you need isolated audio state (e.g. per-scene audio managers).
