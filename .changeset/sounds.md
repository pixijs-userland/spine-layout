---
'@pixijs-userland/spine-layout': minor
---

Sounds are loaded up front at `init()` instead of on first use, so the first click is not
the one that waits for the file.

One name can stand for a set of files, picked at random per play — three coin sounds under
`coin` stop the tenth coin sounding like the first. Names the manifest shortened are
resolved back, and three places asking for the same sound in the same frame hear it once.

Channels follow the event name: one starting with `music` plays on the music channel,
everything else is FX, looping when the name ends in `_loop`. A looping FX belongs to the
animation whose timeline fired it and stops with it, so a spin loop cannot outlive the spin
— though it keeps going while another running animation still wants it, which is what makes
five reels sharing one loop stop it only on the last.

The authored mix is scaled by the player's music and FX dials rather than replaced by them,
so relative levels set in the editor survive the volume slider.
