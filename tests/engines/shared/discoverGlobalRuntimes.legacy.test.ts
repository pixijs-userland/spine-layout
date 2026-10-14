import { describe, expect, it } from 'vitest';
import { createCompositeSpinePort } from '../../../src/engines/shared/compositeSpinePort';
import {
    discoverGlobalRuntimes,
    runtimeAdapters,
    type PixiSpineRuntime,
} from '../../../src/runtimes';
import { ATLAS, contractSkeleton } from '../pixiSpine/fixtures';
import { canvasPage, loadPixi6Stack, loadTwoLegacyCores } from '../pixiSpine/stacks';

const noAssets = { get: () => undefined, resource: () => undefined, pageTexture: () => undefined };

describe('discoverGlobalRuntimes on legacy pages', () => {
    it("finds pixi-spine 1.x's PIXI.spine.core, and a bundle the editor scoped beside it", () => {
        const stack = loadTwoLegacyCores();
        const scope = {
            PIXI: stack.PIXI,
            SpineRuntime_pixiSpine_1_5_23: {
                Spine: stack.spines['3.7'],
                core: stack.namespaces['3.7'],
            },
        };

        expect(
            (discoverGlobalRuntimes(scope) as PixiSpineRuntime[]).map(({ info, classes }) => ({
                ...info,
                classes,
            })),
        ).toEqual([
            {
                minor: '3.7',
                family: 'pixi-spine-legacy',
                packageName: 'pixi-spine',
                packageVersion: '1.5.23',
                classes: stack.namespaces['3.7'],
            },
            {
                minor: '3.8',
                family: 'pixi-spine-legacy',
                packageName: 'pixi-spine',
                packageVersion: '1.x',
                classes: stack.namespaces['3.8'],
            },
        ]);
    });

    it("finds @pixi-spine 3.x's per-package scripts, and reads with them on Pixi 6", () => {
        const stack = loadPixi6Stack(['3.7', '3.8', '4.0', '4.1']);
        const found = discoverGlobalRuntimes(globalThis);

        expect(found.map(({ info }) => [info.minor, info.packageVersion])).toEqual([
            ['3.7', '3.x'],
            ['3.8', '3.x'],
            ['4.0', '3.x'],
            ['4.1', '3.x'],
        ]);

        const port = createCompositeSpinePort(
            runtimeAdapters(found, { PIXI: stack.PIXI, assets: noAssets }),
        );
        const textures = { 'contract.png': canvasPage(stack.PIXI, 64, 64) };

        (['3.8', '4.1'] as const).forEach((minor) => {
            const data = port.readSkeleton(contractSkeleton(minor), ATLAS, textures);

            expect(data).toBeInstanceOf(stack.namespaces[minor].SkeletonData);
            expect(port.create(data)).toBeInstanceOf(stack.spines[minor]);
        });
    });
});
