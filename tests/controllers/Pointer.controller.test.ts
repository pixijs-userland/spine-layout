import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';

import { PointerController } from '../../src/controllers/Pointer.controller';
import { asSpineMap, createFakeSpine, type FakeSpine } from '../helpers/fakeSpine';

/** The bit of a Pixi pointer event the follow wiring reads. */
const move = (x: number, y: number) => ({ global: { x, y } }) as never;

/** Runs one frame of the spine: the runtime calls this once the animations are applied. */
function frame(spine: FakeSpine) {
    spine.beforeUpdateWorldTransforms(spine);
}

/** A spine with one pointer-following bone hanging off a static holder bone. */
function spineWithFollowBone(options: { setupX?: number; setupY?: number } = {}) {
    return createFakeSpine({
        bones: [
            { name: 'holder', worldX: 0, worldY: 0 },
            {
                name: 'crosshair_followPointer',
                parent: 'holder',
                setupX: options.setupX ?? 0,
                setupY: options.setupY ?? 0,
            },
        ],
    });
}

function boneOf(spine: FakeSpine, name: string) {
    return spine.skeleton.bones.find((bone) => bone.data.name === name)!;
}

describe('PointerController – attach', () => {
    it('follows bones named with the _followPointer modifier', () => {
        const spine = spineWithFollowBone();
        const spines = asSpineMap({ main: spine });
        const pointer = new PointerController(spines, new Container());

        pointer.attach();

        expect(pointer.getBones()).toEqual(new Map([['main', ['crosshair_followPointer']]]));
    });

    it('follows the bone a slot carrying the modifier hangs from', () => {
        const spine = createFakeSpine({
            bones: [{ name: 'holder' }, { name: 'glow', parent: 'holder' }],
            slots: [{ name: 'glow_followPointer', boneName: 'glow' }],
        });
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());

        pointer.attach();

        expect(pointer.getBones().get('main')).toEqual(['glow']);
    });

    it('leaves spines without a follow bone alone, and stays silent on the container', () => {
        const spine = createFakeSpine({ bones: [{ name: 'root' }, { name: 'hand' }] });
        const root = new Container();
        const pointer = new PointerController(asSpineMap({ main: spine }), root);

        pointer.attach();

        expect(pointer.getBones().size).toBe(0);
        // The layout is left as it was found — nothing to follow, nothing to listen for.
        expect(root.eventMode).not.toBe('static');
        expect(root.listenerCount('globalpointermove')).toBe(0);
    });

    it('listens for pointer moves across the whole layout once a follow bone is found', () => {
        const root = new Container();
        const pointer = new PointerController(asSpineMap({ main: spineWithFollowBone() }), root);

        pointer.attach();

        expect(root.eventMode).toBe('static');
        expect(root.listenerCount('globalpointermove')).toBe(1);
    });

    it('is idempotent: re-attaching neither duplicates a bone nor stacks listeners', () => {
        const root = new Container();
        const spine = spineWithFollowBone();
        const pointer = new PointerController(asSpineMap({ main: spine }), root);

        pointer.attach();
        const hook = spine.beforeUpdateWorldTransforms;
        pointer.attach();

        expect(pointer.getBones().get('main')).toEqual(['crosshair_followPointer']);
        expect(root.listenerCount('globalpointermove')).toBe(1);
        expect(spine.beforeUpdateWorldTransforms).toBe(hook);
    });

    it('picks up spines registered after the first attach', () => {
        const spines = asSpineMap({ main: spineWithFollowBone() });
        const pointer = new PointerController(spines, new Container());

        pointer.attach();
        spines.set('late', spineWithFollowBone() as never);
        pointer.attach();

        expect([...pointer.getBones().keys()]).toEqual(['main', 'late']);
    });

    it('keeps the update hook the spine already carried', () => {
        const spine = spineWithFollowBone();
        const calls: string[] = [];
        spine.beforeUpdateWorldTransforms = () => calls.push('game');

        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());
        pointer.attach();
        pointer.setPosition(10, 20);
        frame(spine);

        expect(calls).toEqual(['game']);
        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 10, y: 20 });
    });
});

describe('PointerController – following', () => {
    it('poses the bone where the pointer is, in the bone parent’s space', () => {
        const spine = createFakeSpine({
            bones: [
                { name: 'holder', worldX: 30, worldY: 40 },
                { name: 'crosshair_followPointer', parent: 'holder' },
            ],
        });
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());

        pointer.attach();
        pointer.setPosition(100, 70);
        frame(spine);

        // The pointer lands at (100, 70) in the spine's own space, which is 30/40 away
        // from the holder the bone is posed against.
        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 70, y: 30 });
    });

    it('converts the pointer through the spine’s own transform', () => {
        const spine = spineWithFollowBone();
        spine.position.set(50, 25);
        spine.scale.set(2);

        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());
        pointer.attach();
        pointer.setPosition(150, 125);
        frame(spine);

        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 50, y: 50 });
    });

    it('poses a parentless bone in skeleton space, y-flip included', () => {
        const spine = createFakeSpine({ bones: [{ name: 'root_followPointer' }] });
        spine.skeleton.x = 10;
        spine.skeleton.y = 20;

        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());
        pointer.attach();
        pointer.setPosition(60, 120);
        frame(spine);

        // (60 - 10) / 1 across, (120 - 20) / -1 down: the skeleton runs y-down.
        expect(boneOf(spine, 'root_followPointer').pose).toMatchObject({ x: 50, y: -100 });
    });

    it('follows a real pointer move over the layout', () => {
        const root = new Container();
        const spine = spineWithFollowBone();
        const pointer = new PointerController(asSpineMap({ main: spine }), root);

        pointer.attach();
        root.emit('globalpointermove', move(12, 34));
        frame(spine);

        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 12, y: 34 });
        expect(pointer.getPosition()).toMatchObject({ x: 12, y: 34 });
    });

    it('leaves the bone as the animations posed it until the pointer first moves', () => {
        const spine = spineWithFollowBone();
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());
        const bone = boneOf(spine, 'crosshair_followPointer');

        pointer.attach();
        bone.pose.x = 7;
        bone.pose.y = 9;
        frame(spine);

        expect(bone.pose).toMatchObject({ x: 7, y: 9 });
        expect(pointer.getPosition()).toBeUndefined();
    });

    it('holds the last position when the pointer leaves, one frame like the next', () => {
        const spine = spineWithFollowBone();
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());

        pointer.attach();
        pointer.setPosition(80, 90);
        frame(spine);
        frame(spine);

        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 80, y: 90 });
    });

    it('travels part of the way for a strength below 1, measured from the setup pose', () => {
        const spine = spineWithFollowBone({ setupX: 10, setupY: 20 });
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());

        pointer.attach();
        pointer.strength = 0.5;
        pointer.setPosition(110, 120);
        frame(spine);

        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 60, y: 70 });
    });

    it('lets one bone override the strength by name', () => {
        const spine = createFakeSpine({
            bones: [
                { name: 'holder' },
                { name: 'near_followPointer', parent: 'holder' },
                { name: 'far_followPointer', parent: 'holder' },
            ],
        });
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());

        pointer.attach();
        pointer.setStrength('far_followPointer', 0.25);
        pointer.setPosition(100, 200);
        frame(spine);

        expect(boneOf(spine, 'near_followPointer').pose).toMatchObject({ x: 100, y: 200 });
        expect(boneOf(spine, 'far_followPointer').pose).toMatchObject({ x: 25, y: 50 });
    });

    it('follows every spine that has follow bones, each in its own space', () => {
        const main = spineWithFollowBone();
        const other = spineWithFollowBone();
        other.position.set(100, 100);

        const pointer = new PointerController(asSpineMap({ main, other }), new Container());
        pointer.attach();
        pointer.setPosition(40, 60);
        frame(main);
        frame(other);

        expect(boneOf(main, 'crosshair_followPointer').pose).toMatchObject({ x: 40, y: 60 });
        expect(boneOf(other, 'crosshair_followPointer').pose).toMatchObject({ x: -60, y: -40 });
    });
});

describe('PointerController – enabled', () => {
    it('returns the bones to their setup position when switched off, and stops posing them', () => {
        const spine = spineWithFollowBone({ setupX: 5, setupY: 6 });
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());

        pointer.attach();
        pointer.setPosition(80, 90);
        frame(spine);
        pointer.enabled = false;

        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 5, y: 6 });

        pointer.setPosition(10, 10);
        frame(spine);

        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 5, y: 6 });
    });

    it('follows again when switched back on', () => {
        const spine = spineWithFollowBone();
        const pointer = new PointerController(asSpineMap({ main: spine }), new Container());

        pointer.attach();
        pointer.enabled = false;
        pointer.enabled = true;
        pointer.setPosition(15, 25);
        frame(spine);

        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 15, y: 25 });
    });
});

describe('PointerController – clear', () => {
    it('gives the spine its own hook back, drops the listener, and rests the bones', () => {
        const root = new Container();
        const spine = spineWithFollowBone({ setupX: 1, setupY: 2 });
        const calls: string[] = [];
        const ownHook = () => calls.push('game');
        spine.beforeUpdateWorldTransforms = ownHook;

        const pointer = new PointerController(asSpineMap({ main: spine }), root);
        pointer.attach();
        pointer.setPosition(80, 90);
        frame(spine);
        pointer.clear();

        expect(spine.beforeUpdateWorldTransforms).toBe(ownHook);
        expect(root.listenerCount('globalpointermove')).toBe(0);
        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 1, y: 2 });
        expect(pointer.getBones().size).toBe(0);
        expect(pointer.getPosition()).toBeUndefined();

        frame(spine);
        expect(calls).toEqual(['game', 'game']);
    });

    it('can be attached again after clearing', () => {
        const root = new Container();
        const spine = spineWithFollowBone();
        const pointer = new PointerController(asSpineMap({ main: spine }), root);

        pointer.attach();
        pointer.clear();
        pointer.attach();
        pointer.setPosition(3, 4);
        frame(spine);

        expect(root.listenerCount('globalpointermove')).toBe(1);
        expect(boneOf(spine, 'crosshair_followPointer').pose).toMatchObject({ x: 3, y: 4 });
    });
});
