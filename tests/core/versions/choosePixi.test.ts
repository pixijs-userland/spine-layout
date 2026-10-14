import { describe, expect, it } from 'vitest';
import { choosePixi, type ExportVersion } from '../../../src/core/versions/choosePixi';

/** One `{ file, version }` per copy, as a folder scan reports them. */
const folder = (versions: Record<string, number>): ExportVersion[] =>
    Object.entries(versions).flatMap(([version, count]) =>
        Array.from({ length: count }, (_, i) => ({ file: `${version}-${i}.json`, version })),
    );

const runtimesOf = (choice: ReturnType<typeof choosePixi>) =>
    choice.runtimes.map(({ minor }) => minor);

describe('choosePixi', () => {
    it.each([
        ['4.3', ['4.3.23'], 8],
        ['4.2', ['4.2.43'], 8],
        ['4.1', ['4.1.24'], 7],
        ['4.0', ['4.0.64'], 7],
        ['3.8', ['3.8.99'], 4],
        ['3.7', ['3.7.94'], 4],
    ])('opens %s exports on their default Pixi', (_, versions, pixi) => {
        expect(choosePixi(versions)).toMatchObject({ pixi, reason: 'default' });
    });

    // version sets of real mixed folders on this machine (spikes/editor-default-pixi/aggregate.txt)
    it.each([
        ['4.2 and 4.3 (slot skins)', { '4.3.23': 1, '4.2.43': 2, '4.3.08': 1 }, 8, ['4.2', '4.3']],
        ['4.2 and 4.3 (assetpack output)', { '4.2.43': 5, '4.3.17': 3 }, 8, ['4.2', '4.3']],
        [
            '4.1, 4.2 and 4.3 (f2p)',
            { '4.3.17': 2, '4.2.43': 2, '4.1-from-4.2.43': 1 },
            8,
            ['4.2', '4.3'],
        ],
        [
            '4.1 and 4.3 (f2p)',
            { '4.3.13': 2, '4.3.15': 2, '4.1-from-4.2.43': 1 },
            8,
            ['4.2', '4.3'],
        ],
        ['4.1 and 4.2 (web-sdk)', { '4.1-from-4.2.38': 175, '4.2.43': 6 }, 8, ['4.2']],
        [
            '4.0 and 4.1 (slot)',
            { '4.0.64': 19, '4.0.61': 2, '4.1.23': 7, '4.1-from-4.2.37': 15, '4.0.63': 2 },
            7,
            ['4.1'],
        ],
        [
            '3.8 downgraded from 4.3',
            { '3.8-from-4.0-from-4.1-from-4.2-from-4.3.26': 5 },
            4,
            ['3.8'],
        ],
    ])("opens %s on the newest minor's default Pixi", (_, versions, pixi, runtimes) => {
        const choice = choosePixi(folder(versions));

        expect(choice).toMatchObject({ pixi, reason: 'default' });
        expect(runtimesOf(choice)).toEqual(runtimes);
        choice.perFile.forEach((file) => expect(file).not.toHaveProperty('error'));
    });

    it('pre-passes a 4.1 export it opens on Pixi 8, and says so', () => {
        const choice = choosePixi([
            { file: 'prize.json', version: '4.1-from-4.2.43' },
            { file: 'coin.json', version: '4.3.17' },
        ]);

        expect(choice.perFile[0]).toMatchObject({
            file: 'prize.json',
            runtimeMinor: '4.2',
            prePasses: ['4.1->4.2'],
            warning: expect.stringContaining('prize.json'),
        });
        expect(choice.perFile[1]).toEqual({
            file: 'coin.json',
            version: '4.3.17',
            runtimeMinor: '4.3',
            prePasses: [],
        });
    });

    it('takes the newest Pixi that reads every export when the default does not', () => {
        const choice = choosePixi(folder({ '4.3.23': 1, '3.8.99': 1 }));

        expect(choice).toMatchObject({ pixi: 7, reason: 'covering' });
        expect(runtimesOf(choice)).toEqual(['3.8', '4.3']);
        expect(choice.message).toBe(
            'Pixi 7, the newest that reads every export; Pixi 8, the default for 4.3, does not',
        );
    });

    it('opens 3.7 and 3.8 together past Pixi 4 and 5, which load one runtime a page', () => {
        expect(choosePixi(folder({ '3.7.94': 1, '3.8.99': 1 }))).toMatchObject({
            pixi: 7,
            reason: 'covering',
        });
    });

    it('opens a binary 4.0 export only where a runtime reads it as it is', () => {
        expect(choosePixi([{ file: 'a.skel', version: '4.0.64', binary: true }])).toMatchObject({
            pixi: 6,
            reason: 'covering',
        });

        const mixed = choosePixi([
            { file: 'a.skel', version: '4.0.64', binary: true },
            { file: 'b.json', version: '4.3.23' },
        ]);

        expect(mixed).toMatchObject({ pixi: 8, reason: 'uncovered' });
        expect(mixed.perFile.find((entry) => entry.file === 'a.skel')).toHaveProperty('error');
    });

    it('keeps the pinned Pixi, and skips what it cannot read', () => {
        const choice = choosePixi(folder({ '4.3.23': 1, '3.8.99': 1 }), { pixi: 4 });

        expect(choice).toMatchObject({
            pixi: 4,
            reason: 'pinned',
            message: 'Pixi 4, pinned by the project',
        });
        expect(choice.perFile[0]).toMatchObject({
            version: '4.3.23',
            error: {
                name: 'UnsupportedSpineVersionError',
                registered: ['3.8'],
                pixiMajors: [7, 8],
            },
        });
        expect(choice.perFile[1]).toMatchObject({ runtimeMinor: '3.8' });
    });

    it('cross-reads with the pinned runtime wherever the Pixi has it', () => {
        const pinned = choosePixi(folder({ '4.2.43': 1 }), { pixi: 6, spine: { '4.2': '4.1' } });

        expect(pinned.perFile[0]).toMatchObject({
            runtimeMinor: '4.1',
            prePasses: [],
            warning: expect.stringContaining('cross-read by the 4.1 runtime'),
        });
        expect(runtimesOf(pinned)).toEqual(['4.1']);

        const own = choosePixi(folder({ '4.2.43': 1 }), { pixi: 7, spine: { '4.2': '4.1' } });
        const prePassed = choosePixi(folder({ '4.1.24': 1 }), { pixi: 8, spine: { '4.1': '4.3' } });
        const goosicorn = choosePixi(folder({ '4.2.43': 2, '4.3.23': 1 }), {
            spine: { '4.2': '4.3' },
        });

        expect(own.perFile[0]).toMatchObject({ runtimeMinor: '4.1', prePasses: [] });
        expect(prePassed.perFile[0]).toMatchObject({ runtimeMinor: '4.3', prePasses: [] });
        expect(goosicorn).toMatchObject({ pixi: 8, reason: 'default' });
        expect(runtimesOf(goosicorn)).toEqual(['4.3']);
    });

    it('names in a cross-read warning the constraint lists a scan kept of each JSON', () => {
        const choice = choosePixi(
            [
                { file: 'aim.json', version: '4.2.43', json: { ik: [{ name: 'aim' }] } },
                { file: 'plain.json', version: '4.2.43', json: {} },
                { file: 'unknown.json', version: '4.2.43' },
            ],
            { spine: { '4.2': '4.3' } },
        );

        expect(choice.perFile.map((entry) => 'warning' in entry && entry.warning)).toEqual([
            expect.stringMatching(
                /^aim\.json: .*: its top-level ik constraints are not read; it may throw$/,
            ),
            expect.stringMatching(
                /^plain\.json: .*: it has no top-level ik\/transform\/path\/physics constraints, so nothing is expected to be lost$/,
            ),
            expect.stringMatching(
                /^unknown\.json: .*: any top-level ik\/transform\/path\/physics constraints are not read; exports with them may throw$/,
            ),
        ]);
    });

    it('loads the pinned runtime on a Pixi that loads one runtime a page', () => {
        const choice = choosePixi(folder({ '3.8.99': 2 }), { pixi: 4, spine: { '3.8': '3.7' } });

        expect(runtimesOf(choice)).toEqual(['3.7']);
        expect(choice.perFile[0]).toMatchObject({
            runtimeMinor: '3.7',
            warning: expect.stringContaining('cross-read by the 3.7 runtime'),
        });
    });

    it('names the newest export minor it starts from', () => {
        expect(choosePixi(folder({ '4.1-from-4.2.43': 1, '4.2.43': 1 })).newest).toBe('4.2');
        expect(choosePixi(folder({ '3.3.07': 1, '4.1.24': 1 })).newest).toBe('4.1');
        expect(choosePixi(folder({ '4.3.23': 1 }), { pixi: 7 }).newest).toBe('4.3');
        expect(choosePixi(folder({ '3.3.07': 1 }))).not.toHaveProperty('newest');
        expect(choosePixi([])).not.toHaveProperty('newest');
    });

    it('skips what no Pixi reads, and opens on Pixi 8 when nothing is readable', () => {
        expect(choosePixi([])).toMatchObject({
            pixi: 8,
            reason: 'none',
            runtimes: [],
            perFile: [],
        });

        const choice = choosePixi(folder({ '3.3.07': 1 }));

        expect(choice).toMatchObject({ pixi: 8, reason: 'none' });
        expect(choice.perFile[0]).toMatchObject({ error: { version: '3.3.07', pixiMajors: [] } });
    });

    it('decides by the newest readable minor, leaving unreadable ones out of it', () => {
        const choice = choosePixi(folder({ '3.3.07': 1, '4.1.24': 2 }));

        expect(choice).toMatchObject({ pixi: 7, reason: 'default' });
        expect(choice.perFile.filter((file) => 'error' in file)).toHaveLength(1);
    });

    it('takes bare version strings too', () => {
        expect(choosePixi(['4.3.23', '4.2.43'])).toMatchObject({ pixi: 8, reason: 'default' });
    });
});
