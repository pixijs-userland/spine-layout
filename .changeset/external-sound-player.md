---
'@pixijs-userland/spine-layout': minor
---

Sound adapters (#6): the `sounds` option takes a `SoundAdapter` (`playMusic`, `playFX`, `stopFX`, optional `init` / `dispose`) that plays the sounds the skeletons ask for, so a game can play them through its own audio system; `animations.onSound` reports every play and stop. The pixi8 `SpineLayout` keeps the built-in Howler player by default (`sounds: false` turns it off). `./core` and `./pixi4` no longer import Howler: `SpineLayoutCore` plays nothing unless given an adapter, and the Howler player (`sounds`, `Sounds`) moves to the new `./howler` entry — a PIXI 4 game that used it passes `sounds` from there.
