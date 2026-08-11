import { Vector2, type Bone, type Skeleton, type Spine } from '@esotericsoftware/spine-pixi-v8';
import { Point, type Container, type FederatedPointerEvent } from 'pixi.js';
import type { SpineID } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';

/** One spine's follow bones, and the update hook they were chained onto. */
type PointerFollow = {
    spine: Spine;
    /** The bones of this spine that carry the `_followPointer` modifier. */
    bones: Bone[];
    /** The `beforeUpdateWorldTransforms` hook the spine carried before we chained onto it. */
    previousHook: (spine: Spine) => void;
};

/**
 * Moves every bone named `<name>_followPointer` to wherever the pointer is — the mouse on
 * desktop, the finger being dragged on a touch screen. Accessed via `layout.pointer`.
 *
 * The convention needs no code: name the bone in the Spine editor and it follows, together
 * with everything hanging from it (attachments, nested spines, text nodes). A *slot* carrying
 * the modifier moves the bone it hangs from, so an artist can mark the image instead.
 *
 * Typically the follow bone is an IK target — the arm aims where the mouse is — or a bone
 * carrying a crosshair, a glow, or a parallax layer ({@link strength} for how far it travels).
 */
export class PointerController {
    /** Follow bones by spine id — one entry per spine that has any. */
    private follows: Map<SpineID, PointerFollow> = new Map();
    /** Per-bone {@link strength} overrides, by bone name. */
    private strengths: Map<string, number> = new Map();
    /** Last pointer position, in stage coordinates. */
    private pointer = new Point();
    /** Whether the pointer has been anywhere yet — before that, bones are left alone. */
    private pointerSeen = false;
    private listening = false;
    private _enabled = true;
    private _strength = 1;
    /** Scratch points, so following a bone costs no allocation per frame. */
    private readonly spacePoint = new Point();
    private readonly bonePoint = new Vector2();

    constructor(
        private spines: Map<SpineID, Spine>,
        private root: Container,
    ) { }

    // ─── setters / getters ───────────────────────────────────────────────────────

    /**
     * Whether the follow bones track the pointer at all. Switching it off returns them to
     * their setup position — a bone no animation poses would otherwise stay where the
     * pointer last left it.
     */
    set enabled(value: boolean) {
        if (this._enabled === value) return;
        this._enabled = value;
        if (!value) this.resetBones();
    }
    get enabled(): boolean {
        return this._enabled;
    }

    /**
     * How far a bone travels from its setup position toward the pointer: `1` (the default)
     * puts it right under the pointer, `0.2` moves it a fifth of the way for a parallax
     * drift, `0` pins it home. Values outside `0..1` overshoot or mirror.
     *
     * The travel is measured from the bone's *setup* position, not from where an animation
     * put it — so a partly-following bone is one the animations leave alone. A bone at full
     * strength sits on the pointer whatever else poses it.
     */
    set strength(value: number) {
        this._strength = value;
    }
    get strength(): number {
        return this._strength;
    }

    /** Overrides {@link strength} for one bone, by name, across every spine that has it. */
    setStrength(boneName: string, value: number) {
        this.strengths.set(boneName, value);
    }

    /** The last pointer position in stage coordinates, or `undefined` before the first move. */
    getPosition(): Point | undefined {
        return this.pointerSeen ? this.pointer.clone() : undefined;
    }

    /** The names of the bones following the pointer, by spine id. */
    getBones(): Map<SpineID, string[]> {
        return new Map(
            [...this.follows].map(([spineID, { bones }]) => [
                spineID,
                bones.map((bone) => bone.data.name),
            ]),
        );
    }

    // ─── Following ───────────────────────────────────────────────────────────────

    /**
     * Scans every registered spine for `_followPointer` bones and starts following.
     *
     * Idempotent, and cheap when nothing changed: a spine already followed is skipped, so
     * it is safe to call again after spines are added (a clone, a late instance) to pick
     * their follow bones up too.
     *
     * Listening starts the first time a follow bone is found, and makes the layout container
     * interactive (`eventMode = 'static'`) — Pixi delivers `globalpointermove` to interactive
     * objects on every pointer move, wherever the pointer is, so nothing has to be covered
     * with a hit area to hear the moves.
     */
    attach() {
        log.open(LOG.FOLLOW_POINTER);

        this.spines.forEach((spine, spineID) => {
            if (this.follows.get(spineID)?.spine === spine) return;

            const bones = this.findFollowBones(spine);
            if (!bones.length) return;

            this.follows.set(spineID, { spine, bones, previousHook: this.hook(spineID, spine) });

            bones.forEach((bone) => log.add(LOG.FOLLOW_POINTER, spineID, bone.data.name));
        });

        log.close(LOG.FOLLOW_POINTER);

        if (this.follows.size) this.listen();
    }

    /**
     * Moves the pointer by hand, in stage coordinates — a gamepad stick, a keyboard, a test.
     * The bones follow it exactly as they follow a real pointer, and the next real pointer
     * move takes over again.
     */
    setPosition(x: number, y: number) {
        this.pointer.set(x, y);
        this.pointerSeen = true;
    }

    /** The follow bones of one spine: those named with the modifier, plus those its slots name. */
    private findFollowBones(spine: Spine): Bone[] {
        const mod = parcePointers.mod.followPointer;
        const bones: Map<string, Bone> = new Map();

        spine.skeleton.bones.forEach((bone) => {
            if (bone.data.name.endsWith(mod)) bones.set(bone.data.name, bone);
        });
        // A slot carrying the modifier moves the bone it hangs from: marking the image is
        // the same thing as marking the bone, because the bone is what a slot follows.
        spine.skeleton.slots.forEach((slot) => {
            if (slot.data.name.endsWith(mod)) bones.set(slot.bone.data.name, slot.bone);
        });

        return [...bones.values()];
    }

    /**
     * Poses the spine's follow bones between the animations being applied and the world
     * transforms being computed — where the runtime expects application code to place a
     * bone, so child bones, attachments and slot objects are all built from the pointer's
     * position within the same frame.
     *
     * The hook the spine already carried is kept and called first, so game code that uses
     * it keeps working — and returned, so {@link clear} can hand it back.
     */
    private hook(spineID: SpineID, spine: Spine): (spine: Spine) => void {
        const previousHook = spine.beforeUpdateWorldTransforms;

        spine.beforeUpdateWorldTransforms = (target) => {
            previousHook(target);
            this.poseBones(spineID);
        };

        return previousHook;
    }

    private poseBones(spineID: SpineID) {
        if (!this._enabled || !this.pointerSeen) return;

        const follow = this.follows.get(spineID);
        if (!follow) return;

        follow.bones.forEach((bone) => this.poseBone(follow.spine, bone));
    }

    private poseBone(spine: Spine, bone: Bone) {
        // The pointer is in stage coordinates; a spine's own coordinates are its skeleton's
        // world space (spine-pixi runs skeletons y-down, so the axes line up), and a bone is
        // posed in its parent's space on top of that.
        const inSpine = spine.toLocal(this.pointer, undefined, this.spacePoint);
        const target = this.bonePoint.set(inSpine.x, inSpine.y);

        if (bone.parent) bone.pose.worldToParent(target);
        else this.skeletonToRoot(spine.skeleton, target);

        const { setupPose } = bone.data;
        const strength = this.strengths.get(bone.data.name) ?? this._strength;

        bone.pose.x = setupPose.x + (target.x - setupPose.x) * strength;
        bone.pose.y = setupPose.y + (target.y - setupPose.y) * strength;
    }

    /**
     * A root bone has no parent to be posed against: it is posed in skeleton space, scaled
     * and offset by the skeleton itself (see `BonePose.updateWorldTransform`).
     */
    private skeletonToRoot(skeleton: Skeleton, point: Vector2) {
        const { scaleX, scaleY } = skeleton;

        point.x = scaleX ? (point.x - skeleton.x) / scaleX : 0;
        point.y = scaleY ? (point.y - skeleton.y) / scaleY : 0;
    }

    private listen() {
        if (this.listening) return;
        this.listening = true;

        this.root.eventMode = 'static';
        this.root.on('globalpointermove', this.onPointerMove);
    }

    private onPointerMove = (event: FederatedPointerEvent) => {
        this.setPosition(event.global.x, event.global.y);
    };

    /** Returns every follow bone to its setup position. */
    private resetBones() {
        this.follows.forEach(({ bones }) =>
            bones.forEach((bone) => {
                const { setupPose } = bone.data;
                bone.pose.x = setupPose.x;
                bone.pose.y = setupPose.y;
            }),
        );
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────────

    clear() {
        this.resetBones();

        this.follows.forEach(({ spine, previousHook }) => {
            spine.beforeUpdateWorldTransforms = previousHook;
        });
        this.follows.clear();
        this.strengths.clear();

        if (this.listening) {
            this.root.off('globalpointermove', this.onPointerMove);
            this.listening = false;
        }

        this.pointerSeen = false;
    }
}
