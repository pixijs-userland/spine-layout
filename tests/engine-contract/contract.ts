import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContainerLike, Engine, EngineName, EngineTypes, SpineLike } from '../../src/engine/Engine';
import type { SkeletonDataLike } from '../../src/engine/runtime';

/**
 * What each engine reads the contract fixtures from — the same skeleton, exported for the
 * Spine version the engine's runtime speaks, and an atlas in that runtime's format whose one
 * page, `contract.png`, the suite fills with the engine's white texture.
 */
export const CONTRACT_FIXTURES: Record<EngineName, { skeleton: string; atlas: string }> = {
    pixi8: { skeleton: 'contract-4.3.json', atlas: 'contract-4.3.atlas' },
    pixi4: { skeleton: 'contract-3.8.json', atlas: 'contract-3.8.atlas' },
};

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/**
 * The port semantics every engine owes the layout core, checked against the real runtime.
 * Written against `Engine` alone: run it once per engine with that engine's loader.
 */
export function engineContract(name: string, load: () => Promise<Engine>) {
    describe(`engine contract: ${name}`, () => {
        let engine: Engine<EngineTypes>;
        let skeleton: { skins?: { name: string }[] };
        let atlasText: string;
        const spines: SpineLike[] = [];

        const pages = () => ({ 'contract.png': engine.display.whiteTexture });
        const read = (): SkeletonDataLike => engine.spine.readSkeleton(skeleton, atlasText, pages());
        const create = () => {
            const spine = engine.spine.create(read());
            spines.push(spine);
            return spine;
        };

        const setUp = async () => {
            engine = await load();
            const files = CONTRACT_FIXTURES[engine.name];
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

        it('classifies what each timeline poses', async () => {
            await setUp();
            const data = read();
            const claims = engine.spine.claimOf(data.findAnimation('move')!);
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
                const order = () => engine.spine.drawOrder(spine.skeleton).map((slot) => slot.data.name);

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
                const local = pose.worldToParent({ x: pose.worldX, y: pose.worldY });
                const setup = engine.spine.boneSetup(bone);

                expect(local.x).toBeCloseTo(setup.x, 4);
                expect(local.y).toBeCloseTo(setup.y, 4);
                expect([setup.x, setup.y]).toEqual([10, 20]);
            });
        });

        describe('attachments', () => {
            it("outlines a region as four corners", async () => {
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
                const region = engine.spine.regionTexture(engine.spine.slotAttachment(slot));

                expect(region).toMatchObject({ x: 0, y: 0, width: 40, height: 20, rotate: 0 });
            });

            it('answers nothing for no attachment', async () => {
                await setUp();
                const spine = create();
                const slot = spine.skeleton.findSlot('slot_a')!;

                expect(engine.spine.hitPolygon(slot, null)).toBeUndefined();
                expect(engine.spine.regionTexture(null)).toBeNull();
            });
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

                engine.text.applyEntry(text, { type: 'bitmapText', fontFamily: family, fontSize: 32 });
                text.text = 'AA';

                const ink = engine.text.measureBitmap(text);

                expect(engine.text.isBitmapText(text as ContainerLike)).toBe(true);
                expect(ink?.height).toBeGreaterThan(0);
                expect(Number.isFinite(ink!.centre.x)).toBe(true);
                expect(Number.isFinite(ink!.centre.y)).toBe(true);
                expect(engine.text.bitmapLineCount(text)).toBe(1);
            });
        });
    });
}
