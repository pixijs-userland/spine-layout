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
}

/** No runtime the engine registered reads this skeleton's export version. */
export class UnsupportedSpineVersionError extends Error implements UnsupportedSpineVersion {
    readonly file?: string;
    readonly version: string | undefined;
    readonly registered: readonly string[];
    readonly pixiMajors: readonly PixiMajor[];

    constructor({ file, version, registered, pixiMajors }: UnsupportedSpineVersion) {
        const exported = version === undefined ? 'no export version' : `Spine ${version}`;
        const runtimes = registered.length ? registered.join(', ') : 'none';
        const elsewhere = pixiMajors.length
            ? `Pixi ${pixiMajors.join(', ')} can render it`
            : 'no Pixi has a runtime for it';

        super(
            `${file ? `${file}: ` : ''}${exported} — registered runtimes: ${runtimes}; ${elsewhere}`,
        );
        this.name = 'UnsupportedSpineVersionError';
        this.file = file;
        this.version = version;
        this.registered = registered;
        this.pixiMajors = pixiMajors;
    }
}
