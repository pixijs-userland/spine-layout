import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import type { SpineRuntimeInfo } from '../../../src/engine/Engine';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { minorOfRuntime, pixiSpineModular } from '../../../src/engines/pixiSpine';
import {
    ATLAS,
    chainSkeleton,
    contractSkeleton,
    relabelled,
    rigSkeleton,
    type Minor,
} from './fixtures';
import { chainTip, pixiSpinePortSuite, portOf } from './portSuite';
import { canvasPage, loadPixi7Stack, type Loaded, type Stack } from './stacks';

const require = createRequire(import.meta.url);
const MINORS: Minor[] = ['3.7', '3.8', '4.0', '4.1'];

let stack: Stack | undefined;
const load = () => (stack ??= loadPixi7Stack(MINORS));

describe('pixi.js 7.4.3 + @pixi-spine 4.0.6', () => {
    MINORS.forEach((minor) => pixiSpinePortSuite(load, minor));

    describe('one port over every runtime', () => {
        const pages = () => ({ 'contract.png': canvasPage(load().PIXI, 64, 64) });
        const only = (...minors: Minor[]): Stack => ({
            ...load(),
            runtimes: load().runtimes.filter((runtime) =>
                minors.includes(runtime.info.minor as Minor),
            ),
        });

        it('reads each export with its own runtime, and routes every later call to it', () => {
            const port = portOf(load());
            const textures = pages();

            MINORS.forEach((minor) => {
                const data = port.readSkeleton(rigSkeleton(minor), ATLAS, textures);
                const spine = port.create(data);
                const { skeleton } = spine as unknown as { skeleton: Loaded };

                expect(port.runtimeOf(data)?.minor).toBe(minor);
                expect(spine).toBeInstanceOf(load().spines[minor]);

                const claims = port.claimOf(data.findAnimation('rig')!, data);
                const ids = claims.flatMap((claim) => ('id' in claim ? [claim.id] : []));
                expect(
                    ids.every((id) => (minor < '4' ? /^(\d+|deform\|.*)$/ : /\|/).test(id)),
                ).toBe(true);

                spine.state.setAnimation(0, 'rig', false);
                port.update(spine, 1);
                port.constraintToSetup(skeleton, 1);
                const transform = skeleton.transformConstraints[0];
                const mix = minor < '4' ? 'rotateMix' : 'mixRotate';
                expect(transform[mix]).toBe(transform.data[mix]);
            });
        });

        it('takes a 4.0 export to runtime-4.1 through the pre-pass when 4.0 is not there', () => {
            const warnings: string[] = [];
            const port = portOf(only('3.8', '4.1'), new Map(), warnings);

            const data = port.readSkeleton(rigSkeleton('4.0'), ATLAS, pages());

            expect(port.runtimeOf(data)?.minor).toBe('4.1');
            expect(warnings).toEqual([expect.stringContaining('4.0->4.1')]);
            const mesh = data.findSlot('slot_mesh')!.index;
            const claims = port.claimOf(data.findAnimation('rig')!, data);
            expect(claims).toContainEqual(expect.objectContaining({ kind: 'slot', index: mesh }));
        });

        it('refuses an export no runtime it has reads, naming the Pixi majors that can', () => {
            const port = portOf(only('3.8', '4.1'));
            const skeleton = relabelled(contractSkeleton('4.1'), '4.2.43');

            const error = (() => {
                try {
                    port.readSkeleton(skeleton, ATLAS, pages());
                } catch (thrown) {
                    return thrown;
                }
            })() as UnsupportedSpineVersionError;

            expect(error).toBeInstanceOf(UnsupportedSpineVersionError);
            expect(error).toMatchObject({
                version: '4.2.43',
                registered: ['3.8', '4.1'],
                pixiMajors: [7, 8],
            });
        });

        it('cross-reads with another minor only where the project pins it, and says so', () => {
            const warnings: string[] = [];
            const pinned = portOf(only('4.1'), new Map(), warnings, { '4.2': '4.1' });
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});

            const data = pinned.readSkeleton(
                relabelled(contractSkeleton('4.1'), '4.2.43'),
                ATLAS,
                pages(),
            );
            error.mockRestore();

            expect(pinned.runtimeOf(data)?.minor).toBe('4.1');
            expect(warnings).toEqual([expect.stringContaining('cross-read by the 4.1 runtime')]);
        });

        it("builds with the runtime a game's loader read with, whatever the export says", () => {
            const runtime41 = load().namespaces['4.1'];
            const base = require('@pixi-spine-v7/base');
            const page = canvasPage(load().PIXI, 64, 64);
            const atlas = new base.TextureAtlas(ATLAS, (_: string, done: (b: unknown) => void) =>
                done(page.baseTexture),
            );
            // pixi-spine's uni loader parses 4.0 exports with runtime-4.1
            const loaded = new runtime41.SkeletonJson(
                new runtime41.AtlasAttachmentLoader(atlas),
            ).readSkeletonData(contractSkeleton('4.0'));
            const assets = new Map<string, unknown>([['resource:hero', { spineData: loaded }]]);
            const port = portOf(load(), assets);

            const data = port.readSkeletonFromAssets('hero');

            expect(port.runtimeOf(data)?.minor).toBe('4.1');
            expect(port.create(data)).toBeInstanceOf(runtime41.Spine);
        });

        it('reads with the runtime a caller picked, by what it is rather than which object', () => {
            const port = portOf(load());
            const runtime = port.runtimes.find((candidate) => candidate.minor === '4.1')!;
            const readWith = (info: SpineRuntimeInfo) =>
                port.readSkeletonWith(info, contractSkeleton('4.1'), ATLAS, pages());

            expect(port.runtimeOf(readWith(runtime))).toBe(runtime);
            expect(port.runtimeOf(readWith({ ...runtime }))).toBe(runtime);
            expect(() => readWith({ ...runtime, packageVersion: '3.1.2' })).toThrow(
                'Not a runtime of this engine: Spine 4.1',
            );
        });

        it("leaves a chain path constraint's bones unturned with runtime-4.0, unlike 4.1", () => {
            // pixi-spine 4.0.6's runtime-4.0 tests `tangents` twice in `PathConstraint.update`, so
            // `chain` and `chainScale` never take the path's angle
            const [own, after] = [load(), only('4.1')].map((stack) =>
                chainTip(portOf(stack, new Map(), []), chainSkeleton('4.0')),
            );

            expect(after).toMatchObject({ minor: '4.1' });
            expect(Math.abs(after.x)).toBeCloseTo(Math.abs(after.y), 4);
            expect(Math.hypot(after.x, after.y)).toBeCloseTo(40, 4);
            expect(own).toMatchObject({ minor: '4.0' });
            expect(own.x).toBeCloseTo(40, 4);
            expect(own.y).toBeCloseTo(0, 4);
        });

        it('turns away an object no runtime of the port made', () => {
            const data = portOf(load()).readSkeleton(contractSkeleton('4.1'), ATLAS, pages());
            const port = portOf(only('3.8'));

            expect(port.runtimeOf(data)).toBeUndefined();
            expect(() => port.create(data)).toThrow('SkeletonData');
            expect(() => port.claimOf(data.animations[0], data)).toThrow('SkeletonData');
        });
    });

    describe('pixiSpineModular', () => {
        it("names each runtime's minor by what its classes have", () => {
            MINORS.forEach((minor) => expect(minorOfRuntime(load().namespaces[minor])).toBe(minor));
            expect(load().runtimes.map((runtime) => runtime.info)).toEqual(
                MINORS.map((minor) => ({
                    minor,
                    family: 'pixi-spine-modular',
                    packageName: `@pixi-spine/runtime-${minor}`,
                    packageVersion: '4.0.6',
                })),
            );
        });

        it('refuses a runtime under another minor, or built on another base', () => {
            const base = require('@pixi-spine-v7/base');
            const { namespaces, PIXI } = load();

            expect(() =>
                pixiSpineModular(base, { '4.0': namespaces['4.1'] }, { packageVersion: '4.0.6' }),
            ).toThrow('given as 4.0 reads Spine 4.1');
            expect(() =>
                pixiSpineModular(
                    base,
                    { '3.8': { ...namespaces['3.8'], Spine: class extends PIXI.Container {} } },
                    { packageVersion: '4.0.6' },
                ),
            ).toThrow('another base');
        });
    });
});
