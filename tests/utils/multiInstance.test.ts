import { describe, expect, it } from 'vitest';
import { planMultipleInstances, type BaseSpineSlots } from '../../src/utils/multiInstance';

/** Mirrors the slot-zombie-land layout: a `reels` parent with named reel pointers, a single
 *  `reel` template whose repeated `spine_symbol*` slots seed a 25-strong symbol pool. */
function zombieLandBases(): BaseSpineSlots[] {
    return [
        { id: 'root', slots: ['spine_bg', 'spine_reels', 'spine_ui'] },
        { id: 'reels', slots: ['spine_reel_1', 'spine_reel_2', 'spine_reel_3', 'spine_reel_4', 'spine_reel_5'] },
        { id: 'reel', slots: ['spine_symbol0', 'spine_symbol1', 'spine_symbol2', 'spine_symbol3', 'spine_symbol4'] },
        { id: 'symbol', slots: ['text_value'] },
        { id: 'bg', slots: [] },
        { id: 'ui', slots: ['button_spin', 'text_balance'] },
    ];
}

describe('planMultipleInstances', () => {
    it('expands named pointers (spine_<id>_<n>) into one instance per distinct pointer', () => {
        const groups = planMultipleInstances([
            { id: 'reels', slots: ['spine_reel_1', 'spine_reel_2', 'spine_reel_3'] },
            { id: 'reel', slots: [] },
        ]);

        expect(groups).toEqual([{ baseID: 'reel', instanceIDs: ['reel_1', 'reel_2', 'reel_3'] }]);
    });

    it('expands counted pointers (spine_<id><n>) sized off already-multiplied parents', () => {
        const groups = planMultipleInstances(zombieLandBases());

        const reel = groups.find((g) => g.baseID === 'reel');
        const symbol = groups.find((g) => g.baseID === 'symbol');

        // 5 named reels…
        expect(reel?.instanceIDs).toEqual(['reel_1', 'reel_2', 'reel_3', 'reel_4', 'reel_5']);
        // …each carries 5 spine_symbol* slots -> a 25-strong symbol pool numbered from 1.
        expect(symbol?.instanceIDs).toHaveLength(25);
        expect(symbol?.instanceIDs[0]).toBe('symbol1');
        expect(symbol?.instanceIDs[24]).toBe('symbol25');

        // Named pass must run before the counted pass depends on it.
        expect(groups.findIndex((g) => g.baseID === 'reel')).toBeLessThan(
            groups.findIndex((g) => g.baseID === 'symbol'),
        );
    });

    it('sizes a counted pool off a counted parent, regardless of expansion order', () => {
        // frozen-lake / valkyrie use the un-migrated `spine_reel1` (no underscore) naming, so
        // reels are *counted* too. The symbol pool must still resolve to 25, which requires
        // reels to expand before symbols are counted.
        const groups = planMultipleInstances([
            { id: 'reels', slots: ['spine_reel1', 'spine_reel2', 'spine_reel3', 'spine_reel4', 'spine_reel5'] },
            { id: 'reel', slots: ['spine_symbol0', 'spine_symbol1', 'spine_symbol2', 'spine_symbol3', 'spine_symbol4'] },
            { id: 'symbol', slots: [] },
        ]);

        const reel = groups.find((g) => g.baseID === 'reel');
        const symbol = groups.find((g) => g.baseID === 'symbol');

        expect(reel?.instanceIDs).toEqual(['reel1', 'reel2', 'reel3', 'reel4', 'reel5']);
        expect(symbol?.instanceIDs).toHaveLength(25);
        expect(symbol?.instanceIDs[0]).toBe('symbol1');
        expect(symbol?.instanceIDs[24]).toBe('symbol25');
        expect(groups.findIndex((g) => g.baseID === 'reel')).toBeLessThan(
            groups.findIndex((g) => g.baseID === 'symbol'),
        );
    });

    it('ignores pointers whose base is not a known spine', () => {
        const groups = planMultipleInstances([
            { id: 'reels', slots: ['spine_reel_1', 'spine_reel_2'] }, // no `reel` template registered
        ]);

        expect(groups).toEqual([]);
    });

    it('treats a digit-suffixed pointer that names a real spine as a single attach, not a pool', () => {
        const groups = planMultipleInstances([
            { id: 'board', slots: ['spine_coin2'] },
            { id: 'coin', slots: [] }, // `coin` is a base…
            { id: 'coin2', slots: [] }, // …but `coin2` is itself a real spine -> leave both alone
        ]);

        expect(groups).toEqual([]);
    });

    it('does not pool when only a single counted slot exists', () => {
        const groups = planMultipleInstances([
            { id: 'reel', slots: ['spine_symbol0'] },
            { id: 'symbol', slots: [] },
        ]);

        expect(groups).toEqual([]);
    });

    it('leaves plain single-attach pointers (spine_<id>) untouched', () => {
        const groups = planMultipleInstances([
            { id: 'root', slots: ['spine_bg', 'spine_ui'] },
            { id: 'bg', slots: [] },
            { id: 'ui', slots: [] },
        ]);

        expect(groups).toEqual([]);
    });
});
