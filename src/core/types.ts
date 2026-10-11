import type { EngineTypes } from '../engine/Engine';

export type SkeletonOf<T extends EngineTypes> = T['Spine']['skeleton'];
export type SlotOf<T extends EngineTypes> = SkeletonOf<T>['slots'][number];
export type BoneOf<T extends EngineTypes> = SkeletonOf<T>['bones'][number];
export type SlotDataOf<T extends EngineTypes> = SkeletonOf<T>['data']['slots'][number];
export type BoneDataOf<T extends EngineTypes> = SkeletonOf<T>['data']['bones'][number];

/** What `texts.setStyle` takes: a partial of the engine's own text style. */
export type TextStyleOf<T extends EngineTypes> = T['Text'] extends { style: infer S }
    ? Partial<S>
    : Record<string, unknown>;

/** What `texts.useSystemFont` takes: the engine's text style options, where it names them. */
export type TextStyleOptionsOf<T extends EngineTypes> = T extends { TextStyleOptions: infer S }
    ? S
    : Record<string, unknown>;
