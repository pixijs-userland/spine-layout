import type { SkeletonData } from '@esotericsoftware/spine-pixi-v8';
import type { AssetsManifest, Texture } from 'pixi.js';

export type SpineID = string;
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

export type SpineLayoutOptions = {
    debug?: boolean;
    manifest?: AssetsManifest;
    skipAttachingSpinesPatterns?: string[];
};

export type SpineInstanceData = {
    name: string;
    skeleton: SkeletonData;
    atlasText: string;
    textures: Record<string, Texture>;
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
