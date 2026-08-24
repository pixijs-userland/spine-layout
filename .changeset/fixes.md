---
'@pixijs-userland/spine-layout': patch
---

Fixes:

- A slot texture's frame is sized against the page's logical size, so art on a half-size
  atlas no longer samples at half UV and comes out blurred on some devices.
- Slot-texture extraction follows the Spine 4.3 sequence API.
- A pose Spine cannot undo itself is put back on stop, and an entry that never applied is
  left alone when it replays, instead of stamping a pose that was never shown.
- Bitmap fonts scale from the right anchor.
- A shared spine child is multiplied into one instance per parent rather than being moved
  to the last one.
- Dropped the unpaired FX stop log line.
