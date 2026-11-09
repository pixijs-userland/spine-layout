import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ATLAS, contractSkeleton } from '../pixiSpine/fixtures';
import { launchChrome, type Chrome } from './chrome/cdp';
import type { Box, CheckInput, run } from './chrome/page';
import type { Pixi5Minor } from './loadPixi5';

type Check = ReturnType<typeof run>;

interface Pixi5Bundles {
    version: string;
    script: string;
    particles: { script: string };
    runtimes: Record<Pixi5Minor, { packageVersion: string; script: string }>;
}

/**
 * Run with `SPINE_LAYOUT_CHROME` naming a Chrome binary. The bundles are app-magic-editor's
 * `public/runtimes`, which its `scripts/build-runtimes.mjs` generates, or the folder
 * `SPINE_LAYOUT_PIXI_RUNTIMES` names.
 */
const CHROME = process.env.SPINE_LAYOUT_CHROME;
const RUNTIMES =
    process.env.SPINE_LAYOUT_PIXI_RUNTIMES ??
    fileURLToPath(new URL('../../../../../apps/app-magic-editor/public/runtimes', import.meta.url));
const MANIFEST = join(RUNTIMES, 'manifest.json');
const BUNDLES: Pixi5Bundles | undefined = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8')).pixi?.['5']
    : undefined;

const OTHER: Record<Pixi5Minor, Pixi5Minor> = { '3.7': '3.8', '3.8': '3.7' };

/** What SwiftShader says of the check's own `getImageData` of the WebGL canvas. */
const READBACK_STALL =
    /GL Driver Message \([^,]+, Performance, [^)]+\): GPU stall due to ReadPixels/;

function near(box: Box | null, expected: Box | null) {
    expect(box).not.toBeNull();
    (['left', 'top', 'right', 'bottom'] as const).forEach((side) =>
        expect(Math.abs(box![side] - expected![side]), side).toBeLessThanOrEqual(1),
    );
}

describe.skipIf(!CHROME || !BUNDLES)(
    "pixi5 in headless Chrome, on the editor's Pixi 5 bundles",
    () => {
        const bundles = BUNDLES!;
        const results: Partial<Record<Pixi5Minor, Check>> = {};
        let chrome: Chrome;
        let dir: string;

        beforeAll(async () => {
            dir = mkdtempSync(join(tmpdir(), 'spine-layout-pixi5-'));

            const page = await build({
                entryPoints: [fileURLToPath(new URL('./chrome/page.ts', import.meta.url))],
                bundle: true,
                format: 'iife',
                globalName: 'Pixi5Check',
                platform: 'browser',
                write: false,
                logLevel: 'silent',
            });
            writeFileSync(join(dir, 'check.js'), page.outputFiles[0].text);

            chrome = launchChrome(CHROME!, join(dir, 'profile'));
        }, 60_000);

        afterAll(async () => {
            await chrome?.close();
            if (dir) rmSync(dir, { recursive: true, force: true });
        });

        /** One tab per minor, with only that minor's pixi-spine on it, as the editor loads a stack. */
        async function openPage(minor: Pixi5Minor) {
            const scripts = [
                bundles.script,
                bundles.particles.script,
                bundles.runtimes[minor].script,
            ]
                .map(
                    (script) =>
                        `<script src="${pathToFileURL(join(RUNTIMES, script)).href}"></script>`,
                )
                .join('\n');
            const file = join(dir, `pixi5-${minor}.html`);
            writeFileSync(
                file,
                `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head>` +
                    `<body>\n${scripts}\n<script src="check.js"></script></body></html>`,
            );

            const { targetId } = await chrome.send<{ targetId: string }>('Target.createTarget', {
                url: 'about:blank',
            });
            const { sessionId } = await chrome.send<{ sessionId: string }>(
                'Target.attachToTarget',
                {
                    targetId,
                    flatten: true,
                },
            );
            const problems: string[] = [];
            const mine = (session?: string) => session === sessionId;

            chrome.on('Runtime.consoleAPICalled', (params, session) => {
                if (mine(session) && params.type !== 'log' && params.type !== 'info') {
                    problems.push(`${params.type}: ${JSON.stringify(params.args)}`);
                }
            });
            chrome.on('Runtime.exceptionThrown', (params, session) => {
                if (mine(session))
                    problems.push(`exception: ${JSON.stringify(params.exceptionDetails)}`);
            });
            chrome.on('Log.entryAdded', (params, session) => {
                const entry = params.entry as { level: string; text: string };
                const reported = entry.level === 'warning' || entry.level === 'error';
                if (mine(session) && reported && !READBACK_STALL.test(entry.text)) {
                    problems.push(`${entry.level}: ${entry.text}`);
                }
            });

            const loaded = new Promise<void>((resolve) =>
                chrome.on('Page.loadEventFired', (_, session) => mine(session) && resolve()),
            );
            await chrome.send('Runtime.enable', {}, sessionId);
            await chrome.send('Log.enable', {}, sessionId);
            await chrome.send('Page.enable', {}, sessionId);
            await chrome.send('Page.navigate', { url: pathToFileURL(file).href }, sessionId);
            await loaded;

            async function evaluate<R>(expression: string): Promise<R> {
                const { result, exceptionDetails } = await chrome.send<{
                    result: { value: R };
                    exceptionDetails?: { text: string; exception?: { description?: string } };
                }>(
                    'Runtime.evaluate',
                    { expression, awaitPromise: true, returnByValue: true },
                    sessionId,
                );
                if (exceptionDetails) {
                    throw new Error(
                        exceptionDetails.exception?.description ?? exceptionDetails.text,
                    );
                }
                return result.value;
            }

            async function click([x, y]: number[]) {
                for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
                    await chrome.send(
                        'Input.dispatchMouseEvent',
                        { type, x, y, button: 'left', clickCount: 1 },
                        sessionId,
                    );
                }
            }

            return { evaluate, click, problems };
        }

        describe.each(['3.8', '3.7'] as const)(
            'a page of the editor’s Spine %s runtime',
            (minor) => {
                const other = OTHER[minor];
                let check: Check;
                let clicks: string[];
                let problems: string[];

                beforeAll(async () => {
                    const page = await openPage(minor);
                    const input: CheckInput = {
                        skeleton: contractSkeleton(minor),
                        other: contractSkeleton(other),
                        atlasText: ATLAS,
                    };

                    check = await page.evaluate<Check>(`Pixi5Check.run(${JSON.stringify(input)})`);
                    await page.click(check.clickAt.button);
                    await page.click(check.clickAt.region);
                    clicks = await page.evaluate<string[]>('Pixi5Check.clicks');
                    problems = page.problems;
                    results[minor] = check;

                    console.log(
                        `[pixi5 chrome ${minor}]`,
                        JSON.stringify({ ...check, clicks, problems }),
                    );
                }, 60_000);

                it('builds the engine on the bundle’s runtime, rendering through WebGL', () => {
                    const runtime = {
                        minor,
                        family: 'pixi-spine-legacy',
                        packageName: 'pixi-spine',
                        packageVersion: bundles.runtimes[minor].packageVersion,
                    };

                    expect(check.runtimes).toEqual([runtime]);
                    expect(check.engineRuntimes).toEqual([runtime]);
                    expect(check.rendererType).toBe(1);
                });

                it('draws a skeleton the engine built where its outlines say', () => {
                    near(check.byEngine.drawn.redBox, check.byEngine.outlined);
                    near(check.byEngine.outlined, { left: 44, top: 34, right: 93, bottom: 73 });
                    expect(Math.abs(check.byEngine.drawn.red - 2 * 40 * 20)).toBeLessThanOrEqual(
                        80,
                    );
                });

                it('draws the layout core’s skeleton set up, then posed', () => {
                    near(check.setup.drawn.redBox, check.setup.outlined);
                    near(check.setup.outlined, { left: 44, top: 34, right: 93, bottom: 73 });
                    expect(Math.abs(check.setup.drawn.red - 2 * 40 * 20)).toBeLessThanOrEqual(80);

                    near(check.moved.drawn.redBox, check.moved.outlined);
                    near(check.moved.outlined, { left: 44, top: 54, right: 83, bottom: 73 });
                    expect(Math.abs(check.moved.drawn.red - 40 * 20)).toBeLessThanOrEqual(40);
                });

                it('emits and draws particles', () => {
                    expect(check.particles.count).toBeGreaterThan(0);
                    expect(check.particles.drawn.lit).toBeGreaterThan(0);
                });

                it(`refuses the Spine ${other} export`, () => {
                    const version = other === '3.7' ? '3.7.94' : '3.8.99';

                    expect(check.rejection).toEqual({
                        unsupported: true,
                        message: `other.json: Spine ${version} — registered runtimes: ${minor}; Pixi 4, 5, 6, 7 can render it`,
                    });
                });

                it('hands a click to the button on a slot, and one on the shielded skeleton to what lies behind', () => {
                    expect(clicks).toEqual([
                        `button ${check.clickAt.button.join(',')}`,
                        `behind ${check.clickAt.region.join(',')}`,
                    ]);
                });

                it('logs no warning or error', () => {
                    expect(problems).toEqual([]);
                });
            },
        );

        it('draws the same pixels for the same skeleton exported for 3.7 and for 3.8', () => {
            const [old, current] = [results['3.7']!, results['3.8']!];

            expect(current.byEngine.drawn.red).toBeGreaterThan(0);
            expect(old.byEngine.drawn.hash).toBe(current.byEngine.drawn.hash);
            expect(old.setup.drawn.hash).toBe(current.setup.drawn.hash);
            expect(old.moved.drawn.hash).toBe(current.moved.drawn.hash);
        });
    },
);
