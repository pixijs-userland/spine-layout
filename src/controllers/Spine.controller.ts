import {
    MeshAttachment,
    Physics,
    RegionAttachment,
    Spine,
    type BoneData,
    type Slot,
    type SlotData,
    type TextureAtlasRegion,
} from '@esotericsoftware/spine-pixi-v8';
import { Point, Rectangle, Texture } from 'pixi.js';
import type { SpineID } from '../config/types';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';
import type { AnimationsController } from './Animations.controller';

export class SpineController {
    constructor(
        private spines: Map<SpineID, Spine>,
        private animations: AnimationsController,
    ) { }

    /** Clones a Spine instance, registers it under `newSpineID`, and offsets its position by 100px so it doesn't overlap. */
    clone(spine: Spine, newSpineID: string): Spine {
        const cloned = new Spine(spine.skeleton.data);

        cloned.position.copyFrom({ x: spine.position.x + 100, y: spine.position.y + 100 });
        cloned.scale.copyFrom(spine.scale);
        cloned.rotation = spine.rotation;

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
    cloneBySpineID(spineID: string, newSpineID: string): Spine | null {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.warn(`Spine not found: ${spineID}`);
            return null;
        }

        return this.clone(spine, newSpineID);
    }

    /** Returns all bone definitions whose names start with `pattern`, across all registered spines. */
    getBonesByNamePattern(pattern: string): BoneData[] {
        const bones: BoneData[] = [];
        this.spines.forEach((spine) => {
            spine?.state.data.skeletonData.bones.forEach((bone) => {
                if (bone.name.startsWith(pattern)) bones.push(bone);
            });
        });
        return bones;
    }

    /** Returns all slot definitions whose names start with `pattern`, across all registered spines. */
    getSlotsByNamePattern(pattern: string): SlotData[] {
        const slots: SlotData[] = [];
        this.spines.forEach((spine) => {
            spine?.state.data.skeletonData.slots.forEach((slot) => {
                if (slot.name.startsWith(pattern)) slots.push(slot);
            });
        });
        return slots;
    }

    /** Finds the first live slot with the given name across all registered spines. */
    getSlotByName(name: string): Slot | undefined {
        for (const spine of this.spines.values()) {
            const slot = spine.skeleton.findSlot(name);
            if (slot) return slot;
        }
    }

    /** Returns all registered spines whose IDs start with `pattern`. Pass `options.not` to exclude IDs containing those substrings. */
    getSpinesByNamePattern(pattern: string, options?: { not?: string[] }): Map<string, Spine> {
        const result = new Map<string, Spine>();
        this.spines.forEach((spine, id) => {
            if (!id.startsWith(pattern)) return;
            if (options?.not?.some((p) => id.includes(p))) return;
            result.set(id, spine);
        });
        return result;
    }

    /** Returns the world-space position of the first bone matching `boneName` on the given spine. */
    getBoneGlobalPosition(spineID: string, boneName: string): Point | undefined {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.warn(`Spine not found: ${spineID}`);
            return;
        }

        spine.skeleton.updateWorldTransform(Physics.update);
        let position: Point | undefined;

        spine.state.data.skeletonData.bones.forEach((bone) => {
            if (bone.name.startsWith(boneName)) {
                const p = this.getBoneGlobalPos(spine, bone.name);
                if (p) position = p;
            }
        });

        return position;
    }

    /** Returns a name→Point map of world-space positions for all bones matching the prefix, across all spines. */
    getBonesGlobalPositionsByNamePattern(pattern: string): Record<string, Point> {
        const positions: Record<string, Point> = {};
        this.spines.forEach((spine) => {
            spine.skeleton.updateWorldTransform(Physics.update);
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
    getSlotsGlobalPositionsByNamePattern(pattern: string): Record<string, Point> {
        const positions: Record<string, Point> = {};
        this.spines.forEach((spine) => {
            spine.skeleton.updateWorldTransform(Physics.update);
            spine.state.data.skeletonData.slots.forEach((slot) => {
                if (slot.name.startsWith(pattern)) {
                    const p = this.getSlotGlobalPos(spine, slot.name);
                    if (p) positions[slot.name] = p;
                }
            });
        });
        return positions;
    }

    /** Extracts the Pixi.js `Texture` from a slot's attachment. Returns `null` if the slot has no region/mesh attachment. */
    getSlotTexture(spineName: string, slotName: string): Texture | null {
        const spine = this.spines.get(spineName);
        if (!spine) {
            console.warn(`Spine not found: ${spineName}`);
            return null;
        }

        const slot = spine.skeleton.findSlot(slotName);
        const attachment = slot?.pose.attachment;

        if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) {
            return this.getTextureFromAttachmentRegion(attachment) ?? null;
        }
        return null;
    }

    getBoneGlobalPos(spine: Spine, boneName: string): Point | null {
        const bone = spine.skeleton.findBone(boneName);

        if (!bone) return null;

        return spine.toGlobal(new Point(bone.pose.worldX, bone.pose.worldY)) as Point;
    }

    private getSlotGlobalPos(spine: Spine, slotName: string): Point | null {
        const slot = spine.skeleton.findSlot(slotName);

        if (!slot) return null;

        return spine.toGlobal(new Point(slot.bone.pose.worldX, slot.bone.pose.worldY)) as Point;
    }

    private getTextureFromAttachmentRegion(
        att: RegionAttachment | MeshAttachment,
    ): Texture | undefined {
        const rawRegion = att.sequence?.regions[0];
        if (!rawRegion) {
            console.warn('Invalid attachment or region');
            return;
        }

        const region = rawRegion as TextureAtlasRegion & { rotate: boolean };
        const pageTex: Texture = region.texture.texture;
        const frame = new Rectangle(region.x, region.y, region.width, region.height);
        let sub = new Texture({ source: pageTex.source, frame }) as Texture & { rotate: number };

        if (region.degrees === 90 || region.rotate === true) {
            const rotatedFrame = new Rectangle(region.x, region.y, region.height, region.width);
            sub = new Texture({ source: pageTex.source, frame: rotatedFrame }) as typeof sub;
            sub.rotate = 2;
        }

        return sub;
    }
}
