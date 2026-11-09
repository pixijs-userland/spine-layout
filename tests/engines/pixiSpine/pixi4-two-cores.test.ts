import { describe, expect, it } from 'vitest';
import { ATLAS, contractSkeleton } from './fixtures';
import { pixiSpinePortSuite, portOf } from './portSuite';
import { canvasPage, loadTwoLegacyCores, type Stack } from './stacks';

let stack: Stack | undefined;
const load = () => (stack ??= loadTwoLegacyCores());

describe('pixi.js 4.8.9 + pixi-spine 1.6.2 and 1.5.23 on one page', () => {
    pixiSpinePortSuite(load, '3.7');
    pixiSpinePortSuite(load, '3.8');

    it("keeps each core's skeletons, spines and shapes to that core", () => {
        const { PIXI, spines } = load();
        const port = portOf(load());
        const textures = { 'contract.png': canvasPage(PIXI, 64, 64) };
        const [old, current] = (['3.7', '3.8'] as const).map((minor) => {
            const spine = port.create(port.readSkeleton(contractSkeleton(minor), ATLAS, textures));
            port.shieldShapes(spine);
            return spine;
        });

        expect(spines['3.7']).not.toBe(spines['3.8']);
        expect(old).toBeInstanceOf(spines['3.7']);
        expect(old).not.toBeInstanceOf(spines['3.8']);
        expect(current).toBeInstanceOf(spines['3.8']);
        expect([
            port.runtimeOf(old)?.packageVersion,
            port.runtimeOf(current)?.packageVersion,
        ]).toEqual(['1.5.23', '1.6.2']);

        [old, current].forEach((spine) => {
            const fresh = spine.newSprite(PIXI.Texture.WHITE as never);
            expect(fresh.containsPoint?.(new PIXI.Point(0, 0))).toBe(false);
        });
    });
});
