import type { Container, PointData } from 'pixi.js';

type View = Container & { containsPoint?(point: PointData): boolean };

const never = () => false;

/**
 * Takes a view's own shape out of hit-testing: it answers `containsPoint` with no, wherever the
 * pointer is, while its children keep answering for themselves.
 *
 * Pixi hands an interactive ancestor's mode down to every child, and a view — a `Spine`, a
 * `Text` — says it contains any point inside its bounding box. One `eventMode = 'static'`
 * container above the scene, and a skeleton drawn in front of a button answers for the whole
 * rectangle around it: the click ends there, on nothing.
 */
export function shieldFromHitTesting(view: Container) {
    (view as View).containsPoint = never;
}

/** Undoes {@link shieldFromHitTesting}, handing `containsPoint` back to the view's class. */
export function exposeToHitTesting(view: Container) {
    if (Object.hasOwn(view, 'containsPoint')) delete (view as View).containsPoint;
}
