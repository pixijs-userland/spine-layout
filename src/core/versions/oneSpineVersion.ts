import { MixedSpineVersionsError } from '../../engine/errors';
import { minorOf } from './minorOf';

export interface VersionedFile {
    file: string;
    /** As the skeleton gives it; `undefined` when it gives none. */
    version: string | undefined;
}

/**
 * The one export minor of a layout's skeletons, or `undefined` when none names a version. Throws
 * {@link MixedSpineVersionsError} when they name more than one.
 */
export function oneSpineVersion(files: readonly VersionedFile[]): string | undefined {
    const filesByMinor: Record<string, string[]> = {};

    for (const { file, version } of files) {
        const minor = minorOf(version);
        if (minor) (filesByMinor[minor] ??= []).push(file);
    }

    const minors = Object.keys(filesByMinor);
    if (minors.length > 1) throw new MixedSpineVersionsError(filesByMinor);

    return minors[0];
}
