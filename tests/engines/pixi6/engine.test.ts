import { createRequire } from 'node:module';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance,
} from 'vitest';
import {
    createPixi6Engine,
    SpineLayoutCore,
    type Pixi6Engine,
    type Pixi6LazyRuntime,
    type Pixi6Runtime,
    type Pixi6Types,
} from '../../../src/pixi6';
import {
    discoverGlobalRuntimes,
    pixiSpineAdapters,
    pixiSpineModular,
    type PixiSpineRuntime,
} from '../../../src/runtimes';
import { ATLAS, contractSkeleton } from '../pixiSpine/fixtures';
import {
    canvasPage,
    loadPixi6,
    MINORS,
    RUNTIMES_GLOBAL,
    type LoadedPixi6,
    type Minor,
} from './loadPixi6';

const require = createRequire(import.meta.url);
const global = globalThis as Record<string, unknown>;

let PIXI: LoadedPixi6;
let page: LoadedPixi6;
let bundle: LoadedPixi6;

beforeAll(async () => {
    PIXI = await loadPixi6();
    page = canvasPage(PIXI, 64, 64);
    bundle = global[RUNTIMES_GLOBAL];
});

const textures = () => ({ 'contract.png': page });
const runtimeOf = (minor: Minor) =>
    (discoverGlobalRuntimes() as PixiSpineRuntime[]).find(({ info }) => info.minor === minor)!;

/** A runtime of the page's, named up front and handed over only when the engine asks. */
const lazy = (
    minor: Minor,
    load: () => ReturnType<Pixi6LazyRuntime> = async () => runtimeOf(minor),
) => Object.assign(load, runtimeOf(minor).info);

/** `@pixi-spine-v6/*` from their CommonJS builds, which pnpm links to `@pixi/core` 7.4.3. */
const commonJsRuntime = (minor: Minor) =>
    pixiSpineModular(
        require('@pixi-spine-v6/base'),
        { [minor]: require(`@pixi-spine-v6/runtime-${minor}`) },
        { packageVersion: '3.1.2' },
    )[0];

/** A 4.0 export whose `wobble` moves a mesh's four vertices 5 along x by its key at 1s. */
function deformedSkeleton() {
    const skeleton = contractSkeleton('4.0');
    const { slots, skins, animations } = skeleton as {
        slots: object[];
        skins: { attachments: Record<string, object> }[];
        animations: Record<string, object>;
    };

    slots.push({ name: 'slot_mesh', bone: 'root', attachment: 'square' });
    skins[0].attachments.slot_mesh = {
        square: {
            type: 'mesh',
            uvs: [0, 0, 1, 0, 1, 1, 0, 1],
            triangles: [0, 1, 2, 2, 3, 0],
            vertices: [0, 0, 40, 0, 40, 20, 0, 20],
            hull: 4,
            width: 40,
            height: 20,
        },
    };
    animations.wobble = {
        deform: {
            default: {
                slot_mesh: {
                    square: [{ time: 0 }, { time: 1, vertices: [5, 0, 5, 0, 5, 0, 5, 0] }],
                },
            },
        },
    };
    return skeleton;
}

describe('createPixi6Engine', () => {
    const scratch: string[] = [];

    afterEach(() => {
        scratch.splice(0).forEach((key) => delete global[key]);
        global[RUNTIMES_GLOBAL] = bundle;
    });

    it('finds the runtimes the page loaded, each reading its own export minor', () => {
        const engine = createPixi6Engine(PIXI);

        expect(engine.name).toBe('pixi6');
        expect(engine.spine.runtimes).toEqual(
            MINORS.map((minor) => ({
                minor,
                family: 'pixi-spine-modular',
                packageName: `@pixi-spine/runtime-${minor}`,
                packageVersion: '3.1.2',
            })),
        );
        expect(engine.spine.prepare).toBeUndefined();
        expect(engine.particles).toBeDefined();

        MINORS.forEach((minor) => {
            const data = engine.spine.readSkeleton(contractSkeleton(minor), ATLAS, textures());
            const spine = engine.spine.create(data);

            expect(data).toBeInstanceOf(bundle[`runtime${minor.replace('.', '')}`].SkeletonData);
            expect(spine).toBeInstanceOf(bundle[`runtime${minor.replace('.', '')}`].Spine);
            expect(spine).toBeInstanceOf(PIXI.Container);
            spine.destroy();
        });
    });

    it('passes over what the page loaded for another Pixi, and refuses it when given', () => {
        const runtime38 = bundle.runtime38;
        global.SpineRuntime_pixiSpine_2_1_14 = { Spine: runtime38.Spine, core: runtime38 };
        scratch.push('SpineRuntime_pixiSpine_2_1_14');

        const found = discoverGlobalRuntimes();
        const forPixi5 = found.find(({ info }) => info.family === 'pixi-spine-legacy')!;

        expect(forPixi5.info).toMatchObject({ minor: '3.8', packageVersion: '2.1.14' });
        expect(createPixi6Engine(PIXI).spine.runtimes.map(({ family }) => family)).toEqual(
            MINORS.map(() => 'pixi-spine-modular'),
        );
        expect(() => createPixi6Engine(PIXI, { runtimes: [forPixi5] })).toThrow(
            'pixi-spine@2.1.14 (Spine 3.8) does not run on Pixi 6',
        );
    });

    it('refuses a runtime built against another copy of Pixi, and passes one over that the page loaded', () => {
        const stray = commonJsRuntime('4.1');

        expect(() => createPixi6Engine(PIXI, { runtimes: [stray] })).toThrow(
            '@pixi-spine/runtime-4.1@3.1.2 (Spine 4.1) was built against another Pixi than this 6.5.10',
        );

        global.SpineRuntime_pixiSpine_3_1_3 = {
            base: require('@pixi-spine-v6/base'),
            runtime41: require('@pixi-spine-v6/runtime-4.1'),
        };
        scratch.push('SpineRuntime_pixiSpine_3_1_3');

        expect(discoverGlobalRuntimes().filter(({ info }) => info.minor === '4.1')).toHaveLength(2);
        expect(createPixi6Engine(PIXI).spine.runtimes.map(({ minor }) => minor)).toEqual(MINORS);
    });

    it('reads each minor with the first runtime the page loaded for it, and reports the others', () => {
        global.SpineRuntime_pixiSpine_3_1_3 = { base: bundle.base, runtime37: bundle.runtime37 };
        scratch.push('SpineRuntime_pixiSpine_3_1_3');
        const warnings: string[] = [];

        const engine = createPixi6Engine(PIXI, { warn: (message) => warnings.push(message) });

        expect(engine.spine.runtimes.map(({ packageVersion }) => packageVersion)).toEqual(
            MINORS.map(() => '3.1.2'),
        );
        expect(warnings).toEqual([
            'createPixi6Engine reads Spine 3.7 with @pixi-spine/runtime-3.7@3.1.2 (Spine 3.7), the ' +
                'first the page loaded, and leaves @pixi-spine/runtime-3.7@3.1.3 (Spine 3.7) out',
        ]);
        expect(() =>
            createPixi6Engine(PIXI, {
                runtimes: discoverGlobalRuntimes().filter(({ info }) => info.minor === '3.7'),
            }),
        ).toThrow('Two runtimes read Spine 3.7');
    });

    it('binds every runtime itself, and refuses one bound already, given or loaded lazily', async () => {
        const [adapter] = pixiSpineAdapters<Pixi6Types>([runtimeOf('4.1')], {
            PIXI,
            assets: createPixi6Engine(PIXI).assets,
        });
        const bound = adapter as unknown as Pixi6Runtime;

        expect(() => createPixi6Engine(PIXI, { runtimes: [bound] })).toThrow(
            'createPixi6Engine: @pixi-spine/runtime-4.1@3.1.2 (Spine 4.1) is bound already',
        );

        const engine = createPixi6Engine(PIXI, {
            runtimes: [runtimeOf('3.8'), lazy('4.1', async () => bound as PixiSpineRuntime)],
        });

        await expect(engine.spine.prepare!(['4.1'])).rejects.toThrow('is bound already');
    });

    it('refuses particles built against another copy of Pixi', () => {
        const bare = Object.create(PIXI, { particles: { value: undefined } });

        expect(() =>
            createPixi6Engine(bare, { particles: require('@pixi/particle-emitter-v5') }),
        ).toThrow(
            'createPixi6Engine: the particles library was built against another Pixi than this 6.5.10',
        );
    });

    it('refuses a PIXI other than 6, and a page with no runtime for it', () => {
        expect(() => createPixi6Engine({ ...PIXI, VERSION: '7.4.3' })).toThrow(
            'createPixi6Engine: PIXI is 7.4.3, not Pixi 6',
        );

        global[RUNTIMES_GLOBAL] = undefined;
        expect(() => createPixi6Engine(PIXI)).toThrow('no Spine runtime for Pixi 6');
    });

    it('reads 4.0 with runtime-4.1 where the project pins it, as pixi-spine 3.1 loads it itself', () => {
        const warnings: string[] = [];
        const pinned = createPixi6Engine(PIXI, {
            pin: { '4.0': '4.1' },
            warn: (message) => warnings.push(message),
        });
        const own = createPixi6Engine(PIXI, { warn: (message) => warnings.push(message) });
        const read = (engine: typeof own) =>
            engine.spine.runtimeOf(
                engine.spine.readSkeleton(contractSkeleton('4.0'), ATLAS, textures(), {
                    file: 'bg.json',
                }),
            )?.minor;

        expect(read(own)).toBe('4.0');
        expect(warnings).toEqual([]);
        expect(read(pinned)).toBe('4.1');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/^bg\.json: Spine 4\.0\.64 .*4\.1 runtime/);
    });

    describe('a pinned 4.0 export with mesh deform keys', () => {
        const warnings: string[] = [];

        const halfway = (engine: Pixi6Engine) => {
            const data = engine.spine.readSkeleton(deformedSkeleton(), ATLAS, textures(), {
                file: 'bg.json',
            });
            const spine = engine.spine.create(data);

            spine.state.setAnimation(0, 'wobble', false);
            engine.spine.update(spine, 0.5);
            const { deform } = spine.skeleton.findSlot('slot_mesh') as unknown as {
                deform: number[];
            };
            spine.destroy();
            return { minor: engine.spine.runtimeOf(data)?.minor, deform: [...deform] };
        };
        const pinned = () =>
            createPixi6Engine(PIXI, {
                pin: { '4.0': '4.1' },
                warn: (message) => warnings.push(message),
            });

        beforeEach(() => {
            warnings.length = 0;
        });

        it('is read by runtime-4.1 with the keys runtime-4.0 reads', () => {
            const own = halfway(createPixi6Engine(PIXI));

            expect(own).toEqual({ minor: '4.0', deform: [2.5, 0, 42.5, 0, 42.5, 20, 2.5, 20] });
            expect(halfway(pinned())).toEqual({ ...own, minor: '4.1' });
        });

        it('is reported without a loss of its deform keys', () => {
            halfway(pinned());
            expect(warnings).toHaveLength(1);
            expect(warnings[0].split(': ').at(-1)).not.toContain('deform');
        });
    });

    it('reads a skeleton from the asset cache with the runtime its export picks, pinned or not', () => {
        const warnings: string[] = [];
        const engine = createPixi6Engine(PIXI, {
            pin: { '4.0': '4.1' },
            warn: (message) => warnings.push(message),
        });
        MINORS.forEach((minor) =>
            engine.assets.set(`spine/${minor}.json`, contractSkeleton(minor)),
        );
        engine.assets.set('spine/contract.atlas', ATLAS);
        engine.assets.set('spine/contract.png', page);

        const read = (minor: Minor) =>
            engine.spine.readSkeletonFromAssets(`spine/${minor}.json`, 'spine/contract.atlas');

        expect(MINORS.map((minor) => engine.spine.runtimeOf(read(minor))?.minor)).toEqual([
            '3.7',
            '3.8',
            '4.1',
            '4.1',
        ]);
        expect(warnings).toEqual([expect.stringMatching(/^spine\/4\.0\.json: Spine 4\.0\.64 /)]);
        expect(engine.spine.create(read('3.8')).skeleton.findSlot('slot_a')).toBeTruthy();
        expect(() => engine.spine.readSkeletonFromAssets('spine/none.json')).toThrow(
            'No skeleton loaded as "spine/none.json"',
        );
        expect(() =>
            engine.spine.readSkeletonFromAssets('spine/3.8.json', 'spine/none.atlas'),
        ).toThrow('No atlas loaded as "spine/none.atlas"');
    });

    it('takes a skeleton a loader read when a runtime of its own read it', () => {
        const spineData = createPixi6Engine(PIXI).spine.readSkeleton(
            contractSkeleton('3.8'),
            ATLAS,
            textures(),
        );
        const loaders = [{ resources: { 'hero.json': { spineData } } }];

        expect(createPixi6Engine(PIXI, { loaders }).spine.readSkeletonFromAssets('hero.json')).toBe(
            spineData,
        );
        expect(() =>
            createPixi6Engine(PIXI, {
                loaders,
                runtimes: [runtimeOf('4.1')],
            }).spine.readSkeletonFromAssets('hero.json'),
        ).toThrow('"hero.json" was read by a Spine runtime this engine does not have');
    });

    it('loads a lazy runtime when asked to prepare for its minor, binding what it loads', async () => {
        const loads: string[] = [];
        const engine = createPixi6Engine(PIXI, {
            runtimes: [
                lazy('4.1', async () => {
                    loads.push('4.1');
                    return runtimeOf('4.1');
                }),
                runtimeOf('3.8'),
            ],
        });
        const read41 = () => engine.spine.readSkeleton(contractSkeleton('4.1'), ATLAS, textures());

        expect(engine.spine.runtimes.map(({ minor }) => minor)).toEqual(['3.8', '4.1']);
        expect(read41).toThrow("await prepare(['4.1']) first");

        await Promise.all([engine.spine.prepare!(['3.8', '4.1']), engine.spine.prepare!(['4.1'])]);
        const spine = engine.spine.create(read41());

        expect(loads).toEqual(['4.1']);
        expect(engine.spine.runtimeOf(spine)?.minor).toBe('4.1');
        engine.spine.update(spine, 0.75);
        expect(engine.spine.drawOrder(spine.skeleton).map((slot) => slot.data.name)).toEqual([
            'slot_a',
            'slot_b',
        ]);
    });

    it('checks what a lazy runtime loads like one given outright', async () => {
        const engine = createPixi6Engine(PIXI, {
            runtimes: [runtimeOf('3.8'), lazy('4.1', async () => commonJsRuntime('4.1'))],
        });

        await expect(engine.spine.prepare!(['4.1'])).rejects.toThrow(
            'was built against another Pixi than this 6.5.10',
        );
    });

    it('takes its particles from the option where PIXI has none', () => {
        const bare = Object.create(PIXI, { particles: { value: undefined } });

        expect(createPixi6Engine(bare).particles).toBeUndefined();
        expect(createPixi6Engine(bare, { particles: PIXI.particles }).particles).toBeDefined();
    });
});

/** A 4.1 root that nests the 3.7, 3.8 and 4.0 skeletons in `spine_<id>` slots, 100 apart. */
const CHILDREN = { alpha: '3.7', bravo: '3.8', charlie: '4.0' } as const;

function layoutData() {
    const root = contractSkeleton('4.1');
    const { bones, slots } = root as { bones: object[]; slots: object[] };

    Object.keys(CHILDREN).forEach((id, i) => {
        bones.push({ name: `bone_${id}`, parent: 'root', x: 100 * (i - 1), y: 100 });
        slots.push({ name: `spine_${id}`, bone: `bone_${id}` });
    });

    return [
        { name: 'root', skeleton: root, atlasText: ATLAS, textures: textures() },
        ...Object.entries(CHILDREN).map(([id, minor]) => ({
            name: id,
            skeleton: contractSkeleton(minor),
            atlasText: ATLAS,
            textures: textures(),
        })),
    ];
}

/** {@link layoutData} as a manifest lists it under `spine/`, each skeleton beside its own atlas. */
const MANIFEST = {
    bundles: [
        {
            name: 'main',
            assets: ['root', ...Object.keys(CHILDREN)].flatMap((id) =>
                ['json', 'atlas', 'png'].map((ext) => ({
                    alias: [`spine/${id}.${ext}`],
                    src: `${id}.${ext}`,
                })),
            ),
        },
    ],
};

/** What loading {@link MANIFEST} leaves in the engine's asset cache: every atlas names `contract.png`. */
function intoAssets(engine: Pixi6Engine) {
    layoutData().forEach(({ name, skeleton }) => {
        engine.assets.set(`spine/${name}.json`, skeleton);
        engine.assets.set(`spine/${name}.atlas`, ATLAS);
    });
    engine.assets.set('spine/contract.png', page);
}

describe('SpineLayoutCore on the pixi6 engine', () => {
    let errors: MockInstance<typeof console.error>;

    beforeEach(() => {
        errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => errors.mockRestore());

    it('nests a skeleton of every export minor into a tree, each on its runtime, and plays each', () => {
        const engine = createPixi6Engine(PIXI);
        const layout = new SpineLayoutCore<Pixi6Types>({ engine });

        layout.createInstancesFromDataArray(layoutData());

        const root = layout.spines.get('root')!;
        expect(layout).toBeInstanceOf(PIXI.Container);
        expect(root.parent).toBe(layout);
        expect(engine.spine.runtimeOf(root)?.minor).toBe('4.1');

        Object.entries(CHILDREN).forEach(([id, minor], i) => {
            const child = layout.spines.get(id)!;

            expect(engine.spine.runtimeOf(child)?.minor).toBe(minor);
            expect(engine.spine.getSlotObject(root, `spine_${id}`)).toBe(child);
            const origin = root.toLocal(child.toGlobal(new PIXI.Point(0, 0)));
            expect(origin.x).toBeCloseTo(100 * (i - 1), 4);
            expect(origin.y).toBeCloseTo(-100, 4);
        });

        [root, ...Object.keys(CHILDREN).map((id) => layout.spines.get(id)!)].forEach((spine) => {
            const events: string[] = [];

            spine.state.addListener({ event: (_, event) => events.push(event.data.name) });
            spine.state.setAnimation(0, 'move', false);
            engine.spine.update(spine, 0.75);

            expect(events).toEqual(['hit']);
            expect(engine.spine.bonePose(spine.skeleton.findBone('bone_a')!).x).toBeCloseTo(32.5);
        });
    });

    it('awaits the lazy runtimes a tree needs before it builds it', async () => {
        const loaded: string[] = [];
        const engine = createPixi6Engine(PIXI, {
            runtimes: MINORS.map((minor) =>
                lazy(minor, async () => {
                    loaded.push(minor);
                    return runtimeOf(minor);
                }),
            ),
        });
        const layout = new SpineLayoutCore<Pixi6Types>({ engine });

        await layout.loadInstancesFromDataArray(layoutData());

        expect(loaded.sort()).toEqual(['3.7', '3.8', '4.0', '4.1']);
        expect(
            ['root', ...Object.keys(CHILDREN)].map(
                (id) => engine.spine.runtimeOf(layout.spines.get(id)!)?.minor,
            ),
        ).toEqual(['4.1', '3.7', '3.8', '4.0']);
    });

    it("builds a manifest from the asset cache, each skeleton on its export's runtime", async () => {
        const engine = createPixi6Engine(PIXI);
        intoAssets(engine);
        const layout = new SpineLayoutCore<Pixi6Types>({ engine });

        await layout.loadInstancesFromManifest(MANIFEST, 'spine');

        const root = layout.spines.get('root')!;
        expect(errors).not.toHaveBeenCalled();
        expect(layout.spines.size).toBe(4);
        expect(engine.spine.runtimeOf(root)?.minor).toBe('4.1');
        Object.entries(CHILDREN).forEach(([id, minor]) => {
            expect(engine.spine.runtimeOf(layout.spines.get(id)!)?.minor).toBe(minor);
            expect(engine.spine.getSlotObject(root, `spine_${id}`)).toBe(layout.spines.get(id));
        });
    });

    it('loads the lazy runtimes a manifest needs before it builds it', async () => {
        const loaded: string[] = [];
        const engine = createPixi6Engine(PIXI, {
            runtimes: MINORS.map((minor) =>
                lazy(minor, async () => {
                    loaded.push(minor);
                    return runtimeOf(minor);
                }),
            ),
        });
        intoAssets(engine);
        const layout = new SpineLayoutCore<Pixi6Types>({ engine });

        await layout.loadInstancesFromManifest(MANIFEST, 'spine');

        expect(loaded.sort()).toEqual(['3.7', '3.8', '4.0', '4.1']);
        expect(errors).not.toHaveBeenCalled();
        expect(
            ['root', ...Object.keys(CHILDREN)].map(
                (id) => engine.spine.runtimeOf(layout.spines.get(id)!)?.minor,
            ),
        ).toEqual(['4.1', '3.7', '3.8', '4.0']);
    });

    it('builds a 3.7 export from data without an error, its skins kept by name', () => {
        const layout = new SpineLayoutCore<Pixi6Types>({ engine: createPixi6Engine(PIXI) });
        layout.createInstancesFromDataArray(layoutData());

        expect(errors).not.toHaveBeenCalled();
        expect(layout.skins.getList().get('alpha')).toEqual(['default']);
    });

    it('is drawn by Pixi 6, whose renderer calls Container#render on every display object', () => {
        const layout = new SpineLayoutCore<Pixi6Types>({ engine: createPixi6Engine(PIXI) });
        layout.createInstancesFromDataArray(layoutData());
        const root = layout.spines.get('root') as unknown as { render(): void };
        const drawn = vi
            .spyOn(root, 'render')
            .mockName('root.render')
            .mockImplementation(() => {});
        const stage = new PIXI.Container();

        stage.addChild(layout);
        stage.render({});

        expect(drawn).toHaveBeenCalledTimes(1);
    });

    it("destroys its texts on a reset, and Pixi 6's caches with them", () => {
        const cached = () => Object.keys(PIXI.utils.TextureCache).length;
        const layout = new SpineLayoutCore<Pixi6Types>({ engine: createPixi6Engine(PIXI) });
        const data = layoutData();
        const root = data[0].skeleton as { bones: object[]; slots: object[] };
        const before = cached();

        ['one', 'two'].forEach((key, i) => {
            root.bones.push({ name: `bone_${key}`, parent: 'root', x: 10 * i });
            root.slots.push({ name: `text_${key}`, bone: `bone_${key}` });
        });
        layout.textSettings = {
            root: {
                one: { type: 'text', value: '1', fontSize: 20 },
                two: { type: 'text', value: '2', fontSize: 20 },
            },
        };
        layout.createInstancesFromDataArray(data);
        expect(cached() - before).toBe(2);
        layout.reset();

        expect(
            cached() - before,
            "the texts' canvas textures, left in PIXI.utils.TextureCache",
        ).toBe(0);
    });
});
