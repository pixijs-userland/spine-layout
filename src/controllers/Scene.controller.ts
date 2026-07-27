import { type Bone, type Slot, type Spine } from '@esotericsoftware/spine-pixi-v8';
import { Container, Sprite, Texture } from 'pixi.js';
import type { SpineID, SpineLayoutOptions } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';
import type { TextsController } from './Texts.controller';
import type { AnimationsController } from './Animations.controller';
import type { SpineController } from './Spine.controller';

type EmbeddedSpine = { spineID: string; spine: Spine };

export class SceneController {
    private buttons: Map<string, Container> = new Map();

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
                    // a child shared by several parents is multiplied into
                    // `<child>_<parent>` instances — prefer this parent's own copy
                    const childID = this.spines.has(`${childKey}_${spineID}`)
                        ? `${childKey}_${spineID}`
                        : childKey;
                    const childSpine = this.spines.get(childID);

                    if (childSpine) {
                        spine.addSlotObject(slot.name, childSpine);
                        log.add(LOG.BONES, spineID, `${childID} -> ${slot.name}`);
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

    /**
     * Wires up buttons declared in the skeleton, two conventions:
     * - `button_<key>` **slots** get an invisible interactive sprite overlaid on the slot.
     * - `button_<key>` **bones** turn every slot object attached beneath them (nested
     *   spines, texts) into the hit area itself — use this to wrap composite buttons.
     * Both fire the same animation events (`<key>_click`, `<key>_hover`, etc.). An
     * embedded spine under a button bone additionally plays its own `click`/`hover`/
     * `unhover`/`down`/`up` animations when it has them.
     */
    activateButtonBones() {
        log.open(LOG.BUTTONS);

        this.spines.forEach((spine, spineID) => {
            // Slot objects grouped by their wrapping button_<key> bone: each group
            // acts as one composite button.
            const wrapperGroups = new Map<string, { slotName: string; object: Container }[]>();

            spine.skeleton.slots.forEach((slot) => {
                const slotName = slot.data.name;

                if (slotName.startsWith(parcePointers.slot.button)) {
                    const texture = this.spine.getSlotTexture(spineID, slotName);
                    const bonePos = this.spine.getBoneGlobalPos(spine, slotName);
                    const button = new Sprite(texture || Texture.WHITE);

                    if (bonePos) {
                        button.x = bonePos.x;
                        button.y = bonePos.y;
                    }
                    button.anchor.set(0.5);

                    const eventBase = slotName.replace(parcePointers.slot.button, '');
                    this.wireButtonEvents(button, eventBase, spineID);

                    spine.addSlotObject(slotName, button);
                    this.buttons.set(slotName, button);

                    log.add(LOG.BUTTONS, spineID, `${eventBase}_click -> ${slotName}`);
                    return;
                }

                const buttonBone = this.findButtonBoneAncestor(slot);
                if (!buttonBone) return;

                const slotObject = spine.getSlotObject(slotName);
                if (!slotObject) return;

                const group = wrapperGroups.get(buttonBone) ?? [];
                group.push({ slotName, object: slotObject });
                wrapperGroups.set(buttonBone, group);
            });

            wrapperGroups.forEach((members, buttonBone) => {
                const eventBase = buttonBone.replace(parcePointers.slot.button, '');
                const embedded = members
                    .map(({ object }) => this.findRegisteredSpine(object))
                    .filter((entry): entry is EmbeddedSpine => !!entry);

                members.forEach(({ slotName, object }) => {
                    this.wireButtonEvents(object, eventBase, spineID);
                    this.wireEmbeddedSpineAnimations(object, embedded);
                    this.buttons.set(`${spineID}:${slotName}`, object);

                    log.add(
                        LOG.BUTTONS,
                        spineID,
                        `${eventBase}_click -> ${slotName} (bone ${buttonBone})`,
                    );
                });
            });
        });

        log.close(LOG.BUTTONS);
    }

    /** Returns the name of the nearest `button_<key>` bone the slot hangs from, if any. */
    private findButtonBoneAncestor(slot: Slot): string | undefined {
        for (let bone: Bone | null = slot.bone; bone; bone = bone.parent) {
            if (bone.data.name.startsWith(parcePointers.slot.button)) return bone.data.name;
        }
        return undefined;
    }

    private wireButtonEvents(target: Container, eventBase: string, spineID: string) {
        target.eventMode = 'static';
        target.cursor = 'pointer';

        target.on('pointertap', () => this.animations.playEvent(`${eventBase}_click`, spineID));
        target.on('pointerover', () => this.animations.playEvent(`${eventBase}_hover`, spineID));
        target.on('pointerout', () => this.animations.playEvent(`${eventBase}_unhover`, spineID));
        target.on('pointerdown', () => this.animations.playEvent(`${eventBase}_down`, spineID));
        target.on('pointerup', () => this.animations.playEvent(`${eventBase}_up`, spineID));
        target.on('pointerupoutside', () =>
            this.animations.playEvent(`${eventBase}_up`, spineID),
        );
    }

    /**
     * Embedded spines under a button bone can ship their own feedback animations
     * (`click`, `hover`, `unhover`, `down` or `up`). Interacting with any part of
     * the composite button plays the matching animation on every embedded spine
     * of that button — via direct instance playback, so other instances of the
     * same skeleton stay idle (an `event_` folder would broadcast to all of them).
     */
    private wireEmbeddedSpineAnimations(target: Container, embedded: EmbeddedSpine[]) {
        const wire = (pointerEvent: string, animation: string) => {
            const players = embedded.filter(({ spine }) =>
                spine.state.data.skeletonData.findAnimation(animation),
            );
            if (!players.length) return;

            target.on(pointerEvent, () =>
                players.forEach(({ spineID }) => this.animations.play(spineID, animation)),
            );
            players.forEach(({ spineID }) =>
                log.add(LOG.BUTTONS, spineID, `${pointerEvent} -> ${animation} (self)`),
            );
        };

        wire('pointertap', 'click');
        wire('pointerover', 'hover');
        wire('pointerout', 'unhover');
        wire('pointerdown', 'down');
        wire('pointerup', 'up');
        wire('pointerupoutside', 'up');
    }

    /** Resolves a slot object back to its registry entry, if it is a spine instance. */
    private findRegisteredSpine(object: Container): EmbeddedSpine | undefined {
        for (const [spineID, spine] of this.spines) {
            if (spine === object) return { spineID, spine };
        }
        return undefined;
    }

    /**
     * Pixi hit-tests a spine's children in reverse insertion order, while spine-pixi renders
     * slot objects (buttons, nested spines, texts) in skeleton draw order. When two slot objects
     * overlap, the one rendered on top can lose pointer events to the one below it. Reorders each
     * spine's slot-object children to match the draw order so the visually topmost object also
     * receives pointer events first.
     */
    syncSlotObjectsWithDrawOrder() {
        this.spines.forEach((spine) => {
            spine.skeleton.drawOrder.appliedPose.forEach((slot) => {
                const container = spine.getSlotObject(slot);
                if (container?.parent === spine) {
                    spine.setChildIndex(container, spine.children.length - 1);
                }
            });
        });
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
