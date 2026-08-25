import { parcePointers } from '../config/parcePointers';

/** `spine_reel_1`: a pointer naming one numbered instance of a base. */
const NAMED_INSTANCE = /^(.+)_\d+$/;
/** `spine_symbol0`: a pointer naming one slot of a pool, its number running with the name. */
const COUNTED_INSTANCE = /^(.+?)(\d+)$/;

/**
 * The spines a `spine_<pointer>` slot asks to be built: the skeleton it names outright, and —
 * for the numbered pointers {@link planMultipleInstances} expands — the base such an instance
 * is cloned from. A pointer at nothing that was loaded asks for nothing.
 *
 * This is what walking the scene from the root reads, so a skeleton reached only as a template
 * (`symbol`, behind five `spine_symbol0`…`spine_symbol4` slots) is built like any other.
 */
export function spinePointerBases(slotName: string, isKnown: (id: string) => boolean): string[] {
    const prefix = parcePointers.slot.spine;

    if (!slotName.startsWith(prefix)) return [];

    const pointer = slotName.slice(prefix.length);
    const named = pointer.match(NAMED_INSTANCE)?.[1];
    // A counted pointer that is itself a spine names that sibling rather than a pool.
    const counted = isKnown(pointer) ? undefined : pointer.match(COUNTED_INSTANCE)?.[1];

    return [...new Set([pointer, named, counted])].filter(
        (id): id is string => !!id && isKnown(id),
    );
}

/** A base spine and the names of the slots it declares, used to plan multiple instances. */
export type BaseSpineSlots = {
    id: string;
    slots: string[];
};

/** One expansion: the template `baseID` is removed and replaced by `instanceIDs`. */
export type InstanceGroup = {
    baseID: string;
    instanceIDs: string[];
};

/**
 * Plans how base spines that act as multiple-instance templates should be expanded.
 *
 * Three pointer conventions are recognised:
 *
 * 1. **Named** — `spine_<id>_<n>` (e.g. `spine_reel_1`). Each distinct pointer becomes one
 *    instance `<id>_<n>`, later auto-attached to its own slot by `SceneController`. A pointer
 *    that several spines carry — which is what a template's own named pointers become once the
 *    template has itself multiplied — is qualified by its carrier into `<id>_<n>_<parent>`, as
 *    in 3 below: five reels each declaring `spine_symbol_0`…`spine_symbol_4` need 25 symbols,
 *    not 5 shuffled between them.
 * 2. **Counted** — `spine_<id><n>` (a digit suffix with no separating underscore, e.g. a
 *    reel's `spine_symbol0`…`spine_symbol4`). The same slot names repeat across parents, so
 *    the pool size is the *total* number of matching slots across every spine; the produced
 *    instances are `<id>1`…`<id>N`.
 * 3. **Shared** — a plain `spine_<id>` pointer that more than one spine carries (e.g. every
 *    reel instance carrying `spine_anticipation`). A child can only live under one parent,
 *    so the base is multiplied into one `<id>_<parent>` instance per carrying spine, which
 *    `SceneController` then attaches to its own parent's slot. A plain pointer carried by a
 *    single spine stays a plain single attach.
 *
 * A pointer only expands a base when that base id is a known spine. A counted pointer is
 * additionally ignored when the full pointer is itself a known spine, since that means it
 * points at a real sibling for a plain single attach rather than naming a pool.
 *
 * Expansion is resolved to a fixed point so pools size correctly off parents that are
 * themselves multiplied: a reel's `spine_symbol*` slots only number 25 once the single
 * `reel` template has become five reels. Every expansion is therefore held back until none
 * of the spines carrying its pointers is still pending one; named pointers go first among
 * those that are ready.
 *
 * @returns the expansions in the order they must be applied.
 */
export function planMultipleInstances(bases: BaseSpineSlots[]): InstanceGroup[] {
    const prefix = parcePointers.slot.spine;

    // Working registry of id -> slot names, mutated as templates expand so later passes see
    // the multiplied parents (and their repeated slots) rather than the original templates.
    const registry = new Map<string, string[]>();
    bases.forEach((base) => registry.set(base.id, base.slots));

    const groups: InstanceGroup[] = [];
    const expand = (baseID: string, instanceIDs: string[]) => {
        const slots = registry.get(baseID) ?? [];
        groups.push({ baseID, instanceIDs });
        registry.delete(baseID);
        instanceIDs.forEach((instanceID) => registry.set(instanceID, slots));
    };

    // Named pointers (`spine_<base>_<n>`): base id -> each distinct pointer, with the spine
    // ids carrying it.
    const collectNamed = (): Map<string, Map<string, string[]>> => {
        const named = new Map<string, Map<string, string[]>>();
        registry.forEach((slots, containerID) => {
            slots.forEach((name) => {
                if (!name.startsWith(prefix)) return;

                const pointer = name.slice(prefix.length); // e.g. "reel_1"
                const match = pointer.match(NAMED_INSTANCE);
                if (!match) return;

                const baseID = match[1]; // e.g. "reel"
                if (!registry.has(baseID)) return; // not a known spine export

                const pointers = named.get(baseID) ?? new Map<string, string[]>();
                pointers.set(pointer, [...(pointers.get(pointer) ?? []), containerID]);
                named.set(baseID, pointers);
            });
        });
        return named;
    };

    // Counted pointers (`spine_<base><n>`): base id -> the spine ids carrying each match.
    const collectCounted = (): Map<string, string[]> => {
        const counted = new Map<string, string[]>();
        registry.forEach((slots, containerID) => {
            slots.forEach((name) => {
                if (!name.startsWith(prefix)) return;

                const pointer = name.slice(prefix.length); // e.g. "symbol0"
                if (registry.has(pointer)) return; // points at a real spine -> single attach

                const match = pointer.match(COUNTED_INSTANCE);
                if (!match) return;

                const baseID = match[1]; // e.g. "symbol"
                if (!registry.has(baseID)) return; // not a known spine export

                const containers = counted.get(baseID) ?? [];
                containers.push(containerID);
                counted.set(baseID, containers);
            });
        });
        return counted;
    };

    // Shared pointers (`spine_<base>`, no instance suffix): base id -> the spine ids
    // carrying the slot. Only multi-carrier bases are returned — a plain pointer on a
    // single spine is a regular single attach.
    const collectShared = (): Map<string, string[]> => {
        const shared = new Map<string, string[]>();
        registry.forEach((slots, containerID) => {
            slots.forEach((name) => {
                if (!name.startsWith(prefix)) return;

                const baseID = name.slice(prefix.length); // e.g. "anticipation"
                if (!registry.has(baseID)) return; // not a known spine export

                const containers = shared.get(baseID) ?? [];
                containers.push(containerID);
                shared.set(baseID, containers);
            });
        });
        return new Map([...shared].filter(([, containers]) => containers.length > 1));
    };

    for (;;) {
        const named = collectNamed();
        const counted = collectCounted();
        const shared = collectShared();
        // Only expand once every spine carrying the slots is final — i.e. not itself a
        // template that will still multiply (and thereby grow this pool / add carriers).
        const isPending = (id: string) =>
            named.has(id) || shared.has(id) || (counted.get(id)?.length ?? 0) > 1;

        const namedReady = [...named].filter(
            ([, pointers]) => ![...pointers.values()].flat().some(isPending),
        );

        if (namedReady.length > 0) {
            namedReady.forEach(([baseID, pointers]) => {
                const instanceIDs = [...pointers].flatMap(([pointer, carriers]) =>
                    carriers.length > 1
                        ? carriers.map((carrierID) => `${pointer}_${carrierID}`)
                        : [pointer],
                );
                expand(baseID, instanceIDs);
            });
            continue;
        }

        const countedReady = [...counted].filter(
            ([, containers]) => containers.length > 1 && !containers.some(isPending),
        );
        const sharedReady = [...shared].filter(
            ([, containers]) => !containers.some(isPending),
        );
        if (countedReady.length === 0 && sharedReady.length === 0) break;

        countedReady.forEach(([baseID, containers]) => {
            const instanceIDs = Array.from({ length: containers.length }, (_, i) => `${baseID}${i + 1}`);
            expand(baseID, instanceIDs);
        });
        sharedReady.forEach(([baseID, containers]) => {
            expand(baseID, containers.map((parentID) => `${baseID}_${parentID}`));
        });
    }

    return groups;
}
