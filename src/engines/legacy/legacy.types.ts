import type {
    ContainerLike,
    EngineTypes,
    PointLike,
    SpineLike,
    SpinePort,
    TextLike,
} from '../../engine/Engine';
import type { SkeletonDataLike } from '../../engine/runtime';

export type LegacyMajor = 4 | 5 | 6 | 7;

export type LegacyObservablePoint = ContainerLike['position'];

export interface LegacyMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

export interface LegacyTransform {
    localTransform: LegacyMatrix;
    updateLocalTransform(): void;
    setFromMatrix?(matrix: LegacyMatrix): void;
}

/** v4–v6 hand a listener an InteractionEvent (`data`); v7 a FederatedPointerEvent, which is the data. */
export interface LegacyPointerEvent {
    data?: { global: PointLike; pointerType?: string };
    global?: PointLike;
    pointerType?: string;
}

export type LegacyListener = (event: LegacyPointerEvent) => void;

export interface LegacyContainer extends ContainerLike {
    parent: LegacyContainer | null;
    children: LegacyContainer[];
    name: string | null;
    /** v4–v6. v7 warns on a write and maps `false` to `'auto'`, not `'none'`. */
    interactive?: boolean;
    /** v7.2+. */
    eventMode?: string;
    interactiveChildren: boolean;
    cursor: string | null;
    hitArea: unknown;
    width: number;
    height: number;
    containsPoint?(point: PointLike): boolean;
    on(event: string, fn: LegacyListener, context?: unknown): this;
    off(event: string, fn: LegacyListener, context?: unknown): this;
    emit(event: string, ...args: unknown[]): boolean;
}

export type LegacySpine = LegacyContainer & SpineLike;

export interface LegacySprite extends LegacyContainer {
    texture: LegacyTexture;
    anchor: TextLike['anchor'];
    tint: number;
}

export interface LegacyRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LegacyBaseTexture {
    resolution: number;
    width: number;
    height: number;
    realWidth: number;
    realHeight: number;
}

export interface LegacyTexture {
    baseTexture: LegacyBaseTexture;
    frame: LegacyRectangle;
    orig: LegacyRectangle;
    trim?: LegacyRectangle | null;
    rotate: number;
    width: number;
    height: number;
}

export interface LegacyTextureClass {
    new (
        baseTexture: LegacyBaseTexture,
        frame?: LegacyRectangle,
        orig?: LegacyRectangle,
        trim?: LegacyRectangle,
        rotate?: number,
    ): LegacyTexture;
    readonly EMPTY: LegacyTexture;
    readonly WHITE: LegacyTexture;
}

export type LegacyTextStyle = Record<string, unknown>;

export interface LegacyText extends LegacySprite, TextLike {
    parent: LegacyContainer | null;
    children: LegacyContainer[];
    style: LegacyTextStyle;
}

export interface LegacyBitmapFontChar {
    xOffset: number;
    yOffset: number;
    xAdvance: number;
    kerning: Record<number, number>;
    texture: LegacyTexture;
}

export interface LegacyBitmapFontData {
    font: string;
    size: number;
    lineHeight: number;
    chars: Record<number, LegacyBitmapFontChar>;
    distanceFieldType?: string;
}

export interface LegacyBitmapText extends LegacyContainer, TextLike {
    parent: LegacyContainer | null;
    children: LegacyContainer[];
    align: string;
    tint: number;
    maxWidth: number;
    letterSpacing: number;
    /** What `letterSpacing` sets, without marking the node dirty. */
    _letterSpacing: number;
    /** 5.3+: rounds each glyph's aligned x in font units. */
    _roundPixels?: boolean;
    /** 5.3+: a mesh per font page, its glyphs a quad of four (x, y) vertices each. */
    _activePagesMeshData?: LegacyPageMeshData[];
    readonly textWidth: number;
    readonly textHeight: number;
    dirty: boolean;
    anchor: LegacyObservablePoint;
    updateText(): void;
    validate(): void;
}

/** The `vertices` are its mesh's vertex buffer data, which the next render uploads. */
export interface LegacyPageMeshData {
    total: number;
    vertices: Float32Array;
}

/** v4 to 5.2: the family and size live in a font descriptor the `font` accessor reads and writes. */
export interface DescriptorBitmapText extends LegacyBitmapText {
    font: { name: string | null; size: number; align?: string; tint?: number };
}

/** 5.3+: public `fontName` and `fontSize`; the `fontName` setter throws on a family not installed. */
export interface NamedBitmapText extends LegacyBitmapText {
    fontName: string;
    fontSize: number;
}

/** The two calls of an XML document that v4–5.2's `BitmapText.registerFont` makes. */
export interface LegacyFontDocument {
    getElementsByTagName(name: string): ArrayLike<{ getAttribute(name: string): string | null }>;
}

export interface LegacyBitmapTextClass {
    new (text: string, style?: Record<string, unknown>): LegacyBitmapText;
    fonts?: Record<string, LegacyBitmapFontData | undefined>;
    registerFont?(
        xml: LegacyFontDocument,
        textures: Record<string, LegacyTexture>,
    ): LegacyBitmapFontData;
}

export interface LegacyBitmapFontClass {
    available: Record<string, LegacyBitmapFontData | undefined>;
    install(data: string, textures: Record<string, LegacyTexture>): LegacyBitmapFontData;
}

export interface LegacyLoaderResource {
    name?: string;
    url?: string;
    data?: unknown;
    texture?: LegacyTexture;
    spineData?: SkeletonDataLike;
}

export interface LegacyLoader {
    resources: Record<string, LegacyLoaderResource | undefined>;
}

export interface LegacyAssetsCache {
    has(key: string): boolean;
    get(key: string): unknown;
}

export interface LegacyEventEmitter {
    on(event: string, fn: LegacyListener, context?: unknown): unknown;
    off(event: string, fn: LegacyListener, context?: unknown): unknown;
}

export interface LegacyRenderer {
    plugins: { interaction?: LegacyEventEmitter };
}

export interface LegacyEmitter {
    emit: boolean;
    autoUpdate: boolean;
    emitterLifetime: number;
    frequency: number;
    update(dtSeconds: number): void;
    playOnce(callback?: () => void): void;
    destroy(): void;
}

/** pixi-particles 4.x, or @pixi/particle-emitter 5.x, which has `upgradeConfig`. */
export interface LegacyParticles {
    Emitter: new (
        parent: LegacyContainer,
        artOrConfig: unknown,
        config?: Record<string, unknown>,
    ) => LegacyEmitter;
    upgradeConfig?(config: Record<string, unknown>, art: LegacyTexture[]): object;
}

/**
 * The parts of PIXI 4.8, 5.x, 6.x and 7.2+ the legacy ports use, declared structurally: the
 * namespace is the one a game loaded with `<script>` tags, and its d.ts files declare a global
 * `PIXI` that must not leak into the other projects. Optional members exist on some majors only.
 */
export interface LegacyNamespace {
    VERSION: string;
    Container: new () => LegacyContainer;
    Sprite: new (texture?: LegacyTexture) => LegacySprite;
    Text: new (text?: string, style?: LegacyTextStyle) => LegacyText;
    Texture: LegacyTextureClass;
    BaseTexture: new (source?: unknown) => LegacyBaseTexture;
    Rectangle: new (x?: number, y?: number, width?: number, height?: number) => LegacyRectangle;
    Point: { new (x?: number, y?: number): LegacyObservablePoint; prototype: object };
    ObservablePoint: { prototype: object };
    Polygon: new (points: number[]) => object;
    Transform?: new () => LegacyTransform;
    /** v4; on v5 a getter that warns. */
    TransformBase?: new () => LegacyTransform;
    /** v4; on v5 a getter that warns. */
    extras?: { BitmapText?: LegacyBitmapTextClass };
    /** v5+; on v4 a getter that warns. */
    BitmapText?: LegacyBitmapTextClass;
    BitmapFont?: LegacyBitmapFontClass;
    /** v4's shared loader; on v5 a getter that warns. */
    loader?: LegacyLoader;
    Loader?: { shared?: LegacyLoader };
    Assets?: { cache: LegacyAssetsCache };
    utils?: { TextureCache: Record<string, LegacyTexture | undefined> };
    particles?: LegacyParticles;
}

export interface LegacyTypes<S extends LegacySpine = LegacySpine> extends EngineTypes {
    Spine: S;
    Container: LegacyContainer;
    Text: LegacyText;
    BitmapText: LegacyBitmapText;
    Texture: LegacyTexture;
}

/** What the display port asks the engine's spine port about a view it shields. */
export type SpineShapes<S extends LegacySpine = LegacySpine> = Pick<
    SpinePort<LegacyTypes<S>>,
    'runtimeOf' | 'shieldShapes' | 'exposeShapes'
>;
