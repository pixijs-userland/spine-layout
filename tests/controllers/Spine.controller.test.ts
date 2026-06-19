import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { MeshAttachment, RegionAttachment } from '@esotericsoftware/spine-pixi-v8';

import { SpineController } from '../../src/controllers/Spine.controller';
import { AnimationsController } from '../../src/controllers/Animations.controller';
import { asSpineMap, createFakeSpine, type FakeSpine } from '../helpers/fakeSpine';

vi.mock('@esotericsoftware/spine-pixi-v8', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@esotericsoftware/spine-pixi-v8')>();
    const { Container } = await import('pixi.js');

    class MockSpine extends Container {
        state: unknown;
        skeleton: unknown;
        __sourceData: unknown;

        constructor(data: unknown) {
            super();
            this.__sourceData = data;
            this.state = {
                addListener: () => {},
                data: { skeletonData: data ?? { animations: [], bones: [], slots: [] } },
            };
            this.skeleton = {
                data,
                slots: [],
                findBone: () => undefined,
                findSlot: () => undefined,
                updateWorldTransform: () => {},
            };
        }
    }

    return { ...actual, Spine: MockSpine };
});

const makeRegion = (overrides: Partial<{
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    degrees: number;
    rotate: boolean;
}> = {}) => {
    const attachment = new RegionAttachment(overrides.name ?? 'a', 'p');
    // The Spine controller reads region.x/y/width/height/degrees + region.texture.texture
    // off the attachment's sequence (spine 4.3 stores regions on `sequence.regions`).
    (attachment as unknown as { sequence: unknown }).sequence = {
        regions: [
            {
                x: overrides.x ?? 0,
                y: overrides.y ?? 0,
                width: overrides.width ?? 10,
                height: overrides.height ?? 20,
                degrees: overrides.degrees ?? 0,
                rotate: overrides.rotate ?? false,
                texture: { texture: { source: { __mark: 'pageTex' } } },
            },
        ],
    };
    return attachment;
};

describe('SpineController', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('getBonesByNamePattern returns all bones whose name starts with the pattern, across spines', () => {
        const a = createFakeSpine({
            bones: [{ name: 'spine_hero' }, { name: 'spine_enemy' }, { name: 'other' }],
        });
        const b = createFakeSpine({
            bones: [{ name: 'spine_boss' }, { name: 'foot' }],
        });
        const spines = asSpineMap({ a, b });
        const ctl = new SpineController(spines, new AnimationsController(spines));

        const names = ctl.getBonesByNamePattern('spine_').map((bone) => bone.name);
        expect(names).toEqual(['spine_hero', 'spine_enemy', 'spine_boss']);
    });

    it('getSlotsByNamePattern returns matching slots across spines', () => {
        const a = createFakeSpine({ slots: [{ name: 'text_score' }, { name: 'text_combo' }] });
        const b = createFakeSpine({ slots: [{ name: 'button_play' }] });
        const spines = asSpineMap({ a, b });
        const ctl = new SpineController(spines, new AnimationsController(spines));

        expect(ctl.getSlotsByNamePattern('text_').map((s) => s.name)).toEqual([
            'text_score',
            'text_combo',
        ]);
    });

    it('getSlotByName returns the first matching live slot across spines', () => {
        const a = createFakeSpine({ slots: [{ name: 'text_a' }] });
        const b = createFakeSpine({ slots: [{ name: 'text_b' }] });
        const spines = asSpineMap({ a, b });
        const ctl = new SpineController(spines, new AnimationsController(spines));

        expect(ctl.getSlotByName('text_b')).toBeDefined();
        expect(ctl.getSlotByName('missing')).toBeUndefined();
    });

    it('getSpinesByNamePattern filters by id prefix and supports negative patterns', () => {
        const heroMain = createFakeSpine();
        const heroEffects = createFakeSpine();
        const enemy = createFakeSpine();
        const spines = asSpineMap({
            hero_main: heroMain,
            hero_effects_glow: heroEffects,
            enemy_main: enemy,
        });
        const ctl = new SpineController(spines, new AnimationsController(spines));

        const matched = ctl.getSpinesByNamePattern('hero_');
        expect([...matched.keys()].sort()).toEqual(['hero_effects_glow', 'hero_main']);

        const excluded = ctl.getSpinesByNamePattern('hero_', { not: ['effects'] });
        expect([...excluded.keys()]).toEqual(['hero_main']);
    });

    it('getBoneGlobalPosition translates the bone into the spine container global space', () => {
        const hero = createFakeSpine({
            bones: [{ name: 'rootBone', worldX: 5, worldY: 7 }],
        });
        const spines = asSpineMap({ hero });
        const ctl = new SpineController(spines, new AnimationsController(spines));

        // FakeSpine.toGlobal adds (100, 200).
        expect(ctl.getBoneGlobalPosition('hero', 'rootBone')).toMatchObject({ x: 105, y: 207 });
    });

    it('getBoneGlobalPosition warns when spine is unknown', () => {
        const ctl = new SpineController(new Map(), new AnimationsController(new Map()));
        expect(ctl.getBoneGlobalPosition('missing', 'bone')).toBeUndefined();
        expect(warn).toHaveBeenCalledWith('Spine not found: missing');
    });

    it('getBonesGlobalPositionsByNamePattern returns a map of matching bones', () => {
        const hero = createFakeSpine({
            bones: [
                { name: 'spine_a', worldX: 1, worldY: 1 },
                { name: 'spine_b', worldX: 2, worldY: 2 },
                { name: 'other', worldX: 9, worldY: 9 },
            ],
        });
        const ctl = new SpineController(asSpineMap({ hero }), new AnimationsController(new Map()));

        const map = ctl.getBonesGlobalPositionsByNamePattern('spine_');
        expect(Object.keys(map).sort()).toEqual(['spine_a', 'spine_b']);
        expect(map.spine_a).toMatchObject({ x: 101, y: 201 });
    });

    it('getSlotsGlobalPositionsByNamePattern resolves slot bones to global coordinates', () => {
        const hero = createFakeSpine({ slots: [{ name: 'text_a' }, { name: 'text_b' }] });
        const ctl = new SpineController(asSpineMap({ hero }), new AnimationsController(new Map()));

        const map = ctl.getSlotsGlobalPositionsByNamePattern('text_');
        // FakeSpine.findSlot puts bone at (1, 2), toGlobal adds (100, 200).
        expect(map.text_a).toMatchObject({ x: 101, y: 202 });
        expect(map.text_b).toMatchObject({ x: 101, y: 202 });
    });

    it('getSlotTexture returns null when spine is unknown', () => {
        const ctl = new SpineController(new Map(), new AnimationsController(new Map()));
        expect(ctl.getSlotTexture('missing', 'slot')).toBeNull();
        expect(warn).toHaveBeenCalledWith('Spine not found: missing');
    });

    it('getSlotTexture returns null when attachment is neither region nor mesh', () => {
        const hero = createFakeSpine({
            slots: [{ name: 'icon', attachment: { not: 'an-attachment' } }],
        });
        const ctl = new SpineController(asSpineMap({ hero }), new AnimationsController(new Map()));
        expect(ctl.getSlotTexture('hero', 'icon')).toBeNull();
    });

    it('getSlotTexture extracts a Texture from RegionAttachment with non-rotated region', () => {
        const region = makeRegion({ x: 10, y: 20, width: 30, height: 40, degrees: 0 });
        const hero = createFakeSpine({ slots: [{ name: 'icon', attachment: region }] });
        const ctl = new SpineController(asSpineMap({ hero }), new AnimationsController(new Map()));

        const tex = ctl.getSlotTexture('hero', 'icon');
        expect(tex).not.toBeNull();
        expect(tex?.frame).toMatchObject({ x: 10, y: 20, width: 30, height: 40 });
        expect((tex as unknown as { rotate: number }).rotate ?? 0).toBe(0);
    });

    it('getSlotTexture swaps frame dimensions and sets rotate=2 when region is rotated', () => {
        const region = makeRegion({ x: 5, y: 6, width: 30, height: 40, degrees: 90 });
        const hero = createFakeSpine({ slots: [{ name: 'icon', attachment: region }] });
        const ctl = new SpineController(asSpineMap({ hero }), new AnimationsController(new Map()));

        const tex = ctl.getSlotTexture('hero', 'icon');
        expect(tex).not.toBeNull();
        // Rotated: frame becomes (x, y, height, width).
        expect(tex?.frame).toMatchObject({ x: 5, y: 6, width: 40, height: 30 });
        expect((tex as unknown as { rotate: number }).rotate).toBe(2);
    });

    it('getSlotTexture accepts MeshAttachment instances', () => {
        const mesh = new MeshAttachment('m', 'p');
        (mesh as unknown as { sequence: unknown }).sequence = {
            regions: [
                {
                    x: 1,
                    y: 2,
                    width: 3,
                    height: 4,
                    degrees: 0,
                    rotate: false,
                    texture: { texture: { source: {} } },
                },
            ],
        };
        const hero = createFakeSpine({ slots: [{ name: 'icon', attachment: mesh }] });
        const ctl = new SpineController(asSpineMap({ hero }), new AnimationsController(new Map()));
        expect(ctl.getSlotTexture('hero', 'icon')).not.toBeNull();
    });

    it('getSlotTexture warns and returns null when attachment region is missing', () => {
        const region = new RegionAttachment('a', 'p');
        // Empty sequence → no region resolved (spine 4.3 shape).
        (region as unknown as { sequence: unknown }).sequence = { regions: [] };
        const hero = createFakeSpine({ slots: [{ name: 'icon', attachment: region }] });
        const ctl = new SpineController(asSpineMap({ hero }), new AnimationsController(new Map()));

        expect(ctl.getSlotTexture('hero', 'icon')).toBeNull();
        expect(warn).toHaveBeenCalledWith('Invalid attachment or region');
    });

    it('cloneBySpineID warns and returns null when source is unknown', () => {
        const ctl = new SpineController(new Map(), new AnimationsController(new Map()));
        expect(ctl.cloneBySpineID('missing', 'new')).toBeNull();
        expect(warn).toHaveBeenCalledWith('Spine not found: missing');
    });

    it('clone offsets position by (100, 100), registers under newID, and destroys an existing entry under that id', () => {
        const hero = createFakeSpine() as FakeSpine & Container;
        hero.position.set(10, 20);
        hero.scale.set(2, 3);
        hero.rotation = 0.5;

        const existing = createFakeSpine();
        const spines = asSpineMap({ hero, clone_target: existing });
        const animations = new AnimationsController(spines);
        const registerSpy = vi.spyOn(animations, 'registerSpine');
        const ctl = new SpineController(spines, animations);

        const cloned = ctl.clone(hero as never, 'clone_target');

        expect(cloned).toBeInstanceOf(Container);
        expect(cloned.position.x).toBe(110);
        expect(cloned.position.y).toBe(120);
        expect(cloned.scale.x).toBe(2);
        expect(cloned.scale.y).toBe(3);
        expect(cloned.rotation).toBe(0.5);
        expect(spines.get('clone_target')).toBe(cloned);
        expect(existing.__destroyed).toBe(true);
        expect(registerSpy).toHaveBeenCalledWith('clone_target', cloned);
    });
});
