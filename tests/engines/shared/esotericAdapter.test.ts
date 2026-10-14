// @vitest-environment happy-dom
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import * as PIXI from 'pixi.js';
import { Cache, Texture, TextureSource, Ticker } from 'pixi.js';
import * as SP42 from 'spine-pixi-v8-42';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpinePort, SpineRuntimeAdapter } from '../../../src/engine/Engine';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import type { SkeletonDataLike, SkeletonLike } from '../../../src/engine/runtime';
import type { EsotericSpine, EsotericTypes } from '../../../src/engines/esoteric';
import { createCompositeSpinePort } from '../../../src/engines/shared/compositeSpinePort';
import {
    esotericAdapter,
    esotericRuntime,
    type RuntimeAdapterOptions,
} from '../../../src/runtimes';
import { constraintsOf, RIG_ATLAS, RIGS } from '../esoteric/harness';

Ticker.shared.autoStart = false;
Ticker.shared.stop();

const page = () => new Texture({ source: new TextureSource({ width: 64, height: 64 }) });
const pages = () => ({ 'rig.png': page() });

const adapterOf = (minor: '4.2' | '4.3', options?: RuntimeAdapterOptions) =>
    esotericAdapter<EsotericTypes>(
        minor === '4.2' ? esotericRuntime(SP42, '4.2.120') : esotericRuntime(SP43, '4.3.7'),
        PIXI,
        options,
    );

const rig = (minor: string) => structuredClone(RIGS[minor]);

/** The rig in its setup pose alone: 4.3 throws on 4.2's constraint timelines. */
function posed(minor: string) {
    const setup = rig(minor) as Record<string, unknown>;
    delete setup.animations;
    return setup;
}

function world(port: SpinePort<EsotericTypes>, skeleton: SkeletonLike, bone: string) {
    const pose = port.bonePose(skeleton.findBone(bone)!);
    return [Math.round(pose.worldX) + 0, Math.round(pose.worldY) + 0];
}

describe('esotericAdapter', () => {
    const spines: EsotericSpine[] = [];
    const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

    afterEach(() => {
        spines.splice(0).forEach((spine) => spine.destroy());
        vi.restoreAllMocks();
    });

    it('reads 4.2 and 4.3 exports each with its own runtime, through one port on Pixi 8', () => {
        const port = createCompositeSpinePort([adapterOf('4.2'), adapterOf('4.3')]);
        const data = ['4.2', '4.3'].map((minor) =>
            port.readSkeleton(rig(minor), RIG_ATLAS, pages()),
        );

        expect(data[0]).toBeInstanceOf(SP42.SkeletonData);
        expect(data[1]).toBeInstanceOf(SP43.SkeletonData);
        expect(data.map((each) => port.runtimeOf(each))).toEqual(port.runtimes);

        data.forEach((each, i) => {
            const spine = port.create(each);
            spines.push(spine);
            expect(spine).toBeInstanceOf([SP42.Spine, SP43.Spine][i]);
            expect(port.runtimeOf(spine)).toBe(port.runtimes[i]);

            port.updateWorldTransform(spine.skeleton);
            expect(world(port, spine.skeleton, 'hand')).toEqual([0, -100]);
        });
    });

    it("lets a pin have 4.3 read a 4.2 export, warning once, as goosicorn's games do", () => {
        const consoleWarn = quiet();
        const warn = vi.fn();
        const port = createCompositeSpinePort([adapterOf('4.2'), adapterOf('4.3')], {
            pin: { '4.2': '4.3' },
            warn,
        });
        const data = port.readSkeleton(posed('4.2'), RIG_ATLAS, pages(), { file: 'arm.json' });
        const spine = port.create(data);
        spines.push(spine);
        port.updateWorldTransform(spine.skeleton);

        expect(data).toBeInstanceOf(SP43.SkeletonData);
        expect(constraintsOf(data)).toEqual([]);
        expect(world(port, spine.skeleton, 'hand')).toEqual([100, 0]);
        expect(warn.mock.calls).toEqual([
            [expect.stringMatching(/^arm\.json: Spine 4\.2\.43 cross-read by the 4\.3 runtime/)],
        ]);
        expect(consoleWarn).not.toHaveBeenCalled();
    });

    it("owns its own runtime's objects, and none of the other's", () => {
        const adapters = [adapterOf('4.2'), adapterOf('4.3')];
        const port = createCompositeSpinePort(adapters);
        const objectsOf = (data: SkeletonDataLike) => {
            const spine = port.create(data);
            spines.push(spine);
            const slot = spine.skeleton.findSlot('body')!;

            return {
                data,
                spine,
                skeleton: spine.skeleton,
                bone: spine.skeleton.findBone('hand'),
                slot,
                animation: data.findAnimation('pose'),
                attachment: port.slotAttachment(slot),
            };
        };
        const [of42, of43] = ['4.2', '4.3'].map((minor) =>
            objectsOf(port.readSkeleton(rig(minor), RIG_ATLAS, pages())),
        );
        const owned = (adapter: SpineRuntimeAdapter, objects: object) =>
            Object.fromEntries(
                Object.entries(objects).map(([kind, object]) => [kind, adapter.owns(object)]),
            );
        const all = (value: boolean) =>
            Object.fromEntries(Object.keys(of42).map((kind) => [kind, value]));

        expect(owned(adapters[0], of42)).toEqual(all(true));
        expect(owned(adapters[0], of43)).toEqual(all(false));
        expect(owned(adapters[1], of43)).toEqual(all(true));
        expect(owned(adapters[1], of42)).toEqual(all(false));
    });

    it('keeps its own check of what it reads from the asset cache, with its own pin', () => {
        const atlas = new SP43.TextureAtlas(RIG_ATLAS);
        atlas.pages.forEach((each) => each.setTexture(SP43.SpineTexture.from(page().source)));
        Cache.set('arm-4.2', posed('4.2'));
        Cache.set('arm-4.2-atlas', atlas);
        quiet();

        const read = (options?: RuntimeAdapterOptions) =>
            createCompositeSpinePort([adapterOf('4.3', options)]).readSkeletonFromAssets(
                'arm-4.2',
                'arm-4.2-atlas',
            );

        expect(read).toThrow(UnsupportedSpineVersionError);
        expect(read({ pin: { '4.2': '4.3' }, warn: () => {} })).toBeInstanceOf(SP43.SkeletonData);
    });
});
