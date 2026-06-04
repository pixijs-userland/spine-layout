import { Assets, BitmapText, Container, Text } from 'pixi.js';
import type { Spine, SlotData } from '@esotericsoftware/spine-pixi-v8';
import type { SpineID, TextsJson, TextsJsonBitmapTextEntry, TextsJsonEntry } from '../config/types';
import { parcePointers } from '../config/parcePointers';

export class TextsController {
    /** Text nodes keyed by their registration key (see {@link configKey}). */
    private texts: Map<SpineID, Text | BitmapText> = new Map();
    /** Maps each registration key back to the spine + slot text key it was created from. */
    #meta: Map<string, { spineID?: string; textKey: string }> = new Map();
    #textSettings: TextsJson | undefined;
    #textRunners: Map<
        string,
        { interval: ReturnType<typeof setInterval>; resolve: () => void }
    > = new Map();

    /**
     * @param spines Live spine registry.
     * @param multipleInstanceIDs Ids of spines created as multiple instances (e.g.
     *   `counter_1`). Text slots on these get per-instance config keys so each instance
     *   can be styled separately (see {@link configKey}).
     */
    constructor(
        private spines: Map<SpineID, Spine>,
        private multipleInstanceIDs: Set<string> = new Set(),
    ) { }

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

    /** Returns the current string value of a text node by its bone name (or registration key). */
    getVal(textID: string): string | undefined {
        const key = this.resolveKeys(textID)[0];
        return key ? this.texts.get(key)?.text : undefined;
    }

    // ─── Registration key resolution (private) ─────────────────────────────────────

    /**
     * Computes the registration key a text node is stored under.
     *
     * For text slots on multiple-instance spines (e.g. `counter_1`) the key is
     * `{spineID}_{textKey}` (e.g. `counter_1_reward`), so each instance is addressed and
     * styled independently. For everything else it is just the bare `textKey`, preserving
     * the existing config keys and the `texts.set('balance', …)` style API.
     */
    private configKey(spineID: string | undefined, textKey: string): string {
        return spineID && this.multipleInstanceIDs.has(spineID) ? `${spineID}_${textKey}` : textKey;
    }

    /**
     * Resolves the effective settings for a `spineID`'s text slot from the nested config.
     *
     * For a multiple-instance spine (`counter_1`) an optional base-spine section
     * (`counter`) is used as a default and the instance section is merged on top, so a
     * common style can be authored once on the base and overridden per instance.
     */
    private mergedEntry(spineID: string | undefined, textKey: string): TextsJsonEntry | undefined {
        if (!spineID) return undefined;

        const entries: TextsJsonEntry[] = [];

        if (this.multipleInstanceIDs.has(spineID)) {
            const baseEntry = this.#textSettings?.[spineID.replace(/_\d+$/, '')]?.[textKey];
            if (baseEntry) entries.push(baseEntry);
        }

        const ownEntry = this.#textSettings?.[spineID]?.[textKey];
        if (ownEntry) entries.push(ownEntry);

        if (entries.length === 0) return undefined;
        return Object.assign({}, ...entries) as TextsJsonEntry;
    }

    /** Effective settings for an already-registered node, by its registration key. */
    private settingsFor(key: string): TextsJsonEntry | undefined {
        const meta = this.#meta.get(key);
        return meta ? this.mergedEntry(meta.spineID, meta.textKey) : undefined;
    }

    /**
     * Maps a public name to the registration keys it targets. An exact registration key
     * matches just itself; otherwise the name is treated as a bare slot text key and
     * matches every instance that has it (so `set('reward')` updates all instances).
     */
    private resolveKeys(name: string): string[] {
        if (this.texts.has(name)) return [name];
        const keys: string[] = [];
        this.#meta.forEach((meta, key) => {
            if (meta.textKey === name) keys.push(key);
        });
        return keys;
    }

    /**
     * Sets the text value. When `animate=true` (or `animateNumber` is set in config),
     * numeric values count up/down over 500ms.
     *
     * `boneName` may be an exact registration key (e.g. `counter_1_reward` to target a
     * single instance) or a bare slot text key (e.g. `reward` to update every instance
     * that has it).
     */
    async set(boneName: string, text: string, animate = false, duration = 0) {
        const keys = this.resolveKeys(boneName);
        if (keys.length === 0) {
            console.error(`Text ${boneName} not found`);
            return;
        }
        await Promise.all(keys.map((key) => this.setOne(key, text, animate, duration)));
    }

    private async setOne(key: string, text: string, animate = false, duration = 0) {
        const target = this.texts.get(key);
        if (!target) return;

        const settings = this.settingsFor(key);

        const existing = this.#textRunners.get(key);
        if (existing !== undefined) {
            clearInterval(existing.interval);
            existing.resolve();
            this.#textRunners.delete(key);
        }

        if (animate || (settings?.animateNumber ?? false)) {
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
                        this.applyMaxWidth(key, target);

                        if (value === end) {
                            clearInterval(runner);
                            this.#textRunners.delete(key);
                            resolve();
                        }
                    }, INTERVAL_MS);

                    this.#textRunners.set(key, { interval: runner, resolve });
                });
                return;
            }
        }

        target.text = settings?.uppercase ? text.toUpperCase() : text;
        this.applyMaxWidth(key, target);
    }

    /** Moves a text node by the given pixel offset relative to its bone position. */
    setOffset(boneName: string, offset: { x: number; y: number }) {
        const keys = this.resolveKeys(boneName);
        if (keys.length === 0) {
            console.error(`Text ${boneName} not found, to set offset`);
            return;
        }
        keys.forEach((key) => {
            const text = this.texts.get(key)!;
            text.x = offset.x;
            text.y = offset.y;
        });
    }

    /** Constrains a text node to a max pixel width by scaling it down uniformly when it overflows. */
    setMaxWidth(boneName: string, maxWidth: number) {
        this.resolveKeys(boneName).forEach((key) => {
            const meta = this.#meta.get(key);
            const entry = meta?.spineID
                ? this.#textSettings?.[meta.spineID]?.[meta.textKey]
                : undefined;
            if (entry?.type === 'bitmapText') (entry as TextsJsonBitmapTextEntry).maxWidth = maxWidth;

            const text = this.texts.get(key);
            if (text) this.applyMaxWidth(key, text);
        });
    }

    /** Swaps a text node between `Text` and `BitmapText` at runtime, preserving its current value. */
    setTextType(boneName: string, newType: 'text' | 'bitmapText') {
        this.resolveKeys(boneName).forEach((key) => this.setTextTypeOne(key, newType));
    }

    private setTextTypeOne(key: string, newType: 'text' | 'bitmapText') {
        const existing = this.texts.get(key);
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

        this.texts.set(key, newText);
    }

    /** Applies a partial Pixi.js `TextStyle` to the named text node. */
    setStyle(boneName: string, style: Partial<Text['style']>) {
        const keys = this.resolveKeys(boneName);
        if (keys.length === 0) {
            console.error(`Text ${boneName} not found, to set style`);
            return;
        }
        keys.forEach((key) => {
            const textObject = this.texts.get(key)!;
            if (textObject instanceof BitmapText) style.fill = '#ffffff';
            textObject.style = style;
        });
    }

    set settings(settings: TextsJson) {
        this.#textSettings = settings;
    }

    get settings(): TextsJson | undefined {
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
     * Builds a standalone, styled `Text`/`BitmapText` from the (merged) `texts.json` entry
     * for a spine's text slot, without registering or attaching it. Use for nodes added
     * manually to non-`text_` slots (e.g. per-instance reward texts).
     */
    buildText(spineID: string, textKey: string): Text | BitmapText {
        const entry = this.mergedEntry(spineID, textKey);
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

    /** Returns the style data (the merged `texts.json` entry minus `type`/`value`) applied to a node, for logging. */
    getAppliedStyle(spineID: string, textKey: string): Record<string, unknown> {
        const style: Record<string, unknown> = { ...(this.mergedEntry(spineID, textKey) ?? {}) };
        delete style.type;
        delete style.value;
        return style;
    }

    /**
     * Registers and attaches a text node for a `text_<key>` slot. On multiple-instance
     * spines the node is keyed `{spineID}_{textKey}` and styled from the per-instance
     * config entry merged over the shared one (see {@link configKey}, {@link mergedEntry}).
     */
    add(slot: SlotData, spine: Spine, textKey: string, spineID?: string): string {
        const key = this.configKey(spineID, textKey);
        const { type, value, ...rest } = this.mergedEntry(spineID, textKey) ?? {};
        const { offset, maxWidth } = rest as Omit<
            TextsJsonBitmapTextEntry,
            'type' | 'uppercase' | 'value'
        >;

        const text = type === 'bitmapText' ? new BitmapText() : new Text();
        text.anchor.set(0.5, 0.5);

        this.texts.set(key, text);
        this.#meta.set(key, { spineID, textKey });
        this.setStyle(key, rest);
        this.set(key, value ?? '', false);

        if (offset) this.setOffset(key, offset);
        this.setMaxWidth(key, maxWidth ?? 0);

        const wrapper = new Container();
        wrapper.addChild(text);
        spine.addSlotObject(slot.name, wrapper);

        return `${key} -> ${slot.name}`;
    }

    clear() {
        this.#textRunners.forEach((r) => {
            clearInterval(r.interval);
            r.resolve();
        });
        this.#textRunners.clear();
        this.texts.clear();
        this.#meta.clear();
        this.#textSettings = undefined;
    }

    private applyMaxWidth(boneName: string, text: Text | BitmapText) {
        const entry = this.settingsFor(boneName);
        const maxWidth =
            entry?.type === 'bitmapText' ? (entry as TextsJsonBitmapTextEntry).maxWidth : undefined;

        if (!maxWidth) return;

        text.scale.set(1);

        if (text.width > maxWidth) text.scale.set(maxWidth / text.width);
    }
}
