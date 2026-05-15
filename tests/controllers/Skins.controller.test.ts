import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkinsController } from '../../src/controllers/Skins.controller';
import { asSpineMap, createFakeSpine, type FakeSpine } from '../helpers/fakeSpine';

describe('SkinsController', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('registers skins per spineID and returns them via getSpineSkinsBySkinID', () => {
        const ctl = new SkinsController(new Map());
        ctl.registerSkin('hero', 'red');
        ctl.registerSkin('hero', 'blue');
        ctl.registerSkin('enemy', 'green');

        expect(ctl.getSpineSkinsBySkinID('hero')).toEqual(['red', 'blue']);
        expect(ctl.getSpineSkinsBySkinID('enemy')).toEqual(['green']);
        expect(ctl.getSpineSkinsBySkinID('missing')).toEqual([]);
    });

    it('flattens all registered skins via getAll', () => {
        const ctl = new SkinsController(new Map());
        ctl.registerSkin('hero', 'red');
        ctl.registerSkin('hero', 'blue');
        ctl.registerSkin('enemy', 'red');

        expect([...ctl.getAll()].sort()).toEqual(['blue', 'red']);
    });

    it('exposes the raw registry via getList', () => {
        const ctl = new SkinsController(new Map());
        ctl.registerSkin('hero', 'red');
        expect(ctl.getList().get('hero')).toEqual(['red']);
    });

    it('applyBySpineID looks up the skin then calls setSkin and resets slots', () => {
        const hero: FakeSpine = createFakeSpine({ skins: ['red', 'blue'] });
        const ctl = new SkinsController(asSpineMap({ hero }));

        ctl.applyBySpineID('hero', 'red');

        expect(hero.__activeSkin?.name).toBe('red');
        expect(hero.__setupPoseCount).toBe(1);
    });

    it('applyBySpineID warns when the spine is unknown', () => {
        const ctl = new SkinsController(new Map());
        ctl.applyBySpineID('missing', 'red');
        expect(warn).toHaveBeenCalledWith('Spine not found: missing');
    });

    it('applyBySpineID warns when the skin is unknown', () => {
        const hero = createFakeSpine({ skins: ['red'] });
        const ctl = new SkinsController(asSpineMap({ hero }));

        ctl.applyBySpineID('hero', 'gold');

        expect(warn).toHaveBeenCalledWith('Skin not found gold for spine hero');
        expect(hero.__activeSkin).toBeUndefined();
    });

    it('apply applies a skin to every spine that defines it', () => {
        const hero = createFakeSpine({ skins: ['red'] });
        const enemy = createFakeSpine({ skins: ['red'] });
        const boss = createFakeSpine({ skins: ['blue'] });
        const ctl = new SkinsController(asSpineMap({ hero, enemy, boss }));

        ctl.apply('red');

        expect(hero.__activeSkin?.name).toBe('red');
        expect(enemy.__activeSkin?.name).toBe('red');
        expect(boss.__activeSkin).toBeUndefined();
    });

    it('clear drops the registry', () => {
        const ctl = new SkinsController(new Map());
        ctl.registerSkin('hero', 'red');
        ctl.clear();
        expect(ctl.getAll().size).toBe(0);
        expect(ctl.getList().size).toBe(0);
    });
});
