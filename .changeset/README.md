# Changesets

This folder holds changeset files used by [changesets](https://github.com/changesets/changesets) to manage versions and changelogs for `@pixi/spine-layout`.

## Adding a changeset

When you make a user-facing change in a PR, run:

```sh
pnpm changeset
```

Pick the bump type (patch / minor / major), describe the change in plain language, and commit the generated markdown file in `.changeset/` alongside your PR.

## How releases happen

1. PRs are merged to `main` with changeset files attached.
2. The release workflow opens (or updates) a "Version Packages" PR that bumps the version and consumes the changeset files.
3. Merging that PR publishes `@pixi/spine-layout` to npm and creates a GitHub release with the changelog.
