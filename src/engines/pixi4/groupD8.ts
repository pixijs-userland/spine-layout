/** A region turned `degrees` on its page, as the `GroupD8` direction pixi-spine gives its texture. */
export const directionOf = (degrees: number) => (((720 - degrees) % 360) / 45) % 8;

/** The inverse of {@link directionOf}: 6 → 90, 2 → 270. */
export const degreesOf = (direction: number) => (direction ? (720 - direction * 45) % 360 : 0);
