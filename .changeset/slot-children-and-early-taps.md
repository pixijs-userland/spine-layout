---
'@pixijs-userland/spine-layout': patch
---

A slot child taken back by hand is forgotten, and a tap before `sounds.init` unlocks audio again

`removeSlotAttachments` detached an `addSlotChild` object but kept it in the scene's list of slot
children until the next `reset()` or `destroy()`, so a game that hangs and destroys one sprite per
prize held every destroyed sprite for the session. Detaching it — by object or by slot name — now
drops it from that list, and so does hanging another object on the same slot.

0.5.0 moved the one-time `pointerdown` that unlocks audio into `sounds.init`, so a tap before
`init` — a launcher's first click, a loading screen — no longer counted and sound stayed muted
until the next tap. The listener is installed on import again and stays until the first tap,
across `dispose`; `init` still installs the visibility listener and mutes.
