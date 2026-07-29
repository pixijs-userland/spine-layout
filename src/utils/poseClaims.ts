import { Property, type Animation, type SkeletonData } from '@esotericsoftware/spine-pixi-v8';

/**
 * The set of skeleton properties an animation writes — its *claim* on the skeleton.
 *
 * Entries are the runtime's own `Timeline.propertyIds`: `"<Property>|<bone or slot index>"`,
 * the same labels `AnimationState` uses internally to decide which timelines compete across
 * tracks. Comparing claims is therefore comparing exactly what the runtime considers a
 * conflict — per property, not per bone: an animation that only moves a bone does not
 * collide with one that only fades that bone's slot.
 */
export type PoseClaim = ReadonlySet<string>;

/** An animation with no pose timelines at all — a bare event trigger. */
export const EMPTY_CLAIM: PoseClaim = new Set<string>();

/**
 * Event timelines fire sounds and callbacks; they pose nothing. Left in, they would make
 * every animation carrying an event look like it competes with every other one for the
 * same "property", collapsing unrelated animations onto a single track.
 */
const EVENT_PROPERTY_ID = `${Property.event}`;

/**
 * Claims are a property of the skeleton *data*, not of an instance, so they are computed
 * once per export and shared by every spine built from it — 25 symbol instances of one
 * skeleton walk their timelines once between them.
 */
const cache = new WeakMap<SkeletonData, Map<string, PoseClaim>>();

function claimOf(animation: Animation): PoseClaim {
    const claim = new Set<string>();

    animation.timelines?.forEach((timeline) =>
        timeline.propertyIds?.forEach((id) => {
            if (id !== EVENT_PROPERTY_ID) claim.add(id);
        }),
    );

    return claim;
}

/** Every animation's claim, keyed by animation name. */
export function poseClaims(data: SkeletonData): Map<string, PoseClaim> {
    let claims = cache.get(data);

    if (!claims) {
        claims = new Map(data.animations.map((animation) => [animation.name, claimOf(animation)]));
        cache.set(data, claims);
    }

    return claims;
}

/**
 * Whether two animations compete for the same skeleton properties, i.e. whether one playing
 * above the other would override it.
 *
 * Two animations that pose *nothing* are treated as colliding: neither has anything to
 * protect, and letting each take a fresh track would grow the track list for the life of
 * the session (a bet-change event animation plays on every press).
 */
export function claimsCollide(a: PoseClaim, b: PoseClaim): boolean {
    if (a.size === 0 || b.size === 0) return a.size === 0 && b.size === 0;

    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const id of small) if (large.has(id)) return true;

    return false;
}
