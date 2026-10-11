import type { Engine, EngineTypes, PointLike } from '../../engine/Engine';
import type { BoneLike } from '../../engine/runtime';
import type { SpineID } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';

/** One spine's follow bones, and the update hook they were chained onto. */
type PointerFollow<T extends EngineTypes> = {
    spine: T['Spine'];
    /** The bones of this spine that carry the `_followPointer` modifier. */
    bones: BoneLike[];
    /** Puts back the hook the spine carried before we chained onto it. */
    unhook: () => void;
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
export class PointerController<T extends EngineTypes = EngineTypes> {
    /** Follow bones by spine id — one entry per spine that has any. */
    private follows: Map<SpineID, PointerFollow<T>> = new Map();
    /** Per-bone {@link strength} overrides, by bone name. */
    private strengths: Map<string, number> = new Map();
    /** Last pointer position, in stage coordinates. */
    private pointer: PointLike;
    /** Whether the pointer has been anywhere yet — before that, bones are left alone. */
    private pointerSeen = false;
    /** Stops hearing the pointer; set while listening (see `DisplayPort.onGlobalPointerMove`). */
    private unlisten?: () => void;
    private _enabled = true;
    private _strength = 1;
    /** Scratch points, so following a bone costs no allocation per frame. */
    private readonly spacePoint: PointLike;
    private readonly bonePoint: PointLike = { x: 0, y: 0 };

    constructor(
        private engine: Engine<T>,
        private spines: Map<SpineID, T['Spine']>,
        private root: T['Container'],
    ) {
        this.pointer = engine.display.point();
        this.spacePoint = engine.display.point();
    }

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
    getPosition(): PointLike | undefined {
        return this.pointerSeen ? this.engine.display.point(this.pointer.x, this.pointer.y) : undefined;
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
     * Listening starts the first time a follow bone is found, through an empty interactive
     * child of the layout (`DisplayPort.onGlobalPointerMove`) — nothing has to be covered with a
     * hit area to hear the moves, and nothing about the layout's own interactivity changes.
     */
    attach() {
        log.open(LOG.FOLLOW_POINTER);

        this.spines.forEach((spine, spineID) => {
            if (this.follows.get(spineID)?.spine === spine) return;

            const bones = this.findFollowBones(spine);
            if (!bones.length) return;

            this.follows.set(spineID, { spine, bones, unhook: this.hook(spineID, spine) });

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
        this.pointer.x = x;
        this.pointer.y = y;
        this.pointerSeen = true;
    }

    /** The follow bones of one spine: those named with the modifier, plus those its slots name. */
    private findFollowBones(spine: T['Spine']): BoneLike[] {
        const mod = parcePointers.mod.followPointer;
        const bones: Map<string, BoneLike> = new Map();

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
     * it keeps working — and can be handed back, which is what {@link clear} does.
     */
    private hook(spineID: SpineID, spine: T['Spine']): () => void {
        return this.engine.spine.beforeWorldTransforms(spine, () => this.poseBones(spineID));
    }

    private poseBones(spineID: SpineID) {
        if (!this._enabled || !this.pointerSeen) return;

        const follow = this.follows.get(spineID);
        if (!follow) return;

        follow.bones.forEach((bone) => this.poseBone(follow.spine, bone));
    }

    private poseBone(spine: T['Spine'], bone: BoneLike) {
        // The pointer is in stage coordinates; a spine's own coordinates are its skeleton's
        // world space (spine-pixi runs skeletons y-down, so the axes line up), and a bone is
        // posed in its parent's space on top of that.
        const inSpine = spine.toLocal(this.pointer, undefined, this.spacePoint);
        const target = this.bonePoint;
        const pose = this.engine.spine.bonePose(bone);

        target.x = inSpine.x;
        target.y = inSpine.y;

        pose.worldToParent(target, spine.skeleton);

        const setupPose = this.engine.spine.boneSetup(bone);
        const strength = this.strengths.get(bone.data.name) ?? this._strength;

        pose.x = setupPose.x + (target.x - setupPose.x) * strength;
        pose.y = setupPose.y + (target.y - setupPose.y) * strength;
    }

    private listen() {
        if (this.unlisten) return;

        this.unlisten = this.engine.display.onGlobalPointerMove(this.root, (global) =>
            this.setPosition(global.x, global.y),
        );
    }

    /** Returns every follow bone to its setup position. */
    private resetBones() {
        this.follows.forEach(({ bones }) =>
            bones.forEach((bone) => {
                const setupPose = this.engine.spine.boneSetup(bone);
                const pose = this.engine.spine.bonePose(bone);
                pose.x = setupPose.x;
                pose.y = setupPose.y;
            }),
        );
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────────

    clear() {
        this.resetBones();

        this.follows.forEach(({ unhook }) => unhook());
        this.follows.clear();
        this.strengths.clear();

        this.unlisten?.();
        this.unlisten = undefined;

        this.pointerSeen = false;
    }
}
