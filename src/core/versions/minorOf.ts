const MAJOR_MINOR = /^(\d+)\.(\d+)/;

/**
 * An export version's major.minor — the part a runtime must match. A downgraded export names
 * its target first: `4.1-from-4.2.43` is a 4.1 export.
 */
export function minorOf(version: string | undefined): string | undefined {
    const match = version?.match(MAJOR_MINOR);

    return match ? `${Number(match[1])}.${Number(match[2])}` : undefined;
}

export function compareMinors(a: string, b: string): number {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);

    return aMajor - bMajor || aMinor - bMinor;
}
