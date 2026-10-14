import { describe, expect, it } from 'vitest';
import type { Engine } from '../../../src/engine/Engine';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { createPixi4Engine } from '../../../src/pixi4';
import { engineContract } from '../../engine-contract/contract';
import { ATLAS, contractSkeleton } from '../pixiSpine/fixtures';
import fixture37 from '../../fixtures/contract-3.7.json';
import { hitTestingSuite } from './hitTesting';
import { buildLayout, SQUARE_HIT_AREA, withEmptyButton, withSpineSlot } from './layoutCases';
import { canvasTexture, loadPixi4 } from './loadPixi4';

// Left in the node environment, with a happy-dom page installed by hand, as the contract suite
// reads its fixtures off disk.

const load = () => {
    const PIXI = loadPixi4('pixi-spine-v4-37');
    return { PIXI, engine: createPixi4Engine(PIXI) };
};

engineContract('pixi4 over pixi-spine 1.5.23', async () => {
    const { PIXI, engine } = load();
    const page = canvasTexture(PIXI, 64, 32);
    const display = Object.create(engine.display, { whiteTexture: { value: page } });

    return { ...engine, display } as Engine;
});

hitTestingSuite(load, '3.7');

describe('the pixi4 engine on pixi-spine 1.5.23', () => {
    it('renders with PIXI.spine, its 3.7 runtime', () => {
        expect(load().engine.spine.runtimes).toEqual([
            {
                minor: '3.7',
                family: 'pixi-spine-legacy',
                packageName: 'pixi-spine',
                packageVersion: '1.5.23',
            },
        ]);
    });

    it('builds a 3.7 skeleton into a layout and plays it', () => {
        const { PIXI, engine } = load();
        const { layout, errors } = buildLayout(PIXI, engine, { root: contractSkeleton('3.7') });
        const spine = layout.spines.get('root')!;

        expect(errors).toEqual([]);
        expect(spine).toBeInstanceOf(PIXI.spine.Spine);

        const events: string[] = [];
        spine.state.addListener({ event: (_, event) => events.push(event.data.name) });
        spine.state.setAnimation(0, 'move', false);
        engine.spine.update(spine, 0.75);

        expect(events).toEqual(['hit']);
    });

    it('reads, as its contract fixture, the contract skeleton exported from 3.7', () => {
        expect(fixture37).toStrictEqual(contractSkeleton('3.7'));
    });

    it('refuses a 3.8 export, and any .skel: no 3.7 runtime reads binary', () => {
        const { engine } = load();
        const header = new TextEncoder().encode('3.7.94');
        const skel = new Uint8Array([2, 0x78, header.length + 1, ...header]);

        expect(() => engine.spine.readSkeleton(contractSkeleton('3.8'), ATLAS, {})).toThrow(
            'Spine 3.8.99 — registered runtimes: 3.7; Pixi 4, 5, 6, 7 can render it',
        );
        expect(() => engine.spine.readSkeleton(skel, '', {})).toThrow(UnsupportedSpineVersionError);
    });
});

describe('a 3.7 export in the core', () => {
    it('registers its skins, an object by name, and hangs a spine_ child on its slot', () => {
        const { PIXI, engine } = load();
        const { layout, errors } = buildLayout(PIXI, engine, {
            root: withSpineSlot('3.7'),
            child: contractSkeleton('3.7'),
        });
        const root = layout.spines.get('root')!;

        expect(errors).toEqual([]);
        expect([...layout.skins.getAll()]).toContain('default');
        expect([...layout.spines.keys()]).toEqual(['root', 'child']);
        expect(engine.spine.getSlotObject(root, 'spine_child')).toBe(layout.spines.get('child'));
    });

    it('takes the hit area of a button slot empty at setup from its skin', () => {
        const { PIXI, engine } = load();
        const { layout, errors } = buildLayout(PIXI, engine, { root: withEmptyButton('3.7') });
        const button = engine.spine.getSlotObject(layout.spines.get('root')!, 'button_go');

        expect(errors).toEqual([]);
        expect((button?.hitArea as { points: number[] }).points).toEqual(SQUARE_HIT_AREA);
    });
});
