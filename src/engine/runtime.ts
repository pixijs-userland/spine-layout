/**
 * The shape of a Spine runtime as the layout core reads it — the subset that is the same in
 * spine-ts 3.8 (pixi-spine) and 4.3 (spine-pixi-v8). Anything the two runtimes spell
 * differently (poses, setup pose, draw order, timeline ids) goes through `SpinePort` instead.
 */

export interface AnimationLike {
    name: string;
    duration: number;
    timelines: unknown[];
}

export interface EventDataLike {
    name: string;
}

export interface EventLike {
    data: EventDataLike;
    time?: number;
    volume?: number;
    balance?: number;
    intValue?: number;
    floatValue?: number;
    stringValue?: string | null;
}

export interface SkinEntryLike {
    slotIndex: number;
    name: string;
    attachment: unknown;
}

export interface SkinLike {
    name: string;
    /** Fills `entries` with `SkinEntryLike`s; typed `never[]` so each runtime's own entry type fits. */
    getAttachmentsForSlot(slotIndex: number, entries: never[]): void;
}

export interface BoneDataLike {
    name: string;
    index: number;
    parent: BoneDataLike | null;
}

export interface SlotDataLike {
    name: string;
    index: number;
    boneData: BoneDataLike;
}

export interface SkeletonDataLike {
    bones: BoneDataLike[];
    slots: SlotDataLike[];
    animations: AnimationLike[];
    events: EventDataLike[];
    skins: SkinLike[];
    defaultSkin: SkinLike | null;
    findAnimation(name: string): AnimationLike | null;
    findSkin(name: string): SkinLike | null;
    findBone(name: string): BoneDataLike | null;
    findSlot(name: string): SlotDataLike | null;
}

export interface TrackEntryLike {
    animation: AnimationLike | null;
    trackTime: number;
    trackEnd: number;
    animationEnd: number;
    timeScale: number;
    loop: boolean;
    nextTrackLast: number;
}

export interface AnimationStateListenerLike {
    start?(entry: TrackEntryLike): void;
    interrupt?(entry: TrackEntryLike): void;
    end?(entry: TrackEntryLike): void;
    dispose?(entry: TrackEntryLike): void;
    complete?(entry: TrackEntryLike): void;
    event?(entry: TrackEntryLike, event: EventLike): void;
}

export interface AnimationStateLike {
    data: { skeletonData: SkeletonDataLike };
    tracks: (TrackEntryLike | null | undefined)[];
    timeScale: number;
    setAnimation(trackIndex: number, animationName: string, loop: boolean): TrackEntryLike;
    addAnimation(
        trackIndex: number,
        animationName: string,
        loop: boolean,
        delay: number,
    ): TrackEntryLike;
    clearTrack(trackIndex: number): void;
    clearTracks(): void;
    addListener(listener: AnimationStateListenerLike): void;
    removeListener(listener: AnimationStateListenerLike): void;
}

export interface BoneLike {
    data: BoneDataLike;
    parent: BoneLike | null;
}

export interface SlotLike {
    data: SlotDataLike;
    bone: BoneLike;
}

export interface SkeletonLike {
    data: SkeletonDataLike;
    bones: BoneLike[];
    slots: SlotLike[];
    skin: SkinLike | null;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    findBone(name: string): BoneLike | null;
    findSlot(name: string): SlotLike | null;
    setSkin(skin: SkinLike | null): void;
}

/** What a skeleton is before a runtime read it: the parsed `.json`, or the bytes of a `.skel`. */
export type SkeletonSource = { skins?: { name: string }[] } | ArrayBuffer | Uint8Array;

export function isBinarySkeleton(skeleton: SkeletonSource): skeleton is ArrayBuffer | Uint8Array {
    return skeleton instanceof Uint8Array || skeleton instanceof ArrayBuffer;
}
