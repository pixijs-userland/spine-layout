# spine-layout on PIXI v4

A page wired the way a legacy game is: PIXI v4.8.9, pixi-spine and pixi-particles 4.3.0 as
scripts on `window.PIXI`, and the layout built with `createPixi4Engine(PIXI, { renderer })`. It
plays `tests/fixtures/contract-3.8.json` on pixi-spine 1.6.2 on a loop, or, with `?spine=3.7`,
the same skeleton exported for 3.7 on pixi-spine 1.5.23.

The layout is imported from `src`, so it is served through Vite rather than a plain file
server: `tsc` writes `dist` with extensionless imports, which a browser cannot follow. From
`packages/spine-layout`, after `pnpm install`:

```sh
npx vite --port <port> --strictPort --no-open   # a port of your own, 40000–49000
```

Then open `http://localhost:<port>/examples/pixi4/` or `http://localhost:<port>/examples/pixi4/?spine=3.7`.
