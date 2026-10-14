import { describe, expect, it, vi } from 'vitest';
import { runtimesOf } from '../../../src/core/versions/runtimeMatrix';
import type {
    EngineTypes,
    SpinePort,
    SpineRuntimeAdapter,
    SpineRuntimeInfo,
} from '../../../src/engine/Engine';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { createCompositeSpinePort } from '../../../src/engines/shared/compositeSpinePort';
import { lazyRuntime } from '../../../src/runtimes';

type Call = [method: string, ...args: unknown[]];

const PIXI8 = runtimesOf(8);
const PIXI7 = runtimesOf(7);
const info = (runtimes: SpineRuntimeInfo[], minor: string) =>
    runtimes.find((runtime) => runtime.minor === minor)!;

/** A runtime whose port records every call and answers with what it was called with. */
function fakeRuntime(runtime: SpineRuntimeInfo, { readsBinary = true } = {}) {
    const calls: Call[] = [];
    const made = new Set<unknown>();
    const make = (kind: string) => {
        const object = { kind, minor: runtime.minor };
        made.add(object);
        return object;
    };
    const port = new Proxy({} as SpinePort<EngineTypes>, {
        get:
            (_, method: string) =>
            (...args: unknown[]) => {
                calls.push([method, ...args]);
                return { from: runtime.minor, method };
            },
    });
    const adapter: SpineRuntimeAdapter = {
        ...runtime,
        port,
        owns: (object) => made.has(object),
        readsBinary,
    };

    return { adapter, calls, make };
}

interface Json {
    skeleton: { spine: string };
    skins?: { name: string }[];
    bones?: { name: string; transform?: string; inherit?: string }[];
}

const json = (version: string, extra: Partial<Json> = {}): Json => ({
    skeleton: { spine: version },
    ...extra,
});

describe('createCompositeSpinePort', () => {
    describe('reading', () => {
        it("reads each export with its own runtime's port, as given", () => {
            const v42 = fakeRuntime(info(PIXI8, '4.2'));
            const v43 = fakeRuntime(info(PIXI8, '4.3'));
            const warn = vi.fn();
            const port = createCompositeSpinePort([v42.adapter, v43.adapter], { warn });
            const textures = { 'a.png': {} };
            const source = json('4.3.23');

            expect(port.readSkeleton(source, 'atlas', textures)).toEqual({
                from: '4.3',
                method: 'readSkeleton',
            });
            expect(v43.calls).toEqual([['readSkeleton', source, 'atlas', textures, {}]]);
            expect(v42.calls).toEqual([]);
            expect(warn).not.toHaveBeenCalled();
        });

        it('pre-passes an export for the newer runtime it routes it to, and warns with its file', () => {
            const v42 = fakeRuntime(info(PIXI8, '4.2'));
            const warn = vi.fn();
            const port = createCompositeSpinePort([v42.adapter], { warn });
            const source = json('4.1.24', { bones: [{ name: 'root', transform: 'noScale' }] });

            port.readSkeleton(source, '', {}, { file: 'prize.json' });

            const [[, read, , , options]] = v42.calls;
            expect(read).toMatchObject({ bones: [{ inherit: 'noScale' }] });
            expect(source.bones![0]).not.toHaveProperty('inherit');
            expect(options).toEqual({ file: 'prize.json' });
            expect(warn).toHaveBeenCalledWith(
                expect.stringMatching(/^prize\.json: Spine 4\.1\.24 read by the 4\.2 runtime/),
            );
        });

        it('reads with a pinned runtime over the export minor own one, with no pre-pass', () => {
            const v42 = fakeRuntime(info(PIXI8, '4.2'));
            const v43 = fakeRuntime(info(PIXI8, '4.3'));
            const warn = vi.fn();
            const port = createCompositeSpinePort([v42.adapter, v43.adapter], {
                pin: { '4.2': '4.3', '4.1': '4.3' },
                warn,
            });
            const v41 = json('4.1.24', { bones: [{ name: 'root', transform: 'noScale' }] });

            port.readSkeleton(json('4.2.43'), '', {});
            port.readSkeleton(v41, '', {});

            expect(v42.calls).toEqual([]);
            expect(v43.calls.map(([, source]) => source)).toEqual([json('4.2.43'), v41]);
            expect(warn.mock.calls.map(([message]) => message)).toEqual([
                expect.stringMatching(/^Spine 4\.2\.43 cross-read by the 4\.3 runtime/),
                expect.stringMatching(/^Spine 4\.1\.24 cross-read by the 4\.3 runtime/),
            ]);
        });

        it('refuses an export no runtime reads, naming the runtimes and the Pixi that read it', () => {
            const port = createCompositeSpinePort([
                fakeRuntime(info(PIXI8, '4.2')).adapter,
                fakeRuntime(info(PIXI8, '4.3')).adapter,
            ]);

            expect(() => port.readSkeleton(json('3.8.99'), '', {}, { file: 'bg.json' })).toThrow(
                new UnsupportedSpineVersionError({
                    file: 'bg.json',
                    version: '3.8.99',
                    registered: ['4.2', '4.3'],
                    pixiMajors: [4, 5, 6, 7],
                }),
            );
        });

        it('reads a binary only with a runtime that reads binaries', () => {
            const v37 = fakeRuntime(info(PIXI7, '3.7'), { readsBinary: false });
            const v38 = fakeRuntime(info(PIXI7, '3.8'));
            const port = createCompositeSpinePort([v37.adapter, v38.adapter], {
                pin: { '3.8': '3.7' },
                warn: () => {},
            });
            const skel = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 7, ...Buffer.from('3.8.99')]);

            port.readSkeleton(skel, '', {});
            port.readSkeleton(json('3.8.99'), '', {});

            expect(v38.calls.map(([, source]) => source)).toEqual([skel]);
            expect(v37.calls.map(([, source]) => source)).toEqual([json('3.8.99')]);
        });

        it('refuses a binary no runtime reads naming every runtime, and those that read JSON only', () => {
            const v37 = fakeRuntime(info(PIXI7, '3.7'), { readsBinary: false });
            const port = createCompositeSpinePort([v37.adapter]);
            const skel = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 7, ...Buffer.from('4.2.43')]);

            expect(() => port.readSkeleton(skel, '', {}, { file: 'rig.skel' })).toThrow(
                new UnsupportedSpineVersionError({
                    file: 'rig.skel',
                    version: '4.2.43',
                    registered: ['3.7'],
                    pixiMajors: [7, 8],
                    jsonOnly: ['3.7'],
                }),
            );
            expect(() => port.readSkeleton(skel, '', {})).toThrow(
                'Spine 4.2.43 — registered runtimes: 3.7 (JSON only); Pixi 7, 8 can render it',
            );
            expect(v37.calls).toEqual([]);
        });

        it('reads from the asset cache only with a single runtime', () => {
            const only = fakeRuntime(info(PIXI8, '4.3'));

            createCompositeSpinePort([only.adapter]).readSkeletonFromAssets('hero', 'hero.atlas');
            expect(only.calls).toEqual([['readSkeletonFromAssets', 'hero', 'hero.atlas']]);

            const two = createCompositeSpinePort([
                fakeRuntime(info(PIXI8, '4.2')).adapter,
                only.adapter,
            ]);
            expect(() => two.readSkeletonFromAssets('hero')).toThrow(
                /this one has 2 \(4\.2, 4\.3\): read each skeleton with readSkeleton/,
            );
        });
    });

    describe('routing', () => {
        const calls: [keyof SpinePort<EngineTypes>, (object: unknown) => unknown[]][] = [
            ['create', (data) => [data]],
            ['update', (spine) => [spine, 0.5]],
            ['bonePose', (bone) => [bone]],
            ['boneSetup', (bone) => [bone]],
            ['boneToSetup', (bone) => [bone]],
            ['slotAttachment', (slot) => [slot]],
            ['slotAlpha', (slot) => [slot]],
            ['slotToSetup', (slot) => [slot]],
            ['setupPose', (skeleton) => [skeleton, 'bones']],
            ['constraintToSetup', (skeleton) => [skeleton, 2]],
            ['updateWorldTransform', (skeleton) => [skeleton]],
            ['drawOrder', (skeleton) => [skeleton]],
            ['claimOf', (data) => [{ name: 'move' }, data]],
            ['beforeWorldTransforms', (spine) => [spine, () => {}]],
            ['onUpdate', (spine) => [spine, () => {}]],
            ['hitPolygon', (slot) => [slot, {}]],
            ['shieldShapes', (spine) => [spine]],
            ['exposeShapes', (spine) => [spine]],
            ['attachSlotObject', (spine) => [spine, 'slot_a', {}]],
            ['getSlotObject', (spine) => [spine, 'slot_a']],
            ['detachSlotObject', (spine) => [spine, 'slot_a']],
            ['syncSlotObjectsWithDrawOrder', (spine) => [spine]],
        ];

        it.each(calls)('sends %s to the runtime that made its object', (method, args) => {
            const v42 = fakeRuntime(info(PIXI8, '4.2'));
            const v43 = fakeRuntime(info(PIXI8, '4.3'));
            const port = createCompositeSpinePort([v42.adapter, v43.adapter]);
            const call = port[method] as (...args: unknown[]) => unknown;

            const of42 = args(v42.make(method));
            const of43 = args(v43.make(method));

            expect(call(...of42)).toEqual({ from: '4.2', method });
            expect(call(...of43)).toEqual({ from: '4.3', method });
            expect(v42.calls).toEqual([[method, ...of42]]);
            expect(v43.calls).toEqual([[method, ...of43]]);
            expect(() => call(...args({ made: 'elsewhere' }))).toThrow(
                /^No Spine runtime of this engine made this /,
            );
        });

        it("finds a region's runtime by its attachment, else by its slot, else answers null", () => {
            const v42 = fakeRuntime(info(PIXI8, '4.2'));
            const v43 = fakeRuntime(info(PIXI8, '4.3'));
            const port = createCompositeSpinePort([v42.adapter, v43.adapter]);
            const attachment = v42.make('attachment');
            const slot = v43.make('slot');

            expect(port.regionTexture(attachment)).toMatchObject({ from: '4.2' });
            expect(port.regionTexture({}, slot as never)).toMatchObject({ from: '4.3' });
            expect(port.regionTexture(null)).toBeNull();
            expect(port.regionTexture({}, {} as never)).toBeNull();
        });

        it('names the runtime of what it made, the same object it lists', () => {
            const v42 = fakeRuntime(info(PIXI8, '4.2'));
            const v43 = fakeRuntime(info(PIXI8, '4.3'));
            const port = createCompositeSpinePort([v42.adapter, v43.adapter]);

            expect(port.runtimes).toEqual([info(PIXI8, '4.2'), info(PIXI8, '4.3')]);
            expect(port.runtimeOf(v43.make('data') as never)).toBe(port.runtimes[1]);
            expect(port.runtimeOf(v42.make('spine') as never)).toBe(port.runtimes[0]);
            expect(port.runtimeOf({} as never)).toBeUndefined();
            expect(port.runtimes[0]).not.toHaveProperty('port');
        });
    });

    describe('over a single runtime', () => {
        it('hands every call to it, owned or not, and loads nothing first', () => {
            const only = fakeRuntime(info(PIXI8, '4.3'));
            const port = createCompositeSpinePort([only.adapter]);
            const stranger = { made: 'by a subclass the runtime does not list' };

            expect(port.prepare).toBeUndefined();
            expect(port.update(stranger as never, 1)).toEqual({ from: '4.3', method: 'update' });
            expect(port.regionTexture(stranger)).toEqual({ from: '4.3', method: 'regionTexture' });
            expect(only.calls).toEqual([
                ['update', stranger, 1],
                ['regionTexture', stranger, undefined],
            ]);
            expect(port.runtimeOf(stranger as never)).toBeUndefined();
        });

        it("still refuses what that runtime's own pick refuses", () => {
            const port = createCompositeSpinePort([fakeRuntime(info(PIXI8, '4.3')).adapter]);

            expect(() => port.readSkeleton(json('4.2.43'), '', {})).toThrow(
                'Spine 4.2.43 — registered runtimes: 4.3; Pixi 7, 8 can render it',
            );
        });
    });

    describe('lazy runtimes', () => {
        function lazy(runtime: SpineRuntimeInfo, loaded = fakeRuntime(runtime).adapter) {
            const load = vi.fn(async () => loaded);
            return { load, adapter: lazyRuntime(runtime, load) };
        }

        it('loads, once, the runtimes that the export minors given to prepare need', async () => {
            const v42 = lazy(info(PIXI8, '4.2'));
            const v43 = lazy(info(PIXI8, '4.3'));
            const port = createCompositeSpinePort([v42.adapter, v43.adapter]);

            await Promise.all([port.prepare!(['4.1', '4.2']), port.prepare!(['4.2'])]);

            expect(v42.load).toHaveBeenCalledTimes(1);
            expect(v43.load).not.toHaveBeenCalled();
            expect(port.readSkeleton(json('4.2.43'), '', {})).toMatchObject({ from: '4.2' });
            expect(() => port.readSkeleton(json('4.3.23'), '', {})).toThrow(
                "The Spine 4.3 runtime has not loaded: await prepare(['4.3']) first",
            );
        });

        it('loads the runtime a pin sends a minor to', async () => {
            const v42 = lazy(info(PIXI8, '4.2'));
            const v43 = lazy(info(PIXI8, '4.3'));
            const port = createCompositeSpinePort([v42.adapter, v43.adapter], {
                pin: { '4.2': '4.3' },
            });

            await port.prepare!(['4.2']);

            expect(v42.load).not.toHaveBeenCalled();
            expect(v43.load).toHaveBeenCalledTimes(1);
        });

        it('loads the runtime pinned under "*" for exports that name no version', async () => {
            const v43 = lazy(info(PIXI8, '4.3'));
            const unpinned = lazy(info(PIXI8, '4.3'));

            await createCompositeSpinePort([v43.adapter], { pin: { '*': '4.3' } }).prepare!(['*']);
            await createCompositeSpinePort([unpinned.adapter]).prepare!(['*']);

            expect(v43.load).toHaveBeenCalledTimes(1);
            expect(unpinned.load).not.toHaveBeenCalled();
        });

        it('lists what a lazy runtime names until it loads, then what it loaded', async () => {
            const named = info(PIXI8, '4.3');
            const loaded = fakeRuntime({ ...named, packageVersion: '4.3.7' }).adapter;
            const port = createCompositeSpinePort([lazy(named, loaded).adapter]);

            expect(port.runtimes).toEqual([named]);
            await port.prepare!(['4.3']);
            expect(port.runtimes).toEqual([{ ...named, packageVersion: '4.3.7' }]);
        });

        it('loads what it can, and leaves a minor no runtime reads to be refused as it is read', async () => {
            const v43 = lazy(info(PIXI8, '4.3'));
            const port = createCompositeSpinePort([
                fakeRuntime(info(PIXI8, '4.2')).adapter,
                v43.adapter,
            ]);

            await expect(port.prepare!(['3.8', '4.3'])).resolves.toBeUndefined();
            expect(v43.load).toHaveBeenCalledTimes(1);
            expect(() => port.readSkeleton(json('3.8.99'), '', {})).toThrow(
                new UnsupportedSpineVersionError({
                    version: '3.8.99',
                    registered: ['4.2', '4.3'],
                    pixiMajors: [4, 5, 6, 7],
                }),
            );
        });

        it('tries a failed load again, and refuses a runtime of another minor', async () => {
            const v43 = lazy(info(PIXI8, '4.3'));
            v43.load.mockRejectedValueOnce(new Error('offline'));
            const port = createCompositeSpinePort([v43.adapter]);

            await expect(port.prepare!(['4.3'])).rejects.toThrow('offline');
            await port.prepare!(['4.3']);
            expect(v43.load).toHaveBeenCalledTimes(2);

            const wrong = createCompositeSpinePort([
                lazy(info(PIXI8, '4.3'), fakeRuntime(info(PIXI8, '4.2')).adapter).adapter,
            ]);
            await expect(wrong.prepare!(['4.3'])).rejects.toThrow(
                'The lazy Spine 4.3 runtime loaded one of Spine 4.2',
            );
        });
    });

    it('refuses no runtime, two runtimes of one minor, and a runtime that does not name itself', () => {
        const v43 = fakeRuntime(info(PIXI8, '4.3')).adapter;

        expect(() => createCompositeSpinePort([])).toThrow('no Spine runtime given');
        expect(() =>
            createCompositeSpinePort([v43, fakeRuntime(info(PIXI7, '4.3')).adapter]),
        ).toThrow(
            'Two runtimes read Spine 4.3: @esotericsoftware/spine-pixi-v8@4.3.x and @esotericsoftware/spine-pixi-v7@4.3.13',
        );
        expect(() => createCompositeSpinePort([(async () => v43) as never])).toThrow(
            /names its runtime/,
        );
    });
});
