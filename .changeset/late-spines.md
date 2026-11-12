---
'@pixijs-userland/spine-layout': minor
---

`addInstancesFromManifest` and `addInstancesFromDataArray` build skeletons loaded after the scene into the `spine_<id>` slots that were waiting for them, so a game can fetch feature art once it is playable.
