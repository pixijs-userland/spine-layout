import type { PixiMajor, SpineRuntimeInfo } from '../../engine/Engine';
import { UnsupportedSpineVersionError } from '../../engine/errors';
import { minorOf } from './minorOf';
import { PRE_PASSES } from './prePasses';
import { JSON_ONLY_MINORS, PIXI_MAJORS, runtimesOf } from './runtimeMatrix';

/** The runtime minor a project's game reads an export minor with, where it is another minor's. */
export type RuntimePin = Readonly<Record<string, string>>;

/** The {@link RuntimePin} key for exports that name no Spine version. */
export const UNVERSIONED = '*';

export interface RuntimePick {
    runtime: SpineRuntimeInfo;
    /** {@link PRE_PASSES} ids to run over the JSON before the runtime reads it, in order. */
    prePasses: string[];
    /** Set whenever the runtime is not the export's own. */
    warning?: string;
}

type Json = Readonly<Record<string, unknown>>;

export interface PickOptions {
    /** The skeleton's file, for the warning and the error. */
    file?: string;
    /** A `.skel`, which pre-passes cannot rewrite. */
    binary?: boolean;
    /** The parsed `.json`, so a warning names what this export holds rather than what one may. */
    json?: Json;
}

/** Where a 4.2 export keeps its constraints; 4.3 reads them from one `constraints` list. */
const CONSTRAINT_SECTIONS_4_2 = ['ik', 'transform', 'path', 'physics'];

/** The top-level constraint lists of a parsed `.json`: all `pickRuntime` reads of it, and small. */
export function constraintLists(json: Json): Json {
    return Object.fromEntries(
        CONSTRAINT_SECTIONS_4_2.filter((section) => section in json).map((section) => [
            section,
            json[section],
        ]),
    );
}

function constraintsUnread(json?: Json): string {
    if (!json) {
        return 'any top-level ik/transform/path/physics constraints are not read; exports with them may throw';
    }

    const held = CONSTRAINT_SECTIONS_4_2.filter((section) => {
        const constraints = json[section];
        return Array.isArray(constraints) && constraints.length > 0;
    });

    return held.length
        ? `its top-level ${held.join('/')} constraints are not read; it may throw`
        : 'it has no top-level ik/transform/path/physics constraints, so nothing is expected to be lost';
}

/**
 * What a runtime is known to lose reading another minor's export, as measured on our exports: by
 * `from->to`, or by `from->to family` where one family's runtime reads it differently.
 */
const CROSS_READ_LOSSES: Readonly<Record<string, string | ((json?: Json) => string)>> = {
    '4.2->4.3': constraintsUnread,
    '4.1->4.3': 'bone `transform` and every constraint are lost; some exports throw',
    '4.1->4.2': 'bone `transform` is ignored, so every bone inherits its full transform',
    '4.0->4.1': 'its mesh deform keys are dropped',
    '4.0->4.1 pixi-spine-modular':
        "none measured: pixi-spine's runtime-4.1 converts a 4.0 export itself, as the 4.0->4.1 pre-pass does",
};

function lossOf(from: string, { minor, family }: SpineRuntimeInfo, json?: Json): string {
    const loss =
        CROSS_READ_LOSSES[`${from}->${minor} ${family}`] ?? CROSS_READ_LOSSES[`${from}->${minor}`];

    if (typeof loss === 'function') return loss(json);
    return (
        loss ??
        `the ${minor} runtime reads ${minor} exports only: expect missing data, wrong poses or a throw`
    );
}

function route(
    minor: string,
    available: readonly SpineRuntimeInfo[],
    binary: boolean,
): Omit<RuntimePick, 'warning'> | undefined {
    if (binary && JSON_ONLY_MINORS.has(minor)) return undefined;

    const exact = available.find((runtime) => runtime.minor === minor);
    if (exact) return { runtime: exact, prePasses: [] };
    if (binary) return undefined;

    const prePasses: string[] = [];
    let at = minor;

    for (
        let pass = PRE_PASSES.find((p) => p.from === at);
        pass;
        pass = PRE_PASSES.find((p) => p.from === at)
    ) {
        prePasses.push(pass.id);
        at = pass.to;

        const runtime = available.find((candidate) => candidate.minor === at);
        if (runtime) return { runtime, prePasses };
    }

    return undefined;
}

const afterPrePasses = (named: readonly string[]) =>
    `after ${named.length === 1 ? 'pre-pass' : 'pre-passes'} ${named.join(', ')}`;

const described = (id: string) =>
    `${id} (${PRE_PASSES.find((pass) => pass.id === id)!.description})`;

function passedOver(found: Omit<RuntimePick, 'warning'> | undefined): string {
    if (!found) return '';

    return found.prePasses.length
        ? ` over the ${found.runtime.minor} runtime ${afterPrePasses(found.prePasses)}`
        : ` over its own ${found.runtime.minor} runtime`;
}

/** The Pixi majors with a runtime that reads `minor`, by its own runtime or through pre-passes. */
export function pixiMajorsFor(minor: string, binary = false): PixiMajor[] {
    return PIXI_MAJORS.filter((pixi) => route(minor, runtimesOf(pixi), binary));
}

/**
 * The runtime among `available` that reads an export (plan Decision 3): the one `pin` names for
 * its minor, which cross-reads it as is, as the project's game does; else the export minor's own;
 * else the nearest newer one that pre-passes reach. Throws {@link UnsupportedSpineVersionError}
 * when none does.
 */
export function pickRuntime(
    exportVersion: string | undefined,
    available: readonly SpineRuntimeInfo[],
    pin?: RuntimePin,
    { file, binary = false, json }: PickOptions = {},
): RuntimePick {
    const minor = minorOf(exportVersion);
    const at = file ? `${file}: ` : '';

    if (!minor) {
        const runtime = available.find((candidate) => candidate.minor === pin?.[UNVERSIONED]);

        if (runtime) {
            return {
                runtime,
                prePasses: [],
                warning: `${at}the export names no Spine version: read by the ${runtime.minor} runtime, as the project pins`,
            };
        }
    }

    if (minor) {
        const found = route(minor, available, binary);
        const pinned = pin?.[minor];
        const runtime =
            pinned === minor
                ? undefined
                : available.find((candidate) => candidate.minor === pinned);

        if (runtime) {
            return {
                runtime,
                prePasses: [],
                warning: `${at}Spine ${exportVersion} cross-read by the ${runtime.minor} runtime, as the project pins${passedOver(found)}: ${lossOf(minor, runtime, json)}`,
            };
        }

        if (found && !found.prePasses.length) return found;
        if (found) {
            return {
                ...found,
                warning: `${at}Spine ${exportVersion} read by the ${found.runtime.minor} runtime ${afterPrePasses(found.prePasses.map(described))}`,
            };
        }
    }

    throw new UnsupportedSpineVersionError({
        file,
        version: exportVersion,
        registered: available.map((runtime) => runtime.minor),
        pixiMajors: minor ? pixiMajorsFor(minor, binary) : [],
    });
}
