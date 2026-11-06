import type { BitmapLayoutRule } from './compat';
import type {
    LegacyBitmapFontChar,
    LegacyBitmapFontData,
    LegacyBitmapText,
    LegacyFontDocument,
    LegacyTexture,
} from './legacy.types';

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
 * A `.fnt` — AngelCode text or XML — as the document v4–5.2's `BitmapText.registerFont` reads,
 * through `getElementsByTagName` and `getAttribute` alone, so no DOM is needed.
 */
export function fontDocumentOf(fnt: string): LegacyFontDocument {
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

export type GlyphPlacement = { char: LegacyBitmapFontChar; line: number; x: number; y: number };

export type BitmapLayout = {
    glyphs: GlyphPlacement[];
    /** Font size over the font's own: font units to the node's pixels. */
    scale: number;
};

export interface BitmapLayoutOptions {
    size: number;
    align: string;
    rule: BitmapLayoutRule;
    roundPixels: boolean;
}

const WHITESPACE = /(?:\s)/;

/**
 * `BitmapText.updateText` without the sprites or meshes: where each glyph's texture lands in the
 * node, in its pixels, anchor applied. Kept line for line with PIXI 4.8.9's, wrap included; the
 * `rule` adds what 6.x and 7.x changed (line width to the ink, justify, code points, rounding).
 * A justified line with no space to widen stays `left`, as the text port draws it.
 */
export function layoutBitmapText(
    node: LegacyBitmapText,
    data: LegacyBitmapFontData,
    lineHeight: number,
    letterSpacing: number,
    { size, align, rule, roundPixels }: BitmapLayoutOptions,
): BitmapLayout {
    const pen = rule === 'pen';
    const round = rule === 'ink-rounded' ? Math.round : (value: number) => value;
    const scale = size / data.size;
    const text = node.text.replace(/(?:\r\n|\r)/g, '\n');
    const characters = pen ? text.split('') : Array.from(text);
    const maxWidth = (node.maxWidth * data.size) / size;
    const chars: (GlyphPlacement & { spaces: number })[] = [];
    const lineWidths: number[] = [];
    const lineSpaces: number[] = [];
    const pos = { x: 0, y: 0 };

    let prevCharCode: number | null = null;
    let lastLineWidth = 0;
    let maxLineWidth = 0;
    let line = 0;
    let lastBreakPos = -1;
    let lastBreakWidth = 0;
    let spacesRemoved = 0;
    let spaceCount = 0;

    for (let i = 0; i < characters.length; i++) {
        const character = characters[i];
        const charCode = pen ? character.charCodeAt(0) : character.codePointAt(0)!;

        if (WHITESPACE.test(character)) {
            lastBreakPos = i;
            lastBreakWidth = lastLineWidth;
            spaceCount++;
        }

        if (character === '\r' || character === '\n') {
            lineWidths.push(lastLineWidth);
            lineSpaces.push(-1);
            maxLineWidth = Math.max(maxLineWidth, lastLineWidth);
            ++line;
            ++spacesRemoved;
            pos.x = 0;
            pos.y += lineHeight;
            prevCharCode = null;
            spaceCount = 0;
            continue;
        }

        const char = data.chars[charCode];
        if (!char) continue;

        if (prevCharCode && char.kerning[prevCharCode]) pos.x += char.kerning[prevCharCode];

        const x = round(pos.x + char.xOffset + letterSpacing / 2);
        chars.push({ char, line, x, y: round(pos.y + char.yOffset), spaces: spaceCount });
        pos.x += char.xAdvance + letterSpacing;
        lastLineWidth = pen
            ? pos.x
            : x + Math.max(char.xAdvance - char.xOffset, glyphSize(char.texture).width);
        prevCharCode = charCode;

        if (lastBreakPos !== -1 && maxWidth > 0 && pos.x > maxWidth) {
            ++spacesRemoved;
            chars.splice(1 + lastBreakPos - spacesRemoved, 1 + i - lastBreakPos);
            i = lastBreakPos;
            lastBreakPos = -1;
            lineWidths.push(lastBreakWidth);
            lineSpaces.push(chars.length > 0 ? chars[chars.length - 1].spaces : 0);
            maxLineWidth = Math.max(maxLineWidth, lastBreakWidth);
            line++;
            pos.x = 0;
            pos.y += lineHeight;
            prevCharCode = null;
            spaceCount = 0;
        }
    }

    const lastChar = characters[characters.length - 1] ?? '';

    if (lastChar !== '\r' && lastChar !== '\n') {
        if (WHITESPACE.test(lastChar)) lastLineWidth = lastBreakWidth;
        lineWidths.push(lastLineWidth);
        lineSpaces.push(-1);
        maxLineWidth = Math.max(maxLineWidth, lastLineWidth);
    }

    const justify = align === 'justify' && !pen;
    const alignOffset = (index: number) => {
        const width = lineWidths[index] ?? 0;
        if (align === 'right') return maxLineWidth - width;
        if (align === 'center') return (maxLineWidth - width) / 2;
        if (justify) return lineSpaces[index] > 0 ? (maxLineWidth - width) / lineSpaces[index] : 0;
        return 0;
    };

    const textWidth = maxLineWidth * scale;
    const textHeight = (pos.y + lineHeight) * scale;
    const shiftX = textWidth * node.anchor.x;
    const shiftY = textHeight * node.anchor.y;

    return {
        scale,
        glyphs: chars.map(({ char, line: index, x, y, spaces }) => {
            const offset = x + alignOffset(index) * (justify ? spaces : 1);

            return {
                char,
                line: index,
                x: (roundPixels ? Math.round(offset) : offset) * scale - shiftX,
                y: y * scale - shiftY,
            };
        }),
    };
}

export const glyphSize = (texture: LegacyTexture) => texture.orig ?? texture.frame;
