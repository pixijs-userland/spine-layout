import type { Container } from 'pixi.js';
import type { Engine } from '../../engine/Engine';
import type { SpineLayoutOptions } from '../../core/config/types';
import { SpineLayoutCore } from '../../core/SpineLayout';
import { pixi8Engine } from './index';
import type { Pixi8Types } from './types';

export type SpineLayoutPixi8Options = SpineLayoutOptions & { engine?: Engine<Pixi8Types> };

// The layout is a pixi `Container` at runtime (see `LayoutHost`); this says so to the compiler.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface SpineLayout extends Container {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SpineLayout extends SpineLayoutCore<Pixi8Types> {
    constructor(options: SpineLayoutPixi8Options = {}) {
        super(Object.assign(options, { engine: options.engine ?? pixi8Engine }));
    }

    override destroy() {
        super.destroy();
    }

    /** @deprecated Use `animations.addEventListener()` instead. */
    override addEventListener(event: string, fn: (event: unknown) => void) {
        super.addEventListener(event, fn);
    }
}
