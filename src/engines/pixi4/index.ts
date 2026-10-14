import type { RuntimePin } from '../../core/versions/pickRuntime';
import { RUNTIME_MATRIX } from '../../core/versions/runtimeMatrix';
import type { Engine, SpinePort } from '../../engine/Engine';
import { pixiSpineAdapters, type SpineRuntime } from '../../runtimes/adapters';
import { createLegacyPorts, type LegacyContainer } from '../legacy';
import {
    minorOfRuntime,
    pixiSpineLegacy,
    type PixiSpineContainer,
    type PixiSpineRuntime,
} from '../pixiSpine';
import { createCompositeSpinePort } from '../shared/compositeSpinePort';
import type {
    Pixi4AssetsPort,
    Pixi4Namespace,
    Pixi4Renderer,
    Pixi4Spine,
    Pixi4Types,
} from './pixi4.types';

export interface Pixi4EngineOptions {
    /** Its interaction manager reports every pointer move, hit or not. */
    renderer?: Pixi4Renderer;
    /**
     * The pixi-spine 1.x runtime to render with, on a page without `PIXI.spine`: from
     * `pixiSpineLegacy` or `discoverGlobalRuntimes` (`@pixijs-userland/spine-layout/runtimes`).
     * Where `PIXI.spine` is loaded too, `PIXI.loader` reads every skeleton with it, and
     * `readSkeletonFromAssets` refuses the `spineData` it leaves.
     */
    runtime?: SpineRuntime;
    /**
     * The runtime minor the game reads an export minor with, e.g. `{ '3.7': '3.8' }`;
     * under `'*'`, the one it reads the exports that name no version with.
     */
    pin?: RuntimePin;
    /** Where a skeleton read by a runtime other than its own is reported; `console.warn` by default. */
    warn?: (message: string) => void;
}

export interface Pixi4Engine extends Engine<Pixi4Types> {
    readonly assets: Pixi4AssetsPort;
}

/** What the pixi-spine port asks of a container, which every v4 container is. */
interface Pixi4SpinePortTypes extends Pixi4Types {
    Container: LegacyContainer & PixiSpineContainer;
}

const PIXI_SPINE_1 = Object.entries(RUNTIME_MATRIX[4])
    .map(([minor, { packageVersion }]) => `${packageVersion} (${minor})`)
    .join(' or ');

const isPixiSpineLegacy = (runtime: SpineRuntime): runtime is PixiSpineRuntime =>
    runtime.info.family === 'pixi-spine-legacy';

function spineOnPixi(PIXI: Pixi4Namespace): PixiSpineRuntime {
    if (!PIXI.spine?.Spine) {
        throw new Error('createPixi4Engine: PIXI.spine is missing — load pixi-spine first');
    }

    // pixi-spine 1.x names no version of its own: its runtime's minor says which release it is
    const minor = minorOfRuntime(PIXI.spine.core);
    const release = RUNTIME_MATRIX[4][minor];
    if (!release) {
        throw new Error(
            `createPixi4Engine: PIXI.spine reads Spine ${minor}; Pixi 4 renders with pixi-spine ${PIXI_SPINE_1}`,
        );
    }

    return pixiSpineLegacy(PIXI.spine, { packageVersion: release.packageVersion });
}

function legacyRuntime(
    PIXI: Pixi4Namespace,
    runtime: SpineRuntime = spineOnPixi(PIXI),
): PixiSpineRuntime {
    const { minor, packageName, packageVersion } = runtime.info;
    const named = `${packageName}@${packageVersion}`;

    if (!isPixiSpineLegacy(runtime) || !RUNTIME_MATRIX[4][minor]) {
        throw new Error(`createPixi4Engine: Pixi 4 renders with pixi-spine 1.x, not ${named}`);
    }
    // pixi-spine 2.x is the legacy family too, and its Spine is a Pixi 5 container
    if (!(runtime.Spine.prototype instanceof PIXI.Container)) {
        throw new Error(
            `createPixi4Engine: the Spine of ${named} is no container of this PIXI ${PIXI.VERSION}`,
        );
    }

    return runtime;
}

/**
 * The engine over a PIXI v4 namespace — `window.PIXI` with pixi-spine 1.x (and optionally
 * pixi-particles) already on it. Nothing here reads a global: everything comes from `PIXI`.
 * Its one Spine runtime reads exports of its own minor, or those `pin` sends it.
 */
export function createPixi4Engine(
    PIXI: Pixi4Namespace,
    { renderer, runtime, pin, warn }: Pixi4EngineOptions = {},
): Pixi4Engine {
    if (!PIXI.VERSION.startsWith('4.')) {
        throw new Error(`createPixi4Engine: PIXI is ${PIXI.VERSION}, not v4`);
    }

    const legacy = createLegacyPorts<Pixi4Spine>(PIXI, { renderer, spine: () => spine });
    const spine: SpinePort<Pixi4SpinePortTypes> = createCompositeSpinePort(
        pixiSpineAdapters([legacyRuntime(PIXI, runtime)], {
            PIXI,
            assets: legacy.assets,
            pin,
            warn,
        }),
        { pin, warn },
    );

    return {
        name: 'pixi4',
        spine,
        display: legacy.display,
        text: legacy.text,
        assets: legacy.assets,
        ...(legacy.particles && { particles: legacy.particles }),
    };
}
