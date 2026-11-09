import { beforeAll, describe, expect, it } from 'vitest';
import type { RuntimePin } from '../../../src/core/versions';
import type { PoseClaimEntry } from '../../../src/engine/Engine';
import type { SkeletonSource } from '../../../src/engine/runtime';
import {
    createPixiSpinePort,
    type PixiSpinePort,
    type PixiSpineView,
} from '../../../src/engines/pixiSpine';
import {
    ATLAS,
    clippedSkeleton,
    contractSkeleton,
    rigSkeleton,
    SEQUENCE_ATLAS,
    sequenceSkeleton,
    skewedSkeleton,
    type Minor,
} from './fixtures';
import { canvasPage, updateTransforms, type Loaded, type Stack } from './stacks';

type Assets = Map<string, unknown>;

export function portOf(
    stack: Stack,
    assets: Assets = new Map(),
    warnings: string[] = [],
    pin?: RuntimePin,
) {
    return createPixiSpinePort({
        PIXI: stack.PIXI,
        runtimes: stack.runtimes,
        holderTransform: stack.holderTransform,
        assets: {
            get: <A>(alias: string) => assets.get(alias) as A | undefined,
            resource: (alias) => assets.get(`resource:${alias}`) as { spineData?: unknown },
            pageTexture: (page) => assets.get(page) as never,
        },
        warn: (message) => warnings.push(message),
        pin,
    });
}

/** Where a chain path constraint's `tip` bone lands once `skeleton` is read and posed. */
export function chainTip(port: PixiSpinePort, skeleton: SkeletonSource) {
    const spine = port.create(port.readSkeleton(skeleton, '', {}));
    spine.autoUpdate = false;
    port.update(spine, 0);

    const tip = port.bonePose(spine.skeleton.findBone('tip')!);
    return { minor: port.runtimeOf(spine)?.minor, x: tip.worldX, y: tip.worldY };
}

const claimLabel = (claim: PoseClaimEntry) =>
    'index' in claim ? `${claim.kind}:${claim.index}` : claim.kind;

/** Numeric and boolean fields a constraint shares with its data: its pose against its setup. */
function sharedFields(constraint: Loaded) {
    return Object.keys(constraint.data).filter(
        (key) =>
            key in constraint &&
            ['number', 'boolean'].includes(typeof constraint[key]) &&
            typeof constraint[key] === typeof constraint.data[key],
    );
}

/** The SpinePort checked against one runtime of a real pixi-spine stack. */
export function pixiSpinePortSuite(load: () => Stack, minor: Minor) {
    describe(`Spine ${minor}`, () => {
        let stack: Stack;
        let PIXI: Loaded;
        let port: PixiSpinePort;
        let page: Loaded;

        const textures = () => ({ 'contract.png': page });
        const read = (skeleton: SkeletonSource = contractSkeleton(minor), atlas = ATLAS) =>
            port.readSkeleton(skeleton, atlas, textures());
        const spineOf = (skeleton?: SkeletonSource): PixiSpineView => {
            const spine = port.create(read(skeleton));
            spine.autoUpdate = false;
            return spine;
        };
        const turnedSkeleton = () => {
            const turned = contractSkeleton(minor) as Loaded;
            const skins = Array.isArray(turned.skins)
                ? turned.skins[0].attachments
                : turned.skins.default;
            skins.slot_a.square = { path: 'turned', width: 20, height: 10 };
            return turned;
        };

        beforeAll(() => {
            stack = load();
            PIXI = stack.PIXI;
            port = portOf(stack);
            page = canvasPage(PIXI, 64, 64);
        });

        describe('reading', () => {
            it('reads with the runtime of the export minor, which builds its spine', () => {
                const data = read();
                const spine = port.create(data);
                const runtime = port.runtimeOf(data)!;

                expect(runtime).toMatchObject({ minor, packageVersion: expect.any(String) });
                expect(port.runtimes).toContain(runtime);
                expect(port.runtimeOf(spine)).toBe(runtime);
                expect(port.runtimeOf(new PIXI.Container())).toBeUndefined();
                expect(spine).toBeInstanceOf(stack.spines[minor]);
            });

            it('reads one that attaches no image against empty atlas text', () => {
                const bare = contractSkeleton(minor);
                delete bare.skins;

                const data = port.readSkeleton(bare, '', {});

                expect(data.bones.map((bone) => bone.name)).toEqual(['root', 'bone_a']);
                expect(data.slots.map((slot) => slot.name)).toEqual(['slot_a', 'slot_b']);
                expect(data.findAnimation('move')?.duration).toBeCloseTo(1);
                expect(data.events.map((event) => event.name)).toEqual(['hit']);
            });

            it('names the page it has no texture for', () => {
                expect(() => port.readSkeleton(contractSkeleton(minor), ATLAS, {})).toThrow(
                    'Missing texture for page: contract.png',
                );
            });

            it("takes a game loader's skeleton, or reads one from the cache with its atlas", () => {
                const assets: Assets = new Map();
                const cached = portOf(stack, assets);
                const loaded = read();

                assets.set('resource:hero.json', { spineData: loaded });
                expect(cached.readSkeletonFromAssets('hero.json')).toBe(loaded);

                assets.set('raw.json', contractSkeleton(minor));
                assets.set('raw.atlas', ATLAS);
                assets.set('contract.png', page);
                const data = cached.readSkeletonFromAssets('raw.json', 'raw.atlas');
                expect(cached.runtimeOf(data)?.minor).toBe(minor);
                expect(data.findSkin('default')).toBeTruthy();

                expect(() => cached.readSkeletonFromAssets('missing.json')).toThrow('missing');
            });
        });

        describe('poses', () => {
            it('plays, and resets each scope; slots take the draw order with them', () => {
                const spine = spineOf();
                const { skeleton } = spine;
                const [slotA, slotB] = skeleton.slots;

                spine.state.setAnimation(0, 'move', false);
                port.update(spine, 0.75);

                expect(port.drawOrder(skeleton).map((slot) => slot.data.name)).toEqual([
                    'slot_b',
                    'slot_a',
                ]);
                expect(port.slotAttachment(slotB)).toBeNull();
                expect(port.bonePose(skeleton.bones[1]).x).toBeCloseTo(10 + 22.5);

                port.setupPose(skeleton, 'drawOrder');
                expect(port.drawOrder(skeleton)).toEqual([slotA, slotB]);
                expect(port.slotAttachment(slotB)).toBeNull();

                skeleton.drawOrder.reverse();
                port.setupPose(skeleton, 'slots');
                expect(port.drawOrder(skeleton)).toEqual([slotA, slotB]);
                expect(port.slotAttachment(slotB)).not.toBeNull();

                port.setupPose(skeleton, 'bones');
                expect(port.bonePose(skeleton.bones[1]).x).toBe(10);
                expect(port.boneSetup(skeleton.bones[1])).toMatchObject({ x: 10, y: 20 });

                port.slotToSetup(slotB);
                port.boneToSetup(skeleton.bones[1]);
                expect(port.slotAlpha(slotB)).toBe(1);
            });

            it('converts world positions back into a parent bone and into skeleton space', () => {
                const spine = spineOf();
                const { skeleton } = spine;
                const bone = skeleton.findBone('bone_a')!;
                const root = skeleton.findBone('root')!;
                port.updateWorldTransform(skeleton);

                const pose = port.bonePose(bone);
                expect([pose.worldX, pose.worldY].map((v) => +v.toFixed(4))).toEqual([10, -20]);
                const local = pose.worldToParent({ x: pose.worldX, y: pose.worldY }, skeleton);
                expect(local.x).toBeCloseTo(10, 4);
                expect(local.y).toBeCloseTo(20, 4);

                const rootPose = port.bonePose(root);
                Object.assign(skeleton, { x: 100, y: -40, scaleX: 2 });
                skeleton.scaleY *= 3;
                rootPose.x = 12;
                rootPose.y = 34;
                port.updateWorldTransform(skeleton);

                expect(rootPose.worldX).toBeCloseTo(100 + 12 * 2);
                const back = rootPose.worldToParent(
                    { x: rootPose.worldX, y: rootPose.worldY },
                    skeleton,
                );
                expect(back.x).toBeCloseTo(12, 4);
                expect(back.y).toBeCloseTo(34, 4);
            });

            it('runs a hook after the animations apply and before world transforms', () => {
                const spine = spineOf();
                const bone = spine.skeleton.findBone('bone_a')!;
                spine.state.setAnimation(0, 'move', false);

                const restore = port.beforeWorldTransforms(spine, () => {
                    port.bonePose(bone).y = 0;
                });
                port.update(spine, 0.5);
                expect(port.bonePose(bone).worldY).toBeCloseTo(0);

                restore();
                port.update(spine, 0.1);
                expect(port.bonePose(bone).worldY).toBeCloseTo(-20);
            });

            it('reports every update to its hooks, until each is removed, in any order', () => {
                const spine = spineOf();
                const seen: string[] = [];

                const removeA = port.onUpdate(spine, (dt) => seen.push(`A${dt}`));
                const removeB = port.onUpdate(spine, (dt) => seen.push(`B${dt}`));
                port.update(spine, 0.25);
                removeA();
                port.update(spine, 0.5);
                removeB();
                port.update(spine, 0.75);

                expect(seen).toEqual(['A0.25', 'B0.25', 'B0.5']);
            });
        });

        describe('claims', () => {
            it('sorts the timelines by what they pose', () => {
                const data = read();
                const claims = port.claimOf(data.findAnimation('move')!, data);

                expect(new Set(claims.map(claimLabel))).toEqual(
                    new Set(['bone:1', 'drawOrder', 'event', 'slot:1']),
                );
                claims.forEach((claim) => {
                    if (claim.kind !== 'event') expect(typeof claim.id).toBe('string');
                });
            });

            it('flattens IK, transform and path constraints, and lets two-color meet color', () => {
                const data = read(rigSkeleton(minor));
                const animation = data.findAnimation('rig')!;
                const claims = port.claimOf(animation, data);
                const tint = data.findSlot('slot_tint')!.index;
                const mesh = data.findSlot('slot_mesh')!.index;
                const idsOf = (kind: string, index: number) =>
                    claims.flatMap((claim) =>
                        claim.kind === kind && 'index' in claim && claim.index === index
                            ? [claim.id]
                            : [],
                    );

                expect([...new Set(claims.map(claimLabel))].sort()).toEqual([
                    'constraint:0',
                    'constraint:1',
                    'constraint:2',
                    `slot:${mesh}`,
                    `slot:${tint}`,
                ]);
                expect(new Set(idsOf('constraint', 2)).size).toBe(3);

                const timelines = animation.timelines as Loaded[];
                const [colour, twoColour] = timelines
                    .filter((timeline) => timeline.slotIndex === tint)
                    .map((timeline) =>
                        port
                            .claimOf({ ...animation, timelines: [timeline] }, data)
                            .map((claim) => ('id' in claim ? claim.id : '')),
                    );
                expect(twoColour).toEqual(expect.arrayContaining(colour));
                expect(twoColour.length).toBeGreaterThan(colour.length);

                expect(idsOf('slot', mesh)).toHaveLength(1);
            });

            it('puts each constraint back to its setup mixes', () => {
                const spine = spineOf(rigSkeleton(minor));
                const { skeleton } = spine as unknown as { skeleton: Loaded };
                const constraints: Loaded[] = [
                    ...skeleton.ikConstraints,
                    ...skeleton.transformConstraints,
                    ...skeleton.pathConstraints,
                ];

                spine.state.setAnimation(0, 'rig', false);
                port.update(spine, 1);

                constraints.forEach((constraint, index) => {
                    const fields = sharedFields(constraint);
                    expect(fields.length).toBeGreaterThan(0);
                    expect(fields.some((key) => constraint[key] !== constraint.data[key])).toBe(
                        true,
                    );

                    port.constraintToSetup(skeleton, index);
                    fields.forEach((key) => expect(constraint[key]).toBe(constraint.data[key]));
                });
            });
        });

        describe('attachments', () => {
            it('outlines a region as the four corners an object on its slot sees', () => {
                const spine = spineOf();
                const slot = spine.skeleton.findSlot('slot_a')!;

                expect(port.hitPolygon(slot, port.slotAttachment(slot))).toEqual([
                    -20, 10, -20, -10, 20, -10, 20, 10,
                ]);
                expect(port.hitPolygon(slot, null)).toBeUndefined();
            });

            it('outlines an unweighted mesh by its hull', () => {
                const spine = spineOf(rigSkeleton(minor));
                const slot = spine.skeleton.findSlot('slot_mesh')!;

                expect(port.hitPolygon(slot, port.slotAttachment(slot))).toEqual([
                    -10, 10, 10, 10, 10, -10, -10, -10,
                ]);
            });

            it('finds the image of a region or mesh on its page, upright or turned', () => {
                const spine = spineOf();
                const slot = spine.skeleton.findSlot('slot_a')!;
                const attachment = port.slotAttachment(slot);
                const region = port.regionTexture(attachment)!;

                expect(region).toMatchObject({
                    x: 0,
                    y: 0,
                    width: 40,
                    height: 20,
                    rotate: 0,
                    resolution: 1,
                });
                expect(region.page.baseTexture).toBe(page.baseTexture);
                expect(port.regionTexture(attachment, slot)).toEqual(region);
                expect(port.regionTexture(null)).toBeNull();

                const turnedSpine = spineOf(turnedSkeleton());
                const turnedAttachment = port.slotAttachment(
                    turnedSpine.skeleton.findSlot('slot_a')!,
                );
                expect(port.regionTexture(turnedAttachment)).toMatchObject({
                    x: 44,
                    y: 0,
                    width: 20,
                    height: 10,
                    rotate: 90,
                });

                const rig = spineOf(rigSkeleton(minor));
                const quad = port.slotAttachment(rig.skeleton.findSlot('slot_mesh')!);
                expect(port.regionTexture(quad)).toMatchObject({ x: 0, y: 0, width: 40 });
                expect(
                    port.regionTexture(port.slotAttachment(rig.skeleton.findSlot('slot_path')!)),
                ).toBeNull();
            });

            it('finds the image in page pixels on a page of a higher resolution', () => {
                const sharp = canvasPage(PIXI, 64, 64, 2);
                const data = port.readSkeleton(turnedSkeleton(), ATLAS, { 'contract.png': sharp });
                const spine = port.create(data);
                const region = port.regionTexture(
                    port.slotAttachment(spine.skeleton.findSlot('slot_a')!),
                )!;

                expect(region).toMatchObject({
                    x: 44,
                    y: 0,
                    width: 20,
                    height: 10,
                    rotate: 90,
                    resolution: 2,
                });
                expect(region.page.baseTexture).toBe(sharp.baseTexture);
            });

            if (minor === '4.1') {
                it('shows and outlines the sequence frame each spine of a skeleton is on', () => {
                    const sheet = canvasPage(PIXI, 64, 16);
                    const data = port.readSkeleton(sequenceSkeleton(), SEQUENCE_ATLAS, {
                        'sequence.png': sheet,
                    });
                    const [still, flipped] = [port.create(data), port.create(data)];
                    const slotOf = (spine: PixiSpineView) => spine.skeleton.findSlot('slot_frame')!;
                    const attachment = port.slotAttachment(slotOf(still));
                    const whole = [-5, 5, -5, -5, 5, -5, 5, 5];
                    still.autoUpdate = flipped.autoUpdate = false;

                    expect(port.hitPolygon(slotOf(still), attachment)).toEqual(whole);

                    flipped.state.setAnimation(0, 'flip', false);
                    port.update(still, 0);
                    port.update(flipped, 0.1);

                    expect(port.regionTexture(attachment, slotOf(still))).toMatchObject({
                        x: 0,
                        width: 10,
                    });
                    expect(port.regionTexture(attachment, slotOf(flipped))).toMatchObject({
                        x: 20,
                        width: 4,
                        height: 6,
                    });
                    expect(port.hitPolygon(slotOf(still), attachment)).toEqual(whole);
                    expect(port.hitPolygon(slotOf(flipped), attachment)).toEqual([
                        0, 2, 0, -4, 4, -4, 4, 2,
                    ]);

                    const strip = still.skeleton.findSlot('slot_strip')!;
                    expect(port.regionTexture(port.slotAttachment(strip), strip)).toMatchObject({
                        x: 20,
                    });
                });
            }
        });

        describe('slot objects', () => {
            it('follows the bone upright, the slot alpha, and stays put while the slot is empty', () => {
                const spine = spineOf();
                const child = new PIXI.Container();
                const stage = new PIXI.Container();
                stage.addChild(spine);

                port.attachSlotObject(spine, 'slot_b', child);
                expect(port.getSlotObject(spine, 'slot_b')).toBe(child);

                port.update(spine, 0);
                updateTransforms(PIXI, stage);
                const origin = child.toGlobal(new PIXI.Point(0, 0));
                expect(origin.x).toBeCloseTo(10);
                expect(origin.y).toBeCloseTo(-20);
                expect(child.toGlobal(new PIXI.Point(0, 5)).y).toBeCloseTo(-15);

                spine.skeleton.slots[1].color.a = 0.5;
                port.update(spine, 0);
                updateTransforms(PIXI, stage);
                expect(child.alpha).toBe(0.5);
                expect(child.worldAlpha).toBeCloseTo(0.5);

                spine.skeleton.slots[1].color.a = 1;
                spine.state.setAnimation(0, 'move', false);
                const offsets: number[] = [];
                for (let frame = 0; frame < 30; frame++) {
                    port.update(spine, 1 / 30);
                    updateTransforms(PIXI, stage);
                    const bone = spine.skeleton.slots[1].bone;
                    const at = child.toGlobal(new PIXI.Point(0, 0));
                    offsets.push(Math.abs(at.x - bone.worldX), Math.abs(at.y - bone.worldY));
                }
                expect(Math.max(...offsets)).toBeLessThan(1e-6);

                const sprite = spine.slotContainers[1].children.find(
                    (view: Loaded) => view !== child.parent,
                )!;
                expect(port.slotAttachment(spine.skeleton.slots[1])).toBeNull();
                expect(child.visible).toBe(true);
                expect(sprite.visible).toBe(false);
                expect(child.toGlobal(new PIXI.Point(0, 0)).x).toBeCloseTo(40);

                spine.skeleton.slots[1].color.a = 0;
                port.update(spine, 0);
                expect(child.visible).toBe(false);

                spine.state.clearTracks();
                port.setupPose(spine.skeleton, 'all');
                port.update(spine, 0);
                expect(sprite.visible).toBe(true);
                expect(child.visible).toBe(true);
            });

            it('shows again once a slot that faded out empties', () => {
                const spine = spineOf();
                const child = new PIXI.Container();
                const stage = new PIXI.Container();
                stage.addChild(spine);
                const slot = spine.skeleton.slots[1];

                port.attachSlotObject(spine, 'slot_b', child);
                slot.color.a = 0;
                port.update(spine, 0);

                slot.attachment = null;
                slot.color.a = 1;
                port.update(spine, 0);
                updateTransforms(PIXI, stage);

                expect(child.worldAlpha).toBe(1);
            });

            it('follows a rotated, sheared and flipped bone through a key that turns it over', () => {
                const spine = spineOf(skewedSkeleton(minor));
                const stage = new PIXI.Container();
                stage.addChild(spine);
                spine.position.set(200, 150);
                spine.scale.set(0.8, 1.3);

                const objects = ['slot_arm', 'slot_hand', 'slot_empty'].map((name) => {
                    const child = new PIXI.Container();
                    port.attachSlotObject(spine, name, child);
                    return { bone: spine.skeleton.findSlot(name)!.bone, child };
                });
                spine.state.setAnimation(0, 'twist', false);

                const offsets: number[] = [];
                for (let frame = 0; frame < 29; frame++) {
                    port.update(spine, 1 / 29);
                    updateTransforms(PIXI, stage);

                    objects.forEach(({ bone, child }) => {
                        const { a, b, c, d, tx, ty } = (bone as Loaded).matrix;
                        [
                            [0, 0],
                            [7, 0],
                            [0, 5],
                            [3, -4],
                        ].forEach(([x, y]) => {
                            const at = child.toGlobal(new PIXI.Point(x, y));
                            const want = spine.toGlobal(
                                new PIXI.Point(a * x - c * y + tx, b * x - d * y + ty),
                            );
                            offsets.push(Math.abs(at.x - want.x), Math.abs(at.y - want.y));
                        });
                        expect(child.worldVisible).toBe(true);
                    });
                }

                expect(Math.max(...offsets)).toBeLessThan(1e-6);
            });

            it('keeps a clip drawing while a slot object hangs on its clipping slot', () => {
                const spine = spineOf(clippedSkeleton(minor));
                const stage = new PIXI.Container();
                stage.addChild(spine);
                const clip = spine.skeleton.findSlot('slot_clip') as Loaded;
                const clipped = spine.skeleton.findSlot('slot_b') as Loaded;

                port.attachSlotObject(spine, 'slot_clip', new PIXI.Container());
                port.update(spine, 0);
                updateTransforms(PIXI, stage);

                expect(clip.clippingContainer.worldVisible).toBe(true);
                expect(clipped.currentSprite.worldVisible).toBe(true);
            });

            it('hangs off the slot container, so pixi-spine orders it by draw order', () => {
                const spine = spineOf();
                const child = new PIXI.Container();

                port.attachSlotObject(spine, 'slot_a', child);
                spine.state.setAnimation(0, 'move', false);
                port.update(spine, 0.75);

                expect(spine.children.indexOf(spine.slotContainers[0])).toBe(1);
                expect(child.parent?.parent).toBe(spine.slotContainers[0]);
            });

            it('detaches by slot name or by child, and moves a child to its new slot', () => {
                const spine = spineOf();
                const child = new PIXI.Container();

                port.attachSlotObject(spine, 'slot_a', child);
                port.attachSlotObject(spine, 'slot_b', child);
                expect(port.getSlotObject(spine, 'slot_a')).toBeUndefined();
                expect(port.getSlotObject(spine, 'slot_b')).toBe(child);

                port.detachSlotObject(spine, child);
                expect(child.parent).toBeNull();
                expect(port.getSlotObject(spine, 'slot_b')).toBeUndefined();

                port.attachSlotObject(spine, 'slot_a', child);
                port.detachSlotObject(spine, 'slot_a');
                expect(child.parent).toBeNull();

                expect(() => port.attachSlotObject(spine, 'nope', child)).toThrow('nope');
            });
        });

        describe('hit-testing', () => {
            const square = (size: number) => {
                const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
                sprite.anchor.set(0.5);
                sprite.width = sprite.height = size;
                stack.makeInteractive(sprite);
                return sprite;
            };

            it('lets a click through the skeleton to what is behind it, sprites made later too', () => {
                const stage = new PIXI.Container();
                const button = square(200);
                const layer = new PIXI.Container();
                const spine = spineOf();
                stack.makeInteractive(stage);
                stack.makeInteractive(layer);
                layer.addChild(spine);
                stage.addChild(button, layer);

                port.update(spine, 0);
                updateTransforms(PIXI, stage);
                expect(stack.hitTest(stage, 0, 0)).toBe(layer);

                port.shieldShapes(spine);
                expect(stack.hitTest(stage, 0, 0)).toBe(button);

                const fresh = spine.newSprite(PIXI.Texture.WHITE as never);
                expect(fresh.containsPoint?.(new PIXI.Point(0, 0))).toBe(false);

                port.exposeShapes(spine);
                expect(Object.hasOwn(spine, 'newSprite')).toBe(false);
                expect(stack.hitTest(stage, 0, 0)).toBe(layer);
            });

            it('leaves slot objects hittable on a shielded skeleton', () => {
                const stage = new PIXI.Container();
                const spine = spineOf();
                const button = square(4);
                stack.makeInteractive(stage);
                stage.addChild(spine);

                port.attachSlotObject(spine, 'slot_a', button);
                port.shieldShapes(spine);
                port.update(spine, 0);
                updateTransforms(PIXI, stage);

                expect(stack.hitTest(stage, 0, 0)).toBe(button);
            });

            it('still clips hits to a clipping attachment, inside which a slot object is hit', () => {
                const stage = new PIXI.Container();
                const behind = square(400);
                const layer = new PIXI.Container();
                const spine = spineOf(clippedSkeleton(minor));
                const button = square(10);
                const object = new PIXI.Container();
                const mask = (spine.skeleton.findSlot('slot_clip') as Loaded).currentGraphics;
                stack.makeInteractive(stage);
                stack.makeInteractive(layer);
                object.addChild(button);
                layer.addChild(spine);
                stage.addChild(behind, layer);

                port.attachSlotObject(spine, 'slot_b', object);
                port.shieldShapes(spine);
                port.update(spine, 0);
                updateTransforms(PIXI, stage);

                expect(stack.hitTest(stage, 8, -20)).toBe(button);
                expect(stack.hitTest(stage, 14, -20)).toBe(behind);
                expect(stack.hitTest(stage, 2, -12)).toBe(behind);

                const later = spine.newGraphics() as Loaded;
                expect(Object.hasOwn(later, 'containsPoint')).toBe(false);
                expect(later.hitArea?.contains(0, 0)).toBe(false);

                port.exposeShapes(spine);
                expect(Object.hasOwn(mask, 'containsPoint')).toBe(false);
                expect(mask.hitArea ?? null).toBeNull();
                expect(stack.hitTest(stage, 2, -12)).toBe(layer);
            });
        });
    });
}
