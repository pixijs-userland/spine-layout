import { vi } from 'vitest';
import type { Pixi4Engine } from '../../../src/engines/pixi4';
import { SpineLayoutCore, type Pixi4Types } from '../../../src/pixi4';
import { ATLAS, contractSkeleton } from '../pixiSpine/fixtures';
import { canvasTexture, type LoadedPixi4 } from './loadPixi4';

type Minor = '3.7' | '3.8';
type Json = Record<string, unknown>;
type SlotJson = { name: string; bone: string };
type SkinsJson = { attachments: Json }[] | Record<string, Json>;

function withSlot(minor: Minor, slot: SlotJson, skinEntry?: Json): Json {
    const skeleton = contractSkeleton(minor);
    (skeleton.slots as SlotJson[]).push(slot);

    if (skinEntry) {
        const skins = skeleton.skins as SkinsJson;
        const skin = Array.isArray(skins) ? skins[0].attachments : skins.default;
        skin[slot.name] = skinEntry;
    }
    return skeleton;
}

/** The contract skeleton with a `spine_child` slot, where the layout hangs the spine `child`. */
export const withSpineSlot = (minor: Minor) =>
    withSlot(minor, { name: 'spine_child', bone: 'bone_a' });

/** The contract skeleton with a button slot empty at setup, whose skin holds its one attachment. */
export const withEmptyButton = (minor: Minor) =>
    withSlot(minor, { name: 'button_go', bone: 'bone_a' }, { square: { width: 40, height: 20 } });

/** The hit area of `withEmptyButton`'s button: `square`, 40 by 20, around its bone. */
export const SQUARE_HIT_AREA = [-20, 10, -20, -10, 20, -10, 20, 10];

/** A layout of `skeletons` by name, and each `console.error` its build logged, joined. */
export function buildLayout(
    PIXI: LoadedPixi4,
    engine: Pixi4Engine,
    skeletons: Record<string, Json>,
) {
    const layout = new SpineLayoutCore<Pixi4Types>({ engine });
    const textures = { 'contract.png': canvasTexture(PIXI, 64, 64) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
        layout.createInstancesFromDataArray(
            Object.entries(skeletons).map(([name, skeleton]) => ({
                name,
                skeleton,
                atlasText: ATLAS,
                textures,
            })),
        );
        return { layout, errors: error.mock.calls.map((args) => args.join(' ')) };
    } finally {
        error.mockRestore();
    }
}
