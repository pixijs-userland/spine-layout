import type { EngineTypes } from '../../engine/Engine';
import type { SkeletonSource } from '../../engine/runtime';

export type { SkeletonSource };

/** One manifest entry, as a loader's manifest spells it: an alias or several, and its file(s). */
export type ManifestAssetLike = { alias?: string | string[]; src?: unknown };

/** An asset manifest, down to what the layout reads of it: bundles of aliased files. */
export type ManifestLike = {
    bundles: { name: string; assets: ManifestAssetLike[] | Record<string, unknown> }[];
};

export type SpineID = string;
/**
 * The shape of the screen, which is also the name of the state posing the layout for it:
 * `state_portrait/` and `state_landscape/`. See `OrientationController`.
 */
export type Orientation = 'portrait' | 'landscape';
export type AnimationName = string;
export type AnimationsRegistry = Map<SpineID, AnimationName[]>;
export type AnimationTrackRegistry = Map<AnimationName, number>;

export type PlayOptions = {
    /**
     * Re-apply the animation even when it is already running, restarting it from frame 0.
     *
     * Off by default, so repeated state and event dispatches leave what is already playing
     * alone. Button feedback needs it: a pointer re-entering `hover` while the previous
     * `hover` still runs must land, or the button's look desyncs from the pointer.
     */
    restart?: boolean;
};

/** What `layout.reset()` leaves standing across a rebuild. */
export type ResetOptions = {
    /**
     * Keep the listeners the game registered with `animations.addEventListener` — a scene
     * rebuilt in place (a live reload) fires its button clicks at the same subscribers.
     * Off by default: a reset forgets them with everything else.
     */
    keepListeners?: boolean;
};

/** What `animations.activeStates()` lists. */
export type ActiveStatesOptions = {
    /**
     * Also list the states the layout plays for itself — `init` on a build, `landscape` and
     * `portrait` for the shape of the screen. Off by default, so the list is what the game
     * asked for and a rebuild can play it again without doubling what the build already did.
     */
    builtIn?: boolean;
};

/** A game's object `scene.releaseSlotChildren()` handed back, and the slot it hung on. */
export type ReleasedSlotChild<Container = unknown> = {
    spineID: SpineID;
    slotName: string;
    child: Container;
};

export type SpineLayoutOptions = {
    debug?: boolean;
    manifest?: ManifestLike;
    skipAttachingSpinesPatterns?: string[];
    /**
     * The spine the scene is built from, `root` unless another id is named here.
     *
     * It is the one skeleton instanced on its own account: everything else is instanced
     * because a `spine_<id>` slot somewhere in the tree beneath it asks for it. A skeleton
     * that is loaded but embedded nowhere is not instanced at all — see
     * {@link SpineLayout.createInstance} for building one anyway.
     */
    root?: SpineID;
    /**
     * What plays the skeletons' sound events (see {@link SoundAdapter}).
     *
     * - pixi8 `SpineLayout` (`.`): the built-in Howler player, `sounds`, unless another adapter is
     *   given; `false` plays nothing.
     * - `SpineLayoutCore` (`./core`, `./pixi4`): nothing unless an adapter is given. These entries
     *   never import Howler, so a game with an audio system of its own does not ship it; the
     *   Howler player is `import { sounds } from '@pixijs-userland/spine-layout/howler'`.
     *
     * `animations.onSound` reports the same events either way.
     */
    sounds?: SoundAdapter | false;
    /**
     * @deprecated `false` is `sounds: false`. `SpineLayoutCore` has no built-in player any more:
     * give it an adapter (the Howler one is in `./howler`).
     */
    builtInSounds?: boolean;
};

/**
 * Plays the sounds the skeletons ask for — the layout keeps deciding *which* sound a spine event
 * is and when an animation's FX stop (see {@link SoundEvent}); the adapter is the audio system
 * that plays them. The built-in Howler player (`sounds`) is one; a game passes its own to play
 * the scene's sounds with the rest of its audio (its loader, channels, volumes, pause).
 *
 * Each call also gets the whole {@link SoundEvent}: which spine and animation asked.
 */
export interface SoundAdapter {
    /**
     * A layout was built from this manifest (`createInstancesFromManifest`): the sounds it lists
     * may be preloaded. The layout that called it calls {@link dispose} when it is destroyed.
     */
    init?(manifest: ManifestLike): void;
    /** A `music` event: loop this track until another one replaces it. */
    playMusic(name: string, event: SoundEvent): void;
    /** Any other sound event; `loop` for a `_loop` one (play it once otherwise). */
    playFX(name: string, loop: boolean, event: SoundEvent): void;
    /** The animation that played this FX stopped, and no running animation still holds it. */
    stopFX(name: string, event: SoundEvent): void;
    /** The layout that {@link init}ed the adapter is destroyed. */
    dispose?(): void;
}

/**
 * A sound a skeleton asked for — what the {@link SoundAdapter} plays and `animations.onSound`
 * reports.
 *
 * - `play` / `music`: a spine event with `music` in its name. One track at a time: it loops
 *   until another `music` play replaces it, and no animation stops it.
 * - `play` / `fx`: any other sound event. `loop` is set for an event ending in `_loop`, whose
 *   suffix is already stripped from `name`.
 * - `stop` / `fx`: the animation that played this FX stopped or was reset, and no other running
 *   animation played it too — the FX should be cut short (a looping one, stopped).
 */
export type SoundEvent = {
    action: 'play' | 'stop';
    kind: 'music' | 'fx';
    /** The sound's name: the spine event's, without its `_loop` suffix. */
    name: string;
    loop: boolean;
    spineID: SpineID;
    /** The animation whose timeline fired the event (or, for `stop`, that stopped). */
    animation?: AnimationName;
};

export type SoundListener = (event: SoundEvent) => void;

export type SpineInstanceData<T extends EngineTypes = EngineTypes> = {
    name: string;
    skeleton: SkeletonSource;
    /** Empty for a skeleton with no images: an atlas of no pages, describing nothing. */
    atlasText: string;
    textures: Record<string, T['Texture']>;
};

type TextsJsonEntryBase = {
    uppercase?: boolean;
    animateNumber?: boolean;
    value?: string;
    fontFamily?: string;
    fontSize?: number;
    letterSpacing?: number;
    /**
     * Whether the value breaks onto further lines instead of running on. The width it breaks
     * at is `wordWrapWidth` for a `text` entry and {@link TextsJsonBitmapTextEntry.maxWidth}
     * for a `bitmapText` one, which is the box that entry is already sized against.
     */
    wordWrap?: boolean;
};

export type TextsJsonTextEntry = TextsJsonEntryBase & {
    type: 'text';
    fill?: string;
    align?: 'left' | 'center' | 'right' | 'justify';
    fontStyle?: 'normal' | 'italic' | 'oblique';
    fontWeight?:
        | 'normal'
        | 'bold'
        | 'bolder'
        | 'lighter'
        | '100'
        | '200'
        | '300'
        | '400'
        | '500'
        | '600'
        | '700'
        | '800'
        | '900';
    lineHeight?: number;
    breakWords?: boolean;
    wordWrapWidth?: number;
    stroke?: { color: string; width: number };
    dropShadow?: { color: string; alpha: number; blur: number; angle: number; distance: number };
};

export type TextsJsonBitmapTextEntry = TextsJsonEntryBase & {
    type: 'bitmapText';
    /**
     * How far from its bone the value is drawn, in pixels — absent or `{ x: 0, y: 0 }` puts it
     * dead on the bone.
     *
     * It names where the *middle of the value* goes, both across and down, whatever the value
     * says and however many lines it takes: the runtime measures the glyphs and places the node
     * so their middle lands here. Nothing needs to be written down to centre a field, and a
     * number written here is the artist moving a centred field off its bone on purpose.
     */
    offset?: { x: number; y: number };
    /**
     * Widest the value may render, in pixels. Text past it is scaled down uniformly, and
     * `0` or absent leaves the width unconstrained.
     *
     * Doubles as the width {@link TextsJsonEntryBase.wordWrap} breaks lines at, so a
     * wrapping value fills this box rather than overflowing it, and the scaling is left to
     * catch what no line break can — a single word wider than the box. A wrapping entry
     * without a `maxWidth` has no width to wrap into and so does not wrap.
     */
    maxWidth?: number;
    /**
     * Tallest the value may render, in pixels — the vertical twin of {@link maxWidth}.
     * Text past it is scaled down uniformly, and where both are set the tighter of the
     * two decides, so the text fits the box on whichever side runs out first. `0` or
     * absent leaves the height unconstrained.
     *
     * Mostly for multi-line values, whose height is what grows as lines are added.
     */
    maxHeight?: number;
    /**
     * Distance between the baselines of a multi-line value. Optional, and normally left
     * out: without it the advance is measured off the glyphs themselves, because the
     * `lineHeight` our fonts declare in their header is in a different unit from their
     * glyph rectangles and lays the lines on top of each other. Set it to overrule that
     * measurement for one field — a number here is always used as written.
     *
     * Already forwarded to the Pixi style like every other entry key; only the type was
     * missing, which left the one escape hatch from the measurement undeclarable.
     */
    lineHeight?: number;
    /**
     * How the lines of a multi-line value sit against each other. Defaults to `center`,
     * to match the anchor that centres the node on its bone — a left-aligned block under
     * a centred anchor reads as a mistake. No effect on single-line text, whose one line
     * is the whole block however it is aligned.
     *
     * `justify` widens the spaces of every line but the last until it reaches the widest
     * line of the block — the same alignment, on the same terms, that a `text` entry's
     * `justify` gives. It follows that a value needs more than one line, and spaces on
     * them to widen, before it looks any different from `left`.
     */
    align?: 'left' | 'center' | 'right' | 'justify';
};

export type TextsJsonEntry = TextsJsonTextEntry | TextsJsonBitmapTextEntry;

/**
 * `texts.json` structure: a tree keyed by spine id, then by text key.
 * Multiple-instance spines (e.g. `counter_1`, `counter_2`) each get their own section,
 * so their texts are configured and applied independently.
 *
 * ```json
 * { "main": { "balance": { … } }, "counter_1": { "reward": { … } } }
 * ```
 */
export type TextsJson = Record<string, Record<string, TextsJsonEntry>>;

/**
 * One emitter in `particles.json`. `textures` are asset aliases, `config` goes to the engine's
 * emitter as it is.
 */
export type ParticlesJsonEntry = {
    textures: string[];
    config: Record<string, unknown>;
    autoplay?: boolean;
};

/** `particles.json`: keyed by spine id, then by the `particles_<key>` slot key, like `texts.json`. */
export type ParticlesJson = Record<string, Record<string, ParticlesJsonEntry>>;

/**
 * How `texts.set` writes a value. `animate` counts a numeric value up or down from the one on
 * display, over `duration` ms (500 by default); `skipAnimation` writes it straight, whatever
 * `animate` or the entry's `animateNumber` say.
 */
export type TextSetOptions = {
    animate?: boolean;
    duration?: number;
    skipAnimation?: boolean;
};
