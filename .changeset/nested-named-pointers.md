---
'@pixijs-userland/spine-layout': patch
---

A named child pool is multiplied per parent rather than once for all of them. `spine_<id>_<n>`
pointers declared on a template that is itself multiplied — five reels each carrying
`spine_symbol_0`…`spine_symbol_4` — produced five symbols for twenty-five slots, and since a
child can only live under one parent, every reel took the same five off the one before it until
the whole grid sat on the reel attached last. Such a pointer now expands to one instance per
carrier, `<id>_<n>_<parent>`, as a shared plain pointer already did.
