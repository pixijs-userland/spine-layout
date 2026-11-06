import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = resolve(__dirname, '../src');

/** Every module of `src` an entry reaches through its static imports and re-exports (types left out). */
function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const visit = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        const code = readFileSync(file, 'utf8');
        const specifiers = code.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'|^import\s+'([^']+)'/gms);
        for (const [, from, bare] of specifiers) {
            const specifier = from ?? bare;
            if (!specifier.startsWith('.')) {
                seen.add(specifier);
                continue;
            }
            const base = resolve(dirname(file), specifier);
            const candidates = [`${base}.ts`, resolve(base, 'index.ts')];
            const found = candidates.find((candidate) => {
                try {
                    readFileSync(candidate);
                    return true;
                } catch {
                    return false;
                }
            });
            if (found) visit(found);
        }
    };
    visit(resolve(src, entry));
    return seen;
}

describe('entries', () => {
    it.each(['core.ts', 'pixi4.ts'])('%s does not import Howler or the built-in player', (entry) => {
        const modules = reachable(entry);
        expect(modules.has('howler')).toBe(false);
        expect(modules.has(resolve(src, 'core/controllers/Sounds.controller.ts'))).toBe(false);
    });

    it.each(['index.ts', 'howler.ts'])('%s brings the built-in player', (entry) => {
        expect(reachable(entry).has('howler')).toBe(true);
    });
});
