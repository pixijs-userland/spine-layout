import type {
    Pixi4Container,
    Pixi4Matrix,
    Pixi4Namespace,
    Pixi4Spine,
    Spine38Slot,
} from './pixi4.types';
import { onSpineUpdate } from './updateHooks';

type SlotObject = {
    child: Pixi4Container;
    /** Sits in the slot's container and undoes its transform and alpha, so `child` is in skeleton space. */
    holder: Pixi4Container;
    /** pixi-spine's own sprites this module hid while the slot showed nothing. */
    hidden: Set<Pixi4Container>;
};

function invert(m: Pixi4Matrix, out: Pixi4Matrix) {
    const det = m.a * m.d - m.b * m.c;

    if (!det) {
        Object.assign(out, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
        return;
    }

    out.a = m.d / det;
    out.b = -m.b / det;
    out.c = -m.c / det;
    out.d = m.a / det;
    out.tx = (m.c * m.ty - m.d * m.tx) / det;
    out.ty = (m.b * m.tx - m.a * m.ty) / det;
}

/**
 * Slot objects as spine-pixi-v8 drives them: each update the object takes its bone's world
 * transform (y axis flipped, so Pixi content stands upright), the slot's alpha, and is hidden
 * while that alpha is 0.
 *
 * pixi-spine has no such thing. Its `slotContainers[i]` gives draw order and clipping for free,
 * but carries the bone transform only while a region shows, its alpha only while anything does,
 * and is hidden whenever the slot is empty — so the object hangs off a holder that cancels all
 * three, and an empty slot's container is kept visible with pixi-spine's stale sprites hidden.
 */
export function createSlotObjects(PIXI: Pixi4Namespace) {
    const registry = new WeakMap<Pixi4Spine, Map<number, SlotObject>>();
    const holders = new WeakSet<Pixi4Container>();
    const matrix = new PIXI.Matrix();
    const { RegionAttachment, MeshAttachment, ClippingAttachment } = PIXI.spine.core;

    const isDrawn = (attachment: unknown) =>
        attachment instanceof RegionAttachment ||
        attachment instanceof MeshAttachment ||
        attachment instanceof ClippingAttachment;

    const isCurrent = (slot: Spine38Slot, view: Pixi4Container) =>
        view === slot.currentSprite ||
        view === slot.currentMesh ||
        view === slot.currentGraphics ||
        view === slot.clippingContainer;

    function syncSlot(spine: Pixi4Spine, index: number, entry: SlotObject) {
        const slot = spine.skeleton.slots[index];
        const container = spine.slotContainers[index];
        const { holder, child, hidden } = entry;

        if (!isDrawn(slot.attachment)) {
            container.children.forEach((view) => {
                if (view === holder || !view.visible) return;
                view.visible = false;
                hidden.add(view);
            });
            container.visible = true;
            container.alpha = 1;
        } else if (hidden.size) {
            hidden.forEach((view) => {
                if (isCurrent(slot, view)) view.visible = true;
            });
            hidden.clear();
        }

        container.transform.updateLocalTransform();
        invert(container.transform.localTransform, holder.transform.localTransform);
        holder.alpha = container.alpha > 0 ? 1 / container.alpha : 1;

        const alpha = spine.skeleton.color.a * slot.color.a;
        const renderable = slot.bone.active !== false && spine.alpha > 0 && alpha > 0;

        child.visible = renderable;
        if (!renderable) return;

        const bone = slot.bone.matrix;
        matrix.a = bone.a;
        matrix.b = bone.b;
        matrix.c = -bone.c;
        matrix.d = -bone.d;
        matrix.tx = bone.tx;
        matrix.ty = bone.ty;

        if (child.transform.setFromMatrix) child.transform.setFromMatrix(matrix);
        else Object.assign(child.transform.localTransform, matrix);

        child.alpha = alpha;
    }

    function objectsOf(spine: Pixi4Spine): Map<number, SlotObject> {
        const existing = registry.get(spine);
        if (existing) return existing;

        const objects = new Map<number, SlotObject>();

        onSpineUpdate(spine, () =>
            objects.forEach((entry, index) => syncSlot(spine, index, entry)),
        );
        registry.set(spine, objects);

        return objects;
    }

    function remove(spine: Pixi4Spine, index: number) {
        const objects = registry.get(spine);
        const entry = objects?.get(index);
        if (!objects || !entry) return;

        objects.delete(index);
        entry.holder.removeChild(entry.child);
        entry.holder.parent?.removeChild(entry.holder);
        entry.hidden.forEach((view) => (view.visible = true));

        if (!isDrawn(spine.skeleton.slots[index].attachment)) {
            spine.slotContainers[index].visible = false;
        }
    }

    function slotIndex(spine: Pixi4Spine, slotName: string): number {
        return spine.skeleton.data.slots.findIndex((slot) => slot.name === slotName);
    }

    return {
        isHolder: (view: Pixi4Container) => holders.has(view),

        attach(spine: Pixi4Spine, slotName: string, child: Pixi4Container) {
            const index = slotIndex(spine, slotName);
            if (index < 0) throw new Error(`No slot named "${slotName}"`);

            const objects = objectsOf(spine);

            objects.forEach((entry, other) => {
                if (entry.child === child) remove(spine, other);
            });
            remove(spine, index);

            const holder = new PIXI.Container();
            holder.transform = new PIXI.TransformBase();
            holder.name = `slot-object:${slotName}`;
            holders.add(holder);

            spine.slotContainers[index].addChild(holder);
            holder.addChild(child);

            const entry: SlotObject = { child, holder, hidden: new Set() };
            objects.set(index, entry);
            syncSlot(spine, index, entry);
        },

        get(spine: Pixi4Spine, slotName: string): Pixi4Container | undefined {
            return registry.get(spine)?.get(slotIndex(spine, slotName))?.child;
        },

        detach(spine: Pixi4Spine, slotOrChild: string | Pixi4Container) {
            const objects = registry.get(spine);
            if (!objects) return;

            if (typeof slotOrChild === 'string') {
                remove(spine, slotIndex(spine, slotOrChild));
                return;
            }

            objects.forEach((entry, index) => {
                if (entry.child === slotOrChild) remove(spine, index);
            });
        },
    };
}

export type SlotObjects = ReturnType<typeof createSlotObjects>;
