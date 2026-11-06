---
'@pixijs-userland/spine-layout': minor
---

pixi4: a `SkeletonData` set under a skeleton alias (`engine.assets.set('spine/bg.json', data)`) is taken as read, with no atlas, so a game whose own loader reads its skeletons (unicore's binary Spine 3.8) hands them over as they are.
