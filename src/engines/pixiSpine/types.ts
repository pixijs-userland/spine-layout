import type { ContainerLike, EngineTypes, PointLike, SpineLike } from '../../engine/Engine';
import type {
    AnimationLike,
    AnimationStateLike,
    BoneDataLike,
    BoneLike,
    SkeletonDataLike,
    SkeletonLike,
    SkinLike,
    SlotDataLike,
    SlotLike,
} from '../../engine/runtime';

export interface PixiSpineMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

export interface PixiSpineTransform {
    localTransform: PixiSpineMatrix;
    updateLocalTransform(): void;
    setFromMatrix?(matrix: PixiSpineMatrix): void;
}

export interface PixiSpineContainer extends ContainerLike {
    parent: PixiSpineContainer | null;
    children: PixiSpineContainer[];
    name: string | null;
    transform: PixiSpineTransform;
    containsPoint?(point: PointLike): boolean;
    hitArea?: { contains(x: number, y: number): boolean } | null;
    /** Set by Pixi on whatever is some container's `mask`. */
    isMask?: boolean;
}

export interface PixiSpineBaseTexture {
    resolution: number;
}

export interface PixiSpineTexture {
    baseTexture: PixiSpineBaseTexture;
    frame: { x: number; y: number; width: number; height: number };
    /** A `groupD8` direction. */
    rotate: number;
}

export interface PixiSpineColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface PixiSpineBoneData extends BoneDataLike {
    parent: PixiSpineBoneData | null;
    x: number;
    y: number;
}

export interface PixiSpineBone extends BoneLike {
    data: PixiSpineBoneData;
    parent: PixiSpineBone | null;
    x: number;
    y: number;
    readonly worldX: number;
    readonly worldY: number;
    matrix: PixiSpineMatrix;
    active?: boolean;
    setToSetupPose(): void;
    worldToLocal<P extends PointLike>(world: P): P;
}

export interface PixiSpineTextureRegion {
    texture: PixiSpineTexture;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    offsetX: number;
    spineOffsetY: number;
}

/** 4.1 only: the regions an attachment flips through, by the slot's `sequenceIndex`. */
export interface PixiSpineSequence {
    regions: (PixiSpineTextureRegion | null | undefined)[];
    setupIndex: number;
}

export interface PixiSpineRegionAttachment {
    region: PixiSpineTextureRegion | null;
    sequence?: PixiSpineSequence | null;
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    width: number;
    height: number;
}

export interface PixiSpineMeshAttachment {
    region: PixiSpineTextureRegion | null;
    sequence?: PixiSpineSequence | null;
    vertices: ArrayLike<number>;
    hullLength: number;
    bones: number[] | null;
}

export interface PixiSpineSlot extends SlotLike {
    bone: PixiSpineBone;
    attachment: unknown;
    color: PixiSpineColor;
    sequenceIndex?: number;
    currentSprite?: PixiSpineContainer | null;
    currentMesh?: PixiSpineContainer | null;
    currentGraphics?: PixiSpineContainer | null;
    clippingContainer?: PixiSpineContainer | null;
    setToSetupPose(): void;
}

/** An IK, transform or path constraint: its animated fields and the setup values in `data`. */
export interface PixiSpineConstraint {
    data: object;
}

export interface PixiSpineTimeline {
    boneIndex?: number;
    slotIndex?: number;
    ikConstraintIndex?: number;
    transformConstraintIndex?: number;
    pathConstraintIndex?: number;
    attachment?: { id: number | string } | null;
    /** spine-ts 3.7/3.8. */
    getPropertyId?(): number;
    /** spine-ts 4.0/4.1. */
    getPropertyIds?(): string[];
}

export interface PixiSpineAnimation extends AnimationLike {
    timelines: PixiSpineTimeline[];
}

export interface PixiSpineSlotData extends SlotDataLike {
    boneData: PixiSpineBoneData;
}

export interface PixiSpineSkin extends SkinLike {
    /** By slot index, that slot's attachments by name. */
    attachments: (Record<string, unknown> | undefined)[];
}

export interface PixiSpineSkeletonData extends SkeletonDataLike {
    skins: PixiSpineSkin[];
    slots: PixiSpineSlotData[];
    animations: PixiSpineAnimation[];
    ikConstraints: unknown[];
    transformConstraints: unknown[];
    pathConstraints: unknown[];
}

export interface PixiSpineSkeleton extends SkeletonLike {
    data: PixiSpineSkeletonData;
    bones: PixiSpineBone[];
    slots: PixiSpineSlot[];
    drawOrder: PixiSpineSlot[];
    color: PixiSpineColor;
    ikConstraints: PixiSpineConstraint[];
    transformConstraints: PixiSpineConstraint[];
    pathConstraints: PixiSpineConstraint[];
    setToSetupPose(): void;
    setBonesToSetupPose(): void;
    setSlotsToSetupPose(): void;
    updateWorldTransform(): void;
}

export interface PixiSpineAnimationState extends AnimationStateLike {
    apply(skeleton: PixiSpineSkeleton): boolean;
}

export const SHAPE_FACTORIES = ['newSprite', 'newMesh', 'newGraphics'] as const;

export type ShapeFactory = (typeof SHAPE_FACTORIES)[number];

/** pixi-spine's `Spine`: one class in 1.x/2.x, a `SpineBase` subclass per runtime in 3.x/4.x. */
export interface PixiSpineView extends PixiSpineContainer, SpineLike {
    parent: PixiSpineContainer | null;
    children: PixiSpineContainer[];
    skeleton: PixiSpineSkeleton;
    state: PixiSpineAnimationState;
    spineData: PixiSpineSkeletonData;
    slotContainers: PixiSpineContainer[];
    autoUpdate: boolean;
    update(dt: number): void;
    newSprite(...args: never[]): PixiSpineContainer;
    newMesh(...args: never[]): PixiSpineContainer;
    newGraphics(...args: never[]): PixiSpineContainer;
}

export interface PixiSpineClass {
    new (data: PixiSpineSkeletonData): PixiSpineView;
    readonly prototype: PixiSpineView;
}

type RuntimeClass = abstract new (...args: never[]) => object;

export interface PixiSpineAtlas {
    pages: unknown[];
}

export type PixiSpineTextureLoader = (
    path: string,
    load: (baseTexture: PixiSpineBaseTexture | null) => void,
) => void;

export interface PixiSpineAtlasClass {
    new (atlasText: string, textureLoader: PixiSpineTextureLoader): PixiSpineAtlas;
}

export interface PixiSpineSkeletonReader<Source> {
    readSkeletonData(source: Source): PixiSpineSkeletonData;
}

/** One runtime's spine-ts classes: `PIXI.spine.core` in 1.x/2.x, a `@pixi-spine/runtime-*` in 3.x/4.x. */
export interface PixiSpineCore {
    SkeletonData: RuntimeClass;
    Skeleton: RuntimeClass;
    Bone: RuntimeClass;
    Slot: RuntimeClass;
    Skin: { prototype: object };
    SkeletonJson: new (attachmentLoader: object) => PixiSpineSkeletonReader<unknown>;
    /** Absent from every 3.7 runtime. */
    SkeletonBinary?: new (attachmentLoader: object) => PixiSpineSkeletonReader<Uint8Array>;
    AtlasAttachmentLoader: new (atlas: PixiSpineAtlas) => object;
    RegionAttachment: RuntimeClass;
    MeshAttachment: RuntimeClass;
    ClippingAttachment: RuntimeClass;
    /** A class from 4.0 on; spine-ts 3.x declares it as an interface only. */
    Timeline?: { prototype: object };
    /** 4.1 on. */
    Sequence?: unknown;
}

/** `PIXI.spine` as pixi-spine 1.x and 2.x leave it. */
export interface PixiSpineLegacyNamespace {
    Spine: PixiSpineClass;
    core: PixiSpineCore & {
        TextureAtlas: PixiSpineAtlasClass;
        Bone: { yDown: boolean };
    };
}

/** `@pixi-spine/base`: what every 3.x/4.x runtime of one release shares. */
export interface PixiSpineModularBase {
    SpineBase: RuntimeClass;
    TextureAtlas: PixiSpineAtlasClass;
    AttachmentType: { Region: number; Mesh: number; Clipping: number };
    settings: { yDown: boolean };
}

/** One `@pixi-spine/runtime-*` package. */
export interface PixiSpineModularRuntime extends PixiSpineCore {
    Spine: PixiSpineClass;
}

/** The Pixi classes the port builds with, from the Pixi the runtimes render on. */
export interface PixiSpineDisplayClasses {
    Container: new () => PixiSpineContainer;
    Matrix: new () => PixiSpineMatrix;
    Texture: new (baseTexture: PixiSpineBaseTexture) => PixiSpineTexture;
}

/**
 * The parts of pixi-spine 1.5/1.6 (Pixi 4), 2.0/2.1 (Pixi 5) and `@pixi-spine/*` 3.1/4.0 (Pixi 6/7)
 * the port uses, declared structurally: the engine is handed the namespaces its caller loaded,
 * and their own d.ts files each declare a global `PIXI`.
 */
export interface PixiSpineTypes extends EngineTypes {
    Spine: PixiSpineView;
    Container: PixiSpineContainer;
    Texture: PixiSpineTexture;
}
