import type { Engine, EngineTypes, PointLike } from '../../engine/Engine';
import type { SpineID } from '../config/types';
import type { BoneDataOf, SlotDataOf, SlotOf } from '../types';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';
import type { AnimationsController } from './Animations.controller';

export class SpineController<T extends EngineTypes = EngineTypes> {
    constructor(
        private engine: Engine<T>,
        private spines: Map<SpineID, T['Spine']>,
        private animations: AnimationsController<T>,
    ) { }

    /** Clones a Spine instance, registers it under `newSpineID`, and offsets its position by 100px so it doesn't overlap. */
    clone(spine: T['Spine'], newSpineID: string): T['Spine'] {
        const cloned = this.engine.spine.create(spine.skeleton.data);

        cloned.position.copyFrom({ x: spine.position.x + 100, y: spine.position.y + 100 });
        cloned.scale.copyFrom(spine.scale);
        cloned.rotation = spine.rotation;
        this.engine.display.shieldFromHitTesting(cloned);

        if (this.spines.has(newSpineID)) {
            this.spines.get(newSpineID)?.destroy();
            this.spines.delete(newSpineID);
        }
        this.spines.set(newSpineID, cloned);
        this.animations.registerSpine(newSpineID, cloned);

        log.add(LOG.SPINES, newSpineID, `Cloned "${newSpineID}"`);
        return cloned;
    }

    /** Looks up a registered spine by ID then clones it. Returns `null` if the source spine is not found. */
    cloneBySpineID(spineID: string, newSpineID: string): T['Spine'] | null {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.warn(`Spine not found: ${spineID}`);
            return null;
        }

        return this.clone(spine, newSpineID);
    }

    /** Returns all bone definitions whose names start with `pattern`, across all registered spines. */
    getBonesByNamePattern(pattern: string): BoneDataOf<T>[] {
        const bones: BoneDataOf<T>[] = [];
        this.spines.forEach((spine) => {
            spine?.state.data.skeletonData.bones.forEach((bone) => {
                if (bone.name.startsWith(pattern)) bones.push(bone);
            });
        });
        return bones;
    }

    /** Returns all slot definitions whose names start with `pattern`, across all registered spines. */
    getSlotsByNamePattern(pattern: string): SlotDataOf<T>[] {
        const slots: SlotDataOf<T>[] = [];
        this.spines.forEach((spine) => {
            spine?.state.data.skeletonData.slots.forEach((slot) => {
                if (slot.name.startsWith(pattern)) slots.push(slot);
            });
        });
        return slots;
    }

    /** Finds the first live slot with the given name across all registered spines. */
    getSlotByName(name: string): SlotOf<T> | undefined {
        for (const spine of this.spines.values()) {
            const slot = spine.skeleton.findSlot(name);
            if (slot) return slot as SlotOf<T>;
        }
    }

    /** Returns all registered spines whose IDs start with `pattern`. Pass `options.not` to exclude IDs containing those substrings. */
    getSpinesByNamePattern(
        pattern: string,
        options?: { not?: string[] },
    ): Map<string, T['Spine']> {
        const result = new Map<string, T['Spine']>();
        this.spines.forEach((spine, id) => {
            if (!id.startsWith(pattern)) return;
            if (options?.not?.some((p) => id.includes(p))) return;
            result.set(id, spine);
        });
        return result;
    }

    /** Returns the world-space position of the first bone matching `boneName` on the given spine. */
    getBoneGlobalPosition(spineID: string, boneName: string): PointLike | undefined {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.warn(`Spine not found: ${spineID}`);
            return;
        }

        this.engine.spine.updateWorldTransform(spine.skeleton);
        let position: PointLike | undefined;

        spine.state.data.skeletonData.bones.forEach((bone) => {
            if (bone.name.startsWith(boneName)) {
                const p = this.getBoneGlobalPos(spine, bone.name);
                if (p) position = p;
            }
        });

        return position;
    }

    /** Returns a name→Point map of world-space positions for all bones matching the prefix, across all spines. */
    getBonesGlobalPositionsByNamePattern(pattern: string): Record<string, PointLike> {
        const positions: Record<string, PointLike> = {};
        this.spines.forEach((spine) => {
            this.engine.spine.updateWorldTransform(spine.skeleton);
            spine.state.data.skeletonData.bones.forEach((bone) => {
                if (bone.name.startsWith(pattern)) {
                    const p = this.getBoneGlobalPos(spine, bone.name);
                    if (p) positions[bone.name] = p;
                }
            });
        });
        return positions;
    }

    /** Returns a name→Point map of world-space positions for all slots matching the prefix, across all spines. */
    getSlotsGlobalPositionsByNamePattern(pattern: string): Record<string, PointLike> {
        const positions: Record<string, PointLike> = {};
        this.spines.forEach((spine) => {
            this.engine.spine.updateWorldTransform(spine.skeleton);
            spine.state.data.skeletonData.slots.forEach((slot) => {
                if (slot.name.startsWith(pattern)) {
                    const p = this.getSlotGlobalPos(spine, slot.name);
                    if (p) positions[slot.name] = p;
                }
            });
        });
        return positions;
    }

    /** Cuts the image out of a slot's region/mesh attachment. Returns `null` if the slot has no region/mesh attachment. */
    getSlotTexture(spineName: string, slotName: string): T['Texture'] | null {
        const spine = this.spines.get(spineName);
        if (!spine) {
            console.warn(`Spine not found: ${spineName}`);
            return null;
        }

        const slot = spine.skeleton.findSlot(slotName);
        const region = slot && this.engine.spine.regionTexture(this.engine.spine.slotAttachment(slot));

        if (!region) return null;

        const rotated = region.rotate === 90;

        return this.engine.display.subTexture(
            region.page,
            {
                x: region.x,
                y: region.y,
                width: rotated ? region.height : region.width,
                height: rotated ? region.width : region.height,
            },
            region.rotate,
        );
    }

    getBoneGlobalPos(spine: T['Spine'], boneName: string): PointLike | null {
        const bone = spine.skeleton.findBone(boneName);

        if (!bone) return null;

        const { worldX, worldY } = this.engine.spine.bonePose(bone);

        return spine.toGlobal(this.engine.display.point(worldX, worldY));
    }

    private getSlotGlobalPos(spine: T['Spine'], slotName: string): PointLike | null {
        const slot = spine.skeleton.findSlot(slotName);

        if (!slot) return null;

        const { worldX, worldY } = this.engine.spine.bonePose(slot.bone);

        return spine.toGlobal(this.engine.display.point(worldX, worldY));
    }
}
