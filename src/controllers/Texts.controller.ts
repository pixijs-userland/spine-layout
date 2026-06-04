import { Assets, BitmapText, Container, Text } from 'pixi.js';
import type { Spine, SlotData } from '@esotericsoftware/spine-pixi-v8';
import type { SpineID, TextsJson, TextsJsonBitmapTextEntry, TextsJsonEntry } from '../config/types';
import { parcePointers } from '../config/parcePointers';

export class TextsController {
    private texts: Map<SpineID, Text | BitmapText> = new Map();
    #textSettings: TextsJson | undefined;
    #textRunners: Map<
        string,
        { interval: ReturnType<typeof setInterval>; resolve: () => void }
    > = new Map();

    constructor(private spines: Map<SpineID, Spine>) { }

    /** Returns all active text instances (both `Text` and `BitmapText`) keyed by bone name. */
    getInstances(): Map<SpineID, Text | BitmapText> {
        return this.texts;
    }

    /** Returns only the `BitmapText` instances, keyed by bone name. */
    getBitmapInstances(): Map<SpineID, BitmapText> {
        const result = new Map<SpineID, BitmapText>();
        this.texts.forEach((text, key) => {
            if (text instanceof BitmapText) result.set(key, text);
        });
        return result;
    }

    /** Returns a map of spineID → list of text slot names for each spine that has text slots. */
    getBySpine(): Map<string, string[]> {
        const result = new Map<string, string[]>();

        this.spines.forEach((spine, spineID) => {
            const texts: string[] = [];
            spine.state.data.skeletonData.slots.forEach((slot) => {
                if (!slot.name.startsWith(parcePointers.slot.text)) return;
                texts.push(slot.name.replace(parcePointers.slot.text, ''));
            });
            if (texts.length > 0) result.set(spineID, texts);
        });

        return result;
    }

    /** Returns the current string value of a text node by its bone name. */
    getVal(textID: string): string | undefined {
        return this.texts.get(textID)?.text;
    }

    /** Sets the text value. When `animate=true` (or `animateNumber` is set in config), numeric values count up/down over 500ms. */
    async set(boneName: string, text: string, animate = false, duration = 0) {
        const target = this.texts.get(boneName);
        if (!target) {
            console.error(`Text ${boneName} not found`);
            return;
        }

        const existing = this.#textRunners.get(boneName);
        if (existing !== undefined) {
            clearInterval(existing.interval);
            existing.resolve();
            this.#textRunners.delete(boneName);
        }

        if (animate || (this.#textSettings?.[boneName]?.animateNumber ?? false)) {
            const nextMatch = text.match(/^([\s\S]*?)(\d+)([\s\S]*)$/);

            if (nextMatch) {
                const prefix = nextMatch[1];
                const suffix = nextMatch[3];
                const end = Math.trunc(Number(nextMatch[2]));
                const currentMatch = target.text.match(/^([\s\S]*?)(\d+)([\s\S]*)$/);
                let value = currentMatch ? Math.trunc(Number(currentMatch[2])) : 0;
                const diff = Math.abs(end - value);

                if (diff === 0) {
                    target.text = text;
                    return;
                }

                const DURATION_MS = duration || 500;
                const INTERVAL_MS = 16;
                const totalTicks = DURATION_MS / INTERVAL_MS;
                const stepSize = Math.max(1, Math.round(diff / totalTicks));
                const direction = end > value ? 1 : -1;

                await new Promise<void>((resolve) => {
                    const runner = setInterval(() => {
                        value += stepSize * direction;
                        if (direction > 0 && value >= end) value = end;
                        if (direction < 0 && value <= end) value = end;

                        target.text = `${prefix}${value}${suffix}`;
                        this.applyMaxWidth(boneName, target);

                        if (value === end) {
                            clearInterval(runner);
                            this.#textRunners.delete(boneName);
                            resolve();
                        }
                    }, INTERVAL_MS);

                    this.#textRunners.set(boneName, { interval: runner, resolve });
                });
                return;
            }
        }

        target.text = this.#textSettings?.[boneName]?.uppercase ? text.toUpperCase() : text;
        this.applyMaxWidth(boneName, target);
    }

    /** Moves a text node by the given pixel offset relative to its bone position. */
    setOffset(boneName: string, offset: { x: number; y: number }) {
        const text = this.texts.get(boneName);
        if (text) {
            text.x = offset.x;
            text.y = offset.y;
        } else {
            console.error(`Text ${boneName} not found, to set offset`);
        }
    }

    /** Constrains a text node to a max pixel width by scaling it down uniformly when it overflows. */
    setMaxWidth(boneName: string, maxWidth: number) {
        const entry = this.#textSettings?.[boneName];
        const text = this.texts.get(boneName);
        if (entry?.type === 'bitmapText') (entry as TextsJsonBitmapTextEntry).maxWidth = maxWidth;
        if (text) this.applyMaxWidth(boneName, text);
    }

    /** Swaps a text node between `Text` and `BitmapText` at runtime, preserving its current value. */
    setTextType(boneName: string, newType: 'text' | 'bitmapText') {
        const existing = this.texts.get(boneName);
        if (!existing) return;

        const isCurrentBitmap = existing instanceof BitmapText;
        const needsBitmap = newType === 'bitmapText';
        if (isCurrentBitmap === needsBitmap) return;

        const parent = existing.parent;
        if (!parent) return;

        const newText = needsBitmap ? new BitmapText() : new Text();
        newText.anchor.set(0.5, 0.5);
        newText.text = existing.text;

        parent.removeChild(existing);
        existing.destroy();
        parent.addChild(newText);

        this.texts.set(boneName, newText);
    }

    /** Applies a partial Pixi.js `TextStyle` to the named text node. */
    setStyle(boneName: string, style: Partial<Text['style']>) {
        const textObject = this.texts.get(boneName);
        if (!textObject) {
            console.error(`Text ${boneName} not found, to set style`);
            return;
        }
        if (textObject instanceof BitmapText) style.fill = '#ffffff';
        textObject.style = style;
    }

    set settings(settings: Record<string, TextsJsonEntry>) {
        this.#textSettings = settings;
    }

    get settings(): Record<string, TextsJsonEntry> | undefined {
        return this.#textSettings;
    }

    loadSettings() {
        // The pixi manifest registers the settings file under its shortcut alias
        // (`texts.json`) and full relative path (`<skin>/settings/texts.json`),
        // never `settings/texts.json`. Try the shortcut first, then fall back.
        const texts = (Assets.get('texts.json') ?? Assets.get('settings/texts.json')) as
            | TextsJson
            | undefined;

        if (texts) this.#textSettings = texts;
    }

    /**
     * Updates the displayed string of an already-registered text object whose key matches
     * `slotName`. The `spineID` is validated only to guard against unknown spines — the
     * lookup itself is by text key, so any registered text with that key is updated
     * regardless of which spine it belongs to. No-ops (with an error log) if the spine is
     * missing, and silently does nothing if no registered text matches `slotName`.
     */
    setBySpineID(spineID: string, slotName: string, text: string) {
        const spine = this.spines.get(spineID);
        if (!spine) {
            console.error(`Spine "${spineID}" not found`);
            return;
        }

        this.texts.forEach((textObject, textKey) => {
            if (textKey === slotName) {
                textObject.text = text;
            }
        });
    }

    /**
     * Attaches an externally-built `Text`/`BitmapText` node to a named slot of the given
     * spine via `addSlotObject`, so the node follows that slot's transform. Use for text
     * created outside the normal `texts.json` registration flow (e.g. nodes from
     * {@link buildText}). Logs an error and no-ops if the spine or the slot is not found.
     */
    addTextToSlot(spineID: string, slotName: string, text: Text | BitmapText) {
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

        spine.addSlotObject(slot.name, text);
    }

    /**
     * Builds a standalone, styled `Text`/`BitmapText` from the `texts.json` entry for `key`,
     * without registering or attaching it to a slot. Use for nodes added manually to
     * non-`text_` slots (e.g. per-instance reward texts on multiple-instance spines).
     */
    buildText(key: string): Text | BitmapText {
        const entry = this.#textSettings?.[key];
        const isBitmap = entry?.type === 'bitmapText';
        const text = isBitmap ? new BitmapText() : new Text();
        text.anchor.set(0.5, 0.5);

        if (entry) {
            const style: Record<string, unknown> = { ...entry };
            delete style.type;
            delete style.value;
            delete style.uppercase;
            delete style.animateNumber;
            delete style.offset;
            delete style.maxWidth;
            if (isBitmap) style.fill = '#ffffff';
            text.style = style as Partial<Text['style']>;
        }

        return text;
    }

    /** Returns the style data (the `texts.json` entry minus `type`/`value`) applied to a text node, for logging. */
    getAppliedStyle(textKey: string): Record<string, unknown> {
        const style: Record<string, unknown> = { ...(this.#textSettings?.[textKey] ?? {}) };
        delete style.type;
        delete style.value;
        return style;
    }

    add(slot: SlotData, spine: Spine, textKey: string): string {
        const { type, value, ...rest } = this.#textSettings?.[textKey] ?? {};
        const { offset, maxWidth } = rest as Omit<
            TextsJsonBitmapTextEntry,
            'type' | 'uppercase' | 'value'
        >;

        const text = type === 'bitmapText' ? new BitmapText() : new Text();
        text.anchor.set(0.5, 0.5);

        this.texts.set(textKey, text);
        this.setStyle(textKey, rest);
        this.set(textKey, value ?? '', false);

        if (offset) this.setOffset(textKey, offset);
        this.setMaxWidth(textKey, maxWidth ?? 0);

        const wrapper = new Container();
        wrapper.addChild(text);
        spine.addSlotObject(slot.name, wrapper);

        return `${textKey} -> ${slot.name}`;
    }

    clear() {
        this.#textRunners.forEach((r) => {
            clearInterval(r.interval);
            r.resolve();
        });
        this.#textRunners.clear();
        this.texts.clear();
        this.#textSettings = undefined;
    }

    private applyMaxWidth(boneName: string, text: Text | BitmapText) {
        const entry = this.#textSettings?.[boneName];
        const maxWidth =
            entry?.type === 'bitmapText' ? (entry as TextsJsonBitmapTextEntry).maxWidth : undefined;

        if (!maxWidth) return;

        text.scale.set(1);

        if (text.width > maxWidth) text.scale.set(maxWidth / text.width);
    }
}
