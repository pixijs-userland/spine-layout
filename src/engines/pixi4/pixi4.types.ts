import type {
    ContainerLike,
    EngineTypes,
    PointLike,
    SpineLike,
    TextLike,
} from '../../engine/Engine';
import type {
    AnimationLike,
    AnimationStateLike,
    BoneDataLike,
    BoneLike,
    SkeletonDataLike,
    SkeletonLike,
    SlotDataLike,
    SlotLike,
} from '../../engine/runtime';

export interface Pixi4Matrix {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

export type Pixi4ObservablePoint = ContainerLike['position'];

export interface Pixi4Transform {
    localTransform: Pixi4Matrix;
    updateLocalTransform(): void;
    setFromMatrix?(matrix: Pixi4Matrix): void;
}

export type Pixi4Listener = (event: Pixi4InteractionEvent) => void;

export interface Pixi4InteractionEvent {
    data: { global: PointLike; pointerType?: string };
}

export interface Pixi4Container extends ContainerLike {
    parent: Pixi4Container | null;
    children: Pixi4Container[];
    name: string | null;
    renderable: boolean;
    interactive: boolean;
    interactiveChildren: boolean;
    buttonMode: boolean;
    cursor: string | null;
    hitArea: unknown;
    transform: Pixi4Transform;
    worldTransform: Pixi4Matrix;
    position: Pixi4ObservablePoint;
    scale: Pixi4ObservablePoint;
    containsPoint?(point: PointLike): boolean;
    addChildAt<C extends ContainerLike>(child: C, index: number): C;
    getChildIndex(child: ContainerLike): number;
    setChildIndex(child: ContainerLike, index: number): void;
    width: number;
    height: number;
    on(event: string, fn: Pixi4Listener, context?: unknown): this;
    off(event: string, fn: Pixi4Listener, context?: unknown): this;
    emit(event: string, ...args: unknown[]): boolean;
}

export interface Pixi4Sprite extends Pixi4Container {
    texture: Pixi4Texture;
    anchor: TextLike['anchor'];
    tint: number;
}

export interface Pixi4Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Pixi4BaseTexture {
    resolution: number;
    width: number;
    height: number;
    realWidth: number;
    realHeight: number;
    hasLoaded: boolean;
}

export interface Pixi4Texture {
    baseTexture: Pixi4BaseTexture;
    frame: Pixi4Rectangle;
    orig: Pixi4Rectangle;
    trim?: Pixi4Rectangle | null;
    rotate: number;
    width: number;
    height: number;
}

export interface Pixi4TextureClass {
    new (
        baseTexture: Pixi4BaseTexture,
        frame?: Pixi4Rectangle,
        orig?: Pixi4Rectangle,
        trim?: Pixi4Rectangle,
        rotate?: number,
    ): Pixi4Texture;
    readonly EMPTY: Pixi4Texture;
    readonly WHITE: Pixi4Texture;
}

export type Pixi4TextStyle = Record<string, unknown>;

export interface Pixi4Text extends Pixi4Sprite, TextLike {
    parent: Pixi4Container | null;
    children: Pixi4Container[];
    style: Pixi4TextStyle;
}

export interface Pixi4BitmapFontChar {
    xOffset: number;
    yOffset: number;
    xAdvance: number;
    kerning: Record<number, number>;
    texture: Pixi4Texture;
}

export interface Pixi4BitmapFontData {
    font: string;
    size: number;
    lineHeight: number;
    chars: Record<number, Pixi4BitmapFontChar>;
}

export interface Pixi4BitmapText extends Pixi4Container, TextLike {
    parent: Pixi4Container | null;
    children: Pixi4Container[];
    font: { name: string | null; size: number; align?: string; tint?: number };
    align: string;
    tint: number;
    maxWidth: number;
    letterSpacing: number;
    readonly textWidth: number;
    readonly textHeight: number;
    dirty: boolean;
    anchor: Pixi4ObservablePoint;
    updateText(): void;
}

/** The two calls of an XML document that `BitmapText.registerFont` makes. */
export interface Pixi4FontDocument {
    getElementsByTagName(name: string): ArrayLike<{ getAttribute(name: string): string | null }>;
}

export interface Pixi4BitmapTextClass {
    new (
        text: string,
        style?: { font?: { name: string; size: number }; align?: string },
    ): Pixi4BitmapText;
    fonts: Record<string, Pixi4BitmapFontData | undefined>;
    registerFont(
        xml: Pixi4FontDocument,
        textures: Record<string, Pixi4Texture>,
    ): Pixi4BitmapFontData;
}

export interface Pixi4LoaderResource {
    name?: string;
    url?: string;
    data?: unknown;
    texture?: Pixi4Texture;
    spineData?: Spine38SkeletonData;
}

export interface Pixi4Loader {
    resources: Record<string, Pixi4LoaderResource | undefined>;
}

export interface Pixi4EventEmitter {
    on(event: string, fn: Pixi4Listener, context?: unknown): unknown;
    off(event: string, fn: Pixi4Listener, context?: unknown): unknown;
}

export interface Pixi4Renderer {
    plugins: { interaction: Pixi4EventEmitter };
}

export interface Spine38Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface Spine38BoneData extends BoneDataLike {
    parent: Spine38BoneData | null;
    x: number;
    y: number;
}

export interface Spine38Bone extends BoneLike {
    data: Spine38BoneData;
    parent: Spine38Bone | null;
    x: number;
    y: number;
    readonly worldX: number;
    readonly worldY: number;
    matrix: Pixi4Matrix;
    active: boolean;
    setToSetupPose(): void;
    worldToLocal<P extends PointLike>(world: P): P;
}

export interface Spine38TextureRegion {
    texture: Pixi4Texture;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    offsetX: number;
    spineOffsetY: number;
}

export interface Spine38RegionAttachment {
    name: string;
    region: Spine38TextureRegion | null;
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    width: number;
    height: number;
}

export interface Spine38MeshAttachment {
    name: string;
    region: Spine38TextureRegion | null;
    vertices: ArrayLike<number>;
    hullLength: number;
    bones: number[] | null;
}

export interface Spine38Slot extends SlotLike {
    bone: Spine38Bone;
    attachment: unknown;
    color: Spine38Color;
    currentSprite?: Pixi4Container | null;
    currentMesh?: Pixi4Container | null;
    currentGraphics?: Pixi4Container | null;
    clippingContainer?: Pixi4Container | null;
    setToSetupPose(): void;
}

export interface Spine38SlotData extends SlotDataLike {
    boneData: Spine38BoneData;
}

export interface Spine38IkConstraint {
    data: {
        mix: number;
        softness: number;
        bendDirection: number;
        compress: boolean;
        stretch: boolean;
    };
    mix: number;
    softness: number;
    bendDirection: number;
    compress: boolean;
    stretch: boolean;
}

export interface Spine38TransformConstraint {
    data: { rotateMix: number; translateMix: number; scaleMix: number; shearMix: number };
    rotateMix: number;
    translateMix: number;
    scaleMix: number;
    shearMix: number;
}

export interface Spine38PathConstraint {
    data: { position: number; spacing: number; rotateMix: number; translateMix: number };
    position: number;
    spacing: number;
    rotateMix: number;
    translateMix: number;
}

export interface Spine38Timeline {
    getPropertyId(): number;
    boneIndex?: number;
    slotIndex?: number;
    ikConstraintIndex?: number;
    transformConstraintIndex?: number;
    pathConstraintIndex?: number;
    attachment?: { id: number };
}

export interface Spine38Animation extends AnimationLike {
    timelines: Spine38Timeline[];
}

export interface Spine38SkeletonData extends SkeletonDataLike {
    slots: Spine38SlotData[];
    animations: Spine38Animation[];
    ikConstraints: unknown[];
    transformConstraints: unknown[];
    pathConstraints: unknown[];
}

export interface Spine38Skeleton extends SkeletonLike {
    data: Spine38SkeletonData;
    bones: Spine38Bone[];
    slots: Spine38Slot[];
    drawOrder: Spine38Slot[];
    color: Spine38Color;
    ikConstraints: Spine38IkConstraint[];
    transformConstraints: Spine38TransformConstraint[];
    pathConstraints: Spine38PathConstraint[];
    setToSetupPose(): void;
    setBonesToSetupPose(): void;
    setSlotsToSetupPose(): void;
    updateWorldTransform(): void;
}

export interface Spine38AnimationState extends AnimationStateLike {
    apply(skeleton: Spine38Skeleton): boolean;
}

export interface Pixi4Spine extends Pixi4Container, SpineLike {
    parent: Pixi4Container | null;
    children: Pixi4Container[];
    skeleton: Spine38Skeleton;
    state: Spine38AnimationState;
    spineData: Spine38SkeletonData;
    slotContainers: Pixi4Container[];
    autoUpdate: boolean;
    update(dt: number): void;
    newSprite(texture: Pixi4Texture): Pixi4Sprite;
    newMesh(texture: Pixi4Texture, ...rest: unknown[]): Pixi4Container;
    newGraphics(): Pixi4Container;
}

export type Spine38TextureLoader = (
    path: string,
    load: (texture: Pixi4BaseTexture | null) => void,
) => void;

export interface Spine38TextureAtlas {
    pages: { name: string; baseTexture: Pixi4BaseTexture }[];
}

export interface Spine38SkeletonReader<Source> {
    scale: number;
    readSkeletonData(source: Source): Spine38SkeletonData;
}

type RuntimeClass = abstract new (...args: never[]) => object;

export interface Spine38Core {
    TextureAtlas: new (
        atlasText?: string,
        textureLoader?: Spine38TextureLoader,
    ) => Spine38TextureAtlas;
    AtlasAttachmentLoader: new (atlas: Spine38TextureAtlas) => object;
    SkeletonJson: new (attachmentLoader: object) => Spine38SkeletonReader<unknown>;
    SkeletonBinary: new (attachmentLoader: object) => Spine38SkeletonReader<Uint8Array>;
    RegionAttachment: RuntimeClass;
    MeshAttachment: RuntimeClass;
    ClippingAttachment: RuntimeClass;
    TimelineType: { event: number; drawOrder: number; color: number };
    TwoColorTimeline: RuntimeClass;
    DeformTimeline: RuntimeClass;
    Bone: { yDown: boolean };
}

export interface Pixi4Emitter {
    emit: boolean;
    autoUpdate: boolean;
    emitterLifetime: number;
    frequency: number;
    update(dtSeconds: number): void;
    playOnce(callback?: () => void): void;
    destroy(): void;
}

/**
 * The parts of PIXI v4.8, pixi-spine 1.6 (spine-ts 3.8) and pixi-particles 4.3 the engine uses,
 * declared structurally: the engine is handed the namespace a game already loaded with
 * `<script>` tags, and their own d.ts files declare a global `PIXI` that must not leak into the
 * other projects.
 */
export interface Pixi4Namespace {
    VERSION: string;
    Container: new () => Pixi4Container;
    Sprite: new (texture?: Pixi4Texture) => Pixi4Sprite;
    Text: new (text?: string, style?: Pixi4TextStyle) => Pixi4Text;
    Texture: Pixi4TextureClass;
    BaseTexture: new (source?: unknown) => Pixi4BaseTexture;
    Rectangle: new (x?: number, y?: number, width?: number, height?: number) => Pixi4Rectangle;
    Point: { new (x?: number, y?: number): Pixi4ObservablePoint; prototype: object };
    ObservablePoint: { prototype: object };
    Polygon: new (points: number[]) => object;
    TransformBase: new () => Pixi4Transform;
    Matrix: new () => Pixi4Matrix;
    extras: { BitmapText: Pixi4BitmapTextClass };
    loader?: Pixi4Loader;
    spine: {
        Spine: { new (data: Spine38SkeletonData): Pixi4Spine; prototype: Pixi4Spine };
        core: Spine38Core;
    };
    particles?: {
        Emitter: new (
            parent: Pixi4Container,
            art: Pixi4Texture[],
            config: Record<string, unknown>,
        ) => Pixi4Emitter;
    };
}

export interface Pixi4Types extends EngineTypes {
    Spine: Pixi4Spine;
    Container: Pixi4Container;
    Text: Pixi4Text;
    BitmapText: Pixi4BitmapText;
    Texture: Pixi4Texture;
}
