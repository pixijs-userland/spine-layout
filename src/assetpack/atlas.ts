import { MaxRectsPacker } from 'maxrects-packer';

export type SpineAtlasOptions = {
    maximumTextureSize?: number;
    padding?: number;
    allowTrim?: boolean;
    allowRotation?: boolean;
    powerOfTwo?: boolean;
    alphaThreshold?: number;
};

export const SPINE_ATLAS_DEFAULTS = {
    maximumTextureSize: 2048,
    padding: 2,
    allowTrim: true,
    allowRotation: false,
    powerOfTwo: false,
    alphaThreshold: 0,
} satisfies Required<SpineAtlasOptions>;

export type AtlasRegionSize = {
    name: string;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    trimLeft: number;
    trimTop: number;
    trimmed: boolean;
};

export type PlacedRegion<R extends AtlasRegionSize = AtlasRegionSize> = R & {
    x: number;
    y: number;
    rot: boolean;
};

export type TrimBox = { left: number; top: number; width: number; height: number };

/** The largest region a page holds: the page less the padding kept along each of its edges. */
export function atlasPageRoom(options: SpineAtlasOptions = {}): number {
    const { maximumTextureSize, padding } = { ...SPINE_ATLAS_DEFAULTS, ...options };

    return maximumTextureSize - 2 * padding;
}

export function fitsAtlasPage(
    region: Pick<AtlasRegionSize, 'width' | 'height'>,
    options: SpineAtlasOptions = {},
): boolean {
    const room = atlasPageRoom(options);

    return region.width <= room && region.height <= room;
}

/**
 * Packs the regions into pages the way the build does, so the editor and the game agree on which
 * region shares a page with which. The regions go in sorted by name: `MaxRectsPacker` sorts by
 * size with a stable sort, so equal sizes keep the input order, and the order a folder lists its
 * files in differs between file systems.
 *
 * A region too large for a page gets one of its own, at its own size. `MaxRectsPacker` does that
 * only for regions larger than the page itself; one that fits the page but not inside the padding
 * along its edges it silently drops, and the skeleton then fails to find it in the atlas.
 */
export function layoutAtlas<R extends AtlasRegionSize>(
    regions: R[],
    options: SpineAtlasOptions = {},
): { rects: PlacedRegion<R>[] }[] {
    const opts = { ...SPINE_ATLAS_DEFAULTS, ...options };
    const sorted = [...regions].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const placed = (region: R): PlacedRegion<R> => ({ ...region, x: 0, y: 0, rot: false });
    const packer = new MaxRectsPacker<PlacedRegion<R>>(
        opts.maximumTextureSize,
        opts.maximumTextureSize,
        opts.padding,
        {
            smart: true,
            pot: opts.powerOfTwo,
            border: opts.padding,
            allowRotation: opts.allowRotation,
        },
    );

    // Plain objects, deliberately: `MaxRectsBin.place` assigns `rot` directly, and only a
    // `Rectangle` instance would swap width and height with it.
    packer.addArray(sorted.filter((region) => fitsAtlasPage(region, opts)).map(placed));

    const alone = sorted
        .filter((region) => !fitsAtlasPage(region, opts))
        .map((region) => ({ rects: [placed(region)] }));

    return [...(packer.bins as { rects: PlacedRegion<R>[] }[]), ...alone];
}

export function fitAtlasPage(
    rects: PlacedRegion[],
    powerOfTwo: boolean,
    padding: number,
): { width: number; height: number } {
    let width = 0;
    let height = 0;

    for (const rect of rects) {
        width = Math.max(width, rect.x + (rect.rot ? rect.height : rect.width));
        height = Math.max(height, rect.y + (rect.rot ? rect.width : rect.height));
    }

    width += padding;
    height += padding;

    return powerOfTwo
        ? { width: nearestPowerOfTwo(width), height: nearestPowerOfTwo(height) }
        : { width, height };
}

function nearestPowerOfTwo(value: number): number {
    let power = 1;

    while (power < value) power <<= 1;

    return power;
}

/**
 * The box sharp's `trim({ threshold, background: transparent })` keeps, from RGBA pixels: libvips'
 * `find_trim` — a 3×3 median, then the first rows and columns from each edge with a pixel above
 * `threshold` — run on the alpha band, or on the colour bands of an image without one.
 *
 * sharp also searches the colour bands of an image with alpha, flattened onto black, and keeps the
 * union of both boxes; a flattened band never exceeds alpha, so that box lies inside the alpha one.
 * A median is above `threshold` exactly when 5 of its 9 samples are, which is what is counted.
 *
 * `undefined` when nothing is above `threshold`, where sharp leaves the image as it is.
 */
export function findTrim(
    rgba: ArrayLike<number>,
    width: number,
    height: number,
    hasAlpha: boolean,
    threshold = 0,
): TrimBox | undefined {
    const mask = new Uint8Array(width * height);
    const bands = hasAlpha ? [3] : [0, 1, 2];

    for (const band of bands) markMedianAbove(rgba, width, height, band, threshold, mask);

    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;

    for (let y = 0; y < height; y++) {
        const row = y * width;

        for (let x = 0; x < width; x++) {
            if (!mask[row + x]) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }

    return right < 0 ? undefined : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Whether libvips loads the file with an alpha band, which decides what {@link findTrim} searches:
 * a decoded image always has one in the browser. Read from the header — PNG colour type or a
 * `tRNS` chunk, WebP's alpha flag; a JPEG never has one.
 */
export function imageHasAlpha(bytes: Uint8Array): boolean {
    const ascii = (offset: number, length: number) =>
        String.fromCharCode(...bytes.subarray(offset, offset + length));

    if (bytes[0] === 0xff && bytes[1] === 0xd8) return false;

    if (ascii(1, 3) === 'PNG') {
        const colorType = bytes[25];

        if (colorType === 4 || colorType === 6) return true;

        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        for (let offset = 8; offset + 8 <= bytes.length; ) {
            const type = ascii(offset + 4, 4);

            if (type === 'tRNS') return true;
            if (type === 'IDAT') return false;
            offset += 12 + view.getUint32(offset);
        }

        return false;
    }

    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
        const chunk = ascii(12, 4);

        if (chunk === 'VP8X') return (bytes[20] & 0x10) !== 0;
        if (chunk === 'VP8L') return (bytes[24] & 0x10) !== 0;
        return false;
    }

    return true;
}

/** Sets `mask` where the 3×3 median of `band` is above `threshold`, edges extended by copy. */
function markMedianAbove(
    rgba: ArrayLike<number>,
    width: number,
    height: number,
    band: number,
    threshold: number,
    mask: Uint8Array,
) {
    const rowSums = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        const row = y * width;
        let current = rgba[row * 4 + band] > threshold ? 1 : 0;
        let previous = current;

        for (let x = 0; x < width; x++) {
            const next =
                x + 1 < width ? (rgba[(row + x + 1) * 4 + band] > threshold ? 1 : 0) : current;

            rowSums[row + x] = previous + current + next;
            previous = current;
            current = next;
        }
    }

    for (let y = 0; y < height; y++) {
        const above = Math.max(0, y - 1) * width;
        const row = y * width;
        const below = Math.min(height - 1, y + 1) * width;

        for (let x = 0; x < width; x++) {
            if (rowSums[above + x] + rowSums[row + x] + rowSums[below + x] >= 5) mask[row + x] = 1;
        }
    }
}

/**
 * The preference between two images that would both be a skeleton's region: one in a folder named
 * after the skeleton first, then the one whose path adds the fewest folders to the region name.
 * Lower wins.
 */
export function regionClaimRank(
    skeletonName: string,
    regionPath: string,
    regionName: string,
): [boolean, number] {
    const ownFolder = regionPath.split('/')[0] === skeletonName;
    const depth = regionPath.split('/').length - regionName.split('/').length;

    return [!ownFolder, depth];
}

export function compareRegionClaimRank(a: [boolean, number], b: [boolean, number]): number {
    return a[0] !== b[0] ? Number(a[0]) - Number(b[0]) : a[1] - b[1];
}

/** Names an image as packed: a pack of the same sources is the same pack. */
export const atlasImageSource = (image: {
    path: string;
    file: { size: number; lastModified: number };
    allowTrim: boolean;
}) =>
    `${image.path}|${image.file.size}|${image.file.lastModified}|${image.allowTrim ? 'trim' : 'whole'}`;

/**
 * The atlas text of one page, in the format Spine 3.8 writes: it is the one every runtime reads,
 * 4.x too.
 */
export function serializeLegacyAtlasPage(
    pageName: string,
    width: number,
    height: number,
    rects: PlacedRegion[],
): string {
    const lines = [
        pageName,
        `size: ${width},${height}`,
        'format: RGBA8888',
        'filter: Linear,Linear',
        'repeat: none',
    ];

    for (const rect of rects) {
        const offsetY = rect.trimmed
            ? Math.max(0, rect.originalHeight - rect.trimTop - rect.height)
            : 0;

        lines.push(
            rect.name,
            `  rotate: ${rect.rot ? 'true' : 'false'}`,
            `  xy: ${rect.x}, ${rect.y}`,
            `  size: ${rect.width}, ${rect.height}`,
            `  orig: ${rect.trimmed ? rect.originalWidth : rect.width}, ${rect.trimmed ? rect.originalHeight : rect.height}`,
            `  offset: ${rect.trimmed ? rect.trimLeft : 0}, ${offsetY}`,
            '  index: -1',
        );
    }

    return `${lines.join('\n')}\n`;
}
