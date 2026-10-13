import { describe, expect, it } from 'vitest';
import type { Bone } from '@esotericsoftware/spine-pixi-v8';
import { pixi8Engine } from '../../../src/engines/pixi8';

/** A root a physics constraint drives and an arm an IK constraint aims: both posed apart from `pose`. */
const constrained = {
    skeleton: { hash: 'constrained', spine: '4.3.23' },
    bones: [
        { name: 'root', x: 7, y: 3 },
        { name: 'arm', parent: 'root', x: 10, y: 20 },
        { name: 'target', parent: 'root', x: 100 },
    ],
    constraints: [
        { type: 'ik', name: 'aim', bones: ['arm'], target: 'target' },
        { type: 'physics', name: 'sway', bone: 'root', x: 1 },
    ],
    skins: [],
};

describe('pixi8 bonePose on 4.3', () => {
    const posed = () => {
        const { spine: port } = pixi8Engine;
        const spine = port.create(port.readSkeleton(constrained, '', {}));
        Object.assign(spine.skeleton, { x: 100, y: 50 });
        port.updateWorldTransform(spine.skeleton);
        return { port, spine };
    };

    it.each(['root', 'arm'])('reads the world position a constraint gave %s', (name) => {
        const { port, spine } = posed();
        const bone = spine.skeleton.findBone(name) as Bone;
        const pose = port.bonePose(bone);

        expect(bone.appliedPose).not.toBe(bone.pose);
        expect([pose.worldX, pose.worldY]).not.toEqual([0, 0]);
        expect(pose.worldX).toBeCloseTo(bone.appliedPose.worldX);
        expect(pose.worldY).toBeCloseTo(bone.appliedPose.worldY);

        spine.destroy();
    });

    it("converts a constrained bone's world position back into its parent's space", () => {
        const { port, spine } = posed();
        const arm = spine.skeleton.findBone('arm')!;
        const pose = port.bonePose(arm);
        const local = pose.worldToParent({ x: pose.worldX, y: pose.worldY }, spine.skeleton);

        expect(local.x).toBeCloseTo(10, 4);
        expect(local.y).toBeCloseTo(20, 4);

        spine.destroy();
    });
});
