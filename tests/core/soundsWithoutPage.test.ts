import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Page = Record<'window' | 'document', unknown>;

const global = globalThis as unknown as Page;
const page: Page = { window: global.window, document: global.document };

const define = (key: keyof Page, value: unknown) =>
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

function listeningWindow() {
    const events: string[] = [];
    define('window', { addEventListener: (type: string) => events.push(type) });
    return events;
}

describe('the sounds singleton', () => {
    beforeEach(() => {
        delete (global as Partial<Page>).window;
        delete (global as Partial<Page>).document;
        vi.resetModules();
    });

    afterEach(() => {
        define('window', page.window);
        define('document', page.document);
    });

    it('lets the core and the player be imported where there is no window or document', async () => {
        const core = await import('../../src/core');
        const howler = await import('../../src/howler');

        expect(typeof core.choosePixi).toBe('function');
        expect(howler.sounds).toBeInstanceOf(howler.Sounds);
    });

    it('listens to the page from the first init once there is one, and only once', async () => {
        const { sounds } = await import('../../src/core/controllers/Sounds.controller');
        const events = listeningWindow();

        sounds.init();
        sounds.init();

        expect(events).toEqual(['pointerdown', 'visibilitychange']);
    });

    it('waits for the first tap as it is made where there is a page, and the rest from init', async () => {
        const events = listeningWindow();
        const { sounds } = await import('../../src/core/controllers/Sounds.controller');

        expect(events).toEqual(['pointerdown']);
        sounds.init();
        sounds.init();
        expect(events).toEqual(['pointerdown', 'visibilitychange']);
    });
});
