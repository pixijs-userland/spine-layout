// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/contract-3.8.json';
import { createPixi4Engine, SpineLayoutCore, type Pixi4Types } from '../../../src/pixi4';
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
});
