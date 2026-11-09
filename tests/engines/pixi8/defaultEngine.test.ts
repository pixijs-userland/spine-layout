import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import { Assets } from 'pixi.js';
import * as SP42 from 'spine-pixi-v8-42';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { createPixi8Engine, pixi8Engine } from '../../../src/index';
import { esotericRuntime } from '../../../src/runtimes';
import { contractFixture } from '../../engine-contract/contract';

const exportOf = (version: string) => {
    const { skeleton, atlasText } = contractFixture('4.3');
    skeleton.skeleton.spine = version;
    return { skeleton, atlasText };
};

const page = () => ({ 'contract.png': pixi8Engine.display.whiteTexture });

describe('the "." engine, with no options', () => {
    afterEach(() => vi.restoreAllMocks());

    it('is spine-pixi-v8 4.3 alone, and builds without preparing', () => {
        expect(pixi8Engine.spine.runtimes).toEqual([
            {
                minor: '4.3',
                family: 'esoteric',
                packageName: '@esotericsoftware/spine-pixi-v8',
                packageVersion: '4.3.x',
            },
        ]);
        expect(pixi8Engine.spine.prepare).toBeUndefined();
    });

    it.each(['4.3.23', '4.2.43', '4.1.24', '3.8.99'])(
        'reads a %s export with 4.3, as it did before, and says nothing',
        (version) => {
            const warn = vi.spyOn(console, 'warn');
            const { skeleton, atlasText } = exportOf(version);

            const data = pixi8Engine.spine.readSkeleton(skeleton, atlasText, page(), {
                file: 'hero.json',
            });

            expect(data).toBeInstanceOf(SP43.SkeletonData);
            expect(pixi8Engine.spine.create(data)).toBeInstanceOf(SP43.Spine);
            expect(warn).not.toHaveBeenCalled();
        },
    );

    it.each([
        ['no skeleton.spine', undefined],
        ['an empty one', ''],
    ])('reads an export with %s with 4.3, as it did, and says nothing', (_, version) => {
        const warn = vi.spyOn(console, 'warn');
        const { skeleton, atlasText } = exportOf('4.3.23');
        if (version === undefined) delete (skeleton.skeleton as { spine?: string }).spine;
        else skeleton.skeleton.spine = version;

        const data = pixi8Engine.spine.readSkeleton(skeleton, atlasText, page(), {
            file: 'hero.json',
        });

        expect(data).toBeInstanceOf(SP43.SkeletonData);
        expect(warn).not.toHaveBeenCalled();
    });

    it('reads an export of another minor from the asset cache too', () => {
        const warn = vi.spyOn(console, 'warn');
        const { skeleton } = exportOf('4.2.43');
        delete skeleton.skins;
        Assets.cache.set('old.json', skeleton);

        expect(pixi8Engine.spine.readSkeletonFromAssets('old.json')).toBeInstanceOf(
            SP43.SkeletonData,
        );
        expect(warn).not.toHaveBeenCalled();
        Assets.cache.remove('old.json');
    });

    it('is the engine createPixi8Engine() makes, and the one SpineLayout defaults to', async () => {
        const { SpineLayout } = await import('../../../src/index');

        const layout = new SpineLayout() as unknown as { engine: unknown };

        expect(createPixi8Engine().spine.runtimes).toEqual(pixi8Engine.spine.runtimes);
        expect(layout.engine).toBe(pixi8Engine);
    });
});

describe('the "." engine, given runtimes', () => {
    afterEach(() => vi.restoreAllMocks());

    it('adds them to its own 4.3', () => {
        const engine = createPixi8Engine({ runtimes: [esotericRuntime(SP42)] });

        expect(engine.spine.runtimes.map(({ minor }) => minor)).toEqual(['4.3', '4.2']);
    });

    it('takes a 4.3 among them for its own', () => {
        const engine = createPixi8Engine({ runtimes: [esotericRuntime(SP43, '4.3.7')] });

        expect(engine.spine.runtimes).toEqual([
            expect.objectContaining({ minor: '4.3', packageVersion: '4.3.7' }),
        ]);
    });

    it('reads each export by the runtime its version picks, refusing one none reads', () => {
        const engine = createPixi8Engine({ runtimes: [esotericRuntime(SP42)] });
        const read = (version: string) => {
            const { skeleton, atlasText } = exportOf(version);
            return engine.spine.readSkeleton(skeleton, atlasText, page(), { file: 'hero.json' });
        };

        expect(read('4.3.23')).toBeInstanceOf(SP43.SkeletonData);
        expect(read('4.2.43')).toBeInstanceOf(SP42.SkeletonData);
        expect(() => read('3.8.99')).toThrow(UnsupportedSpineVersionError);
        expect(() => read('3.8.99')).toThrow(/hero\.json/);
        expect(() => read('')).toThrow(
            'hero.json: no export version — registered runtimes: 4.3, 4.2; a runtime is picked by the version an export names, or by a pin under "*"',
        );
    });

    it('cross-reads what the pin says, and reports it where it is told', () => {
        const warn = vi.fn();
        const engine = createPixi8Engine({ runtimes: [], pin: { '4.2': '4.3' }, warn });
        const { skeleton, atlasText } = exportOf('4.2.43');

        const data = engine.spine.readSkeleton(skeleton, atlasText, page(), { file: 'bg.json' });

        expect(data).toBeInstanceOf(SP43.SkeletonData);
        expect(warn).toHaveBeenCalledWith(
            expect.stringMatching(/^bg\.json: Spine 4\.2\.43 cross-read by the 4\.3 runtime/),
        );
    });
});
