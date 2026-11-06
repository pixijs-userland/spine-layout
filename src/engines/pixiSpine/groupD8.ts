/** A region's `groupD8` texture direction as degrees turned on its page: 6 → 90, 2 → 270. */
export const degreesOf = (direction: number) => (direction ? (720 - direction * 45) % 360 : 0);
