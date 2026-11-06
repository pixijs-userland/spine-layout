import type { PixiSpineContainer, PixiSpineMatrix, PixiSpineTransform } from './types';

/**
 * How a slot object's holder takes an arbitrary matrix — the inverse of its slot container's,
 * which can carry a flip and a skew — on the Pixi the runtimes render on.
 */
export interface SlotHolderTransform {
    /** Readies a holder before its first {@link set}. */
    prepare(holder: PixiSpineContainer): void;
    set(holder: PixiSpineContainer, matrix: PixiSpineMatrix): void;
}

/** Pixi 4: a `TransformBase` multiplies its `localTransform` as written, never recomputing it. */
export function transformBaseHolder(PIXI: {
    TransformBase: new () => PixiSpineTransform;
}): SlotHolderTransform {
    return {
        prepare(holder) {
            holder.transform = new PIXI.TransformBase();
        },
        set(holder, { a, b, c, d, tx, ty }) {
            Object.assign(holder.transform.localTransform, { a, b, c, d, tx, ty });
        },
    };
}

/**
 * Pixi 5 to 7, where `TransformBase` is gone (5 keeps a deprecated alias that warns on read):
 * the transform decomposes the matrix into its position, scale, skew and rotation.
 */
export const setFromMatrixHolder: SlotHolderTransform = {
    prepare() {},
    set(holder, matrix) {
        holder.transform.setFromMatrix!(matrix);
    },
};
