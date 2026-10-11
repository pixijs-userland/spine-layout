import type { Engine, EngineTypes } from '../../engine/Engine';
import type { SpineID } from '../config/types';

export class SkinsController<T extends EngineTypes = EngineTypes> {
    private skins: Map<SpineID, string[]> = new Map();

    constructor(
        private engine: Engine<T>,
        private spines: Map<SpineID, T['Spine']>,
    ) {}

    /** Returns the raw map of spineID → registered skin names. */
    getList(): Map<SpineID, string[]> {
        return this.skins;
    }

    /** Returns a flat set of every registered skin name across all spines. */
    getAll(): Set<string> {
        return new Set(Array.from(this.skins.values()).flat());
    }

    /** Returns all skin names registered under the given skin ID. */
    getSpineSkinsBySkinID(skinID: string): string[] {
        return this.skins.get(skinID) ?? [];
    }

    /** Applies a skin by name to every spine that has it defined. */
    apply(skin: string) {
        this.spines.forEach((spine, spineID) => {
            if (spine.skeleton.data.findSkin(skin)) {
                this.applyBySpineID(spineID, skin);
            }
        });
    }

    /** Applies a skin by name to a specific spine instance. */
    applyBySpineID(spineID: string, skinName: string) {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.warn(`Spine not found: ${spineID}`);
            return;
        }

        const skin = spine.skeleton.data.findSkin(skinName);
        if (!skin) {
            console.warn(`Skin not found ${skinName} for spine ${spineID}`);
            return;
        }

        spine.skeleton.setSkin(skin);
        this.engine.spine.setupPose(spine.skeleton, 'slots');
    }

    /** Records a skin name as available for the given spine (used during initialization). */
    registerSkin(spineID: string, skinName: string) {
        const list = this.skins.get(spineID) ?? [];
        list.push(skinName);
        this.skins.set(spineID, list);
    }

    clear() {
        this.skins.clear();
    }
}
