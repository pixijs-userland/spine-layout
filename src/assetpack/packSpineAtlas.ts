import sharp from 'sharp';
import {
    fitAtlasPage,
    layoutAtlas,
    SPINE_ATLAS_DEFAULTS,
    type AtlasRegionSize,
    type PlacedRegion,
    type SpineAtlasOptions,
} from './atlas.js';

export type { SpineAtlasOptions };

export type SpineRegionInput = {
    name: string;
    contents: Buffer;
    allowTrim?: boolean;
};

export type SpineAtlasPage = {
    name: string;
    buffer: Buffer;
};

export type SpineAtlasPack = {
    scale: number;
    atlasText: string;
    pages: SpineAtlasPage[];
};

/**
 * One rung of the resolution ladder: `scale` shrinks every region, `suffix` goes into the page and
 * atlas filenames so Pixi's resolver can tell the rungs apart (`@0.7x`).
 */
export type SpineAtlasScale = {
    scale: number;
    suffix: string;
};

const FULL_SCALE: SpineAtlasScale[] = [{ scale: 1, suffix: '' }];

type PreparedRegion = AtlasRegionSize & { buffer: Buffer };

/**
 * **Every rung is the same packing, shrunk.** The regions are trimmed and packed once, at full
 * size, and each smaller rung reuses that layout with every coordinate multiplied through — so a
 * skeleton has the same number of pages under the same names at every resolution, whatever the
 * packer decided. That matters twice over: the Pixi manifest pairs the rungs up by filename, and
 * `ManifestParser` looks a spine's page up as `<name>.png`, so a rung that packed into four pages
 * where another took five would leave an entry with nothing to pair with and a page fetched by a
 * mobile that never draws it.
 *
 * The regions are resized individually rather than by shrinking the finished page: a page's regions
 * sit `padding` apart, which is nothing next to a resampling kernel, so downscaling the sheet drags
 * each sprite's neighbours in over its edges.
 */
export async function packSpineAtlas(
    name: string,
    regions: SpineRegionInput[],
    options: SpineAtlasOptions = {},
    scales: SpineAtlasScale[] = FULL_SCALE,
): Promise<SpineAtlasPack[]> {
    const opts = { ...SPINE_ATLAS_DEFAULTS, ...options };
    const prepared = await Promise.all(regions.map((region) => prepareRegion(region, opts)));

    const bins = layoutAtlas(prepared, opts);

    // No regions packs to no pages and no atlas text, rather than to a page of nothing: a skeleton
    // that attaches no image has nothing for an atlas to describe. See `spinePacker`.
    return Promise.all(scales.map((scale) => packAtScale(name, bins, opts, scale)));
}

async function packAtScale(
    name: string,
    bins: { rects: PackedRect[] }[],
    opts: Required<SpineAtlasOptions>,
    { scale, suffix }: SpineAtlasScale,
): Promise<SpineAtlasPack> {
    const padding = Math.max(1, Math.round(opts.padding * scale));
    const pages: SpineAtlasPage[] = [];
    const blocks: string[] = [];

    for (let index = 0; index < bins.length; index++) {
        const pageName = `${name}${suffix}${index === 0 ? '' : `-${index}`}.png`;
        const rects = await Promise.all(bins[index].rects.map((rect) => scaleRect(rect, scale)));
        const { width, height } = fitAtlasPage(rects, opts.powerOfTwo, padding);

        pages.push({ name: pageName, buffer: await composePage(rects, width, height) });
        blocks.push(serializePage(pageName, width, height, rects));
    }

    return { scale, atlasText: blocks.join('\n'), pages };
}

async function scaleRect(rect: PackedRect, scale: number): Promise<PackedRect> {
    if (scale === 1) return rect;

    const width = shrink(rect.width, scale);
    const height = shrink(rect.height, scale);

    return {
        ...rect,
        // libvips premultiplies around a resize, so a sprite's transparent edge does not bleed a
        // halo of its own colour into the pixels the downscale invents.
        buffer: await sharp(rect.buffer)
            .resize(width, height, { kernel: 'lanczos3' })
            .png()
            .toBuffer(),
        width,
        height,
        x: Math.round(rect.x * scale),
        y: Math.round(rect.y * scale),
        originalWidth: shrink(rect.originalWidth, scale),
        originalHeight: shrink(rect.originalHeight, scale),
        trimLeft: Math.round(rect.trimLeft * scale),
        trimTop: Math.round(rect.trimTop * scale),
    };
}

function shrink(value: number, scale: number): number {
    return Math.max(1, Math.round(value * scale));
}

async function prepareRegion(
    region: SpineRegionInput,
    opts: Required<SpineAtlasOptions>,
): Promise<PreparedRegion> {
    const image = sharp(region.contents);
    const { width: originalWidth, height: originalHeight } = await image.metadata();

    if (!originalWidth || !originalHeight) {
        throw new Error(`[spine-packer] Could not read image size for region "${region.name}"`);
    }

    const base = {
        name: region.name,
        originalWidth,
        originalHeight,
        trimLeft: 0,
        trimTop: 0,
    };

    // sharp cannot trim a 1–2px image down to anything useful, and a fully transparent image
    if (!(region.allowTrim ?? opts.allowTrim) || originalWidth < 3 || originalHeight < 3) {
        return {
            ...base,
            buffer: await image.png().toBuffer(),
            width: originalWidth,
            height: originalHeight,
            trimmed: false,
        };
    }

    const { data, info } = await image
        .trim({ threshold: opts.alphaThreshold, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer({ resolveWithObject: true });

    return {
        ...base,
        buffer: data,
        width: info.width,
        height: info.height,
        trimLeft: -(info.trimOffsetLeft ?? 0),
        trimTop: -(info.trimOffsetTop ?? 0),
        trimmed: info.width !== originalWidth || info.height !== originalHeight,
    };
}

type PackedRect = PlacedRegion<PreparedRegion>;

async function composePage(rects: PackedRect[], width: number, height: number): Promise<Buffer> {
    const composite = await Promise.all(
        rects.map(async (rect) => ({
            input: rect.rot ? await sharp(rect.buffer).rotate(-90).png().toBuffer() : rect.buffer,
            left: rect.x,
            top: rect.y,
        })),
    );

    return sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .composite(composite)
        .png()
        .toBuffer();
}

function serializePage(
    pageName: string,
    width: number,
    height: number,
    rects: PackedRect[],
): string {
    const lines = [pageName, `size:${width},${height}`, 'filter:Linear,Linear'];

    // Region names are read as raw lines, so a colon would be parsed as a field and silently
    for (const rect of rects) {
        if (rect.name.includes(':')) {
            throw new Error(
                `[spine-packer] Region name "${rect.name}" contains ':', which a Spine atlas cannot represent. Rename the image.`,
            );
        }

        lines.push(rect.name, `bounds:${rect.x},${rect.y},${rect.width},${rect.height}`);

        if (rect.trimmed) {
            const offsetY = Math.max(0, rect.originalHeight - rect.trimTop - rect.height);

            lines.push(
                `offsets:${rect.trimLeft},${offsetY},${rect.originalWidth},${rect.originalHeight}`,
            );
        }

        if (rect.rot) lines.push('rotate:90');
    }

    return `${lines.join('\n')}\n`;
}
