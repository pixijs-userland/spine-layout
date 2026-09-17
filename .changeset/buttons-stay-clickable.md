---
'@pixijs-userland/spine-layout': patch
---

Buttons stay clickable under masks and other skeletons

A `button_<key>` overlay now takes the shape of the slot's attachment — a region's quad with
its own offset, rotation and scale, a mesh's hull — instead of the raw texture at the bone, and
ignores the clipping mask the runtime hands slot objects, so a button under the reels' clip no
longer goes dead along its edge. No skeleton answers a hit-test with its own art any more: Pixi
hands an interactive ancestor's mode down and a `Spine` claims its whole bounding box, so a hero
or a popup drawn over a button used to swallow the click. Only what a `button_` bone wraps is a
hit target, text slot objects stay out of hit-testing, and the pointer controller listens for
moves on an empty child instead of turning the layout `static`.
