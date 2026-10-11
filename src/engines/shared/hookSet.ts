type Hook<Args extends unknown[]> = (...args: Args) => void;

/**
 * Hooks on one runtime method per target, through a single wrapper per target: `install` puts
 * in a wrapper that calls `run` and returns what takes it out again. Hooks run in the order
 * they were added and can be removed in any order; the wrapper goes when the last one does.
 */
export function createHookSet<Target extends object, Args extends unknown[]>(
    install: (target: Target, run: Hook<Args>) => () => void,
) {
    const installed = new WeakMap<Target, { hooks: Set<Hook<Args>>; restore: () => void }>();

    return function add(target: Target, hook: Hook<Args>): () => void {
        let entry = installed.get(target);

        if (!entry) {
            const hooks = new Set<Hook<Args>>();
            const restore = install(target, (...args) => hooks.forEach((run) => run(...args)));
            entry = { hooks, restore };
            installed.set(target, entry);
        }

        const own: Hook<Args> = (...args) => hook(...args);
        entry.hooks.add(own);

        return () => {
            const current = installed.get(target);
            if (!current?.hooks.delete(own) || current.hooks.size > 0) return;

            current.restore();
            installed.delete(target);
        };
    };
}
