import { Assets, BitmapFontManager, BitmapText, Container, Text } from 'pixi.js';
import type { Spine, SlotData } from '@esotericsoftware/spine-pixi-v8';
import type { SpineID, TextsJson, TextsJsonBitmapTextEntry, TextsJsonEntry } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import type { AnimationsController } from './Animations.controller';

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
     * Position compensation currently applied by {@link applyMaxWidth}, keyed by registration
     * key. Kept separate from the node position so the configured/`setOffset` offset stays the
     * base the compensation is added to, rather than being overwritten by it.
     */
    #maxWidthShift: Map<string, { x: number; y: number }> = new Map();

    /**
     * @param spines Live spine registry.
     * @param multipleInstanceIDs Ids of spines created as multiple instances (e.g.
     *   `counter_1`). Text slots on these get per-instance config keys so each instance
     *   can be styled separately (see {@link configKey}).
     * @param animations Used to fire the synthetic `<textKey>_change` event whenever a text
     *   value changes (see {@link emitChange}). Optional so the controller stays usable
     *   standalone.
     */
    constructor(
        private spines: Map<SpineID, Spine>,
        private multipleInstanceIDs: Set<string> = new Set(),
        private animations?: AnimationsController,
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

    private async setOne(key: string, text: string, animate = false, duration = 0, emit = true) {
        const target = this.texts.get(key);
        if (!target) return;

        const settings = this.settingsFor(key);
        const previous = target.text;

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
                    if (emit && target.text !== text) this.emitChange(key, previous, text);
                    target.text = text;
                    // the number is unchanged but the prefix/suffix around it may not be
                    this.applyMaxWidth(key, target);
                    return;
                }

                // fired up front so the spine animation runs alongside the count-up
                // rather than after it
                if (emit) this.emitChange(key, previous, text);

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

        const next = settings?.uppercase ? text.toUpperCase() : text;
        if (emit && next !== previous) this.emitChange(key, previous, next);

        target.text = next;
        this.applyMaxWidth(key, target);
    }

    /**
     * Fires the synthetic `<textKey>_change` animation event for a text node whose value just
     * changed — e.g. setting `balance` (the `text_balance` slot) plays everything under
     * `event_balance_change/` and notifies `animations.addEventListener('balance_change', …)`.
     *
     * The bare slot text key is used even for multiple-instance spines, so `counter_1_reward`
     * fires `reward_change` rather than `counter_1_reward_change`.
     */
    private emitChange(key: string, from: string, to: string) {
        if (!this.animations) return;

        const meta = this.#meta.get(key);
        if (!meta?.spineID) return;

        this.animations.playEvent(`${meta.textKey}_change`, meta.spineID, { from, to });
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
            // the offset is the base position; any max-width compensation rides on top of it
            const shift = this.#maxWidthShift.get(key);
            text.x = offset.x + (shift?.x ?? 0);
            text.y = offset.y + (shift?.y ?? 0);
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
        // the fresh node carries neither the old scale nor its compensation
        this.#maxWidthShift.delete(key);
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
        // registration seeds the configured value — not a change, so no `_change` event
        this.setOne(key, value ?? '', false, 0, false);

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
        this.#maxWidthShift.clear();
        this.texts.clear();
        this.#meta.clear();
        this.#textSettings = undefined;
    }

    /**
     * Constrains a node to `maxWidth` by scaling it down, keeping its glyphs centred on the
     * spot the full-size text occupied.
     *
     * Scaling shrinks a node towards its own origin, so text whose glyphs are not centred on
     * that origin travels as it scales — for bitmap text that is the norm rather than the
     * exception (see {@link glyphCentre}), and the text visibly creeps away from its bone. The
     * compensation moves the node back by whatever the glyph centre lost, so scale 1 stays
     * exactly where it is today and every smaller scale stays centred on it.
     */
    private applyMaxWidth(boneName: string, text: Text | BitmapText) {
        const entry = this.settingsFor(boneName);
        if (entry?.type !== 'bitmapText') return;

        // before the measuring below: it decides how tall the text is, and the
        // centring compensation is read off the same layout
        this.applyLineSpacing(entry as TextsJsonBitmapTextEntry, text);

        const { maxWidth } = entry as TextsJsonBitmapTextEntry;

        // undo the previous pass before measuring, so the text is sized at full scale — and so
        // clearing `maxWidth` (the editor can, live) puts the text back rather than stranding it
        // at whatever scale and compensation the last constrained value left behind
        const applied = this.#maxWidthShift.get(boneName);
        if (applied) {
            text.x -= applied.x;
            text.y -= applied.y;
            this.#maxWidthShift.delete(boneName);
        }
        if (applied || maxWidth) text.scale.set(1);

        if (!maxWidth || text.width <= maxWidth) return;

        const scale = maxWidth / text.width;
        text.scale.set(scale);

        const centre = text instanceof BitmapText ? this.glyphCentre(text) : undefined;
        const shift = centre
            ? { x: centre.x * (1 - scale), y: centre.y * (1 - scale) }
            : { x: 0, y: 0 };

        text.x += shift.x;
        text.y += shift.y;
        // recorded even when it is zero: its presence marks the scale as ours to undo
        this.#maxWidthShift.set(boneName, shift);
    }

    /**
     * Gives multi-line bitmap text a line advance its glyphs actually fit in.
     *
     * Pixi spaces lines by the `lineHeight` in the font's own header, and our fonts are
     * exported with that header in a different unit from the glyph rectangles — `green.fnt`
     * declares `size=10 lineHeight=13` over glyphs ~380 units tall (the same mismatch
     * {@link glyphCentre} exists to undo). Thirteen units of advance against a 380-unit
     * glyph does not read as tight leading: the second line lands on top of the first, and
     * a two-line message renders as one illegible smear.
     *
     * So the advance is measured off the glyphs instead — see {@link glyphLineHeight} — and
     * handed back as `style.lineHeight`, which the layout uses in preference to the font's.
     *
     * Only ever for text that has a line to break: single-line text is laid out identically
     * either way, and leaving its `lineHeight` alone keeps every existing field rendering
     * exactly as it does today. An entry that sets its own `lineHeight` is left to it — a
     * number written down in `texts.json` is a decision, not a default to improve on.
     */
    private applyLineSpacing(entry: TextsJsonBitmapTextEntry, text: Text | BitmapText) {
        if (!(text instanceof BitmapText) || entry.lineHeight) return;

        if (!text.text.includes('\n')) {
            // back to the font's own spacing, for a field that no longer wraps
            if (text.style.lineHeight) text.style.lineHeight = 0;
            return;
        }

        const lineHeight = this.glyphLineHeight(text);

        if (lineHeight && text.style.lineHeight !== lineHeight) {
            text.style.lineHeight = lineHeight;
        }

        // Centred unless the entry says otherwise: the node is anchored at its middle, so
        // lines ragged down one side hang off-centre from the bone they belong to. Safe as
        // a default because multi-line bitmap text had no working appearance to preserve —
        // until the spacing above, the lines were drawn on top of one another.
        if (!entry.align) text.style.align = 'center';
    }

    /**
     * How tall one line of this text's glyphs actually is, in the units `style.lineHeight`
     * is given in — the ink extent of the characters in use, from the highest top to the
     * lowest bottom, so ascenders and descenders on neighbouring lines meet rather than
     * overlap.
     *
     * Measured from the characters the text actually contains rather than the whole font:
     * the advance then suits the message being shown, and a font carrying one outsized
     * glyph does not space out every line that has nothing to do with it.
     *
     * `undefined` when there are no glyphs to measure (empty text, or characters the font
     * does not carry), which leaves the font's own spacing in place.
     */
    private glyphLineHeight(text: BitmapText): number | undefined {
        const font = BitmapFontManager.getFont(text.text, text.style);
        const layout = BitmapFontManager.getLayout(text.text, text.style);

        let top = Infinity;
        let bottom = -Infinity;

        layout.lines.forEach((line) =>
            line.chars.forEach((character) => {
                const char = font.chars[character];
                if (!char?.texture) return;

                top = Math.min(top, char.yOffset);
                bottom = Math.max(bottom, char.yOffset + char.texture.orig.height);
            }),
        );

        if (top > bottom) return undefined;

        // the layout takes `style.lineHeight` in display units and divides it back into
        // font units by this same scale, so the measurement is converted on the way out
        return (bottom - top) * layout.scale;
    }

    /**
     * Local-space centre of a bitmap text's rendered glyphs — `undefined` when it has none
     * (empty string, or characters missing from the font).
     *
     * `BitmapText.anchor` centres the node on the font's *line box* (`lineHeight`/`base` from
     * the `.fnt`), not on its glyph rectangles. Our fonts are exported with the two in
     * different units — e.g. `size=10 lineHeight=13 base=10` against glyphs ~334 units tall —
     * so the anchor shifts the text by a handful of units while the glyphs sit hundreds of
     * units below the origin, leaving it effectively unanchored vertically.
     *
     * Mirrors the glyph placement of pixi's bitmap text render pipe: the layout is measured in
     * font units, offset by the anchor, then scaled by `fontSize / <font size>`.
     */
    private glyphCentre(text: BitmapText): { x: number; y: number } | undefined {
        const style = text.style;
        const font = BitmapFontManager.getFont(text.text, style);
        const layout = BitmapFontManager.getLayout(text.text, style);

        let fontSize = font.fontMetrics.fontSize;
        let lineHeight = font.lineHeight;
        if (style.lineHeight) {
            fontSize = style.fontSize / layout.scale;
            lineHeight = style.lineHeight / layout.scale;
        }

        let lineShift = (lineHeight - fontSize) / 2;
        if (lineShift - font.baseLineOffset < 0) lineShift = 0;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let lineY = font.baseLineOffset;

        layout.lines.forEach((line) => {
            line.charPositions.forEach((position, index) => {
                const char = font.chars[line.chars[index]];
                const texture = char?.texture;
                if (!texture) return;

                const left = position + char.xOffset;
                const top = lineY + char.yOffset + lineShift;

                minX = Math.min(minX, left);
                maxX = Math.max(maxX, left + texture.orig.width);
                minY = Math.min(minY, top);
                maxY = Math.max(maxY, top + texture.orig.height);
            });
            lineY += lineHeight;
        });

        if (minX > maxX) return undefined;

        return {
            x: ((minX + maxX) / 2 - text.anchor.x * layout.width) * layout.scale,
            y:
                ((minY + maxY) / 2 - text.anchor.y * (layout.height + layout.offsetY)) *
                layout.scale,
        };
    }
}
