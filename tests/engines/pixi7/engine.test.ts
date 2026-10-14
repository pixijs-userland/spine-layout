import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import type { ContainerLike } from '../../../src/engine/Engine';
import {
    createPixi7Engine,
    SpineLayoutCore,
    type Pixi7Engine,
    type Pixi7EngineOptions,
    type Pixi7Types,
} from '../../../src/pixi7';
import {
    esotericAdapter,
    esotericRuntime,
    lazyRuntime,
    type PixiSpineRuntime,
} from '../../../src/runtimes';
import { contractFixture } from '../../engine-contract/contract';
import { canvasPage, loadPixi7, updateTransforms, type Loaded, type Pixi7Stack } from './loadPixi7';

let stack: Pixi7Stack;
let page: Loaded;
let warnings: string[] = [];
let cached: string[] = [];

/** Puts `value` in Pixi 7's Assets cache, as a game's `Assets.load` leaves it; gone after the test. */
function cache(alias: string, value: unknown) {
    stack.PIXI.Assets.cache.set(alias, value);
    cached.push(alias);
}

/**
 * An export in the Assets cache as `<name>.json`, `<name>.atlas` (text) and `<name>.png`, its
 * atlas naming that page. Returns the aliases.
 */
function cacheExport(name: string, { skeleton, atlasText }: ReturnType<typeof exportOf>) {
    cache(`${name}.json`, skeleton);
    cache(`${name}.atlas`, atlasText.replace('contract.png', `${name}.png`));
    cache(`${name}.png`, canvasPage(stack.PIXI, 64, 32));
    return [`${name}.json`, `${name}.atlas`, `${name}.png`];
}

/** The atlas spine-pixi-v7's Assets loader makes of an atlas file: parsed, pages bound. */
function parsedAtlas(atlasText: string) {
    const SP = stack.modules.esoteric['4.2'];
    const atlas = new SP.TextureAtlas(atlasText);
    atlas.pages.forEach((atlasPage: Loaded) =>
        atlasPage.setTexture(SP.SpineTexture.from(page.baseTexture)),
    );
    return atlas;
}

afterEach(() => {
    const { Assets, Texture, BaseTexture } = stack.PIXI;
    cached.splice(0).forEach((alias) => {
        Assets.cache.remove(alias);
        Texture.removeFromCache(alias);
        BaseTexture.removeFromCache(alias);
    });
});

const engineWith = (options: Pixi7EngineOptions = {}) =>
    createPixi7Engine(stack.PIXI, { warn: (message) => warnings.push(message), ...options });

/** Every runtime Pixi 7 reads with: runtime-4.0 is not one. */
const pixi7Runtimes = () => {
    const { pixiSpine, esoteric } = stack;
    return [pixiSpine['3.7'], pixiSpine['3.8'], pixiSpine['4.1'], esoteric['4.2'], esoteric['4.3']];
};

/**
 * The contract skeleton as an export of `version`, in the format of the runtime of `like`. 3.7
 * keys its skins by name, where 3.8 lists them.
 */
function exportOf(version: string, like = version) {
    const { skeleton, atlasText } = contractFixture(like.slice(0, 3));
    skeleton.skeleton.spine = version;

    if (version.startsWith('3.7.')) {
        const skins = skeleton.skins as unknown as { name: string; attachments: object }[];
        Object.assign(skeleton, {
            skins: Object.fromEntries(skins.map(({ name, attachments }) => [name, attachments])),
        });
    }
    return { skeleton, atlasText };
}

function read(engine: Pixi7Engine, version: string, like?: string) {
    const { skeleton, atlasText } = exportOf(version, like);
    return engine.spine.readSkeleton(
        skeleton,
        atlasText,
        { 'contract.png': page },
        { file: `${version}.json` },
    );
}

const minorsOf = (engine: Pixi7Engine) => engine.spine.runtimes.map(({ minor }) => minor);

beforeAll(async () => {
    stack = await loadPixi7();
    page = canvasPage(stack.PIXI, 64, 32);
});

beforeEach(() => {
    warnings = [];
});

describe('the runtimes it reads with', () => {
    const EDITOR_GLOBALS = [
        'SpineRuntime_pixiSpine_4_0_6',
        'SpineRuntime_spinePixiV7_4_2_120',
        'SpineRuntime_spinePixiV7_4_3_13',
    ];

    afterEach(() => {
        EDITOR_GLOBALS.forEach((key) => delete (globalThis as Record<string, unknown>)[key]);
    });

    it("finds what the page's scripts loaded, runtime-4.0 passed over without a word", () => {
        const { base, pixiSpine, esoteric } = stack.modules;
        Object.assign(globalThis, {
            SpineRuntime_pixiSpine_4_0_6: {
                base,
                runtime37: pixiSpine['3.7'],
                runtime38: pixiSpine['3.8'],
                runtime40: pixiSpine['4.0'],
                runtime41: pixiSpine['4.1'],
            },
            SpineRuntime_spinePixiV7_4_2_120: esoteric['4.2'],
            SpineRuntime_spinePixiV7_4_3_13: esoteric['4.3'],
        });

        const engine = engineWith();

        expect(
            engine.spine.runtimes.map((runtime) => `${runtime.minor} ${runtime.packageName}`),
        ).toEqual([
            '3.7 @pixi-spine/runtime-3.7',
            '3.8 @pixi-spine/runtime-3.8',
            '4.1 @pixi-spine/runtime-4.1',
            '4.2 @esotericsoftware/spine-pixi-v7',
            '4.3 @esotericsoftware/spine-pixi-v7',
        ]);
        expect(warnings).toEqual([]);
    });

    it('leaves out a runtime-4.0 it is given, saying why', () => {
        const engine = engineWith({ runtimes: Object.values(stack.pixiSpine) });

        expect(minorsOf(engine)).toEqual(['3.7', '3.8', '4.1']);
        expect(warnings).toEqual([
            'createPixi7Engine leaves @pixi-spine/runtime-4.0@4.0.6 (Spine 4.0) out: it turns chain path ' +
                'constraints wrongly on Pixi 7. runtime-4.1 reads 4.0 JSON after the 4.0 → 4.1 pre-pass; ' +
                'a 4.0 .skel has no reader.',
        ]);
    });

    it('orders them by the minor they read, whatever order they come in', () => {
        const { pixiSpine, esoteric } = stack;
        const engine = engineWith({
            runtimes: [esoteric['4.3'], pixiSpine['4.1'], esoteric['4.2'], pixiSpine['3.8']],
        });

        expect(minorsOf(engine)).toEqual(['3.8', '4.1', '4.2', '4.3']);
    });

    it('turns down a runtime of another Pixi', () => {
        const v8 = lazyRuntime<Pixi7Types>(
            {
                minor: '4.3',
                family: 'esoteric',
                packageName: '@esotericsoftware/spine-pixi-v8',
                packageVersion: '4.3.7',
            },
            () => Promise.reject(new Error('never loaded')),
        );

        expect(() => engineWith({ runtimes: [v8] })).toThrow(
            '@esotericsoftware/spine-pixi-v8@4.3.7 (Spine 4.3) does not run on Pixi 7',
        );
    });

    it("turns down another Pixi's build of a runtime it has", () => {
        const pixi6Build = (runtime: PixiSpineRuntime): PixiSpineRuntime => ({
            ...runtime,
            info: { ...runtime.info, packageVersion: '3.1.2' },
        });

        expect(() => engineWith({ runtimes: [pixi6Build(stack.pixiSpine['3.8'])] })).toThrow(
            '@pixi-spine/runtime-3.8@3.1.2 (Spine 3.8) does not run on Pixi 7',
        );
        expect(() => engineWith({ runtimes: [pixi6Build(stack.pixiSpine['4.0'])] })).toThrow(
            '@pixi-spine/runtime-4.0@3.1.2 (Spine 4.0) does not run on Pixi 7',
        );
        expect(warnings).toEqual([]);
    });

    it('takes the pixi.js 7 namespace a game imports', () => {
        const PIXI: typeof import('pixi.js-v7') = stack.PIXI;

        expect(createPixi7Engine(PIXI, { runtimes: [stack.esoteric['4.3']] }).name).toBe('pixi7');
    });

    it('runs on Pixi 7 alone', () => {
        const pixi6 = Object.create(stack.PIXI, { VERSION: { value: '6.5.10' } });

        expect(() => createPixi7Engine(pixi6, { runtimes: [stack.esoteric['4.3']] })).toThrow(
            'createPixi7Engine: PIXI 6.5.10 is not Pixi 7',
        );
    });

    it('needs one runtime at least, given or on the page', () => {
        expect(() => engineWith({ runtimes: [] })).toThrow(/no Spine runtime for Pixi 7/);
        expect(() => engineWith()).toThrow(/no Spine runtime for Pixi 7/);
    });
});

describe('reading a skeleton', () => {
    let engine: Pixi7Engine;

    beforeAll(() => {
        engine = engineWith({ runtimes: pixi7Runtimes() });
    });

    it.each([
        ['3.7.94', '3.8', '3.7', '@pixi-spine/runtime-3.7'],
        ['3.8.99', '3.8', '3.8', '@pixi-spine/runtime-3.8'],
        ['4.1.24', '3.8', '4.1', '@pixi-spine/runtime-4.1'],
        ['4.2.43', '4.3', '4.2', '@esotericsoftware/spine-pixi-v7'],
        ['4.3.23', '4.3', '4.3', '@esotericsoftware/spine-pixi-v7'],
    ])('reads a %s export with its own runtime, quietly', (version, like, minor, packageName) => {
        const data = read(engine, version, like);
        const spine = engine.spine.create(data);

        expect(engine.spine.runtimeOf(data)).toMatchObject({ minor, packageName });
        expect(engine.spine.runtimeOf(spine)).toBe(engine.spine.runtimeOf(data));
        expect(warnings).toEqual([]);
        spine.destroy();
    });

    it('reads 4.0 JSON with runtime-4.1 after the 4.0 → 4.1 pre-pass, and says so', () => {
        const data = read(engine, '4.0.64', '3.8');

        expect(engine.spine.runtimeOf(data)).toMatchObject({
            minor: '4.1',
            packageName: '@pixi-spine/runtime-4.1',
        });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(
            /^4\.0\.64\.json: Spine 4\.0\.64 read by the 4\.1 runtime after pre-passes 4\.0->4\.1/,
        );
    });

    it('reads no 4.0 .skel, and names where one could be read', () => {
        const skel = new Uint8Array([
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            7,
            ...new TextEncoder().encode('4.0.64'),
        ]);
        const reading = () => engine.spine.readSkeleton(skel, '', {}, { file: 'old.skel' });

        expect(reading).toThrow(UnsupportedSpineVersionError);
        expect(reading).toThrow(
            'old.skel: Spine 4.0.64 — registered runtimes: 3.7 (JSON only), 3.8, 4.1, 4.2, 4.3; Pixi 6 can render it',
        );
    });

    it("reads a minor with the runtime the project's pin names", () => {
        const pinned = engineWith({
            runtimes: [stack.esoteric['4.2'], stack.esoteric['4.3']],
            pin: { '4.2': '4.3' },
        });
        const data = read(pinned, '4.2.43', '4.3');

        expect(pinned.spine.runtimeOf(data)?.minor).toBe('4.3');
        expect(warnings).toEqual([
            expect.stringMatching(
                /^4\.2\.43\.json: Spine 4\.2\.43 cross-read by the 4\.3 runtime, as the project pins over its own 4\.2 runtime/,
            ),
        ]);
    });
});

describe('reading from the asset cache', () => {
    let engine: Pixi7Engine;

    beforeAll(() => {
        engine = engineWith({ runtimes: pixi7Runtimes() });
    });

    it.each([
        ['3.8.99', '3.8', '3.8'],
        ['4.0.64', '3.8', '4.1'],
        ['4.1.24', '3.8', '4.1'],
        ['4.2.43', '4.3', '4.2'],
        ['4.3.23', '4.3', '4.3'],
    ])('reads a %s export and its atlas text with its runtime', (version, like, minor) => {
        const name = `text-${version}`;
        cacheExport(name, exportOf(version, like));

        const data = engine.spine.readSkeletonFromAssets(`${name}.json`, `${name}.atlas`);
        const spine = engine.spine.create(data);

        expect(engine.spine.runtimeOf(spine)?.minor).toBe(minor);
        expect(warnings).toEqual(
            version === '4.0.64'
                ? [
                      expect.stringMatching(
                          /^text-4\.0\.64\.json: Spine 4\.0\.64 read by the 4\.1 runtime after pre-passes/,
                      ),
                  ]
                : [],
        );
        spine.destroy();
    });

    it("reads an atlas spine-pixi-v7's loader parsed with the Esoteric runtime its export picks", () => {
        const { skeleton, atlasText } = exportOf('4.3.23');
        cache('parsed.json', skeleton);
        cache('parsed.atlas', parsedAtlas(atlasText));

        const data = engine.spine.readSkeletonFromAssets('parsed.json', 'parsed.atlas');
        const spine = engine.spine.create(data);

        expect(engine.spine.runtimeOf(spine)?.minor).toBe('4.3');
        expect(warnings).toEqual([]);
        spine.destroy();
    });

    it('reads a parsed atlas with a lazy Esoteric runtime once it is prepared', async () => {
        const lazy = engineWith({
            runtimes: [
                stack.pixiSpine['3.8'],
                Object.assign(async () => stack.esoteric['4.3'], stack.esoteric['4.3'].info),
            ],
        });
        const { skeleton, atlasText } = exportOf('4.3.23');
        cache('lazy43.json', skeleton);
        cache('lazy43.atlas', parsedAtlas(atlasText));

        expect(() => lazy.spine.readSkeletonFromAssets('lazy43.json', 'lazy43.atlas')).toThrow(
            "The Spine 4.3 runtime has not loaded: await prepare(['4.3']) first",
        );

        await lazy.spine.prepare!(['4.3']);
        const data = lazy.spine.readSkeletonFromAssets('lazy43.json', 'lazy43.atlas');

        expect(lazy.spine.runtimeOf(data)?.minor).toBe('4.3');
    });

    it('reads no parsed atlas with pixi-spine, and says how to load it as text', () => {
        const { skeleton, atlasText } = exportOf('3.8.99');
        cache('parsed38.json', skeleton);
        cache('parsed38.atlas', parsedAtlas(atlasText));

        expect(() =>
            engine.spine.readSkeletonFromAssets('parsed38.json', 'parsed38.atlas'),
        ).toThrow(
            `parsed38.json: the Spine 3.8 runtime reads atlas text, and an Assets loader parsed "parsed38.atlas": load it with \`loadParser: 'loadTxt'\``,
        );
    });

    it("hands back what pixi-spine's own Assets loader read, by a runtime of its own", () => {
        const spineData = read(engine, '3.8.99');
        const single = engineWith({ runtimes: [stack.pixiSpine['4.1']] });
        const ofSingle = read(single, '4.1.24', '3.8');

        cache('loaded38.json', { spineData, spineAtlas: {} });
        cache('loaded41.json', { spineData: ofSingle, spineAtlas: {} });

        expect(single.spine.readSkeletonFromAssets('loaded41.json', 'loaded41.atlas')).toBe(
            ofSingle,
        );
        expect(engine.spine.readSkeletonFromAssets('loaded38.json', 'loaded38.atlas')).toBe(
            spineData,
        );
        expect(() => single.spine.readSkeletonFromAssets('loaded38.json')).toThrow(
            '"loaded38.json" was read by a Spine runtime this engine does not have',
        );
    });

    it("reads with the project's pin on an engine of one runtime, and says so once", () => {
        const pinned = engineWith({ runtimes: [stack.esoteric['4.3']], pin: { '4.2': '4.3' } });
        const { skeleton, atlasText } = exportOf('4.2.43', '4.3');
        cache('pinned.json', skeleton);
        cache('pinned.atlas', parsedAtlas(atlasText));

        const data = pinned.spine.readSkeletonFromAssets('pinned.json', 'pinned.atlas');

        expect(pinned.spine.runtimeOf(data)?.minor).toBe('4.3');
        expect(warnings).toEqual([
            expect.stringMatching(
                /^pinned\.json: Spine 4\.2\.43 cross-read by the 4\.3 runtime, as the project pins/,
            ),
        ]);
    });

    it('reads with a lazy pixi-spine runtime once it is prepared', async () => {
        const lazy = engineWith({
            runtimes: [
                Object.assign(async () => stack.pixiSpine['4.1'], stack.pixiSpine['4.1'].info),
            ],
        });
        cacheExport('lazy41', exportOf('4.1.24', '3.8'));

        expect(() => lazy.spine.readSkeletonFromAssets('lazy41.json', 'lazy41.atlas')).toThrow(
            "The Spine 4.1 runtime has not loaded: await prepare(['4.1']) first",
        );

        await lazy.spine.prepare!(['4.1']);
        const data = lazy.spine.readSkeletonFromAssets('lazy41.json', 'lazy41.atlas');

        expect(lazy.spine.runtimeOf(data)?.minor).toBe('4.1');
    });

    it.each([
        ['nothing', () => {}, 'No skeleton loaded as "missing.json"'],
        [
            'texts.json',
            () => cache('missing.json', { en: { title: 'Hi' } }),
            '"missing.json" is not a skeleton export (another loader parsed it)',
        ],
        [
            'no atlas',
            () => cache('missing.json', exportOf('4.3.23').skeleton),
            'No atlas loaded as "missing.atlas"',
        ],
    ])('says what is missing: %s', (_, setUp, message) => {
        setUp();

        expect(() => engine.spine.readSkeletonFromAssets('missing.json', 'missing.atlas')).toThrow(
            message,
        );
    });
});

describe('runtimes loaded on demand', () => {
    it('loads each once a skeleton needs it, and binds what it loads', async () => {
        const { PIXI, esoteric, pixiSpine } = stack;
        const loads: string[] = [];
        const lazy = <R>(minor: string, loaded: () => R) =>
            Object.assign(
                async () => {
                    loads.push(minor);
                    return loaded();
                },
                {
                    minor,
                    family: minor === '4.1' ? 'pixi-spine-modular' : 'esoteric',
                    packageName:
                        minor === '4.1'
                            ? '@pixi-spine/runtime-4.1'
                            : '@esotericsoftware/spine-pixi-v7',
                    packageVersion: minor === '4.1' ? '4.0.6' : `${minor}.x`,
                },
            );

        const engine = engineWith({
            runtimes: [
                pixiSpine['3.8'],
                lazy('4.1', () => pixiSpine['4.1']),
                lazy('4.2', () => esotericAdapter<Pixi7Types>(esoteric['4.2'], PIXI)),
                lazy('4.3', () => esoteric['4.3']),
            ],
        });

        expect(engine.spine.prepare).toBeTypeOf('function');
        expect(() => read(engine, '4.3.23')).toThrow(/has not loaded: await prepare\(\['4\.3'\]\)/);

        await Promise.all([
            engine.spine.prepare!(['4.3', '4.1']),
            engine.spine.prepare!(['4.3', '4.2', '3.8']),
        ]);

        expect(loads.sort()).toEqual(['4.1', '4.2', '4.3']);
        expect(engine.spine.runtimes.map(({ packageVersion }) => packageVersion)).toEqual([
            '4.0.6',
            '4.0.6',
            '4.2.120',
            '4.3.13',
        ]);
        [
            ['3.8.99', '3.8'],
            ['4.1.24', '3.8'],
            ['4.2.43', '4.3'],
            ['4.3.23', '4.3'],
        ].forEach(([version, like]) => {
            const data = read(engine, version, like);
            const spine = engine.spine.create(data);

            expect(engine.spine.runtimeOf(spine)?.minor).toBe(version.slice(0, 3));
            spine.destroy();
        });
    });

    it('turns down one that loads a runtime of another Pixi, before binding it', async () => {
        const v8 = esotericRuntime((await import('@esotericsoftware/spine-pixi-v8')) as Loaded);
        const add = vi.spyOn(stack.PIXI.extensions, 'add');
        const engine = engineWith({
            runtimes: [
                stack.pixiSpine['3.8'],
                Object.assign(async () => v8, stack.esoteric['4.3'].info),
            ],
        });

        await expect(engine.spine.prepare!(['4.3'])).rejects.toThrow(
            '@esotericsoftware/spine-pixi-v8@4.3.x (Spine 4.3) does not run on Pixi 7',
        );
        expect(add).not.toHaveBeenCalled();
        expect(engine.spine.runtimes.map(({ packageName }) => packageName)).toEqual([
            '@pixi-spine/runtime-3.8',
            '@esotericsoftware/spine-pixi-v7',
        ]);
        add.mockRestore();
    });
});

describe('the rest of the engine', () => {
    it("is Pixi 7's, on its own Container", () => {
        const engine = engineWith({ runtimes: [stack.esoteric['4.3']] });

        expect(engine.name).toBe('pixi7');
        expect(engine.containerClass).toBe(stack.PIXI.Container);
        expect(engine.display.container()).toBeInstanceOf(stack.PIXI.Container);
    });

    it('takes @pixi/particle-emitter from its option or from PIXI.particles', () => {
        const runtimes = [stack.esoteric['4.3']];
        const withParticles = Object.create(stack.PIXI, { particles: { value: stack.particles } });

        expect(engineWith({ runtimes }).particles).toBeUndefined();
        expect(engineWith({ runtimes, particles: stack.particles }).particles).toBeDefined();
        expect(createPixi7Engine(withParticles, { runtimes }).particles).toBeDefined();
    });

    it('asks for no Loader or interaction manager: Pixi 7 has neither', () => {
        const runtimes = [stack.esoteric['4.3']];

        // @ts-expect-error Pixi 7 has no Loader
        expect(engineWith({ runtimes, loaders: [] }).name).toBe('pixi7');
        // @ts-expect-error Pixi 7 moves pointers through federated events
        expect(engineWith({ runtimes, renderer: { plugins: {} } }).name).toBe('pixi7');
    });
});

describe('SpineLayoutCore on it', () => {
    /** A 4.3 root whose slots embed a 3.8, a 4.1 and a 4.2 skeleton. */
    function scene() {
        const root = exportOf('4.3.23');
        const slots = (root.skeleton as unknown as { slots: object[] }).slots;
        slots.push(
            ...['alpha', 'beta', 'gamma'].map((id) => ({ name: `spine_${id}`, bone: 'root' })),
        );

        return [
            { name: 'root', ...root },
            { name: 'alpha', ...exportOf('3.8.99') },
            { name: 'beta', ...exportOf('4.1.24', '3.8') },
            { name: 'gamma', ...exportOf('4.2.43', '4.3') },
        ];
    }

    type Layout = SpineLayoutCore<Pixi7Types>;

    const fromData = (layout: Layout) =>
        layout.loadInstancesFromDataArray(
            scene().map((item) => ({ ...item, textures: { 'contract.png': page } })),
        );

    function fromManifest(layout: Layout) {
        const files = scene().flatMap(({ name, ...item }) => cacheExport(name, item));
        const assets = files.map((file) => ({ alias: [file], src: file }));

        return layout.loadInstancesFromManifest({ bundles: [{ name: 'spines', assets }] });
    }

    describe.each([
        ['raw data', fromData],
        ['a manifest', fromManifest],
    ])('built from %s', (_, build) => {
        it.each([
            ['given every runtime', pixi7Runtimes],
            [
                'loading 4.2 and 4.3 on demand',
                () => [
                    stack.pixiSpine['3.8'],
                    stack.pixiSpine['4.1'],
                    lazyRuntime(stack.esoteric['4.2'].info, async () =>
                        esotericAdapter<Pixi7Types>(stack.esoteric['4.2'], stack.PIXI),
                    ),
                    Object.assign(async () => stack.esoteric['4.3'], stack.esoteric['4.3'].info),
                ],
            ],
        ])('holds a scene of every family, %s', async (_, runtimes) => {
            const engine = engineWith({ runtimes: runtimes() });
            const layout = new SpineLayoutCore<Pixi7Types>({ engine });
            const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

            await build(layout);
            const logged = errors.mock.calls.slice();
            errors.mockRestore();

            const minors = Object.fromEntries(
                [...layout.spines].map(([id, spine]) => [id, engine.spine.runtimeOf(spine)?.minor]),
            );
            const ancestors = (view: ContainerLike) => {
                const chain: ContainerLike[] = [];
                for (let at = view.parent; at; at = at.parent) chain.push(at);
                return chain;
            };
            const root = layout.spines.get('root')!;

            expect(logged).toEqual([]);
            expect(layout).toBeInstanceOf(stack.PIXI.Container);
            expect(minors).toEqual({ root: '4.3', alpha: '3.8', beta: '4.1', gamma: '4.2' });
            ['alpha', 'beta', 'gamma'].forEach((id) =>
                expect(ancestors(layout.spines.get(id)!)).toContain(root),
            );
            expect(warnings).toEqual([]);
            layout.reset();
        });
    });

    it('loads its lazy runtimes, builds what they read, and skips an export none reads', async () => {
        const engine = engineWith({
            runtimes: [
                stack.pixiSpine['3.8'],
                Object.assign(async () => stack.esoteric['4.3'], stack.esoteric['4.3'].info),
            ],
        });
        const layout = new SpineLayoutCore<Pixi7Types>({ engine });
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const root = exportOf('4.3.23');
        (root.skeleton as unknown as { slots: object[] }).slots.push(
            ...['alpha', 'beta'].map((id) => ({ name: `spine_${id}`, bone: 'root' })),
        );
        const textures = { 'contract.png': page };

        await expect(
            layout.loadInstancesFromDataArray([
                { name: 'root', ...root, textures },
                { name: 'alpha', ...exportOf('3.8.99'), textures },
                { name: 'beta', ...exportOf('3.6.53', '3.8'), textures },
            ]),
        ).resolves.toBeUndefined();
        const logged = errors.mock.calls.slice();
        errors.mockRestore();

        expect([...layout.spines.keys()]).toEqual(['root', 'alpha']);
        expect(logged).toEqual([
            ['[SpineLayout] Error loading spine "beta":', expect.any(UnsupportedSpineVersionError)],
        ]);
        layout.reset();
    });

    it('is drawn with its spines when the stage renders', async () => {
        const engine = engineWith({ runtimes: pixi7Runtimes() });
        const layout = new SpineLayoutCore<Pixi7Types>({ engine });
        await fromData(layout);

        const stage = new stack.PIXI.Container();
        const renderer = {};
        const drawn: unknown[] = [];
        const root = layout.spines.get('root') as Loaded;

        stage.addChild(layout);
        updateTransforms(stage);
        root.render = (by: unknown) => void drawn.push(by);
        stage.render(renderer);
        layout.reset();

        expect(drawn).toEqual([renderer]);
    });
});
