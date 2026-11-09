// @vitest-environment happy-dom
import * as PIXI from 'pixi.js-v7';
import * as SP42 from 'spine-pixi-v7-42';
import * as SP43 from 'spine-pixi-v7-43';
import { describe, expect, it } from 'vitest';
import type { RuntimePin } from '../../../src/core/versions/pickRuntime';
import type { ContainerLike } from '../../../src/engine/Engine';
import type { SkeletonDataLike } from '../../../src/engine/runtime';
import {
    coreShimFor,
    createEsotericSpinePort,
    createV7Display,
    esotericRuntime,
    type EsotericModule,
    type EsotericSpine,
} from '../../../src/engines/esoteric';
import { claimNames, esotericPortSuite, RIG_ATLAS, RIGS, type Loaded } from './harness';

const { Assets, BaseTexture, Cache, Container, EventBoundary, Rectangle, Texture, Ticker } = PIXI;

Ticker.shared.autoStart = false;
Ticker.shared.stop();

const MODULES: Record<string, { SP: EsotericModule; version: string }> = {
    '4.2': { SP: SP42, version: '4.2.120' },
    '4.3': { SP: SP43, version: '4.3.13' },
};

function page(width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return new Texture(new BaseTexture(canvas as unknown as HTMLCanvasElement));
}

function atlasOf(SP: EsotericModule) {
    const { TextureAtlas, SpineTexture } = SP as unknown as {
        TextureAtlas: new (text: string) => { pages: { setTexture(texture: unknown): void }[] };
        SpineTexture: { from(base: unknown): unknown };
    };
    const atlas = new TextureAtlas(RIG_ATLAS);
    atlas.pages.forEach((own) => own.setTexture(SpineTexture.from(page(64, 64).baseTexture)));
    return atlas;
}

function portOf(
    minor: string,
    options: { pin?: RuntimePin; warn?: (message: string) => void } = {},
) {
    const { SP, version } = MODULES[minor];
    const runtime = esotericRuntime(SP, version);
    const port = createEsotericSpinePort({
        SP: runtime.module,
        core: coreShimFor(runtime.module),
        display: createV7Display(runtime.module, PIXI),
        runtime: runtime.info,
        ...options,
    });

    return { runtime, port };
}

interface V7Spine extends EsotericSpine {
    renderMeshes(): void;
    sortChildren(): void;
    slotMeshFactory(): { containsPoint(point: unknown): boolean };
    meshesCache: Map<unknown, { containsPoint(point: unknown): boolean }>;
}

function load(minor: string, other: string): () => Loaded {
    return () => {
        const { runtime, port } = portOf(minor);
        const name = `v7 + ${minor}`;

        if (!Cache.has(`rig-${name}`)) {
            Cache.set(`rig-${name}`, structuredClone(RIGS[minor]));
            Cache.set(`atlas-${name}`, atlasOf(MODULES[other].SP));
        }

        return {
            runtime,
            port,
            page,
            samePage: (a, b) => (a as PIXI.Texture).baseTexture === (b as PIXI.Texture).baseTexture,
            container: () => new Container() as unknown as ContainerLike,
            aliases: { skeleton: `rig-${name}`, atlas: `atlas-${name}` },
            store: (alias, value) => Cache.set(alias, value),
            tick: (ms) => Ticker.shared.update(Ticker.shared.lastTime + ms),
            render(spine) {
                (spine as V7Spine).renderMeshes();
                (spine as V7Spine).sortChildren();
            },
        };
    };
}

describe('spine-pixi-v7 loaders', () => {
    it('keeps one of each spine loader when both runtimes are on the page', () => {
        const ids = () =>
            Assets.loader.parsers
                .map((parser) => (parser as { name?: string }).name)
                .filter((id) => /^spine/.test(id ?? ''));

        expect(ids()).toHaveLength(4);
        portOf('4.2');
        expect(ids()).toEqual(['spineTextureAtlasLoader', 'spineSkeletonLoader']);
    });
});

esotericPortSuite('v7 + 4.2', load('4.2', '4.3'));
esotericPortSuite('v7 + 4.3', load('4.3', '4.2'));

describe('spine-pixi-v7 4.2 and 4.3 in one page', () => {
    const read = (minor: string) => {
        const { port, runtime } = portOf(minor);
        return {
            port,
            runtime,
            data: port.readSkeleton(RIGS[minor], RIG_ATLAS, { 'rig.png': page(64, 64) }),
        };
    };

    it('lets a click through a shielded skeleton to the button behind it', () => {
        const { port, data } = read('4.3');
        const stage = new Container();
        const button = new Container();
        const spine = port.create(data) as V7Spine;
        const boundary = new EventBoundary(stage);
        const hit = () => {
            const parent = stage.enableTempParent();
            stage.updateTransform();
            stage.disableTempParent(parent);
            return boundary.hitTest(0, 0);
        };

        stage.eventMode = 'static';
        button.eventMode = 'static';
        button.hitArea = new Rectangle(-50, -50, 100, 100);
        stage.addChild(button, spine as unknown as PIXI.DisplayObject);
        port.update(spine, 0);

        expect(hit()).toBe(stage);

        port.shieldShapes(spine);
        expect(spine.meshesCache.size).toBeGreaterThan(0);
        expect(hit()).toBe(button);
        expect(spine.slotMeshFactory().containsPoint({ x: 0, y: 0 })).toBe(false);

        port.exposeShapes(spine);
        expect(hit()).toBe(stage);
        expect(spine.slotMeshFactory().containsPoint).toBe(SP43.SlotMesh.prototype.containsPoint);
        spine.destroy();
    });

    it('keeps a cached read in each runtime’s own cache', () => {
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
        expect(SP42.Spine.skeletonCache['shared-skeleton-shared-atlas-1']).toBe(data42);
        expect(SP43.Spine.skeletonCache['shared-skeleton-shared-atlas-1']).toBe(data43);
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

        const native = meshOf(read(minor).data);
        const adopted = meshOf(port.readSkeletonFromAssets(`${alias}-skeleton`, `${alias}-atlas`));

        expect(regionOf(adopted)).toBeInstanceOf(own.TextureAtlasRegion);
        expect(uvsOf(adopted)).toEqual(uvsOf(native));
    });

    it('reads one export the same with either runtime’s claims, named', () => {
        const [claims42, claims43] = ['4.2', '4.3'].map((minor) => {
            const { port, runtime, data } = read(minor);
            return data.animations.map((animation) =>
                claimNames(port, runtime.module, data, animation.name),
            );
        });

        expect(claims42).toEqual(claims43);
    });

    it('poses one export the same with either runtime', () => {
        const [pose42, pose43] = ['4.2', '4.3'].map((minor) => {
            const { port, data } = read(minor);
            const spine = port.create(data);
            port.updateWorldTransform(spine.skeleton);
            const pose = spine.skeleton.bones.map((bone) => {
                const { worldX, worldY } = port.bonePose(bone);
                return [
                    bone.data.name,
                    Math.round(worldX * 1000) / 1000 + 0,
                    Math.round(worldY * 1000) / 1000 + 0,
                ];
            });
            spine.destroy();
            return pose;
        });

        expect(pose42).toEqual(pose43);
    });
});

describe('esotericRuntime on spine-pixi-v7', () => {
    it('reads the Pixi and the spine-core minor off the module', () => {
        expect(esotericRuntime(SP42).info).toEqual({
            minor: '4.2',
            family: 'esoteric',
            packageName: '@esotericsoftware/spine-pixi-v7',
            packageVersion: '4.2.120',
        });
        expect(esotericRuntime(SP43)).toMatchObject({ pixi: 7, minor: '4.3' });
        expect(esotericRuntime(SP43).info.packageVersion).toBe('4.3.13');
    });

    it('refuses a module that is not spine-pixi, or not v7', () => {
        const { Physics } = SP42;
        const noMeshes = Object.fromEntries(
            Object.entries(SP42).filter(([key]) => key !== 'SlotMesh'),
        ) as unknown as EsotericModule;

        expect(() => esotericRuntime({ Physics } as unknown as EsotericModule)).toThrow(
            /Not a spine-pixi-v7 or spine-pixi-v8 module/,
        );
        expect(() => createV7Display(noMeshes, PIXI)).toThrow(/no SlotMesh/);
    });
});
