import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContainerLike, SpinePort } from '../../../src/engine/Engine';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import type { SkeletonDataLike, SkeletonLike } from '../../../src/engine/runtime';
import {
    PROPERTY_42,
    type EsotericModule,
    type EsotericRuntime,
    type EsotericSpine,
    type EsotericTypes,
} from '../../../src/engines/esoteric';
import rig42 from './fixtures/rig-4.2.json';
import rig43 from './fixtures/rig-4.3.json';

export const RIGS: Record<string, object> = { '4.2': rig42, '4.3': rig43 };

/** The rigs exported to `.skel` by the Spine editor of their version (4.2.43, 4.3.23). */
export const RIG_BINARIES: Record<string, Uint8Array> = Object.fromEntries(
    ['4.2', '4.3'].map((minor) => [
        minor,
        new Uint8Array(readFileSync(`${import.meta.dirname}/fixtures/rig-${minor}.skel`)),
    ]),
);

/** One 64×64 page in the format both runtimes parse; `quad` and `turned` are packed turned. */
export const RIG_ATLAS = `rig.png
size: 64,64
filter: Linear,Linear
square
bounds: 0,0,40,20
seq1
bounds: 0,20,10,20
seq2
bounds: 10,20,30,40
quad
bounds: 40,0,20,20
rotate: 90
turned
bounds: 40,20,20,10
rotate: 90
`;

/** A runtime under test with the Pixi it renders on. */
export interface Loaded {
    runtime: EsotericRuntime;
    port: SpinePort<EsotericTypes>;
    /** A page texture of the engine's own, `width`×`height` at resolution 1. */
    page(width: number, height: number): object;
    /** Whether a page texture the port hands back is cut from `page`. */
    samePage(a: object, b: object): boolean;
    container(): ContainerLike;
    /** Advances the shared ticker the spines are on by `ms`. */
    tick(ms: number): void;
    /** The render pass's own transform update, which v7 places slot objects in. */
    render(spine: EsotericSpine): void;
    /** What the asset cache holds the rig under. */
    aliases: { skeleton: string; atlas: string };
    /** Puts `value` in the asset cache under `alias`. */
    store(alias: string, value: unknown): void;
}

type Json = Record<string, unknown>;

const named = (list: { name: string }[], index: number) =>
    index < 0 ? '*' : (list[index]?.name ?? `#${index}`);

interface ConstraintLists {
    constraints?: { name: string }[];
    ikConstraints?: { name: string }[];
    transformConstraints?: { name: string }[];
    pathConstraints?: { name: string }[];
    physicsConstraints?: { name: string }[];
}

/** Every constraint of a skeleton's data, in the order the port's claims count them. */
export function constraintsOf(data: SkeletonDataLike): { name: string }[] {
    const lists = data as unknown as ConstraintLists;

    return (
        lists.constraints ?? [
            ...lists.ikConstraints!,
            ...lists.transformConstraints!,
            ...lists.pathConstraints!,
            ...lists.physicsConstraints!,
        ]
    );
}

function propertyNames(SP: EsotericModule): Map<number, string> {
    const table = (SP.Property as Record<string, number> | undefined) ?? PROPERTY_42;

    return new Map(
        Object.entries(table)
            .filter(([, value]) => typeof value === 'number')
            .map(([name, value]) => [value, name]),
    );
}

/**
 * An animation's claims spelled in names, so two runtimes' numbering compares: the property
 * and what it poses, by the name the export gave it.
 */
export function claimNames(
    port: SpinePort<EsotericTypes>,
    SP: EsotericModule,
    data: SkeletonDataLike,
    animation: string,
): string[] {
    const properties = propertyNames(SP);
    const constraints = constraintsOf(data);
    const claims = port.claimOf(data.findAnimation(animation)!, data);

    return claims
        .map((claim) => {
            if (claim.kind === 'event') return 'event';

            const property = properties.get(Number(claim.id.split('|')[0]));
            if (claim.kind === 'drawOrder') return `${property}`;
            if (claim.kind === 'bone') return `${property}|${data.bones[claim.index].name}`;
            if (claim.kind === 'slot') return `${property}|${data.slots[claim.index].name}`;
            return `${property}|${named(constraints, claim.index)}`;
        })
        .sort();
}

export const EXPECTED_CLAIMS: Record<string, string[]> = {
    relax: ['ikConstraint|aim'],
    loosen: ['transformConstraint|follow'],
    flip: ['sequence|seq'],
    pose: [
        'alpha|body',
        'attachment|body',
        'deform|mesh',
        'drawOrder',
        'event',
        'ikConstraint|aim',
        'physicsConstraintInertia|sway',
        'physicsConstraintReset|*',
        'rgb|body',
        'rotate|arm',
        'sequence|seq',
        'transformConstraint|follow',
        'x|hand',
        'y|hand',
    ],
};

const round = (value: number) => Math.round(value * 1000) / 1000 + 0;

const thrown = (run: () => unknown) => {
    try {
        run();
    } catch (error) {
        return error;
    }
    throw new Error('Nothing was thrown');
};

/**
 * The SpinePort semantics on one Esoteric runtime, against its real classes, over a rig that
 * has an IK, a transform and a physics constraint, a sequence, a mesh and a turned region.
 */
export function esotericPortSuite(name: string, load: () => Loaded) {
    describe(`esoteric port: ${name}`, () => {
        const spines: EsotericSpine[] = [];
        let loaded: Loaded;

        const setUp = () => {
            loaded = load();
            return loaded;
        };
        const rig = () => structuredClone(RIGS[loaded.runtime.minor]) as Json;
        const read = (skeleton: object = rig()) =>
            loaded.port.readSkeleton(skeleton, RIG_ATLAS, { 'rig.png': loaded.page(64, 64) });
        const create = (data = read()) => {
            const spine = loaded.port.create(data);
            spines.push(spine);
            return spine;
        };
        const world = (skeleton: SkeletonLike, bone: string) => {
            const pose = loaded.port.bonePose(skeleton.findBone(bone)!);
            return [round(pose.worldX), round(pose.worldY)];
        };

        afterEach(() => {
            spines.splice(0).forEach((spine) => spine.destroy());
        });

        it('names its runtime, and the skeletons and spines it made', () => {
            const { port, runtime } = setUp();
            const data = read();
            const spine = create(data);

            expect(port.runtimes).toEqual([runtime.info]);
            expect(runtime.info).toMatchObject({
                minor: runtime.minor,
                family: 'esoteric',
                packageName: `@esotericsoftware/spine-pixi-v${runtime.pixi}`,
            });
            expect(port.runtimeOf(data)).toBe(runtime.info);
            expect(port.runtimeOf(spine)).toBe(runtime.info);
            expect(port.runtimeOf(loaded.container() as EsotericSpine)).toBeUndefined();
        });

        describe('constraints', () => {
            it('reads every constraint of its own export', () => {
                setUp();
                const data = read();

                expect(constraintsOf(data).map((constraint) => constraint.name)).toEqual([
                    'aim',
                    'follow',
                    'sway',
                ]);
            });

            it('poses the arm with its IK constraint, and the follower after it', () => {
                setUp();
                const { skeleton } = create();

                loaded.port.updateWorldTransform(skeleton);

                expect(world(skeleton, 'hand')).toEqual(world(skeleton, 'target'));
                expect(world(skeleton, 'hand')).toEqual([0, -100]);
                expect(world(skeleton, 'flag')).toEqual([50, -10]);
            });

            it.each([
                ['relax', 'hand', [100, 0]],
                ['loosen', 'flag', [60, 0]],
            ])(
                'puts the constraint %s keys back by the index its claim gives',
                (animation, bone, loose) => {
                    setUp();
                    const spine = create();
                    const { skeleton } = spine;
                    const data = skeleton.data;

                    loaded.port.updateWorldTransform(skeleton);
                    const posed = world(skeleton, bone);
                    const [claim] = loaded.port.claimOf(data.findAnimation(animation)!, data);

                    spine.state.setAnimation(0, animation, false);
                    loaded.port.update(spine, 0);
                    expect(world(skeleton, bone)).toEqual(loose);

                    spine.state.clearTracks();
                    expect(claim.kind).toBe('constraint');
                    loaded.port.constraintToSetup(skeleton, (claim as { index: number }).index);
                    loaded.port.updateWorldTransform(skeleton);

                    expect(world(skeleton, bone)).toEqual(posed);
                },
            );
        });

        it.each(Object.keys(EXPECTED_CLAIMS))('claims what %s poses, by name', (animation) => {
            const { port, runtime } = setUp();
            const data = read();

            expect(claimNames(port, runtime.module, data, animation)).toEqual(
                EXPECTED_CLAIMS[animation],
            );
        });

        describe('poses', () => {
            it("converts a bone's world position back into its parent's space", () => {
                setUp();
                const { skeleton } = create();
                const pose = loaded.port.bonePose(skeleton.findBone('flag')!);

                loaded.port.updateWorldTransform(skeleton);
                const local = pose.worldToParent({ x: pose.worldX, y: pose.worldY }, skeleton);

                expect(local.x).toBeCloseTo(10, 4);
                expect(local.y).toBeCloseTo(0, 4);
                expect(loaded.port.boneSetup(skeleton.findBone('flag')!)).toMatchObject({
                    x: 10,
                    y: 0,
                });
            });

            it("converts a root bone's world position back into skeleton space", () => {
                setUp();
                const { skeleton } = create();
                const pose = loaded.port.bonePose(skeleton.findBone('root')!);

                Object.assign(skeleton, { x: 100, y: -40, scaleX: 2 });
                skeleton.scaleY *= 3;
                pose.x = 12;
                pose.y = 34;
                loaded.port.updateWorldTransform(skeleton);

                expect(pose.worldX).toBeCloseTo(100 + 12 * 2);
                const local = pose.worldToParent({ x: pose.worldX, y: pose.worldY }, skeleton);
                expect(local.x).toBeCloseTo(12, 4);
                expect(local.y).toBeCloseTo(34, 4);
            });

            it('puts a moved bone back with its own setup pose', () => {
                setUp();
                const { skeleton } = create();
                const bone = skeleton.findBone('follower')!;
                const pose = loaded.port.bonePose(bone);

                pose.x = 70;
                expect(pose.x).toBe(70);
                loaded.port.boneToSetup(bone);
                expect([pose.x, pose.y]).toEqual([50, 0]);
            });

            it("puts a slot's attachment and colour back with the slots' setup pose", () => {
                setUp();
                const spine = create();
                const slot = spine.skeleton.findSlot('body')!;

                spine.state.setAnimation(0, 'pose', false);
                loaded.port.update(spine, 0);
                expect(loaded.port.slotAttachment(slot)).toBeNull();
                expect(loaded.port.slotAlpha(slot)).toBeCloseTo(128 / 255, 4);

                spine.state.clearTracks();
                loaded.port.setupPose(spine.skeleton, 'slots');
                expect(loaded.port.slotAttachment(slot)).toBeTruthy();
                expect(loaded.port.slotAlpha(slot)).toBe(1);

                loaded.port.update(spine, 0);
                loaded.port.slotToSetup(slot);
                expect(loaded.port.slotAttachment(slot)).toBeTruthy();
            });

            it('puts the draw order back with its own setup pose', () => {
                setUp();
                const spine = create();
                const order = () =>
                    loaded.port.drawOrder(spine.skeleton).map((slot) => slot.data.name);

                spine.state.setAnimation(0, 'pose', false);
                loaded.port.update(spine, 0);
                expect(order()).toEqual(['seq', 'mesh', 'body', 'turned']);

                spine.state.clearTracks();
                loaded.port.setupPose(spine.skeleton, 'drawOrder');
                expect(order()).toEqual(['body', 'seq', 'mesh', 'turned']);
            });

            it('puts bones, then everything, back with the setup pose', () => {
                setUp();
                const spine = create();
                const arm = spine.skeleton.findBone('arm')!;

                spine.state.setAnimation(0, 'pose', false);
                loaded.port.update(spine, 0);
                spine.state.clearTracks();
                loaded.port.bonePose(arm).x = 5;

                loaded.port.setupPose(spine.skeleton, 'bones');
                expect(loaded.port.bonePose(arm).x).toBe(0);

                loaded.port.setupPose(spine.skeleton, 'all');
                loaded.port.updateWorldTransform(spine.skeleton);
                expect(world(spine.skeleton, 'hand')).toEqual([0, -100]);
                expect(loaded.port.slotAttachment(spine.skeleton.findSlot('body')!)).toBeTruthy();
            });
        });

        describe('attachments', () => {
            it('outlines a region as four corners in slot-object space', () => {
                setUp();
                const { skeleton } = create();
                const slot = skeleton.findSlot('body')!;

                expect(loaded.port.hitPolygon(slot, loaded.port.slotAttachment(slot))).toEqual([
                    -20, 10, -20, -10, 20, -10, 20, 10,
                ]);
            });

            it('outlines a sequence by the frame its slot shows, and a mesh by its hull', () => {
                setUp();
                const spine = create();
                const seq = spine.skeleton.findSlot('seq')!;
                const mesh = spine.skeleton.findSlot('mesh')!;

                expect(loaded.port.hitPolygon(seq, loaded.port.slotAttachment(seq))).toEqual([
                    -15, 20, -15, -20, 15, -20, 15, 20,
                ]);
                expect(loaded.port.hitPolygon(mesh, loaded.port.slotAttachment(mesh))).toEqual([
                    -10, 10, -10, -10, 10, -10, 10, 10,
                ]);
            });

            it('finds the image of a region, a turned region and a mesh on its page', () => {
                setUp();
                const page = loaded.page(64, 64);
                const data = loaded.port.readSkeleton(rig(), RIG_ATLAS, { 'rig.png': page });
                const { skeleton } = create(data);
                const image = (slotName: string) => {
                    const slot = skeleton.findSlot(slotName)!;
                    return loaded.port.regionTexture(loaded.port.slotAttachment(slot), slot)!;
                };

                expect(image('body')).toMatchObject({
                    x: 0,
                    y: 0,
                    width: 40,
                    height: 20,
                    rotate: 0,
                    resolution: 1,
                });
                expect(loaded.samePage(image('body').page, page)).toBe(true);
                expect(image('turned')).toMatchObject({ x: 40, y: 20, width: 20, height: 10 });
                expect(image('turned').rotate).toBe(90);
                expect(image('mesh')).toMatchObject({ x: 40, y: 0, width: 20, height: 20 });
            });

            it("cuts a sequence's first frame without its slot, the slot's frame with it", () => {
                setUp();
                const spine = create();
                const slot = spine.skeleton.findSlot('seq')!;
                const attachment = loaded.port.slotAttachment(slot);
                const frame = () => loaded.port.regionTexture(attachment, slot);

                expect(loaded.port.regionTexture(attachment)).toMatchObject({ x: 0, width: 10 });
                expect(frame()).toMatchObject({ x: 0, y: 20, width: 10, height: 20 });

                spine.state.setAnimation(0, 'flip', false);
                loaded.port.update(spine, 0);

                expect(frame()).toMatchObject({ x: 10, y: 20, width: 30, height: 40 });
                expect(loaded.port.regionTexture(attachment)).toMatchObject({ x: 0, width: 10 });
            });

            it('answers nothing for no attachment', () => {
                setUp();
                const slot = create().skeleton.findSlot('body')!;

                expect(loaded.port.hitPolygon(slot, null)).toBeUndefined();
                expect(loaded.port.regionTexture(null)).toBeNull();
                expect(loaded.port.regionTexture({}, slot)).toBeNull();
            });
        });

        describe('hooks', () => {
            it('reports update(dt) and every tick to an onUpdate hook until it is removed', () => {
                setUp();
                const spine = create();
                const seen: number[] = [];

                const remove = loaded.port.onUpdate(spine, (dt) => seen.push(round(dt)));
                loaded.port.update(spine, 0.25);
                loaded.tick(50);
                remove();
                loaded.port.update(spine, 0.5);
                loaded.tick(50);

                expect(seen).toEqual([0.25, 0.05]);
            });

            it('keeps one update per tick on the ticker, hooked or not', () => {
                setUp();
                const spine = create();
                const state = spine.state as unknown as { apply(skeleton: unknown): boolean };
                const apply = state.apply.bind(state);
                let applied = 0;
                state.apply = (skeleton) => (applied++, apply(skeleton));

                loaded.tick(16);
                const remove = loaded.port.onUpdate(spine, () => {});
                loaded.tick(16);
                remove();
                loaded.tick(16);

                expect(applied).toBe(3);
            });

            const order = (
                add: (spine: EsotericSpine, hook: () => void) => () => void,
                run: (spine: EsotericSpine) => void,
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

            it('removes onUpdate hooks in any order', () => {
                setUp();
                order(
                    (spine, hook) => loaded.port.onUpdate(spine, hook),
                    (spine) => loaded.port.update(spine, 0.1),
                );
            });

            it('removes beforeWorldTransforms hooks in any order', () => {
                setUp();
                order(
                    (spine, hook) => loaded.port.beforeWorldTransforms(spine, hook),
                    (spine) => loaded.port.update(spine, 0.1),
                );
            });

            it('poses a bone from a beforeWorldTransforms hook, before the constraints', () => {
                setUp();
                const spine = create();

                loaded.port.beforeWorldTransforms(spine, () => {
                    loaded.port.bonePose(spine.skeleton.findBone('target')!).x = 100;
                    loaded.port.bonePose(spine.skeleton.findBone('target')!).y = 0;
                });
                loaded.port.update(spine, 0);

                expect(world(spine.skeleton, 'hand')).toEqual([100, 0]);
            });
        });

        describe('export versions', () => {
            const otherMinor = () => (loaded.runtime.minor === '4.2' ? '4.3' : '4.2');

            it('refuses an export of the other minor, read or from the asset cache', () => {
                setUp();
                const other = otherMinor();
                const foreign = structuredClone(RIGS[other]);
                const version = (foreign as { skeleton: { spine: string } }).skeleton.spine;
                const alias = `foreign-${other}-${loaded.runtime.pixi}`;
                loaded.store(alias, foreign);

                const read = thrown(() =>
                    loaded.port.readSkeleton(foreign, RIG_ATLAS, {
                        'rig.png': loaded.page(64, 64),
                    }),
                );
                const cached = thrown(() =>
                    loaded.port.readSkeletonFromAssets(alias, loaded.aliases.atlas),
                );

                expect(read).toBeInstanceOf(UnsupportedSpineVersionError);
                expect(read).toMatchObject({ version, registered: [loaded.runtime.minor] });
                expect(cached).toBeInstanceOf(UnsupportedSpineVersionError);
                expect(cached).toMatchObject({ file: alias, version });
            });

            it('refuses a binary export of the other minor', () => {
                setUp();

                expect(
                    thrown(() =>
                        loaded.port.readSkeleton(RIG_BINARIES[otherMinor()], RIG_ATLAS, {
                            'rig.png': loaded.page(64, 64),
                        }),
                    ),
                ).toBeInstanceOf(UnsupportedSpineVersionError);
            });

            it('reads its binary export as it reads the JSON one', () => {
                const { port, runtime } = setUp();
                const binary = port.readSkeleton(RIG_BINARIES[runtime.minor], RIG_ATLAS, {
                    'rig.png': loaded.page(64, 64),
                });
                const summary = (data: SkeletonDataLike) => ({
                    bones: data.bones.map((bone) => bone.name),
                    slots: data.slots.map((slot) => slot.name),
                    constraints: constraintsOf(data).map((constraint) => constraint.name),
                    claims: Object.keys(EXPECTED_CLAIMS).map((animation) =>
                        claimNames(port, runtime.module, data, animation),
                    ),
                });

                expect(port.runtimeOf(binary)).toBe(runtime.info);
                expect(summary(binary)).toEqual(summary(read()));

                const { skeleton } = create(binary);
                port.updateWorldTransform(skeleton);
                expect(world(skeleton, 'hand')).toEqual([0, -100]);
                expect(world(skeleton, 'flag')).toEqual([50, -10]);
            });
        });

        describe('slot objects', () => {
            it('hangs an object off a slot, and takes it off by slot or by itself', () => {
                setUp();
                const spine = create();
                const child = loaded.container();

                loaded.port.attachSlotObject(spine, 'seq', child);
                expect(loaded.port.getSlotObject(spine, 'seq')).toBe(child);
                expect(child.parent).toBe(spine);

                loaded.port.detachSlotObject(spine, 'seq');
                expect(loaded.port.getSlotObject(spine, 'seq')).toBeUndefined();

                loaded.port.attachSlotObject(spine, 'seq', child);
                loaded.port.detachSlotObject(spine, child);
                expect(loaded.port.getSlotObject(spine, 'seq')).toBeUndefined();
                expect(child.parent).toBeNull();
            });

            it('moves a slot object with its bone on update(0), hooked or not', () => {
                setUp();
                const spine = create();
                const child = loaded.container();

                const remove = loaded.port.onUpdate(spine, () => {});
                loaded.port.attachSlotObject(spine, 'mesh', child);
                remove();

                loaded.port.beforeWorldTransforms(spine, () => {
                    loaded.port.bonePose(spine.skeleton.findBone('follower')!).x = 33;
                });
                loaded.port.update(spine, 0);

                const origin = spine.toLocal(child.toGlobal({ x: 0, y: 0 }));
                expect(origin.x).toBeCloseTo(33);
            });

            it('stacks slot objects in draw order by the time the spine is drawn', () => {
                setUp();
                const spine = create();
                const body = loaded.container();
                const seq = loaded.container();

                loaded.port.attachSlotObject(spine, 'seq', seq);
                loaded.port.attachSlotObject(spine, 'body', body);
                spine.state.setAnimation(0, 'pose', false);
                loaded.port.update(spine, 0);
                loaded.port.syncSlotObjectsWithDrawOrder(spine);
                loaded.render(spine);

                const index = (child: ContainerLike) => spine.children.indexOf(child);
                expect(index(seq)).toBeLessThan(index(body));
            });
        });

        describe('assets', () => {
            it('reads a skeleton the asset cache holds, once per pair of aliases', () => {
                setUp();
                const { skeleton, atlas } = loaded.aliases;
                const data = loaded.port.readSkeletonFromAssets(skeleton, atlas);

                expect(data.bones.map((bone) => bone.name)).toContain('hand');
                expect(loaded.port.runtimeOf(data)).toBe(loaded.runtime.info);
                expect(loaded.port.readSkeletonFromAssets(skeleton, atlas)).toBe(data);
            });

            it('reads a skeleton without an atlas against an empty one', () => {
                setUp();
                const bare = rig();
                delete bare.skins;
                delete bare.animations;

                const data = loaded.port.readSkeleton(bare, '', {});
                expect(data.slots.map((slot) => slot.name)).toEqual([
                    'body',
                    'seq',
                    'mesh',
                    'turned',
                ]);
            });

            it('refuses what another runtime’s loader made of a skeleton', () => {
                setUp();
                loaded.store('parsed.json', {
                    spineData: { bones: [] },
                    spineAtlas: { pages: [], regions: [] },
                });

                expect(() =>
                    loaded.port.readSkeletonFromAssets('parsed.json', loaded.aliases.atlas),
                ).toThrow('"parsed.json" is not a skeleton export (another loader parsed it)');
                expect(() => loaded.port.readSkeletonFromAssets('parsed.json')).toThrow(
                    /not a skeleton export/,
                );
            });

            it('names what the asset cache is missing', () => {
                setUp();
                const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

                expect(() => loaded.port.readSkeletonFromAssets('nothing', 'none')).toThrow(
                    'No skeleton loaded as "nothing"',
                );
                expect(() =>
                    loaded.port.readSkeletonFromAssets(loaded.aliases.skeleton, 'none'),
                ).toThrow('No atlas loaded as "none"');
                warn.mockRestore();
            });
        });
    });
}
