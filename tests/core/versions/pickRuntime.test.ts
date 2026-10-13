import { describe, expect, it } from 'vitest';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { pickRuntime } from '../../../src/core/versions/pickRuntime';
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

    it('stops at the nearest runtime the chain reaches', () => {
        const only41and43 = runtimesOf(7).filter(({ minor }) => minor === '4.1' || minor === '4.3');

        expect(pickRuntime('4.0.64', only41and43).prePasses).toEqual(['4.0->4.1']);
    });

    it('runs no pre-pass over a binary', () => {
        expect(
            thrown(() => pickRuntime('4.0.64', runtimesOf(8), undefined, { binary: true })),
        ).toMatchObject({
            pixiMajors: [6, 7],
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

    it("prefers the export minor's own runtime, and pre-passes, over a pin", () => {
        expect(pickRuntime('4.2.43', runtimesOf(8), { '4.2': '4.3' }).runtime.minor).toBe('4.2');
        expect(pickRuntime('4.1.24', runtimesOf(8), { '4.1': '4.3' }).runtime.minor).toBe('4.2');
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
