import { describe, expect, it } from 'vitest';
import { findNumber, formatNumber } from '../../src/core/utils/numberText';

describe('findNumber', () => {
    it.each([
        ['42', 42, ''],
        ['x2.5', 2.5, 'x'],
        ['12.50 €', 12.5, ''],
        ['0.125', 0.125, ''],
        ['12,5', 12.5, ''],
        ['1,000', 1000, ''],
        ['1.000.000', 1_000_000, ''],
        ['1,000,000', 1_000_000, ''],
        ['$1,234.56', 1234.56, '$'],
        ['1.234,56', 1234.56, ''],
        ['WIN: 25,000.', 25_000, 'WIN: '],
    ])('reads %s as %d', (text, value, prefix) => {
        expect(findNumber(text)).toMatchObject({ value, prefix });
    });

    it('leaves a trailing full stop to the suffix', () => {
        expect(findNumber('WIN 100.')).toMatchObject({ value: 100, suffix: '.' });
    });

    it('reads an ambiguous figure the way the target it counts to is written', () => {
        expect(findNumber('1.500', { decimals: 3, decimal: '.', group: '' })?.value).toBe(1.5);
        expect(findNumber('1.500', findNumber('2.500.000')!.format)?.value).toBe(1500);
    });

    it('finds nothing without a digit', () => {
        expect(findNumber('WIN')).toBeUndefined();
    });
});

describe('formatNumber', () => {
    it.each([
        ['1.000.000', 2_500_000, '2.500.000'],
        ['1,234.56', 9876.5, '9,876.50'],
        ['1.234,56', 9876.5, '9.876,50'],
        ['12,5', 3, '3,0'],
        ['42', 1234, '1234'],
    ])('writes like %s', (like, value, out) => {
        expect(formatNumber(value, findNumber(like)!.format)).toBe(out);
    });
});
