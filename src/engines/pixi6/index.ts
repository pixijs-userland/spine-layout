import { compareMinors } from '../../core/versions/minorOf';
import type { RuntimePin } from '../../core/versions/pickRuntime';
import { RUNTIME_MATRIX } from '../../core/versions/runtimeMatrix';
import type {
    DisplayPort,
    Engine,
    LazySpineRuntimeAdapter,
    ParticlesPort,
    SpinePort,
    SpineRuntimeAdapter,
    SpineRuntimeInfo,
    TextPort,
} from '../../engine/Engine';
import type { SkeletonSource } from '../../engine/runtime';
import { lazyRuntime, pixiSpineAdapters, type SpineRuntime } from '../../runtimes/adapters';
import { discoverGlobalRuntimes } from '../../runtimes/discover';
import {
    createLegacyPorts,
    type LegacyAssetsRegistry,
    type LegacyNamespace,
    type LegacyParticles,
    type LegacyPortsOptions,
    type LegacyTexture,
} from '../legacy';
import type { PixiSpineRuntime } from '../pixiSpine';
import { createCompositeSpinePort } from '../shared/compositeSpinePort';
import type { Exports } from '../shared/exports';
import type { Pixi6Namespace, Pixi6Particles, Pixi6Spine, Pixi6Types } from './types';

type Pixi6Adapter = SpineRuntimeAdapter<Pixi6Types>;

/** A runtime loaded on demand: the runtime it names, for the engine to bind. */
export interface Pixi6LazyRuntime extends SpineRuntimeInfo {
    (): Promise<SpineRuntime>;
}

/**
 * A Spine runtime for the engine, which draws with `@pixi-spine/*` 3.x only and binds each to its
 * PIXI and its asset cache itself: one from `pixiSpineModular` or `discoverGlobalRuntimes`, or a
 * lazy one.
 */
export type Pixi6Runtime = SpineRuntime | Pixi6LazyRuntime;

type Checked = PixiSpineRuntime | Pixi6LazyRuntime;

export interface Pixi6EngineOptions extends Omit<LegacyPortsOptions, 'spine'> {
    /**
     * One per export minor, 3.7 to 4.1. By default what the page's scripts loaded for this PIXI,
     * as `discoverGlobalRuntimes` finds it, the first of each minor.
     *
     * `@pixi-spine/*` 3.1's own `dist/runtime-*.js` scripts read their base from `PIXI.spine.base`,
     * where `dist/base.js` leaves none: set `PIXI.spine.base = PIXI.spine` between the two.
     */
    runtimes?: readonly Pixi6Runtime[];
    /** pixi-particles 4 or @pixi/particle-emitter 5, where it is not on `PIXI.particles`. */
    particles?: Exports<Pixi6Particles>;
    /**
     * The runtime a project's game reads an export minor with, where it is another minor's;
     * under `'*'`, the one it reads the exports that name no version with.
     */
    pin?: RuntimePin;
    /**
     * Where a skeleton read by a runtime other than its own, or a runtime the page loaded twice, is
     * reported; `console.warn` by default.
     */
    warn?: (message: string) => void;
}

export interface Pixi6Engine extends Engine<Pixi6Types> {
    readonly assets: LegacyAssetsRegistry;
}

const isLazy = (runtime: Pixi6Runtime): runtime is Pixi6LazyRuntime =>
    typeof runtime === 'function';

const isAdapter = (runtime: object) => 'port' in runtime && 'owns' in runtime;

const infoOf = (runtime: Pixi6Runtime): SpineRuntimeInfo =>
    isLazy(runtime) ? runtime : runtime.info;

const named = ({ minor, packageName, packageVersion }: SpineRuntimeInfo) =>
    `${packageName}@${packageVersion} (Spine ${minor})`;

const runsOnPixi6 = ({ minor, family, packageName }: SpineRuntimeInfo) => {
    const entry = RUNTIME_MATRIX[6][minor];
    return entry?.family === family && entry.packageName === packageName;
};

/** Whether an unbound runtime's `Spine` is a container of this PIXI, not of another copy's. */
const drawsOn = (PIXI: Pixi6Namespace, runtime: Pixi6Runtime) =>
    isLazy(runtime) || ('Spine' in runtime && runtime.Spine.prototype instanceof PIXI.Container);

const particlesDrawOn = (PIXI: Pixi6Namespace, particles: Exports<LegacyParticles>) =>
    (particles as Partial<Pixi6Particles>).Particle?.prototype instanceof PIXI.Sprite;

const builtAgainstAnother = (PIXI: Pixi6Namespace, what: string) =>
    new Error(
        `createPixi6Engine: ${what} was built against another Pixi than this ${PIXI.VERSION}: ` +
            'bundle it with pixi.js and @pixi/* resolving to this PIXI',
    );

function check(PIXI: Pixi6Namespace, runtime: Pixi6Runtime): Checked {
    if (isAdapter(runtime)) {
        throw new Error(
            `createPixi6Engine: ${named(runtime as unknown as Pixi6Adapter)} is bound already: ` +
                'pass the runtime itself, from pixiSpineModular or discoverGlobalRuntimes, for the ' +
                'engine to bind to its PIXI and its asset cache',
        );
    }

    const info = infoOf(runtime);

    if (!runsOnPixi6(info)) {
        throw new Error(
            `createPixi6Engine: ${named(info)} does not run on Pixi 6, which draws Spine with @pixi-spine/* 3.x`,
        );
    }
    if (!drawsOn(PIXI, runtime)) throw builtAgainstAnother(PIXI, named(info));

    return runtime as Checked;
}

const byMinor = (a: Pixi6Runtime, b: Pixi6Runtime) =>
    compareMinors(infoOf(a).minor, infoOf(b).minor);

/**
 * The runtimes given, each checked; or the first of each minor the page loaded for this PIXI,
 * the rest passed over.
 */
function pixi6Runtimes(
    PIXI: Pixi6Namespace,
    given: readonly Pixi6Runtime[] | undefined,
    warn: (message: string) => void,
): Checked[] {
    if (given) return given.map((runtime) => check(PIXI, runtime)).sort(byMinor);

    const kept = new Map<string, PixiSpineRuntime>();

    discoverGlobalRuntimes(globalThis)
        .filter(
            (runtime): runtime is PixiSpineRuntime =>
                runsOnPixi6(runtime.info) && drawsOn(PIXI, runtime),
        )
        .forEach((runtime) => {
            const { minor } = runtime.info;
            const first = kept.get(minor);

            if (first) {
                warn(
                    `createPixi6Engine reads Spine ${minor} with ${named(first.info)}, the first ` +
                        `the page loaded, and leaves ${named(runtime.info)} out`,
                );
            } else {
                kept.set(minor, runtime);
            }
        });

    return [...kept.values()].sort(byMinor);
}

/**
 * `readSkeletonFromAssets` over every runtime of the engine: a skeleton a game's loader read is
 * taken as it is, and any other is read like `readSkeleton` reads it, its pages from the asset cache.
 */
function assetReader(
    spine: SpinePort<Pixi6Types>,
    assets: LegacyAssetsRegistry,
): SpinePort<Pixi6Types>['readSkeletonFromAssets'] {
    const pagesOf = (atlasAlias: string | undefined) =>
        new Proxy({} as Record<string, LegacyTexture>, {
            get: (_, page) =>
                typeof page === 'string' ? assets.pageTexture(page, atlasAlias) : undefined,
        });

    return (skeletonAlias, atlasAlias) => {
        const ready = assets.resource(skeletonAlias)?.spineData;

        if (ready) {
            if (!spine.runtimeOf(ready)) {
                throw new Error(
                    `"${skeletonAlias}" was read by a Spine runtime this engine does not have`,
                );
            }
            return ready;
        }

        const source = assets.get<SkeletonSource>(skeletonAlias);
        if (!source) throw new Error(`No skeleton loaded as "${skeletonAlias}"`);

        const atlasText = atlasAlias ? assets.get<unknown>(atlasAlias) : '';
        if (typeof atlasText !== 'string') throw new Error(`No atlas loaded as "${atlasAlias}"`);

        return spine.readSkeleton(source, atlasText, pagesOf(atlasAlias), { file: skeletonAlias });
    };
}

/**
 * The engine over a pixi.js 6 namespace: the legacy display, text, assets and particles ports, and
 * one Spine port over `@pixi-spine/*` 3.x runtimes, each skeleton read by the runtime of its export
 * minor (`pickRuntime`) and every later call on it reaching that runtime.
 *
 * `PIXI` is typed by its version alone: pixi.js 6's own declarations do not fit the structural
 * types the ports read it by.
 */
export function createPixi6Engine(
    pixi: { readonly VERSION: string },
    {
        runtimes,
        particles,
        pin,
        warn = (message) => console.warn(message),
        ...options
    }: Pixi6EngineOptions = {},
): Pixi6Engine {
    if (parseInt(pixi.VERSION, 10) !== 6) {
        throw new Error(`createPixi6Engine: PIXI is ${pixi.VERSION}, not Pixi 6`);
    }

    const PIXI = pixi as Pixi6Namespace;

    const chosen = pixi6Runtimes(PIXI, runtimes, warn);
    if (!chosen.length) {
        throw new Error(
            'createPixi6Engine: no Spine runtime for Pixi 6. Pass `runtimes`, or load @pixi-spine/* 3.x first',
        );
    }

    const emitters = particles ?? PIXI.particles;
    if (emitters && !particlesDrawOn(PIXI, emitters)) {
        throw builtAgainstAnother(PIXI, 'the particles library');
    }

    const namespace: LegacyNamespace = particles
        ? Object.create(PIXI, { particles: { value: particles } })
        : PIXI;
    const ports = createLegacyPorts<Pixi6Spine>(namespace, { ...options, spine: () => spine });
    const host = { PIXI, assets: ports.assets, pin, warn };

    const bind = (checked: PixiSpineRuntime) => pixiSpineAdapters<Pixi6Types>([checked], host)[0];

    const unbound = chosen.filter((runtime): runtime is PixiSpineRuntime => !isLazy(runtime));
    const bound = pixiSpineAdapters<Pixi6Types>(unbound, host);

    const spine: SpinePort<Pixi6Types> = createCompositeSpinePort<Pixi6Types>(
        chosen.map((runtime): Pixi6Adapter | LazySpineRuntimeAdapter<Pixi6Types> =>
            isLazy(runtime)
                ? lazyRuntime(runtime, async () =>
                      bind(check(PIXI, await runtime()) as PixiSpineRuntime),
                  )
                : bound[unbound.indexOf(runtime)],
        ),
        { pin, warn },
    );
    spine.readSkeletonFromAssets = assetReader(spine, ports.assets);

    return {
        name: 'pixi6',
        spine,
        display: ports.display as DisplayPort<Pixi6Types>,
        text: ports.text as TextPort<Pixi6Types>,
        assets: ports.assets,
        ...(ports.particles && { particles: ports.particles as ParticlesPort<Pixi6Types> }),
    };
}

export type * from './types';
