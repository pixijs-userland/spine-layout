import type { DisplayPort, InteractiveMode, PointerEventLike } from '../../engine/Engine';
import type { LegacyCompat } from './compat';
import type {
    LegacyContainer,
    LegacyListener,
    LegacyNamespace,
    LegacyPointerEvent,
    LegacyRenderer,
    LegacySpine,
    LegacyTypes,
    SpineShapes,
} from './legacy.types';

const never = () => false;

/** A region turned `degrees` on its page, as the `GroupD8` direction pixi-spine gives its texture. */
const directionOf = (degrees: number) => (((720 - degrees) % 360) / 45) % 8;

const federatedPayload = (event: LegacyPointerEvent): PointerEventLike => ({
    global: event.global!,
    pointerType: event.pointerType,
});

const interactionPayload = (event: LegacyPointerEvent): PointerEventLike => ({
    global: event.data!.global,
    pointerType: event.data!.pointerType,
});

export function createDisplayPort<S extends LegacySpine>(
    PIXI: LegacyNamespace,
    compat: LegacyCompat,
    spine: (() => SpineShapes<S>) | undefined,
    renderer?: LegacyRenderer,
): DisplayPort<LegacyTypes<S>> {
    const federated = compat.events === 'federated';
    const payload = federated ? federatedPayload : interactionPayload;
    const listeners = new WeakMap<(event: PointerEventLike) => void, LegacyListener>();
    const childrenWereInteractive = new WeakMap<LegacyContainer, boolean>();

    const listenerOf = (fn: (event: PointerEventLike) => void) => {
        let listener = listeners.get(fn);
        if (!listener) {
            listener = (event) => fn(payload(event));
            listeners.set(fn, listener);
        }
        return listener;
    };

    const setInteractive = (view: LegacyContainer, mode: InteractiveMode) => {
        if (federated) view.eventMode = mode;
        else view.interactive = mode === 'static';
        view.interactiveChildren = mode === 'static';
    };

    const shapesOf = (view: LegacyContainer) => {
        const shapes = spine?.();
        return shapes?.runtimeOf(view as S) ? shapes : undefined;
    };

    function listenForMoves(root: LegacyContainer, event: string, onMove: LegacyListener) {
        const listener = new PIXI.Container();
        listener.name = 'pointer-listener';
        setInteractive(listener, 'static');
        listener.on(event, onMove);
        root.addChild(listener);

        return () => {
            listener.off(event, onMove);
            listener.parent?.removeChild(listener);
        };
    }

    return {
        containerClass: PIXI.Container,

        container(options) {
            const container = new PIXI.Container();
            if (options?.label !== undefined) container.name = options.label;
            if (options?.interactive) setInteractive(container, options.interactive);
            return container;
        },

        sprite(texture, anchor) {
            const sprite = new PIXI.Sprite(texture);
            if (anchor !== undefined) sprite.anchor.set(anchor);
            return sprite;
        },

        setLabel: (view, label) => {
            view.name = label;
        },
        setInteractive,
        setCursor: (view, cursor) => {
            view.cursor = cursor;
        },
        setHitArea: (view, polygon) => {
            view.hitArea = polygon ? new PIXI.Polygon(polygon) : null;
        },

        on: (view, event, fn) => void view.on(event, listenerOf(fn)),
        off: (view, event, fn) => void view.off(event, listenerOf(fn)),

        // v7 sends `globalpointermove` to every interactive object, hit or not. v4–v6 have no
        // such event: their interaction manager emits every move itself, and without one an
        // empty interactive container hears every `pointermove` while it is never a hit target.
        onGlobalPointerMove(root, fn) {
            const onMove: LegacyListener = (event) => fn(payload(event).global);
            if (federated) return listenForMoves(root, 'globalpointermove', onMove);

            const interaction = renderer?.plugins.interaction;
            if (!interaction) return listenForMoves(root, 'pointermove', onMove);

            interaction.on('pointermove', onMove);
            return () => void interaction.off('pointermove', onMove);
        },

        /**
         * Takes a view's own shape out of hit-testing, while its children keep answering for
         * themselves; a spine's own shapes are its runtime's to know. A BitmapText's glyphs are
         * children that answer too: sprites up to 5.2, a mesh per page from 5.3.
         */
        shieldFromHitTesting(view) {
            view.containsPoint = never;

            const shapes = shapesOf(view);
            if (shapes) shapes.shieldShapes(view as S);
            else if (view instanceof compat.BitmapText) {
                if (!childrenWereInteractive.has(view))
                    childrenWereInteractive.set(view, view.interactiveChildren);
                view.interactiveChildren = false;
            }
        },

        exposeToHitTesting(view) {
            if (Object.hasOwn(view, 'containsPoint')) delete view.containsPoint;

            shapesOf(view)?.exposeShapes(view as S);

            const children = childrenWereInteractive.get(view);
            if (children !== undefined) {
                view.interactiveChildren = children;
                childrenWereInteractive.delete(view);
            }
        },

        removeFromParent: (view) => void view.parent?.removeChild(view),

        pin(view, property, value) {
            (view as unknown as Record<string, unknown>)[property] = value;
            Object.defineProperty(view, property, {
                get: () => value,
                set: () => {},
                configurable: true,
            });
        },

        get emptyTexture() {
            return PIXI.Texture.EMPTY;
        },
        get whiteTexture() {
            return PIXI.Texture.WHITE;
        },

        subTexture(page, frame, rotate) {
            const { baseTexture } = page;
            const { resolution } = baseTexture;
            const turned = rotate % 180 !== 0;
            const width = frame.width / resolution;
            const height = frame.height / resolution;

            return new PIXI.Texture(
                baseTexture,
                new PIXI.Rectangle(frame.x / resolution, frame.y / resolution, width, height),
                new PIXI.Rectangle(0, 0, turned ? height : width, turned ? width : height),
                undefined,
                rotate ? directionOf(rotate) : 0,
            );
        },

        textureFromImage: (image) =>
            new PIXI.Texture(new PIXI.BaseTexture(compat.imageBitmaps ? image : drawable(image))),
        point: (x, y) => new PIXI.Point(x, y),
    };
}

function drawable(
    image: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
): HTMLImageElement | HTMLCanvasElement {
    if (!('close' in image)) return image;

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    image.close();

    return canvas;
}
