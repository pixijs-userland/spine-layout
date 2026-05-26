// Minimal browser globals needed by modules (e.g. Sounds.controller) that reference
// window/document at load time when running in the Node test environment.
if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
        value: { addEventListener: () => {}, removeEventListener: () => {} },
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
