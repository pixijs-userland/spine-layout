import { skeletonVersion } from '../../core/utils/skeletonVersion';
import { pickRuntime, type RuntimePick, type RuntimePin } from '../../core/versions/pickRuntime';
import { applyPrePasses } from '../../core/versions/prePasses';
import type {
    EngineTypes,
    LazySpineRuntimeAdapter,
    SpinePort,
    SpineRuntimeAdapter,
    SpineRuntimeInfo,
} from '../../engine/Engine';
import { UnsupportedSpineVersionError } from '../../engine/errors';
import { isBinarySkeleton, type SkeletonSource } from '../../engine/runtime';

export interface CompositeSpinePortOptions {
    /** The runtime a project's game reads an export minor with, where it is another minor's. */
    pin?: RuntimePin;
    /** Where a skeleton read by a runtime other than its own is reported. */
    warn?: (message: string) => void;
}

interface Registered<T extends EngineTypes> {
    info: SpineRuntimeInfo;
    adapter?: SpineRuntimeAdapter<T>;
    load?: () => Promise<SpineRuntimeAdapter<T>>;
    loading?: Promise<void>;
}

const infoOf = ({ minor, family, packageName, packageVersion }: SpineRuntimeInfo) => ({
    minor,
    family,
    packageName,
    packageVersion,
});

function register<T extends EngineTypes>(
    runtime: SpineRuntimeAdapter<T> | LazySpineRuntimeAdapter<T>,
): Registered<T> {
    if (typeof runtime.minor !== 'string') {
        throw new Error(
            'A Spine runtime adapter names its runtime: minor, family, packageName and packageVersion',
        );
    }

    return typeof runtime === 'function'
        ? { info: infoOf(runtime), load: runtime }
        : { info: infoOf(runtime), adapter: runtime };
}

/**
 * The SpinePort of an engine over several Spine runtimes. A skeleton is read by the runtime
 * `pickRuntime` gives its export version, after that pick's pre-passes; every other call goes to
 * the runtime that `owns` its argument. Over a single runtime those calls go to it unchecked, and
 * only then is `readSkeletonFromAssets` served. `prepare` exists where a runtime is lazy, and
 * loads the ones the given export minors need; a minor no runtime reads loads nothing, and each of
 * its skeletons is refused as it is read.
 */
export function createCompositeSpinePort<T extends EngineTypes = EngineTypes>(
    adapters: readonly (SpineRuntimeAdapter<T> | LazySpineRuntimeAdapter<T>)[],
    { pin, warn = (message) => console.warn(message) }: CompositeSpinePortOptions = {},
): SpinePort<T> {
    if (!adapters.length) throw new Error('createCompositeSpinePort: no Spine runtime given');

    const entries = adapters.map(register);
    let runtimes = entries.map((entry) => entry.info);

    entries.forEach(({ info }, i) => {
        const other = entries.findIndex((entry) => entry.info.minor === info.minor);
        if (other !== i) {
            const named = [entries[other].info, info].map(
                (runtime) => `${runtime.packageName}@${runtime.packageVersion}`,
            );
            throw new Error(`Two runtimes read Spine ${info.minor}: ${named.join(' and ')}`);
        }
    });

    const single = entries.length === 1 ? entries[0] : undefined;
    const entryOf = (runtime: SpineRuntimeInfo) => entries.find((entry) => entry.info === runtime)!;

    function adapterOf(entry: Registered<T>): SpineRuntimeAdapter<T> {
        if (!entry.adapter) {
            throw new Error(
                `The Spine ${entry.info.minor} runtime has not loaded: await prepare(['${entry.info.minor}']) first`,
            );
        }
        return entry.adapter;
    }

    const ownerOf = (object: unknown) => entries.find((entry) => entry.adapter?.owns(object));

    function portOf(object: unknown, what: string): SpinePort<T> {
        if (single) return adapterOf(single).port;

        const owner = ownerOf(object);
        if (!owner) throw new Error(`No Spine runtime of this engine made this ${what}`);
        return owner.adapter!.port;
    }

    function load(entry: Registered<T>): Promise<void> {
        if (entry.adapter) return Promise.resolve();

        entry.loading ??= entry.load!().then(
            (adapter) => {
                if (adapter.minor !== entry.info.minor) {
                    throw new Error(
                        `The lazy Spine ${entry.info.minor} runtime loaded one of Spine ${adapter.minor}`,
                    );
                }
                entry.adapter = adapter;
                entry.info = infoOf(adapter);
                runtimes = entries.map(({ info }) => info);
            },
            (error) => {
                entry.loading = undefined;
                throw error;
            },
        );

        return entry.loading;
    }

    function pickFor(source: SkeletonSource, file?: string): RuntimePick {
        const binary = isBinarySkeleton(source);
        const jsonOnly = binary
            ? entries.filter((entry) => entry.adapter?.readsBinary === false)
            : [];
        const readers = entries.filter((entry) => !jsonOnly.includes(entry));

        try {
            return pickRuntime(
                skeletonVersion(source),
                readers.map((entry) => entry.info),
                pin,
                { file, binary },
            );
        } catch (error) {
            if (!(error instanceof UnsupportedSpineVersionError) || !jsonOnly.length) throw error;

            throw new UnsupportedSpineVersionError({
                file,
                version: error.version,
                registered: runtimes.map(({ minor }) => minor),
                pixiMajors: error.pixiMajors,
                jsonOnly: jsonOnly.map(({ info }) => info.minor),
            });
        }
    }

    async function prepare(minors: string[]): Promise<void> {
        const needed = new Set<Registered<T>>();

        for (const minor of minors) {
            try {
                needed.add(entryOf(pickRuntime(minor, runtimes, pin).runtime));
            } catch (error) {
                if (!(error instanceof UnsupportedSpineVersionError)) throw error;
            }
        }

        await Promise.all([...needed].map(load));
    }

    return {
        get runtimes() {
            return runtimes;
        },
        runtimeOf: (spineOrData) => ownerOf(spineOrData)?.info,
        ...(entries.some((entry) => entry.load) && { prepare }),

        readSkeleton(source, atlasText, textures, { file } = {}) {
            const pick = pickFor(source, file);

            if (pick.warning) warn(pick.warning);

            return adapterOf(entryOf(pick.runtime)).port.readSkeleton(
                applyPrePasses(source, pick.prePasses),
                atlasText,
                textures,
                { file },
            );
        },

        readSkeletonFromAssets(skeletonAlias, atlasAlias) {
            if (!single) {
                throw new Error(
                    `readSkeletonFromAssets reads with an engine's one Spine runtime, and this one has ` +
                        `${entries.length} (${runtimes.map(({ minor }) => minor).join(', ')}): read ` +
                        `each skeleton with readSkeleton, from its source, atlas text and page textures`,
                );
            }
            return adapterOf(single).port.readSkeletonFromAssets(skeletonAlias, atlasAlias);
        },

        create: (data) => portOf(data, 'skeleton data').create(data),
        update: (spine, dt) => portOf(spine, 'spine').update(spine, dt),

        bonePose: (bone) => portOf(bone, 'bone').bonePose(bone),
        boneSetup: (bone) => portOf(bone, 'bone').boneSetup(bone),
        slotAttachment: (slot) => portOf(slot, 'slot').slotAttachment(slot),
        slotAlpha: (slot) => portOf(slot, 'slot').slotAlpha(slot),
        setupPose: (skeleton, scope) => portOf(skeleton, 'skeleton').setupPose(skeleton, scope),
        boneToSetup: (bone) => portOf(bone, 'bone').boneToSetup(bone),
        slotToSetup: (slot) => portOf(slot, 'slot').slotToSetup(slot),
        constraintToSetup: (skeleton, index) =>
            portOf(skeleton, 'skeleton').constraintToSetup(skeleton, index),
        updateWorldTransform: (skeleton) =>
            portOf(skeleton, 'skeleton').updateWorldTransform(skeleton),
        drawOrder: (skeleton) => portOf(skeleton, 'skeleton').drawOrder(skeleton),

        claimOf: (animation, data) => portOf(data, 'skeleton data').claimOf(animation, data),

        beforeWorldTransforms: (spine, hook) =>
            portOf(spine, 'spine').beforeWorldTransforms(spine, hook),
        onUpdate: (spine, hook) => portOf(spine, 'spine').onUpdate(spine, hook),

        hitPolygon: (slot, attachment) => portOf(slot, 'slot').hitPolygon(slot, attachment),
        regionTexture(attachment, slot) {
            const owner = single
                ? adapterOf(single)
                : (ownerOf(attachment) ?? (slot && ownerOf(slot)))?.adapter;

            return owner ? owner.port.regionTexture(attachment, slot) : null;
        },

        shieldShapes: (spine) => portOf(spine, 'spine').shieldShapes(spine),
        exposeShapes: (spine) => portOf(spine, 'spine').exposeShapes(spine),

        attachSlotObject: (spine, slotName, child) =>
            portOf(spine, 'spine').attachSlotObject(spine, slotName, child),
        getSlotObject: (spine, slotName) => portOf(spine, 'spine').getSlotObject(spine, slotName),
        detachSlotObject: (spine, slotOrChild) =>
            portOf(spine, 'spine').detachSlotObject(spine, slotOrChild),
        syncSlotObjectsWithDrawOrder: (spine) =>
            portOf(spine, 'spine').syncSlotObjectsWithDrawOrder(spine),
    };
}
