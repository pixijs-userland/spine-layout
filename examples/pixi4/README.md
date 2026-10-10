# spine-layout on PIXI v4

A page wired the way a legacy game is: PIXI v4.8.9, pixi-spine 1.6.2 (Spine 3.8) and
pixi-particles 4.3.0 as `<script>` tags on `window.PIXI`, and the layout built with
`createPixi4Engine(PIXI, { renderer })`. It plays `tests/fixtures/contract-3.8.json` on a loop.

The layout is imported from `src`, so it is served through Vite rather than a plain file
server: `tsc` writes `dist` with extensionless imports, which a browser cannot follow. From
`packages/spine-layout`, after `pnpm install`:

```sh
npx vite --port <port> --strictPort   # a port of your own, 40000–49000
```

Then open `http://localhost:<port>/examples/pixi4/`.
