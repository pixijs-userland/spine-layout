import { skeletonVersion } from '../../core/utils/skeletonVersion';
import { compareMinors } from '../../core/versions/minorOf';
import { pickRuntime, type RuntimePin } from '../../core/versions/pickRuntime';
import { RUNTIME_MATRIX } from '../../core/versions/runtimeMatrix';
import type {
    Engine,
    LazySpineRuntimeAdapter,
    SpinePort,
    SpineRuntimeAdapter,
    SpineRuntimeInfo,
} from '../../engine/Engine';
import { isBinarySkeleton, type SkeletonDataLike, type SkeletonSource } from '../../engine/runtime';
import {
    discoverGlobalRuntimes,
    lazyRuntime,
    runtimeAdapters,
    type RuntimeHost,
    type SpineRuntime,
} from '../../runtimes';
import type { PixiV7Like } from '../esoteric';
import { isAtlas } from '../esoteric/assets';
import {
    createLegacyPorts,
    type LegacyAssetsPort,
    type LegacyAssetsRegistry,
    type LegacyContainer,
    type LegacyNamespace,
    type LegacyParticles,
    type LegacyTexture,
    type LegacyTypes,
} from '../legacy';
import type { PixiSpineDisplayClasses } from '../pixiSpine';
import { createCompositeSpinePort, type CompositeSpinePort } from '../shared/compositeSpinePort';
import type { Exports } from '../shared/exports';

export type Pixi7Types = LegacyTypes;

/** The parts of a pixi.js 7.2+ namespace the engine and its Spine runtimes use. */
export type Pixi7Namespace = LegacyNamespace & PixiSpineDisplayClasses & PixiV7Like;

/** A runtime loaded on demand: the runtime it names, bound already or for the engine to bind. */
export interface Pixi7LazyRuntime extends SpineRuntimeInfo {
    (): Promise<SpineRuntime | SpineRuntimeAdapter<Pixi7Types>>;
}

/**
 * A Spine runtime for the engine: one from `esotericRuntime` or `pixiSpineModular` that it binds
 * to its PIXI, one bound already (`esotericAdapter`, `pixiSpineAdapters`), or a lazy one.
 */
export type Pixi7Runtime = SpineRuntime | SpineRuntimeAdapter<Pixi7Types> | Pixi7LazyRuntime;

export interface Pixi7EngineOptions {
    /** By default what the page's scripts loaded, as `discoverGlobalRuntimes` finds it. */
    runtimes?: readonly Pixi7Runtime[];
    /** @pixi/particle-emitter 5, where it is not on `PIXI.particles`: an ES module namespace takes nothing. */
    particles?: Exports<LegacyParticles>;
    /**
     * The runtime a project's game reads an export minor with, where it is another minor's;
     * under `'*'`, the one it reads the exports that name no version with.
     */
    pin?: RuntimePin;
    /** Where a skeleton read by a runtime other than its own, or a runtime left out, is reported. */
    warn?: (message: string) => void;
}

export interface Pixi7Engine extends Engine<Pixi7Types> {
    readonly assets: LegacyAssetsPort;
    readonly containerClass: new () => LegacyContainer;
}

type Pixi7Adapter = SpineRuntimeAdapter<Pixi7Types>;

const isLazy = (runtime: Pixi7Runtime): runtime is Pixi7LazyRuntime =>
    typeof runtime === 'function';

const isAdapter = (runtime: object): runtime is Pixi7Adapter =>
    'port' in runtime && 'owns' in runtime;

const infoOf = (runtime: Pixi7Runtime): SpineRuntimeInfo =>
    isLazy(runtime) || isAdapter(runtime) ? runtime : runtime.info;

const named = ({ minor, packageName, packageVersion }: SpineRuntimeInfo) =>
    `${packageName}@${packageVersion} (Spine ${minor})`;

const majorOf = (version: string) => version.split('.')[0];

const runsOnPixi7 = ({ minor, family, packageName, packageVersion }: SpineRuntimeInfo) => {
    const entry = RUNTIME_MATRIX[7][minor];
    return (
        entry?.family === family &&
        entry.packageName === packageName &&
        majorOf(entry.packageVersion) === majorOf(packageVersion)
    );
};

const isPixiSpine40 = ({ minor, family, packageVersion }: SpineRuntimeInfo) =>
    minor === '4.0' &&
    family === 'pixi-spine-modular' &&
    majorOf(packageVersion) === majorOf(RUNTIME_MATRIX[7]['4.1'].packageVersion);

/**
 * The runtimes Pixi 7 has, by `RUNTIME_MATRIX[7]`, oldest minor first. Any other is passed over when
 * discovered and turned down when given, but for a given pixi-spine runtime-4.0: left out, with a warning.
 */
function pixi7Runtimes(
    given: readonly Pixi7Runtime[] | undefined,
    warn: (message: string) => void,
): Pixi7Runtime[] {
    const runtimes = given ?? discoverGlobalRuntimes(globalThis);

    return runtimes
        .filter((runtime) => {
            const info = infoOf(runtime);
            if (runsOnPixi7(info)) return true;
            if (!given) return false;

            if (!isPixiSpine40(info)) throw new Error(`${named(info)} does not run on Pixi 7`);

            warn(
                `createPixi7Engine leaves ${named(info)} out: it turns chain path constraints wrongly ` +
                    'on Pixi 7. runtime-4.1 reads 4.0 JSON after the 4.0 → 4.1 pre-pass; a 4.0 .skel has no reader.',
            );
            return false;
        })
        .sort((a, b) => compareMinors(infoOf(a).minor, infoOf(b).minor));
}

/** What a lazy runtime loaded, turned down before it is bound and registers anything on PIXI. */
function onPixi7<R extends SpineRuntime | Pixi7Adapter>(loaded: R): R {
    const info = infoOf(loaded);
    if (!runsOnPixi7(info)) throw new Error(`${named(info)} does not run on Pixi 7`);
    return loaded;
}

const isSkeletonExport = (value: unknown): value is SkeletonSource =>
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    Array.isArray((value as { bones?: unknown } | null)?.bones);

/** pixi-spine's own Assets loader leaves `{ spineData, spineAtlas }` under the skeleton's alias. */
const isLoaderResult = (value: unknown): value is { spineData: SkeletonDataLike } =>
    typeof value === 'object' && value !== null && 'spineData' in value && !!value.spineData;

interface AssetReader {
    spine: CompositeSpinePort<Pixi7Types>;
    assets: LegacyAssetsRegistry;
    pin?: RuntimePin;
    warn: (message: string) => void;
}

/**
 * `readSkeletonFromAssets` over every runtime of the engine: atlas text through `readSkeleton`, its
 * pages from the asset cache; an atlas spine-pixi-v7's loader parsed by the Esoteric runtime the
 * export picks, which takes it into its own classes.
 */
function assetReader({
    spine,
    assets,
    pin,
    warn,
}: AssetReader): SpinePort<Pixi7Types>['readSkeletonFromAssets'] {
    const pagesOf = (atlasAlias: string | undefined) =>
        new Proxy({} as Record<string, LegacyTexture>, {
            get: (_, page) =>
                typeof page === 'string' ? assets.pageTexture(page, atlasAlias) : undefined,
        });

    function ownData(data: SkeletonDataLike, alias: string): SkeletonDataLike {
        if (!spine.runtimeOf(data)) {
            throw new Error(`"${alias}" was read by a Spine runtime this engine does not have`);
        }
        return data;
    }

    function withParsedAtlas(source: SkeletonSource, skeletonAlias: string, atlasAlias: string) {
        const binary = isBinarySkeleton(source);
        const pick = pickRuntime(skeletonVersion(source), spine.runtimes, pin, {
            file: skeletonAlias,
            binary,
            json: binary ? undefined : source,
        });
        const { minor, family } = pick.runtime;

        if (family !== 'esoteric') {
            throw new Error(
                `${skeletonAlias}: the Spine ${minor} runtime reads atlas text, and an Assets loader ` +
                    `parsed "${atlasAlias}": load it with \`loadParser: 'loadTxt'\``,
            );
        }

        const adapter = spine.adapterFor(minor);

        if (pick.warning) warn(pick.warning);
        return adapter.port.readSkeletonFromAssets(skeletonAlias, atlasAlias);
    }

    return (skeletonAlias, atlasAlias) => {
        const source = assets.get<unknown>(skeletonAlias);

        if (isLoaderResult(source)) return ownData(source.spineData, skeletonAlias);
        if (source === undefined || source === null) {
            throw new Error(`No skeleton loaded as "${skeletonAlias}"`);
        }
        if (!isSkeletonExport(source)) {
            throw new Error(
                `"${skeletonAlias}" is not a skeleton export (another loader parsed it)`,
            );
        }

        const atlas = atlasAlias ? assets.get<unknown>(atlasAlias) : '';

        if (typeof atlas === 'string') {
            return spine.readSkeleton(source, atlas, pagesOf(atlasAlias), { file: skeletonAlias });
        }
        if (atlasAlias && isAtlas(atlas)) return withParsedAtlas(source, skeletonAlias, atlasAlias);

        throw new Error(`No atlas loaded as "${atlasAlias}"`);
    };
}

/**
 * The engine over a pixi.js 7.2+ namespace: the legacy display, text, assets and particles ports,
 * and one Spine port over every runtime it is given, each skeleton read by the runtime of its
 * export minor. Skeletons are read from their source, atlas text and page textures: pixi-spine's
 * and spine-pixi-v7's Assets loaders claim each other's files.
 *
 * `PIXI` is typed by its version alone: pixi.js 7's own declarations do not fit the structural
 * types the ports read it by.
 */
export function createPixi7Engine(
    pixi: { readonly VERSION: string },
    {
        runtimes,
        particles,
        pin,
        warn = (message) => console.warn(message),
    }: Pixi7EngineOptions = {},
): Pixi7Engine {
    if (parseInt(pixi.VERSION, 10) !== 7) {
        throw new Error(`createPixi7Engine: PIXI ${pixi.VERSION} is not Pixi 7`);
    }

    const PIXI = pixi as Pixi7Namespace;

    const chosen = pixi7Runtimes(runtimes, warn);

    if (!chosen.length) {
        throw new Error(
            'createPixi7Engine: no Spine runtime for Pixi 7. Pass `runtimes`, or load @pixi-spine/* 4.x or spine-pixi-v7 first',
        );
    }

    const namespace: LegacyNamespace = particles
        ? Object.create(PIXI, { particles: { value: particles } })
        : PIXI;
    const ports = createLegacyPorts(namespace, { spine: () => spine });
    // the engine reports each pick itself; a runtime's port would report it again
    const host: RuntimeHost = { PIXI, assets: ports.assets, pin, warn: () => {} };
    const bind = (runtime: SpineRuntime | Pixi7Adapter) =>
        isAdapter(runtime) ? runtime : runtimeAdapters<Pixi7Types>([runtime], host)[0];

    const unbound = chosen.filter(
        (runtime): runtime is SpineRuntime => !isLazy(runtime) && !isAdapter(runtime),
    );
    const eager = runtimeAdapters<Pixi7Types>(unbound, host);

    const adapters = chosen.map((runtime): Pixi7Adapter | LazySpineRuntimeAdapter<Pixi7Types> => {
        if (isLazy(runtime)) {
            return lazyRuntime(runtime, async () => bind(onPixi7(await runtime())));
        }
        return isAdapter(runtime) ? runtime : eager[unbound.indexOf(runtime)];
    });

    const spine = createCompositeSpinePort<Pixi7Types>(adapters, { pin, warn });
    spine.readSkeletonFromAssets = assetReader({ spine, assets: ports.assets, pin, warn });

    return {
        name: 'pixi7',
        spine,
        display: ports.display,
        text: ports.text,
        assets: ports.assets,
        containerClass: ports.containerClass,
        ...(ports.particles && { particles: ports.particles }),
    };
}
