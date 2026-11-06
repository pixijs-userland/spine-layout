import { describe, expect, it } from 'vitest';
import { chainSkeleton } from './fixtures';
import { chainTip, pixiSpinePortSuite, portOf } from './portSuite';
import { loadPixi6Stack, type Stack } from './stacks';

let stack: Stack | undefined;
const load = () => (stack ??= loadPixi6Stack(['3.7', '3.8', '4.0', '4.1']));

describe('pixi.js 6.5.10 + @pixi-spine 3.1.2', () => {
    pixiSpinePortSuite(load, '3.7');
    pixiSpinePortSuite(load, '3.8');
    pixiSpinePortSuite(load, '4.0');
    pixiSpinePortSuite(load, '4.1');

    it("turns a chain path constraint's bones with runtime-4.0 as 4.1 does", () => {
        const only41 = {
            ...load(),
            runtimes: load().runtimes.filter((r) => r.info.minor === '4.1'),
        };
        const [own, after] = [load(), only41].map((from) =>
            chainTip(portOf(from, new Map(), []), chainSkeleton('4.0')),
        );

        expect(own).toMatchObject({ minor: '4.0' });
        expect(after).toMatchObject({ minor: '4.1' });
        expect(Math.abs(own.x)).toBeCloseTo(Math.abs(own.y), 4);
        expect(own.x).toBeCloseTo(after.x, 4);
        expect(own.y).toBeCloseTo(after.y, 4);
    });
});
