---
'@pixijs-userland/spine-layout': patch
---

A skeleton with no atlas is also picked up from a folder of its own name beside the atlases'
own folders — `spine/root/root.json` next to `spine/bg/bg.atlas`, the layout of a build that
packs each skeleton in a folder of its own. Before, only a folder that itself held an atlas
counted, so such a root was never instanced.
