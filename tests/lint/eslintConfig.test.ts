import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const packageDir = join(import.meta.dirname, '../..');
const neighbour = join(import.meta.dirname, '../fixtures/eslint-neighbour');

function resolvable(name: string): boolean {
    try {
        createRequire(join(packageDir, 'package.json')).resolve(name);
        return true;
    } catch {
        return false;
    }
}

// the config's plugins come from the monorepo this package is checked out in, not its own deps
const configDeps = ['typescript-eslint', '@eslint/js'];

describe.skipIf(!configDeps.every(resolvable))('eslint.config.mjs', () => {
    it("parses this package's files in a process that loaded another typescript-eslint config first, as the editor's dev server does", async () => {
        await new ESLint({ cwd: neighbour }).lintText('export const a = 1;\n', {
            filePath: join(neighbour, 'a.ts'),
        });

        const [result] = await new ESLint({ cwd: packageDir }).lintFiles(['src/core.ts']);

        expect(result.messages.filter(({ fatal }) => fatal)).toEqual([]);
    });
});
