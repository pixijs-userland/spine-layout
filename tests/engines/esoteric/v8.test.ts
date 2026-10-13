// @vitest-environment happy-dom
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import * as PIXI from 'pixi.js';
import 'pixi.js/events';
import {
    Assets,
    CanvasRenderer,
    Cache,
    Container,
    EventBoundary,
    Rectangle,
    RendererType,
    Texture,
    TextureSource,
    Ticker,
    WebGLRenderer,
    WebGPURenderer,
} from 'pixi.js';
import * as SP42 from 'spine-pixi-v8-42';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimePin } from '../../../src/core/versions/pickRuntime';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import type { SkeletonDataLike } from '../../../src/engine/runtime';
import {
    coreShimFor,
    createCore42,
    createEsotericSpinePort,
    createV8Display,
    deferSpinePipe,
    ensureSpinePipe,
    esotericRuntime,
    pruneDuplicateSpineLoaders,
    registerSpinePipe,
    type EsotericMinor,
    type EsotericModule,
    type PixiV8Like,
    type SpinePipeLike,
} from '../../../src/engines/esoteric';
import {
    claimNames,
    constraintsOf,
    esotericPortSuite,
    RIG_ATLAS,
    RIGS,
    type Loaded,
} from './harness';

Ticker.shared.autoStart = false;
Ticker.shared.stop();

const MODULES: Record<string, { SP: EsotericModule; version: string }> = {
    '4.2': { SP: SP42, version: '4.2.120' },
    '4.3': { SP: SP43, version: '4.3.7' },
};

const page = (width: number, height: number) =>
    new Texture({ source: new TextureSource({ width, height, resolution: 1 }) });

function atlasOf(SP: EsotericModule) {
    const { TextureAtlas, SpineTexture } = SP as unknown as {
        TextureAtlas: new (text: string) => { pages: { setTexture(texture: unknown): void }[] };
        SpineTexture: { from(source: TextureSource): unknown };
    };
    const atlas = new TextureAtlas(RIG_ATLAS);
    atlas.pages.forEach((own) => own.setTexture(SpineTexture.from(page(64, 64).source)));
    return atlas;
}

interface StartedRenderer {
    renderPipes: Record<string, unknown>;
}

interface StartingRenderer extends StartedRenderer {
    config: { systems: unknown; renderPipes: unknown; renderPipeAdaptors: unknown };
    _addSystems(systems: unknown): void;
    _addPipes(pipes: unknown, adaptors: unknown): void;
}

/** A renderer as `init()` leaves it, its pipes built from what is registered now. */
function started(): StartedRenderer {
    const renderer = new WebGLRenderer() as unknown as StartingRenderer;
    renderer._addSystems(renderer.config.systems);
    renderer._addPipes(renderer.config.renderPipes, renderer.config.renderPipeAdaptors);
    return renderer;
}

// what an engine does when it starts with 4.3 bundled and 4.2 still to load
const deferred42 = deferSpinePipe(PIXI, '4.2');
const rendererBefore42 = started();

function portOf(
    minor: string,
    options: { pin?: RuntimePin; warn?: (message: string) => void } = {},
) {
    const { SP, version } = MODULES[minor];
    const runtime = esotericRuntime(SP, version);
    const port = createEsotericSpinePort({
        SP: runtime.module,
        core: coreShimFor(runtime.module),
        display: createV8Display(runtime.module, PIXI),
        runtime: runtime.info,
        ...options,
    });

    return { runtime, port };
}

function load(minor: string, other: string): () => Loaded {
    return () => {
        const { runtime, port } = portOf(minor);
        const name = `v8 + ${minor}`;

        if (!Cache.has(`rig-${name}`)) {
            Cache.set(`rig-${name}`, structuredClone(RIGS[minor]));
            Cache.set(`atlas-${name}`, atlasOf(MODULES[other].SP));
        }

        return {
            runtime,
            port,
            page,
            samePage: (a, b) => (a as Texture).source === (b as Texture).source,
            container: () => new Container(),
            aliases: { skeleton: `rig-${name}`, atlas: `atlas-${name}` },
            store: (alias, value) => Cache.set(alias, value),
            tick: (ms) => Ticker.shared.update(Ticker.shared.lastTime + ms),
            render: () => {},
        };
    };
}

describe('spine-pixi-v8 loaders', () => {
    it('drops the second runtime’s loaders as it is set up, and pixi’s conflict warnings', () => {
        const ids = () =>
            Assets.loader.parsers
                .map((parser) => parser.id ?? parser.name)
                .filter((id) => /^spine/.test(id ?? ''));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const validate = () =>
            (Assets.loader as unknown as { _validateParsers(): void })._validateParsers();

        expect(ids()).toEqual([
            'spineTextureAtlasLoader',
            'spineSkeletonLoader',
            'spineTextureAtlasLoader',
            'spineSkeletonLoader',
        ]);
        validate();
        expect(warn.mock.calls.flat().join(' ')).toMatch(/parser id conflict/);
        warn.mockClear();

        createV8Display(SP43, PIXI);
        validate();

        expect(ids()).toEqual(['spineTextureAtlasLoader', 'spineSkeletonLoader']);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('names the loaders it drops, keeping the first of each', () => {
        const first = { id: 'spineSkeletonLoader' };
        const parsers = [
            first,
            { name: 'loadJson' },
            { id: 'spineTextureAtlasLoader' },
            { id: 'spineSkeletonLoader' },
            { name: 'spineTextureAtlasLoader' },
        ];

        expect(pruneDuplicateSpineLoaders({ get: () => undefined, loader: { parsers } })).toEqual([
            'spineSkeletonLoader',
            'spineTextureAtlasLoader',
        ]);
        expect(parsers).toEqual([first, { name: 'loadJson' }, { id: 'spineTextureAtlasLoader' }]);
    });
});

esotericPortSuite('v8 + 4.2', load('4.2', '4.3'));
esotericPortSuite('v8 + 4.3', load('4.3', '4.2'));

describe('spine-pixi-v8 4.2 and 4.3 in one page', () => {
    type Config = { config: { renderPipes: { name: string; value: unknown }[] } };
    const renderPipesOf = (renderer: object) =>
        new Map((renderer as Config).config.renderPipes.map(({ name, value }) => [name, value]));

    it.each([
        ['WebGL', () => new WebGLRenderer()],
        ['WebGPU', () => new WebGPURenderer()],
        ['Canvas', () => new CanvasRenderer()],
    ])('gives each runtime a pipe of its own on %s, leaving pixi’s “spine” alone', (_, make) => {
        portOf('4.2');
        portOf('4.3');
        const pipes = renderPipesOf(make());
        const pipe43 = pipes.get('spine-4.3') as typeof SP43.SpinePipe;

        expect(pipes.get('spine')).toBe(SP43.SpinePipe);
        expect(pipe43).not.toBe(SP43.SpinePipe);
        expect(pipe43.prototype).toBeInstanceOf(SP43.SpinePipe);
        expect((pipes.get('spine-4.2') as { name: string }).name).toBe('DeferredSpinePipe');
    });

    it('hands the 4.2 pipe a renderer built before 4.2 loaded its runtime, once it has', () => {
        type Pipe = SpinePipeLike & { gpuSpineData?: object };
        const pipe = rendererBefore42.renderPipes[deferred42] as Pipe;

        expect(deferred42).toBe('spine-4.2');
        expect(pipe.constructor.name).toBe('DeferredSpinePipe');
        expect(rendererBefore42.renderPipes['spine-4.3']).toBeUndefined();

        const { port } = portOf('4.2');
        const spine = port.create(
            port.readSkeleton(RIGS['4.2'], RIG_ATLAS, { 'rig.png': page(64, 64) }),
        );

        expect(rendererBefore42.renderPipes[deferred42]).toBe(pipe);
        expect(pipe.validateRenderable(spine)).toBe(true);
        expect(pipe.gpuSpineData).toEqual({});
        spine.destroy();
    });

    it('lets a click through a shielded skeleton to the button behind it', () => {
        const { port } = portOf('4.2');
        const stage = new Container({ eventMode: 'static' });
        const button = new Container({ eventMode: 'static' });
        const spine = port.create(
            port.readSkeleton(RIGS['4.2'], RIG_ATLAS, { 'rig.png': page(64, 64) }),
        );
        const hit = () => new EventBoundary(stage).hitTest(0, 0);

        button.hitArea = new Rectangle(-50, -50, 100, 100);
        stage.addChild(button, spine as unknown as Container);
        port.update(spine, 0);

        expect(hit()).toBe(stage);
        port.shieldShapes(spine);
        expect(hit()).toBe(button);
        port.exposeShapes(spine);
        expect(hit()).toBe(stage);
        spine.destroy();
    });

    it('names that pipe on every spine it creates', () => {
        for (const minor of ['4.2', '4.3']) {
            const { port } = portOf(minor);
            const spine = port.create(
                port.readSkeleton(RIGS[minor], RIG_ATLAS, { 'rig.png': page(64, 64) }),
            ) as unknown as { renderPipeId: string; destroy(): void };

            expect(spine.renderPipeId).toBe(`spine-${minor}`);
            spine.destroy();
        }
    });

    it('routes nothing across: each port owns only its own runtime’s objects', () => {
        const ports = ['4.2', '4.3'].map((minor) => ({ minor, ...portOf(minor) }));
        const data = ports.map(({ minor, port }) =>
            port.readSkeleton(RIGS[minor], RIG_ATLAS, { 'rig.png': page(64, 64) }),
        );

        ports.forEach(({ port, runtime }, i) => {
            expect(port.runtimeOf(data[i])).toBe(runtime.info);
            expect(port.runtimeOf(data[1 - i])).toBeUndefined();
        });
    });

    it('keeps each runtime’s cached read under a key of its own', () => {
        Cache.set('shared-skeleton', {
            skeleton: { spine: '4.2.0' },
            bones: [{ name: 'root' }],
            slots: [],
            skins: [],
        });
        Cache.set('shared-atlas', atlasOf(SP43));

        const pin = { '4.2': '4.3' };
        const [data42, data43] = ['4.2', '4.3'].map((minor) =>
            portOf(minor, { pin, warn: () => {} }).port.readSkeletonFromAssets(
                'shared-skeleton',
                'shared-atlas',
            ),
        );

        expect(data42).toBeInstanceOf(SP42.SkeletonData);
        expect(data43).toBeInstanceOf(SP43.SkeletonData);
        expect(Cache.get('shared-skeleton-shared-atlas-1@4.2')).toBe(data42);
        expect(Cache.get('shared-skeleton-shared-atlas-1@4.3')).toBe(data43);
        expect(Cache.has('shared-skeleton-shared-atlas-1')).toBe(false);
    });

    it.each([
        ['4.2', '4.3'],
        ['4.3', '4.2'],
    ])('reads a %s mesh against a %s-parsed atlas with its own UVs', (minor, other) => {
        type Mesh = { region?: unknown; uvs?: ArrayLike<number>; sequence?: Sequence };
        type Sequence = { regions: unknown[]; uvs: ArrayLike<number>[] };
        const { port } = portOf(minor);
        const own = MODULES[minor].SP as unknown as { TextureAtlasRegion: typeof Object };
        const meshOf = (data: SkeletonDataLike) => {
            const skin = data.defaultSkin as unknown as {
                getAttachment(slot: number, name: string): Mesh;
            };
            return skin.getAttachment(data.findSlot('mesh')!.index, 'quad');
        };
        const regionOf = (mesh: Mesh) => mesh.region ?? mesh.sequence!.regions[0];
        const uvsOf = (mesh: Mesh) => Array.from(mesh.sequence?.uvs[0] ?? mesh.uvs!);

        const alias = `cross-${minor}`;
        Cache.set(`${alias}-skeleton`, structuredClone(RIGS[minor]));
        Cache.set(`${alias}-atlas`, atlasOf(MODULES[other].SP));

        const native = meshOf(
            port.readSkeleton(RIGS[minor], RIG_ATLAS, { 'rig.png': page(64, 64) }),
        );
        const adopted = meshOf(port.readSkeletonFromAssets(`${alias}-skeleton`, `${alias}-atlas`));
        const foreign = meshOf(
            readWith(MODULES[minor].SP, structuredClone(RIGS[minor]), atlasOf(MODULES[other].SP)),
        );

        expect(regionOf(adopted)).toBeInstanceOf(own.TextureAtlasRegion);
        expect(uvsOf(adopted)).toEqual(uvsOf(native));
        expect(uvsOf(foreign)).not.toEqual(uvsOf(native));
    });

    it('loses the 4.2 IK constraint where a pin has the 4.3 runtime read that export', () => {
        const rig = structuredClone(RIGS['4.2']) as Record<string, unknown>;
        delete rig.animations;
        const warnings: string[] = [];
        const { port } = portOf('4.3', {
            pin: { '4.2': '4.3' },
            warn: (message) => warnings.push(message),
        });
        const spine = port.create(port.readSkeleton(rig, RIG_ATLAS, { 'rig.png': page(64, 64) }));
        const hand = port.bonePose(spine.skeleton.findBone('hand')!);

        port.updateWorldTransform(spine.skeleton);

        expect(warnings).toEqual([
            expect.stringMatching(/4\.2\.43 cross-read by the 4\.3 runtime, as the project pins/),
        ]);
        expect(constraintsOf(spine.skeleton.data)).toEqual([]);
        expect([hand.worldX, hand.worldY + 0]).toEqual([100, 0]);
        spine.destroy();
    });

    it('reads one export the same with either runtime’s claims, named', () => {
        const [claims42, claims43] = ['4.2', '4.3'].map((minor) => {
            const { port, runtime } = portOf(minor);
            const data = port.readSkeleton(RIGS[minor], RIG_ATLAS, { 'rig.png': page(64, 64) });
            return data.animations.map((animation) =>
                claimNames(port, runtime.module, data, animation.name),
            );
        });

        expect(claims42).toEqual(claims43);
    });
});

describe('reading exports of other minors', () => {
    const relabelled = (minor: string, version: string) => {
        const rig = structuredClone(RIGS[minor]) as { skeleton: { spine: string } };
        rig.skeleton.spine = version;
        return rig;
    };
    const read = (port: ReturnType<typeof portOf>['port'], skeleton: object) =>
        port.readSkeleton(skeleton, RIG_ATLAS, { 'rig.png': page(64, 64) });

    it.each([
        ['4.3', '4.2.43', [7, 8]],
        ['4.3', '4.1.24', [6, 7, 8]],
        ['4.3', '3.8.99', [4, 5, 6, 7]],
        ['4.2', '4.3.23', [7, 8]],
        ['4.2', '3.8.99', [4, 5, 6, 7]],
    ])(
        'refuses on the %s runtime a %s export, naming the Pixi that renders it',
        (minor, version, pixi) => {
            const { port } = portOf(minor);
            let error: unknown;

            try {
                read(port, relabelled(minor, version));
            } catch (thrown) {
                error = thrown;
            }

            expect(error).toBeInstanceOf(UnsupportedSpineVersionError);
            expect(error).toMatchObject({ version, registered: [minor], pixiMajors: pixi });
        },
    );

    it('reads a 4.1 export with the 4.2 runtime after its pre-pass, and says so', () => {
        const { Inherit } = SP42 as unknown as { Inherit: Record<string, number> };
        const rig = relabelled('4.2', '4.1.24') as unknown as { bones: Record<string, unknown>[] };
        rig.bones.find((bone) => bone.name === 'flag')!.transform = 'noScale';
        const warnings: string[] = [];
        const { port } = portOf('4.2', { warn: (message) => warnings.push(message) });

        const data = read(port, rig);

        expect(data.findBone('flag')).toMatchObject({ inherit: Inherit.NoScale });
        expect(warnings).toEqual([
            expect.stringMatching(/4\.1\.24 read by the 4\.2 runtime .*4\.1->4\.2/),
        ]);
    });
});

describe('spine-core 4.3 slots a constraint poses', () => {
    type Slot43 = {
        pose: { color: { a: number } };
        appliedPose: { attachment: unknown; color: { a: number }; sequenceIndex: number };
        resetConstrained(): void;
        constrained(): void;
    };

    // what a 4.3 slider leaves a slot in: drawn from a pose of its own, not from `pose`
    const constrained = (slot: unknown) => {
        const target = slot as Slot43;
        target.resetConstrained();
        target.constrained();
        return target;
    };

    it('reads the attachment and alpha the slot is drawn with', () => {
        const { port } = portOf('4.3');
        const spine = port.create(read43(port));
        const slot = spine.skeleton.findSlot('body')!;
        const applied = constrained(slot).appliedPose;

        applied.color.a = 0.25;
        applied.attachment = null;

        expect(port.slotAlpha(slot)).toBe(0.25);
        expect(port.slotAttachment(slot)).toBeNull();
        expect((slot as unknown as Slot43).pose.color.a).toBe(1);
        spine.destroy();
    });

    it('outlines a sequence by the frame the slot is drawn with, as it cuts it', () => {
        const trimmed = RIG_ATLAS.replace(
            'seq2\nbounds: 10,20,30,40\n',
            'seq2\nbounds: 10,20,30,40\noffsets: 5,0,40,40\n',
        );
        const { port } = portOf('4.3');
        const spine = port.create(read43(port, trimmed));
        const slot = spine.skeleton.findSlot('seq')!;
        const attachment = port.slotAttachment(slot);

        constrained(slot).appliedPose.sequenceIndex = 1;

        expect(port.regionTexture(attachment, slot)).toMatchObject({ x: 10, width: 30 });
        expect(port.hitPolygon(slot, attachment)).toEqual([
            -11.25, 20, -11.25, -20, 11.25, -20, 11.25, 20,
        ]);
        spine.destroy();
    });

    function read43(port: ReturnType<typeof portOf>['port'], atlas = RIG_ATLAS) {
        return port.readSkeleton(RIGS['4.3'], atlas, { 'rig.png': page(64, 64) });
    }
});

function readWith(SP: EsotericModule, json: object, atlas: object): SkeletonDataLike {
    const { SkeletonJson, AtlasAttachmentLoader } = SP as unknown as {
        SkeletonJson: new (loader: unknown) => { readSkeletonData(json: object): SkeletonDataLike };
        AtlasAttachmentLoader: new (atlas: object) => unknown;
    };
    return new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json);
}

describe('registering pipes', () => {
    const fakePixi = () => {
        const added: (new (renderer: unknown) => SpinePipeLike)[] = [];
        const pixi: PixiV8Like = {
            ...PIXI,
            extensions: { add: (extension: object) => added.push(extension as never) },
        };
        return { pixi, added };
    };

    it('adds a renamed subclass of the runtime’s own pipe, once', () => {
        const { pixi, added } = fakePixi();

        expect(registerSpinePipe(pixi, SP42)).toBe('spine-4.2');
        expect(registerSpinePipe(pixi, SP42)).toBe('spine-4.2');
        expect(added).toHaveLength(1);
        expect(added[0].prototype).toBeInstanceOf(SP42.SpinePipe);
        expect((added[0] as unknown as typeof SP42.SpinePipe).extension).toEqual({
            ...SP42.SpinePipe.extension,
            name: 'spine-4.2',
        });
    });

    it('refuses a second module for a minor that already renders', () => {
        const { pixi } = fakePixi();
        registerSpinePipe(pixi, SP43);

        expect(() => registerSpinePipe(pixi, { ...SP43 })).toThrow(/already renders/);
    });

    it('hands a deferred pipe its runtime instead of adding another', () => {
        const { pixi, added } = fakePixi();
        const id = deferSpinePipe(pixi, '4.2');
        const pipe = new added[0]({ type: RendererType.CANVAS });

        expect(() => pipe.validateRenderable({})).toThrow(/spine-4.2: its Spine runtime has not/);
        expect((pipe as { gpuSpineData?: object }).gpuSpineData).toBeUndefined();

        expect(registerSpinePipe(pixi, SP42)).toBe(id);
        expect(added).toHaveLength(1);
        expect(pipe.validateRenderable({})).toBe(true);
        expect((pipe as { gpuSpineData?: object }).gpuSpineData).toEqual({});
        expect(() => pipe.destroy()).not.toThrow();
    });

    it('reserves a pipe by the minor of the version it is given, of 4.2 and 4.3 alone', () => {
        const { pixi, added } = fakePixi();

        expect(deferSpinePipe(pixi, '4.2.120' as EsotericMinor)).toBe('spine-4.2');
        expect(registerSpinePipe(pixi, SP42)).toBe('spine-4.2');
        expect(added).toHaveLength(1);
        expect(() => deferSpinePipe(pixi, '4.1' as EsotericMinor)).toThrow(
            'spine-pixi-v8 has no runtime for Spine 4.1, only 4.2 and 4.3',
        );
    });

    it('builds a registered pipe into a renderer that started without it, once', () => {
        const { pixi, added } = fakePixi();
        const id = registerSpinePipe(pixi, SP42);
        const renderer = {
            renderPipes: {} as Record<string, unknown>,
            _addPipes: vi.fn((pipes: { name: string; value: unknown }[]) =>
                pipes.forEach(({ name }) => (renderer.renderPipes[name] = {})),
            ),
        };

        ensureSpinePipe(pixi, renderer, id);
        ensureSpinePipe(pixi, renderer, id);

        expect(renderer._addPipes).toHaveBeenCalledTimes(1);
        expect(renderer._addPipes).toHaveBeenCalledWith([{ name: id, value: added[0] }], []);
        expect(() => ensureSpinePipe(pixi, { renderPipes: {} }, id)).toThrow(
            'spine-4.2 was registered after this renderer started: create the engine before the renderer',
        );
        expect(() => ensureSpinePipe(pixi, renderer, 'spine-4.3')).toThrow(
            'spine-4.3 is not a registered render pipe',
        );
    });

    it('knows only spine-pixi-v8 modules', () => {
        const { pixi } = fakePixi();
        const noPipe = Object.fromEntries(
            Object.entries(SP43).filter(([key]) => key !== 'SpinePipe'),
        ) as unknown as EsotericModule;

        expect(() => registerSpinePipe(pixi, noPipe)).toThrow(/no SpinePipe/);
    });
});

describe('esotericRuntime on spine-pixi-v8', () => {
    it('reads the Pixi and the spine-core minor off the module', () => {
        expect(esotericRuntime(SP42)).toMatchObject({
            family: 'esoteric',
            pixi: 8,
            minor: '4.2',
            module: SP42,
            info: {
                minor: '4.2',
                family: 'esoteric',
                packageName: '@esotericsoftware/spine-pixi-v8',
                packageVersion: '4.2.120',
            },
        });
        expect(esotericRuntime(SP43).info.packageVersion).toBe('4.3.x');
    });

    it('logs the version it is given, and refuses one the module does not read', () => {
        expect(esotericRuntime(SP43, '4.3.7').info.packageVersion).toBe('4.3.7');
        expect(esotericRuntime(SP43, '4.3').info.packageVersion).toBe('4.3.x');
        expect(() => esotericRuntime(SP43, '4.2.120')).toThrow(/reads Spine 4\.3, not 4\.2\.120/);
    });

    it('refuses a port that reports another minor than its core', () => {
        const runtime = esotericRuntime(SP42);

        expect(() =>
            createEsotericSpinePort({
                SP: SP42,
                core: coreShimFor(SP42),
                display: createV8Display(SP42, PIXI),
                runtime: { ...runtime.info, minor: '4.3' },
            }),
        ).toThrow(/Spine 4\.2 runtime cannot report itself as 4\.3/);
    });

    it('refuses a core or a display of another module than its own', () => {
        const parts =
            (core: ReturnType<typeof coreShimFor>, display = createV8Display(SP43, PIXI)) =>
            () =>
                createEsotericSpinePort({ SP: SP43, core, display });

        expect(parts(createCore42(SP42))).toThrow(
            'A spine-pixi-v8 4.3 port needs its core and display from the same module: got a 4.2 core and a v8 4.3 display',
        );
        expect(parts(coreShimFor(SP43), createV8Display(SP42, PIXI))).toThrow(
            /got a 4\.3 core and a v8 4\.2 display/,
        );
        expect(parts(coreShimFor(SP43), { ...createV8Display(SP43, PIXI), pixi: 7 })).toThrow(
            /got a 4\.3 core and a v7 4\.3 display/,
        );
    });
});
