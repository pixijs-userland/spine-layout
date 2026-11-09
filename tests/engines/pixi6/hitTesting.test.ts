import { beforeAll, describe, expect, it } from 'vitest';
import { createPixi6Engine, type Pixi6Engine } from '../../../src/pixi6';
import { ATLAS, clippedSkeleton, contractSkeleton } from '../pixiSpine/fixtures';
import {
    canvasPage,
    hitTest,
    loadPixi6,
    MINORS,
    updateTransforms,
    type LoadedPixi6,
} from './loadPixi6';

let PIXI: LoadedPixi6;
let engine: Pixi6Engine;
let page: LoadedPixi6;

beforeAll(async () => {
    PIXI = await loadPixi6();
    engine = createPixi6Engine(PIXI);
    page = canvasPage(PIXI, 64, 64);
});

const spineOf = (skeleton: object) =>
    engine.spine.create(engine.spine.readSkeleton(skeleton, ATLAS, { 'contract.png': page }));

function square(size: number) {
    const sprite = engine.display.sprite(PIXI.Texture.WHITE, 0.5) as LoadedPixi6;
    sprite.width = sprite.height = size;
    engine.display.setInteractive(sprite, 'static');
    return sprite;
}

/**
 * A stage with a square behind everything and a layer in front holding the spines, both
 * interactive as a layout is: whatever of a spine is hit, the layer is the target. A button hangs
 * off `slot_b` of the first spine, at `bone_a`: 10, -20 on the stage, in a container that takes
 * the bone's transform.
 */
function scene(...spines: LoadedPixi6[]) {
    const stage = engine.display.container({ interactive: 'static' });
    const behind = square(400);
    const layer = engine.display.container({ label: 'layer', interactive: 'static' });
    const button = square(10);
    const object = engine.display.container();

    object.addChild(button);
    stage.addChild(behind);
    stage.addChild(layer);
    spines.forEach((spine) => {
        layer.addChild(spine);
        engine.spine.update(spine, 0);
    });
    engine.spine.attachSlotObject(spines[0], 'slot_b', object);
    engine.spine.update(spines[0], 0);
    updateTransforms(PIXI, stage);

    return {
        stage,
        behind,
        layer,
        button,
        at: (x: number, y: number) => hitTest(PIXI, stage, x, y),
    };
}

describe('hit-testing on the pixi6 engine', () => {
    describe.each(MINORS)('a %s export', (minor) => {
        it('lets a click through its shapes to what lies behind, but not one on its slot object', () => {
            const spine = spineOf(contractSkeleton(minor));
            const { behind, layer, button, at } = scene(spine);

            expect(engine.spine.runtimeOf(spine)?.minor).toBe(minor);
            expect([at(-15, 0), at(25, -25), at(10, -20)]).toEqual([layer, layer, button]);

            engine.display.shieldFromHitTesting(spine);
            expect([at(-15, 0), at(25, -25), at(10, -20)]).toEqual([behind, behind, button]);

            engine.display.exposeToHitTesting(spine);
            expect([at(-15, 0), at(25, -25), at(10, -20)]).toEqual([layer, layer, button]);
        });

        it('still clips hits to a clipping attachment, inside which its slot object is hit', () => {
            const spine = spineOf(clippedSkeleton(minor));
            const { behind, layer, button, at } = scene(spine);

            engine.display.shieldFromHitTesting(spine);
            expect(at(8, -20)).toBe(button);
            expect(at(14, -20)).toBe(behind);
            expect(at(2, -12)).toBe(behind);

            engine.display.exposeToHitTesting(spine);
            expect(at(2, -12)).toBe(layer);
        });
    });

    it('shields each spine through its own runtime, spines of two runtimes side by side', () => {
        const old = spineOf(contractSkeleton('3.7'));
        const recent = spineOf(contractSkeleton('4.1'));
        recent.x = 100;
        const { behind, layer, button, at } = scene(old, recent);

        expect([old, recent].map((spine) => engine.spine.runtimeOf(spine)?.minor)).toEqual([
            '3.7',
            '4.1',
        ]);

        engine.display.shieldFromHitTesting(recent);
        expect([at(-15, 0), at(85, 0), at(10, -20)]).toEqual([layer, behind, button]);

        engine.display.shieldFromHitTesting(old);
        expect([at(-15, 0), at(85, 0), at(10, -20)]).toEqual([behind, behind, button]);

        engine.display.exposeToHitTesting(recent);
        expect([at(-15, 0), at(85, 0), at(10, -20)]).toEqual([behind, layer, button]);
    });
});
