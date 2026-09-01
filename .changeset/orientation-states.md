---
'@pixijs-userland/spine-layout': minor
---

Play `state_landscape/` and `state_portrait/` for the shape of the screen

Two state folders the layout now plays for itself and re-plays whenever the screen turns —
landscape while the window is wider than it is tall, portrait while it is taller than it is
wide. Naming the folders in the Spine editor is the whole setup; a layout that authors neither
never listens for a resize. `layout.orientation` exposes what the layout is posed for, a
`setSize()` for a layout that does not fill the window, and an `enabled` switch.
