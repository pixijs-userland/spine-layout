import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { findTrim, imageHasAlpha } from '../../src/assetpack/atlas.js';

type Box = { left: number; top: number; width: number; height: number };

async function trimmedBySharp(image: Buffer): Promise<Box> {
    const { data, info } = await sharp(image)
        .trim({ threshold: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer({ resolveWithObject: true });

    expect(data.length).toBeGreaterThan(0);

    return {
        left: -(info.trimOffsetLeft ?? 0) || 0,
        top: -(info.trimOffsetTop ?? 0) || 0,
        width: info.width,
        height: info.height,
    };
}

async function trimmedByFindTrim(image: Buffer): Promise<Box> {
    const { data, info } = await sharp(image)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const box = findTrim(data, info.width, info.height, imageHasAlpha(new Uint8Array(image)));

    return box ?? { left: 0, top: 0, width: info.width, height: info.height };
}

function random(seed: number) {
    return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

async function noise(next: () => number, channels: 3 | 4): Promise<Buffer> {
    const width = 3 + Math.floor(next() * 40);
    const height = 3 + Math.floor(next() * 40);
    const pixels = Buffer.alloc(width * height * channels);
    const density = next() * 0.3;

    for (let pixel = 0; pixel < width * height; pixel++) {
        if (next() >= density) continue;
        for (let c = 0; c < channels; c++) pixels[pixel * channels + c] = Math.floor(next() * 256);
    }

    if (next() < 0.5) {
        const left = Math.floor(next() * width);
        const top = Math.floor(next() * height);

        for (let y = top; y < Math.min(height, top + 5); y++) {
            for (let x = left; x < Math.min(width, left + 6); x++) {
                pixels.fill(200, (y * width + x) * channels, (y * width + x + 1) * channels);
            }
        }
    }

    return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

describe('findTrim', () => {
    it('keeps the box sharp trims to, on images with alpha', async () => {
        const next = random(1);

        for (let i = 0; i < 200; i++) {
            const image = await noise(next, 4);
            expect(await trimmedByFindTrim(image)).toEqual(await trimmedBySharp(image));
        }
    });

    it('keeps the box sharp trims to, on images without alpha', async () => {
        const next = random(2);

        for (let i = 0; i < 100; i++) {
            const image = await noise(next, 3);
            expect(await trimmedByFindTrim(image)).toEqual(await trimmedBySharp(image));
        }
    });

    it('trims the black border of a JPEG', async () => {
        const white = await sharp({
            create: { width: 6, height: 4, channels: 3, background: { r: 250, g: 250, b: 250 } },
        })
            .png()
            .toBuffer();
        const image = await sharp({
            create: { width: 20, height: 12, channels: 3, background: { r: 0, g: 0, b: 0 } },
        })
            .composite([{ input: white, left: 7, top: 3 }])
            .jpeg({ quality: 100 })
            .toBuffer();

        expect(imageHasAlpha(new Uint8Array(image))).toBe(false);
        expect(await trimmedByFindTrim(image)).toEqual(await trimmedBySharp(image));
    });

    it('reads alpha from a palette PNG with a tRNS chunk', async () => {
        const image = await sharp({
            create: {
                width: 8,
                height: 8,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        })
            .png({ palette: true })
            .toBuffer();

        expect(imageHasAlpha(new Uint8Array(image))).toBe((await sharp(image).metadata()).hasAlpha);
    });
});
