import {
    BitmapFont,
    BitmapFontManager,
    BitmapText,
    Cache,
    Text,
    bitmapFontTextParser,
    bitmapFontXMLStringParser,
    type Texture,
} from 'pixi.js';
import type { TextPort } from '../../engine/Engine';
import type { Pixi8Types } from './types';

type AnyText = Text | BitmapText;

const bitmapCacheKey = (family: string) => `${family}-bitmap`;

function applyStyle(text: AnyText, style: Record<string, unknown>) {
    if (text instanceof BitmapText) style.fill = '#ffffff';
    text.style = style as Partial<Text['style']>;
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
function glyphBox(text: BitmapText):
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

export const textPort: TextPort<Pixi8Types> = {
    capabilities: { justify: true, maxHeight: true },

    createText: () => new Text(),
    createBitmapText: () => new BitmapText(),
    isBitmapText: (view): view is BitmapText => view instanceof BitmapText,

    applyEntry(text, entry) {
        const style: Record<string, unknown> = { ...entry };
        delete style.type;
        delete style.value;
        applyStyle(text, style);
    },
    applyStyle,
    mergeStyle(text, style) {
        Object.assign(text.style, style);
    },
    getStyle: (text) => text.style as unknown as Record<string, unknown>,

    setWordWrapWidth(text, width) {
        const wrap = width !== undefined && width > 0;

        text.style.wordWrap = wrap;
        if (wrap) text.style.wordWrapWidth = width;
    },

    measureBitmap(text) {
        const box = glyphBox(text);
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
    },

    // the layout always closes with an empty trailing line, so the lines carrying glyphs
    // are what it has to be counted by
    bitmapLineCount: (text) =>
        BitmapFontManager.getLayout(text.text, text.style).lines.filter(
            (line) => line.charPositions.length > 0,
        ).length,

    bitmapLineHeight(text) {
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
    },

    hasBitmapFont: (family) => Cache.has(bitmapCacheKey(family)),

    registerBitmapFont(fnt, pages) {
        const data = bitmapFontTextParser.test(fnt)
            ? bitmapFontTextParser.parse(fnt)
            : bitmapFontXMLStringParser.test(fnt)
              ? bitmapFontXMLStringParser.parse(fnt)
              : undefined;

        if (!data) throw new Error('Could not parse bitmap font');

        const textures: Texture[] = [];

        for (const page of data.pages) {
            const texture = pages[page.file];
            if (!texture) throw new Error(`Bitmap font texture not found: ${page.file}`);
            textures[page.id] = texture;
        }

        const font = new BitmapFont({ data, textures });

        // a font with no space glyph leaves pixi's fallback for unknown characters undefined too
        if (!font.chars[' ']) {
            (font.chars as Record<string, unknown>)[' '] = {
                id: 32,
                xOffset: 0,
                yOffset: 0,
                xAdvance: Math.round(font.baseMeasurementFontSize * 0.3),
                kerning: {},
            };
        }

        const key = bitmapCacheKey(data.fontFamily);
        if (Cache.has(key)) Cache.remove(key);
        Cache.set(key, font);

        return data.fontFamily;
    },
};
