import type { PoseHold } from '../../engine/Engine';

/**
 * The values a timeline keys when every frame keys the same ones. `frames` holds `entries`
 * numbers per frame, the first of them its time; a single-frame timeline holds by definition.
 */
export function framesHold(frames: ArrayLike<number>, entries: number): PoseHold | undefined {
    if (entries < 2 || frames.length < entries) return undefined;

    const held = Array.from({ length: entries - 1 }, (_, i) => frames[i + 1]);

    for (let frame = entries; frame < frames.length; frame += entries) {
        for (let i = 1; i < entries; i++) if (frames[frame + i] !== held[i - 1]) return undefined;
    }

    return held;
}

/** The one value of a timeline that keeps a value per frame outside `frames` — attachment names, draw orders. */
export function listHold<V>(values: readonly V[] | undefined): PoseHold | undefined {
    if (!values?.length) return undefined;

    const held = JSON.stringify(values[0]);

    return values.every((value) => JSON.stringify(value) === held) ? [held] : undefined;
}
