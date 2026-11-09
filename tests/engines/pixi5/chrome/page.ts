import type { PointerEventLike } from '../../../../src/engine/Engine';
import type { SkeletonSource } from '../../../../src/engine/runtime';
import {
    createPixi5Engine,
    SpineLayoutCore,
    UnsupportedSpineVersionError,
    type Pixi5Engine,
    type Pixi5Spine,
    type Pixi5Types,
    type SpineLayoutView,
} from '../../../../src/pixi5';
import { discoverGlobalRuntimes } from '../../../../src/runtimes';

// the page's PIXI, from app-magic-editor's Pixi 5 bundle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const PIXI: any;

export interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface Drawn {
    /** Pixels of the page's red, which only the skeleton's region is painted in. */
    red: number;
    redBox: Box | null;
    /** Pixels lit at all. */
    lit: number;
    hash: string;
}

export interface CheckInput {
    skeleton: SkeletonSource;
    other: SkeletonSource;
    atlasText: string;
}

const SIZE = 128;

export const clicks: string[] = [];

function grow(box: Box | null, x: number, y: number, right = x, bottom = y): Box {
    return box
        ? {
              left: Math.min(box.left, x),
              top: Math.min(box.top, y),
              right: Math.max(box.right, right),
              bottom: Math.max(box.bottom, bottom),
          }
        : { left: x, top: y, right, bottom };
}

/** The page's one region, `square` at 0, 0, 40 × 20, painted red. */
function pageTexture(engine: Pixi5Engine) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 40, 20);
    return engine.display.textureFromImage(canvas);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawn(app: any): Drawn {
    app.renderer.render(app.stage);

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d')!;
    context.drawImage(app.view, 0, 0);
    const { data } = context.getImageData(0, 0, SIZE, SIZE);

    let red = 0;
    let lit = 0;
    let redBox: Box | null = null;
    let hash = 0x811c9dc5;

    for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const [r, g, b] = data.subarray((y * SIZE + x) * 4);
            if (r || g || b) lit++;
            if (r > 128 && g < 64 && b < 64) {
                red++;
                redBox = grow(redBox, x, y);
            }
        }
    }

    return { red, redBox, lit, hash: (hash >>> 0).toString(16) };
}

/**
 * The pixels the slots' attachments cover, by the engine's own outlines: each one's
 * `hitPolygon`, carried to the canvas by an object hung off its slot.
 */
function outlined(engine: Pixi5Engine, spine: Pixi5Spine, slots: string[]): Box | null {
    let box: Box | null = null;

    for (const name of slots) {
        const slot = spine.skeleton.findSlot(name)!;
        const polygon = engine.spine.hitPolygon(slot, engine.spine.slotAttachment(slot));
        if (!polygon) continue;

        const probe = engine.display.container();
        engine.spine.attachSlotObject(spine, name, probe);
        engine.spine.update(spine, 0);

        for (let i = 0; i < polygon.length; i += 2) {
            const corner = probe.toGlobal(engine.display.point(polygon[i], polygon[i + 1]));
            box = grow(box, corner.x, corner.y);
        }
        engine.spine.detachSlotObject(spine, probe);
    }

    return (
        box && {
            left: Math.round(box.left),
            top: Math.round(box.top),
            right: Math.round(box.right) - 1,
            bottom: Math.round(box.bottom) - 1,
        }
    );
}

const PARTICLES = {
    alpha: { start: 1, end: 1 },
    scale: { start: 0.5, end: 0.5 },
    color: { start: 'ffffff', end: 'ffffff' },
    speed: { start: 20, end: 20 },
    startRotation: { min: 0, max: 360 },
    rotationSpeed: { min: 0, max: 0 },
    lifetime: { min: 1, max: 1 },
    frequency: 0.01,
    emitterLifetime: -1,
    maxParticles: 50,
    pos: { x: 0, y: 0 },
    addAtBack: false,
    spawnType: 'point',
};

/**
 * On a page of the editor's Pixi 5 bundle and one of its pixi-spine bundles: builds the engine
 * from the runtime `discoverGlobalRuntimes` finds, draws the skeleton through WebGL as the engine
 * builds it and as the layout core lays it out, set up and posed, emits particles, refuses the
 * other minor's export, and leaves a shielded skeleton with a button on a slot for the caller to
 * click.
 */
export function run({ skeleton, other, atlasText }: CheckInput) {
    PIXI.utils.skipHello();

    const runtimes = discoverGlobalRuntimes();
    const app = new PIXI.Application({
        width: SIZE,
        height: SIZE,
        backgroundColor: 0,
        antialias: false,
        preserveDrawingBuffer: true,
        autoStart: false,
    });
    document.body.appendChild(app.view);

    const engine = createPixi5Engine(PIXI, { runtime: runtimes[0], renderer: app.renderer });
    const textures = { 'contract.png': pageTexture(engine) };
    const gl = app.renderer.gl as WebGLRenderingContext;
    const info = gl.getExtension('WEBGL_debug_renderer_info');

    const slots = ['slot_a', 'slot_b'];
    const built = engine.spine.create(engine.spine.readSkeleton(skeleton, atlasText, textures));
    built.autoUpdate = false;
    built.position.set(64, 64);
    app.stage.addChild(built);
    engine.spine.update(built, 0);
    const byEngine = { drawn: drawn(app), outlined: outlined(engine, built, slots) };
    app.stage.removeChildren();

    const layout = new SpineLayoutCore<Pixi5Types>({ engine }) as SpineLayoutView<Pixi5Types>;
    layout.createInstancesFromDataArray([{ name: 'root', skeleton, atlasText, textures }]);
    layout.position.set(64, 64);
    app.stage.addChild(layout);

    const spine = layout.spines.get('root')!;
    spine.autoUpdate = false;
    engine.spine.update(spine, 0);
    const setup = { drawn: drawn(app), outlined: outlined(engine, spine, slots) };

    spine.state.setAnimation(0, 'move', false);
    engine.spine.update(spine, 0.75);
    const moved = { drawn: drawn(app), outlined: outlined(engine, spine, slots) };

    app.stage.removeChildren();
    const emitterParent = engine.display.container();
    emitterParent.position.set(SIZE / 2, SIZE / 2);
    app.stage.addChild(emitterParent);
    const emitter = engine.particles!.createEmitter(
        emitterParent,
        [engine.display.whiteTexture],
        PARTICLES,
    );
    emitter.emit = true;
    emitter.update(0.2);
    const particles = { count: emitterParent.children.length, drawn: drawn(app) };
    emitter.destroy();
    app.stage.removeChildren();

    let rejection: Record<string, unknown> | undefined;
    try {
        engine.spine.readSkeleton(other, atlasText, textures, { file: 'other.json' });
    } catch (error) {
        rejection = {
            unsupported: error instanceof UnsupportedSpineVersionError,
            message: (error as Error).message,
        };
    }

    const behind = engine.display.sprite(engine.display.whiteTexture);
    behind.width = behind.height = SIZE;
    const layer = engine.display.container({ interactive: 'static' });
    const clickable = engine.spine.create(engine.spine.readSkeleton(skeleton, atlasText, textures));
    const button = engine.display.sprite(engine.display.whiteTexture, 0.5);
    button.width = button.height = 8;
    clickable.autoUpdate = false;

    const record = (name: string) => (event: PointerEventLike) =>
        clicks.push(`${name} ${event.global.x},${event.global.y}`);
    engine.display.setInteractive(behind, 'static');
    engine.display.setInteractive(button, 'static');
    engine.display.on(behind, 'pointerdown', record('behind'));
    engine.display.on(button, 'pointerdown', record('button'));

    layer.position.set(64, 64);
    layer.addChild(clickable);
    app.stage.addChild(behind);
    app.stage.addChild(layer);
    engine.spine.attachSlotObject(clickable, 'slot_b', button);
    engine.display.shieldFromHitTesting(clickable);
    engine.spine.update(clickable, 0);
    app.renderer.render(app.stage);

    const onButton = button.toGlobal(engine.display.point(0, 0));
    const slotA = outlined(engine, clickable, ['slot_a'])!;

    return {
        runtimes: runtimes.map(({ info: runtime }) => runtime),
        engineRuntimes: engine.spine.runtimes,
        rendererType: app.renderer.type,
        webgl: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        byEngine,
        setup,
        moved,
        particles,
        rejection,
        clickAt: {
            button: [Math.round(onButton.x), Math.round(onButton.y)],
            region: [
                Math.round((slotA.left + slotA.right) / 2),
                Math.round((slotA.top + slotA.bottom) / 2),
            ],
        },
    };
}
