import {
    Container,
    Point,
    Polygon,
    Rectangle,
    Sprite,
    Texture,
    type FederatedPointerEvent,
    type PointData,
} from 'pixi.js';
import type { DisplayPort, PointerEventLike } from '../../engine/Engine';
import type { Pixi8Types } from './types';

type View = Container & { containsPoint?(point: PointData): boolean };

const never = () => false;

export const displayPort: DisplayPort<Pixi8Types> = {
    containerClass: Container,

    container: (options) =>
        new Container({
            ...(options?.label !== undefined && { label: options.label }),
            ...(options?.interactive && { eventMode: options.interactive }),
        }),

    sprite(texture, anchor) {
        const sprite = new Sprite(texture);
        if (anchor !== undefined) sprite.anchor.set(anchor);
        return sprite;
    },

    setLabel: (view, label) => {
        view.label = label;
    },
    setInteractive: (view, mode) => {
        view.eventMode = mode;
    },
    setCursor: (view, cursor) => {
        view.cursor = cursor;
    },
    setHitArea: (view, polygon) => {
        view.hitArea = polygon ? new Polygon(polygon) : null;
    },

    on: (view, event, fn) => view.on(event, fn as (event: FederatedPointerEvent) => void),
    off: (view, event, fn) => view.off(event, fn as (event: FederatedPointerEvent) => void),

    // Pixi delivers `globalpointermove` to every interactive object on every move, wherever the
    // pointer is, so nothing has to be covered with a hit area — and being empty, the listener
    // never answers a hit-test itself. The layout container is left alone: an interactive mode
    // is inherited, and a `static` layout has every skeleton beneath it answering hit-tests with
    // its bounding box, swallowing the clicks meant for the buttons behind it.
    onGlobalPointerMove(root, fn) {
        const listener = new Container({ label: 'pointer-listener', eventMode: 'static' });
        const onMove = (event: PointerEventLike) => fn(event.global);

        root.addChild(listener);
        listener.on('globalpointermove', onMove);

        return () => {
            listener.off('globalpointermove', onMove);
            listener.removeFromParent();
        };
    },

    /**
     * Takes a view's own shape out of hit-testing: it answers `containsPoint` with no, wherever
     * the pointer is, while its children keep answering for themselves.
     *
     * Pixi hands an interactive ancestor's mode down to every child, and a view — a `Spine`, a
     * `Text` — says it contains any point inside its bounding box. One `eventMode = 'static'`
     * container above the scene, and a skeleton drawn in front of a button answers for the
     * whole rectangle around it: the click ends there, on nothing.
     */
    shieldFromHitTesting(view) {
        (view as View).containsPoint = never;
    },

    /** Undoes {@link shieldFromHitTesting}, handing `containsPoint` back to the view's class. */
    exposeToHitTesting(view) {
        if (Object.hasOwn(view, 'containsPoint')) delete (view as View).containsPoint;
    },

    removeFromParent: (view) => view.removeFromParent(),

    /**
     * Sets a property and freezes it there, whatever is assigned to it afterwards.
     *
     * Set through the real accessor first: Pixi renders from what the setter stores
     * (`localAlpha`), not from what the getter says, so freezing alone would leave the old value.
     */
    pin(view, property, value) {
        (view as unknown as Record<string, unknown>)[property] = value;
        Object.defineProperty(view, property, {
            get: () => value,
            set: () => {},
            configurable: true,
        });
    },

    get emptyTexture() {
        return Texture.EMPTY;
    },
    get whiteTexture() {
        return Texture.WHITE;
    },

    // A region is measured in the atlas page's own pixels; a `Texture` frame is measured in
    // its source's *logical* size, which is `pixelWidth / resolution`. The two are the same
    // thing on a full-size page and a factor of two apart on a `@0.5x` one, where an unscaled
    // frame lands at half the position and half the size — a 1px hit area comes out as a
    // block of whatever art sits a quarter of the way into the atlas.
    // libGDX packs a turned region counter-clockwise: groupD8 direction 6, as pixi-spine's own
    // region textures have it, with `orig` the region upright.
    subTexture(page, frame, rotate) {
        const { resolution } = page.source;
        const turned = rotate % 180 !== 0;
        const width = frame.width / resolution;
        const height = frame.height / resolution;

        return new Texture({
            source: page.source,
            frame: new Rectangle(frame.x / resolution, frame.y / resolution, width, height),
            orig: new Rectangle(0, 0, turned ? height : width, turned ? width : height),
            rotate: rotate ? (((720 - rotate) % 360) / 45) % 8 : 0,
        });
    },

    textureFromImage: (image) => Texture.from(image),
    point: (x, y) => new Point(x, y),
};
