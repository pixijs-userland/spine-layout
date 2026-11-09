import type {
    DescriptorBitmapText,
    LegacyAssetsPort,
    LegacyBaseTexture,
    LegacyBitmapFontChar,
    LegacyBitmapFontData,
    LegacyBitmapTextClass,
    LegacyContainer,
    LegacyEmitter,
    LegacyEventEmitter,
    LegacyFontDocument,
    LegacyListener,
    LegacyLoader,
    LegacyLoaderResource,
    LegacyMatrix,
    LegacyNamespace,
    LegacyObservablePoint,
    LegacyPointerEvent,
    LegacyRectangle,
    LegacyRenderer,
    LegacySpine,
    LegacySprite,
    LegacyText,
    LegacyTextStyle,
    LegacyTexture,
    LegacyTextureClass,
    LegacyTransform,
    LegacyTypes,
} from '../legacy';
import type {
    PixiSpineAnimation,
    PixiSpineAnimationState,
    PixiSpineAtlas,
    PixiSpineBone,
    PixiSpineBoneData,
    PixiSpineColor,
    PixiSpineConstraint,
    PixiSpineDisplayClasses,
    PixiSpineLegacyNamespace,
    PixiSpineMeshAttachment,
    PixiSpineRegionAttachment,
    PixiSpineSkeleton,
    PixiSpineSkeletonData,
    PixiSpineSkeletonReader,
    PixiSpineSlot,
    PixiSpineSlotData,
    PixiSpineTextureLoader,
    PixiSpineTextureRegion,
    PixiSpineTimeline,
    PixiSpineView,
} from '../pixiSpine';

export type Pixi4Matrix = LegacyMatrix;
export type Pixi4ObservablePoint = LegacyObservablePoint;
export type Pixi4Transform = LegacyTransform;
export type Pixi4Listener = LegacyListener;
export type Pixi4InteractionEvent = LegacyPointerEvent;
export type Pixi4Container = LegacyContainer;
export type Pixi4Sprite = LegacySprite;
export type Pixi4Rectangle = LegacyRectangle;
export type Pixi4BaseTexture = LegacyBaseTexture;
export type Pixi4Texture = LegacyTexture;
export type Pixi4TextureClass = LegacyTextureClass;
export type Pixi4TextStyle = LegacyTextStyle;
export type Pixi4Text = LegacyText;
export type Pixi4BitmapFontChar = LegacyBitmapFontChar;
export type Pixi4BitmapFontData = LegacyBitmapFontData;
export type Pixi4BitmapText = DescriptorBitmapText;
export type Pixi4FontDocument = LegacyFontDocument;
export type Pixi4BitmapTextClass = LegacyBitmapTextClass;
export type Pixi4LoaderResource = LegacyLoaderResource;
export type Pixi4Loader = LegacyLoader;
export type Pixi4EventEmitter = LegacyEventEmitter;
export type Pixi4Renderer = LegacyRenderer;
export type Pixi4Emitter = LegacyEmitter;
export type Pixi4AssetsPort = LegacyAssetsPort;

export type Spine38Color = PixiSpineColor;
export type Spine38BoneData = PixiSpineBoneData;
export type Spine38Bone = PixiSpineBone;
export type Spine38TextureRegion = PixiSpineTextureRegion;
export type Spine38RegionAttachment = PixiSpineRegionAttachment;
export type Spine38MeshAttachment = PixiSpineMeshAttachment;
export type Spine38Slot = PixiSpineSlot;
export type Spine38SlotData = PixiSpineSlotData;
export type Spine38IkConstraint = PixiSpineConstraint;
export type Spine38TransformConstraint = PixiSpineConstraint;
export type Spine38PathConstraint = PixiSpineConstraint;
export type Spine38Timeline = PixiSpineTimeline;
export type Spine38Animation = PixiSpineAnimation;
export type Spine38SkeletonData = PixiSpineSkeletonData;
export type Spine38Skeleton = PixiSpineSkeleton;
export type Spine38AnimationState = PixiSpineAnimationState;
export type Spine38TextureLoader = PixiSpineTextureLoader;
export type Spine38TextureAtlas = PixiSpineAtlas;
export type Spine38SkeletonReader<Source> = PixiSpineSkeletonReader<Source>;
export type Spine38Core = PixiSpineLegacyNamespace['core'];

/** pixi-spine 1.x's `Spine`, on its 3.7 or 3.8 runtime. */
export type Pixi4Spine = LegacySpine &
    PixiSpineView & {
        newSprite(texture: LegacyTexture): LegacySprite;
        newMesh(texture: LegacyTexture, ...rest: unknown[]): LegacyContainer;
        newGraphics(): LegacyContainer;
    };

/**
 * PIXI v4.8 as a game loads it with `<script>` tags, declared structurally: its own d.ts files
 * declare a global `PIXI` that must not leak into the other projects. pixi-spine 1.x puts
 * itself on `spine`, and pixi-particles 4.x on `particles`.
 */
export type Pixi4Namespace = LegacyNamespace &
    PixiSpineDisplayClasses & {
        spine?: PixiSpineLegacyNamespace;
    };

export type Pixi4Types = LegacyTypes<Pixi4Spine>;
