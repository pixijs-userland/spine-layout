# Changesets

This folder holds changeset files used by [changesets](https://github.com/changesets/changesets) to manage versions and changelogs for `@pixi/spine-layout`.

## Adding a changeset

When you make a user-facing change in a PR, run:

```sh
pnpm changeset
```

Pick the bump type (patch / minor / major), describe the change in plain language, and commit the generated markdown file in `.changeset/` alongside your PR.

## How releases happen

1. PRs are merged to `main` with their changeset files. Merging releases nothing.
2. When it is time to release, run the **Release** workflow by hand from `main` (Actions → Release →
   Run workflow, or `gh workflow run release.yml --ref main`).
3. It consumes the pending changesets, bumps the version and writes `CHANGELOG.md`, publishes
   `@pixi/spine-layout` to npm, pushes the release commit and its `v<version>` tag to `main`, and
   creates the GitHub release. With no changesets pending, it stops before changing anything.
