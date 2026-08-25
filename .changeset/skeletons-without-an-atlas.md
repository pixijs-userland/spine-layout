---
'@pixijs-userland/spine-layout': minor
---

A skeleton that attaches no image loads without an atlas. Spine exports one as the JSON alone —
there is nothing to pack — which is what a skeleton whose job is to place and drive other spines
looks like: bones, slots and animations, no art. Both entry points now take it.

`createInstancesFromManifest` picks such a skeleton up from the folder the atlases are in, since a
manifest cannot otherwise tell a skeleton from any other `.json`, and reads it with an empty atlas
instead of asking the asset cache for one that was never built. A spine's id now comes from its
skeleton rather than its atlas, which for a packed skeleton is the same name it always was.

`createInstancesFromDataArray` accepts empty `atlasText` and no textures, and no longer throws on
the missing `skins` key — that was a real crash for the editor, where a bones-only skeleton failed
to register its skins and logged a `TypeError` instead.

`SpineInstanceData.skeleton` is typed as what it holds — the parsed `.json` or the bytes of a
`.skel` — rather than as a runtime `SkeletonData`. A `.skel` is now read with `SkeletonBinary`;
before, the binary path went to the JSON parser.
