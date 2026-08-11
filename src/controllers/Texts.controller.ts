import { Assets, BitmapFontManager, BitmapText, Container, Text } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import type { Spine, SlotData } from '@esotericsoftware/spine-pixi-v8';
import type { SpineID, TextsJson, TextsJsonBitmapTextEntry, TextsJsonEntry } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import type { AnimationsController } from './Animations.controller';

/**
 * How much of an em the ink of a word covers, near enough — what turns the glyph height
 * measured off a bitmap node into the `fontSize` a `Text` needs to stand in for it (see
 * {@link TextsController.useSystemFont}).
 *
 * A rough figure on purpose. What is being matched is a *picture* of a word against a
 * typeface the browser picks, and no ratio makes those two identical: a Latin cap or
 * ascender fills about three quarters of its em, a Han character nearer nine tenths, and a
 * UI label is one or the other rather than an average. Between them is close enough for a
 * substitution to read as the label it replaces, and the entry's `maxWidth`/`maxHeight`
 * catch whatever is left over.
 */
const INK_PER_EM = 0.8;

/**
 * What a bitmap node is measured against when its own value has no glyphs left to measure —
 * a digit, which every font a game ships carries.
 */
const INK_PROBE = '0';

/** No shift at all — the common "nothing to compensate" case, shared rather than allocated. */
const ORIGIN = { x: 0, y: 0 } as const;

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
     * Where each node sits relative to its bone before centring, keyed by registration key —
     * the entry's `offset`, or whatever {@link setOffset} last wrote.
     *
     * Kept apart from the node position because {@link #centring} is added on top of it: a
     * later `setOffset` has to replace the offset without losing the centring, and a later
     * value change has to replace the centring without losing the offset.
     */
    #offset: Map<string, { x: number; y: number }> = new Map();
    /**
     * What each node is moved by to bring the middle of its glyphs onto its bone, keyed by
     * registration key — see {@link fit}.
     *
     * Recomputed on every value, style and scale change, because all three move the glyphs.
     * Zero for a browser-drawn node, which centres itself on its own origin.
     */
    #centring: Map<string, { x: number; y: number }> = new Map();

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

    /**
     * Whether the loaded export carries a text node under this name — an exact registration key
     * or a bare slot text key, the same two things {@link set} accepts.
     *
     * For a caller whose field is the game's to ship rather than the engine's to require: a game
     * that authored the slot gets the presentation written against it, and one that did not is
     * left alone. {@link set} logs an error for a name it cannot find, which is right for a
     * misspelt key and wrong for a field this game simply does not have.
     */
    has(boneName: string): boolean {
        return this.resolveKeys(boneName).length > 0;
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
     * Puts a value in a text node without announcing it — the write {@link set} makes, minus the
     * `<textKey>_change` event.
     *
     * For a value that is not news: a field being put into the state it should have opened in,
     * before anything has looked at it. Registration seeds the configured `value` this way (see
     * {@link add}), and a caller correcting that value at startup is doing the same thing — an
     * export that animates its field on `_change` would otherwise play that animation over a
     * change the player was never shown the before of.
     *
     * Never for a value the game has arrived at. Those are changes, and the export is entitled to
     * hear about them.
     */
    async seed(boneName: string, text: string) {
        await Promise.all(
            this.resolveKeys(boneName).map((key) => this.setOne(key, text, false, 0, false)),
        );
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
                    this.fit(key, target);
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
                        this.fit(key, target);

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
        this.fit(key, target);
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

    /**
     * Moves a text node by the given pixel offset relative to its bone position.
     *
     * The offset names where the *middle of the value* goes, not where some corner of the
     * node's line box goes — `{ x: 0, y: 0 }` puts the text dead on its bone. See
     * {@link fit} for what that takes.
     */
    setOffset(boneName: string, offset: { x: number; y: number }) {
        const keys = this.resolveKeys(boneName);
        if (keys.length === 0) {
            console.error(`Text ${boneName} not found, to set offset`);
            return;
        }
        keys.forEach((key) => {
            // copied, not held: the editor writes these entries in place, and the base
            // position must not change under us between one fit and the next
            this.#offset.set(key, { x: offset.x, y: offset.y });
            this.place(key);
        });
    }

    /**
     * Puts a node where its offset and its centring together say it belongs — the offset
     * measured from the bone, the centring bringing the middle of the glyphs onto the point
     * the offset names rather than leaving it somewhere below.
     */
    private place(key: string) {
        const text = this.texts.get(key);
        if (!text) return;

        const offset = this.#offset.get(key) ?? ORIGIN;
        const centring = this.#centring.get(key) ?? ORIGIN;

        text.x = offset.x + centring.x;
        text.y = offset.y + centring.y;
    }

    /** Constrains a text node to a max pixel width by scaling it down uniformly when it overflows. */
    setMaxWidth(boneName: string, maxWidth: number) {
        this.setMaxBound(boneName, 'maxWidth', maxWidth);
    }

    /**
     * Constrains a text node to a max pixel height, the same way {@link setMaxWidth} constrains
     * its width. With both set the tighter one decides — see {@link fit}.
     */
    setMaxHeight(boneName: string, maxHeight: number) {
        this.setMaxBound(boneName, 'maxHeight', maxHeight);
    }

    /** Records one of the two size bounds on the settings entry and re-fits the node to it. */
    private setMaxBound(boneName: string, bound: 'maxWidth' | 'maxHeight', value: number) {
        this.resolveKeys(boneName).forEach((key) => {
            const meta = this.#meta.get(key);
            const entry = meta?.spineID
                ? this.#textSettings?.[meta.spineID]?.[meta.textKey]
                : undefined;
            if (entry?.type === 'bitmapText') (entry as TextsJsonBitmapTextEntry)[bound] = value;

            const text = this.texts.get(key);
            if (text) this.fit(key, text);
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
        // the fresh node carries neither the old scale nor a centring measured off glyphs that
        // are gone; where it sits is still the entry's offset, which the swap has not touched
        this.#centring.delete(key);
        this.place(key);
    }

    /**
     * Hands a text node to the browser's own fonts: the `BitmapText` is swapped for a `Text`,
     * sized to stand where its glyphs stood.
     *
     * For a value the game's bitmap font holds no pictures of — a script its atlas was never
     * generated over. A `BitmapText` draws *nothing* for a character it has no glyph for, so
     * the choice is between the artist's lettering and the words being on screen at all; this
     * is how a caller takes the words. Everything else about the node is kept: its place, the
     * size it renders at, the box it is fitted to.
     *
     * The `style` is the caller's — the family to fall through, the fill, whatever it wants a
     * substitution to look like. The *size* is not: it is measured off the glyphs being
     * replaced, so the standing-in word comes out about as big as the drawn one it stands for
     * (see {@link INK_PER_EM}), which no caller could work out for itself.
     *
     * A node that is already a `Text` is left alone. It renders through the browser already,
     * and the bitmap glyphs that would have sized it are gone.
     */
    useSystemFont(boneName: string, style: TextStyleOptions = {}) {
        this.resolveKeys(boneName).forEach((key) => this.useSystemFontOne(key, style));
    }

    private useSystemFontOne(key: string, style: TextStyleOptions) {
        const bitmap = this.texts.get(key);
        if (!(bitmap instanceof BitmapText)) return;

        // measured first, while there are still glyphs to measure
        const height = this.inkHeight(bitmap);
        const entry = this.settingsFor(key) as TextsJsonBitmapTextEntry | undefined;

        this.setTextTypeOne(key, 'text');

        const text = this.texts.get(key);
        if (!text) return;

        // Built rather than copied from the entry: its `fontSize` and `letterSpacing` are in
        // the units of a bitmap font's own header — a `fontSize` of 0.8 against glyphs 324
        // units tall — and mean nothing to a `Text`, which takes both in pixels. The
        // alignment is the one key that carries, and it has to be set here because
        // `applyAlign` only speaks to bitmap nodes.
        text.style = {
            align: entry?.align ?? 'center',
            ...style,
            // a node with nothing measurable keeps pixi's default size, which is at least a
            // word on screen to be seen and fixed
            ...(height && { fontSize: height / INK_PER_EM }),
        };

        // The node stays exactly where it was, which is now the right answer for either kind:
        // the bitmap glyphs were centred on the bone, and a `Text` centres itself on the same
        // point. All the fit has left to do is drop the bitmap centring and re-apply the box.
        this.fit(key, text);
    }

    /**
     * How tall a bitmap node's glyphs render, for a substitution that has to match them —
     * measured against {@link INK_PROBE} when the node's own value has nothing to measure,
     * which is the case whenever the caller has already written the undrawable string into it.
     */
    private inkHeight(text: BitmapText): number | undefined {
        const measured = this.glyphInk(text);
        if (measured) return measured.height;

        const previous = text.text;
        text.text = INK_PROBE;
        const probed = this.glyphInk(text);
        text.text = previous;

        return probed?.height;
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
            if (isBitmap) {
                style.fill = '#ffffff';
                // the box `maxWidth` names is also what the value wraps at, and it has just
                // been dropped from the style — see wrapWidth. Nothing fits these nodes
                // afterwards, so the width has to be right here or not at all.
                const width = this.wrapWidth(entry as TextsJsonBitmapTextEntry);
                style.wordWrap = width > 0;
                if (width > 0) style.wordWrapWidth = width;
                // and the same default a registered node gets — see applyAlign
                style.align ??= 'center';
            }
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
        const { offset, maxWidth, maxHeight } = rest as Omit<
            TextsJsonBitmapTextEntry,
            'type' | 'uppercase' | 'value'
        >;

        const text = type === 'bitmapText' ? new BitmapText() : new Text();
        text.anchor.set(0.5, 0.5);

        this.texts.set(key, text);
        this.#meta.set(key, { spineID, textKey });
        // before the value, so the first fit centres the node on the spot it will keep rather
        // than on its bone and then again on the offset
        this.setOffset(key, offset ?? ORIGIN);
        this.setStyle(key, rest);
        // registration seeds the configured value — not a change, so no `_change` event
        this.setOne(key, value ?? '', false, 0, false);

        // height first, so the single fit that follows sees both bounds at once
        this.setMaxHeight(key, maxHeight ?? 0);
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
        this.#offset.clear();
        this.#centring.clear();
        this.texts.clear();
        this.#meta.clear();
        this.#textSettings = undefined;
    }

    /**
     * Lays a bitmap-configured node out against its entry — where its lines break, how they
     * are spaced and aligned, the scale that keeps it inside `maxWidth`/`maxHeight`, and the
     * shift that leaves the middle of its glyphs on its bone.
     *
     * **The centring is why this runs on every value change.** A bitmap node is created with
     * `anchor` 0.5, which ought to be the whole of it, but `BitmapText.anchor` centres the node
     * on the font's *line box* rather than on its glyphs — and our fonts declare that box in a
     * different unit from their glyph rectangles (`size=10 lineHeight=13` against glyphs ~380
     * units tall), so the anchor moves the node by a handful of units while the glyphs sit
     * hundreds of units below the origin. Anchored on paper, unanchored on screen. So the
     * glyphs are measured instead (see {@link glyphInk}) and the node is moved by whatever
     * their middle is out by — which no fixed offset could stand in for, because the amount
     * depends on the value, on which characters of the font it uses, and on how many lines it
     * wraps to.
     *
     * Scaling is uniform — one factor for both axes, since text squashed on one of them stops
     * being the typeface the artist chose — so where both bounds are set the tighter of the two
     * wins and the text fits the box on whichever side runs out first. Either may be left
     * unset, which is what a text constrained on only one axis does. The scale multiplies the
     * centring rather than fighting it: glyphs at half size sit half as far from the origin, so
     * the shift that brings them back halves with them and the value stays on its bone at every
     * size it is fitted to.
     */
    private fit(key: string, text: Text | BitmapText) {
        const settings = this.settingsFor(key);
        if (settings?.type !== 'bitmapText') return;
        const entry = settings as TextsJsonBitmapTextEntry;

        // all three before the measuring below: the wrap width decides where the lines
        // break, the spacing decides how tall they stack, the alignment decides where along
        // the block each one sits, and both the fit and the centring are read off the layout
        // the three of them produce
        this.applyWrapWidth(entry, text);
        this.applyLineSpacing(entry, text);
        this.applyAlign(entry, text);

        // Undone before anything is measured, so a bound is judged against the text at full
        // size rather than against the scale the last value happened to leave behind — and so
        // clearing a bound (the editor can, live) puts the text back rather than stranding it
        // at whatever the last constrained value fitted to.
        text.scale.set(1);

        const ink = text instanceof BitmapText ? this.glyphInk(text) : undefined;
        const { maxWidth, maxHeight } = entry;

        // only for a bound that is actually set: asking a node how wide it is means laying it
        // out, and a node with no bounds must not pay for it
        const overflows = [
            maxWidth && text.width > maxWidth ? maxWidth / text.width : undefined,
            maxHeight ? this.heightOverflow(text, maxHeight, ink?.height) : undefined,
        ].filter((value): value is number => value !== undefined);

        const scale = overflows.length ? Math.min(...overflows) : 1;
        if (scale !== 1) text.scale.set(scale);

        // A browser-drawn node needs none of this: `Text.anchor` centres on the glyphs it
        // actually drew, so it sits on its bone already and stays there as it scales.
        this.#centring.set(
            key,
            ink ? { x: -ink.centre.x * scale, y: -ink.centre.y * scale } : ORIGIN,
        );
        this.place(key);
    }

    /**
     * The width a bitmap entry wraps its value at — `0` for one that does not wrap.
     *
     * `maxWidth` is the box the text is already fitted to, so it is also the width to break
     * lines at: the two are the same measurement, and a second one would only let them
     * disagree. An entry with `wordWrap` on and no `maxWidth` has no box to wrap into, so it
     * does not wrap — see {@link applyWrapWidth} for why that beats the alternative.
     */
    private wrapWidth(entry: TextsJsonBitmapTextEntry): number {
        return entry.wordWrap ? (entry.maxWidth ?? 0) : 0;
    }

    /**
     * Hands a wrapping bitmap text the width to break its lines at.
     *
     * Pixi wraps at `style.wordWrapWidth`, which our bitmap entries have never carried — the
     * editor writes `wordWrap` and `maxWidth`, and nothing filled the gap between them. So
     * pixi used its own default of 100 pixels, which at the sizes these fields render at is
     * narrower than a single word: every word overflowed the line it started on and got a
     * line of its own, which is not wrapping so much as shredding.
     *
     * Wrapping at `maxWidth` instead makes the two knobs one behaviour: the value fills the
     * box the artist drew, and the scaling in {@link fit} only steps in when even a wrapped
     * line will not fit it — a single word longer than the whole box, which no line break can
     * rescue.
     *
     * With no `maxWidth` the wrap is switched off rather than left on pixi's 100: an entry
     * that never says how wide it is has not asked for lines a hundred pixels long, and text
     * running past its bone is a plainer thing to see and fix than text minced into a column.
     *
     * Applies to a `Text` node as much as a bitmap one, because a bitmap entry whose node has
     * been handed to the browser's fonts ({@link useSystemFont}) is still that entry: the box
     * the artist sized the field to is where its lines have to break, whichever kind of node
     * is drawing them. An entry authored as `text` never reaches here — {@link fit} turns back
     * before it — and keeps wrapping at its own `wordWrapWidth`.
     */
    private applyWrapWidth(entry: TextsJsonBitmapTextEntry, text: Text | BitmapText) {
        const width = this.wrapWidth(entry);

        text.style.wordWrap = width > 0;
        if (width > 0) text.style.wordWrapWidth = width;
    }

    /**
     * Gives multi-line bitmap text a line advance its glyphs actually fit in.
     *
     * Pixi spaces lines by the `lineHeight` in the font's own header, and our fonts are
     * exported with that header in a different unit from the glyph rectangles — `green.fnt`
     * declares `size=10 lineHeight=13` over glyphs ~380 units tall (the same mismatch
     * {@link glyphInk} exists to measure around). Thirteen units of advance against a 380-unit
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

        if (!this.isMultiLine(text)) {
            // back to the font's own spacing, for a field that no longer wraps
            if (text.style.lineHeight) text.style.lineHeight = 0;
            return;
        }

        const lineHeight = this.glyphLineHeight(text);

        if (lineHeight && text.style.lineHeight !== lineHeight) {
            text.style.lineHeight = lineHeight;
        }
    }

    /**
     * Lines a bitmap value's lines up against each other — the entry's `align`, or `center`
     * for one that does not say.
     *
     * Centred by default because the node is anchored at its middle, so lines left ragged
     * down one side hang off-centre from the bone they belong to. Safe as a default because
     * multi-line bitmap text had no working appearance to preserve: until
     * {@link applyLineSpacing} gave it an advance, its lines were drawn on top of one
     * another.
     *
     * Applied whatever the value currently reads, rather than only to text that has lines to
     * align: a single line is laid out identically under every setting (pixi aligns each line
     * against the widest in the block, and the widest is the only one), so there is nothing to
     * spend a measurement deciding, and the style is then already right for the moment the
     * value grows a second line.
     */
    private applyAlign(entry: TextsJsonBitmapTextEntry, text: Text | BitmapText) {
        if (!(text instanceof BitmapText)) return;

        const align = entry.align ?? 'center';

        if (text.style.align !== align) text.style.align = align;
    }

    /**
     * Whether a bitmap text renders on more than one line — either because its value carries
     * a `\n`, or because {@link applyWrapWidth} left it wrapping and the value is wide enough
     * to break. Both need the glyph-measured spacing of {@link applyLineSpacing}: lines the
     * wrap put there land on top of each other exactly like the hand-written ones do.
     *
     * Written text is answered without measuring, and the layout is only asked about text
     * that can actually wrap — a field with no wrap has no lines beyond the ones in its
     * value, and laying its glyphs out to be told so would cost every field that value
     * changes on.
     */
    private isMultiLine(text: BitmapText): boolean {
        if (text.text.includes('\n')) return true;
        if (!text.style.wordWrap) return false;

        const layout = BitmapFontManager.getLayout(text.text, text.style);

        // the layout always closes with an empty trailing line, so the lines carrying glyphs
        // are what it has to be counted by
        return layout.lines.filter((line) => line.charPositions.length > 0).length > 1;
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
     * How far past `maxHeight` a node renders, as the factor that would bring it back —
     * `undefined` when it fits, or when there is nothing to measure.
     *
     * For a bitmap node the height is the one already measured off its glyphs, because
     * `BitmapText.height` cannot answer this for our fonts (see {@link glyphInk}). A
     * browser-drawn one is asked for its own, which is the ink it drew.
     */
    private heightOverflow(
        text: Text | BitmapText,
        maxHeight: number,
        inkHeight: number | undefined,
    ): number | undefined {
        const height = text instanceof BitmapText ? inkHeight : text.height;

        return height && height > maxHeight ? maxHeight / height : undefined;
    }

    /**
     * How tall a bitmap text's glyphs actually render and where their middle sits in the node's
     * own space — `undefined` when there are none to measure (empty value, or characters the
     * font has no picture of).
     *
     * Both come off the glyph rectangles rather than off the node, because for our fonts the
     * node can answer neither. `BitmapText.height` is the *line box* — `layout.height`, the
     * per-line advance summed — declared in a different unit from the rectangles, so it reports
     * a fraction of what is on screen (13 units a line against glyphs ~380 tall) and a
     * `maxHeight` measured against it would never trip. `BitmapText.anchor` centres on that
     * same line box, which leaves the glyphs hundreds of units below the origin. The width
     * needs no such help: `text.width` comes from `xAdvance`, already in glyph units.
     *
     * Mirrors the glyph placement of pixi's bitmap text render pipe: the layout is measured in
     * font units, offset by the anchor, then scaled by `fontSize / <font size>`.
     */
    private glyphInk(
        text: BitmapText,
    ): { height: number; centre: { x: number; y: number } } | undefined {
        // answered without measuring, and without asking pixi for the font: a value with no
        // characters has no ink wherever it is drawn, and a family whose `.fnt` never loaded
        // would have pixi rasterise one from the browser's own fonts to say so
        if (!text.text) return undefined;

        const box = this.glyphBox(text);
        if (!box) return undefined;

        const { minX, maxX, minY, maxY, layout } = box;

        return {
            height: (maxY - minY) * layout.scale,
            centre: {
                x: ((minX + maxX) / 2 - text.anchor.x * layout.width) * layout.scale,
                y:
                    ((minY + maxY) / 2 - text.anchor.y * (layout.height + layout.offsetY)) *
                    layout.scale,
            },
        };
    }

    /**
     * The bounding box of a bitmap text's rendered glyphs, in font units, plus the layout it
     * was measured against — `undefined` when it has none (empty string, or characters
     * missing from the font).
     *
     * `BitmapText.anchor` centres the node on the font's line box (`lineHeight`/`base` from
     * the `.fnt`), not on its glyph rectangles. Our fonts are exported with the two in
     * different units — e.g. `size=10 lineHeight=13 base=10` against glyphs ~334 units tall —
     * so the anchor shifts the text by a handful of units while the glyphs sit hundreds of
     * units below the origin, leaving it effectively unanchored vertically.
     *
     * Mirrors the glyph placement of pixi's bitmap text render pipe: the layout is measured in
     * font units, offset by the anchor, then scaled by `fontSize / <font size>`.
     */
    private glyphBox(
        text: BitmapText,
    ):
        | {
              minX: number;
              maxX: number;
              minY: number;
              maxY: number;
              layout: ReturnType<typeof BitmapFontManager.getLayout>;
          }
        | undefined {
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

        return { minX, maxX, minY, maxY, layout };
    }
}
