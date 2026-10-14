import type { RuntimePin } from '../core/versions/pickRuntime';
import type {
    EngineTypes,
    LazySpineRuntimeAdapter,
    SpinePort,
    SpineRuntimeAdapter,
    SpineRuntimeInfo,
} from '../engine/Engine';
import {
    coreShimFor,
    createEsotericSpinePort,
    createV7Display,
    createV8Display,
    type EsotericRuntime,
    type EsotericTypes,
    type PixiV7Like,
    type PixiV8Like,
} from '../engines/esoteric';
import {
    createPixiSpinePort,
    setFromMatrixHolder,
    transformBaseHolder,
    type PixiSpineAssets,
    type PixiSpineDisplayClasses,
    type PixiSpineRuntime,
    type PixiSpineTexture,
    type PixiSpineTransform,
    type PixiSpineTypes,
    type SlotHolderTransform,
} from '../engines/pixiSpine';

/** A runtime its caller imported, before an engine binds it to the Pixi it renders on. */
export type SpineRuntime = EsotericRuntime | PixiSpineRuntime;

export interface RuntimeAdapterOptions {
    /**
     * The runtime a project's game reads an export minor with, for the one read the adapter's
     * port picks a runtime for itself: `readSkeletonFromAssets`, on an engine of this runtime alone.
     */
    pin?: RuntimePin;
    /** Where that read, by a runtime other than the export's own, is reported. */
    warn?: (message: string) => void;
}

export type PixiSpinePixi = PixiSpineDisplayClasses & {
    VERSION: string;
    TransformBase?: new () => PixiSpineTransform;
};

export interface PixiSpineHost extends RuntimeAdapterOptions {
    /** The Pixi the runtimes render on. */
    PIXI: PixiSpinePixi;
    /** The engine's asset cache, for `readSkeletonFromAssets`. */
    assets: PixiSpineAssets<PixiSpineTexture>;
    /** By default `TransformBase` on Pixi 4 and `setFromMatrix` on 5 to 7. */
    holderTransform?: SlotHolderTransform;
}

export interface RuntimeHost extends RuntimeAdapterOptions {
    PIXI: object;
    /** Needed by pixi-spine runtimes. */
    assets?: PixiSpineAssets<PixiSpineTexture>;
    holderTransform?: SlotHolderTransform;
}

const ESOTERIC_CLASSES = [
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

const PIXI_SPINE_CLASSES = ESOTERIC_CLASSES.filter((name) => name !== 'Spine');

type Class = abstract new (...args: never[]) => unknown;

function ownsAny(namespace: object, names: readonly string[]): (object: unknown) => boolean {
    const classes = names
        .map((name) => (namespace as Record<string, unknown>)[name])
        .filter((value): value is Class => typeof value === 'function');

    return (object) => classes.some((owner) => object instanceof owner);
}

/** Sends every export minor to `minor`: the port reads as given what the engine routed to it. */
const everyMinorTo = (minor: string): RuntimePin => new Proxy({}, { get: () => minor });

const isEsoteric = (runtime: SpineRuntime): runtime is EsotericRuntime => 'module' in runtime;

/**
 * An Esoteric runtime (spine-pixi-v7 or v8, from `esotericRuntime`) bound to the Pixi it renders
 * on, `pixi.js`'s namespace. On v8 this registers the runtime's render pipe: do it before the
 * renderer starts, or the pipe is added when the renderer first meets one of its spines.
 */
export function esotericAdapter<T extends EngineTypes = EsotericTypes>(
    runtime: EsotericRuntime,
    pixi: PixiV8Like | PixiV7Like,
    { pin, warn }: RuntimeAdapterOptions = {},
): SpineRuntimeAdapter<T> {
    const { module: SP, info } = runtime;
    const core = coreShimFor(SP);
    const display =
        runtime.pixi === 8
            ? createV8Display(SP, pixi as PixiV8Like)
            : createV7Display(SP, pixi as PixiV7Like);
    const port = createEsotericSpinePort<T>({ SP, core, display, runtime: info, pin, warn });
    const reader = createEsotericSpinePort<T>({
        SP,
        core,
        display,
        runtime: info,
        pin: everyMinorTo(info.minor),
        warn: () => {},
    });

    return {
        ...info,
        port: { ...port, readSkeleton: reader.readSkeleton },
        owns: ownsAny(SP, ESOTERIC_CLASSES),
        readsBinary: true,
    };
}

const holderFor = (PIXI: PixiSpinePixi): SlotHolderTransform =>
    PIXI.VERSION.startsWith('4.') && PIXI.TransformBase
        ? transformBaseHolder({ TransformBase: PIXI.TransformBase })
        : setFromMatrixHolder;

/**
 * pixi-spine runtimes (`pixiSpineLegacy`, `pixiSpineModular`) bound to the Pixi they render on,
 * one adapter each over one port.
 */
export function pixiSpineAdapters<T extends PixiSpineTypes = PixiSpineTypes>(
    runtimes: readonly PixiSpineRuntime[],
    { PIXI, assets, holderTransform = holderFor(PIXI), pin, warn }: PixiSpineHost,
): SpineRuntimeAdapter<T>[] {
    if (!runtimes.length) return [];

    const port = createPixiSpinePort<T>({
        PIXI,
        runtimes,
        holderTransform,
        assets: assets as PixiSpineAssets<T['Texture']>,
        pin,
        warn,
    });

    return runtimes.map(({ info, classes, Spine }) => {
        const ownsCore = ownsAny(classes, PIXI_SPINE_CLASSES);
        const readSkeleton: SpinePort<T>['readSkeleton'] = (source, atlasText, textures) =>
            port.readSkeletonWith(info, source, atlasText, textures);

        return {
            ...info,
            port: { ...port, readSkeleton },
            owns: (object) => object instanceof Spine || ownsCore(object),
            readsBinary: classes.SkeletonBinary !== undefined,
        };
    });
}

/**
 * Binds what `discoverGlobalRuntimes` found, or any mix of runtimes, to the Pixi they render on,
 * in the order given.
 */
export function runtimeAdapters<T extends EngineTypes = EngineTypes>(
    runtimes: readonly SpineRuntime[],
    { PIXI, assets, holderTransform, pin, warn }: RuntimeHost,
): SpineRuntimeAdapter<T>[] {
    const pixiSpine = runtimes.filter(
        (runtime): runtime is PixiSpineRuntime => !isEsoteric(runtime),
    );

    if (pixiSpine.length && !assets) {
        throw new Error('pixi-spine runtimes read assets through the engine: pass its assets port');
    }

    const bound = pixiSpineAdapters(pixiSpine, {
        PIXI: PIXI as PixiSpinePixi,
        assets: assets!,
        holderTransform,
        pin,
        warn,
    });

    return runtimes.map(
        (runtime) =>
            (isEsoteric(runtime)
                ? esotericAdapter(runtime, PIXI as PixiV8Like | PixiV7Like, { pin, warn })
                : bound[pixiSpine.indexOf(runtime)]) as unknown as SpineRuntimeAdapter<T>,
    );
}

/**
 * An adapter its caller loads on demand: `load` holds the `import()`, and `info` names the
 * runtime it loads, so the engine routes to it before it is loaded.
 */
export function lazyRuntime<T extends EngineTypes = EngineTypes>(
    { minor, family, packageName, packageVersion }: SpineRuntimeInfo,
    load: () => Promise<SpineRuntimeAdapter<T>>,
): LazySpineRuntimeAdapter<T> {
    return Object.assign(() => load(), { minor, family, packageName, packageVersion });
}
