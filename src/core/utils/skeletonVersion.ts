import { isBinarySkeleton, type SkeletonSource } from '../../engine/runtime';

const VERSION = /^\d+\.\d+/;

/** spine-ts `BinaryInput.readString`: a varint of the byte count plus one, then UTF-8. */
function readString(bytes: Uint8Array, offset: number): { value: string | null; end: number } | undefined {
    let count = 0;
    let shift = 0;
    let at = offset;

    for (;;) {
        if (at >= bytes.length || shift > 28) return undefined;

        const byte = bytes[at++];

        count |= (byte & 0x7f) << shift;
        if (!(byte & 0x80)) break;
        shift += 7;
    }

    if (count === 0) return { value: null, end: at };

    const end = at + count - 1;
    if (end > bytes.length) return undefined;

    return { value: new TextDecoder().decode(bytes.subarray(at, end)), end };
}

function versionAt(bytes: Uint8Array, offset: number): string | undefined {
    const value = readString(bytes, offset)?.value;

    return value && VERSION.test(value) ? value : undefined;
}

/**
 * The Spine version a skeleton was exported from — `"4.3.23"`, `"3.8.99"` — or `undefined` when
 * it does not say.
 *
 * A `.json` names it in `skeleton.spine`. A `.skel` opens with a hash and then the version: in
 * 4.x the hash is eight raw bytes, in 3.8 a string of its own, so both layouts are tried.
 */
export function skeletonVersion(source: SkeletonSource): string | undefined {
    if (!isBinarySkeleton(source)) {
        const version = (source as { skeleton?: { spine?: unknown } }).skeleton?.spine;

        return typeof version === 'string' ? version : undefined;
    }

    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const hash = readString(bytes, 0);

    return versionAt(bytes, 8) ?? (hash ? versionAt(bytes, hash.end) : undefined);
}
