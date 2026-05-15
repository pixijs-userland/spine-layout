import type { SkeletonData } from '@esotericsoftware/spine-pixi-v8';
import type { AssetsManifest, Texture } from 'pixi.js';

export type SpineID = string;
export type AnimationName = string;
export type AnimationsRegistry = Map<SpineID, AnimationName[]>;
export type AnimationTrackRegistry = Map<AnimationName, number>;

export type SpineLayoutOptions = {
    debug?: boolean;
    manifest?: AssetsManifest;
    skipAttachingSpinesPatterns?: string[];
    multipleInstancesPatterns?: string[];
};

export type SpineInstanceData = {
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
export type TextsJson = Record<string, TextsJsonEntry>;
