import { parcePointers } from '../config/parcePointers';

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
 *    instance `<id>_<n>`, later auto-attached to its own slot by `SceneController`.
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
 * `reel` template has become five reels. A counted pool or shared child is therefore held
 * back until none of the spines carrying its slots are still pending expansion. Named
 * pointers take priority and are order-independent (each pointer is unique), so they
 * expand first each round.
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

    // Named pointers (`spine_<base>_<n>`): base id -> ordered distinct instance ids.
    const collectNamed = (): Map<string, string[]> => {
        const named = new Map<string, Set<string>>();
        registry.forEach((slots) => {
            slots.forEach((name) => {
                if (!name.startsWith(prefix)) return;

                const instanceID = name.slice(prefix.length); // e.g. "reel_1"
                const match = instanceID.match(/^(.+)_\d+$/);
                if (!match) return;

                const baseID = match[1]; // e.g. "reel"
                if (!registry.has(baseID)) return; // not a known spine export

                const ids = named.get(baseID) ?? new Set<string>();
                ids.add(instanceID);
                named.set(baseID, ids);
            });
        });
        return new Map([...named].map(([baseID, ids]) => [baseID, [...ids]]));
    };

    // Counted pointers (`spine_<base><n>`): base id -> the spine ids carrying each match.
    const collectCounted = (): Map<string, string[]> => {
        const counted = new Map<string, string[]>();
        registry.forEach((slots, containerID) => {
            slots.forEach((name) => {
                if (!name.startsWith(prefix)) return;

                const pointer = name.slice(prefix.length); // e.g. "symbol0"
                if (registry.has(pointer)) return; // points at a real spine -> single attach

                const match = pointer.match(/^(.+?)(\d+)$/);
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
        if (named.size > 0) {
            named.forEach((instanceIDs, baseID) => expand(baseID, instanceIDs));
            continue;
        }

        const counted = collectCounted();
        const shared = collectShared();
        // Only expand once every spine carrying the slots is final — i.e. not itself a
        // template that will still multiply (and thereby grow this pool / add carriers).
        const isPending = (id: string) => counted.has(id) || shared.has(id);
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
