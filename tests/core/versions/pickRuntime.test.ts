import { describe, expect, it } from 'vitest';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { constraintLists, pickRuntime, UNVERSIONED } from '../../../src/core/versions/pickRuntime';
import { runtimesOf } from '../../../src/core/versions/runtimeMatrix';

const thrown = (run: () => unknown) => {
    try {
        run();
    } catch (error) {
        return error;
    }
    throw new Error('did not throw');
};

describe('pickRuntime', () => {
    it("takes the export minor's own runtime first", () => {
        const pick = pickRuntime('4.2.43', runtimesOf(8));

        expect(pick.runtime).toMatchObject({
            minor: '4.2',
            packageName: '@esotericsoftware/spine-pixi-v8',
        });
        expect(pick.prePasses).toEqual([]);
        expect(pick.warning).toBeUndefined();
    });

    it('reads a downgraded export by its leading minor', () => {
        expect(pickRuntime('4.1-from-4.2.43', runtimesOf(7)).runtime.minor).toBe('4.1');
        expect(
            pickRuntime('3.8-from-4.0-from-4.1-from-4.2-from-4.3.26', runtimesOf(4)).runtime.minor,
        ).toBe('3.8');
    });

    it('else the nearest newer runtime the pre-passes reach, with a warning', () => {
        const pick = pickRuntime('4.1-from-4.2.43', runtimesOf(8), undefined, {
            file: 'prize.json',
        });

        expect(pick.runtime.minor).toBe('4.2');
        expect(pick.prePasses).toEqual(['4.1->4.2']);
        expect(pick.warning).toMatch(
            /^prize\.json: Spine 4\.1-from-4\.2\.43 read by the 4\.2 runtime/,
        );
    });

    it('chains the pre-passes from 4.0', () => {
        const pick = pickRuntime('4.0.64', runtimesOf(8));

        expect(pick.runtime.minor).toBe('4.2');
        expect(pick.prePasses).toEqual(['4.0->4.1', '4.1->4.2']);
    });

    it('says "pre-pass" for the one it runs, and "pre-passes" for more', () => {
        expect(pickRuntime('4.1.24', runtimesOf(8)).warning).toBe(
            'Spine 4.1.24 read by the 4.2 runtime after pre-pass 4.1->4.2 (bone transform -> inherit)',
        );
        expect(pickRuntime('4.0.64', runtimesOf(8)).warning).toBe(
            'Spine 4.0.64 read by the 4.2 runtime after pre-passes 4.0->4.1 (animation deform -> attachments), ' +
                '4.1->4.2 (bone transform -> inherit)',
        );
        expect(pickRuntime('4.0.64', runtimesOf(8), { '4.0': '4.3' }).warning).toMatch(
            /^Spine 4\.0\.64 cross-read by the 4\.3 runtime, as the project pins over the 4\.2 runtime after pre-passes 4\.0->4\.1, 4\.1->4\.2: /,
        );
    });

    it('stops at the nearest runtime the chain reaches', () => {
        const only41and43 = runtimesOf(7).filter(({ minor }) => minor === '4.1' || minor === '4.3');

        expect(pickRuntime('4.0.64', only41and43).prePasses).toEqual(['4.0->4.1']);
    });

    it('runs no pre-pass over a binary', () => {
        expect(
            thrown(() => pickRuntime('4.0.64', runtimesOf(8), undefined, { binary: true })),
        ).toMatchObject({
            pixiMajors: [6],
        });
    });

    it('cross-reads only where the pin names the runtime, warning what it loses', () => {
        const only43 = runtimesOf(8).filter(({ minor }) => minor === '4.3');

        expect(thrown(() => pickRuntime('4.2.43', only43))).toBeInstanceOf(
            UnsupportedSpineVersionError,
        );

        const pick = pickRuntime('4.2.43', only43, { '4.2': '4.3' });

        expect(pick.runtime.minor).toBe('4.3');
        expect(pick.prePasses).toEqual([]);
        expect(pick.warning).toMatch(
            /cross-read by the 4\.3 runtime, as the project pins: .*constraints/,
        );
    });

    it("takes a registered pinned runtime over the export minor's own, as goosicorn's games read 4.2", () => {
        const pick = pickRuntime('4.2.43', runtimesOf(8), { '4.2': '4.3' }, { file: 'bg.json' });

        expect(pick.runtime.minor).toBe('4.3');
        expect(pick.prePasses).toEqual([]);
        expect(pick.warning).toBe(
            'bg.json: Spine 4.2.43 cross-read by the 4.3 runtime, as the project pins over its own ' +
                '4.2 runtime: any top-level ik/transform/path/physics constraints are not read; ' +
                'exports with them may throw',
        );
    });

    it('names the constraint sections of a 4.2 JSON the 4.3 runtime does not read, or that it has none', () => {
        const crossRead = (json: Record<string, unknown>) =>
            pickRuntime('4.2.43', runtimesOf(8), { '4.2': '4.3' }, { file: 'bg.json', json })
                .warning;

        expect(
            crossRead({ ik: [{ name: 'aim' }], transform: [], physics: [{ name: 'hair' }] }),
        ).toBe(
            'bg.json: Spine 4.2.43 cross-read by the 4.3 runtime, as the project pins over its own ' +
                '4.2 runtime: its top-level ik/physics constraints are not read; it may throw',
        );
        expect(crossRead({ bones: [{ name: 'root' }], transform: [] })).toBe(
            'bg.json: Spine 4.2.43 cross-read by the 4.3 runtime, as the project pins over its own ' +
                '4.2 runtime: it has no top-level ik/transform/path/physics constraints, so nothing ' +
                'is expected to be lost',
        );
    });

    it('keeps of a JSON its constraint lists, which name in a warning what the JSON would', () => {
        const json = {
            skeleton: { spine: '4.2.43' },
            bones: [{ name: 'root' }],
            ik: [{ name: 'aim' }],
            transform: [],
            animations: { idle: {} },
        };
        const warningOf = (from: Record<string, unknown>) =>
            pickRuntime('4.2.43', runtimesOf(8), { '4.2': '4.3' }, { json: from }).warning;

        expect(constraintLists(json)).toEqual({ ik: [{ name: 'aim' }], transform: [] });
        expect(constraintLists({ bones: [] })).toEqual({});
        expect(warningOf(constraintLists(json))).toBe(warningOf(json));
        expect(warningOf(constraintLists({ bones: [] }))).toBe(warningOf({ bones: [] }));
    });

    it('takes a registered pinned runtime over a pre-pass route, and runs no pre-pass', () => {
        const pick = pickRuntime('4.1.24', runtimesOf(8), { '4.1': '4.3' });

        expect(pick.runtime.minor).toBe('4.3');
        expect(pick.prePasses).toEqual([]);
        expect(pick.warning).toMatch(
            /cross-read by the 4\.3 runtime, as the project pins over the 4\.2 runtime after pre-pass 4\.1->4\.2: bone `transform` and every constraint are lost/,
        );
        expect(pickRuntime('4.0.64', runtimesOf(7), { '4.0': '4.1' })).toMatchObject({
            runtime: { minor: '4.1', packageName: '@pixi-spine/runtime-4.1' },
            prePasses: [],
            warning: expect.stringMatching(
                /: none measured: pixi-spine's runtime-4\.1 converts a 4\.0 export itself, as the 4\.0->4\.1 pre-pass does$/,
            ),
        });
    });

    it('names what a cross-read loses by the family of the runtime that reads it', () => {
        const spineCore41 = { ...runtimesOf(7)[2], family: 'esoteric' };

        expect(spineCore41.minor).toBe('4.1');
        expect(pickRuntime('4.0.64', [spineCore41], { '4.0': '4.1' }).warning).toMatch(
            /: its mesh deform keys are dropped$/,
        );
    });

    it(`reads an export that names no version with the runtime pinned under "${UNVERSIONED}"`, () => {
        expect(UNVERSIONED).toBe('*');
        expect(pickRuntime(undefined, runtimesOf(8), { '*': '4.3' }, { file: 'bg.json' })).toEqual({
            runtime: runtimesOf(8)[1],
            prePasses: [],
            warning:
                'bg.json: the export names no Spine version: read by the 4.3 runtime, as the project pins',
        });
        expect(pickRuntime('', runtimesOf(8), { '*': '4.2' }).runtime.minor).toBe('4.2');
        expect(pickRuntime('4.2.43', runtimesOf(8), { '*': '4.3' }).runtime.minor).toBe('4.2');
        expect(thrown(() => pickRuntime(undefined, runtimesOf(8), { '*': '3.8' }))).toBeInstanceOf(
            UnsupportedSpineVersionError,
        );
    });

    it('cross-reads a binary as its pin says', () => {
        const pick = pickRuntime('4.2.43', runtimesOf(8), { '4.2': '4.3' }, { binary: true });

        expect(pick).toMatchObject({ runtime: { minor: '4.3' }, prePasses: [] });
    });

    it('ignores a pin whose runtime is not registered, or that names the minor itself', () => {
        expect(pickRuntime('4.2.43', runtimesOf(8), { '4.2': '4.1' })).toEqual(
            pickRuntime('4.2.43', runtimesOf(8)),
        );
        expect(pickRuntime('4.1.24', runtimesOf(8), { '4.1': '4.1' })).toEqual(
            pickRuntime('4.1.24', runtimesOf(8)),
        );
        expect(pickRuntime('4.2.43', runtimesOf(8), { '4.2': '4.2' }).warning).toBeUndefined();
    });

    it('names the file, its version, the registered runtimes and the Pixi that could render it', () => {
        const error = thrown(() =>
            pickRuntime('3.8.99', runtimesOf(8), undefined, { file: 'bg.json' }),
        ) as UnsupportedSpineVersionError;

        expect(error).toBeInstanceOf(UnsupportedSpineVersionError);
        expect(error).toMatchObject({
            file: 'bg.json',
            version: '3.8.99',
            registered: ['4.2', '4.3'],
            pixiMajors: [4, 5, 6, 7],
        });
        expect(error.message).toBe(
            'bg.json: Spine 3.8.99 — registered runtimes: 4.2, 4.3; Pixi 4, 5, 6, 7 can render it',
        );
    });

    it('reports what no Pixi reads', () => {
        expect(thrown(() => pickRuntime('3.3.07', runtimesOf(7)))).toMatchObject({
            pixiMajors: [],
        });
        expect(thrown(() => pickRuntime(undefined, runtimesOf(7)))).toMatchObject({
            version: undefined,
            pixiMajors: [],
            message:
                'no export version — registered runtimes: 3.7, 3.8, 4.1, 4.2, 4.3; a runtime is picked by the version an export names, or by a pin under "*"',
        });
        expect(thrown(() => pickRuntime('', runtimesOf(8)))).toMatchObject({
            version: '',
            message:
                'no export version — registered runtimes: 4.2, 4.3; a runtime is picked by the version an export names, or by a pin under "*"',
        });
        expect(
            thrown(() => pickRuntime('3.7.94', runtimesOf(7), undefined, { binary: true })),
        ).toMatchObject({
            pixiMajors: [],
        });
    });

    it('reads 4.1 on Pixi 6 and 4.3 nowhere before Pixi 7', () => {
        expect(pickRuntime('4.1.24', runtimesOf(6)).runtime.packageVersion).toBe('3.1.2');
        expect(thrown(() => pickRuntime('4.3.23', runtimesOf(6)))).toMatchObject({
            pixiMajors: [7, 8],
        });
    });
});
