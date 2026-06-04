import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Assets, BitmapText, Container, Text } from 'pixi.js';
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
        ctl.settings = { a: { type: 'text', value: 'hi' } };
        ctl.add(slot as never, spine as never, 'a');

        expect(ctl.getInstances().get('a')).toBeInstanceOf(Text);
        expect(ctl.getBitmapInstances().size).toBe(0);

        const slotB = { name: 'text_b' } as FakeSlot;
        ctl.settings = { ...ctl.settings, b: { type: 'bitmapText', value: 'hey' } };
        ctl.add(slotB as never, spine as never, 'b');
        expect(ctl.getBitmapInstances().get('b')).toBeInstanceOf(BitmapText);
    });

    it('getVal returns the current text value', () => {
        const ctl = new TextsController(new Map());
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        ctl.settings = { a: { type: 'text', value: 'hello' } };
        ctl.add(slot as never, spine as never, 'a');

        expect(ctl.getVal('a')).toBe('hello');
        expect(ctl.getVal('missing')).toBeUndefined();
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
        ctl.settings = { a: { type: 'text', value: '' } };
        ctl.add(slot as never, spine as never, 'a');
    });

    it('set updates the text value', async () => {
        await ctl.set('a', 'world');
        expect(ctl.getVal('a')).toBe('world');
    });

    it('set uppercases when the entry has uppercase=true', async () => {
        ctl.settings = { a: { type: 'text', uppercase: true } };
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
        ctl.settings = { score: { type: 'text', value: 'Score: 0' } };
        ctl.add(slot as never, spine as never, 'score');

        const promise = ctl.set('score', 'Score: 100', true, 320);
        await vi.runAllTimersAsync();
        await promise;

        expect(ctl.getVal('score')).toBe('Score: 100');
    });

    it('respects animateNumber from settings without an explicit animate flag', async () => {
        const slot = { name: 'text_score' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { score: { type: 'text', value: '0', animateNumber: true } };
        ctl.add(slot as never, spine as never, 'score');

        const promise = ctl.set('score', '10');
        await vi.runAllTimersAsync();
        await promise;

        expect(ctl.getVal('score')).toBe('10');
    });

    it('snaps to target without animation when diff is zero', async () => {
        const slot = { name: 'text_score' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { score: { type: 'text', value: '42' } };
        ctl.add(slot as never, spine as never, 'score');

        await ctl.set('score', '42', true);
        expect(ctl.getVal('score')).toBe('42');
    });

    it('cancels an in-flight runner when set is called again', async () => {
        const slot = { name: 'text_score' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { score: { type: 'text', value: '0' } };
        ctl.add(slot as never, spine as never, 'score');

        const first = ctl.set('score', '100', true, 800);
        const second = ctl.set('score', '5', true, 80);
        await vi.runAllTimersAsync();
        await Promise.all([first, second]);

        expect(ctl.getVal('score')).toBe('5');
    });
});

describe('TextsController – attach / settings / clear', () => {
    it('add creates a wrapper Container and attaches via addSlotObject', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { a: { type: 'text', value: 'hi', uppercase: true } };

        const summary = ctl.add(slot as never, spine as never, 'a');

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
            a: {
                type: 'bitmapText',
                value: 'hi',
                offset: { x: 3, y: 4 },
            },
        };

        ctl.add(slot as never, spine as never, 'a');
        const node = ctl.getInstances().get('a') as BitmapText;
        expect(node.x).toBe(3);
        expect(node.y).toBe(4);
    });

    it('setBySpineID adds the text container to the matched slot', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));

        const txt = new Text({ text: 'x' });
        ctl.setBySpineID('hero', 'text_a', txt);
        expect(spine.__slotChildren.get('text_a')?.[0]).toBe(txt);
    });

    it('setBySpineID logs on unknown spine', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const ctl = new TextsController(new Map());
        ctl.setBySpineID('missing', 'slot', new Text());
        expect(err).toHaveBeenCalledWith('Spine "missing" not found');
    });

    it('setBySpineID logs on unknown slot', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const spine = createFakeSpine({ slots: [{ name: 'text_a' }] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.setBySpineID('hero', 'text_missing', new Text());
        expect(err).toHaveBeenCalledWith(
            'Slot "text_missing" not found',
            expect.anything(),
        );
    });

    it('setMaxWidth records the value on the settings entry for bitmap text', () => {
        // Call setMaxWidth before the instance is added, so applyMaxWidth is skipped
        // (it would otherwise trigger BitmapText canvas measurement).
        const ctl = new TextsController(new Map());
        ctl.settings = { a: { type: 'bitmapText', value: '' } };

        ctl.setMaxWidth('a', 100);
        expect(
            (ctl.settings?.a as { type: string; maxWidth?: number }).maxWidth,
        ).toBe(100);
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

    it('clear drops settings, runners, and instances', () => {
        const slot = { name: 'text_a' } as FakeSlot;
        const spine = createFakeSpine({ slots: [slot] });
        const ctl = new TextsController(asSpineMap({ hero: spine }));
        ctl.settings = { a: { type: 'text', value: 'hi' } };
        ctl.add(slot as never, spine as never, 'a');

        ctl.clear();
        expect(ctl.getInstances().size).toBe(0);
        expect(ctl.settings).toBeUndefined();
    });
});
