import type { DisplayPort, InteractiveMode, PointerEventLike } from '../../engine/Engine';
import type {
    Pixi4Container,
    Pixi4Listener,
    Pixi4Namespace,
    Pixi4Renderer,
    Pixi4Spine,
    Pixi4Types,
} from './pixi4.types';
import { directionOf } from './groupD8';
import type { SlotObjects } from './slotObjects';

const never = () => false;

const FACTORIES = ['newSprite', 'newMesh', 'newGraphics'] as const;

export function createDisplayPort(
    PIXI: Pixi4Namespace,
    slotObjects: SlotObjects,
    renderer?: Pixi4Renderer,
): DisplayPort<Pixi4Types> {
    const listeners = new WeakMap<(event: PointerEventLike) => void, Pixi4Listener>();
    const childrenWereInteractive = new WeakMap<Pixi4Container, boolean>();

    const listenerOf = (fn: (event: PointerEventLike) => void) => {
        let listener = listeners.get(fn);
        if (!listener) {
            listener = (event) =>
                fn({ global: event.data.global, pointerType: event.data.pointerType });
            listeners.set(fn, listener);
        }
        return listener;
    };

    const setInteractive = (view: Pixi4Container, mode: InteractiveMode) => {
        view.interactive = mode === 'static';
        view.interactiveChildren = mode === 'static';
    };

    const isSpine = (view: Pixi4Container): view is Pixi4Spine => view instanceof PIXI.spine.Spine;

    /** pixi-spine's own sprites, meshes and clipping graphics: every slot container child but ours. */
    const spineShapes = (spine: Pixi4Spine) =>
        spine.slotContainers.flatMap((container) =>
            container.children.filter((view) => !slotObjects.isHolder(view) && view.containsPoint),
        );

    function shieldSpine(spine: Pixi4Spine) {
        spineShapes(spine).forEach((view) => (view.containsPoint = never));

        // pixi-spine creates a sprite the first time its attachment shows, long after this runs
        FACTORIES.forEach((factory) => {
            const create = PIXI.spine.Spine.prototype[factory] as (
                ...args: unknown[]
            ) => Pixi4Container;

            spine[factory] = ((...args: unknown[]) => {
                const view = create.apply(spine, args);
                view.containsPoint = never;
                return view;
            }) as never;
        });
    }

    function exposeSpine(spine: Pixi4Spine) {
        FACTORIES.forEach((factory) => {
            if (Object.hasOwn(spine, factory)) delete spine[factory];
        });
        spineShapes(spine).forEach((view) => {
            if (Object.hasOwn(view, 'containsPoint')) delete view.containsPoint;
        });
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

        // The interaction manager emits every move itself. Without it, an empty interactive
        // container does as well: v4 sends `pointermove` to every interactive object it walks,
        // hit or not, and one with no shape and no children is never the target of anything.
        onGlobalPointerMove(root, fn) {
            const onMove: Pixi4Listener = (event) => fn(event.data.global);

            if (renderer) {
                const { interaction } = renderer.plugins;
                interaction.on('pointermove', onMove);
                return () => void interaction.off('pointermove', onMove);
            }

            const listener = new PIXI.Container();
            listener.name = 'pointer-listener';
            listener.interactive = true;
            listener.on('pointermove', onMove);
            root.addChild(listener);

            return () => {
                listener.off('pointermove', onMove);
                listener.parent?.removeChild(listener);
            };
        },

        /**
         * Takes a view's own shape out of hit-testing, while its children keep answering for
         * themselves. v4 asks every child of an interactive ancestor `containsPoint`, so a
         * skeleton drawn in front of a button would otherwise answer for its sprites.
         */
        shieldFromHitTesting(view) {
            view.containsPoint = never;

            if (isSpine(view)) shieldSpine(view);
            else if (view instanceof PIXI.extras.BitmapText) {
                childrenWereInteractive.set(view, view.interactiveChildren);
                view.interactiveChildren = false;
            }
        },

        exposeToHitTesting(view) {
            if (Object.hasOwn(view, 'containsPoint')) delete view.containsPoint;

            if (isSpine(view)) exposeSpine(view);

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

        textureFromImage: (image) => new PIXI.Texture(new PIXI.BaseTexture(drawable(image))),
        point: (x, y) => new PIXI.Point(x, y),
    };
}

/** v4's BaseTexture waits for an `onload` that an ImageBitmap never fires; a canvas is ready at once. */
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
