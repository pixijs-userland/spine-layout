import type { RuntimePin } from '../../core/versions/pickRuntime';
import { RUNTIME_MATRIX } from '../../core/versions/runtimeMatrix';
import type { Engine, SpinePort } from '../../engine/Engine';
import { pixiSpineAdapters, type PixiSpinePixi, type SpineRuntime } from '../../runtimes/adapters';
import { discoverGlobalRuntimes } from '../../runtimes/discover';
import {
    createLegacyPorts,
    type LegacyAssetsPort,
    type LegacyContainer,
    type LegacyLoader,
    type LegacyNamespace,
    type LegacyRenderer,
    type LegacySpine,
    type LegacyTexture,
    type LegacyTypes,
} from '../legacy';
import type {
    PixiSpineContainer,
    PixiSpineLegacyNamespace,
    PixiSpineRuntime,
    PixiSpineTexture,
    PixiSpineView,
} from '../pixiSpine';
import { createCompositeSpinePort } from '../shared/compositeSpinePort';

export type Pixi5Spine = LegacySpine & PixiSpineView;

export type Pixi5Types = LegacyTypes<Pixi5Spine>;

/** The same objects as the legacy ports and pixi-spine's port each declare their part of them. */
interface Pixi5SpineTypes extends Pixi5Types {
    Container: LegacyContainer & PixiSpineContainer;
    Texture: LegacyTexture & PixiSpineTexture;
}

/** `window.PIXI` of a Pixi 5 page, with pixi-spine 2.x and pixi-particles 4 on it if it has them. */
export type Pixi5Namespace = LegacyNamespace &
    PixiSpinePixi & {
        spine?: PixiSpineLegacyNamespace;
    };

export interface Pixi5EngineOptions {
    /**
     * The page's one pixi-spine: 2.1 reads Spine 3.8 exports, 2.0 reads 3.7, and both own
     * `PIXI.spine`. By default the one there; app-magic-editor's bundles keep theirs on a global
     * of their own, which `discoverGlobalRuntimes` finds.
     */
    runtime?: SpineRuntime;
    /** Its interaction manager reports every pointer move, hit or not. */
    renderer?: LegacyRenderer;
    /** Loaders besides `PIXI.Loader.shared` whose resources count as assets, e.g. an `app.loader`. */
    loaders?: readonly LegacyLoader[];
    /**
     * Reads the other minor's exports with the page's runtime, as the project's game does. Their
     * skins do not survive it: 2.1.14 finds none in a 3.7 export, and 2.0.5 throws on a 3.8 one's.
     */
    pin?: RuntimePin;
    /** Where such a cross-read is reported; `console.warn` by default. */
    warn?: (message: string) => void;
}

export interface Pixi5Engine extends Engine<Pixi5Types> {
    readonly assets: LegacyAssetsPort;
}

const PIXI_SPINE_2 = Object.entries(RUNTIME_MATRIX[5])
    .map(
        ([minor, { packageName, packageVersion }]) => `${packageName} ${packageVersion} (${minor})`,
    )
    .join(' or ');

const majorOf = (packageVersion: string) => packageVersion.split('.')[0];

function pageRuntime(PIXI: Pixi5Namespace, given?: SpineRuntime): PixiSpineRuntime {
    const runtime = given ?? discoverGlobalRuntimes({ PIXI })[0];
    if (!runtime) {
        throw new Error(
            `createPixi5Engine: no pixi-spine on PIXI.spine: load ${PIXI_SPINE_2}, or pass its runtime`,
        );
    }

    const { minor, family, packageName, packageVersion } = runtime.info;
    const entry = RUNTIME_MATRIX[5][minor];
    if (
        entry?.family !== family ||
        entry.packageName !== packageName ||
        majorOf(entry.packageVersion) !== majorOf(packageVersion)
    ) {
        throw new Error(
            `createPixi5Engine: Pixi 5 renders Spine with ${PIXI_SPINE_2}, not ${packageName} ${packageVersion} (${minor})`,
        );
    }

    return runtime as PixiSpineRuntime;
}

/**
 * The engine over a Pixi 5 page: `PIXI` and the one pixi-spine 2.x it loaded, which reads the
 * exports of one Spine minor; a skeleton of any other is refused with
 * `UnsupportedSpineVersionError`. Particles where pixi-particles 4 is on `PIXI.particles`.
 * Nothing here reads a global: everything comes from `PIXI` and the options.
 *
 * `PIXI` is typed by its version alone: pixi.js 5's own declarations do not fit the structural
 * types the ports read it by.
 */
export function createPixi5Engine(
    pixi: { readonly VERSION: string },
    { runtime, renderer, loaders, pin, warn }: Pixi5EngineOptions = {},
): Pixi5Engine {
    if (!/^5\./.test(pixi.VERSION)) {
        throw new Error(`createPixi5Engine: PIXI ${pixi.VERSION} is not Pixi 5`);
    }

    const PIXI = pixi as Pixi5Namespace;
    const page = pageRuntime(PIXI, runtime);
    const ports = createLegacyPorts<Pixi5Spine>(PIXI, { renderer, loaders, spine: () => spine });
    const spine: SpinePort<Pixi5Types> = createCompositeSpinePort(
        pixiSpineAdapters<Pixi5SpineTypes>([page], { PIXI, assets: ports.assets, pin, warn }),
        { pin, warn },
    );

    return {
        name: 'pixi5',
        spine,
        display: ports.display,
        text: ports.text,
        assets: ports.assets,
        ...(ports.particles && { particles: ports.particles }),
    };
}
