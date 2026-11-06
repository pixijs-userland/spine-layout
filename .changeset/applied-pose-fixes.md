---
'@pixijs-userland/spine-layout': patch
---

On spine-core 4.3, bone world positions, slot attachments and alpha read the applied pose, so a
bone a constraint moves reports where it is drawn; `texts.json` is looked up without a cache-miss
warning, and settings already set are kept; the sounds singleton no longer needs a `window` to be
imported.
