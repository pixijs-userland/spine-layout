import { describe, expect, it, vi } from 'vitest';
import { createCompositeSpinePort } from '../../../src/engines/shared/compositeSpinePort';
import { pixiSpineAdapters, type PixiSpineHost } from '../../../src/runtimes';
import { ATLAS, contractSkeleton, type Minor } from '../pixiSpine/fixtures';
import { canvasPage, loadPixi7Stack, type Stack } from '../pixiSpine/stacks';

const MINORS: Minor[] = ['3.7', '3.8', '4.1'];

let stack: Stack | undefined;
const load = () => (stack ??= loadPixi7Stack(MINORS));

function adapters(host: Partial<PixiSpineHost> = {}) {
    const assets = new Map<string, unknown>();

    return pixiSpineAdapters(load().runtimes, {
        PIXI: load().PIXI,
        assets: {
            get: <A>(alias: string) => assets.get(alias) as A | undefined,
            resource: () => undefined,
            pageTexture: () => undefined,
        },
        ...host,
    });
}

const pages = () => ({ 'contract.png': canvasPage(load().PIXI, 64, 64) });

describe('pixiSpineAdapters on pixi.js 7.4.3 + @pixi-spine 4.0.6', () => {
    it('reads each export with its own runtime through one port, and owns what it made', () => {
        const runtimes = adapters();
        const port = createCompositeSpinePort(runtimes);

        const made = MINORS.map((minor) => {
            const data = port.readSkeleton(contractSkeleton(minor), ATLAS, pages());
            const spine = port.create(data);
            const slot = spine.skeleton.findSlot('slot_a')!;

            expect(data).toBeInstanceOf(load().namespaces[minor].SkeletonData);
            expect(spine).toBeInstanceOf(load().spines[minor]);
            expect(port.runtimeOf(data)?.minor).toBe(minor);

            return [
                data,
                spine,
                spine.skeleton,
                spine.skeleton.findBone('bone_a'),
                slot,
                data.findAnimation('move'),
                port.slotAttachment(slot),
            ];
        });

        runtimes.forEach((runtime, i) =>
            made.forEach((objects, j) =>
                objects.forEach((object) => expect(runtime.owns(object)).toBe(i === j)),
            ),
        );
    });

    it('pre-passes an export for the runtime it routes it to once, warning once', () => {
        const warn = vi.fn();
        const portWarn = vi.fn();
        const port = createCompositeSpinePort(adapters({ warn: portWarn }), { warn });

        const data = port.readSkeleton(contractSkeleton('4.0' as Minor), ATLAS, pages(), {
            file: 'popup.json',
        });

        expect(data).toBeInstanceOf(load().namespaces['4.1'].SkeletonData);
        expect(warn.mock.calls).toEqual([
            [expect.stringMatching(/^popup\.json: Spine 4\.0\.64 read by the 4\.1 runtime after/)],
        ]);
        expect(portWarn).not.toHaveBeenCalled();
    });

    it('says which runtimes read a binary .skel', () => {
        expect(adapters().map(({ minor, readsBinary }) => [minor, readsBinary])).toEqual([
            ['3.7', false],
            ['3.8', true],
            ['4.1', true],
        ]);
    });
});
