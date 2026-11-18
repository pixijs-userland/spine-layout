import {
    type Asset,
    type AssetPipe,
    BuildReporter,
    createNewAssetAt,
    findAssets,
    path,
    stripTags,
} from '@assetpack/core';
import { compareRegionClaimRank, regionClaimRank } from './atlas.js';
import { collectSkeletonRegions, matchRegionName, pickImageFolderName } from './regions.js';
import { packSpineAtlas, type SpineAtlasOptions, type SpineAtlasScale } from './packSpineAtlas.js';

export const SPINE_PACKER_NAME = 'spine-packer';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const PROJECT_EXTENSION = '.spine';

/**
 * The rungs a skeleton is packed at, named as `mipmap` and `texturePacker` name theirs so a game
 * configures all three the same way. `fixedResolution` is the one a skeleton tagged `{fix}` keeps
 * on its own — art that a smaller rung would visibly cost, which for a slot is the symbols and the
 * logo rather than the painted background behind them.
 */
export type SpinePackerResolutionOptions = {
    resolutions?: Record<string, number>;
    fixedResolution?: string;
    template?: string;
};

export type SpinePackerOptions = {
    spineAtlas?: SpineAtlasOptions;
    resolutionOptions?: SpinePackerResolutionOptions;
};

const RESOLUTION_DEFAULTS: Required<SpinePackerResolutionOptions> = {
    resolutions: { default: 1 },
    fixedResolution: 'default',
    template: '@%%x',
};

export function spinePacker(options: SpinePackerOptions = {}): AssetPipe<SpinePackerOptions> {
    let imageFolders = new Map<string, Asset | undefined>();

    function findImageFolder(asset: Asset): Asset | undefined {
        if (imageFolders.has(asset.path)) return imageFolders.get(asset.path);

        const folder = resolveImageFolder(asset);

        imageFolders.set(asset.path, folder);

        return folder;
    }

    function claimants(folder: Asset): Asset[] {
        return (folder.parent?.children ?? []).filter(
            (sibling) => isSkeletonFile(sibling) && findImageFolder(sibling) === folder,
        );
    }

    function owningSkeletons(asset: Asset): Asset[] {
        if (!IMAGE_EXTENSIONS.includes(asset.extension.toLowerCase())) return [];

        for (let folder = asset.parent; folder; folder = folder.parent) {
            const owners = claimants(folder);

            if (owners.length > 0) return owners;
        }

        return [];
    }

    function isSpineSourceImage(asset: Asset): boolean {
        return owningSkeletons(asset).length > 0;
    }

    return {
        name: SPINE_PACKER_NAME,
        folder: false,
        defaultOptions: {
            spineAtlas: {},
            ...options,
        },

        tags: {
            fix: 'fix',
        },

        async start(rootAsset) {
            imageFolders = new Map();

            const changedImages = findAssets(
                (asset) => !asset.isFolder && asset.state !== 'normal' && isSpineSourceImage(asset),
                rootAsset,
                false,
            );

            for (const image of changedImages) {
                for (const skeleton of owningSkeletons(image)) {
                    if (skeleton.state === 'normal') skeleton.state = 'modified';
                }
            }
        },

        test(asset) {
            if (asset.isFolder) return false;
            if (asset.extension.toLowerCase() === PROJECT_EXTENSION) return true;
            if (isSpineSourceImage(asset)) return true;

            return isSkeletonFile(asset) && findImageFolder(asset) !== undefined;
        },

        async transform(asset, transformOptions) {
            if (asset.extension.toLowerCase() === PROJECT_EXTENSION) return [];
            if (isSpineSourceImage(asset)) return [];

            const imageFolder = findImageFolder(asset)!;
            const name = stripTags(path.trimExt(asset.filename));

            let skeleton: unknown;

            try {
                skeleton = JSON.parse(asset.buffer.toString());
            } catch {
                return [asset];
            }

            const regions = collectSkeletonRegions(skeleton);

            if (!regions.isSkeleton) return [asset];

            // One skeleton for the lot: what a rung changes is how many texels a region is stored
            // in, and Spine reads a region's drawn size off the attachment and its texel size off
            // the atlas. So the atlas carries the resolution and the skeleton stays as exported.
            const skeletonAsset = createNewAssetAt(asset, `${name}.json`);
            skeletonAsset.buffer = asset.buffer;

            // A skeleton that attaches no image gets no atlas and no page, at any rung. Spine
            // exports one as the JSON alone — bones, slots and animations, which is what a
            // skeleton used to place and drive other spines is made of — and the runtime reads it
            // with an empty atlas. An atlas naming a page of nothing would be a file per rung
            // that every device fetches and nothing ever samples.
            if (regions.names.size === 0) {
                BuildReporter.log(`[spine-packer] ${name}: no images attached, skeleton only`);

                return [skeletonAsset];
            }

            const inputs: { name: string; contents: Buffer; allowTrim?: boolean }[] = [];
            const claimedBy = new Map<string, { sourcePath: string; rank: [boolean, number] }>();
            const otherSkeletons = new Set(
                claimants(imageFolder)
                    .map((sibling) => stripTags(path.trimExt(sibling.filename)))
                    .filter((sibling) => sibling !== name),
            );

            // By path, so two images of one rank resolve the same way on every file system and
            // in the editor.
            const images = collectImages(imageFolder).sort((a, b) =>
                a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
            );

            for (const image of images) {
                const regionName = matchRegionName(image.regionPath, regions.names, otherSkeletons);

                if (!regionName) continue;

                // Two things can make one image the right one over another that also matches:
                // sitting in a folder named after this very skeleton — the same convention that
                // gives `hero/` and `heroBlue/` their own art out of a folder both share — beats
                // one that does not, and among two either-way, fewer folders guessed away (a
                // shorter walk to the region's own name) beats a longer one. Lower ranks first.
                const rank = regionClaimRank(name, image.regionPath, regionName);
                const claim = claimedBy.get(regionName);
                const comparison = claim && compareRegionClaimRank(claim.rank, rank);

                if (claim !== undefined && comparison! <= 0) {
                    if (comparison === 0) {
                        // Same rank, same region: there is no way in to prefer, so packing both
                        // would put two blocks of one name in the atlas and only ever draw one.
                        // Keep the first and say which was dropped — reported through `error` so
                        // a `strict` build stops on it.
                        BuildReporter.error(
                            `[spine-packer] "${name}" region "${regionName}" is claimed by two images in ${stripTags(imageFolder.filename)}/: ${claim.sourcePath} and ${image.sourcePath}. Packing ${claim.sourcePath}, ignoring ${image.sourcePath} — rename or remove one.`,
                        );
                    } else {
                        // Different rank: the tie-break above picked a winner, but two images
                        // genuinely answered to the same region — an image meant for a different
                        // skeleton was still a legal candidate here. That is only quiet by rank,
                        // not by design, so it is worth a build a maintainer actually reads.
                        BuildReporter.warn(
                            `[spine-packer] "${name}" region "${regionName}" also matches ${image.sourcePath} in ${stripTags(imageFolder.filename)}/; packing ${claim.sourcePath} instead. If that is not deliberate, rename one.`,
                        );
                    }

                    continue;
                }

                if (claim !== undefined) {
                    BuildReporter.warn(
                        `[spine-packer] "${name}" region "${regionName}" also matches ${claim.sourcePath} in ${stripTags(imageFolder.filename)}/; packing ${image.sourcePath} instead. If that is not deliberate, rename one.`,
                    );

                    inputs.splice(
                        inputs.findIndex((input) => input.name === regionName),
                        1,
                    );
                }

                claimedBy.set(regionName, { sourcePath: image.sourcePath, rank });
                inputs.push({
                    name: regionName,
                    contents: image.asset.buffer,
                    ...(regions.meshNames.has(regionName) ? { allowTrim: false } : {}),
                });
            }

            const missing = [...regions.names].filter((region) => !claimedBy.has(region));

            if (missing.length > 0) {
                BuildReporter.warn(
                    `[spine-packer] "${name}" references regions with no image in ${stripTags(imageFolder.filename)}/: ${missing.join(', ')}`,
                );
            }

            const scales = resolutionScales(
                transformOptions.resolutionOptions,
                asset.allMetaData[this.tags!.fix],
            );

            const packs = await packSpineAtlas(name, inputs, transformOptions.spineAtlas, scales);

            if (packs[0].pages.length > 1) {
                BuildReporter.warn(
                    `[spine-packer] "${name}" did not fit on one page (${packs[0].pages.length} pages). Raise spineAtlas.maximumTextureSize or split the skeleton.`,
                );
            }

            const generated = packs.flatMap(({ atlasText, pages }, index) => {
                const atlasAsset = createNewAssetAt(asset, `${name}${scales[index].suffix}.atlas`);
                atlasAsset.buffer = Buffer.from(atlasText);

                return [
                    atlasAsset,
                    ...pages.map((page) => {
                        const pageAsset = createNewAssetAt(asset, page.name);

                        pageAsset.buffer = page.buffer;
                        // The page is already at its final size; mipmap must not scale it again.
                        pageAsset.metaData.nomip = true;

                        return pageAsset;
                    }),
                ];
            });

            BuildReporter.log(
                `[spine-packer] ${name}: packed ${inputs.length} images into ${name}.atlas` +
                    (scales.length > 1
                        ? ` at ${scales.map(({ scale }) => `${scale}x`).join(', ')}`
                        : ''),
            );

            return [skeletonAsset, ...generated];
        },
    };
}

function resolutionScales(
    options: SpinePackerResolutionOptions | undefined,
    fixed: unknown,
): SpineAtlasScale[] {
    const { resolutions, fixedResolution, template } = { ...RESOLUTION_DEFAULTS, ...options };
    const wanted = fixed ? [resolutions[fixedResolution] ?? 1] : Object.values(resolutions);
    const largest = Math.max(...wanted);

    return wanted
        .sort((a, b) => b - a)
        .map((resolution) => ({
            scale: resolution / largest,
            // `1` keeps the bare name, matching what Pixi's resolver reads as resolution 1 when a
            // filename carries no `@Nx` at all.
            suffix: resolution === 1 ? '' : template.replace('%%', String(resolution)),
        }));
}

function isSkeletonFile(asset: Asset): boolean {
    if (asset.isFolder || asset.extension.toLowerCase() !== '.json') return false;

    const name = stripTags(path.trimExt(asset.filename)).toLowerCase();

    return !(
        asset.parent?.children.some(
            (sibling) =>
                !sibling.isFolder && stripTags(sibling.filename).toLowerCase() === `${name}.atlas`,
        ) ?? false
    );
}

/** Negative when `a` beats `b`, zero when tied, positive when `b` beats `a`. */
function resolveImageFolder(asset: Asset): Asset | undefined {
    const folders = (asset.parent?.children ?? []).filter(
        (child) => child.isFolder && hasImages(child),
    );
    const name = stripTags(path.trimExt(asset.filename));
    const picked = pickImageFolderName(
        name,
        folders.map((folder) => stripTags(folder.filename)),
        (asset.parent?.children ?? [])
            .filter(isSkeletonFile)
            .map((sibling) => stripTags(path.trimExt(sibling.filename))),
    );

    return folders.find((folder) => stripTags(folder.filename) === picked);
}

function hasImages(folder: Asset): boolean {
    return folder.children.some((child) =>
        child.isFolder
            ? hasImages(child)
            : IMAGE_EXTENSIONS.includes(child.extension.toLowerCase()),
    );
}

function collectImages(
    folder: Asset,
    prefix = '',
): { asset: Asset; regionPath: string; sourcePath: string }[] {
    const images: { asset: Asset; regionPath: string; sourcePath: string }[] = [];

    for (const child of folder.children) {
        const name = stripTags(child.filename);

        if (child.isFolder) {
            images.push(...collectImages(child, prefix ? `${prefix}/${name}` : name));
        } else if (IMAGE_EXTENSIONS.includes(child.extension.toLowerCase())) {
            const stem = path.trimExt(name);

            images.push({
                asset: child,
                regionPath: prefix ? `${prefix}/${stem}` : stem,
                sourcePath: prefix ? `${prefix}/${name}` : name,
            });
        }
    }

    return images;
}
