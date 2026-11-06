import type { TextCapabilities, TextPort } from '../../engine/Engine';
import { glyphSize, layoutBitmapText, type BitmapLayout } from './bitmapFont';
import type { LegacyCompat } from './compat';
import type {
    LegacyBitmapFontData,
    LegacyBitmapText,
    LegacyNamespace,
    LegacyPageMeshData,
    LegacySpine,
    LegacyText,
    LegacyTypes,
} from './legacy.types';

type Style = Record<string, unknown>;

export interface LegacyTextCapabilities extends TextCapabilities {
    /** What each node type can do; the port-wide flags are what both can. */
    readonly byNode: Readonly<Record<'text' | 'bitmapText', TextCapabilities>>;
}

export interface LegacyTextPort<S extends LegacySpine = LegacySpine> extends TextPort<
    LegacyTypes<S>
> {
    readonly capabilities: LegacyTextCapabilities;
}

const TEXT_STYLE_KEYS = [
    'align',
    'breakWords',
    'dropShadowAlpha',
    'dropShadowAngle',
    'dropShadowBlur',
    'dropShadowColor',
    'dropShadowDistance',
    'fill',
    'fillGradientType',
    'fillGradientStops',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'leading',
    'letterSpacing',
    'lineHeight',
    'lineJoin',
    'miterLimit',
    'padding',
    'strokeThickness',
    'textBaseline',
    'trim',
    'whiteSpace',
    'wordWrap',
    'wordWrapWidth',
] as const;

/**
 * Installed so that a bitmap node always sits on a font: 5.3+ throw on a family that is not
 * installed, in the constructor, the `fontName` setter and every layout.
 */
export const NO_FONT = 'spine-layout:no-font';

const isObject = (value: unknown): value is Style => typeof value === 'object' && value !== null;

function copyDefined(target: Style, fields: Record<string, unknown>) {
    Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined) target[key] = value;
    });
}

function colorOf(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return undefined;

    const hex = /^(?:#|0x)([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
    if (!hex) return undefined;

    return parseInt(hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex, 16);
}

/**
 * `texts.json` (or a legacy style already) → `TextStyle` options; anything else is dropped. v7
 * throws on a v8 stroke or drop shadow object, and v4–v6 ignore one silently.
 */
function textStyleOf(source: Style): Style {
    const style: Style = {};

    TEXT_STYLE_KEYS.forEach((key) => {
        if (source[key] !== undefined) style[key] = source[key];
    });
    if (style.align === 'justify') style.align = 'left';

    const { stroke, dropShadow } = source;

    if (isObject(stroke)) {
        copyDefined(style, { stroke: stroke.color, strokeThickness: stroke.width });
    } else if (stroke !== undefined) style.stroke = stroke;

    if (isObject(dropShadow)) {
        style.dropShadow = true;
        copyDefined(style, {
            dropShadowColor: dropShadow.color,
            dropShadowAlpha: dropShadow.alpha,
            dropShadowBlur: dropShadow.blur,
            dropShadowAngle: dropShadow.angle,
            dropShadowDistance: dropShadow.distance,
        });
    } else if (dropShadow !== undefined) style.dropShadow = dropShadow;

    return style;
}

export function createTextPort<S extends LegacySpine>(
    PIXI: LegacyNamespace,
    compat: LegacyCompat,
): LegacyTextPort<S> {
    const { BitmapText, fonts } = compat;
    const lineHeights = new WeakMap<LegacyBitmapText, number>();
    const letterSpacings = new WeakMap<LegacyBitmapText, number>();
    const families = new WeakMap<LegacyBitmapText, string | null>();
    const laidOutWith = new WeakMap<LegacyBitmapText, LegacyBitmapFontData | undefined>();
    const waiting = new Map<string, Set<LegacyBitmapText>>();

    fonts[NO_FONT] ??= {
        font: NO_FONT,
        size: 1,
        lineHeight: 0,
        chars: {},
        distanceFieldType: 'none',
    };

    const isBitmapText = (view: unknown): view is LegacyBitmapText => view instanceof BitmapText;

    const installed = (family: string | null | undefined): family is string =>
        !!family && family !== NO_FONT && fonts[family] !== undefined;

    const familyOf = (node: LegacyBitmapText) =>
        families.has(node) ? families.get(node)! : compat.fontName(node);

    function stopWaiting(node: LegacyBitmapText) {
        const family = families.get(node);
        if (!family) return;

        const nodes = waiting.get(family);
        nodes?.delete(node);
        if (nodes?.size === 0) waiting.delete(family);
    }

    /**
     * Lays the node out on `family` once it is installed, and on the placeholder until then:
     * at once from `registerBitmapFont`, or at its next layout for a font a game's own loader
     * installed.
     */
    function setFamily(node: LegacyBitmapText, family: string | null) {
        stopWaiting(node);
        families.set(node, family);

        if (installed(family)) {
            compat.setFontName(node, family);
            return;
        }

        compat.setFontName(node, NO_FONT);
        if (family && family !== NO_FONT) {
            const nodes = waiting.get(family) ?? new Set();
            waiting.set(family, nodes.add(node));
        }
    }

    function fontOf(node: LegacyBitmapText): LegacyBitmapFontData | undefined {
        const family = familyOf(node);
        if (!installed(family)) return undefined;

        if (compat.fontName(node) !== family) setFamily(node, family);
        return fonts[family];
    }

    function lineHeightOf(node: LegacyBitmapText): number | undefined {
        const own = lineHeights.get(node);
        const font = fontOf(node);
        if (!font) return undefined;

        return own ? own / (compat.fontSize(node) / font.size) : font.lineHeight;
    }

    /** Pixi adds `letterSpacing` in font units; the contract's, like v8's, is in the node's pixels. */
    function letterSpacingOf(node: LegacyBitmapText, font: LegacyBitmapFontData): number {
        const pixels = letterSpacings.get(node);
        return pixels === undefined
            ? node.letterSpacing
            : (pixels * font.size) / compat.fontSize(node);
    }

    const hasNaN = ({ vertices, total }: LegacyPageMeshData) =>
        vertices.subarray(0, total * 8).some(Number.isNaN);

    /**
     * v6 and v7 justify a wrapped line by its spaces, and one with none by dividing by zero:
     * every glyph on it lands at NaN. Pixi 8 leaves that line as `left`, so its quads are
     * taken from a `left` layout.
     */
    function leftAlignUnspacedLines(node: LegacyBitmapText, updateText: () => void) {
        const pages = node._activePagesMeshData;
        if (node.align !== 'justify' || !pages?.some(hasNaN)) return;

        const justified = pages.map(({ vertices, total }) => vertices.slice(0, total * 8));
        node.align = 'left';
        updateText.call(node);
        node.align = 'justify';
        node.dirty = false;

        node._activePagesMeshData!.forEach(({ vertices }, page) => {
            const quads = justified[page];
            for (let at = 0; at < quads.length; at += 8) {
                if (!Number.isNaN(quads[at])) vertices.set(quads.subarray(at, at + 8), at);
            }
        });
    }

    /**
     * A per-node `lineHeight`, which no legacy BitmapText has, stands in for the font's while
     * the node lays out. v4 to 5.3 lay a node out again only once it is dirty; 6.5+ also once
     * its font is replaced, as a `.fnt` registered anew does, and so does every major here.
     */
    function guardLayout(node: LegacyBitmapText) {
        const { updateText, validate } = node;

        node.updateText = () => {
            const font = fontOf(node);
            laidOutWith.set(node, font);
            if (!font) return updateText.call(node);

            const fontLineHeight = font.lineHeight;
            font.lineHeight = lineHeightOf(node) ?? fontLineHeight;
            node._letterSpacing = letterSpacingOf(node, font);
            try {
                updateText.call(node);
                leftAlignUnspacedLines(node, updateText);
            } finally {
                font.lineHeight = fontLineHeight;
            }
        };

        node.validate = () => {
            if (laidOutWith.get(node) !== fontOf(node)) node.dirty = true;
            validate.call(node);
        };
    }

    function releaseOnDestroy(node: LegacyBitmapText) {
        const destroy = node.destroy;

        node.destroy = (options?: unknown) => {
            stopWaiting(node);
            families.set(node, null);
            destroy.call(node, options);
        };
    }

    function applyBitmapStyle(node: LegacyBitmapText, style: Style) {
        const name = style.fontFamily ?? (isObject(style.font) ? style.font.name : undefined);
        const size = style.fontSize ?? (isObject(style.font) ? style.font.size : undefined);

        if (typeof name === 'string') setFamily(node, name);
        if (typeof size === 'number') compat.setFontSize(node, size);
        if (typeof style.align === 'string')
            node.align = style.align === 'justify' && !compat.bitmapJustify ? 'left' : style.align;
        if (typeof style.letterSpacing === 'number') {
            letterSpacings.set(node, style.letterSpacing);
            node.dirty = true;
        }

        const tint = colorOf(style.tint ?? style.fill);
        if (tint !== undefined) node.tint = tint;

        if (typeof style.maxWidth === 'number') node.maxWidth = style.maxWidth;
        else if (style.wordWrap === false) node.maxWidth = 0;
        else if (style.wordWrap && typeof style.wordWrapWidth === 'number')
            node.maxWidth = style.wordWrapWidth;

        if (typeof style.lineHeight === 'number') {
            if (style.lineHeight > 0) lineHeights.set(node, style.lineHeight);
            else lineHeights.delete(node);
            node.dirty = true;
        }
    }

    function resetBitmapStyle(node: LegacyBitmapText) {
        node.align = 'left';
        node.letterSpacing = 0;
        letterSpacings.delete(node);
        node.tint = 0xffffff;
        node.maxWidth = 0;
        lineHeights.delete(node);
        node.dirty = true;
    }

    function replaceStyle(text: LegacyText | LegacyBitmapText, style: Style) {
        if (isBitmapText(text)) {
            resetBitmapStyle(text);
            applyBitmapStyle(text, style);
        } else {
            text.style = textStyleOf(style);
        }
    }

    /** The laid-out glyphs that draw something: a space has a texture, but no ink. */
    function layoutOf(node: LegacyBitmapText): BitmapLayout | undefined {
        const font = fontOf(node);
        const lineHeight = lineHeightOf(node);
        if (!font || lineHeight === undefined) return undefined;

        const layout = layoutBitmapText(node, font, lineHeight, letterSpacingOf(node, font), {
            size: compat.fontSize(node),
            align: node.align,
            rule: compat.layoutRule,
            roundPixels: node._roundPixels === true,
        });
        layout.glyphs = layout.glyphs.filter(({ char }) => {
            const size = glyphSize(char.texture);
            return size.width > 0 && size.height > 0;
        });

        return layout;
    }

    const byNode = {
        text: { justify: false, maxHeight: true },
        bitmapText: { justify: compat.bitmapJustify, maxHeight: true },
    };

    return {
        capabilities: { justify: false, maxHeight: true, byNode },

        createText: () => new PIXI.Text('', {}),

        createBitmapText() {
            const node = compat.createBitmapText(NO_FONT);
            families.set(node, null);
            guardLayout(node);
            releaseOnDestroy(node);
            return node;
        },

        isBitmapText,

        // an entry's `maxWidth` is the box the core fits the value into, not the wrap width
        applyEntry(text, entry) {
            const style: Style = { ...entry };
            delete style.maxWidth;
            replaceStyle(text, style);
        },

        applyStyle: replaceStyle,

        mergeStyle(text, style) {
            if (isBitmapText(text)) {
                applyBitmapStyle(text, style);
                return;
            }

            const current = (text as LegacyText).style;
            Object.entries(textStyleOf(style)).forEach(([key, value]) => (current[key] = value));
        },

        getStyle(text) {
            if (isBitmapText(text)) {
                const lineHeight = lineHeights.get(text);
                return {
                    fontFamily: familyOf(text),
                    fontSize: compat.fontSize(text),
                    align: text.align,
                    letterSpacing: letterSpacings.get(text) ?? text.letterSpacing,
                    fill: text.tint,
                    wordWrap: text.maxWidth > 0,
                    wordWrapWidth: text.maxWidth,
                    ...(lineHeight && { lineHeight }),
                };
            }

            const current = (text as LegacyText).style;
            const style: Style = {};
            [...TEXT_STYLE_KEYS, 'stroke', 'dropShadow'].forEach(
                (key) => (style[key] = current[key]),
            );
            return style;
        },

        setWordWrapWidth(text, width) {
            const wraps = width !== undefined && width > 0;

            if (isBitmapText(text)) {
                text.maxWidth = wraps ? width : 0;
                return;
            }

            const { style } = text as LegacyText;
            style.wordWrap = wraps;
            if (wraps) style.wordWrapWidth = width;
        },

        measureBitmap(text) {
            const layout = layoutOf(text);
            if (!layout?.glyphs.length) return undefined;

            let top = Infinity;
            let bottom = -Infinity;
            let left = Infinity;
            let right = -Infinity;

            layout.glyphs.forEach(({ char, x, y }) => {
                const size = glyphSize(char.texture);
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x + size.width * layout.scale);
                bottom = Math.max(bottom, y + size.height * layout.scale);
            });

            const ink = {
                height: bottom - top,
                centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
            };
            return [ink.height, ink.centre.x, ink.centre.y].every(Number.isFinite)
                ? ink
                : undefined;
        },

        bitmapLineCount: (text) => new Set(layoutOf(text)?.glyphs.map((glyph) => glyph.line)).size,

        bitmapLineHeight(text) {
            const layout = layoutOf(text);
            if (!layout?.glyphs.length) return undefined;

            let top = Infinity;
            let bottom = -Infinity;

            layout.glyphs.forEach(({ char }) => {
                top = Math.min(top, char.yOffset);
                bottom = Math.max(bottom, char.yOffset + glyphSize(char.texture).height);
            });

            return (bottom - top) * layout.scale;
        },

        hasBitmapFont: installed,

        registerBitmapFont(fnt, pages) {
            const family = compat.installFont(fnt, pages);
            waiting.get(family)?.forEach((node) => setFamily(node, family));
            return family;
        },
    };
}
