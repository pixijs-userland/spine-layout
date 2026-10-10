import type {
    Pixi4BitmapFontChar,
    Pixi4BitmapFontData,
    Pixi4BitmapText,
    Pixi4FontDocument,
    Pixi4Texture,
} from './pixi4.types';

type FntElement = { tag: string; attributes: Record<string, string> };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (value: string) =>
    value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name]);

function attributesOf(source: string, pattern: RegExp): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const [, name, quoted, bare] of source.matchAll(pattern))
        attributes[name] = quoted ?? bare ?? '';
    return attributes;
}

function parseFnt(fnt: string): FntElement[] {
    if (fnt.trimStart().startsWith('<')) {
        return [...fnt.matchAll(/<(\w+)((?:\s+[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g)].map(
            ([, tag, body]) => ({
                tag,
                attributes: Object.fromEntries(
                    Object.entries(
                        attributesOf(body, /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g),
                    ).map(([key, value]) => [key, decode(value)]),
                ),
            }),
        );
    }

    return fnt.split(/\r?\n/).flatMap((line) => {
        const match = /^\s*(\w+)(.*)$/.exec(line);
        return match
            ? [
                  {
                      tag: match[1],
                      attributes: attributesOf(match[2], /([\w-]+)=(?:"([^"]*)"|(\S*))/g),
                  },
              ]
            : [];
    });
}

/**
 * A `.fnt` — AngelCode text or XML — as the document `BitmapText.registerFont` reads. v4 only
 * reads XML, and only through `getElementsByTagName` and `getAttribute`, so no DOM is needed.
 */
export function fontDocumentOf(fnt: string): Pixi4FontDocument {
    const elements = parseFnt(fnt);

    return {
        getElementsByTagName: (name) =>
            elements
                .filter((element) => element.tag === name)
                .map(({ attributes }) => ({
                    getAttribute: (key: string) => attributes[key] ?? null,
                })),
    };
}

export type GlyphPlacement = { char: Pixi4BitmapFontChar; line: number; x: number; y: number };

export type BitmapLayout = {
    glyphs: GlyphPlacement[];
    /** Font size over the font's own: font units to the node's pixels. */
    scale: number;
};

const WHITESPACE = /(?:\s)/;

/**
 * `BitmapText.updateText` of PIXI 4.8.9 without the sprites: where each glyph's texture lands in
 * the node, in its pixels, anchor applied. Kept line for line with the original, wrap included.
 */
export function layoutBitmapText(
    node: Pixi4BitmapText,
    data: Pixi4BitmapFontData,
    lineHeight: number,
    letterSpacing: number,
): BitmapLayout {
    const scale = node.font.size / data.size;
    const text = node.text.replace(/(?:\r\n|\r)/g, '\n');
    const maxWidth = (node.maxWidth * data.size) / node.font.size;
    const chars: { char: Pixi4BitmapFontChar; line: number; x: number; y: number }[] = [];
    const lineWidths: number[] = [];
    const pos = { x: 0, y: 0 };

    let prevCharCode: number | null = null;
    let lastLineWidth = 0;
    let maxLineWidth = 0;
    let line = 0;
    let lastBreakPos = -1;
    let lastBreakWidth = 0;
    let spacesRemoved = 0;

    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const character = text.charAt(i);

        if (WHITESPACE.test(character)) {
            lastBreakPos = i;
            lastBreakWidth = lastLineWidth;
        }

        if (character === '\r' || character === '\n') {
            lineWidths.push(lastLineWidth);
            maxLineWidth = Math.max(maxLineWidth, lastLineWidth);
            ++line;
            ++spacesRemoved;
            pos.x = 0;
            pos.y += lineHeight;
            prevCharCode = null;
            continue;
        }

        const char = data.chars[charCode];
        if (!char) continue;

        if (prevCharCode && char.kerning[prevCharCode]) pos.x += char.kerning[prevCharCode];

        chars.push({
            char,
            line,
            x: pos.x + char.xOffset + letterSpacing / 2,
            y: pos.y + char.yOffset,
        });
        pos.x += char.xAdvance + letterSpacing;
        lastLineWidth = pos.x;
        prevCharCode = charCode;

        if (lastBreakPos !== -1 && maxWidth > 0 && pos.x > maxWidth) {
            ++spacesRemoved;
            chars.splice(1 + lastBreakPos - spacesRemoved, 1 + i - lastBreakPos);
            i = lastBreakPos;
            lastBreakPos = -1;
            lineWidths.push(lastBreakWidth);
            maxLineWidth = Math.max(maxLineWidth, lastBreakWidth);
            line++;
            pos.x = 0;
            pos.y += lineHeight;
            prevCharCode = null;
        }
    }

    const lastChar = text.charAt(text.length - 1);

    if (lastChar !== '\r' && lastChar !== '\n') {
        if (WHITESPACE.test(lastChar)) lastLineWidth = lastBreakWidth;
        lineWidths.push(lastLineWidth);
        maxLineWidth = Math.max(maxLineWidth, lastLineWidth);
    }

    const align = node.font.align ?? node.align;
    const alignOffset = (width: number) => {
        if (align === 'right') return maxLineWidth - width;
        if (align === 'center') return (maxLineWidth - width) / 2;
        return 0;
    };

    const textWidth = maxLineWidth * scale;
    const textHeight = (pos.y + lineHeight) * scale;
    const shiftX = textWidth * node.anchor.x;
    const shiftY = textHeight * node.anchor.y;

    return {
        scale,
        glyphs: chars.map(({ char, line: index, x, y }) => ({
            char,
            line: index,
            x: (x + alignOffset(lineWidths[index] ?? 0)) * scale - shiftX,
            y: y * scale - shiftY,
        })),
    };
}

export const glyphSize = (texture: Pixi4Texture) => texture.orig ?? texture.frame;
