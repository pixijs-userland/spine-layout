import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '../../src/utils/Log';

describe('Log', () => {
    beforeEach(() => {
        log.enabled = false;
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
        vi.spyOn(console, 'table').mockImplementation(() => {});
    });

    afterEach(() => {
        log.enabled = false;
        vi.restoreAllMocks();
    });

    it('does not emit when disabled', () => {
        log.log('hello', 'world');
        expect(console.log).not.toHaveBeenCalled();
    });

    it('emits immediately when enabled before logging', () => {
        log.enabled = true;
        log.log('hello', 'world');
        expect(console.log).toHaveBeenCalledWith('hello', 'world');
    });

    it('flushes pending logs when enabled is toggled on', () => {
        log.log('queued');
        expect(console.log).not.toHaveBeenCalled();
        log.enabled = true;
        expect(console.log).toHaveBeenCalledWith('queued');
    });

    it('aggregates open/add/close into a single table call', () => {
        log.enabled = true;
        log.open('label');
        log.add('label', 'row1', 'a');
        log.add('label', 'row1', 'b');
        log.add('label', 'row2', 'c');
        log.close('label');

        expect(console.groupCollapsed).toHaveBeenCalledWith('label');
        expect(console.table).toHaveBeenCalledWith({ row1: ['a', 'b'], row2: ['c'] });
        expect(console.groupEnd).toHaveBeenCalled();
    });

    it('skips closing an empty label without emitting a table', () => {
        log.enabled = true;
        log.open('empty');
        log.close('empty');

        expect(console.table).not.toHaveBeenCalled();
        expect(console.groupCollapsed).not.toHaveBeenCalled();
    });

    it('implicitly opens a label when add is called before open', () => {
        log.enabled = true;
        log.add('implicit', 'key', 'v');
        log.close('implicit');

        expect(console.table).toHaveBeenCalledWith({ key: ['v'] });
    });

    it('only flushes pending entries on the off→on transition', () => {
        log.enabled = true;
        log.log('first');
        log.enabled = true;

        expect(console.log).toHaveBeenCalledTimes(1);
    });
});
