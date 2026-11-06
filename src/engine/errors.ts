import type { PixiMajor } from './Engine';

export interface UnsupportedSpineVersion {
    /** The skeleton's file, where the caller knows it. */
    file?: string;
    /** The export version as the skeleton gives it; `undefined` when it gives none. */
    version: string | undefined;
    /** The export minors the engine has a runtime for. */
    registered: readonly string[];
    /** The Pixi majors with a runtime that reads the export. */
    pixiMajors: readonly PixiMajor[];
    /** Those of `registered` that read no binary, named so where the export is a `.skel`. */
    jsonOnly?: readonly string[];
}

/** No runtime the engine registered reads this skeleton's export version. */
export class UnsupportedSpineVersionError extends Error implements UnsupportedSpineVersion {
    readonly file?: string;
    readonly version: string | undefined;
    readonly registered: readonly string[];
    readonly pixiMajors: readonly PixiMajor[];

    constructor({ file, version, registered, pixiMajors, jsonOnly }: UnsupportedSpineVersion) {
        const named = version !== undefined && /^\d+\.\d+/.test(version);
        const runtimes = registered.length
            ? registered
                  .map((minor) => (jsonOnly?.includes(minor) ? `${minor} (JSON only)` : minor))
                  .join(', ')
            : 'none';
        const elsewhere = pixiMajors.length
            ? `Pixi ${pixiMajors.join(', ')} can render it`
            : 'no Pixi has a runtime for it';
        const why = named
            ? `Spine ${version} — registered runtimes: ${runtimes}; ${elsewhere}`
            : `no export version — registered runtimes: ${runtimes}; a runtime is picked by the version an export names, or by a pin under "*"`;

        super(`${file ? `${file}: ` : ''}${why}`);
        this.name = 'UnsupportedSpineVersionError';
        this.file = file;
        this.version = version;
        this.registered = registered;
        this.pixiMajors = pixiMajors;
    }
}

/** The skeletons of one layout name more than one Spine version, by export minor. */
export class MixedSpineVersionsError extends Error {
    readonly filesByMinor: Readonly<Record<string, readonly string[]>>;

    constructor(filesByMinor: Record<string, string[]>) {
        const listed = Object.entries(filesByMinor)
            .map(([minor, files]) => `${minor} (${files.join(', ')})`)
            .join('; ');

        super(
            `The Spine exports of one layout must be of one Spine version, and these are not: ${listed}`,
        );
        this.name = 'MixedSpineVersionsError';
        this.filesByMinor = filesByMinor;
    }
}
