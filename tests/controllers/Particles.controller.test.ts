import { afterEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { ParticlesController } from '../../src/core/controllers/Particles.controller';
import { AnimationsController } from '../../src/core/controllers/Animations.controller';
import { SpineLayoutCore } from '../../src/core/SpineLayout';
import type { Engine } from '../../src/engine/Engine';
import type { ParticlesJson } from '../../src/core/config/types';
import {
    asSpineMap,
    createFakeEngine,
    createFakeParticlesPort,
    createFakeSpine,
    type FakeParticlesPort,
    type FakeSpine,
    type FakeTypes,
} from '../helpers/fakeEngine';

const spark = Texture.WHITE;
const smoke = Texture.EMPTY;

function engineWith(
    particles: FakeParticlesPort | undefined,
    textures: Record<string, unknown> = { 'spark.png': spark, 'smoke.png': smoke },
): Engine<FakeTypes> {
    return {
        ...createFakeEngine({ particles }),
        assets: {
            get: (alias) => textures[alias] as never,
            has: (alias) => alias in textures,
        },
    };
}

const settings = (overrides: ParticlesJson = {}): ParticlesJson => ({
    hero: {
        sparks: { textures: ['spark.png'], config: { lifetime: 1 }, autoplay: true },
        smoke: { textures: ['smoke.png'], config: { lifetime: 2 } },
    },
    ...overrides,
});

function setUp(spines: Record<string, FakeSpine>, json: ParticlesJson = settings()) {
    const port = createFakeParticlesPort();
    const engine = engineWith(port);
    const map = asSpineMap(spines);
    const animations = new AnimationsController(engine, map);
    const ctl = new ParticlesController(engine, map);

    ctl.settings = json;
    return { port, engine, animations, ctl };
}

const heroSpine = () =>
    createFakeSpine({ slots: [{ name: 'particles_sparks' }, { name: 'particles_smoke' }] });

describe('ParticlesController – attaching from particles.json', () => {
    afterEach(() => vi.restoreAllMocks());

    it('hangs an emitter off each configured particles_ slot, playing the autoplay ones', () => {
        const hero = heroSpine();
        const { port, ctl } = setUp({ hero });

        ctl.attach();

        expect(ctl.getAll()).toEqual(['sparks', 'smoke']);
        const [sparks, smokeEmitter] = port.emitters;
        expect(hero.__slotChildren.get('particles_sparks')?.[0]).toBe(sparks.parent);
        expect(sparks.textures).toEqual([spark]);
        expect(sparks.config).toEqual({ lifetime: 1 });
        expect(sparks.emit).toBe(true);
        expect(smokeEmitter.emit).toBe(false);
        expect(ctl.isPlaying('sparks')).toBe(true);
        expect(ctl.isPlaying('smoke')).toBe(false);
    });

    it('lists every particles_ slot per spine, configured or not', () => {
        const hero = createFakeSpine({
            slots: [{ name: 'particles_sparks' }, { name: 'particles_dust' }],
        });
        const bg = createFakeSpine({ slots: [{ name: 'text_title' }] });
        const { ctl } = setUp({ hero, bg });

        ctl.attach();

        expect(ctl.getBySpine()).toEqual(new Map([['hero', ['sparks', 'dust']]]));
        expect(ctl.getAll()).toEqual(['sparks']);
    });

    it('warns about a missing texture, and skips an emitter none of whose textures resolve', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const hero = heroSpine();
        const { port, ctl } = setUp(
            { hero },
            {
                hero: {
                    sparks: { textures: ['spark.png', 'glow.png'], config: {} },
                    smoke: { textures: ['fog.png'], config: {} },
                },
            },
        );

        ctl.attach();

        expect(ctl.getAll()).toEqual(['sparks']);
        expect(port.emitters[0].textures).toEqual([spark]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"glow.png"'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"fog.png"'));
        expect(hero.__slotChildren.has('particles_smoke')).toBe(false);
    });

    it('reads particles.json from the asset cache when nothing set it', () => {
        const hero = heroSpine();
        const port = createFakeParticlesPort();
        const engine = engineWith(port, {
            'spark.png': spark,
            'settings/particles.json': {
                hero: { sparks: { textures: ['spark.png'], config: {} } },
            },
        });
        const ctl = new ParticlesController(engine, asSpineMap({ hero }));

        ctl.loadSettings();
        ctl.attach();

        expect(ctl.getAll()).toEqual(['sparks']);
    });

    it('looks for particles.json without the warning a cache miss logs', () => {
        const warn = vi.spyOn(console, 'warn');
        const ctl = new ParticlesController(createFakeEngine(), new Map());

        ctl.loadSettings();

        expect(ctl.settings).toBeUndefined();
        expect(warn).not.toHaveBeenCalled();
    });

    it('keeps settings that were set over the ones in the asset cache', () => {
        const engine = engineWith(createFakeParticlesPort(), { 'particles.json': { other: {} } });
        const ctl = new ParticlesController(engine, new Map());
        const own = settings();

        ctl.settings = own;
        ctl.loadSettings();

        expect(ctl.settings).toBe(own);
    });
});

describe('ParticlesController – playing', () => {
    it('play, stop and emitOnce drive the emitter', () => {
        const hero = heroSpine();
        const { port, ctl } = setUp({ hero });
        ctl.attach();
        const smokeEmitter = port.emitters[1];

        ctl.play('smoke');
        expect(smokeEmitter.emit).toBe(true);
        ctl.stop('smoke', 'hero');
        expect(smokeEmitter.emit).toBe(false);
        ctl.emitOnce('smoke');
        expect(smokeEmitter.bursts).toBe(1);
        ctl.play('smoke', 'elsewhere');
        expect(smokeEmitter.emit).toBe(false);
    });

    it('answers particles_<key>_start, _stop and _once events from the spine', () => {
        const hero = heroSpine();
        const { port, ctl, animations } = setUp({ hero });
        animations.particles = ctl;
        animations.registerSpine('hero', hero as never);
        ctl.attach();
        const smokeEmitter = port.emitters[1];

        hero.triggerEvent('particles_smoke_start');
        expect(smokeEmitter.emit).toBe(true);
        hero.triggerEvent('particles_smoke_stop');
        expect(smokeEmitter.emit).toBe(false);
        hero.triggerEvent('particles_smoke_once');
        expect(smokeEmitter.bursts).toBe(1);
    });

    it('advances each emitter with its spine, at the layout speed', () => {
        const hero = heroSpine();
        const { port, ctl, animations } = setUp({ hero });
        ctl.attach();

        hero.update(0.1);
        animations.speed = 2;
        hero.update(0.1);
        animations.setSpineSpeed('hero', 0.5);
        hero.update(0.1);
        animations.pauseBySpineID('hero');
        hero.update(0.1);

        expect(port.emitters[0].updates).toEqual([0.1, 0.2, 0.1, 0]);
        expect(port.emitters[1].updates).toEqual([0.1, 0.2, 0.1, 0]);
    });

    it('takes the old emitter down on a re-attach that no longer configures it', () => {
        const hero = heroSpine();
        const { port, ctl } = setUp({ hero });
        ctl.attach();

        ctl.settings = { hero: { smoke: settings().hero.smoke } };
        ctl.attach();

        expect(port.emitters[0].destroyed).toBe(true);
        expect(ctl.getAll()).toEqual(['smoke']);
        expect(hero.__slotChildren.has('particles_sparks')).toBe(false);

        hero.update(0.1);
        expect(port.emitters[0].updates).toEqual([]);
    });

    it('rebuilds an emitter on setConfig, still emitting, and keeps the config in the settings', () => {
        const hero = heroSpine();
        const { port, ctl } = setUp({ hero });
        ctl.attach();
        const [before] = port.emitters;

        ctl.setConfig('sparks', { lifetime: 5 });

        const after = port.emitters[2];
        expect(before.destroyed).toBe(true);
        expect(after.config).toEqual({ lifetime: 5 });
        expect(after.parent).toBe(before.parent);
        expect(after.emit).toBe(true);
        expect(ctl.settings?.hero.sparks.config).toEqual({ lifetime: 5 });

        hero.update(0.1);
        expect(before.updates).toEqual([]);
        expect(after.updates).toEqual([0.1]);
    });
});

describe('ParticlesController – multiple instances', () => {
    it('keys each instance by its spine id, the instance section over the base one', () => {
        const counter_1 = createFakeSpine({ slots: [{ name: 'particles_sparks' }] });
        const counter_2 = createFakeSpine({ slots: [{ name: 'particles_sparks' }] });
        const port = createFakeParticlesPort();
        const engine = engineWith(port);
        const ctl = new ParticlesController(
            engine,
            asSpineMap({ counter_1, counter_2 }),
            new Set(['counter_1', 'counter_2']),
        );
        ctl.settings = {
            counter: { sparks: { textures: ['spark.png'], config: { lifetime: 1 } } },
            counter_2: { sparks: { textures: ['smoke.png'], config: { lifetime: 2 } } },
        };

        ctl.attach();

        expect(ctl.getAll()).toEqual(['counter_1_sparks', 'counter_2_sparks']);
        expect(port.emitters.map((e) => e.config)).toEqual([{ lifetime: 1 }, { lifetime: 2 }]);
        expect(port.emitters[1].textures).toEqual([smoke]);

        ctl.play('counter_2_sparks');
        expect(port.emitters.map((e) => e.emit)).toEqual([false, true]);
        ctl.play('sparks');
        expect(port.emitters.map((e) => e.emit)).toEqual([true, true]);
        ctl.stop('sparks', 'counter_1');
        expect(port.emitters.map((e) => e.emit)).toEqual([false, true]);
    });

    it('keeps two spines sharing a key apart', () => {
        const hero = createFakeSpine({ slots: [{ name: 'particles_sparks' }] });
        const villain = createFakeSpine({ slots: [{ name: 'particles_sparks' }] });
        const { port, ctl } = setUp(
            { hero, villain },
            {
                hero: { sparks: { textures: ['spark.png'], config: {} } },
                villain: { sparks: { textures: ['spark.png'], config: {} } },
            },
        );

        ctl.attach();

        expect(ctl.getAll()).toEqual(['sparks', 'villain_sparks']);
        ctl.play('sparks', 'villain');
        expect(port.emitters.map((e) => e.emit)).toEqual([false, true]);
        ctl.stop('villain_sparks');
        expect(port.emitters.map((e) => e.emit)).toEqual([false, false]);
        ctl.play('sparks');
        expect(port.emitters.map((e) => e.emit)).toEqual([true, true]);
    });
});

describe('ParticlesController – without a particles port', () => {
    afterEach(() => vi.restoreAllMocks());

    it('warns once and leaves every call a no-op', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const hero = heroSpine();
        const engine = engineWith(undefined);
        const ctl = new ParticlesController(engine, asSpineMap({ hero }));
        ctl.settings = settings();

        ctl.attach();
        ctl.attach();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('[SpineLayout] particles unavailable on pixi8');
        expect(() => {
            ctl.play('sparks');
            ctl.stop('sparks');
            ctl.emitOnce('sparks');
            ctl.setConfig('sparks', {});
            ctl.handleEvent('particles_sparks_start', 'hero');
            ctl.clear();
        }).not.toThrow();
        expect(ctl.getAll()).toEqual([]);
        expect(ctl.isPlaying('sparks')).toBe(false);
        expect(hero.__slotChildren.size).toBe(0);
    });
});

describe('ParticlesController – on the layout', () => {
    const skeleton = {
        skeleton: { hash: 'particles', spine: '4.3.23' },
        bones: [{ name: 'root' }, { name: 'particles_sparks', parent: 'root' }],
        slots: [{ name: 'particles_sparks', bone: 'particles_sparks' }],
        animations: {},
    };

    it('attaches on render, follows particleSettings, and clears on reset', () => {
        const port = createFakeParticlesPort();
        const layout = new SpineLayoutCore({ engine: engineWith(port) });

        layout.particleSettings = {
            root: { sparks: { textures: ['spark.png'], config: {}, autoplay: true } },
        };
        layout.createInstancesFromDataArray([
            { name: 'root', skeleton, atlasText: '', textures: {} },
        ]);

        expect(layout.particles.getAll()).toEqual(['sparks']);
        expect(layout.particles.isPlaying('sparks')).toBe(true);

        layout.reset();

        expect(port.emitters[0].destroyed).toBe(true);
        expect(layout.particles.getAll()).toEqual([]);
        expect(layout.particleSettings).toBeUndefined();
    });

    it("takes a spine's emitters down before the spine it replaces is destroyed", () => {
        const port = createFakeParticlesPort();
        const layout = new SpineLayoutCore({ engine: engineWith(port) });
        layout.particleSettings = { root: { sparks: { textures: ['spark.png'], config: {} } } };
        layout.createInstancesFromDataArray([{ name: 'root', skeleton, atlasText: '', textures: {} }]);

        const old = layout.spines.get('root')!;
        const [emitter] = port.emitters;
        const order: string[] = [];
        const destroySpine = old.destroy.bind(old);
        old.destroy = ((options?: unknown) => {
            order.push('spine');
            destroySpine(options as never);
        }) as typeof old.destroy;
        emitter.destroy = () => void order.push('emitter');

        layout.createInstancesFromDataArray([{ name: 'root', skeleton, atlasText: '', textures: {} }]);

        expect(order).toEqual(['emitter', 'spine']);
        expect(layout.particles.getAll()).toEqual(['sparks']);
        expect(port.emitters).toHaveLength(2);
    });
});
