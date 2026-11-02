---
"@pixijs-userland/spine-layout": minor
---

`layout.destroy()` releases everything the layout built, and the `sounds` singleton has a `dispose()`.

Spines are destroyed with their children, so the text nodes (and their canvas textures), button
overlays and particle containers the layout made go with them; a mount → play → destroy cycle
leaves the window listeners, the shared ticker and the text count where they were. What a game
hung on a slot through `addSlotChild` stays the game's: it is detached intact before the spines
go (`scene.releaseSlotChildren()` does the same by hand). A `play()` still waiting on its
animation resolves on destroy instead of holding the layout until its timer fires.

`sounds.dispose()` unloads every `Howl`, empties the caches and takes the window listeners off,
and `destroy()` calls it on the layout that ran `sounds.init` — the one built from a manifest. The
listeners and the global mute are now installed on the first `init` rather than when the module is
imported.

The debug log keeps the last 500 entries while disabled instead of every one for the page's
lifetime, and a row added to a label nothing opened — every animation played, every skeleton
event — is written straight through instead of collecting in a table nothing closes.
