// @vitest-environment happy-dom
import { createRequire } from 'node:module';
import * as SP42 from 'spine-pixi-v7-42';
import * as SP43 from 'spine-pixi-v7-43';
import { describe, expect, it } from 'vitest';
import { discoverGlobalRuntimes, type SpineRuntime } from '../../../src/runtimes';

const require = createRequire(import.meta.url);

const modular = {
    base: require('@pixi-spine-v7/base'),
    runtime37: require('@pixi-spine-v7/runtime-3.7'),
    runtime38: require('@pixi-spine-v7/runtime-3.8'),
    runtime40: require('@pixi-spine-v7/runtime-4.0'),
    runtime41: require('@pixi-spine-v7/runtime-4.1'),
};

const described = (runtimes: SpineRuntime[]) =>
    runtimes.map((runtime) => {
        const { minor, family, packageName, packageVersion } = runtime.info;
        const namespace = 'module' in runtime ? runtime.module : runtime.classes;
        return { minor, family, packageName, packageVersion, namespace };
    });

describe('discoverGlobalRuntimes', () => {
    it("finds app-magic-editor's Pixi 7 bundles by their global names", () => {
        const scope = {
            SpineRuntime_pixiSpine_4_0_6: modular,
            SpineRuntime_spinePixiV7_4_2_120: SP42,
            SpineRuntime_spinePixiV7_4_3_13: SP43,
        };

        expect(described(discoverGlobalRuntimes(scope))).toEqual([
            ...(['3.7', '3.8', '4.0', '4.1'] as const).map((minor) => ({
                minor,
                family: 'pixi-spine-modular',
                packageName: `@pixi-spine/runtime-${minor}`,
                packageVersion: '4.0.6',
                namespace: modular[`runtime${minor.replace('.', '')}` as 'runtime37'],
            })),
            {
                minor: '4.2',
                family: 'esoteric',
                packageName: '@esotericsoftware/spine-pixi-v7',
                packageVersion: '4.2.120',
                namespace: SP42,
            },
            {
                minor: '4.3',
                family: 'esoteric',
                packageName: '@esotericsoftware/spine-pixi-v7',
                packageVersion: '4.3.13',
                namespace: SP43,
            },
        ]);
    });

    it("finds Esoteric's own IIFE at `spine`, once however many names it has", () => {
        expect(described(discoverGlobalRuntimes({ spine: SP42 }))).toEqual([
            expect.objectContaining({ minor: '4.2', packageVersion: '4.2.120', namespace: SP42 }),
        ]);
        expect(
            discoverGlobalRuntimes({ SpineRuntime_spinePixiV7_4_3_13: SP43, spine: SP43 }),
        ).toHaveLength(1);
    });

    it('passes over globals that only look like runtimes', () => {
        const scope = {
            SpineRuntime_pixiSpine_4_0_6: { base: modular.base },
            SpineRuntime_other_1_2_3: 42,
            SpineRuntime_notAVersion: SP43,
            spine: { Spine: class {} },
            PIXI: { VERSION: '7.4.3', spine: { Spine: class {} } },
        };

        expect(discoverGlobalRuntimes(scope)).toEqual([]);
    });

    it('reads the page by default', () => {
        Object.assign(globalThis, { SpineRuntime_spinePixiV7_4_3_13: SP43 });

        expect(described(discoverGlobalRuntimes())).toEqual([
            expect.objectContaining({ minor: '4.3', namespace: SP43 }),
        ]);
        delete (globalThis as Record<string, unknown>).SpineRuntime_spinePixiV7_4_3_13;
    });
});
