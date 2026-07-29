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
    maxWidth?: number;
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
