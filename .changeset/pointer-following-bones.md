---
'@pixijs-userland/spine-layout': minor
---

Bones that follow the pointer. Name a bone `<name>_followPointer` and it sits wherever the
pointer is, carrying everything hanging from it — attachments, nested spines, text nodes.
Naming the bone is the whole setup; a slot with the suffix moves the bone it hangs from.

The new `layout.pointer` controller tunes it: `strength` for how far every follow bone
travels (a parallax layer can drift a twentieth of the way), `setStrength()` to single one
bone out, `setPosition()` to drive it from a gamepad instead of a pointer, and `enabled` to
put the bones back at their setup position.
