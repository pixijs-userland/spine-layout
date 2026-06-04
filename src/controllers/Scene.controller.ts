import { type Spine } from '@esotericsoftware/spine-pixi-v8';
import { Container, Sprite, Texture } from 'pixi.js';
import type { SpineID, SpineLayoutOptions } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';
import type { TextsController } from './Texts.controller';
import type { AnimationsController } from './Animations.controller';
import type { SpineController } from './Spine.controller';

export class SceneController {
    private buttons: Map<string, Sprite> = new Map();

    constructor(
        private spines: Map<SpineID, Spine>,
        private texts: TextsController,
        private animations: AnimationsController,
        private spine: SpineController,
        private options?: SpineLayoutOptions,
    ) { }

    /** Nests child spines into their parent slot objects (via `spine_<id>` naming) and adds root spines to the layout container. */
    attachBones(addChildToLayout: (spine: Spine) => void) {
        log.open(LOG.BONES);

        this.spines.forEach((spine, spineID) => {
            spine?.state.data.skeletonData.slots.forEach((slot) => {
                let skip = false;

                this.options?.skipAttachingSpinesPatterns?.forEach((pattern) => {
                    if (slot.name.startsWith(`spine_${pattern}`)) {
                        skip = true;
                        log.add(LOG.BONES, spineID, `skip: ${slot.name}`);
                    }
                });

                if (slot.name.startsWith(parcePointers.slot.spine) && !skip) {
                    const childKey = slot.name.replace(parcePointers.slot.spine, '');
                    const childSpine = this.spines.get(childKey);

                    if (childSpine) {
                        spine.addSlotObject(slot.name, childSpine);
                        log.add(LOG.BONES, spineID, `${childKey} -> ${slot.name}`);
                    }
                }
            });
        });

        log.close(LOG.BONES);

        this.spines.forEach((spine) => {
            if (!spine.parent) addChildToLayout(spine);
        });
    }

    /** Scans all spines for `text_<key>` slots and creates `Text`/`BitmapText` nodes inside them per `settings/texts.json`. */
    attachTexts() {
        log.open(LOG.TEXT);

        this.spines.forEach((spine, spineID) => {
            spine?.state.data.skeletonData.slots.forEach((slot) => {
                if (!slot.name.startsWith(parcePointers.slot.text)) return;

                const textKey = slot.name.replace(parcePointers.slot.text, '');
                const attached = this.texts.add(slot, spine, textKey, spineID);

                log.add(LOG.TEXT, spineID, attached);
            });
        });

        log.close(LOG.TEXT);
    }

    /** Creates invisible interactive sprites over `button_<key>` slots and wires pointer events to animation events (`<key>_click`, `<key>_hover`, etc.). */
    activateButtonBones() {
        log.open(LOG.BUTTONS);

        this.spines.forEach((spine, spineID) => {
            spine.skeleton.slots.forEach((bone) => {
                const boneName = bone.data.name;
                if (!boneName.startsWith(parcePointers.slot.button)) return;

                const texture = this.spine.getSlotTexture(spineID, boneName);
                const bonePos = this.spine.getBoneGlobalPos(spine, boneName);
                const button = new Sprite(texture || Texture.WHITE);

                if (bonePos) {
                    button.x = bonePos.x;
                    button.y = bonePos.y;
                }
                button.anchor.set(0.5);
                button.eventMode = 'static';
                button.cursor = 'pointer';

                const eventBase = boneName.replace(parcePointers.slot.button, '');

                button.on('pointertap', () =>
                    this.animations.playEvent(`${eventBase}_click`, spineID),
                );
                button.on('pointerover', () =>
                    this.animations.playEvent(`${eventBase}_hover`, spineID),
                );
                button.on('pointerout', () =>
                    this.animations.playEvent(`${eventBase}_unhover`, spineID),
                );
                button.on('pointerdown', () =>
                    this.animations.playEvent(`${eventBase}_down`, spineID),
                );
                button.on('pointerup', () => this.animations.playEvent(`${eventBase}_up`, spineID));
                button.on('pointerupoutside', () =>
                    this.animations.playEvent(`${eventBase}_up`, spineID),
                );

                spine.addSlotObject(boneName, button);
                this.buttons.set(boneName, button);

                log.add(LOG.BUTTONS, spineID, `${eventBase}_click -> ${boneName}`);
            });
        });

        log.close(LOG.BUTTONS);
    }

    /** Manually attaches any Pixi.js `Container` into a named slot on a specific spine. */
    addSlotChild(spineID: string, slotName: string, child: Container) {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.error(`Spine "${spineID}" not found`);
            return;
        }

        const slot = spine.skeleton.data.slots.find((s) => s.name === slotName);
        if (!slot) {
            console.error(`Slot "${slotName}" not found`, spine.skeleton.data.slots);
            return;
        }

        log.add(LOG.ADD_SLOT_CHILD, spineID, `${child} -> "${slotName}"`);
        spine.addSlotObject(slot.name, child);
    }

    clear() {
        this.buttons.clear();
    }
}
