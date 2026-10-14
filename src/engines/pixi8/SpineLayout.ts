import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { Container } from 'pixi.js';
import type { Engine } from '../../engine/Engine';
import type { SpineLayoutOptions } from '../../core/config/types';
import { SpineLayoutCore } from '../../core/SpineLayout';
import { pixi8Engine } from './index';
import type { Pixi8Spine, Pixi8Types } from './types';

export type SpineLayoutPixi8Options<S extends Pixi8Spine = Spine> = SpineLayoutOptions & {
    engine?: Engine<Pixi8Types<S>>;
};

// The layout is a pixi `Container` at runtime (see `LayoutHost`); this says so to the compiler.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
export interface SpineLayout<S extends Pixi8Spine = Spine> extends Container {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SpineLayout<S extends Pixi8Spine = Spine> extends SpineLayoutCore<Pixi8Types<S>> {
    constructor(options: SpineLayoutPixi8Options<S> = {}) {
        super(
            Object.assign(options, {
                engine: options.engine ?? (pixi8Engine as unknown as Engine<Pixi8Types<S>>),
            }),
        );
    }

    override destroy() {
        super.destroy();
    }

    /** @deprecated Use `animations.addEventListener()` instead. */
    override addEventListener(event: string, fn: (event: unknown) => void) {
        super.addEventListener(event, fn);
    }
}
