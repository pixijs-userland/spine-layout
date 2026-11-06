import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkeletonSource } from '../../../src/engine/runtime';
import {
    createPixi5Engine,
    SpineLayoutCore,
    UnsupportedSpineVersionError,
    type Pixi5Engine,
    type Pixi5Types,
} from '../../../src/pixi5';
import { discoverGlobalRuntimes, pixiSpineLegacy } from '../../../src/runtimes';
import { ATLAS, clippedSkeleton, contractSkeleton, relabelled } from '../pixiSpine/fixtures';
import { canvasPage, updateTransforms, type Loaded, type Stack } from '../pixiSpine/stacks';
import {
    loadPixi5,
    PIXI_SPINE,
    PIXI_SPINE_1,
    pixiSpine1On,
    pixiSpine2On,
    type Pixi5Minor,
} from './loadPixi5';

const OTHER: Record<Pixi5Minor, Pixi5Minor> = { '3.7': '3.8', '3.8': '3.7' };

const EXPORTED: Record<Pixi5Minor, string> = { '3.7': '3.7.94', '3.8': '3.8.99' };

const SKEL_42 = new Uint8Array(
    readFileSync(new URL('../esoteric/fixtures/rig-4.2.skel', import.meta.url)),
);

const thrown = (read: () => unknown) => {
    try {
        read();
    } catch (error) {
        return error as Error;
    }
    throw new Error('read without a throw');
};

/** The engine on a page of the one pixi-spine that reads `minor`, as a Pixi 5 game loads it. */
export function describePixi5Engine(minor: Pixi5Minor) {
    const other = OTHER[minor];
    const { version } = PIXI_SPINE[minor];

    describe(`createPixi5Engine on a page of pixi-spine ${version}`, () => {
        let stack: Stack;
        let PIXI: Loaded;
        let page: Loaded;

        const textures = () => ({ 'contract.png': page });
        const read = (engine: Pixi5Engine, skeleton: SkeletonSource = contractSkeleton(minor)) =>
            engine.spine.readSkeleton(skeleton, ATLAS, textures());

        beforeAll(() => {
            stack = loadPixi5(minor);
            PIXI = stack.PIXI;
            page = canvasPage(PIXI, 64, 64);
        });

        it('builds, reads, poses and shields with no deprecation warning from Pixi 5', () => {
            const warn = vi.spyOn(console, 'warn');
            const engine = createPixi5Engine(PIXI);
            const spine = engine.spine.create(read(engine));

            engine.spine.attachSlotObject(spine, 'slot_b', engine.display.container());
            engine.display.shieldFromHitTesting(spine);
            engine.spine.update(spine, 0.1);
            engine.display.exposeToHitTesting(spine);
            engine.text.createBitmapText();

            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        });

        it("reads with the page's one pixi-spine, found on PIXI.spine, and has particles", () => {
            const engine = createPixi5Engine(PIXI);
            const data = read(engine);

            expect(engine.name).toBe('pixi5');
            expect(engine.spine.runtimes).toEqual([
                {
                    minor,
                    family: 'pixi-spine-legacy',
                    packageName: 'pixi-spine',
                    packageVersion: '2.x',
                },
            ]);
            expect(engine.spine.runtimeOf(data)).toBe(engine.spine.runtimes[0]);
            expect(engine.spine.create(data)).toBeInstanceOf(PIXI.spine.Spine);
            expect(engine.particles).toBeDefined();

            const plain = Object.create(PIXI, { particles: { value: undefined } });
            expect(createPixi5Engine(plain).particles).toBeUndefined();
        });

        it('takes the runtime it is handed where PIXI.spine has none, as in the editor', () => {
            const bare = Object.create(PIXI, { spine: { value: undefined } });
            const global = `SpineRuntime_pixiSpine_${version.replaceAll('.', '_')}`;
            const [runtime] = discoverGlobalRuntimes({ [global]: PIXI.spine });

            expect(() => createPixi5Engine(bare)).toThrow(
                'createPixi5Engine: no pixi-spine on PIXI.spine: load pixi-spine 2.0.5 (3.7) or pixi-spine 2.1.14 (3.8), or pass its runtime',
            );

            const engine = createPixi5Engine(bare, { runtime });

            expect(engine.spine.runtimes).toEqual([
                {
                    minor,
                    family: 'pixi-spine-legacy',
                    packageName: 'pixi-spine',
                    packageVersion: version,
                },
            ]);
            expect(engine.spine.create(read(engine))).toBeInstanceOf(PIXI.spine.Spine);
        });

        it('refuses a Pixi other than 5, and a runtime Pixi 5 has none of', () => {
            const runtime = pixiSpineLegacy(PIXI.spine, { packageVersion: version });
            const modular = {
                ...runtime,
                info: {
                    minor: '4.1',
                    family: 'pixi-spine-modular',
                    packageName: '@pixi-spine/runtime-4.1',
                    packageVersion: '3.1.2',
                },
            };

            expect(() =>
                createPixi5Engine(Object.create(PIXI, { VERSION: { value: '4.8.9' } })),
            ).toThrow('createPixi5Engine: PIXI 4.8.9 is not Pixi 5');
            expect(() => createPixi5Engine(PIXI, { runtime: modular })).toThrow(
                'createPixi5Engine: Pixi 5 renders Spine with pixi-spine 2.0.5 (3.7) or pixi-spine 2.1.14 (3.8), not @pixi-spine/runtime-4.1 3.1.2 (4.1)',
            );
        });

        it(`refuses Pixi 4's pixi-spine ${PIXI_SPINE_1[minor].version}, though it reads ${minor} too`, () => {
            const deprecations = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const runtime = pixiSpine1On(PIXI, minor);
            deprecations.mockRestore();

            expect(runtime.info).toMatchObject({ minor, family: 'pixi-spine-legacy' });
            expect(() => createPixi5Engine(PIXI, { runtime })).toThrow(
                `createPixi5Engine: Pixi 5 renders Spine with pixi-spine 2.0.5 (3.7) or pixi-spine 2.1.14 (3.8), not pixi-spine ${PIXI_SPINE_1[minor].version} (${minor})`,
            );
        });

        describe(`a Spine ${other} export`, () => {
            it('is refused with UnsupportedSpineVersionError, which names the Pixi that render it', () => {
                const engine = createPixi5Engine(PIXI);
                const error = thrown(() =>
                    engine.spine.readSkeleton(contractSkeleton(other), ATLAS, textures(), {
                        file: `hero-${other}.json`,
                    }),
                );

                expect(error).toBeInstanceOf(UnsupportedSpineVersionError);
                expect(error).toMatchObject({
                    file: `hero-${other}.json`,
                    version: EXPORTED[other],
                    registered: [minor],
                    pixiMajors: [4, 5, 6, 7],
                });
                expect(error.message).toBe(
                    `hero-${other}.json: Spine ${EXPORTED[other]} — registered runtimes: ${minor}; Pixi 4, 5, 6, 7 can render it`,
                );
            });

            it('is refused from the asset cache too, by its alias', () => {
                const engine = createPixi5Engine(PIXI);
                engine.assets.set('hero.json', contractSkeleton(other));
                engine.assets.set('hero.atlas', ATLAS);
                engine.assets.set('contract.png', page);

                const error = thrown(() =>
                    engine.spine.readSkeletonFromAssets('hero.json', 'hero.atlas'),
                );

                expect(error).toBeInstanceOf(UnsupportedSpineVersionError);
                expect(error).toMatchObject({ file: 'hero.json', registered: [minor] });
            });

            describe('where the project pins it to the page’s runtime', () => {
                let warnings: string[];
                let engine: Pixi5Engine;

                const warning = (file: string) =>
                    `${file}: Spine ${EXPORTED[other]} cross-read by the ${minor} runtime, as the project pins: ` +
                    `the ${minor} runtime reads ${minor} exports only: expect missing data, wrong poses or a throw`;

                const pinnedRead = () =>
                    engine.spine.readSkeleton(contractSkeleton(other), ATLAS, textures(), {
                        file: 'hero.json',
                    });

                beforeAll(() => {
                    engine = createPixi5Engine(PIXI, {
                        pin: { [other]: minor },
                        warn: (message) => warnings.push(message),
                    });
                });

                beforeEach(() => {
                    warnings = [];
                    vi.spyOn(console, 'error').mockImplementation(() => {});
                });

                afterEach(() => {
                    vi.restoreAllMocks();
                });

                it('is read by that runtime, which is said, where it attaches no image', () => {
                    const bare = contractSkeleton(other);
                    delete bare.skins;
                    engine.assets.set('cached.json', bare);

                    const data = engine.spine.readSkeleton(bare, '', {}, { file: 'hero.json' });
                    const cached = engine.spine.readSkeletonFromAssets('cached.json');

                    expect(engine.spine.runtimeOf(data)?.minor).toBe(minor);
                    expect(engine.spine.runtimeOf(cached)?.minor).toBe(minor);
                    expect(data.bones.map((bone) => bone.name)).toEqual(['root', 'bone_a']);
                    expect(warnings).toEqual([warning('hero.json'), warning('cached.json')]);
                });

                if (minor === '3.8') {
                    it('loses its skins, an object by name in which 2.1.14 finds no array, and draws nothing', () => {
                        const data: Loaded = pinnedRead();
                        const spine: Loaded = engine.spine.create(data);
                        engine.spine.update(spine, 0);

                        expect(warnings).toEqual([warning('hero.json')]);
                        expect(console.error).toHaveBeenCalledExactlyOnceWith(
                            `PixiJS Spine plugin supports only format for Spine 3.8. Your model has version ${EXPORTED[other]}. Please look in pixi-spine repository README for another branch.`,
                        );
                        expect(data.skins).toEqual([]);
                        expect(data.defaultSkin).toBeUndefined();
                        expect(
                            spine.skeleton.slots.filter((slot: Loaded) => slot.attachment),
                        ).toEqual([]);
                    });
                } else {
                    it('throws where it has skins: 2.0.5 reads their array by index, as a skin named "0"', () => {
                        expect(pinnedRead).toThrow('Slot not found: name');
                        expect(warnings).toEqual([warning('hero.json')]);
                    });
                }
            });
        });

        it('refuses the exports of Spine 4, naming the Pixi that render each', () => {
            const engine = createPixi5Engine(PIXI);
            const majorsOf = (version: string) =>
                (
                    thrown(() =>
                        read(engine, relabelled(contractSkeleton(minor), version)),
                    ) as UnsupportedSpineVersionError
                ).pixiMajors;

            expect(majorsOf('4.0.64')).toEqual([6, 7, 8]);
            expect(majorsOf('4.1.24')).toEqual([6, 7, 8]);
            expect(majorsOf('4.2.43')).toEqual([7, 8]);
            expect(majorsOf('4.3.23')).toEqual([7, 8]);
        });

        it('refuses a binary 4.2 export, naming its runtime', () => {
            const engine = createPixi5Engine(PIXI);
            const error = thrown(() =>
                engine.spine.readSkeleton(SKEL_42, '', {}, { file: 'rig-4.2.skel' }),
            );

            expect(error).toBeInstanceOf(UnsupportedSpineVersionError);
            expect(error).toMatchObject({ registered: [minor], pixiMajors: [7, 8] });
            expect((error as Error).message).toBe(
                `rig-4.2.skel: Spine 4.2.43 — registered runtimes: ${minor === '3.7' ? '3.7 (JSON only)' : minor}; Pixi 7, 8 can render it`,
            );
        });

        it("reads from the asset cache: the editor's registry, or a game's loader", () => {
            const engine = createPixi5Engine(PIXI);
            engine.assets.set('hero.json', contractSkeleton(minor));
            engine.assets.set('hero.atlas', ATLAS);
            engine.assets.set('contract.png', page);

            const data = engine.spine.readSkeletonFromAssets('hero.json', 'hero.atlas');
            const loaded = createPixi5Engine(PIXI, {
                loaders: [{ resources: { hero: { name: 'hero', spineData: data } } }],
            });

            expect(engine.spine.runtimeOf(data)?.minor).toBe(minor);
            expect(loaded.spine.readSkeletonFromAssets('hero.json')).toBe(data);
        });

        it("hears every pointer move through the renderer's interaction manager", () => {
            const interaction = new PIXI.utils.EventEmitter();
            const engine = createPixi5Engine(PIXI, { renderer: { plugins: { interaction } } });
            const moves: number[][] = [];

            const stop = engine.display.onGlobalPointerMove(engine.display.container(), (global) =>
                moves.push([global.x, global.y]),
            );
            interaction.emit('pointermove', { data: { global: { x: 3, y: 4 } } });
            stop();
            interaction.emit('pointermove', { data: { global: { x: 5, y: 6 } } });

            expect(moves).toEqual([[3, 4]]);
        });

        describe('hit-testing', () => {
            let engine: Pixi5Engine;

            const interactive = () => engine.display.container({ interactive: 'static' });
            const square = (size: number) => {
                const sprite = engine.display.sprite(PIXI.Texture.WHITE, 0.5);
                sprite.width = sprite.height = size;
                engine.display.setInteractive(sprite, 'static');
                return sprite;
            };
            const spineOf = (skeleton?: SkeletonSource) => {
                const spine = engine.spine.create(read(engine, skeleton));
                spine.autoUpdate = false;
                return spine;
            };
            const hit = (root: Loaded, x: number, y: number) => {
                updateTransforms(PIXI, root);
                return stack.hitTest(root, x, y);
            };

            beforeAll(() => {
                engine = createPixi5Engine(PIXI);
            });

            it('lets a click through a shielded skeleton to what lies behind it, until it is exposed', () => {
                const stage = interactive();
                const behind = square(200);
                const layer = interactive();
                const spine = spineOf();
                layer.addChild(spine);
                stage.addChild(behind);
                stage.addChild(layer);
                engine.spine.update(spine, 0);

                expect(hit(stage, 0, 0)).toBe(layer);

                engine.display.shieldFromHitTesting(spine);
                expect(hit(stage, 0, 0)).toBe(behind);

                engine.display.exposeToHitTesting(spine);
                expect(hit(stage, 0, 0)).toBe(layer);
            });

            it('hits an object hung off a slot of a shielded skeleton, and nothing beside it', () => {
                const stage = interactive();
                const spine = spineOf();
                const button = square(4);
                stage.addChild(spine);

                engine.spine.attachSlotObject(spine, 'slot_a', button);
                engine.spine.update(spine, 0);
                expect(hit(stage, 10, 0)).toBe(stage);

                engine.display.shieldFromHitTesting(spine);
                expect(hit(stage, 0, 0)).toBe(button);
                expect(hit(stage, 10, 0)).toBeNull();
            });

            it('clips hits to a clipping attachment, inside which an object on a slot is hit', () => {
                const stage = interactive();
                const behind = square(400);
                const layer = interactive();
                const spine = spineOf(clippedSkeleton(minor));
                const button = square(10);
                const object = engine.display.container();
                object.addChild(button);
                layer.addChild(spine);
                stage.addChild(behind);
                stage.addChild(layer);

                engine.spine.attachSlotObject(spine, 'slot_b', object);
                engine.display.shieldFromHitTesting(spine);
                engine.spine.update(spine, 0);

                expect(hit(stage, 8, -20)).toBe(button);
                expect(hit(stage, 14, -20)).toBe(behind);
                expect(hit(stage, 2, -12)).toBe(behind);

                engine.display.exposeToHitTesting(spine);
                expect(hit(stage, 2, -12)).toBe(layer);
            });

            it('refuses to shield or expose a skeleton that a pixi-spine it was not given made', () => {
                const beside = createPixi5Engine(PIXI, { runtime: pixiSpine2On(PIXI, other) });
                const spine = beside.spine.create(read(beside, contractSkeleton(other)));

                expect(() => engine.display.shieldFromHitTesting(spine)).toThrow(
                    'No Spine runtime of this engine made this spine',
                );
                expect(() => engine.display.exposeToHitTesting(spine)).toThrow(
                    'No Spine runtime of this engine made this spine',
                );
            });
        });

        describe('SpineLayoutCore on the engine', () => {
            const layoutOf = (data: { name: string; skeleton: SkeletonSource }[]) => {
                const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
                const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
                const engine = createPixi5Engine(PIXI);
                const layout = new SpineLayoutCore<Pixi5Types>({ engine });

                try {
                    layout.createInstancesFromDataArray(
                        data.map((item) => ({ ...item, atlasText: ATLAS, textures: textures() })),
                    );
                    return {
                        engine,
                        layout,
                        logged: errors.mock.calls.slice(),
                        warned: warnings.mock.calls.slice(),
                    };
                } finally {
                    errors.mockRestore();
                    warnings.mockRestore();
                }
            };

            it(`builds a ${minor} export into a Pixi 5 container, skins and all`, () => {
                const { engine, layout, logged } = layoutOf([
                    { name: 'root', skeleton: contractSkeleton(minor) },
                ]);
                const spine = layout.spines.get('root')!;
                const events: string[] = [];

                spine.state.addListener({ event: (_, event) => events.push(event.data.name) });
                spine.state.setAnimation(0, 'move', false);
                engine.spine.update(spine, 0.75);

                expect(logged).toEqual([]);
                expect(layout).toBeInstanceOf(PIXI.Container);
                expect(spine).toBeInstanceOf(PIXI.spine.Spine);
                expect(spine.parent).toBe(layout);
                expect(layout.skins.getList().get('root')).toEqual(['default']);
                expect(events).toEqual(['hit']);
            });

            it('leaves Container#render(renderer) to Pixi 5, which draws its spines', () => {
                const { layout } = layoutOf([{ name: 'root', skeleton: contractSkeleton(minor) }]);
                const spine = layout.spines.get('root')!;
                const drawn: unknown[] = [];
                const renderer = {
                    batch: { setObjectRenderer: () => {} },
                    plugins: { batch: { render: (sprite: unknown) => drawn.push(sprite) } },
                };

                updateTransforms(PIXI, layout);
                (layout as Loaded).render(renderer);

                const regions = spine.slotContainers.map((slot) => slot.children[0]);
                expect(drawn.map((sprite) => regions.indexOf(sprite as never))).toEqual([0, 1]);
            });

            it(`builds the root, and warns once of the ${other} skeleton it cannot read`, () => {
                const root = contractSkeleton(minor);
                (root.slots as object[]).push({ name: 'spine_child', bone: 'root' });

                const { layout, logged, warned } = layoutOf([
                    { name: 'root', skeleton: root },
                    { name: 'child', skeleton: contractSkeleton(other) },
                ]);

                expect(layout.spines.get('root')).toBeInstanceOf(PIXI.spine.Spine);
                expect(layout.spines.has('child')).toBe(false);
                expect(logged).toEqual([]);
                expect(warned).toEqual([
                    [
                        `[SpineLayout] Skipped spine "child": child: Spine ${EXPORTED[other]} — ` +
                            `registered runtimes: ${minor}; Pixi 4, 5, 6, 7 can render it`,
                    ],
                ]);
            });

            it('hits a button empty at setup where its skin draws it', () => {
                const skeleton = contractSkeleton(minor);
                const skins = skeleton.skins as Loaded;
                (skeleton.slots as object[]).push({ name: 'button_go', bone: 'bone_a' });
                (Array.isArray(skins) ? skins[0].attachments : skins.default).button_go = {
                    square: { width: 40, height: 20 },
                };

                const { engine, layout, logged } = layoutOf([{ name: 'root', skeleton }]);
                const button = engine.spine.getSlotObject(layout.spines.get('root')!, 'button_go');

                expect(logged).toEqual([]);
                expect(button?.hitArea).toBeInstanceOf(PIXI.Polygon);
                expect((button?.hitArea as Loaded).points).toEqual([
                    -20, 10, -20, -10, 20, -10, 20, 10,
                ]);
            });
        });
    });
}
