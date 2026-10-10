import type { TextPort } from '../../engine/Engine';
import { fontDocumentOf, glyphSize, layoutBitmapText, type BitmapLayout } from './bitmapFont';
import type { Pixi4BitmapText, Pixi4Namespace, Pixi4Text, Pixi4Types } from './pixi4.types';

type Style = Record<string, unknown>;

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

/** Registered under this name so a bitmap node can exist before its family has loaded. */
const NO_FONT = 'spine-layout:no-font';

const isObject = (value: unknown): value is Style => typeof value === 'object' && value !== null;

function colorOf(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return undefined;

    const hex = /^(?:#|0x)([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
    if (!hex) return undefined;

    return parseInt(hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex, 16);
}

/** `texts.json` (or a v4 style already) → v4 `TextStyle` options; anything else is dropped. */
function textStyleOf(source: Style): Style {
    const style: Style = {};

    TEXT_STYLE_KEYS.forEach((key) => {
        if (source[key] !== undefined) style[key] = source[key];
    });
    if (style.align === 'justify') style.align = 'left';

    const { stroke, dropShadow } = source;

    if (isObject(stroke)) {
        style.stroke = stroke.color;
        style.strokeThickness = stroke.width;
    } else if (stroke !== undefined) style.stroke = stroke;

    if (isObject(dropShadow)) {
        style.dropShadow = true;
        style.dropShadowColor = dropShadow.color;
        style.dropShadowAlpha = dropShadow.alpha;
        style.dropShadowBlur = dropShadow.blur;
        style.dropShadowAngle = dropShadow.angle;
        style.dropShadowDistance = dropShadow.distance;
    } else if (dropShadow !== undefined) style.dropShadow = dropShadow;

    return style;
}

export function createTextPort(PIXI: Pixi4Namespace): TextPort<Pixi4Types> {
    const { BitmapText } = PIXI.extras;
    const lineHeights = new WeakMap<Pixi4BitmapText, number>();

    BitmapText.fonts[NO_FONT] ??= { font: NO_FONT, size: 1, lineHeight: 0, chars: {} };

    const isBitmapText = (view: unknown): view is Pixi4BitmapText => view instanceof BitmapText;

    const fontOf = (node: Pixi4BitmapText) => BitmapText.fonts[node.font.name ?? ''];

    function lineHeightOf(node: Pixi4BitmapText): number | undefined {
        const own = lineHeights.get(node);
        const font = fontOf(node);
        if (!font) return undefined;

        return own ? own / (node.font.size / font.size) : font.lineHeight;
    }

    /**
     * v4 lays a node out the moment it is built and whenever it is drawn, and throws on a family
     * it has no `.fnt` for. Until the family loads the node lays out as nothing; a per-node
     * `lineHeight`, which v4 has no style for, stands in for the font's while it lays out.
     */
    function guardLayout(node: Pixi4BitmapText) {
        const updateText = node.updateText;

        node.updateText = () => {
            const name = node.font.name;
            const font = fontOf(node);

            if (!font) {
                node.font.name = NO_FONT;
                try {
                    updateText.call(node);
                } finally {
                    node.font.name = name;
                }
                return;
            }

            const fontLineHeight = font.lineHeight;
            font.lineHeight = lineHeightOf(node) ?? fontLineHeight;
            try {
                updateText.call(node);
            } finally {
                font.lineHeight = fontLineHeight;
            }
        };
    }

    function applyBitmapStyle(node: Pixi4BitmapText, style: Style) {
        const name = style.fontFamily ?? (isObject(style.font) ? style.font.name : undefined);
        const size = style.fontSize ?? (isObject(style.font) ? style.font.size : undefined);

        if (typeof name === 'string' || typeof size === 'number') {
            node.font = {
                ...node.font,
                name: typeof name === 'string' ? name : node.font.name,
                size: typeof size === 'number' ? size : node.font.size,
            };
        }
        if (typeof style.align === 'string')
            node.align = style.align === 'justify' ? 'left' : style.align;
        if (typeof style.letterSpacing === 'number') node.letterSpacing = style.letterSpacing;

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

    function resetBitmapStyle(node: Pixi4BitmapText) {
        node.align = 'left';
        node.letterSpacing = 0;
        node.tint = 0xffffff;
        node.maxWidth = 0;
        lineHeights.delete(node);
        node.dirty = true;
    }

    /** The laid-out glyphs that draw something: a space has a texture, but no ink. */
    function replaceStyle(text: Pixi4Text | Pixi4BitmapText, style: Style) {
        if (isBitmapText(text)) {
            resetBitmapStyle(text);
            applyBitmapStyle(text, style);
        } else {
            text.style = textStyleOf(style);
        }
    }

    function layoutOf(node: Pixi4BitmapText): BitmapLayout | undefined {
        const font = fontOf(node);
        const lineHeight = lineHeightOf(node);
        if (!font || lineHeight === undefined) return undefined;

        const layout = layoutBitmapText(node, font, lineHeight);
        layout.glyphs = layout.glyphs.filter(({ char }) => {
            const size = glyphSize(char.texture);
            return size.width > 0 && size.height > 0;
        });

        return layout;
    }

    return {
        capabilities: { justify: false, maxHeight: true },

        createText: () => new PIXI.Text('', {}),

        createBitmapText() {
            const node = new BitmapText('', { font: { name: NO_FONT, size: 1 } });
            node.font = { ...node.font, name: null };
            guardLayout(node);
            return node;
        },

        isBitmapText,

        // an entry's `maxWidth` is the box the core fits the value into, not v4's wrap width
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

            const current = (text as Pixi4Text).style;
            Object.entries(textStyleOf(style)).forEach(([key, value]) => (current[key] = value));
        },

        getStyle(text) {
            if (isBitmapText(text)) {
                const lineHeight = lineHeights.get(text);
                return {
                    fontFamily: text.font.name,
                    fontSize: text.font.size,
                    align: text.align,
                    letterSpacing: text.letterSpacing,
                    fill: text.tint,
                    wordWrap: text.maxWidth > 0,
                    wordWrapWidth: text.maxWidth,
                    ...(lineHeight && { lineHeight }),
                };
            }

            const current = (text as Pixi4Text).style;
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

            const { style } = text as Pixi4Text;
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

            return {
                height: bottom - top,
                centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
            };
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

        hasBitmapFont: (family) => family !== NO_FONT && BitmapText.fonts[family] !== undefined,

        registerBitmapFont: (fnt, pages) =>
            BitmapText.registerFont(fontDocumentOf(fnt), pages).font,
    };
}
