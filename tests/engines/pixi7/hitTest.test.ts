import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPixi7Engine, type Pixi7Engine } from '../../../src/engines/pixi7';
import type { LegacySpine } from '../../../src/engines/legacy';
import { contractFixture } from '../../engine-contract/contract';
import { canvasPage, loadPixi7, updateTransforms, type Loaded } from './loadPixi7';

let PIXI: Loaded;
let engine: Pixi7Engine;
let page: Loaded;

beforeAll(async () => {
    const stack = await loadPixi7();
    PIXI = stack.PIXI;
    engine = createPixi7Engine(PIXI, {
        runtimes: [
            stack.pixiSpine['3.8'],
            stack.pixiSpine['4.1'],
            stack.esoteric['4.2'],
            stack.esoteric['4.3'],
        ],
    });
    page = canvasPage(PIXI, 64, 32);
});

/**
 * The critic's probe through the engine: a skeleton drawn over a button under an interactive
 * stage, with a button of its own hung off `slot_b`. The skeleton sits at (100, 100): `slot_a`'s
 * region spans 80–120 × 90–110, `slot_b`'s 90–130 × 70–90, and its button 105–115 × 75–85.
 */
function scene(minor: string, hideSlotB = false) {
    const { skeleton, atlasText } = contractFixture(minor);
    const data = engine.spine.readSkeleton(skeleton, atlasText, { 'contract.png': page });
    if (hideSlotB) (data.findSlot('slot_b') as Loaded).attachmentName = null;

    const stage = engine.display.container({ label: 'stage', interactive: 'static' });
    const button = engine.display.container({ label: 'button', interactive: 'static' });
    const slotButton = engine.display.container({ label: 'slotButton', interactive: 'static' });
    const spine = engine.spine.create(data) as LegacySpine;

    (button as Loaded).hitArea = new PIXI.Rectangle(0, 0, 200, 200);
    (slotButton as Loaded).hitArea = new PIXI.Rectangle(-5, -5, 10, 10);
    spine.position.set(100, 100);
    stage.addChild(button);
    stage.addChild(spine);
    engine.spine.attachSlotObject(spine, 'slot_b', slotButton);

    const boundary = new PIXI.EventBoundary(stage);
    const hit = (x: number, y: number) => {
        engine.spine.update(spine, 0);
        updateTransforms(stage);
        return (boundary.hitTest(x, y) as Loaded)?.name ?? null;
    };

    return { spine, stage, hit };
}

const stages: Loaded[] = [];

afterEach(() => {
    stages.splice(0).forEach((stage) => stage.destroy({ children: true }));
});

describe.each([
    ['3.8', 'pixi-spine'],
    ['4.1', 'pixi-spine'],
    ['4.2', 'spine-pixi-v7'],
    ['4.3', 'spine-pixi-v7'],
])('hit-testing a %s skeleton (%s) on Pixi 7', (minor) => {
    it('lets a click through to the button behind it once shielded, its slot object still hit', () => {
        const { spine, stage, hit } = scene(minor);
        stages.push(stage);

        expect(engine.spine.runtimeOf(spine)?.minor).toBe(minor);
        expect([hit(100, 100), hit(125, 75), hit(110, 80)]).toEqual([
            'stage',
            'stage',
            'slotButton',
        ]);

        engine.display.shieldFromHitTesting(spine);
        expect([hit(100, 100), hit(125, 75), hit(110, 80)]).toEqual([
            'button',
            'button',
            'slotButton',
        ]);

        engine.display.exposeToHitTesting(spine);
        expect([hit(100, 100), hit(125, 75), hit(110, 80)]).toEqual([
            'stage',
            'stage',
            'slotButton',
        ]);
    });

    it('shields a shape the runtime makes after the shield', () => {
        const { spine, stage, hit } = scene(minor, true);
        stages.push(stage);

        expect(hit(125, 75)).toBe('button');
        engine.display.shieldFromHitTesting(spine);

        (spine.skeleton as Loaded).setAttachment('slot_b', 'square');
        expect([hit(125, 75), hit(100, 100), hit(110, 80)]).toEqual([
            'button',
            'button',
            'slotButton',
        ]);

        engine.display.exposeToHitTesting(spine);
        expect(hit(125, 75)).toBe('stage');
    });
});
