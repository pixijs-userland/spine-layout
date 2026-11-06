import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PIXI,
    PIXI_MAJORS,
    RUNTIME_MATRIX,
    runtimesOf,
} from '../../../src/core/versions/runtimeMatrix';

const row = (pixi: keyof typeof RUNTIME_MATRIX) =>
    runtimesOf(pixi).map(({ minor, family, packageName, packageVersion }) =>
        [minor, family, packageName, packageVersion].join(' '),
    );

describe('the runtime matrix', () => {
    it('is the plan\'s "Runtimes per Pixi"', () => {
        expect(row(4)).toEqual([
            '3.7 pixi-spine-legacy pixi-spine 1.5.23',
            '3.8 pixi-spine-legacy pixi-spine 1.6.2',
        ]);
        expect(row(5)).toEqual([
            '3.7 pixi-spine-legacy pixi-spine 2.0.5',
            '3.8 pixi-spine-legacy pixi-spine 2.1.14',
        ]);
        expect(row(6)).toEqual([
            '3.7 pixi-spine-modular @pixi-spine/runtime-3.7 3.1.2',
            '3.8 pixi-spine-modular @pixi-spine/runtime-3.8 3.1.2',
            '4.0 pixi-spine-modular @pixi-spine/runtime-4.0 3.1.2',
            '4.1 pixi-spine-modular @pixi-spine/runtime-4.1 3.1.2',
        ]);
        expect(row(7)).toEqual([
            '3.7 pixi-spine-modular @pixi-spine/runtime-3.7 4.0.6',
            '3.8 pixi-spine-modular @pixi-spine/runtime-3.8 4.0.6',
            '4.1 pixi-spine-modular @pixi-spine/runtime-4.1 4.0.6',
            '4.2 esoteric @esotericsoftware/spine-pixi-v7 4.2.120',
            '4.3 esoteric @esotericsoftware/spine-pixi-v7 4.3.13',
        ]);
        expect(row(8)).toEqual([
            '4.2 esoteric @esotericsoftware/spine-pixi-v8 4.2.120',
            '4.3 esoteric @esotericsoftware/spine-pixi-v8 4.3.x',
        ]);
    });

    it('defaults every export minor to a Pixi that reads it, by its own runtime or a pre-pass', () => {
        expect(DEFAULT_PIXI).toEqual({
            '3.7': 4,
            '3.8': 4,
            '4.0': 7,
            '4.1': 7,
            '4.2': 8,
            '4.3': 8,
        });
        Object.entries(DEFAULT_PIXI).forEach(([minor, pixi]) =>
            expect(
                RUNTIME_MATRIX[pixi][minor] ?? (minor === '4.0' && RUNTIME_MATRIX[pixi]['4.1']),
            ).toBeTruthy(),
        );
    });

    it('has Pixi 6 alone with an own runtime for 3.7 to 4.1, and Pixi 7 reading 4.0 through 4.1', () => {
        const legacyMinors = ['3.7', '3.8', '4.0', '4.1'];

        expect(
            PIXI_MAJORS.filter((pixi) =>
                legacyMinors.every((minor) => RUNTIME_MATRIX[pixi][minor]),
            ),
        ).toEqual([6]);
        expect(RUNTIME_MATRIX[7]['4.0']).toBeUndefined();
        expect(RUNTIME_MATRIX[7]['4.1']).toBeDefined();
    });
});
