import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContainerLike, Engine, EngineTypes, SpineLike } from '../../src/engine/Engine';
import type { SkeletonDataLike } from '../../src/engine/runtime';

/**
 * What a runtime reads the contract fixtures from, by the export minor it reads — the same
 * skeleton, exported for that Spine version, and an atlas in that runtime's format whose one
 * page, `contract.png`, the suite fills with the engine's white texture.
 */
export const CONTRACT_FIXTURES: Record<string, { skeleton: string; atlas: string }> = {
    '4.3': { skeleton: 'contract-4.3.json', atlas: 'contract-4.3.atlas' },
    '3.8': { skeleton: 'contract-3.8.json', atlas: 'contract-3.8.atlas' },
};

/** The fixtures' page with its `square` region packed turned, in a format both runtimes read. */
const TURNED_ATLAS = `contract.png
size: 64,32
format: RGBA8888
filter: Linear,Linear
repeat: none
square
  rotate: true
  xy: 2, 4
  size: 20, 10
  orig: 20, 10
  offset: 0, 0
  index: -1
`;

type Uvs = {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
};
type InspectedTexture = {
    width: number;
    height: number;
    uvs?: Uvs;
    _uvs?: Uvs;
    updateUvs?(): void;
    _updateUvs?(): void;
};

/** A texture's corners, top-left clockwise, in its page's pixels; v8 names its UVs `uvs`, v4 `_uvs`. */
function cornersOf(texture: unknown, page: unknown): number[] {
    const inspected = texture as InspectedTexture;
    const { width, height } = page as InspectedTexture;
    inspected.updateUvs?.();
    inspected._updateUvs?.();
    const uvs = (inspected.uvs ?? inspected._uvs)!;

    return [
        uvs.x0 * width,
        uvs.y0 * height,
        uvs.x1 * width,
        uvs.y1 * height,
        uvs.x2 * width,
        uvs.y2 * height,
        uvs.x3 * width,
        uvs.y3 * height,
    ];
}

/**
 * Where the runtime samples a region attachment, as {@link cornersOf} reads a texture.
 * pixi-spine draws a region as a sprite of its own region texture; spine-pixi-v8 draws the
 * attachment's UVs, which run bottom-left, top-left, top-right, bottom-right and in 4.3 live on
 * its sequence.
 */
function attachmentCornersOf(attachment: unknown, page: unknown): number[] {
    const region = attachment as {
        region?: { texture?: { _uvs?: Uvs } };
        sequence?: { uvs?: ArrayLike<number>[] };
    };
    if (region.region?.texture?._uvs) return cornersOf(region.region.texture, page);

    const uvs = region.sequence!.uvs![0];
    const vertex = (i: number) => [uvs[i * 2] * 64, uvs[i * 2 + 1] * 32];

    return [1, 2, 3, 0].flatMap(vertex);
}

const fixture = (name: string) =>
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/**
 * The port semantics every engine owes the layout core, checked against the real runtime.
 * Written against `Engine` alone: run it once per engine with that engine's loader, and once
 * per runtime `minor` for an engine with more than one (by default, its first).
 */
export function engineContract(name: string, load: () => Promise<Engine>, minor?: string) {
    describe(`engine contract: ${name}`, () => {
        let engine: Engine<EngineTypes>;
        let skeleton: { skins?: { name: string }[] };
        let atlasText: string;
        const spines: SpineLike[] = [];

        const pages = () => ({ 'contract.png': engine.display.whiteTexture });
        const read = (): SkeletonDataLike =>
            engine.spine.readSkeleton(skeleton, atlasText, pages());
        const create = () => {
            const spine = engine.spine.create(read());
            spines.push(spine);
            return spine;
        };

        const setUp = async () => {
            engine = await load();
            const files = CONTRACT_FIXTURES[minor ?? engine.spine.runtimes[0].minor];
            skeleton = JSON.parse(fixture(files.skeleton));
            atlasText = fixture(files.atlas);
        };

        afterEach(() => {
            spines.splice(0).forEach((spine) => spine.destroy());
        });

        describe('reading a skeleton', () => {
            it('reads one that attaches no image against an empty atlas', async () => {
                await setUp();
                const bare = { ...skeleton };
                delete bare.skins;

                const data = engine.spine.readSkeleton(bare, '', {});

                expect(data.bones.map((bone) => bone.name)).toEqual(['root', 'bone_a']);
                expect(data.slots.map((slot) => slot.name)).toEqual(['slot_a', 'slot_b']);
                expect(data.findAnimation('move')?.duration).toBeCloseTo(1);
                expect(data.events.map((event) => event.name)).toEqual(['hit']);
            });

            it('reads one against a one-page atlas, its region attached', async () => {
                await setUp();
                const data = read();
                const spine = create();
                const slot = spine.skeleton.findSlot('slot_a')!;

                expect(data.defaultSkin?.name).toBe('default');
                expect(engine.spine.slotAttachment(slot)).toBeTruthy();
            });
        });

        it('names the runtime that read a skeleton and built its spine', async () => {
            await setUp();
            const data = read();
            const spine = create();
            const runtime = engine.spine.runtimeOf(data);

            expect(engine.spine.runtimes).toContain(runtime);
            expect(runtime?.minor).toBe(minor ?? engine.spine.runtimes[0].minor);
            expect(runtime).toMatchObject({
                family: expect.any(String),
                packageName: expect.any(String),
                packageVersion: expect.any(String),
            });
            expect(engine.spine.runtimeOf(spine)).toBe(runtime);
            expect(engine.spine.runtimeOf(engine.display.container() as never)).toBeUndefined();
        });

        it('classifies what each timeline poses', async () => {
            await setUp();
            const data = read();
            const claims = engine.spine.claimOf(data.findAnimation('move')!, data);
            const kinds = new Set(claims.map((claim) => claim.kind));

            expect(kinds).toEqual(new Set(['bone', 'slot', 'drawOrder', 'event']));
            claims.forEach((claim) => {
                if (claim.kind === 'bone') expect(claim.index).toBe(data.findBone('bone_a')!.index);
                if (claim.kind === 'slot') expect(claim.index).toBe(data.findSlot('slot_b')!.index);
                if (claim.kind !== 'event') expect(typeof claim.id).toBe('string');
            });
        });

        describe('poses', () => {
            it("puts a slot's attachment back with the slots' setup pose", async () => {
                await setUp();
                const spine = create();
                const slot = spine.skeleton.findSlot('slot_b')!;

                spine.state.setAnimation(0, 'move', false);
                engine.spine.update(spine, 0.75);
                expect(engine.spine.slotAttachment(slot)).toBeFalsy();

                engine.spine.setupPose(spine.skeleton, 'slots');
                expect(engine.spine.slotAttachment(slot)).toBeTruthy();
            });

            it('puts the draw order back with its own setup pose', async () => {
                await setUp();
                const spine = create();
                const order = () =>
                    engine.spine.drawOrder(spine.skeleton).map((slot) => slot.data.name);

                spine.state.setAnimation(0, 'move', false);
                engine.spine.update(spine, 0.75);
                expect(order()).toEqual(['slot_b', 'slot_a']);

                spine.state.clearTracks();
                engine.spine.setupPose(spine.skeleton, 'drawOrder');
                expect(order()).toEqual(['slot_a', 'slot_b']);
            });

            it("converts a bone's world position back into its parent's space", async () => {
                await setUp();
                const spine = create();
                const bone = spine.skeleton.findBone('bone_a')!;

                engine.spine.updateWorldTransform(spine.skeleton);

                const pose = engine.spine.bonePose(bone);
                const local = pose.worldToParent(
                    { x: pose.worldX, y: pose.worldY },
                    spine.skeleton,
                );
                const setup = engine.spine.boneSetup(bone);

                expect(local.x).toBeCloseTo(setup.x, 4);
                expect(local.y).toBeCloseTo(setup.y, 4);
                expect([setup.x, setup.y]).toEqual([10, 20]);
            });
            it("converts a root bone's world position back into skeleton space", async () => {
                await setUp();
                const spine = create();
                const { skeleton: target } = spine;
                const root = target.findBone('root')!;
                const pose = engine.spine.bonePose(root);

                Object.assign(target, { x: 100, y: -40, scaleX: 2 });
                target.scaleY *= 3;
                pose.x = 12;
                pose.y = 34;
                engine.spine.updateWorldTransform(target);

                expect(pose.worldX).toBeCloseTo(100 + 12 * 2);
                const local = pose.worldToParent({ x: pose.worldX, y: pose.worldY }, target);

                expect(local.x).toBeCloseTo(12, 4);
                expect(local.y).toBeCloseTo(34, 4);
            });
        });

        describe('attachments', () => {
            it('outlines a region as four corners', async () => {
                await setUp();
                const spine = create();
                const slot = spine.skeleton.findSlot('slot_a')!;
                const polygon = engine.spine.hitPolygon(slot, engine.spine.slotAttachment(slot));

                expect(polygon).toHaveLength(8);
                polygon!.forEach((value) => expect(Number.isFinite(value)).toBe(true));
            });

            it('finds the image of a region on its page', async () => {
                await setUp();
                const spine = create();
                const slot = spine.skeleton.findSlot('slot_a')!;
                const attachment = engine.spine.slotAttachment(slot);
                const region = engine.spine.regionTexture(attachment);

                expect(region).toMatchObject({ x: 0, y: 0, width: 40, height: 20, rotate: 0 });
                expect(engine.spine.regionTexture(attachment, slot)).toEqual(region);
            });

            it("cuts a turned region upright, sampling the runtime's own pixels", async () => {
                await setUp();
                const data = engine.spine.readSkeleton(skeleton, TURNED_ATLAS, pages());
                const spine = engine.spine.create(data);
                spines.push(spine);
                const attachment = engine.spine.slotAttachment(spine.skeleton.findSlot('slot_a')!);
                const region = engine.spine.regionTexture(attachment)!;

                expect(region).toMatchObject({ x: 2, y: 4, width: 20, height: 10, rotate: 90 });

                const cut = engine.display.subTexture(
                    region.page,
                    { x: region.x, y: region.y, width: region.height, height: region.width },
                    region.rotate,
                );
                const sprite = engine.display.sprite(cut, 0);

                expect([sprite.width, sprite.height]).toEqual([20, 10]);
                cornersOf(cut, region.page).forEach((value, i) =>
                    expect(value).toBeCloseTo(attachmentCornersOf(attachment, region.page)[i], 4),
                );
            });

            it('answers nothing for no attachment', async () => {
                await setUp();
                const spine = create();
                const slot = spine.skeleton.findSlot('slot_a')!;

                expect(engine.spine.hitPolygon(slot, null)).toBeUndefined();
                expect(engine.spine.regionTexture(null)).toBeNull();
            });
        });

        it('reports every update to an onUpdate hook until it is removed', async () => {
            await setUp();
            const spine = create();
            const seen: number[] = [];

            const remove = engine.spine.onUpdate(spine, (dt) => seen.push(dt));
            engine.spine.update(spine, 0.25);
            remove();
            engine.spine.update(spine, 0.5);

            expect(seen).toEqual([0.25]);
        });

        describe('hooks removed in any order', () => {
            const order = (
                add: (spine: SpineLike, hook: () => void) => () => void,
                run: (spine: SpineLike) => void,
            ) => {
                const spine = create();
                const seen: string[] = [];
                const fired = () => seen.splice(0);

                const removeA = add(spine, () => seen.push('A'));
                const removeB = add(spine, () => seen.push('B'));
                run(spine);
                expect(fired()).toEqual(['A', 'B']);

                removeA();
                run(spine);
                expect(fired()).toEqual(['B']);

                removeB();
                run(spine);
                expect(fired()).toEqual([]);

                removeA();
                const removeAgain = add(spine, () => seen.push('A'));
                run(spine);
                expect(fired()).toEqual(['A']);
                removeAgain();
            };

            it('onUpdate', async () => {
                await setUp();
                order(
                    (spine, hook) => engine.spine.onUpdate(spine, hook),
                    (spine) => engine.spine.update(spine, 0.1),
                );
            });

            it('beforeWorldTransforms', async () => {
                await setUp();
                order(
                    (spine, hook) => engine.spine.beforeWorldTransforms(spine, hook),
                    (spine) => engine.spine.update(spine, 0.1),
                );
            });

            it('leaves a slot object following its bone when an update hook goes', async () => {
                await setUp();
                const spine = create();
                const child = engine.display.container({ label: 'child' });
                const bone = spine.skeleton.findBone('bone_a')!;

                const remove = engine.spine.onUpdate(spine, () => {});
                engine.spine.attachSlotObject(spine, 'slot_b', child);
                remove();

                engine.spine.beforeWorldTransforms(spine, () => {
                    engine.spine.bonePose(bone).x = 33;
                });
                engine.spine.update(spine, 0);

                const origin = spine.toLocal(child.toGlobal(engine.display.point(0, 0)));
                expect(origin.x).toBeCloseTo(33);
            });
        });

        it("takes a skeleton's own shapes out of hit-testing and puts them back", async () => {
            await setUp();
            const spine = create();
            const child = engine.display.container({ label: 'child' });

            engine.spine.attachSlotObject(spine, 'slot_b', child);
            engine.display.shieldFromHitTesting(spine);
            engine.spine.update(spine, 0);
            expect(engine.spine.getSlotObject(spine, 'slot_b')).toBe(child);

            engine.display.exposeToHitTesting(spine);
            engine.spine.update(spine, 0);
            expect(engine.spine.getSlotObject(spine, 'slot_b')).toBe(child);
        });

        it('hangs an object off a slot, and takes it off again', async () => {
            await setUp();
            const spine = create();
            const child = engine.display.container({ label: 'child' });

            engine.spine.attachSlotObject(spine, 'slot_b', child);
            expect(engine.spine.getSlotObject(spine, 'slot_b')).toBe(child);

            engine.spine.detachSlotObject(spine, 'slot_b');
            expect(engine.spine.getSlotObject(spine, 'slot_b')).toBeUndefined();
        });

        describe('texts', () => {
            it('styles a text node from a texts.json entry', async () => {
                await setUp();
                const text = engine.text.createText();

                engine.text.applyEntry(text, { type: 'text', fontSize: 20, wordWrap: false });

                expect(engine.text.isBitmapText(text as ContainerLike)).toBe(false);
                expect(engine.text.getStyle(text).fontSize).toBe(20);
            });

            it('measures a bitmap text once its font is registered', async () => {
                await setUp();
                const family = engine.text.registerBitmapFont(fixture('contract.fnt'), pages());
                const text = engine.text.createBitmapText();

                expect(family).toBe('Contract');
                expect(engine.text.hasBitmapFont(family)).toBe(true);

                engine.text.applyEntry(text, {
                    type: 'bitmapText',
                    fontFamily: family,
                    fontSize: 32,
                });
                text.text = 'AA';

                const ink = engine.text.measureBitmap(text);

                expect(engine.text.isBitmapText(text as ContainerLike)).toBe(true);
                expect(ink?.height).toBeGreaterThan(0);
                expect(Number.isFinite(ink!.centre.x)).toBe(true);
                expect(Number.isFinite(ink!.centre.y)).toBe(true);
                expect(engine.text.bitmapLineCount(text)).toBe(1);
            });

            it("spaces bitmap letters by letterSpacing in the node's pixels", async () => {
                await setUp();
                const family = engine.text.registerBitmapFont(fixture('contract.fnt'), pages());
                const centreOf = (value: string) => {
                    const text = engine.text.createBitmapText();
                    engine.text.applyEntry(text, {
                        type: 'bitmapText',
                        fontFamily: family,
                        fontSize: 16,
                        letterSpacing: 4,
                    });
                    text.text = value;
                    expect(engine.text.getStyle(text).letterSpacing).toBe(4);
                    return engine.text.measureBitmap(text)!.centre.x;
                };

                // the font is 32 units with an 18-unit advance: 9px at 16px, then the spacing
                expect(2 * (centreOf('AA') - centreOf('A'))).toBeCloseTo(9 + 4, 4);
            });
        });

        describe('particles, where the engine has them', () => {
            const config = {
                alpha: { start: 1, end: 0 },
                scale: { start: 1, end: 1 },
                color: { start: 'ffffff', end: 'ffffff' },
                speed: { start: 100, end: 50 },
                startRotation: { min: 0, max: 360 },
                rotationSpeed: { min: 0, max: 0 },
                lifetime: { min: 0.2, max: 0.5 },
                frequency: 0.01,
                emitterLifetime: -1,
                maxParticles: 50,
                pos: { x: 0, y: 0 },
                addAtBack: false,
                spawnType: 'point',
            };

            it('emits into a container while emit is on, and comes away on destroy', async (context) => {
                await setUp();
                if (!engine.particles) return context.skip();

                const parent = engine.display.container({ label: 'emitter' });
                const emitter = engine.particles.createEmitter(
                    parent,
                    [engine.display.whiteTexture],
                    config,
                );

                emitter.emit = true;
                expect(emitter.emit).toBe(true);
                expect(() => emitter.update(0.1)).not.toThrow();
                expect(parent.children.length).toBeGreaterThan(0);

                emitter.emit = false;
                expect(emitter.emit).toBe(false);
                expect(() => emitter.playOnce()).not.toThrow();
                expect(() => emitter.update(0.1)).not.toThrow();
                expect(() => emitter.destroy()).not.toThrow();
                parent.destroy();
            });

            it('bursts a looping config once on playOnce, then stops emitting', async (context) => {
                await setUp();
                if (!engine.particles) return context.skip();

                const parent = engine.display.container({ label: 'emitter' });
                const emitter = engine.particles.createEmitter(
                    parent,
                    [engine.display.whiteTexture],
                    config,
                );

                emitter.emit = false;
                emitter.playOnce();
                emitter.update(0.005);
                const spawned = parent.children.length;
                for (let i = 0; i < 5; i++) emitter.update(0.05);

                expect(spawned).toBeGreaterThan(0);
                expect(emitter.emit).toBe(false);
                expect(parent.children.length).toBeLessThanOrEqual(spawned);

                emitter.destroy();
                parent.destroy();
            });
        });
    });
}
