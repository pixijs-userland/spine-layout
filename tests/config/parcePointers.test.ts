import { describe, expect, it } from 'vitest';
import { parcePointers } from '../../src/config/parcePointers';

describe('parcePointers', () => {
    it('exposes the slot prefixes the controllers depend on', () => {
        expect(parcePointers.slot).toEqual({
            spine: 'spine_',
            text: 'text_',
            button: 'button_',
        });
    });

    it('exposes the folder prefixes used to bucket state/event animations', () => {
        expect(parcePointers.folder).toEqual({
            state: 'state_',
            event: 'event_',
        });
    });

    it('exposes the animation modifier suffixes', () => {
        expect(parcePointers.mod).toEqual({
            next: '_next',
            loop: '_loop',
            followPointer: '_followPointer',
        });
    });
});
