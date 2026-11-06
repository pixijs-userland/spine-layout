import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { BitmapText, Container, Text, TextStyleOptions, Texture } from 'pixi.js';
import type { SpineLike } from '../../engine/Engine';

/** A `Spine` of any spine-pixi-v8 runtime, 4.2 or 4.3: what holds across them. */
export type Pixi8Spine = Container &
    SpineLike & {
        autoUpdate: boolean;
        readonly renderPipeId: string;
        update(dt: number): void;
        addSlotObject(slot: string, container: Container): void;
        getSlotObject(slot: string): Container | undefined;
        removeSlotObject(slotOrContainer: string | Container): void;
    };

/**
 * The classes the pixi8 engine renders with. `Spine` is spine-pixi-v8 4.3's unless given: the
 * one runtime the "." entry ships, and what its games hold. An engine over more than one
 * runtime is `Pixi8Types<Pixi8Spine>`.
 */
export type Pixi8Types<S extends Pixi8Spine = Spine> = {
    Spine: S;
    Container: Container;
    Text: Text;
    BitmapText: BitmapText;
    Texture: Texture;
    TextStyleOptions: TextStyleOptions;
};
