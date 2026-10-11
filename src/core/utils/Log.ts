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

    add(label: string, key: string, value: string) {
        if (!this.#logList.has(label)) this.open(label);
        const entries = this.#logList.get(label)!;
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

    #emit(fn: () => void) {
        if (this.#enabled) fn();
        else this.#pending.push(fn);
    }
}

export const log = new Log();
