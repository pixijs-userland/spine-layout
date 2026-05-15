import { Container, Point } from 'pixi.js';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';

export type FakeAnimation = { name: string; duration?: number };
export type FakeBone = { name: string; worldX?: number; worldY?: number };
export type FakeSlot = {
    name: string;
    attachment?: unknown;
    boneName?: string;
};
export type FakeSkin = { name: string };

export type FakeSpineOptions = {
    animations?: FakeAnimation[];
    bones?: FakeBone[];
    slots?: FakeSlot[];
    skins?: string[];
    activeSkinTracker?: { value?: string };
};

export type FakeSpineEventListener = {
    event?: (entry: unknown, event: { data: { name: string } }) => void;
};

export type FakeSpine = Container & {
    __isFake: true;
    state: {
        addListener: (listener: FakeSpineEventListener) => void;
        setAnimation: (track: number, name: string, loop: boolean) => void;
        clearTracks: () => void;
        clearTrack: (track: number) => void;
        getCurrent: (track: number) => unknown;
        timeScale: number;
        data: {
            skeletonData: {
                animations: FakeAnimation[];
                bones: FakeBone[];
                slots: FakeSlot[];
                findAnimation: (name: string) => FakeAnimation | undefined;
                findSkin: (name: string) => FakeSkin | undefined;
            };
        };
    };
    skeleton: {
        slots: Array<{ data: { name: string } }>;
        data: {
            slots: FakeSlot[];
            animations: FakeAnimation[];
            findSkin: (name: string) => FakeSkin | undefined;
        };
        findSlot: (name: string) =>
            | { bone: { worldX: number; worldY: number }; getAttachment: () => unknown }
            | undefined;
        findBone: (name: string) => { worldX: number; worldY: number } | undefined;
        setSkin: (skin: FakeSkin) => void;
        setSlotsToSetupPose: () => void;
        setToSetupPose: () => void;
        updateWorldTransform: (_: unknown) => void;
    };
    addSlotObject: (name: string, child: Container) => void;
    __setAnimationCalls: Array<{ track: number; name: string; loop: boolean }>;
    __listeners: FakeSpineEventListener[];
    __slotChildren: Map<string, Container[]>;
    __activeSkin?: FakeSkin;
    __setupPoseCount: number;
    __clearTrackCalls: number[];
    __clearTracksCalls: number;
    __destroyed: boolean;
    triggerEvent: (eventName: string) => void;
};

export function createFakeSpine(options: FakeSpineOptions = {}): FakeSpine {
    const animations = options.animations ?? [];
    const bones = options.bones ?? [];
    const slots = options.slots ?? [];
    const skins = (options.skins ?? []).map((name) => ({ name }));

    const findSkin = (name: string) => skins.find((s) => s.name === name);
    const findAnimation = (name: string) => animations.find((a) => a.name === name);
    const findSlot = (name: string) => {
        const slot = slots.find((s) => s.name === name);
        if (!slot) return undefined;
        return {
            bone: { worldX: 1, worldY: 2 },
            getAttachment: () => slot.attachment,
        };
    };
    const findBone = (name: string) => {
        const bone = bones.find((b) => b.name === name);
        if (!bone) return undefined;
        return { worldX: bone.worldX ?? 0, worldY: bone.worldY ?? 0 };
    };

    const spine = new Container() as FakeSpine;

    spine.__isFake = true;
    spine.__setAnimationCalls = [];
    spine.__listeners = [];
    spine.__slotChildren = new Map();
    spine.__setupPoseCount = 0;
    spine.__clearTrackCalls = [];
    spine.__clearTracksCalls = 0;
    spine.__destroyed = false;

    spine.toGlobal = ((point: Point) => new Point(point.x + 100, point.y + 200)) as Container['toGlobal'];

    spine.state = {
        addListener: (listener) => spine.__listeners.push(listener),
        setAnimation: (track, name, loop) => {
            spine.__setAnimationCalls.push({ track, name, loop });
        },
        clearTracks: () => {
            spine.__clearTracksCalls++;
        },
        clearTrack: (track) => {
            spine.__clearTrackCalls.push(track);
        },
        getCurrent: () => undefined,
        timeScale: 1,
        data: {
            skeletonData: {
                animations,
                bones,
                slots,
                findAnimation,
                findSkin,
            },
        },
    };

    spine.skeleton = {
        slots: slots.map((s) => ({ data: { name: s.name } })),
        data: {
            slots,
            animations,
            findSkin,
        },
        findSlot,
        findBone,
        setSkin: (skin) => {
            spine.__activeSkin = skin;
        },
        setSlotsToSetupPose: () => {
            spine.__setupPoseCount++;
        },
        setToSetupPose: () => {
            spine.__setupPoseCount++;
        },
        updateWorldTransform: () => {},
    };

    spine.addSlotObject = (name, child) => {
        const list = spine.__slotChildren.get(name) ?? [];
        list.push(child);
        spine.__slotChildren.set(name, list);
    };

    spine.triggerEvent = (eventName: string) => {
        spine.__listeners.forEach((l) =>
            l.event?.(undefined, { data: { name: eventName } }),
        );
    };

    const originalDestroy = spine.destroy.bind(spine);
    spine.destroy = ((...args: unknown[]) => {
        spine.__destroyed = true;
        return (originalDestroy as (...a: unknown[]) => void)(...args);
    }) as Container['destroy'];

    return spine;
}

export function asSpineMap(map: Record<string, FakeSpine>): Map<string, Spine> {
    return new Map(Object.entries(map)) as unknown as Map<string, Spine>;
}
