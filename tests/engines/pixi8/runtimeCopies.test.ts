import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../../../', import.meta.url).pathname;

const versionAt = (dir: string) =>
    (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version;

/** The package a resolved file belongs to: the nearest directory above it with a package.json. */
function packageOf(file: string): string {
    let dir = dirname(file);
    while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
    return dir;
}

// spine-pixi-v8 imports spine-core without declaring it; with two copies installed, the root
// package.json's pnpm.packageExtensions is what keeps each on its own version
describe.each(['@esotericsoftware/spine-pixi-v8', 'spine-pixi-v8-42'])('%s', (name) => {
    it('reads with the spine-core of its own version, and the one pixi.js', () => {
        const runtime = realpathSync(join(packageRoot, 'node_modules', name));
        const require = createRequire(join(runtime, 'package.json'));
        const core = packageOf(require.resolve('@esotericsoftware/spine-core'));
        const pixi = realpathSync(join(runtime, '../../pixi.js'));

        expect(versionAt(core)).toBe(versionAt(runtime));
        expect(pixi).toBe(realpathSync(join(packageRoot, 'node_modules/pixi.js')));
    });
});
