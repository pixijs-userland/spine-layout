import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('howler', () => ({
    Howl: vi.fn(),
    Howler: { mute: vi.fn() },
}));

import { Howl, Howler } from 'howler';
import { Sounds } from '../../src/controllers/Sounds.controller';
import type { AssetsManifest } from 'pixi.js';

type FakeHowl = {
    play: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    mute: ReturnType<typeof vi.fn>;
    volume: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
};

function makeFakeHowl(): FakeHowl {
    return {
        play: vi.fn(),
        stop: vi.fn(),
        mute: vi.fn(),
        volume: vi.fn(),
        on: vi.fn((event: string, cb: () => void) => {
            if (event === 'end') cb();
        }),
    };
}

function makeManifest(aliases: string[]): AssetsManifest {
    return {
        bundles: [{ name: 'sounds', assets: aliases.map((a) => ({ alias: a, src: `${a}.ogg` })) }],
    } as AssetsManifest;
}

let fakeHowl: FakeHowl;
let visibilityHandler: (() => void) | undefined;

beforeEach(() => {
    fakeHowl = makeFakeHowl();
    vi.mocked(Howl).mockClear();
    // Regular function (not arrow) so it can be called with `new`.
    vi.mocked(Howl).mockImplementation(function () {
        return fakeHowl as unknown as InstanceType<typeof Howl>;
    } as unknown as typeof Howl);
    vi.mocked(Howler.mute).mockClear();

    visibilityHandler = undefined;
    Object.defineProperty(globalThis, 'window', {
        value: {
            addEventListener: vi.fn((event: string, cb: () => void) => {
                if (event === 'visibilitychange') visibilityHandler = cb;
            }),
            removeEventListener: vi.fn(),
        },
        configurable: true,
        writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
        value: { hidden: false },
        configurable: true,
        writable: true,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── Construction ─────────────────────────────────────────────────────────────

describe('Sounds – construction', () => {
    it('registers a visibilitychange listener on window', () => {
        new Sounds();
        expect(window.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    it('calls Howler.mute(true) on startup', () => {
        new Sounds();
        expect(Howler.mute).toHaveBeenCalledWith(true);
    });

    it('activated is false before user interaction', () => {
        const s = new Sounds();
        expect(s.activated).toBe(false);
    });
});

// ─── mute / unmute ────────────────────────────────────────────────────────────

describe('Sounds – mute / unmute', () => {
    it('mute() calls Howler.mute(true)', () => {
        const s = new Sounds();
        vi.mocked(Howler.mute).mockClear();
        s.mute();
        expect(Howler.mute).toHaveBeenCalledWith(true);
    });

    it('unmute() is a no-op when not initialized', () => {
        const s = new Sounds();
        s.onUserInteraction();
        vi.mocked(Howler.mute).mockClear();
        s.unmute();
        expect(Howler.mute).not.toHaveBeenCalledWith(false);
    });

    it('unmute() is a no-op before user interaction', () => {
        const s = new Sounds();
        s.init(makeManifest([]));
        vi.mocked(Howler.mute).mockClear();
        s.unmute();
        expect(Howler.mute).not.toHaveBeenCalledWith(false);
    });

    it('unmute() is a no-op when settings.muted is true', () => {
        const s = new Sounds({ muted: true });
        s.init(makeManifest([]));
        s.onUserInteraction();
        vi.mocked(Howler.mute).mockClear();
        s.unmute();
        expect(Howler.mute).not.toHaveBeenCalledWith(false);
    });

    it('unmute() calls Howler.mute(false) when initialized, interacted, and not muted', () => {
        const s = new Sounds();
        s.init(makeManifest([]));
        s.onUserInteraction();
        vi.mocked(Howler.mute).mockClear();
        s.unmute();
        expect(Howler.mute).toHaveBeenCalledWith(false);
    });
});

// ─── Activation ──────────────────────────────────────────────────────────────

describe('Sounds – activation', () => {
    it('onUserInteraction() sets activated to true', () => {
        const s = new Sounds();
        s.onUserInteraction();
        expect(s.activated).toBe(true);
    });

    it('onActivation callback fires when onUserInteraction is called', () => {
        const s = new Sounds();
        const cb = vi.fn();
        s.onActivation(cb);
        s.onUserInteraction();
        expect(cb).toHaveBeenCalledOnce();
    });

    it('multiple onActivation callbacks all fire', () => {
        const s = new Sounds();
        const a = vi.fn();
        const b = vi.fn();
        s.onActivation(a);
        s.onActivation(b);
        s.onUserInteraction();
        expect(a).toHaveBeenCalledOnce();
        expect(b).toHaveBeenCalledOnce();
    });

    it('onActivation callback registered after onUserInteraction does not fire retroactively', () => {
        const s = new Sounds();
        s.onUserInteraction();
        const late = vi.fn();
        s.onActivation(late);
        expect(late).not.toHaveBeenCalled();
    });
});

// ─── playFX ───────────────────────────────────────────────────────────────────

describe('Sounds – playFX', () => {
    it('does nothing when fx is undefined', async () => {
        const s = new Sounds();
        s.init(makeManifest(['coin']));
        s.onUserInteraction();
        await s.playFX(undefined);
        expect(Howl).not.toHaveBeenCalled();
    });

    it('does nothing when not initialized', async () => {
        const s = new Sounds();
        s.onUserInteraction();
        await s.playFX('coin');
        expect(Howl).not.toHaveBeenCalled();
    });

    it('plays before user interaction (audio is globally muted until the first one)', async () => {
        // playFX intentionally does not gate on user interaction: init-animation
        // sounds start immediately while Howler is muted, and the first
        // interaction unmutes them.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        vi.mocked(Howler.mute).mockClear();
        s.init(makeManifest(['coin']));
        await s.playFX('coin');
        expect(Howl).toHaveBeenCalledOnce();
        expect(Howler.mute).not.toHaveBeenCalledWith(false);
    });

    it('does nothing when the sound is not in the manifest', async () => {
        const s = new Sounds();
        s.init(makeManifest([]));
        s.onUserInteraction();
        await s.playFX('coin');
        expect(Howl).not.toHaveBeenCalled();
    });

    it('creates a Howl instance when all conditions are met', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['coin']));
        s.onUserInteraction();
        await s.playFX('coin');
        expect(Howl).toHaveBeenCalledOnce();
    });

    it('reuses the existing Howl instance on a second call (no new Howl)', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['coin']));
        s.onUserInteraction();
        await s.playFX('coin');
        const callsBefore = vi.mocked(Howl).mock.calls.length;
        await s.playFX('coin');
        expect(vi.mocked(Howl).mock.calls.length).toBe(callsBefore);
        expect(fakeHowl.play).toHaveBeenCalledOnce();
    });

    it('picks randomly from an array argument', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['sfx_a', 'sfx_b']));
        s.onUserInteraction();
        await s.playFX(['sfx_a', 'sfx_b']);
        expect(Howl).toHaveBeenCalledOnce();
    });
});

// ─── stopFX ───────────────────────────────────────────────────────────────────

describe('Sounds – stopFX', () => {
    it('calls stop() on a previously played fx sound', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['coin']));
        s.onUserInteraction();
        await s.playFX('coin');
        s.stopFX('coin');
        expect(fakeHowl.stop).toHaveBeenCalledOnce();
    });

    it('is a no-op when the sound was never played', () => {
        const s = new Sounds();
        expect(() => s.stopFX('coin')).not.toThrow();
    });
});

// ─── playMusic ────────────────────────────────────────────────────────────────

describe('Sounds – playMusic', () => {
    it('does nothing when the track is not in the manifest', async () => {
        const s = new Sounds();
        s.init(makeManifest([]));
        s.onUserInteraction();
        await s.playMusic('bgm');
        expect(Howl).not.toHaveBeenCalled();
    });

    it('is a no-op when the same track is already playing', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['bgm']));
        s.onUserInteraction();
        await s.playMusic('bgm');
        const callsBefore = vi.mocked(Howl).mock.calls.length;
        await s.playMusic('bgm');
        expect(vi.mocked(Howl).mock.calls.length).toBe(callsBefore);
    });

    it('stops existing music before starting a new track', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['bgm', 'bgm2']));
        s.onUserInteraction();
        await s.playMusic('bgm');
        await s.playMusic('bgm2');
        expect(fakeHowl.stop).toHaveBeenCalled();
    });
});

// ─── updateSettings ──────────────────────────────────────────────────────────

describe('Sounds – updateSettings', () => {
    it('muted:true calls Howler.mute(true)', () => {
        const s = new Sounds();
        vi.mocked(Howler.mute).mockClear();
        s.updateSettings({ muted: true });
        expect(Howler.mute).toHaveBeenCalledWith(true);
    });

    it('muted:false calls Howler.mute(false) when initialized and interacted', () => {
        const s = new Sounds({ muted: true });
        s.init(makeManifest([]));
        s.onUserInteraction();
        vi.mocked(Howler.mute).mockClear();
        s.updateSettings({ muted: false });
        expect(Howler.mute).toHaveBeenCalledWith(false);
    });

    it('fxMuted:true calls mute(true) on all active fx sounds', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['sfx']));
        s.onUserInteraction();
        await s.playFX('sfx');
        s.updateSettings({ fxMuted: true });
        expect(fakeHowl.mute).toHaveBeenCalledWith(true);
    });

    it('musicMuted:true calls mute(true) on all active music tracks', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const s = new Sounds();
        s.init(makeManifest(['bgm']));
        s.onUserInteraction();
        await s.playMusic('bgm');
        s.updateSettings({ musicMuted: true });
        expect(fakeHowl.mute).toHaveBeenCalledWith(true);
    });
});

// ─── Visibility change ────────────────────────────────────────────────────────

describe('Sounds – visibility change', () => {
    it('mutes when the page becomes hidden', () => {
        new Sounds();
        vi.mocked(Howler.mute).mockClear();
        Object.defineProperty(globalThis.document, 'hidden', { value: true, configurable: true });
        visibilityHandler?.();
        expect(Howler.mute).toHaveBeenCalledWith(true);
    });

    it('unmutes when the page becomes visible (if initialized and interacted)', () => {
        const s = new Sounds();
        s.init(makeManifest([]));
        s.onUserInteraction();
        vi.mocked(Howler.mute).mockClear();
        Object.defineProperty(globalThis.document, 'hidden', { value: false, configurable: true });
        visibilityHandler?.();
        expect(Howler.mute).toHaveBeenCalledWith(false);
    });

    it('does not unmute on visibility-visible when globally muted', () => {
        const s = new Sounds({ muted: true });
        s.init(makeManifest([]));
        s.onUserInteraction();
        vi.mocked(Howler.mute).mockClear();
        Object.defineProperty(globalThis.document, 'hidden', { value: false, configurable: true });
        visibilityHandler?.();
        expect(Howler.mute).not.toHaveBeenCalledWith(false);
    });
});
