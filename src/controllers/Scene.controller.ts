import { type Bone, type Slot, type Spine } from '@esotericsoftware/spine-pixi-v8';
import { Container, Sprite, Texture, type FederatedPointerEvent } from 'pixi.js';
import type { SpineID, SpineLayoutOptions } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';
import type { TextsController } from './Texts.controller';
import type { AnimationsController } from './Animations.controller';
import type { SpineController } from './Spine.controller';

type EmbeddedSpine = { spineID: string; spine: Spine };

type ButtonInteraction = 'click' | 'hover' | 'out' | 'down' | 'up' | 'up_out';

/**
 * The interactions a button reacts to, and what each one triggers.
 *
 * `events` are suffixed onto the button's key and played on the spine declaring the button
 * (`spin_hover`, `spin_up_out`). `animations` are played on every spine nested inside the
 * button — the first name that spine actually has, so a skeleton can ship either the current
 * `out` or the older `unhover`, and one that has no dedicated `up_out` still returns to its
 * default look when the press is released outside.
 */
const BUTTON_INTERACTIONS: Record<ButtonInteraction, { events: string[]; animations: string[] }> = {
    click: { events: ['click'], animations: ['click'] },
    hover: { events: ['hover'], animations: ['hover'] },
    out: { events: ['out', 'unhover'], animations: ['out', 'unhover'] },
    down: { events: ['down'], animations: ['down'] },
    up: { events: ['up'], animations: ['up'] },
    up_out: { events: ['up_out'], animations: ['up_out', 'out', 'unhover'] },
};

/** A logical button: every container acting as its hit area, plus the pointer state they share. */
type ButtonGroup = {
    /** Button key (`spin` for `button_spin`), the base of its `<key>_<event>` event names. */
    key: string;
    /** The spine the button is declared on — the one its events are played for. */
    spineID: string;
    /** Every container that acts as a hit area for this button. */
    targets: Container[];
    /** The targets the pointer is currently over; the button counts as hovered while non-empty. */
    hovered: Set<Container>;
    /** Whether the button is currently reported as hovered, so only real transitions trigger. */
    isHovered: boolean;
    /** Whether a press started on this button and has not been released yet. */
    isPressed: boolean;
    /** Set while a hover sync is already queued, so one pointer move triggers at most once. */
    hoverSyncQueued: boolean;
};

export class SceneController {
    private buttons: Map<string, Container> = new Map();
    /** Every wired button, by key — what lets {@link press} fire one without a pointer. */
    private buttonGroups: Map<string, ButtonGroup[]> = new Map();

    constructor(
        private spines: Map<SpineID, Spine>,
        private texts: TextsController,
        private animations: AnimationsController,
        private spine: SpineController,
        private options?: SpineLayoutOptions,
    ) { }

    /**
     * Nests child spines into the slot that names them, via the `spine_<id>` convention.
     *
     * Pass `only` to run over a subset of the registry — the spines a later
     * {@link SpineLayout.createInstance} built — so the ones already wired are left alone.
     * Children are looked up across the whole registry either way: a fresh spine nests into
     * its own new children, and into nothing that already has a parent.
     */
    attachBones(only?: Set<SpineID>) {
        log.open(LOG.BONES);

        this.eachSpine(only, (spine, spineID) => {
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
    }

    /** Scans all spines for `text_<key>` slots and creates `Text`/`BitmapText` nodes inside them per `settings/texts.json`. */
    attachTexts(only?: Set<SpineID>) {
        log.open(LOG.TEXT);

        this.eachSpine(only, (spine, spineID) => {
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
     *
     * Both conventions build one logical button per key, whatever the number of hit areas:
     * every interaction ({@link BUTTON_INTERACTIONS}) plays its `<key>_<event>` animation
     * event on the declaring spine, and its own animation (`click`, `hover`, `out`, `down`,
     * `up`, `up_out`) on every spine nested inside the button — nested spines of nested
     * spines included, since a composite button animates as a whole.
     */
    activateButtonBones(only?: Set<SpineID>) {
        log.open(LOG.BUTTONS);

        this.eachSpine(only, (spine, spineID) => {
            // Hit areas grouped by button key: a `button_<key>` slot contributes its overlay
            // sprite, a `button_<key>` bone every slot object hanging beneath it. Both land
            // in the same group, so one key always stays one button.
            const groups = new Map<string, Container[]>();
            const addTarget = (key: string, target: Container) => {
                const targets = groups.get(key) ?? [];
                targets.push(target);
                groups.set(key, targets);
            };

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

                    const key = slotName.replace(parcePointers.slot.button, '');

                    spine.addSlotObject(slotName, button);
                    this.buttons.set(slotName, button);
                    addTarget(key, button);

                    log.add(LOG.BUTTONS, spineID, `${key} -> ${slotName}`);
                    return;
                }

                const buttonBone = this.findButtonBoneAncestor(slot);
                if (!buttonBone) return;

                const slotObject = spine.getSlotObject(slotName);
                if (!slotObject) return;

                const key = buttonBone.replace(parcePointers.slot.button, '');

                this.buttons.set(`${spineID}:${slotName}`, slotObject);
                addTarget(key, slotObject);

                log.add(LOG.BUTTONS, spineID, `${key} -> ${slotName} (bone ${buttonBone})`);
            });

            groups.forEach((targets, key) => {
                const group: ButtonGroup = {
                    key,
                    spineID,
                    targets,
                    hovered: new Set(),
                    isHovered: false,
                    isPressed: false,
                    hoverSyncQueued: false,
                };

                this.wireButton(group);

                // kept so the button can also be pressed by something that isn't a
                // pointer — see {@link press}. Appended rather than replaced: one key
                // may be declared on more than one spine, and a press means all of them.
                this.buttonGroups.set(key, [...(this.buttonGroups.get(key) ?? []), group]);

                this.collectNestedSpines(targets).forEach((nested) =>
                    log.add(
                        LOG.BUTTONS,
                        nested.spineID,
                        `${key} -> ${this.listOwnAnimations(nested).join(', ') || 'no own animations'} (self)`,
                    ),
                );
            });
        });

        log.close(LOG.BUTTONS);
    }

    /** Walks the registry, narrowed to the given ids when the caller passes a set. */
    private eachSpine(only: Set<SpineID> | undefined, wire: (spine: Spine, spineID: SpineID) => void) {
        this.spines.forEach((spine, spineID) => {
            if (only && !only.has(spineID)) return;
            wire(spine, spineID);
        });
    }

    /** Returns the name of the nearest `button_<key>` bone the slot hangs from, if any. */
    private findButtonBoneAncestor(slot: Slot): string | undefined {
        for (let bone: Bone | null = slot.bone; bone; bone = bone.parent) {
            if (bone.data.name.startsWith(parcePointers.slot.button)) return bone.data.name;
        }
        return undefined;
    }

    /**
     * Turns every hit area of a button into one interactive whole.
     *
     * Pointer events land on the individual targets, but the button's state lives on the
     * group, which keeps the seams between the targets invisible: `hover` and `out` follow
     * the pointer entering and leaving the button as a whole (see {@link queueHoverSync}),
     * and a press is tracked across all of them — so releasing over a *different* target of
     * the same button still counts as `up` + `click` (Pixi would fire only `pointertap` on
     * the shared ancestor, which is not a hit area, and nothing on the button itself), while
     * releasing off the button is the distinct `up_out`.
     */
    private wireButton(group: ButtonGroup) {
        group.targets.forEach((target) => {
            target.eventMode = 'static';
            target.cursor = 'pointer';

            target.on('pointerover', () => {
                group.hovered.add(target);
                this.queueHoverSync(group);
            });
            target.on('pointerout', () => {
                group.hovered.delete(target);
                this.queueHoverSync(group);
            });
            target.on('pointerdown', () => {
                group.isPressed = true;
                this.trigger(group, 'down');
            });
            // Pixi dispatches `pointerup` on the released-over target before
            // `pointerupoutside` on the pressed one, so consuming the press here is what
            // keeps a release inside the button from also counting as a release outside it.
            target.on('pointerup', (event: FederatedPointerEvent) => {
                if (!group.isPressed) return;
                group.isPressed = false;
                this.trigger(group, 'up');
                this.trigger(group, 'click');

                // A touch pointer is gone the moment it lifts — it never hovers, and Pixi
                // fires no `pointerout` for it. Settling the button back down keeps one whose
                // `up` restores the *hovered* look from staying lit after a tap.
                if (event.pointerType === 'touch') {
                    group.hovered.clear();
                    group.isHovered = false;
                    this.trigger(group, 'out');
                }
            });
            target.on('pointerupoutside', () => {
                if (!group.isPressed) return;
                group.isPressed = false;
                this.trigger(group, 'up_out');
            });
        });
    }

    /**
     * Reconciles the button's hover state with the targets the pointer is over, once per
     * pointer move.
     *
     * A composite button's hit areas are siblings, so moving the pointer from one onto
     * another makes Pixi fire `pointerout` on the first and `pointerover` on the second
     * within the same dispatch. Collapsing both into a single microtask — and triggering
     * only on a real change — means crossing a seam inside the button stays silent, instead
     * of replaying `hover` (and any sound its animation fires) on every internal border.
     */
    private queueHoverSync(group: ButtonGroup) {
        if (group.hoverSyncQueued) return;
        group.hoverSyncQueued = true;

        queueMicrotask(() => {
            group.hoverSyncQueued = false;

            const isHovered = group.hovered.size > 0;
            if (isHovered === group.isHovered) return;

            group.isHovered = isHovered;
            this.trigger(group, isHovered ? 'hover' : 'out');
        });
    }

    /**
     * Fires one interaction: the button's `<key>_<event>` animation events on the spine
     * declaring it, plus the matching animation on every spine nested inside it.
     *
     * Nested spines are played by instance rather than through an `event_` folder, so other
     * instances of the same skeleton (a second copy of the same button) stay idle.
     */
    private trigger(group: ButtonGroup, interaction: ButtonInteraction) {
        const { events, animations } = BUTTON_INTERACTIONS[interaction];

        events.forEach((event) =>
            this.animations.playEvent(`${group.key}_${event}`, group.spineID),
        );

        this.collectNestedSpines(group.targets).forEach(({ spineID, spine }) => {
            const animation = animations.find((name) => this.hasAnimation(spine, name));
            if (!animation) return;

            // `restart`, because a pointer re-entering an interaction it is already showing
            // must re-apply — a second `hover` while the first still runs, or the look
            // desyncs from the pointer. The feedback animations pose the same bones, so the
            // allocator keeps them taking turns on one track without a reserved index.
            this.animations.play(spineID, animation, false, { restart: true });
        });
    }

    /**
     * Every registered spine inside the button, the hit areas themselves included.
     *
     * Walks the whole container subtree — nested spines are Pixi children of the spine
     * holding their slot — so a button wrapping a spine that itself nests more spines
     * animates all of them. Resolved per interaction instead of cached at wire time, so
     * spines added to the button later (`addSlotChild`) animate with it too.
     */
    private collectNestedSpines(targets: Container[]): EmbeddedSpine[] {
        const nested = new Map<string, Spine>();

        const walk = (container: Container) => {
            const entry = this.findRegisteredSpine(container);
            if (entry) nested.set(entry.spineID, entry.spine);
            container.children.forEach(walk);
        };
        targets.forEach(walk);

        return Array.from(nested, ([spineID, spine]) => ({ spineID, spine }));
    }

    /** The animations a nested spine answers the button's interactions with, for the log. */
    private listOwnAnimations(nested: EmbeddedSpine): string[] {
        const own = Object.values(BUTTON_INTERACTIONS).map(({ animations }) =>
            animations.find((name) => this.hasAnimation(nested.spine, name)),
        );
        return Array.from(new Set(own.filter((animation): animation is string => !!animation)));
    }

    private hasAnimation(spine: Spine, animation: string): boolean {
        return !!spine.state.data.skeletonData.findAnimation(animation);
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
    syncSlotObjectsWithDrawOrder(only?: Set<SpineID>) {
        this.eachSpine(only, (spine) => {
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

    /**
     * Presses a button by key, as if it had been clicked.
     *
     * Runs the same `down` → `up` → `click` sequence {@link wireButton} runs for a
     * pointer, so a keyboard shortcut gets the button's press animation and its
     * `<key>_<event>` events, not just the listener — the button looks pressed
     * because it *is* pressed, through the one path.
     *
     * A press already in progress is left alone: holding the key while the mouse is
     * down must not release the pointer's press out from under it.
     *
     * @returns whether any button carries this key.
     */
    press(key: string): boolean {
        const groups = this.buttonGroups.get(key);

        if (!groups?.length) return false;

        groups.forEach((group) => {
            if (group.isPressed) return;

            this.trigger(group, 'down');
            this.trigger(group, 'up');
            this.trigger(group, 'click');
        });

        return true;
    }

    clear() {
        this.buttons.clear();
        this.buttonGroups.clear();
    }
}
