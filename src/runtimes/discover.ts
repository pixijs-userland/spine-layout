import { RUNTIME_MATRIX } from '../core/versions/runtimeMatrix';
import type { PixiMajor } from '../engine/Engine';
import { esotericRuntime, type EsotericModule } from '../engines/esoteric';
import {
    minorOfRuntime,
    pixiSpineLegacy,
    pixiSpineModular,
    type PixiSpineCore,
    type PixiSpineLegacyNamespace,
    type PixiSpineMinor,
    type PixiSpineModularBase,
    type PixiSpineModularRuntime,
} from '../engines/pixiSpine';
import type { SpineRuntime } from './adapters';

type Namespace = Record<string, unknown>;

/** `scripts/build-runtimes.mjs` in app-magic-editor: `SpineRuntime_<package>_<version>`. */
const EDITOR_GLOBAL = /^SpineRuntime_[A-Za-z0-9]+_(\d+_\d+_\d+)$/;

const MODULAR_MINORS: readonly PixiSpineMinor[] = ['3.7', '3.8', '4.0', '4.1'];

const digits = (minor: string) => minor.replace('.', '');

const isObject = (value: unknown): value is Namespace =>
    (typeof value === 'object' || typeof value === 'function') && value !== null;

const isRuntimeCore = (value: unknown): value is PixiSpineCore =>
    isObject(value) && typeof value.SkeletonJson === 'function' && isObject(value.Skin);

const isLegacy = (value: Namespace): value is Namespace & PixiSpineLegacyNamespace =>
    typeof value.Spine === 'function' && isRuntimeCore(value.core);

const isModularBase = (value: unknown): value is PixiSpineModularBase =>
    isObject(value) && typeof value.SpineBase === 'function' && isObject(value.AttachmentType);

const isEsotericModule = (value: Namespace): value is Namespace & EsotericModule =>
    typeof value.Spine === 'function' &&
    ('DrawOrder' in value || 'Physics' in value) &&
    ('SpinePipe' in value || 'SlotMesh' in value);

function modularRuntimes(
    byMinor: (minor: PixiSpineMinor) => unknown,
): Partial<Record<PixiSpineMinor, PixiSpineModularRuntime>> {
    return Object.fromEntries(
        MODULAR_MINORS.flatMap((minor) => {
            const runtime = byMinor(minor);
            return isRuntimeCore(runtime) ? [[minor, runtime]] : [];
        }),
    );
}

/** The release line of `minor`'s runtime on that Pixi, e.g. `1.x`: pixi-spine's scripts name none. */
function releaseOn(PIXI: Namespace, minor: string): string {
    const major = Number(String(PIXI.VERSION).split('.')[0]) as PixiMajor;
    const entry = RUNTIME_MATRIX[major]?.[minor];

    return entry ? `${entry.packageVersion.split('.')[0]}.x` : 'unknown';
}

/**
 * The Spine runtimes a page's scripts left on `scope`, for an engine to bind
 * (`runtimeAdapters`):
 * - app-magic-editor's runtime bundles, `SpineRuntime_<package>_<version>`: a pixi-spine 1.x/2.x
 *   namespace, `{ base, runtime37, … }` of `@pixi-spine/*`, or a spine-pixi-v7/v8 module;
 * - pixi-spine 1.x/2.x's own script, `PIXI.spine` with its runtime at `PIXI.spine.core`;
 * - `@pixi-spine/*` 3.x/4.x per-package scripts, the base at `PIXI.spine` and each runtime at
 *   `PIXI.spine37`, `spine38`, `spine40`, `spine41`;
 * - Esoteric's spine-pixi IIFE, `spine`.
 * pixi-spine's all-in-one bundles keep their runtimes to themselves and are not found.
 */
export function discoverGlobalRuntimes(scope: object = globalThis): SpineRuntime[] {
    const global = scope as Namespace;
    const found: SpineRuntime[] = [];
    const seen = new Set<unknown>();
    const once = (namespace: unknown) => {
        if (seen.has(namespace)) return false;
        seen.add(namespace);
        return true;
    };

    function adopt(value: unknown, packageVersion: string) {
        if (!isObject(value) || !once(value)) return;

        if (isLegacy(value)) {
            found.push(pixiSpineLegacy(value, { packageVersion }));
        } else if (isModularBase(value.base)) {
            const runtimes = modularRuntimes((minor) => value[`runtime${digits(minor)}`]);
            found.push(...pixiSpineModular(value.base, runtimes, { packageVersion }));
        } else if (isEsotericModule(value)) {
            found.push(esotericRuntime(value, packageVersion));
        }
    }

    for (const key of Object.keys(global)) {
        const version = key.match(EDITOR_GLOBAL)?.[1];
        if (version) adopt(global[key], version.replaceAll('_', '.'));
    }

    const PIXI = global.PIXI;
    const spine = isObject(PIXI) ? PIXI.spine : undefined;

    if (isObject(PIXI) && isObject(spine) && once(spine)) {
        if (isLegacy(spine)) {
            const packageVersion = releaseOn(PIXI, minorOfRuntime(spine.core));
            found.push(pixiSpineLegacy(spine, { packageVersion }));
        } else if (isModularBase(spine)) {
            const runtimes = modularRuntimes((minor) => PIXI[`spine${digits(minor)}`]);
            const [first] = Object.keys(runtimes);

            if (first) {
                const packageVersion = releaseOn(PIXI, first);
                found.push(...pixiSpineModular(spine, runtimes, { packageVersion }));
            }
        }
    }

    if (isObject(global.spine) && isEsotericModule(global.spine) && once(global.spine)) {
        found.push(esotericRuntime(global.spine));
    }

    return found;
}
