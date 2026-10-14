// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { SpineRuntimeAdapter } from '../../../src/engine/Engine';
import type { EsotericModule } from '../../../src/engines/esoteric';
import { createPixi8Engine as createDefaultEngine } from '../../../src/index';
import { createPixi8Engine } from '../../../src/pixi8';
import { esotericRuntime } from '../../../src/runtimes';

const v7 = async (minor: '4.2' | '4.3') =>
    (await import(minor === '4.3' ? 'spine-pixi-v7-43' : 'spine-pixi-v7-42')) as EsotericModule;

const REFUSED = (minor: string) =>
    `createPixi8Engine takes spine-pixi-v8 runtimes; this is @esotericsoftware/spine-pixi-v7 ${minor}`;

describe('createPixi8Engine given a runtime of another Pixi', () => {
    it('refuses a spine-pixi-v7 runtime as it is created', async () => {
        const runtime = esotericRuntime(await v7('4.3'));

        expect(() => createPixi8Engine({ runtimes: [runtime] })).toThrow(REFUSED('4.3'));
    });

    it('refuses one handed to the "." engine too', async () => {
        const runtime = esotericRuntime(await v7('4.2'));

        expect(() => createDefaultEngine({ runtimes: [runtime] })).toThrow(REFUSED('4.2'));
    });

    it('refuses an adapter bound to another Pixi, lazy or not', async () => {
        const { info } = esotericRuntime(await v7('4.2'));
        const bound = { ...info, port: {}, owns: () => false, readsBinary: true };
        const lazy = Object.assign(() => Promise.resolve(bound), info);

        expect(() =>
            createPixi8Engine({ runtimes: [bound as unknown as SpineRuntimeAdapter as never] }),
        ).toThrow(REFUSED('4.2'));
        expect(() => createPixi8Engine({ runtimes: [lazy as never] })).toThrow(REFUSED('4.2'));
    });

    it('rejects the load of a lazy runtime that turns out to be spine-pixi-v7', async () => {
        const engine = createPixi8Engine({ runtimes: [{ minor: '4.2', load: () => v7('4.2') }] });

        await expect(engine.spine.prepare!(['4.2'])).rejects.toThrow(REFUSED('4.2'));
    });

    it('rejects a lazy adapter named for spine-pixi-v8 that loads one bound to another Pixi', async () => {
        const { info } = esotericRuntime(await v7('4.2'));
        const bound = { ...info, port: {}, owns: () => false, readsBinary: true };
        const named = Object.assign(() => Promise.resolve(bound), {
            ...info,
            packageName: '@esotericsoftware/spine-pixi-v8',
        });
        const engine = createPixi8Engine({ runtimes: [named as never] });

        await expect(engine.spine.prepare!(['4.2'])).rejects.toThrow(REFUSED('4.2'));
    });
});
