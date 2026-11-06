import type { PixiMajor, SpineRuntimeInfo } from '../../engine/Engine';
import { UnsupportedSpineVersionError } from '../../engine/errors';
import { compareMinors, minorOf } from './minorOf';
import { pickRuntime, pixiMajorsFor, type PickOptions, type RuntimePin } from './pickRuntime';
import { DEFAULT_PIXI, ONE_RUNTIME_PER_PAGE, PIXI_MAJORS, runtimesOf } from './runtimeMatrix';

export interface ExportVersion {
    file: string;
    /** As the skeleton gives it; `undefined` when it gives none. */
    version: string | undefined;
    binary?: boolean;
    /** The parsed `.json`, or its `constraintLists`, for a cross-read warning to name what it loses. */
    json?: PickOptions['json'];
}

/** What `settings/project.json` pins: the game's Pixi, and the runtime it reads a minor with. */
export interface ProjectPin {
    pixi?: PixiMajor;
    spine?: RuntimePin;
}

/**
 * - `pinned`: the project names the Pixi.
 * - `default`: the default Pixi of the newest export minor, which reads every export.
 * - `covering`: that one does not; the newest Pixi that does.
 * - `uncovered`: none does; the newest minor's default, the others skipped.
 * - `none`: no export version anything reads.
 */
export type PixiChoiceReason = 'pinned' | 'default' | 'covering' | 'uncovered' | 'none';

export type FileRuntime =
    | {
          file: string;
          version: string | undefined;
          runtimeMinor: string;
          prePasses: string[];
          warning?: string;
      }
    | { file: string; version: string | undefined; error: UnsupportedSpineVersionError };

export interface PixiChoice {
    pixi: PixiMajor;
    reason: PixiChoiceReason;
    /** One line saying why, for the console. */
    message: string;
    /** The newest export minor any Pixi has a runtime for, which an unpinned choice starts from. */
    newest?: string;
    /** The runtimes the files need on that Pixi, oldest minor first. */
    runtimes: SpineRuntimeInfo[];
    perFile: FileRuntime[];
}

/** Where a folder with no readable export version opens. */
const FALLBACK_PIXI: PixiMajor = 8;

function routes(
    entries: readonly ExportVersion[],
    available: readonly SpineRuntimeInfo[],
    pin?: RuntimePin,
) {
    return entries.map((entry) => {
        try {
            return pickRuntime(entry.version, available, pin, entry).runtime;
        } catch {
            return undefined;
        }
    });
}

/**
 * The runtimes a page of `pixi` registers for these exports: all its own, but where it loads a
 * single runtime per page, the one the newest export needs.
 */
function pageRuntimes(
    pixi: PixiMajor,
    entries: readonly ExportVersion[],
    pin?: RuntimePin,
): SpineRuntimeInfo[] {
    const available = runtimesOf(pixi);
    if (!ONE_RUNTIME_PER_PAGE.has(pixi)) return available;

    const needed = routes(entries, available, pin).filter((runtime) => runtime !== undefined);
    const newest = needed.sort((a, b) => compareMinors(b.minor, a.minor))[0];

    return newest ? [newest] : available;
}

/** Whether `pixi` reads every export some Pixi reads, by its own runtime or through pre-passes. */
function covers(pixi: PixiMajor, entries: readonly ExportVersion[]): boolean {
    const readable = entries.filter((entry) => {
        const minor = minorOf(entry.version);
        return minor !== undefined && pixiMajorsFor(minor, entry.binary).length > 0;
    });

    return routes(readable, pageRuntimes(pixi, readable)).every((runtime) => runtime !== undefined);
}

function describe(pixi: PixiMajor, reason: PixiChoiceReason, newest?: string): string {
    const preferred = newest && DEFAULT_PIXI[newest];

    switch (reason) {
        case 'pinned':
            return `Pixi ${pixi}, pinned by the project`;
        case 'default':
            return `Pixi ${pixi}, the default for ${newest}, the newest export minor`;
        case 'covering':
            return `Pixi ${pixi}, the newest that reads every export; Pixi ${preferred}, the default for ${newest}, does not`;
        case 'uncovered':
            return `Pixi ${pixi}, the default for ${newest}; no Pixi reads every export, so some are skipped`;
        case 'none':
            return `Pixi ${pixi}: no export names a version any runtime reads`;
    }
}

/**
 * The Pixi a folder of exports opens on, and the runtime each export is read by there (plan
 * Decision 4): the pinned Pixi; else the default Pixi of the newest export minor when it reads
 * every export (by its own runtime or through pre-passes); else the newest Pixi that does; else
 * that default, the exports it cannot read reported as errors. Pure: games and the editor share it.
 */
export function choosePixi(
    exportVersions: readonly (ExportVersion | string)[],
    pin: ProjectPin = {},
): PixiChoice {
    const entries = exportVersions.map((entry) =>
        typeof entry === 'string' ? { file: '', version: entry } : entry,
    );
    const newest = entries
        .map((entry) => minorOf(entry.version))
        .filter(
            (minor): minor is string => minor !== undefined && DEFAULT_PIXI[minor] !== undefined,
        )
        .sort(compareMinors)
        .at(-1);

    let pixi: PixiMajor;
    let reason: PixiChoiceReason;

    if (pin.pixi !== undefined) {
        pixi = pin.pixi;
        reason = 'pinned';
    } else if (!newest) {
        pixi = FALLBACK_PIXI;
        reason = 'none';
    } else if (covers(DEFAULT_PIXI[newest], entries)) {
        pixi = DEFAULT_PIXI[newest];
        reason = 'default';
    } else {
        const covering = [...PIXI_MAJORS].reverse().find((candidate) => covers(candidate, entries));

        pixi = covering ?? DEFAULT_PIXI[newest];
        reason = covering ? 'covering' : 'uncovered';
    }

    const available = pageRuntimes(pixi, entries, pin.spine);
    const used = new Map<string, SpineRuntimeInfo>();
    const perFile = entries.map((entry): FileRuntime => {
        const { file, version } = entry;

        try {
            const { runtime, prePasses, warning } = pickRuntime(
                version,
                available,
                pin.spine,
                entry,
            );
            used.set(runtime.minor, runtime);
            return {
                file,
                version,
                runtimeMinor: runtime.minor,
                prePasses,
                ...(warning && { warning }),
            };
        } catch (error) {
            if (!(error instanceof UnsupportedSpineVersionError)) throw error;
            return { file, version, error };
        }
    });

    return {
        pixi,
        reason,
        message: describe(pixi, reason, newest),
        ...(newest && { newest }),
        runtimes: [...used.values()].sort((a, b) => compareMinors(a.minor, b.minor)),
        perFile,
    };
}
