---
'@pixi/spine-layout': minor
---

A `button_<key>` slot is hit-tested against the attachment it holds when the pointer arrives, not the one it held when the scene was built. A landscape and a portrait body keyed by `state_landscape/` / `state_portrait/`, a skin change or a sequence frame change the clickable area with the art, a weighted mesh or bounding box is hit where its bones put it, and an empty slot takes no clicks — also one that was empty at build and used to keep its skin attachment's shape. For custom engines: `DisplayPort.setHitArea` takes a `HitArea` (`{ contains(x, y) }`) instead of a polygon, and `SpinePort.hitPolygon` outlines weighted meshes and bounding boxes.
