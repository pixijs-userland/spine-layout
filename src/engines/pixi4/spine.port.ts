import type { BonePose, PointLike, PoseClaimEntry, SpinePort } from '../../engine/Engine';
import { isBinarySkeleton, type SkeletonSource } from '../../engine/runtime';
import { createHookSet } from '../shared/hookSet';
import type { AssetsRegistry } from './assets.port';
import { degreesOf } from './groupD8';
import type {
    Pixi4BaseTexture,
    Pixi4Namespace,
    Pixi4Spine,
    Pixi4Texture,
    Pixi4Types,
    Spine38Animation,
    Spine38Bone,
    Spine38MeshAttachment,
    Spine38RegionAttachment,
    Spine38Skeleton,
    Spine38SkeletonData,
    Spine38Slot,
    Spine38TextureAtlas,
    Spine38Timeline,
} from './pixi4.types';
import type { SlotObjects } from './slotObjects';
import { onSpineUpdate } from './updateHooks';

const beforeWorldTransforms = createHookSet<Pixi4Spine['state'], []>((state, run) => {
    const previous = state.apply;

    state.apply = (skeleton) => {
        const applied = previous.call(state, skeleton);
        run();
        return applied;
    };

    return () => {
        state.apply = previous;
    };
});

const skeletonOf = (skeleton: unknown) => skeleton as Spine38Skeleton;
const boneOf = (bone: unknown) => bone as Spine38Bone;
const slotOf = (slot: unknown) => slot as Spine38Slot;

export function createSpinePort(
    PIXI: Pixi4Namespace,
    assets: AssetsRegistry,
    slotObjects: SlotObjects,
): SpinePort<Pixi4Types> {
    const { core } = PIXI.spine;
    const owners = new WeakMap<Spine38Animation, Spine38SkeletonData>();
    const poses = new WeakMap<Spine38Bone, BonePose>();
    const pages = new WeakMap<Pixi4BaseTexture, Pixi4Texture>();

    function remember(data: Spine38SkeletonData) {
        data.animations.forEach((animation) => owners.set(animation, data));
        return data;
    }

    function read(source: SkeletonSource, atlas: Spine38TextureAtlas): Spine38SkeletonData {
        const loader = new core.AtlasAttachmentLoader(atlas);

        if (!isBinarySkeleton(source))
            return remember(new core.SkeletonJson(loader).readSkeletonData(source));

        const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
        return remember(new core.SkeletonBinary(loader).readSkeletonData(bytes));
    }

    function atlasOf(atlasText: string, texture: (page: string) => Pixi4Texture | undefined) {
        return new core.TextureAtlas(atlasText, (page, load) => {
            const found = texture(page);
            if (!found) throw new Error(`Missing texture for page: ${page}`);
            load(found.baseTexture);
        });
    }

    // pixi-spine flips y inside `updateWorldTransformWith`, so `skeleton.scaleY` stays positive
    function skeletonToRoot<P extends PointLike>(skeleton: Spine38Skeleton, point: P): P {
        const { x, y, scaleX, scaleY } = skeleton;
        const sy = core.Bone.yDown ? -scaleY : scaleY;

        point.x = scaleX ? (point.x - x) / scaleX : 0;
        point.y = sy ? (point.y - y) / sy : 0;
        return point;
    }

    /**
     * `RegionAttachment.updateOffset`, reading `spineOffsetY` where it reads the deprecated
     * `offsetY`, which warns on every read.
     */
    function regionCorners(attachment: Spine38RegionAttachment): number[] | undefined {
        const { region, width, height, scaleX, scaleY, x, y, rotation } = attachment;
        if (!region) return undefined;

        const regionScaleX = (width / region.originalWidth) * scaleX;
        const regionScaleY = (height / region.originalHeight) * scaleY;
        const left = (-width / 2) * scaleX + region.offsetX * regionScaleX;
        const bottom = (-height / 2) * scaleY + region.spineOffsetY * regionScaleY;
        const right = left + region.width * regionScaleX;
        const top = bottom + region.height * regionScaleY;
        const radians = (rotation * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const corner = (cx: number, cy: number) => [
            cx * cos - cy * sin + x,
            cy * cos + cx * sin + y,
        ];

        return [
            ...corner(left, bottom),
            ...corner(left, top),
            ...corner(right, top),
            ...corner(right, bottom),
        ];
    }

    function claim(
        timeline: Spine38Timeline,
        data: Spine38SkeletonData | undefined,
    ): PoseClaimEntry[] {
        const id = `${timeline.getPropertyId()}`;
        const ik = data?.ikConstraints.length ?? 0;
        const transform = data?.transformConstraints.length ?? 0;

        if (timeline.boneIndex !== undefined)
            return [{ kind: 'bone', index: timeline.boneIndex, id }];
        if (timeline.slotIndex !== undefined) {
            const index = timeline.slotIndex;

            // 4.3 keys color and two-color alike, so they compete as they do on pixi8
            if (timeline instanceof core.TwoColorTimeline) {
                const color = `${(core.TimelineType.color << 24) + index}`;
                return [
                    { kind: 'slot', index, id },
                    { kind: 'slot', index, id: color },
                ];
            }
            // 3.8 sums slot and attachment into one number, which lets different pairs collide
            if (timeline instanceof core.DeformTimeline) {
                return [{ kind: 'slot', index, id: `deform|${index}|${timeline.attachment?.id}` }];
            }

            return [{ kind: 'slot', index, id }];
        }
        if (timeline.ikConstraintIndex !== undefined) {
            return [{ kind: 'constraint', index: timeline.ikConstraintIndex, id }];
        }
        if (timeline.transformConstraintIndex !== undefined) {
            return [{ kind: 'constraint', index: ik + timeline.transformConstraintIndex, id }];
        }
        if (timeline.pathConstraintIndex !== undefined) {
            return [
                { kind: 'constraint', index: ik + transform + timeline.pathConstraintIndex, id },
            ];
        }
        if (timeline.getPropertyId() === core.TimelineType.drawOrder << 24)
            return [{ kind: 'drawOrder', id }];

        return [{ kind: 'event' }];
    }

    return {
        readSkeleton: (source, atlasText, textures) =>
            read(
                source,
                atlasOf(atlasText, (page) => textures[page]),
            ),

        readSkeletonFromAssets(skeletonAlias, atlasAlias) {
            const ready = assets.resource(skeletonAlias)?.spineData;
            if (ready) return remember(ready);

            const source = assets.get<SkeletonSource>(skeletonAlias);
            if (!source) throw new Error(`No skeleton loaded as "${skeletonAlias}"`);

            const atlasText = atlasAlias ? assets.get<string>(atlasAlias) : '';
            if (atlasText === undefined) throw new Error(`No atlas loaded as "${atlasAlias}"`);

            return read(
                source,
                atlasOf(atlasText, (page) => assets.pageTexture(page, atlasAlias)),
            );
        },

        create: (data) => new PIXI.spine.Spine(remember(data as Spine38SkeletonData)),
        update: (spine, dt) => spine.update(dt),

        onUpdate: onSpineUpdate,

        bonePose(target) {
            const bone = boneOf(target);
            let pose = poses.get(bone);

            if (!pose) {
                pose = {
                    get x() {
                        return bone.x;
                    },
                    set x(value) {
                        bone.x = value;
                    },
                    get y() {
                        return bone.y;
                    },
                    set y(value) {
                        bone.y = value;
                    },
                    get worldX() {
                        return bone.worldX;
                    },
                    get worldY() {
                        return bone.worldY;
                    },
                    worldToParent: (point, skeleton) =>
                        bone.parent
                            ? bone.parent.worldToLocal(point)
                            : skeletonToRoot(skeletonOf(skeleton), point),
                };
                poses.set(bone, pose);
            }

            return pose;
        },
        boneSetup: (bone) => boneOf(bone).data,
        slotAttachment: (slot) => slotOf(slot).attachment,
        slotAlpha: (slot) => slotOf(slot).color.a,

        setupPose(target, scope) {
            const skeleton = skeletonOf(target);

            if (scope === 'all') skeleton.setToSetupPose();
            else if (scope === 'bones') skeleton.setBonesToSetupPose();
            else if (scope === 'slots') skeleton.setSlotsToSetupPose();
            else skeleton.slots.forEach((slot, index) => (skeleton.drawOrder[index] = slot));
        },
        boneToSetup: (bone) => boneOf(bone).setToSetupPose(),
        slotToSetup: (slot) => slotOf(slot).setToSetupPose(),

        constraintToSetup(target, index) {
            const { ikConstraints, transformConstraints, pathConstraints } = skeletonOf(target);

            if (index < ikConstraints.length) {
                const constraint = ikConstraints[index];
                const { mix, softness, bendDirection, compress, stretch } = constraint.data;
                Object.assign(constraint, { mix, softness, bendDirection, compress, stretch });
                return;
            }

            const transform = transformConstraints[index - ikConstraints.length];
            if (transform) {
                const { rotateMix, translateMix, scaleMix, shearMix } = transform.data;
                Object.assign(transform, { rotateMix, translateMix, scaleMix, shearMix });
                return;
            }

            const path =
                pathConstraints[index - ikConstraints.length - transformConstraints.length];
            if (path) {
                const { position, spacing, rotateMix, translateMix } = path.data;
                Object.assign(path, { position, spacing, rotateMix, translateMix });
            }
        },
        updateWorldTransform: (skeleton) => skeletonOf(skeleton).updateWorldTransform(),
        drawOrder: (skeleton) => skeletonOf(skeleton).drawOrder,

        claimOf(target) {
            const animation = target as Spine38Animation;
            const data = owners.get(animation);

            return animation.timelines.flatMap((timeline) => claim(timeline, data));
        },

        beforeWorldTransforms: (spine, hook) => beforeWorldTransforms(spine.state, hook),

        hitPolygon(_slot, attachment) {
            let vertices: ArrayLike<number> | undefined;

            if (attachment instanceof core.RegionAttachment) {
                vertices = regionCorners(attachment as Spine38RegionAttachment);
            } else if (attachment instanceof core.MeshAttachment) {
                const mesh = attachment as Spine38MeshAttachment;
                if (!mesh.bones) vertices = Array.from(mesh.vertices).slice(0, mesh.hullLength);
            }
            if (!vertices?.length) return undefined;

            const points: number[] = [];
            for (let i = 0; i < vertices.length; i += 2) points.push(vertices[i], -vertices[i + 1]);

            return points;
        },

        regionTexture(attachment) {
            if (
                !(
                    attachment instanceof core.RegionAttachment ||
                    attachment instanceof core.MeshAttachment
                )
            ) {
                return null;
            }

            const texture = (attachment as Spine38RegionAttachment | Spine38MeshAttachment).region
                ?.texture;
            if (!texture) return null;

            const { baseTexture, frame } = texture;
            const { resolution } = baseTexture;
            const rotate = degreesOf(texture.rotate);
            const turned = rotate % 180 !== 0;

            let page = pages.get(baseTexture);
            if (!page) {
                page = new PIXI.Texture(baseTexture);
                pages.set(baseTexture, page);
            }

            return {
                page,
                x: frame.x * resolution,
                y: frame.y * resolution,
                width: (turned ? frame.height : frame.width) * resolution,
                height: (turned ? frame.width : frame.height) * resolution,
                rotate,
                resolution,
            };
        },

        attachSlotObject: (spine, slotName, child) => slotObjects.attach(spine, slotName, child),
        getSlotObject: (spine, slotName) => slotObjects.get(spine, slotName),
        detachSlotObject: (spine, slotOrChild) => slotObjects.detach(spine, slotOrChild),
        syncSlotObjectsWithDrawOrder: () => {},
    };
}
