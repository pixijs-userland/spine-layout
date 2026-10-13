import type {
    ContainerLike,
    EngineTypes,
    PointLike,
    PoseClaimEntry,
    PoseScope,
    SpineLike,
    TextLike,
} from '../../engine/Engine';
import type { SkeletonDataLike, SkeletonLike, SlotLike, BoneLike } from '../../engine/runtime';

export type EsotericMinor = '4.2' | '4.3';

type AnyClass = abstract new (...args: never[]) => object;

/**
 * A `@esotericsoftware/spine-pixi-v7` or `spine-pixi-v8` module namespace, of spine-core 4.2 or
 * 4.3, as its caller imported it. Loose on purpose: the four packages type their classes apart.
 */
export interface EsotericModule {
    Spine: AnyClass;
    SkeletonData: AnyClass;
    Skeleton: AnyClass;
    Animation: AnyClass;
    TextureAtlas: AnyClass;
    TextureAtlasPage: AnyClass;
    TextureAtlasRegion: AnyClass;
    AtlasAttachmentLoader: AnyClass;
    SkeletonJson: AnyClass;
    SkeletonBinary: AnyClass;
    RegionAttachment: AnyClass;
    MeshAttachment: AnyClass;
    SpineTexture: object;
    Physics: object;
    Property?: object;
    DrawOrder?: unknown;
    SpinePipe?: AnyClass;
    SlotMesh?: AnyClass;
}

/** A `Spine` of any of the four, as the port drives it. */
export interface EsotericSpine extends SpineLike {
    autoUpdate: boolean;
    beforeUpdateWorldTransforms: (spine: EsotericSpine) => void;
    update(dt: number): void;
    addSlotObject(slot: string, container: ContainerLike): void;
    getSlotObject(slot: string | SlotLike): ContainerLike | undefined;
    removeSlotObject(
        slotOrContainer: string | SlotLike | ContainerLike,
        container?: ContainerLike,
    ): void;
    setChildIndex(child: ContainerLike, index: number): void;
    containsPoint?(point: PointLike): boolean;
}

export interface EsotericTypes extends EngineTypes {
    Spine: EsotericSpine;
    Container: ContainerLike;
    Text: TextLike;
    BitmapText: TextLike;
    Texture: object;
}

export interface AtlasPageLike {
    name: string;
    regions: AtlasRegionLike[];
    setTexture(texture: object): void;
}

export interface AtlasRegionLike {
    page: AtlasPageLike;
    texture: { texture: object };
    x: number;
    y: number;
    width: number;
    height: number;
    degrees: number;
    rotate?: boolean;
}

export interface AtlasLike {
    pages: AtlasPageLike[];
    regions: AtlasRegionLike[];
}

export interface SkeletonReader<Source> {
    scale: number;
    readSkeletonData(source: Source): SkeletonDataLike;
}

export interface SpinePipeLike {
    validateRenderable(renderable: unknown): boolean;
    addRenderable(renderable: unknown, instructionSet: unknown): void;
    updateRenderable(renderable: unknown): void;
    execute?(renderable: unknown): void;
    destroyRenderable(renderable: unknown): void;
    destroy(): void;
}

export type SpinePipeClass = (new (renderer: unknown, adaptor?: unknown) => SpinePipeLike) & {
    extension: { type: unknown; name: string };
};

/** The classes of an {@link EsotericModule} the port calls into, as it calls them. */
export interface EsotericClasses {
    Spine: new (data: SkeletonDataLike) => EsotericSpine;
    SkeletonData: AnyClass;
    TextureAtlas: new (atlasText: string) => AtlasLike;
    TextureAtlasPage: { prototype: object };
    TextureAtlasRegion: { prototype: object };
    AtlasAttachmentLoader: new (atlas: AtlasLike) => object;
    SkeletonJson: new (loader: object) => SkeletonReader<object>;
    SkeletonBinary: new (loader: object) => SkeletonReader<Uint8Array>;
    RegionAttachment: AnyClass;
    MeshAttachment: AnyClass;
    SpineTexture: { from(texture: object): object };
    Physics: { update: unknown };
    Property?: Readonly<Record<string, number>>;
    SpinePipe?: SpinePipeClass;
}

export interface LoaderParserLike {
    id?: string;
    name?: string;
}

export interface AssetsLike {
    get(alias: string): unknown;
    loader: { parsers: LoaderParserLike[] };
}

/** The pixi.js v8 the caller renders with: what a v8 runtime registers into and reads from. */
export interface PixiV8Like {
    Assets: AssetsLike;
    Cache: {
        has(key: string): boolean;
        get(key: string): unknown;
        set(key: string, value: unknown): void;
    };
    extensions: { add(extension: object): unknown };
    ExtensionType: { WebGLPipes: string; WebGPUPipes: string; CanvasPipes: string };
}

/** A pixi.js v8 renderer, as far as its render pipes go. */
export interface PipeRendererLike {
    renderPipes: Record<string, unknown>;
    /** What `init()` builds the configured pipes with; internal to pixi. */
    _addPipes?(pipes: { name: string; value: unknown }[], adaptors: unknown[]): void;
}

export interface PixiV7Like {
    Assets: AssetsLike;
}

export interface WorldPoseLike {
    readonly worldX: number;
    readonly worldY: number;
    worldToLocal<P extends PointLike>(world: P): P;
}

export interface SlotPoseLike {
    attachment: unknown;
    color: { a: number };
}

/** Where spine-core 4.2 and 4.3 part: everything the port reads or resets on a skeleton. */
export interface CoreShim {
    readonly minor: EsotericMinor;
    /** The bone's own pose, which animations and the layout write. */
    local(bone: BoneLike): PointLike;
    /** The pose the bone was drawn with, after constraints. */
    world(bone: BoneLike): WorldPoseLike;
    boneSetup(bone: BoneLike): PointLike;
    boneToSetup(bone: BoneLike): void;
    /** The pose the slot is drawn with, after constraints. */
    slotPose(slot: SlotLike): SlotPoseLike;
    slotToSetup(slot: SlotLike): void;
    setupPose(skeleton: SkeletonLike, scope: PoseScope): void;
    /** Every constraint, in the order a claim's constraint index counts them. */
    constraints(skeleton: SkeletonLike): readonly unknown[];
    constraintToSetup(skeleton: SkeletonLike, index: number): void;
    drawOrder(skeleton: SkeletonLike): SlotLike[];
    classify(propertyId: string, data: SkeletonDataLike): PoseClaimEntry;
    regionOffsets(slot: SlotLike, attachment: object): ArrayLike<number> | undefined;
    region(attachment: object, slot?: SlotLike): AtlasRegionLike | null | undefined;
    attachmentLoader(atlas: AtlasLike): object;
}

/** Where spine-pixi-v7 and v8 part: the display object, its textures, its cache and its hooks. */
export interface DisplayShim {
    readonly pixi: 7 | 8;
    readonly minor: EsotericMinor;
    create(data: SkeletonDataLike): EsotericSpine;
    update(spine: EsotericSpine, dt: number): void;
    /** Wraps what runs on `update(dt)` and on every tick alike. Returns what unwraps it. */
    installUpdateHook(spine: EsotericSpine, run: (dt: number) => void): () => void;
    spineTexture(texture: object): object;
    pageResolution(page: object): number;
    asset(alias: string): unknown;
    cached(key: string, read: () => SkeletonDataLike): SkeletonDataLike;
    shieldShapes(spine: EsotericSpine): void;
    exposeShapes(spine: EsotericSpine): void;
    detach(spine: EsotericSpine, slotOrChild: string | ContainerLike): void;
    syncSlotObjects(spine: EsotericSpine, drawOrder: SlotLike[]): void;
}
