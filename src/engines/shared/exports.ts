/**
 * A namespace or module as its package's own declarations give it: every export an engine reads is
 * named, and checked as the engine uses it. Pixi's and pixi-spine's declarations do not fit the
 * structural types the ports read them by.
 */
export type Exports<T> = { readonly [K in keyof T]: unknown };
