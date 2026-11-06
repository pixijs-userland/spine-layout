import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../../../', import.meta.url).pathname;

/** What a game's bundler makes of an entry: the packages it imports, and the sources it keeps. */
async function bundle(entry: string) {
    const { metafile } = await build({
        entryPoints: [`${packageRoot}${entry}`],
        bundle: true,
        write: false,
        metafile: true,
        minify: true,
        format: 'esm',
        packages: 'external',
        logLevel: 'silent',
    });
    const [output] = Object.values(metafile.outputs);

    return {
        imports: [...new Set(output.imports.map(({ path }) => path))],
        kept: Object.entries(output.inputs)
            .filter(([, input]) => input.bytesInOutput > 0)
            .map(([path]) => path),
    };
}

const spines = (paths: string[]) => paths.filter((path) => /spine/.test(path));

describe('what each entry brings into a game', () => {
    it('"./pixi8" imports pixi.js and no Spine runtime: its caller hands them in', async () => {
        const { imports } = await bundle('src/pixi8.ts');

        expect(imports).toContain('pixi.js');
        expect(spines(imports)).toEqual([]);
    });

    it('"." imports spine-pixi-v8 alone, as it did, and renders it through the esoteric port', async () => {
        const { imports, kept } = await bundle('src/index.ts');

        expect(spines(imports)).toEqual(['@esotericsoftware/spine-pixi-v8']);
        expect(kept).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/src\/engines\/esoteric\/display\.v8\.ts$/),
                expect.stringMatching(/src\/engines\/esoteric\/spine\.port\.ts$/),
            ]),
        );
        expect(kept.filter((path) => /engines\/(legacy|pixi4)\//.test(path))).toEqual([]);
    });

    it('"." keeps nothing it cannot run: no pixi-spine port, no v7 display, no runtime adapters', async () => {
        const { kept } = await bundle('src/index.ts');

        expect(
            kept.filter((path) =>
                /src\/(engines\/pixiSpine\/|engines\/esoteric\/display\.v7\.ts|runtimes\/)/.test(
                    path,
                ),
            ),
        ).toEqual([]);
    });
});
