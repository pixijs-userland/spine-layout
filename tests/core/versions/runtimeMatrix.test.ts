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
            '4.0 pixi-spine-modular @pixi-spine/runtime-4.0 4.0.6',
            '4.1 pixi-spine-modular @pixi-spine/runtime-4.1 4.0.6',
            '4.2 esoteric @esotericsoftware/spine-pixi-v7 4.2.120',
            '4.3 esoteric @esotericsoftware/spine-pixi-v7 4.3.13',
        ]);
        expect(row(8)).toEqual([
            '4.2 esoteric @esotericsoftware/spine-pixi-v8 4.2.120',
            '4.3 esoteric @esotericsoftware/spine-pixi-v8 4.3.x',
        ]);
    });

    it('defaults every export minor to a Pixi with its own runtime', () => {
        expect(DEFAULT_PIXI).toEqual({
            '3.7': 4,
            '3.8': 4,
            '4.0': 7,
            '4.1': 7,
            '4.2': 8,
            '4.3': 8,
        });
        Object.entries(DEFAULT_PIXI).forEach(([minor, pixi]) =>
            expect(RUNTIME_MATRIX[pixi][minor]).toBeDefined(),
        );
    });

    it('has Pixi 7 alone reading every minor with its own runtime', () => {
        const everyMinor = Object.keys(DEFAULT_PIXI);

        expect(
            PIXI_MAJORS.filter((pixi) => everyMinor.every((minor) => RUNTIME_MATRIX[pixi][minor])),
        ).toEqual([7]);
    });
});
