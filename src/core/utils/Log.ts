/**
 * How many disabled-time entries are kept for a later `debug = true` to print. A game plays
 * animations and fires skeleton events for hours; the buffer holds the tail of that, not all of it.
 */
const PENDING_LIMIT = 500;

class Log {
    #logList: Map<string, Map<string, string[]>> = new Map();
    #pending: Array<() => void> = [];
    #enabled: boolean;

    constructor(enabled = false) {
        this.#enabled = enabled;
    }

    open(label: string) {
        this.#logList.set(label, new Map());
    }

    close(label: string) {
        const entries = this.#logList.get(label);
        this.#logList.delete(label);

        if (!entries || entries.size === 0) return;

        const data = Object.fromEntries([...entries.entries()]);
        this.table(label, data);
    }

    /**
     * A row for an open label's table — or, for a label nothing opened, one line written
     * through at once. A label that is only ever added to (every animation played, every
     * skeleton event) would otherwise collect rows for the page's lifetime with no close to
     * print them.
     */
    add(label: string, key: string, value: string) {
        const entries = this.#logList.get(label);

        if (!entries) {
            this.log(label, key, value);
            return;
        }

        if (!entries.has(key)) entries.set(key, []);
        entries.get(key)!.push(value);
    }

    table(label: string, data: unknown) {
        this.#emit(() => {
            console.groupCollapsed(label);
            console.table(data);
            console.groupEnd();
        });
    }

    log(label: string, ...data: unknown[]) {
        this.#emit(() => console.log(label, ...data));
    }

    set enabled(value: boolean) {
        const flushing = value && !this.#enabled;
        this.#enabled = value;
        if (flushing) {
            this.#pending.forEach((fn) => fn());
            this.#pending = [];
        }
    }

    get enabled() {
        return this.#enabled;
    }

    /** Drops every open table and every entry waiting for `enabled`. */
    clear() {
        this.#logList.clear();
        this.#pending = [];
    }

    #emit(fn: () => void) {
        if (this.#enabled) {
            fn();
            return;
        }

        if (this.#pending.length >= PENDING_LIMIT) this.#pending.shift();
        this.#pending.push(fn);
    }
}

export const log = new Log();
