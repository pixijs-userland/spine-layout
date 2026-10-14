import type { PixiMajor, SpineRuntimeInfo } from '../../engine/Engine';
import { compareMinors } from './minorOf';

/**
 * The port family that drives a runtime: pixi-spine 1.x/2.x (one `PIXI.spine` per page), the
 * `@pixi-spine/*` 3.x/4.x packages (a base plus one runtime per minor), or Esoteric's
 * spine-pixi-v7/v8.
 */
export type SpineRuntimeFamily = 'pixi-spine-legacy' | 'pixi-spine-modular' | 'esoteric';

export type RuntimeMatrixEntry = Omit<SpineRuntimeInfo, 'minor' | 'family'> & {
    family: SpineRuntimeFamily;
};

export const PIXI_MAJORS: readonly PixiMajor[] = [4, 5, 6, 7, 8];

const legacy = (packageVersion: string): RuntimeMatrixEntry => ({
    family: 'pixi-spine-legacy',
    packageName: 'pixi-spine',
    packageVersion,
});

const modular = (minor: string, packageVersion: string): RuntimeMatrixEntry => ({
    family: 'pixi-spine-modular',
    packageName: `@pixi-spine/runtime-${minor}`,
    packageVersion,
});

const esoteric = (pixi: 7 | 8, packageVersion: string): RuntimeMatrixEntry => ({
    family: 'esoteric',
    packageName: `@esotericsoftware/spine-pixi-v${pixi}`,
    packageVersion,
});

/**
 * The Spine runtimes each Pixi major has, by the export minor each reads: "Runtimes per Pixi" in
 * magic-platform's docs/multi-pixi-plan.md.
 */
export const RUNTIME_MATRIX: Readonly<
    Record<PixiMajor, Readonly<Record<string, RuntimeMatrixEntry>>>
> = {
    4: { '3.7': legacy('1.5.23'), '3.8': legacy('1.6.2') },
    5: { '3.7': legacy('2.0.5'), '3.8': legacy('2.1.14') },
    6: {
        '3.7': modular('3.7', '3.1.2'),
        '3.8': modular('3.8', '3.1.2'),
        '4.0': modular('4.0', '3.1.2'),
        '4.1': modular('4.1', '3.1.2'),
    },
    7: {
        '3.7': modular('3.7', '4.0.6'),
        '3.8': modular('3.8', '4.0.6'),
        // pixi-spine 4.0.6's runtime-4.0 mis-turns chain path constraints; runtime-4.1 after the
        // 4.0 pre-pass matches Esoteric's 4.0 core, as on Pixi 6.
        '4.1': modular('4.1', '4.0.6'),
        '4.2': esoteric(7, '4.2.120'),
        '4.3': esoteric(7, '4.3.13'),
    },
    8: { '4.2': esoteric(8, '4.2.120'), '4.3': esoteric(8, '4.3.x') },
};

/** Export minors whose every runtime reads JSON only: no `.skel` reader exists for them. */
export const JSON_ONLY_MINORS: ReadonlySet<string> = new Set(['3.7']);

/** pixi-spine 1.x and 2.x each own `PIXI.spine`: a page loads one of their runtimes, not both. */
export const ONE_RUNTIME_PER_PAGE: ReadonlySet<PixiMajor> = new Set<PixiMajor>([4, 5]);

/** The Pixi the editor opens an export minor on when nothing pins one (the plan's Decision 4). */
export const DEFAULT_PIXI: Readonly<Record<string, PixiMajor>> = {
    '3.7': 4,
    '3.8': 4,
    '4.0': 7,
    '4.1': 7,
    '4.2': 8,
    '4.3': 8,
};

/** A Pixi major's runtimes, oldest export minor first. */
export function runtimesOf(pixi: PixiMajor): SpineRuntimeInfo[] {
    return Object.entries(RUNTIME_MATRIX[pixi])
        .map(([minor, entry]) => ({ minor, ...entry }))
        .sort((a, b) => compareMinors(a.minor, b.minor));
}
