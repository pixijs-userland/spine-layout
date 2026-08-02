import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Assets, BitmapText, Cache, Container, Text } from 'pixi.js';
import { TextsController } from '../../src/controllers/Texts.controller';
import {
    asSpineMap,
    createFakeSpine,
    type FakeSpine,
    type FakeSlot,
} from '../helpers/fakeSpine';

describe('TextsController – queries', () => {
    it('getBySpine returns slot text keys per spine (stripping text_ prefix), omitting spines without text slots', () => {
        const hero = createFakeSpine({
            slots: [{ name: 'text_score' }, { name: 'text_combo' }, { name: 'spine_eyes' }],
        });
        const enemy = createFakeSpine({ slots: [{ name: 'spine_arm' }] });
        const ctl = new TextsController(asSpineMap({ hero, enemy }));

        const result = ctl.getBySpine();
        expect(result.get('hero')).toEqual(['score', 'combo']);
        expect(result.has('enemy')).toBe(false);
    });

    it('getInstances and getBitmapInstances expose stored text nodes', () => {
        const ctl = new TextsController(new Map());
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        ctl.settings = { hero: { a: { type: 'text', value: 'hi' }, b: { type: 'bitmapText', value: 'hey' } } };
        ctl.add(slot as never, spine as never, 'a', 'hero');

        expect(ctl.getInstances().get('a')).toBeInstanceOf(Text);
        expect(ctl.getBitmapInstances().size).toBe(0);

        const slotB = { name: 'text_b' } as FakeSlot;
        ctl.add(slotB as never, spine as never, 'b', 'hero');
        expect(ctl.getBitmapInstances().get('b')).toBeInstanceOf(BitmapText);
    });

    it('getVal returns the current text value', () => {
        const ctl = new TextsController(new Map());
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        ctl.settings = { hero: { a: { type: 'text', value: 'hello' } } };
        ctl.add(slot as never, spine as never, 'a', 'hero');

        expect(ctl.getVal('a')).toBe('hello');
        expect(ctl.getVal('missing')).toBeUndefined();
    });
});

describe('TextsController – multiple instances', () => {
    function setup() {
        const c1 = createFakeSpine({ slots: [{ name: 'text_reward' }] });
        const c2 = createFakeSpine({ slots: [{ name: 'text_reward' }] });
        const ctl = new TextsController(
            asSpineMap({ counter_1: c1, counter_2: c2 }),
            new Set(['counter_1', 'counter_2']),
        );
        ctl.settings = {
            // base-spine section provides shared defaults for every counter_N instance
            counter: { reward: { type: 'text', value: 'X', fontSize: 40 } },
            // per-instance override
            counter_1: { reward: { type: 'text', value: '100' } },
        };
        ctl.add({ name: 'text_reward' } as never, c1 as never, 'reward', 'counter_1');
        ctl.add({ name: 'text_reward' } as never, c2 as never, 'reward', 'counter_2');
        return ctl;
    }

    it('registers each instance under a per-instance config key', () => {
        const ctl = setup();
        expect(ctl.getInstances().has('counter_1_reward')).toBe(true);
        expect(ctl.getInstances().has('counter_2_reward')).toBe(true);
        expect(ctl.getInstances().has('reward')).toBe(false);
    });

    it('merges the per-instance entry over the shared one, leaving siblings on the shared value', () => {
        const ctl = setup();
        expect(ctl.getVal('counter_1_reward')).toBe('100'); // per-instance override
        expect(ctl.getVal('counter_2_reward')).toBe('X'); // shared fallback
    });

    it('set by exact config key targets a single instance', async () => {
        const ctl = setup();
        await ctl.set('counter_1_reward', 'Z');
        expect(ctl.getVal('counter_1_reward')).toBe('Z');
        expect(ctl.getVal('counter_2_reward')).toBe('X');
    });

    it('set by bare text key updates every instance that has it', async () => {
        const ctl = setup();
        await ctl.set('reward', 'Y');
        expect(ctl.getVal('counter_1_reward')).toBe('Y');
        expect(ctl.getVal('counter_2_reward')).toBe('Y');
    });
});

describe('TextsController – mutation', () => {
    let spine: FakeSpine;
    let slot: FakeSlot;
    let ctl: TextsController;

    beforeEach(() => {
        slot = { name: 'text_a' };
        spine = createFakeSpine({ slots: [slot] });
        ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { a: { type: 'text', value: '' } } };
        ctl.add(slot as never, spine as never, 'a', 'hero');
    });

    it('set updates the text value', async () => {
        await ctl.set('a', 'world');
        expect(ctl.getVal('a')).toBe('world');
    });

    it('set uppercases when the entry has uppercase=true', async () => {
        ctl.settings = { hero: { a: { type: 'text', uppercase: true } } };
        await ctl.set('a', 'world');
        expect(ctl.getVal('a')).toBe('WORLD');
    });

    it('set logs an error when the bone is unknown', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        await ctl.set('missing', 'x');
        expect(err).toHaveBeenCalledWith('Text missing not found');
    });

    it('setOffset positions the text node', () => {
        ctl.setOffset('a', { x: 7, y: 9 });
        const node = ctl.getInstances().get('a') as Text;
        expect(node.x).toBe(7);
        expect(node.y).toBe(9);
    });

    it('setOffset logs when bone is unknown', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        ctl.setOffset('missing', { x: 0, y: 0 });
        expect(err).toHaveBeenCalledWith('Text missing not found, to set offset');
    });

    it('setStyle assigns the style on Text nodes', () => {
        ctl.setStyle('a', { fontSize: 42 });
        const node = ctl.getInstances().get('a') as Text;
        expect(node.style.fontSize).toBe(42);
    });

    it('setStyle forces fill=#ffffff for BitmapText nodes', () => {
        // Swap to bitmap.
        ctl.setTextType('a', 'bitmapText');
        ctl.setStyle('a', { fontSize: 12, fill: '#ff00ff' });
        const node = ctl.getInstances().get('a') as BitmapText;
        expect(node).toBeInstanceOf(BitmapText);
        expect(node.style.fill).toBe('#ffffff');
    });

    it('setStyle logs when bone is unknown', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        ctl.setStyle('missing', {});
        expect(err).toHaveBeenCalledWith('Text missing not found, to set style');
    });

    it('setTextType swaps Text ↔ BitmapText preserving the value', () => {
        ctl.setStyle('a', { fontSize: 16 });
        ctl.getInstances().get('a')!.text = 'preserved';

        ctl.setTextType('a', 'bitmapText');
        const swapped = ctl.getInstances().get('a');
        expect(swapped).toBeInstanceOf(BitmapText);
        expect(swapped?.text).toBe('preserved');
    });

    it('setTextType is a no-op when the type already matches', () => {
        const original = ctl.getInstances().get('a');
        ctl.setTextType('a', 'text');
        expect(ctl.getInstances().get('a')).toBe(original);
    });
});

describe('TextsController – animated numbers', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('counts up from current to target over the configured duration', async () => {
        const slot = { name: 'text_score' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { score: { type: 'text', value: 'Score: 0' } } };
        ctl.add(slot as never, spine as never, 'score', 'hero');

        const promise = ctl.set('score', 'Score: 100', true, 320);
        await vi.runAllTimersAsync();
        await promise;

        expect(ctl.getVal('score')).toBe('Score: 100');
    });

    it('respects animateNumber from settings without an explicit animate flag', async () => {
        const slot = { name: 'text_score' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { score: { type: 'text', value: '0', animateNumber: true } } };
        ctl.add(slot as never, spine as never, 'score', 'hero');

        const promise = ctl.set('score', '10');
        await vi.runAllTimersAsync();
        await promise;

        expect(ctl.getVal('score')).toBe('10');
    });

    it('snaps to target without animation when diff is zero', async () => {
        const slot = { name: 'text_score' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { score: { type: 'text', value: '42' } } };
        ctl.add(slot as never, spine as never, 'score', 'hero');

        await ctl.set('score', '42', true);
        expect(ctl.getVal('score')).toBe('42');
    });

    it('cancels an in-flight runner when set is called again', async () => {
        const slot = { name: 'text_score' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { score: { type: 'text', value: '0' } } };
        ctl.add(slot as never, spine as never, 'score', 'hero');

        const first = ctl.set('score', '100', true, 800);
        const second = ctl.set('score', '5', true, 80);
        await vi.runAllTimersAsync();
        await Promise.all([first, second]);

        expect(ctl.getVal('score')).toBe('5');
    });
});

describe('TextsController – change events', () => {
    function setup(
        settings: Record<string, Record<string, unknown>>,
        opts: { multi?: Set<string>; spineID?: string } = {},
    ) {
        const spineID = opts.spineID ?? 'hero';
        const textKey = Object.keys(settings[spineID.replace(/_\d+$/, '')] ?? settings[spineID])[0];
        const slot = { name: `text_${textKey}` } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const playEvent = vi.fn();
        const ctl = new TextsController(
            asSpineMap({ [spineID]: spine }),
            opts.multi ?? new Set(),
            { playEvent } as never,
        );
        ctl.settings = settings as never;
        ctl.add(slot as never, spine as never, textKey, spineID);

        return { ctl, playEvent };
    }

    it('fires <textKey>_change with the previous and next value when the text changes', async () => {
        const { ctl, playEvent } = setup({ hero: { balance: { type: 'text', value: '100' } } });

        await ctl.set('balance', '250');

        expect(playEvent).toHaveBeenCalledWith('balance_change', 'hero', {
            from: '100',
            to: '250',
        });
    });

    it('does not fire on registration, nor when the value is unchanged', async () => {
        const { ctl, playEvent } = setup({ hero: { balance: { type: 'text', value: '100' } } });

        expect(playEvent).not.toHaveBeenCalled();

        await ctl.set('balance', '100');
        expect(playEvent).not.toHaveBeenCalled();
    });

    it('reports the uppercased value when the entry is uppercase', async () => {
        const { ctl, playEvent } = setup({
            hero: { label: { type: 'text', value: 'spin', uppercase: true } },
        });

        await ctl.set('label', 'stop');

        expect(playEvent).toHaveBeenCalledWith('label_change', 'hero', {
            from: 'SPIN',
            to: 'STOP',
        });
    });

    it('fires once up front for an animated count-up, not per tick', async () => {
        vi.useFakeTimers();
        const { ctl, playEvent } = setup({ hero: { score: { type: 'text', value: '0' } } });

        const promise = ctl.set('score', '100', true, 320);
        expect(playEvent).toHaveBeenCalledTimes(1);
        expect(playEvent).toHaveBeenCalledWith('score_change', 'hero', { from: '0', to: '100' });

        await vi.runAllTimersAsync();
        await promise;

        expect(playEvent).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('uses the bare slot text key for multiple-instance spines', async () => {
        const { ctl, playEvent } = setup(
            { counter: { reward: { type: 'text', value: '1' } } },
            { multi: new Set(['counter_1']), spineID: 'counter_1' },
        );

        await ctl.set('counter_1_reward', '2');

        expect(playEvent).toHaveBeenCalledWith('reward_change', 'counter_1', {
            from: '1',
            to: '2',
        });
    });
});

describe('TextsController – attach / settings / clear', () => {
    it('add creates a wrapper Container and attaches via addSlotObject', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { a: { type: 'text', value: 'hi', uppercase: true } } };

        const summary = ctl.add(slot as never, spine as never, 'a', 'hero');

        expect(summary).toBe('a -> text_a');
        const attached = spine.__slotChildren.get('text_a');
        expect(attached?.[0]).toBeInstanceOf(Container);
        expect(ctl.getVal('a')).toBe('HI');
    });

    it('add applies offset from bitmap settings', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        // maxWidth is omitted on purpose: maxWidth > 0 triggers BitmapText layout
        // measurement, which needs a canvas. The recording behavior is covered separately.
        ctl.settings = {
            hero: {
                a: {
                    type: 'bitmapText',
                    value: 'hi',
                    offset: { x: 3, y: 4 },
                },
            },
        };

        ctl.add(slot as never, spine as never, 'a', 'hero');
        const node = ctl.getInstances().get('a') as BitmapText;
        expect(node.x).toBe(3);
        expect(node.y).toBe(4);
    });

    it('addTextToSlot adds the text container to the matched slot', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));

        const txt = new Text({ text: 'x' });
        ctl.addTextToSlot('hero', 'text_a', txt);
        expect(spine.__slotChildren.get('text_a')?.[0]).toBe(txt);
    });

    it('setBySpineID logs on unknown spine', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctl = new TextsController(new Map());
        ctl.setBySpineID('missing', 'slot', 'x');
        expect(err).toHaveBeenCalledWith('Spine "missing" not found');
    });

    it('addTextToSlot logs on unknown spine', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctl = new TextsController(new Map());
        ctl.addTextToSlot('missing', 'slot', new Text());
        expect(err).toHaveBeenCalledWith('Spine "missing" not found');
    });

    it('addTextToSlot logs on unknown slot', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const spine = createFakeSpine({ slots: [{ name: 'text_a' }] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.addTextToSlot('hero', 'text_missing', new Text());
        expect(err).toHaveBeenCalledWith(
            'Slot "text_missing" not found',
            expect.anything(),
        );
    });

    it('setMaxWidth records the value on the settings entry for bitmap text', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { a: { type: 'bitmapText', value: '' } } };
        ctl.add(slot as never, spine as never, 'a', 'hero');

        // Stub the node width so applyMaxSize doesn't trigger BitmapText canvas measurement.
        Object.defineProperty(ctl.getInstances().get('a'), 'width', { get: () => 0 });

        ctl.setMaxWidth('a', 100);
        expect(
            (ctl.settings?.hero?.a as { type: string; maxWidth?: number }).maxWidth,
        ).toBe(100);
    });

    it('scales bitmap text down to maxHeight, and lets the tighter bound decide', () => {
        // Same font shape as the max-width case: the glyph rects are in a different unit from
        // the declared lineHeight, so the height has to be measured off the glyphs (300 tall)
        // rather than off BitmapText.height (the 13-unit line box).
        const glyph = {
            id: 48,
            xOffset: 0,
            yOffset: 20,
            xAdvance: 100,
            kerning: {},
            texture: { orig: { width: 100, height: 300 } },
        };
        Cache.set('fake-bitmap', {
            chars: { '0': glyph },
            lineHeight: 13,
            baseLineOffset: 3,
            baseMeasurementFontSize: 10,
            fontMetrics: { fontSize: 10, ascent: 0, descent: 0 },
        } as never);

        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = {
            hero: {
                a: {
                    type: 'bitmapText',
                    fontFamily: 'fake',
                    fontSize: 10,
                    letterSpacing: 0,
                    offset: { x: 0, y: -100 },
                    // '000' renders 300 wide and its glyphs 300 tall, so a 150 bound halves it
                    maxHeight: 150,
                    value: '000',
                },
            },
        };
        ctl.add(slot as never, spine as never, 'a', 'hero');
        const node = ctl.getInstances().get('a') as BitmapText;

        // halved by height alone, and centred the same way the width bound centres it
        expect(node.scale.y).toBeCloseTo(0.5);
        expect(node.y).toBeCloseTo(-17.5);

        // a width bound that bites harder takes over — scaling is uniform, so the tighter wins
        ctl.setMaxWidth('a', 75);
        expect((ctl.settings?.hero?.a as { maxWidth?: number }).maxWidth).toBe(75);
        expect(node.scale.y).toBeCloseTo(0.25);
        expect(node.y).toBeCloseTo(23.75);

        // dropping the height bound leaves the width one still holding it
        ctl.setMaxHeight('a', 0);
        expect((ctl.settings?.hero?.a as { maxHeight?: number }).maxHeight).toBe(0);
        expect(node.scale.y).toBeCloseTo(0.25);

        // and with neither, full size and the configured offset are back
        ctl.setMaxWidth('a', 0);
        expect(node.scale.y).toBe(1);
        expect(node.y).toBeCloseTo(-100);

        Cache.remove('fake-bitmap');
    });

    it('loadSettings picks up the texts.json shortcut alias from Assets when present', () => {
        const fakeSettings = { foo: { type: 'text', value: 'x' } };
        const spy = vi.spyOn(Assets, 'get').mockReturnValue(fakeSettings as never);

        const ctl = new TextsController(new Map());
        ctl.loadSettings();

        expect(spy).toHaveBeenCalledWith('texts.json');
        expect(ctl.settings).toBe(fakeSettings);

        spy.mockRestore();
    });

    it('loadSettings falls back to settings/texts.json when the shortcut is absent', () => {
        const fakeSettings = { foo: { type: 'text', value: 'x' } };
        const spy = vi
            .spyOn(Assets, 'get')
            .mockImplementation((key: unknown) =>
                key === 'settings/texts.json' ? (fakeSettings as never) : (undefined as never),
            );

        const ctl = new TextsController(new Map());
        ctl.loadSettings();

        expect(spy).toHaveBeenCalledWith('settings/texts.json');
        expect(ctl.settings).toBe(fakeSettings);

        spy.mockRestore();
    });

    it('keeps a max-width-scaled bitmap text centred on the spot the full-size text held', () => {
        // Mimics our exported fonts, where `lineHeight`/`base` are authored in different units
        // than the glyph rects (`size=10 lineHeight=13 base=10` against a 300-unit tall glyph),
        // so BitmapText.anchor leaves the glyphs hanging below the origin.
        const glyph = {
            id: 48,
            xOffset: 0,
            yOffset: 20,
            xAdvance: 100,
            kerning: {},
            texture: { orig: { width: 100, height: 300 } },
        };
        Cache.set('fake-bitmap', {
            chars: { '0': glyph },
            lineHeight: 13,
            baseLineOffset: 3,
            baseMeasurementFontSize: 10,
            fontMetrics: { fontSize: 10, ascent: 0, descent: 0 },
        } as never);

        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = {
            hero: {
                a: {
                    type: 'bitmapText',
                    fontFamily: 'fake',
                    fontSize: 10,
                    letterSpacing: 0,
                    offset: { x: 0, y: -100 },
                    // '000' lays out 300 wide, so it has to halve to fit
                    maxWidth: 150,
                    value: '000',
                },
            },
        };
        ctl.add(slot as never, spine as never, 'a', 'hero');
        const node = ctl.getInstances().get('a') as BitmapText;

        // glyph box spans y 23…323, its centre 165 below the origin the node scales towards;
        // halving the node would take that centre to 82.5, so it is pushed back down by 82.5
        expect(node.scale.y).toBeCloseTo(0.5);
        expect(node.x).toBeCloseTo(0);
        expect(node.y).toBeCloseTo(-17.5);

        // a value that fits drops the scale and the compensation with it
        ctl.set('a', '0');
        expect(node.scale.y).toBe(1);
        expect(node.y).toBe(-100);

        // and setOffset stays the base the compensation rides on
        ctl.set('a', '000');
        ctl.setOffset('a', { x: 5, y: -50 });
        expect(node.y).toBeCloseTo(32.5);
        expect(node.x).toBeCloseTo(5);

        // clearing maxWidth — which the editor can do live — restores full size and position
        ctl.setMaxWidth('a', 0);
        expect(node.scale.y).toBe(1);
        expect(node.y).toBeCloseTo(-50);
        expect(node.x).toBeCloseTo(5);

        Cache.remove('fake-bitmap');
    });

    it('clear drops settings, runners, and instances', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { hero: { a: { type: 'text', value: 'hi' } } };
        ctl.add(slot as never, spine as never, 'a', 'hero');

        ctl.clear();
        expect(ctl.getInstances().size).toBe(0);
        expect(ctl.settings).toBeUndefined();
    });
});
