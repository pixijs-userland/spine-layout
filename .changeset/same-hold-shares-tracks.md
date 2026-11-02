---
'@pixijs-userland/spine-layout': patch
---

Two animations that key a property to the same value no longer compete for a track

Exports key every slot an animation shows, so a tutorial played over a charge animation often
keys the same attachment, colour and draw order the charge already holds. The track allocator
read that as a collision and handed the tutorial the charge's track, dropping the charge: the
slot it faded in went back to its setup alpha, and whatever hung off that slot vanished.

A claim now records, per property, the one value its timeline keys throughout. Two animations
holding the same value there — within one 8-bit colour step — do not collide, so the later one
stacks on its own track above the earlier. A property keyed to different values, or changed
over the animation, collides as before. Both engines report holds; deform, folder draw-order and
event timelines report none.
