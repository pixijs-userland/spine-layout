import { describe, expect, it } from 'vitest';
import { skeletonVersion } from '../../src/core/utils/skeletonVersion';

/** spine-ts `BinaryInput.readString`: the byte count plus one as a varint, then the bytes. */
function string(value: string | null): number[] {
    if (value === null) return [0];
    const bytes = [...new TextEncoder().encode(value)];
    return [bytes.length + 1, ...bytes];
}

describe('skeletonVersion', () => {
    it('reads `skeleton.spine` off a JSON export', () => {
        expect(skeletonVersion({ skeleton: { spine: '4.3.23' } } as never)).toBe('4.3.23');
        expect(skeletonVersion({ skins: [] })).toBeUndefined();
    });

    it('reads a 4.x binary: an eight-byte hash, then the version', () => {
        const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, ...string('4.3.23'), 0, 0]);

        expect(skeletonVersion(bytes)).toBe('4.3.23');
        expect(skeletonVersion(bytes.buffer)).toBe('4.3.23');
    });

    it('reads a 3.8 binary: the hash as a string, then the version', () => {
        const bytes = new Uint8Array([...string('Qb3x7hK2LmZ'), ...string('3.8.99'), 0, 0]);

        expect(skeletonVersion(bytes)).toBe('3.8.99');
    });

    it('reads a 3.8 binary exported without a hash', () => {
        expect(skeletonVersion(new Uint8Array([...string(null), ...string('3.8.95')]))).toBe('3.8.95');
    });

    it('answers nothing for bytes that are no skeleton', () => {
        expect(skeletonVersion(new Uint8Array([1, 2, 3]))).toBeUndefined();
    });
});
