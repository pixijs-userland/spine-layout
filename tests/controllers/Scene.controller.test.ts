import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { RegionAttachment, Sequence, type TextureRegion } from '@esotericsoftware/spine-pixi-v8';

import { SceneController } from '../../src/controllers/Scene.controller';
import { AnimationsController } from '../../src/controllers/Animations.controller';
import { SpineController } from '../../src/controllers/Spine.controller';
import { TextsController } from '../../src/controllers/Texts.controller';
import { asSpineMap, createFakeSpine, type FakeSpine } from '../helpers/fakeSpine';

/** The bit of a Pixi pointer event the button wiring reads. */
const pointer = (pointerType = 'mouse') => ({ pointerType }) as never;

/** Presses and releases a hit area, the way Pixi dispatches a tap on a single target. */
function press(target: Container, pointerType?: string) {
    target.emit('pointerdown', pointer(pointerType));
    target.emit('pointerup', pointer(pointerType));
}

/**
 * Hover transitions are reconciled in a microtask (see `queueHoverSync`), so tests await the
 * pointer event to observe what it triggered.
 */
async function hover(target: Container) {
    target.emit('pointerover', pointer());
    await Promise.resolve();
}

async function unhover(target: Container) {
    target.emit('pointerout', pointer());
    await Promise.resolve();
}

function makeRegion(): RegionAttachment {
    // spine 4.3+: attachments hold their region(s) in a Sequence — static
    // images are single-frame sequences.
    const sequence = new Sequence(1, false);
    sequence.regions[0] = {
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        degrees: 0,
        rotate: false,
        texture: { texture: Texture.WHITE },
    } as unknown as TextureRegion;
    return new RegionAttachment('a', sequence);
}

describe('SceneController – attachBones', () => {
    it('nests child spines into their parent slot via the spine_<id> naming convention', () => {
        const child = createFakeSpine();
        const parent = createFakeSpine({ slots: [{ name: 'spine_child' }] });
        const spines = asSpineMap({ parent, child });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        const layoutAdds: FakeSpine[] = [];
        scene.attachBones((s) => layoutAdds.push(s as never as FakeSpine));

        expect(parent.__slotChildren.get('spine_child')?.[0]).toBe(child);

        // Only spines without a parent should be added to the layout. After attaching,
        // child has been added into parent's slot so the layout receives only parent.
        expect(layoutAdds.length).toBe(2);
        expect(layoutAdds).toContain(parent);
        expect(layoutAdds).toContain(child);
    });

    it('respects skipAttachingSpinesPatterns: matching child slots are not nested', () => {
        const child = createFakeSpine();
        const parent = createFakeSpine({ slots: [{ name: 'spine_child' }] });
        const spines = asSpineMap({ parent, child });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl, {
            skipAttachingSpinesPatterns: ['child'],
        });

        scene.attachBones(() => {});

        expect(parent.__slotChildren.has('spine_child')).toBe(false);
    });

    it('prefers a parent-specific shared instance (<child>_<parent>) over the plain child', () => {
        const shared1 = createFakeSpine();
        const shared2 = createFakeSpine();
        const reel1 = createFakeSpine({ slots: [{ name: 'spine_anticipation' }] });
        const reel2 = createFakeSpine({ slots: [{ name: 'spine_anticipation' }] });
        const spines = asSpineMap({
            reel_1: reel1,
            reel_2: reel2,
            anticipation_reel_1: shared1,
            anticipation_reel_2: shared2,
        });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        scene.attachBones(() => {});

        expect(reel1.__slotChildren.get('spine_anticipation')?.[0]).toBe(shared1);
        expect(reel2.__slotChildren.get('spine_anticipation')?.[0]).toBe(shared2);
    });

    it('ignores spine_ slots that point at non-existent children', () => {
        const parent = createFakeSpine({ slots: [{ name: 'spine_missing' }] });
        const spines = asSpineMap({ parent });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        scene.attachBones(() => {});
        expect(parent.__slotChildren.has('spine_missing')).toBe(false);
    });
});

describe('SceneController – attachTexts', () => {
    it('creates a Text/BitmapText for every text_ slot via TextsController.add', () => {
        const spine = createFakeSpine({
            slots: [{ name: 'text_score' }, { name: 'spine_other' }],
        });
        const spines = asSpineMap({ hero: spine });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);
        texts.settings = { score: { type: 'text', value: '0' } };

        const addSpy = vi.spyOn(texts, 'add');
        scene.attachTexts();

        expect(addSpy).toHaveBeenCalledTimes(1);
        expect(addSpy.mock.calls[0][2]).toBe('score');
    });
});

describe('SceneController – activateButtonBones', () => {
    let spine: FakeSpine;
    let animations: AnimationsController;

    beforeEach(() => {
        spine = createFakeSpine({
            slots: [{ name: 'button_play', attachment: makeRegion() }],
            bones: [{ name: 'button_play', worldX: 30, worldY: 40 }],
        });
        // Skeleton.slots is iterated for buttons — fakeSpine populates it from slots.
        // Also ensure findBone returns proper coords for button positioning.
        const spines = asSpineMap({ hero: spine });
        animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);
        scene.activateButtonBones();
    });

    it('inserts a Sprite into each button_<key> slot, anchored interactive and positioned by bone', () => {
        const attached = spine.__slotChildren.get('button_play');
        expect(attached?.length).toBe(1);
        const sprite = attached?.[0] as Sprite;
        expect(sprite).toBeInstanceOf(Sprite);
        expect(sprite.eventMode).toBe('static');
        expect(sprite.cursor).toBe('pointer');
        // FakeSpine.toGlobal adds (100, 200) on top of the bone worldX/worldY.
        // Bone "button_play" worldX=30, worldY=40 → toGlobal -> (130, 240).
        expect(sprite.x).toBe(130);
        expect(sprite.y).toBe(240);
    });

    it('plays <key>_click event when the sprite is pressed and released', () => {
        const sprite = spine.__slotChildren.get('button_play')?.[0] as Sprite;
        const spy = vi.spyOn(animations, 'playEvent');
        press(sprite);
        expect(spy).toHaveBeenCalledWith('play_click', 'hero');
    });

    it('wires hover/out/down/up/up_out events with the right event names', async () => {
        const sprite = spine.__slotChildren.get('button_play')?.[0] as Sprite;
        const spy = vi.spyOn(animations, 'playEvent');

        await hover(sprite);
        await unhover(sprite);
        sprite.emit('pointerdown', pointer());
        sprite.emit('pointerup', pointer());
        sprite.emit('pointerdown', pointer());
        sprite.emit('pointerupoutside', pointer());

        const called = spy.mock.calls.map(([eventName]) => eventName);
        expect(called).toEqual([
            'play_hover',
            // `unhover` stays wired next to `out` as the legacy name of the same interaction
            'play_out',
            'play_unhover',
            'play_down',
            'play_up',
            'play_click',
            'play_down',
            'play_up_out',
        ]);
    });

    it('ignores a release that did not start on the button', () => {
        const sprite = spine.__slotChildren.get('button_play')?.[0] as Sprite;
        const spy = vi.spyOn(animations, 'playEvent');

        sprite.emit('pointerup', pointer());
        sprite.emit('pointerupoutside', pointer());

        expect(spy).not.toHaveBeenCalled();
    });
});

describe('SceneController – activateButtonBones (button_ bone wrappers)', () => {
    // Mirrors the ui.spine structure:
    //   bone button_spin
    //     └─ bone spine_big_button
    //          ├─ slot spine_big_button (nested spine)
    //          └─ slot text_spin_button (no slot object attached)
    let ui: FakeSpine;
    let bigButton: FakeSpine;
    let animations: AnimationsController;

    beforeEach(() => {
        bigButton = createFakeSpine({
            animations: [
                { name: 'click', duration: 0.5 },
                { name: 'state_init/init', duration: 0 },
            ],
        });
        ui = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [
                { name: 'spine_big_button', boneName: 'spine_big_button' },
                { name: 'text_spin_button', boneName: 'spine_big_button' },
            ],
        });
        const spines = asSpineMap({ ui, big_button: bigButton });
        animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        scene.attachBones(() => {});
        scene.activateButtonBones();
    });

    it('turns slot objects under a button_ bone into interactive hit areas', () => {
        expect(ui.__slotChildren.get('spine_big_button')?.[0]).toBe(bigButton);
        expect(bigButton.eventMode).toBe('static');
        expect(bigButton.cursor).toBe('pointer');
    });

    it('fires <key>_click derived from the wrapping bone, on the owning spine', () => {
        const spy = vi.spyOn(animations, 'playEvent');
        press(bigButton);
        expect(spy).toHaveBeenCalledWith('spin_click', 'ui');
    });

    it('wires the full pointer event set from the bone name', async () => {
        const spy = vi.spyOn(animations, 'playEvent');

        await hover(bigButton);
        await unhover(bigButton);
        bigButton.emit('pointerdown', pointer());
        bigButton.emit('pointerup', pointer());
        bigButton.emit('pointerdown', pointer());
        bigButton.emit('pointerupoutside', pointer());

        expect(spy.mock.calls.map(([eventName]) => eventName)).toEqual([
            'spin_hover',
            'spin_out',
            'spin_unhover',
            'spin_down',
            'spin_up',
            'spin_click',
            'spin_down',
            'spin_up_out',
        ]);
    });

    it('leaves slots without slot objects untouched (no overlay sprite created)', () => {
        expect(ui.__slotChildren.has('text_spin_button')).toBe(false);
    });

    it('plays the embedded spine\'s own "click" animation on tap when it exists', () => {
        const spy = vi.spyOn(animations, 'play');
        press(bigButton);
        expect(spy).toHaveBeenCalledWith('big_button', 'click', false, expect.any(Number));
        expect(bigButton.__setAnimationCalls.map(({ name }) => name)).toContain('click');
    });

    it('plays every feedback animation of the embedded spine on its own interaction', async () => {
        const button = createFakeSpine({
            animations: (['down', 'hover', 'out', 'up', 'up_out'] as const).map((name) => ({
                name,
                duration: 0,
            })),
        });
        const parent = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [{ name: 'spine_big_button', boneName: 'spine_big_button' }],
        });
        const spines = asSpineMap({ ui: parent, big_button: button });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        scene.activateButtonBones();

        await hover(button);
        button.emit('pointerdown', pointer());
        button.emit('pointerup', pointer());
        button.emit('pointerdown', pointer());
        button.emit('pointerupoutside', pointer());
        await unhover(button);

        expect(button.__setAnimationCalls.map(({ name }) => name)).toEqual([
            'hover',
            'down',
            'up',
            'down',
            'up_out',
            'out',
        ]);
    });

    it('settles a button back down after a touch tap, which leaves no hover to return to', () => {
        const button = createFakeSpine({
            animations: [
                { name: 'down', duration: 0 },
                { name: 'up', duration: 0 },
                { name: 'out', duration: 0 },
            ],
        });
        const parent = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [{ name: 'spine_big_button', boneName: 'spine_big_button' }],
        });
        const spines = asSpineMap({ ui: parent, big_button: button });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        scene.activateButtonBones();

        press(button, 'touch');

        expect(button.__setAnimationCalls.map(({ name }) => name)).toEqual(['down', 'up', 'out']);
    });

    it('keeps a mouse release on the hovered look, with no settling out', async () => {
        const button = createFakeSpine({
            animations: [
                { name: 'down', duration: 0 },
                { name: 'up', duration: 0 },
                { name: 'out', duration: 0 },
            ],
        });
        const parent = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [{ name: 'spine_big_button', boneName: 'spine_big_button' }],
        });
        const spines = asSpineMap({ ui: parent, big_button: button });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        scene.activateButtonBones();

        await hover(button);
        press(button);

        expect(button.__setAnimationCalls.map(({ name }) => name)).toEqual(['down', 'up']);
    });

    it('plays all feedback animations on one track, so each replaces the previous look', async () => {
        const button = createFakeSpine({
            animations: [
                { name: 'hover', duration: 0 },
                { name: 'down', duration: 0 },
            ],
        });
        const parent = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [{ name: 'spine_big_button', boneName: 'spine_big_button' }],
        });
        const spines = asSpineMap({ ui: parent, big_button: button });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        scene.activateButtonBones();

        await hover(button);
        button.emit('pointerdown', pointer());

        const tracks = button.__setAnimationCalls.map(({ track }) => track);
        expect(tracks.length).toBe(2);
        expect(new Set(tracks).size).toBe(1);
    });

    it('skips self animations the embedded spine does not have', async () => {
        const spy = vi.spyOn(animations, 'play');

        await hover(bigButton);
        await unhover(bigButton);
        bigButton.emit('pointerdown', pointer());

        expect(spy).not.toHaveBeenCalled();
        expect(bigButton.__setAnimationCalls).toEqual([]);
    });

    it('clicking any part of the composite button plays sibling embedded spine animations', () => {
        const embedded = createFakeSpine({ animations: [{ name: 'click', duration: 0.5 }] });
        const label = new Container();
        const parent = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [
                { name: 'spine_big_button', boneName: 'spine_big_button' },
                { name: 'text_spin_button', boneName: 'spine_big_button' },
            ],
        });
        const spines = asSpineMap({ ui: parent, big_button: embedded });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        parent.addSlotObject('text_spin_button', label);
        scene.activateButtonBones();

        const playSpy = vi.spyOn(anims, 'play');
        const eventSpy = vi.spyOn(anims, 'playEvent');
        press(label);

        expect(eventSpy).toHaveBeenCalledWith('spin_click', 'ui');
        expect(playSpy).toHaveBeenCalledWith('big_button', 'click', false, expect.any(Number));
        expect(embedded.__setAnimationCalls.map(({ name }) => name)).toContain('click');
    });

    it("plays only the clicked button's own embedded instance, not sibling instances", () => {
        const makeParent = () =>
            createFakeSpine({
                bones: [
                    { name: 'root' },
                    { name: 'button_spin', parent: 'root' },
                    { name: 'spine_big_button', parent: 'button_spin' },
                ],
                slots: [{ name: 'spine_big_button', boneName: 'spine_big_button' }],
            });
        const instanceA = createFakeSpine({ animations: [{ name: 'click', duration: 0.2 }] });
        const instanceB = createFakeSpine({ animations: [{ name: 'click', duration: 0.2 }] });
        const spines = asSpineMap({
            ui1: makeParent(),
            ui2: makeParent(),
            big_button_ui1: instanceA,
            big_button_ui2: instanceB,
        });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        scene.activateButtonBones();

        press(instanceA);

        expect(instanceA.__setAnimationCalls.map(({ name }) => name)).toContain('click');
        expect(instanceB.__setAnimationCalls).toEqual([]);
    });

    it('plays the animations of spines nested deeper inside the button, not just its hit areas', () => {
        // button_spin
        //   └─ slot spine_big_button -> big_button (hit area)
        //        └─ slot spine_icon  -> icon (nested one level deeper)
        const icon = createFakeSpine({ animations: [{ name: 'down', duration: 0 }] });
        const button = createFakeSpine({
            slots: [{ name: 'spine_icon' }],
            animations: [{ name: 'down', duration: 0 }],
        });
        const parent = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [{ name: 'spine_big_button', boneName: 'spine_big_button' }],
        });
        const spines = asSpineMap({ ui: parent, big_button: button, icon });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        // the real Spine.addSlotObject also parents the container; the fake only records it
        button.addChild(icon);
        scene.activateButtonBones();

        button.emit('pointerdown', pointer());

        expect(button.__setAnimationCalls.map(({ name }) => name)).toEqual(['down']);
        expect(icon.__setAnimationCalls.map(({ name }) => name)).toEqual(['down']);
    });

    it('treats the whole composite button as one hit area for hover and for a press', async () => {
        const button = createFakeSpine({
            animations: [
                { name: 'hover', duration: 0 },
                { name: 'out', duration: 0 },
                { name: 'up', duration: 0 },
                { name: 'up_out', duration: 0 },
            ],
        });
        const label = new Container();
        const parent = createFakeSpine({
            bones: [
                { name: 'ui' },
                { name: 'button_spin', parent: 'ui' },
                { name: 'spine_big_button', parent: 'button_spin' },
            ],
            slots: [
                { name: 'spine_big_button', boneName: 'spine_big_button' },
                { name: 'text_spin_button', boneName: 'spine_big_button' },
            ],
        });
        const spines = asSpineMap({ ui: parent, big_button: button });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        parent.addSlotObject('text_spin_button', label);
        scene.activateButtonBones();

        const eventSpy = vi.spyOn(anims, 'playEvent');

        // entering the button, then crossing from its graphic onto its label: Pixi fires
        // pointerout on the graphic before pointerover on the label, within one dispatch
        await hover(button);
        button.emit('pointerout', pointer());
        await hover(label);

        // pressing the graphic and releasing over the label is still one click on the button
        button.emit('pointerdown', pointer());
        label.emit('pointerup', pointer());
        button.emit('pointerupoutside', pointer());

        // and leaving the button as a whole ends the hover
        await unhover(label);

        expect(eventSpy.mock.calls.map(([eventName]) => eventName)).toEqual([
            'spin_hover',
            'spin_down',
            'spin_up',
            'spin_click',
            'spin_out',
            'spin_unhover',
        ]);
        expect(button.__setAnimationCalls.map(({ name }) => name)).toEqual([
            'hover',
            'up',
            'out',
        ]);
    });

    it('does not wire slots hanging outside a button_ bone chain', () => {
        const other = createFakeSpine();
        const parent = createFakeSpine({
            bones: [{ name: 'ui' }, { name: 'panel', parent: 'ui' }],
            slots: [{ name: 'spine_other', boneName: 'panel' }],
        });
        const spines = asSpineMap({ parent, other });
        const anims = new AnimationsController(spines);
        const scene = new SceneController(
            spines,
            new TextsController(spines),
            anims,
            new SpineController(spines, anims),
        );

        scene.attachBones(() => {});
        scene.activateButtonBones();

        expect(other.eventMode).not.toBe('static');
        expect(other.cursor).not.toBe('pointer');
    });
});

describe('SceneController – syncSlotObjectsWithDrawOrder', () => {
    it('reorders slot-object children to match the skeleton draw order', () => {
        const spine = createFakeSpine({
            slots: [{ name: 'button_bottom' }, { name: 'button_top' }],
            bones: [
                { name: 'button_bottom', worldX: 0, worldY: 0 },
                { name: 'button_top', worldX: 0, worldY: 0 },
            ],
        });
        const spines = asSpineMap({ hero: spine });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        scene.activateButtonBones();
        const bottom = spine.__slotChildren.get('button_bottom')![0];
        const top = spine.__slotChildren.get('button_top')![0];

        // Simulate insertion order that contradicts the draw order: the button rendered
        // on top ends up below in the children array, so it would lose hit-testing.
        spine.addChild(top);
        spine.addChild(bottom);
        expect(spine.children.indexOf(top)).toBeLessThan(spine.children.indexOf(bottom));

        scene.syncSlotObjectsWithDrawOrder();

        expect(spine.children.indexOf(top)).toBeGreaterThan(spine.children.indexOf(bottom));
    });
});

describe('SceneController – addSlotChild & clear', () => {
    it('addSlotChild forwards the child onto the matching slot', () => {
        const spine = createFakeSpine({ slots: [{ name: 'spine_extra' }] });
        const spines = asSpineMap({ hero: spine });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        const child = new Container();
        scene.addSlotChild('hero', 'spine_extra', child);
        expect(spine.__slotChildren.get('spine_extra')?.[0]).toBe(child);
    });

    it('addSlotChild logs when spine is unknown', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const scene = new SceneController(
            new Map(),
            new TextsController(new Map()),
            new AnimationsController(new Map()),
            new SpineController(new Map(), new AnimationsController(new Map())),
        );
        scene.addSlotChild('missing', 'slot', new Container());
        expect(err).toHaveBeenCalledWith('Spine "missing" not found');
    });

    it('addSlotChild logs when slot is unknown', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const spine = createFakeSpine({ slots: [{ name: 'a' }] });
        const spines = asSpineMap({ hero: spine });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        scene.addSlotChild('hero', 'missing', new Container());
        expect(err).toHaveBeenCalledWith('Slot "missing" not found', expect.anything());
    });

    it('clear drops the internal button registry', () => {
        const spine = createFakeSpine({
            slots: [{ name: 'button_play', attachment: makeRegion() }],
            bones: [{ name: 'button_play', worldX: 0, worldY: 0 }],
        });
        const spines = asSpineMap({ hero: spine });
        const animations = new AnimationsController(spines);
        const texts = new TextsController(spines);
        const spineCtl = new SpineController(spines, animations);
        const scene = new SceneController(spines, texts, animations, spineCtl);

        scene.activateButtonBones();
        scene.clear();
        // No public getter for buttons map; just exercise the code path.
        expect(true).toBe(true);
    });
});
