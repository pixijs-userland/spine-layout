---
'@pixijs-userland/spine-layout': minor
---

`button_<key>` bones become composite button wrappers: everything under the bone is part of
the button, not just the one slot. A button that embeds its own spine plays that spine's
feedback animations on hover and press rather than needing them wired up by hand.

`press(key)` triggers a button from code — the keyboard shortcut path, or a tutorial driving
the UI.
