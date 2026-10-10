import type {
    AnimationLike,
    BoneLike,
    SkeletonDataLike,
    SkeletonLike,
    SkeletonSource,
    SlotLike,
    AnimationStateLike,
} from './runtime';
import type { TextsJsonEntry } from '../config/types';

/**
 * Everything the layout core needs from a rendering stack, as one object with five ports.
 *
 * The core (`SpineLayout` and its controllers) imports nothing from `pixi.js` or a Spine
 * runtime; it calls these. `engines/pixi8` is pixi.js v8 + spine-pixi-v8, `engines/pixi4`
 * is PIXI v4 + pixi-spine (spine-ts 3.8) + pixi-particles. A port that is `undefined` is a
 * feature the engine does not have — the core degrades instead of throwing.
 */
export interface Engine<T extends EngineTypes = EngineTypes> {
    readonly name: EngineName;
    readonly spine: SpinePort<T>;
    readonly display: DisplayPort<T>;
    readonly text: TextPort<T>;
    readonly assets: AssetsPort;
    readonly particles?: ParticlesPort<T>;
}

export type EngineName = 'pixi8' | 'pixi4';

/** The concrete classes an engine renders with. `Spine` doubles as a container. */
export interface EngineTypes {
    Spine: SpineLike;
    Container: ContainerLike;
    Text: TextLike;
    BitmapText: TextLike;
    Texture: object;
}

export interface PointLike {
    x: number;
    y: number;
}

export interface RectLike extends PointLike {
    width: number;
    height: number;
}

/** A display object, as both Pixi v4 and v8 spell the parts the core touches. */
export interface ContainerLike {
    parent: ContainerLike | null;
    children: ContainerLike[];
    visible: boolean;
    alpha: number;
    x: number;
    y: number;
    position: PointLike & { set(x: number, y?: number): void; copyFrom(point: PointLike): unknown };
    scale: PointLike & { set(x: number, y?: number): void };
    addChild<C extends ContainerLike>(child: C): C;
    removeChild<C extends ContainerLike>(child: C): C;
    removeChildren(): ContainerLike[];
    destroy(options?: unknown): void;
    toGlobal<P extends PointLike>(position: PointLike, point?: P, skipUpdate?: boolean): P;
    toLocal<P extends PointLike>(
        position: PointLike,
        from?: ContainerLike,
        point?: P,
        skipUpdate?: boolean,
    ): P;
}

export interface SpineLike extends ContainerLike {
    state: AnimationStateLike;
    skeleton: SkeletonLike;
}

export interface TextLike extends ContainerLike {
    text: string;
    anchor: PointLike & { set(x: number, y?: number): void };
    width: number;
    height: number;
}

/**
 * The parts of a bone's pose the core reads and writes: where it is in its parent, where it
 * landed in the world, and the way back from world space to its parent's.
 */
export interface BonePose extends PointLike {
    readonly worldX: number;
    readonly worldY: number;
    /** Converts `point` from skeleton space into this bone's parent's space, in place. */
    worldToParent<P extends PointLike>(point: P): P;
}

export type PoseScope = 'all' | 'bones' | 'slots' | 'drawOrder';

/** What one timeline of an animation writes to. `index` is the bone/slot/constraint index. */
export type PoseClaimEntry =
    | { kind: 'bone'; index: number }
    | { kind: 'slot'; index: number }
    | { kind: 'constraint'; index: number }
    | { kind: 'drawOrder' }
    | { kind: 'event' };

export interface RegionTextureInfo<Texture> {
    /** The atlas page the region is cut from. */
    page: Texture;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Degrees the region is rotated on the page: 0, 90 or 270. */
    rotate: number;
    /** The page's resolution, which its pixel coordinates are in. */
    resolution: number;
}

/** Operations on the Spine runtime and on the engine's `Spine` display object. */
export interface SpinePort<T extends EngineTypes> {
    /** Reads a skeleton against its atlas; `textures` by page name. Empty atlas text is fine. */
    readSkeleton(
        source: SkeletonSource,
        atlasText: string,
        textures: Record<string, T['Texture']>,
    ): SkeletonDataLike;
    /** Reads a skeleton that the engine's asset cache already holds under those aliases. */
    readSkeletonFromAssets(skeletonAlias: string, atlasAlias?: string): SkeletonDataLike;
    create(data: SkeletonDataLike): T['Spine'];
    /** Advances the spine by `dt` seconds; 0 re-applies the tracks and re-syncs slot objects. */
    update(spine: T['Spine'], dt: number): void;

    bonePose(bone: BoneLike): BonePose;
    /** Where the bone sits in its parent when nothing poses it. */
    boneSetup(bone: BoneLike): PointLike;
    slotAttachment(slot: SlotLike): unknown;
    slotAlpha(slot: SlotLike): number;
    setupPose(skeleton: SkeletonLike, scope: PoseScope): void;
    boneToSetup(bone: BoneLike): void;
    slotToSetup(slot: SlotLike): void;
    updateWorldTransform(skeleton: SkeletonLike): void;
    drawOrder(skeleton: SkeletonLike): SlotLike[];

    claimOf(animation: AnimationLike): PoseClaimEntry[];

    /**
     * The attachment's outline in the slot's bone space, as flat `x, y` pairs — a region's
     * four corners, an unweighted mesh's hull. `undefined` when the slot shows nothing hittable.
     */
    hitPolygon(spine: T['Spine'], slot: SlotLike): number[] | undefined;
    /** The slot's region or mesh attachment image on its page, or `null` for anything else. */
    regionTexture(attachment: unknown): RegionTextureInfo<T['Texture']> | null;

    /** Hangs `child` off the slot: it follows the bone, the slot's alpha and visibility. */
    attachSlotObject(spine: T['Spine'], slotName: string, child: T['Container']): void;
    getSlotObject(spine: T['Spine'], slotName: string): T['Container'] | undefined;
    detachSlotObject(spine: T['Spine'], slotOrChild: string | T['Container']): void;
    /** Orders the slot objects like the slots they hang off. A no-op where the engine does it. */
    syncSlotObjectsWithDrawOrder(spine: T['Spine']): void;
}

export type InteractiveMode = 'static' | 'none';
export type PointerEventName =
    | 'pointerover'
    | 'pointerout'
    | 'pointerdown'
    | 'pointerup'
    | 'pointerupoutside';

export interface PointerEventLike {
    global: PointLike;
}

/** Display objects, textures and interaction. */
export interface DisplayPort<T extends EngineTypes> {
    container(options?: { label?: string; interactive?: InteractiveMode }): T['Container'];
    sprite(texture: T['Texture']): T['Container'];
    setLabel(view: T['Container'], label: string): void;
    setInteractive(view: T['Container'], mode: InteractiveMode): void;
    setCursor(view: T['Container'], cursor: string): void;
    setHitArea(view: T['Container'], polygon: number[] | undefined): void;
    on(view: T['Container'], event: PointerEventName, fn: (event: PointerEventLike) => void): void;
    off(view: T['Container'], event: PointerEventName, fn: (event: PointerEventLike) => void): void;
    /** Every pointer move on the stage, hit or not. Returns the unsubscribe. */
    onGlobalPointerMove(root: T['Container'], fn: (global: PointLike) => void): () => void;
    /** Takes the view's own shape out of hit-testing, so an interactive ancestor stops seeing it. */
    shieldFromHitTesting(view: T['Container']): void;
    exposeToHitTesting(view: T['Container']): void;
    removeFromParent(view: T['Container']): void;
    /** Holds a property at `value` whatever the engine writes to it each frame. */
    pin(view: T['Container'], property: 'alpha' | 'visible', value: number | boolean): void;

    readonly emptyTexture: T['Texture'];
    readonly whiteTexture: T['Texture'];
    /** Cuts `frame` (page pixels) out of a page texture; `rotate` in degrees. */
    subTexture(page: T['Texture'], frame: RectLike, rotate: number): T['Texture'];
    textureFromImage(image: ImageBitmap | HTMLImageElement | HTMLCanvasElement): T['Texture'];
    point(x?: number, y?: number): PointLike;
}

export interface BitmapGlyphBounds {
    /** Glyph box in text-local pixels, before the node's own scale. */
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface BitmapMeasure extends BitmapGlyphBounds {
    width: number;
    height: number;
    lines: { width: number; text: string }[];
}

export interface TextCapabilities {
    justify: boolean;
    maxHeight: boolean;
}

/** `Text` and `BitmapText` nodes, and the `texts.json` entry → engine style translation. */
export interface TextPort<T extends EngineTypes> {
    readonly capabilities: TextCapabilities;
    createText(): T['Text'];
    createBitmapText(): T['BitmapText'];
    isBitmapText(view: T['Container']): view is T['BitmapText'];
    /** Applies a `texts.json` entry as the engine's own style; keys it has no match for are dropped. */
    applyEntry(text: T['Text'] | T['BitmapText'], entry: TextsJsonEntry): void;
    /** Applies a partial style in the engine's own terms, as `texts.setStyle` is called with. */
    applyStyle(text: T['Text'] | T['BitmapText'], style: Record<string, unknown>): void;
    getStyle(text: T['Text'] | T['BitmapText']): Record<string, unknown>;
    setWordWrapWidth(text: T['Text'] | T['BitmapText'], width: number | undefined): void;
    measureBitmap(text: T['BitmapText']): BitmapMeasure;
    hasBitmapFont(family: string): boolean;
    /** Registers a `.fnt` (text or XML) with its page textures by page file name. */
    registerBitmapFont(fnt: string, pages: Record<string, T['Texture']>): string;
}

/** The engine's asset cache: what a manifest or loader put there, by alias. */
export interface AssetsPort {
    get<A = unknown>(alias: string): A | undefined;
}

export interface EmitterLike {
    emit: boolean;
    update(dtSeconds: number): void;
    /** Starts a burst: emits once over the config's lifetime even when `emit` is off. */
    playOnce(): void;
    destroy(): void;
}

export interface ParticlesPort<T extends EngineTypes> {
    createEmitter(
        parent: T['Container'],
        textures: T['Texture'][],
        config: Record<string, unknown>,
    ): EmitterLike;
}
