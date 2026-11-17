export const SPINE_IMAGE_FOLDER_NAMES = ['img', 'images', 'pictures'];

export type SkeletonRegions = {
    isSkeleton: boolean;
    names: Set<string>;
    /**
     * Subset of {@link names} reached by a mesh, which must be packed **untrimmed**.
     *
     * A region attachment maps the packed rectangle onto a correspondingly shrunk quad, so
     * stripping an image's transparent border is invisible. A mesh does not: `MeshAttachment`
     * lays its UVs over the region's *original* rectangle (`u -= offsetX / pageWidth`,
     * `width = originalWidth / pageWidth`), so the stripped margin still gets sampled — and on a
     * packed page that margin is whatever region was placed next door.
     */
    meshNames: Set<string>;
};

const IMAGE_ATTACHMENT_TYPES = ['region', 'mesh', 'linkedmesh'];

const MESH_ATTACHMENT_TYPES = ['mesh', 'linkedmesh'];

export function collectSkeletonRegions(skeleton: unknown): SkeletonRegions {
    const { bones, skins } = (skeleton ?? {}) as { bones?: unknown; skins?: unknown };
    const skinAttachments: unknown[] = Array.isArray(skins)
        ? skins.map((skin) => (skin as { attachments?: unknown }).attachments)
        : Object.values((skins ?? {}) as Record<string, unknown>);

    const names = new Set<string>();
    const meshNames = new Set<string>();

    for (const slots of skinAttachments) {
        if (!slots || typeof slots !== 'object') continue;

        for (const attachments of Object.values(slots as Record<string, unknown>)) {
            if (!attachments || typeof attachments !== 'object') continue;

            for (const [key, value] of Object.entries(attachments as Record<string, unknown>)) {
                const attachment = (value ?? {}) as {
                    type?: string;
                    path?: string;
                    name?: string;
                };

                const type = attachment.type ?? 'region';

                if (!IMAGE_ATTACHMENT_TYPES.includes(type)) continue;

                const name = attachment.path ?? attachment.name ?? key;

                names.add(name);

                if (MESH_ATTACHMENT_TYPES.includes(type)) meshNames.add(name);
            }
        }
    }

    return { isSkeleton: Array.isArray(bones), names, meshNames };
}

/**
 * The region of `names` an image under the shared image folder supplies, or `undefined` for one
 * no region asks for.
 *
 * A region name is written relative to the skeleton's own images root, which is rarely the
 * folder the game packs from: `img/hero/torso.png` supplies the region `torso`. So leading
 * folders are dropped a segment at a time until what is left is a region the skeleton names.
 *
 * `ownedBy` names the folders that belong to a *different* skeleton sharing this image folder,
 * and stops the search from stepping over one: two heroes exported from the same rig both name
 * a `torso`, and `hero/torso.png` is the first one's, not the second's. A region named with the
 * folder still spelled out (`bigWin/confetti1`) matches before anything is dropped, so art
 * deliberately shared out of another skeleton's folder is unaffected.
 */
export function matchRegionName(
    regionPath: string,
    names: Set<string>,
    ownedBy?: ReadonlySet<string>,
): string | undefined {
    const segments = regionPath.split('/');

    for (let start = 0; start < segments.length; start++) {
        if (start > 0 && ownedBy?.has(segments[start - 1])) return undefined;

        const candidate = segments.slice(start).join('/');

        if (names.has(candidate)) return candidate;

        const withoutIndex = candidate.replace(/_\d+$/, '');

        if (withoutIndex !== candidate && names.has(withoutIndex)) return candidate;
    }

    return undefined;
}

/**
 * The folder a skeleton draws its images from: the one named after it, its plural, or an
 * `img` / `images` / `pictures` folder shared with the other skeletons beside it.
 *
 * The plural is there because a template skeleton is usually one of many: `symbol.json` is
 * instantiated per symbol and its art is filed under `symbols/`, a skin per symbol. It is
 * only taken when no skeleton is named after it — `reel` must not take the `reels/` folder
 * that belongs to `reels.json` — so pass `skeletonNames` wherever sibling skeletons are known.
 */
export function pickImageFolderName(
    skeletonName: string,
    folderNames: Iterable<string>,
    skeletonNames: Iterable<string> = [],
): string | undefined {
    const names = [...folderNames];

    if (names.includes(skeletonName)) return skeletonName;

    const plural = `${skeletonName}s`;

    if (names.includes(plural) && ![...skeletonNames].includes(plural)) return plural;

    for (const candidate of SPINE_IMAGE_FOLDER_NAMES) {
        const match = names.find((name) => name.toLowerCase() === candidate);

        if (match) return match;
    }

    return undefined;
}
