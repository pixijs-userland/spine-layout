// Minimal browser globals needed by modules (e.g. Sounds.controller) that reference
// window/document at load time when running in the Node test environment.
if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
        value: { addEventListener: () => {}, removeEventListener: () => {} },
        configurable: true,
        writable: true,
    });
}

// A real `Spine` puts itself on Pixi's shared ticker, which starts off requestAnimationFrame.
// Nothing here waits for a frame, so a stub that is never called back is enough.
if (typeof (globalThis as Record<string, unknown>).requestAnimationFrame === 'undefined') {
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
        value: () => 0,
        configurable: true,
        writable: true,
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
        value: () => {},
        configurable: true,
        writable: true,
    });
}

if (typeof (globalThis as Record<string, unknown>).document === 'undefined') {
    Object.defineProperty(globalThis, 'document', {
        value: { hidden: false },
        configurable: true,
        writable: true,
    });
}
