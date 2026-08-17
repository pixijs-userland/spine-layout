import { Container, Point } from 'pixi.js';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';

export type FakeAnimation = {
    name: string;
    duration?: number;
    /**
     * The skeleton properties this animation poses, as `AnimationsController` reads them —
     * one `Timeline.propertyIds` entry each. Any string works as an opaque id (`'bone:spin'`
     * is easier to read in a test than the runtime's `'1|4'`); two animations sharing one
     * compete for a track. Omit for an animation that poses nothing.
     */
    poses?: string[];
};
export type FakeBone = {
    name: string;
    worldX?: number;
    worldY?: number;
    parent?: string;
    /** The bone's setup position in its parent's space — where an unposed bone sits. */
    setupX?: number;
    setupY?: number;
};
export type FakeSlot = {
    name: string;
    attachment?: unknown;
    boneName?: string;
};

/**
 * A live skeleton bone, as the controllers read one: its data (name and setup pose), its
 * parent link, and the pose that gets written while animating.
 *
 * `worldToParent` mirrors the runtime for an unrotated, unscaled parent — it subtracts the
 * parent's world position — which is all the bone maths under test needs.
 */
export type FakeSkeletonBone = {
    data: { name: string; setupPose: { x: number; y: number } };
    parent: FakeSkeletonBone | null;
    pose: {
        x: number;
        y: number;
        worldX: number;
        worldY: number;
        worldToParent: (point: { x: number; y: number }) => { x: number; y: number };
    };
};
export type FakeSkeletonSlot = { data: { name: string }; bone: FakeSkeletonBone };
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

export type FakeTrackEntry = {
    animation: { name: string };
    trackTime: number;
    trackEnd: number;
    animationEnd: number;
    timeScale: number;
    loop: boolean;
    /**
     * -1 until the runtime's `AnimationState.apply` stamps it — the fake never applies,
     * so a test that needs an entry to count as applied stamps it by hand.
     */
    nextTrackLast: number;
};

export type FakeSpine = Container & {
    __isFake: true;
    state: {
        addListener: (listener: FakeSpineEventListener) => void;
        setAnimation: (track: number, name: string, loop: boolean) => FakeTrackEntry;
        clearTracks: () => void;
        clearTrack: (track: number) => void;
        getTrack: (track: number) => FakeTrackEntry | undefined;
        tracks: Array<FakeTrackEntry | null>;
        timeScale: number;
        data: {
            skeletonData: {
                animations: FakeAnimation[];
                bones: FakeBone[];
                slots: FakeSlot[];
                events: { name: string }[];
                findAnimation: (name: string) => FakeAnimation | undefined;
                findSkin: (name: string) => FakeSkin | undefined;
            };
        };
    };
    skeleton: {
        slots: FakeSkeletonSlot[];
        bones: FakeSkeletonBone[];
        /** Where the skeleton itself sits, and how it is scaled — spine-pixi runs it y-down. */
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        drawOrder: { appliedPose: Array<{ data: { name: string } }> };
        data: {
            slots: FakeSlot[];
            animations: FakeAnimation[];
            events: { name: string }[];
            findSkin: (name: string) => FakeSkin | undefined;
        };
        findSlot: (name: string) =>
            | { bone: { pose: { worldX: number; worldY: number } }; pose: { attachment: unknown } }
            | undefined;
        findBone: (name: string) => { pose: { worldX: number; worldY: number } } | undefined;
        setSkin: (skin: FakeSkin) => void;
        setupPoseBones: () => void;
        setupPoseSlots: () => void;
        setupPose: () => void;
        updateWorldTransform: (_: unknown) => void;
    };
    addSlotObject: (name: string, child: Container) => void;
    getSlotObject: (slot: string | { data: { name: string } }) => Container | undefined;
    update: (dt: number) => void;
    /** Called by the runtime once the animations are applied, before the world transforms. */
    beforeUpdateWorldTransforms: (spine: unknown) => void;
    __setAnimationCalls: Array<{ track: number; name: string; loop: boolean }>;
    __listeners: FakeSpineEventListener[];
    __slotChildren: Map<string, Container[]>;
    __activeSkin?: FakeSkin;
    __setupPoseCount: number;
    __bonesSetupPoseCount: number;
    __clearTrackCalls: number[];
    __clearTracksCalls: number;
    __worldTransformUpdates: number;
    __destroyed: boolean;
    triggerEvent: (eventName: string, animationName?: string) => void;
};

export function createFakeSpine(options: FakeSpineOptions = {}): FakeSpine {
    // Mirror the runtime: every Animation carries timelines, and each timeline names the
    // properties it writes. Track allocation reads exactly this.
    const animations = (options.animations ?? []).map((animation) => ({
        ...animation,
        timelines: (animation.poses ?? []).map((id) => ({ propertyIds: [id] })),
    }));
    const bones = options.bones ?? [];
    const slots = options.slots ?? [];
    const skins = (options.skins ?? []).map((name) => ({ name }));

    const findSkin = (name: string) => skins.find((s) => s.name === name);
    const findAnimation = (name: string) => animations.find((a) => a.name === name);
    const findSlot = (name: string) => {
        const slot = slots.find((s) => s.name === name);
        if (!slot) return undefined;
        return {
            bone: { pose: { worldX: 1, worldY: 2 } },
            pose: { attachment: slot.attachment },
        };
    };
    const findBone = (name: string) => {
        const bone = bones.find((b) => b.name === name);
        if (!bone) return undefined;
        return { pose: { worldX: bone.worldX ?? 0, worldY: bone.worldY ?? 0 } };
    };

    const spine = new Container() as FakeSpine;

    spine.__isFake = true;
    spine.__setAnimationCalls = [];
    spine.__listeners = [];
    spine.__slotChildren = new Map();
    spine.__setupPoseCount = 0;
    spine.__bonesSetupPoseCount = 0;
    spine.__clearTrackCalls = [];
    spine.__clearTracksCalls = 0;
    spine.__worldTransformUpdates = 0;
    spine.__destroyed = false;

    spine.toGlobal = ((point: Point) => new Point(point.x + 100, point.y + 200)) as Container['toGlobal'];

    const tracks: Array<FakeTrackEntry | null> = [];

    spine.state = {
        addListener: (listener) => spine.__listeners.push(listener),
        setAnimation: (track, name, loop) => {
            spine.__setAnimationCalls.push({ track, name, loop });
            const animData = findAnimation(name);
            const entry: FakeTrackEntry = {
                animation: { name },
                trackTime: 0,
                trackEnd: Number.POSITIVE_INFINITY,
                animationEnd: animData?.duration ?? 0,
                timeScale: 1,
                loop,
                nextTrackLast: -1,
            };
            tracks[track] = entry;
            return entry;
        },
        clearTracks: () => {
            spine.__clearTracksCalls++;
            for (let i = 0; i < tracks.length; i++) tracks[i] = null;
        },
        clearTrack: (track) => {
            spine.__clearTrackCalls.push(track);
            tracks[track] = null;
        },
        getTrack: (track) => tracks[track] ?? undefined,
        tracks,
        timeScale: 1,
        data: {
            skeletonData: {
                animations,
                bones,
                slots,
                events: [],
                findAnimation,
                findSkin,
            },
        },
    };

    // Mirror the runtime skeleton: bones carry parent links and every slot hangs
    // from a bone (a detached placeholder when the fixture doesn't specify one).
    const makeSkeletonBone = (bone: FakeBone): FakeSkeletonBone => {
        const skeletonBone: FakeSkeletonBone = {
            data: {
                name: bone.name,
                setupPose: { x: bone.setupX ?? 0, y: bone.setupY ?? 0 },
            },
            parent: null,
            pose: {
                x: bone.setupX ?? 0,
                y: bone.setupY ?? 0,
                worldX: bone.worldX ?? 0,
                worldY: bone.worldY ?? 0,
                worldToParent: (point) => {
                    const parent = skeletonBone.parent;
                    if (parent) {
                        point.x -= parent.pose.worldX;
                        point.y -= parent.pose.worldY;
                    }
                    return point;
                },
            },
        };
        return skeletonBone;
    };
    const skeletonBones = new Map<string, FakeSkeletonBone>(
        bones.map((b) => [b.name, makeSkeletonBone(b)]),
    );
    bones.forEach((b) => {
        if (b.parent) skeletonBones.get(b.name)!.parent = skeletonBones.get(b.parent) ?? null;
    });
    const skeletonSlotBone = (s: FakeSlot): FakeSkeletonBone =>
        (s.boneName && skeletonBones.get(s.boneName)) ||
        makeSkeletonBone({ name: s.boneName ?? '' });

    spine.skeleton = {
        slots: slots.map((s) => ({ data: { name: s.name }, bone: skeletonSlotBone(s) })),
        bones: [...skeletonBones.values()],
        x: 0,
        y: 0,
        scaleX: 1,
        // spine-pixi sets `Skeleton.yDown`, which lands on the skeleton as a negative scaleY.
        scaleY: -1,
        drawOrder: { appliedPose: slots.map((s) => ({ data: { name: s.name } })) },
        data: {
            slots,
            animations,
            // spine 4.3 SkeletonData always carries an events array
            events: [],
            findSkin,
        },
        findSlot,
        findBone,
        setSkin: (skin) => {
            spine.__activeSkin = skin;
        },
        setupPoseBones: () => {
            spine.__bonesSetupPoseCount++;
        },
        setupPoseSlots: () => {
            spine.__setupPoseCount++;
        },
        setupPose: () => {
            spine.__setupPoseCount++;
        },
        updateWorldTransform: () => {
            spine.__worldTransformUpdates++;
        },
    };

    // Spine.update(0) re-applies tracks and refreshes world transforms; the
    // fake only needs to record that a transform refresh happened.
    spine.update = () => {
        spine.__worldTransformUpdates++;
    };

    // The runtime's own hook is a no-op until something chains onto it.
    spine.beforeUpdateWorldTransforms = () => { };

    spine.addSlotObject = (name, child) => {
        const list = spine.__slotChildren.get(name) ?? [];
        list.push(child);
        spine.__slotChildren.set(name, list);
    };

    spine.getSlotObject = (slot) => {
        const name = typeof slot === 'string' ? slot : slot.data.name;
        return spine.__slotChildren.get(name)?.[0];
    };

    // `animationName` fills in the TrackEntry the runtime hands to listeners, so a fired
    // event can be attributed to the animation whose timeline holds it.
    spine.triggerEvent = (eventName: string, animationName?: string) => {
        const entry = animationName ? { animation: { name: animationName } } : undefined;
        spine.__listeners.forEach((l) => l.event?.(entry, { data: { name: eventName } }));
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
