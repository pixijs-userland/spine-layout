import { Assets, Cache, ExtensionType, extensions } from 'pixi.js';
import { skeletonVersion } from '../../core/utils/skeletonVersion';
import { pickRuntime, type RuntimePin } from '../../core/versions/pickRuntime';
import { RUNTIME_MATRIX } from '../../core/versions/runtimeMatrix';
import type {
    Engine,
    LazySpineRuntimeAdapter,
    SpineRuntimeAdapter,
    SpineRuntimeInfo,
} from '../../engine/Engine';
import { isBinarySkeleton, type SkeletonSource } from '../../engine/runtime';
import {
    coreShimFor,
    createEsotericSpinePort,
    createV8Display,
    deferSpinePipe,
    esotericRuntime,
    type EsotericMinor,
    type EsotericModule,
    type EsotericRuntime,
    type PixiV8Like,
} from '../esoteric';
import { createCompositeSpinePort } from '../shared/compositeSpinePort';
import { assetsPort } from './assets.port';
import { createDisplayPort } from './display.port';
import { textPort } from './text.port';
import type { Pixi8Spine, Pixi8Types } from './types';

/** A spine-pixi-v8 runtime loaded once an export first needs it, by `SpinePort.prepare`. */
export interface LazyEsotericRuntime {
    readonly minor: EsotericMinor;
    /** `() => import('spine-pixi-v8-42')`, written in the game's own code. */
    load(): Promise<EsotericModule | EsotericRuntime>;
}

type Pixi8Adapter = SpineRuntimeAdapter<Pixi8Types<Pixi8Spine>>;
type LazyPixi8Adapter = LazySpineRuntimeAdapter<Pixi8Types<Pixi8Spine>>;

export type Pixi8Runtime = EsotericRuntime | LazyEsotericRuntime | Pixi8Adapter | LazyPixi8Adapter;

export interface Pixi8EngineOptions {
    /** The Spine runtimes a skeleton is read by: the one its export version picks. */
    runtimes: readonly Pixi8Runtime[];
    /**
     * The runtime a project's game reads an export minor with, where it is another minor's;
     * under `'*'`, the one it reads the exports that name no version with.
     */
    pin?: RuntimePin;
    /** Where a skeleton read by a runtime other than its own is reported. */
    warn?: (message: string) => void;
}

const pixi: PixiV8Like = { Assets, Cache, extensions, ExtensionType };

const OWN_CLASSES = [
    'SkeletonData',
    'Spine',
    'Skeleton',
    'Bone',
    'Slot',
    'Animation',
    'RegionAttachment',
    'MeshAttachment',
    'BoundingBoxAttachment',
    'ClippingAttachment',
    'PathAttachment',
    'PointAttachment',
];

type Class = abstract new (...args: never[]) => unknown;

const isRuntime = (loaded: EsotericModule | EsotericRuntime): loaded is EsotericRuntime =>
    'module' in loaded && 'info' in loaded;

const everyMinorTo = (minor: string): RuntimePin => new Proxy({}, { get: () => minor });

function refuseOtherPixi(runtime: SpineRuntimeInfo): void {
    if (RUNTIME_MATRIX[8][runtime.minor]?.packageName === runtime.packageName) return;

    throw new Error(
        `createPixi8Engine takes spine-pixi-v8 runtimes; this is ${runtime.packageName} ${runtime.minor}`,
    );
}

const lazy = (
    { minor, family, packageName, packageVersion }: SpineRuntimeInfo,
    load: () => Promise<Pixi8Adapter>,
): LazyPixi8Adapter => Object.assign(load, { minor, family, packageName, packageVersion });

/**
 * A spine-pixi-v8 runtime bound to pixi.js: its render pipe registered, a port that reads what
 * the engine routes to it as its own minor, and the classes that tell its objects.
 */
function bindV8(
    runtime: EsotericRuntime,
    pin: RuntimePin | undefined,
    warn: ((message: string) => void) | undefined,
): Pixi8Adapter {
    refuseOtherPixi(runtime.info);

    const { module: SP, info } = runtime;
    const core = coreShimFor(SP);
    const display = createV8Display(SP, pixi);
    const port = createEsotericSpinePort<Pixi8Types<Pixi8Spine>>({
        SP,
        core,
        display,
        runtime: info,
        pin,
        warn,
    });
    const reader = createEsotericSpinePort<Pixi8Types<Pixi8Spine>>({
        SP,
        core,
        display,
        runtime: info,
        pin: everyMinorTo(info.minor),
        warn: () => {},
    });
    const classes = OWN_CLASSES.map(
        (name) => (SP as unknown as Record<string, unknown>)[name],
    ).filter((value): value is Class => typeof value === 'function');

    return {
        ...info,
        port: { ...port, readSkeleton: reader.readSkeleton },
        owns: (object) => classes.some((owner) => object instanceof owner),
        readsBinary: true,
    };
}

/**
 * The engine over pixi.js v8 and the spine-pixi-v8 runtimes given, 4.2 and 4.3 side by side,
 * each rendering through a pipe of its own. Create it before the renderer: a lazy runtime's pipe
 * is reserved here, so a renderer started in between builds it.
 *
 * A skeleton in the asset cache is read by the runtime its export version picks, as one read
 * from its source is: on Pixi 8 the runtimes' loaders do not clash, and each runtime adopts an
 * atlas another one's loader parsed.
 */
export function createPixi8Engine({
    runtimes,
    pin,
    warn,
}: Pixi8EngineOptions): Engine<Pixi8Types<Pixi8Spine>> {
    const bound = new Map<string, Pixi8Adapter>();

    const keep = (adapter: Pixi8Adapter): Pixi8Adapter => {
        refuseOtherPixi(adapter);
        bound.set(adapter.minor, adapter);
        return adapter;
    };
    const bind = (loaded: EsotericModule | EsotericRuntime) =>
        keep(bindV8(isRuntime(loaded) ? loaded : esotericRuntime(loaded), pin, warn));

    function adapterOf(runtime: Pixi8Runtime): Pixi8Adapter | LazyPixi8Adapter {
        if (typeof runtime === 'function') {
            refuseOtherPixi(runtime);
            deferSpinePipe(pixi, runtime.minor as EsotericMinor);
            return lazy(runtime, async () => keep(await runtime()));
        }
        if ('port' in runtime) return keep(runtime);
        if ('module' in runtime) return bind(runtime);

        deferSpinePipe(pixi, runtime.minor);
        return lazy({ minor: runtime.minor, ...RUNTIME_MATRIX[8][runtime.minor] }, async () =>
            bind(await runtime.load()),
        );
    }

    const spine = createCompositeSpinePort(runtimes.map(adapterOf), { pin, warn });
    const { readSkeletonFromAssets: readWithOnlyRuntime } = spine;

    function loaded(minor: string): Pixi8Adapter {
        const adapter = bound.get(minor);
        if (!adapter) {
            throw new Error(
                `The Spine ${minor} runtime has not loaded: await prepare(['${minor}']) first`,
            );
        }
        return adapter;
    }

    function readerOf(skeletonAlias: string): Pixi8Adapter {
        const source = Assets.get<SkeletonSource | undefined>(skeletonAlias);
        if (source === undefined || source === null) {
            throw new Error(`No skeleton loaded as "${skeletonAlias}"`);
        }

        // the runtime's port picks again, with the same pin, and reports a cross-read itself
        const { runtime } = pickRuntime(skeletonVersion(source), spine.runtimes, pin, {
            file: skeletonAlias,
            binary: isBinarySkeleton(source),
        });
        return loaded(runtime.minor);
    }

    spine.readSkeletonFromAssets = (skeletonAlias, atlasAlias) =>
        spine.runtimes.length === 1
            ? readWithOnlyRuntime(skeletonAlias, atlasAlias)
            : readerOf(skeletonAlias).port.readSkeletonFromAssets(skeletonAlias, atlasAlias);

    return {
        name: 'pixi8',
        spine,
        display: createDisplayPort(spine),
        text: textPort,
        assets: assetsPort,
    };
}
