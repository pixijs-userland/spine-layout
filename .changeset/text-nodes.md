---
'@pixijs-userland/spine-layout': minor
---

Text nodes sit centred on their bone — the middle of the value, measured off the glyphs on
every change, not the corner of a line box. They stay centred as the value grows, wraps, or
is scaled down to fit.

Bitmap text gained the rest of what the system font already had: wrapping at `maxWidth`
rather than Pixi's default of 100, a `maxHeight` twin, per-line alignment, and multi-line
spacing measured from the glyphs. A word the atlas has no pictures for is drawn instead of
dropped silently.

New on the controller: `has()` to ask whether a text node exists, `seed()` to set a value
without announcing it, `setMaxHeight()`, `getBySpine()` and `getBitmapInstances()`.

Changing a text value now fires a synthetic `<key>_change` animation event, so a spine can
animate its own field — a balance that flashes when it goes up needs no code.
