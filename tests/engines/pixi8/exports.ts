import { readFileSync } from 'node:fs';
import { Texture, TextureSource } from 'pixi.js';

export type ExportName = 'okButton-4.3' | 'settingsButton-4.2';

interface Named {
    name: string;
    [key: string]: unknown;
}

export interface SkeletonJson {
    skeleton: { spine?: string; [key: string]: unknown };
    bones: Named[];
    slots: Named[];
    skins?: Named[];
    [key: string]: unknown;
}

const fixture = (name: string) => readFileSync(`${import.meta.dirname}/fixtures/${name}`, 'utf8');

/**
 * A button exported by the Spine editor of its version: `okButton` from 4.3.23, `settingsButton`
 * from 4.2.43. Parsed afresh on every call, so a test can add bones and slots to it.
 */
export function spineExport(name: ExportName): { skeleton: SkeletonJson; atlasText: string } {
    return { skeleton: JSON.parse(fixture(`${name}.json`)), atlasText: fixture(`${name}.atlas`) };
}

/** A blank texture for every page the atlas names, the size it gives. */
export function pagesOf(atlasText: string): Record<string, Texture> {
    const pages: Record<string, Texture> = {};
    const lines = atlasText.split(/\r?\n/).map((line) => line.trim());

    lines.forEach((line, i) => {
        if (!/\.png$/.test(line)) return;

        const [, width, height] = lines[i + 1].match(/size:\s*(\d+)\s*,\s*(\d+)/)!;
        pages[line] = new Texture({
            source: new TextureSource({ width: +width, height: +height, resolution: 1 }),
        });
    });

    return pages;
}
