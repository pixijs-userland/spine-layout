---
'@pixijs-userland/spine-layout': minor
---

Rewrote track control in the animations controller. Tracks are now assigned per spine as
animations start, instead of being passed in by callers, so two animations on one spine no
longer land on the same track and cut each other off.

The `trackID` argument is gone from `playByName()` and `play()`. `playByName()` takes a
spine ID in that third slot now — `playByName('idle', false, 'reel_1')` plays the animation
on that one spine, where before it played on every spine holding a matching name.

Also new: `setSpineSpeed()`/`getSpineSpeed()` pace a single spine against the rest of the
layout, `getBySpine()` reports which spine each animation was drawn in, and `playEvent()`
takes a payload that reaches the listeners alongside the event name.
