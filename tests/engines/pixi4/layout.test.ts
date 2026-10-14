// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/contract-3.8.json';
import { createPixi4Engine, SpineLayoutCore, type Pixi4Types } from '../../../src/pixi4';
import { contractSkeleton } from '../pixiSpine/fixtures';
import { buildLayout, SQUARE_HIT_AREA, withEmptyButton, withSpineSlot } from './layoutCases';
import { canvasTexture, loadPixi4 } from './loadPixi4';

const ATLAS = `
contract.png
size: 64,64
format: RGBA8888
filter: Linear,Linear
repeat: none
square
  rotate: false
  xy: 2, 2
  size: 40, 20
  orig: 40, 20
  offset: 0, 0
  index: -1
`;

describe('SpineLayoutCore on the pixi4 engine', () => {
    it('builds a 3.8 skeleton into a v4 container and plays it', () => {
        const PIXI = loadPixi4();
        const engine = createPixi4Engine(PIXI);
        const layout = new SpineLayoutCore<Pixi4Types>({ engine });

        layout.createInstancesFromDataArray([
            {
                name: 'root',
                skeleton: structuredClone(fixture),
                atlasText: ATLAS,
                textures: { 'contract.png': canvasTexture(PIXI, 64, 64) },
            },
        ]);

        expect(layout).toBeInstanceOf(PIXI.Container);

        const spine = layout.spines.get('root')!;
        expect(spine).toBeInstanceOf(PIXI.spine.Spine);

        const events: string[] = [];
        spine.state.addListener({ event: (_, event) => events.push(event.data.name) });
        spine.state.setAnimation(0, 'move', false);
        engine.spine.update(spine, 0.75);

        expect(events).toEqual(['hit']);
        expect(spine.skeleton.findBone('bone_a')!.data.name).toBe('bone_a');
    });

    it('registers the skins of a 3.8 export and hangs a spine_ child on its slot', () => {
        const PIXI = loadPixi4();
        const engine = createPixi4Engine(PIXI);
        const { layout, errors } = buildLayout(PIXI, engine, {
            root: withSpineSlot('3.8'),
            child: contractSkeleton('3.8'),
        });
        const root = layout.spines.get('root')!;

        expect(errors).toEqual([]);
        expect([...layout.skins.getAll()]).toContain('default');
        expect([...layout.spines.keys()]).toEqual(['root', 'child']);
        expect(engine.spine.getSlotObject(root, 'spine_child')).toBe(layout.spines.get('child'));
    });

    it('takes the hit area of a button slot empty at setup from its skin', () => {
        const PIXI = loadPixi4();
        const engine = createPixi4Engine(PIXI);
        const { layout, errors } = buildLayout(PIXI, engine, { root: withEmptyButton('3.8') });
        const button = engine.spine.getSlotObject(layout.spines.get('root')!, 'button_go');

        expect(errors).toEqual([]);
        expect(button?.hitArea).toBeInstanceOf(PIXI.Polygon);
        expect((button?.hitArea as { points: number[] }).points).toEqual(SQUARE_HIT_AREA);
    });
});
