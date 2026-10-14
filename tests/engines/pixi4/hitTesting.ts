import { beforeAll, describe, expect, it } from 'vitest';
import type { SkeletonSource } from '../../../src/engine/runtime';
import type { Pixi4Engine } from '../../../src/engines/pixi4';
import type {
    Pixi4Container,
    Pixi4Spine,
    Pixi4Texture,
    Spine38Slot,
} from '../../../src/engines/pixi4/pixi4.types';
import { ATLAS, clippedSkeleton, contractSkeleton } from '../pixiSpine/fixtures';
import { canvasTexture, updateTransforms, type LoadedPixi4 } from './loadPixi4';

/** Hit-testing through the engine's display port, against v4's own interaction manager. */
export function hitTestingSuite(
    load: () => { PIXI: LoadedPixi4; engine: Pixi4Engine },
    minor: '3.7' | '3.8',
) {
    describe(`hit-testing, Spine ${minor}`, () => {
        let PIXI: LoadedPixi4;
        let engine: Pixi4Engine;
        let page: Pixi4Texture;

        beforeAll(() => {
            ({ PIXI, engine } = load());
            page = canvasTexture(PIXI, 64, 64);
        });

        function spineOf(skeleton: SkeletonSource = contractSkeleton(minor)): Pixi4Spine {
            const data = engine.spine.readSkeleton(skeleton, ATLAS, { 'contract.png': page });
            const spine = engine.spine.create(data);
            spine.autoUpdate = false;
            return spine;
        }

        /** The name of what a click at `x, y` under `root` lands on. */
        function hitTest(root: Pixi4Container, x: number, y: number): string | null {
            const view = document.createElement('canvas');
            const manager = new PIXI.interaction.InteractionManager({ view, resolution: 1 });
            const hit = manager.hitTest(new PIXI.Point(x, y), root);
            manager.destroy();
            return hit && hit.name;
        }

        function named(view: LoadedPixi4, name: string) {
            view.name = name;
            return view;
        }

        function square(name: string, size: number) {
            const sprite = named(new PIXI.Sprite(PIXI.Texture.WHITE), name);
            sprite.anchor.set(0.5);
            sprite.width = sprite.height = size;
            sprite.interactive = true;
            return sprite;
        }

        it('keeps a skeleton in front of a button from answering for it, sprites made later too', () => {
            const stage = new PIXI.Container();
            const button = named(new PIXI.Sprite(PIXI.Texture.WHITE), 'button');
            button.width = button.height = 200;
            button.position.set(-100, -100);
            button.interactive = true;

            const layer = named(new PIXI.Container(), 'layer');
            layer.interactive = true;
            const spine = spineOf();
            layer.addChild(spine);
            stage.addChild(button, layer);

            engine.spine.update(spine, 0);
            updateTransforms(PIXI, stage);
            expect(hitTest(stage, 0, 0)).toBe('layer');

            engine.display.shieldFromHitTesting(spine);
            expect(hitTest(stage, 0, 0)).toBe('button');

            const fresh = spine.newSprite(PIXI.Texture.WHITE);
            expect(fresh.containsPoint?.(new PIXI.Point(0, 0))).toBe(false);

            engine.display.exposeToHitTesting(spine);
            expect(Object.hasOwn(spine, 'newSprite')).toBe(false);
            expect(hitTest(stage, 0, 0)).toBe('layer');
        });

        it('leaves slot objects hittable on a shielded skeleton', () => {
            const spine = spineOf();
            const button = square('button', 4);

            engine.spine.attachSlotObject(spine, 'slot_a', button);
            engine.display.shieldFromHitTesting(spine);
            engine.spine.update(spine, 0);
            updateTransforms(PIXI, spine);

            expect(hitTest(spine, 0, 0)).toBe('button');
        });

        it('still clips hits to a clipping attachment, inside which a slot object is hit', () => {
            const stage = new PIXI.Container();
            const behind = square('behind', 400);
            const layer = named(new PIXI.Container(), 'layer');
            const spine = spineOf(clippedSkeleton(minor));
            const button = square('button', 10);
            const object = new PIXI.Container();
            const mask = (spine.skeleton.findSlot('slot_clip') as Spine38Slot).currentGraphics!;
            layer.interactive = true;
            object.addChild(button);
            layer.addChild(spine);
            stage.addChild(behind, layer);

            engine.spine.attachSlotObject(spine, 'slot_b', object);
            engine.display.shieldFromHitTesting(spine);
            engine.spine.update(spine, 0);
            updateTransforms(PIXI, stage);

            expect(hitTest(stage, 8, -20)).toBe('button');
            expect(hitTest(stage, 14, -20)).toBe('behind');
            expect(hitTest(stage, 2, -12)).toBe('behind');

            const later = spine.newGraphics();
            const refuses = later.hitArea as { contains(x: number, y: number): boolean };
            expect(Object.hasOwn(later, 'containsPoint')).toBe(false);
            expect(refuses.contains(0, 0)).toBe(false);

            engine.display.exposeToHitTesting(spine);
            expect(Object.hasOwn(mask, 'containsPoint')).toBe(false);
            expect(mask.hitArea ?? null).toBeNull();
            expect(hitTest(stage, 2, -12)).toBe('layer');
        });
    });
}
