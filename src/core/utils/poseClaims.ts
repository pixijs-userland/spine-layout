import type { PoseClaimEntry, PoseHold } from '../../engine/Engine';
import type { AnimationLike, SkeletonDataLike } from '../../engine/runtime';

/**
 * The set of skeleton properties an animation writes — its *claim* on the skeleton.
 *
 * Entries are the runtime's own property labels (`PoseClaimEntry.id`), the same labels
 * `AnimationState` uses internally to decide which timelines compete across tracks. Comparing
 * claims is therefore comparing exactly what the runtime considers a conflict — per property,
 * not per bone: an animation that only moves a bone does not collide with one that only fades
 * that bone's slot.
 */
export type PoseClaim = ReadonlySet<string>;

/**
 * An animation's claim, what each of its properties belongs to — for putting them back — and
 * the value it holds a property at throughout, where it keys only one.
 */
export type AnimationClaim = {
    ids: PoseClaim;
    holds: ReadonlyMap<string, PoseHold>;
    entries: Exclude<PoseClaimEntry, { kind: 'event' }>[];
};

/** An animation with no pose timelines at all — a bare event trigger. */
export const EMPTY_CLAIM: AnimationClaim = {
    ids: new Set<string>(),
    holds: new Map(),
    entries: [],
};

/**
 * One step of an 8-bit colour channel. Exports quantise colours to it, so one animation can
 * key an alpha of `fe` where another keys `ff` for the same intent.
 */
const HOLD_TOLERANCE = 1 / 255 + 1e-6;

/**
 * Claims are a property of the skeleton *data*, not of an instance, so they are computed
 * once per export and shared by every spine built from it — 25 symbol instances of one
 * skeleton walk their timelines once between them.
 */
const cache = new WeakMap<SkeletonDataLike, Map<string, AnimationClaim>>();

/**
 * Event timelines fire sounds and callbacks; they pose nothing. Left in, they would make
 * every animation carrying an event look like it competes with every other one for the
 * same "property", collapsing unrelated animations onto a single track.
 */
function claimOf(
    animation: AnimationLike,
    classify: (animation: AnimationLike) => PoseClaimEntry[],
): AnimationClaim {
    const byId = new Map<string, AnimationClaim['entries'][number]>();
    const holds = new Map<string, PoseHold>();
    const varies = new Set<string>();

    classify(animation).forEach((entry) => {
        if (entry.kind === 'event') return;
        if (!byId.has(entry.id)) byId.set(entry.id, entry);

        // two timelines on one property hold it only if both hold the same value
        const held = holds.get(entry.id);
        if (!entry.hold || (held && !sameHold(held, entry.hold))) varies.add(entry.id);
        else holds.set(entry.id, entry.hold);
    });
    varies.forEach((id) => holds.delete(id));

    return { ids: new Set(byId.keys()), holds, entries: [...byId.values()] };
}

function sameHold(a: PoseHold | undefined, b: PoseHold | undefined): boolean {
    if (!a || !b || a.length !== b.length) return false;

    return a.every((value, i) => {
        const other = b[i];
        if (typeof value === 'number' && typeof other === 'number') {
            return Math.abs(value - other) <= HOLD_TOLERANCE;
        }
        return value === other;
    });
}

/** Every animation's claim, keyed by animation name. */
export function poseClaims(
    data: SkeletonDataLike,
    classify: (animation: AnimationLike) => PoseClaimEntry[],
): Map<string, AnimationClaim> {
    let claims = cache.get(data);

    if (!claims) {
        claims = new Map(
            data.animations.map((animation) => [animation.name, claimOf(animation, classify)]),
        );
        cache.set(data, claims);
    }

    return claims;
}

/**
 * Whether two animations compete for the same skeleton properties, i.e. whether one playing
 * above the other would override it. A property both hold at the same value is no contest:
 * the pose is the same whichever applies last.
 *
 * Two animations that pose *nothing* are treated as colliding: neither has anything to
 * protect, and letting each take a fresh track would grow the track list for the life of
 * the session (a bet-change event animation plays on every press).
 */
export function claimsCollide(a: AnimationClaim, b: AnimationClaim): boolean {
    if (a.ids.size === 0 || b.ids.size === 0) return a.ids.size === 0 && b.ids.size === 0;

    const [small, large] = a.ids.size <= b.ids.size ? [a, b] : [b, a];
    for (const id of small.ids) {
        if (large.ids.has(id) && !sameHold(small.holds.get(id), large.holds.get(id))) return true;
    }

    return false;
}
