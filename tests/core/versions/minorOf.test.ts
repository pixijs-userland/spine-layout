import { describe, expect, it } from 'vitest';
import { compareMinors, minorOf } from '../../../src/core/versions/minorOf';

describe('minorOf', () => {
    it.each([
        ['4.3.23', '4.3'],
        ['3.8.99', '3.8'],
        ['4.0.64', '4.0'],
        ['4.3.08', '4.3'],
        ['4.1-from-4.2.43', '4.1'],
        ['3.8-from-4.0-from-4.1-from-4.2-from-4.3.26', '3.8'],
        ['3.3.07', '3.3'],
    ])('reads %s as %s', (version, minor) => {
        expect(minorOf(version)).toBe(minor);
    });

    it.each([undefined, '', '4', 'v4.3.1', 'unknown'])('reads %j as nothing', (version) => {
        expect(minorOf(version)).toBeUndefined();
    });
});

describe('compareMinors', () => {
    it('orders by major, then minor, as numbers', () => {
        expect(['4.3', '3.8', '4.10', '4.0'].sort(compareMinors)).toEqual([
            '3.8',
            '4.0',
            '4.3',
            '4.10',
        ]);
    });
});
