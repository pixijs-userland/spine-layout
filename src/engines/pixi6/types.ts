import type {
    LegacyBitmapText,
    LegacyContainer,
    LegacyNamespace,
    LegacyParticles,
    LegacyText,
    LegacyTexture,
    LegacyTypes,
} from '../legacy';
import type {
    PixiSpineContainer,
    PixiSpineDisplayClasses,
    PixiSpineTypes,
    PixiSpineView,
} from '../pixiSpine';

type HitArea = PixiSpineContainer['hitArea'];

/** A Pixi 6 display object, as the legacy ports and pixi-spine's port each see a part of it. */
export interface Pixi6Container extends LegacyContainer, PixiSpineContainer {
    parent: Pixi6Container | null;
    children: Pixi6Container[];
    hitArea: HitArea;
}

/** The `Spine` of an `@pixi-spine/runtime-*` 3.x: one class per runtime, all on one `SpineBase`. */
export interface Pixi6Spine extends Pixi6Container, PixiSpineView {
    parent: Pixi6Container | null;
    children: Pixi6Container[];
    hitArea: HitArea;
}

export interface Pixi6Types extends LegacyTypes<Pixi6Spine>, PixiSpineTypes {
    Spine: Pixi6Spine;
    Container: Pixi6Container;
    Text: LegacyText;
    BitmapText: LegacyBitmapText;
    Texture: LegacyTexture;
}

/** The parts of PIXI 6 the engine uses, as the `window.PIXI` of pixi.js's browser bundle has them. */
export type Pixi6Namespace = LegacyNamespace & PixiSpineDisplayClasses;

/** pixi-particles 4 or @pixi/particle-emitter 5, whose `Particle` is a `Sprite` of the engine's PIXI. */
export interface Pixi6Particles extends LegacyParticles {
    Particle: { prototype: object };
}
