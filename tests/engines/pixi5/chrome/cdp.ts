import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

type Params = Record<string, unknown>;
type Listener = (params: Params, sessionId?: string) => void;

export interface Chrome {
    send<R = Params>(method: string, params?: Params, sessionId?: string): Promise<R>;
    on(method: string, listener: Listener): void;
    close(): Promise<void>;
}

/**
 * Headless Chrome driven over `--remote-debugging-pipe`: the DevTools protocol on fds 3 and 4,
 * NUL-delimited JSON, so no debugging port is opened.
 */
export function launchChrome(binary: string, userDataDir: string): Chrome {
    const child = spawn(
        binary,
        [
            '--headless=new',
            '--remote-debugging-pipe',
            `--user-data-dir=${userDataDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--mute-audio',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
    );
    const input = child.stdio[3] as Writable;
    const output = child.stdio[4] as Readable;
    const pending = new Map<
        number,
        { resolve(result: Params): void; reject(error: Error): void }
    >();
    const listeners = new Map<string, Listener[]>();
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    let next = 0;
    let buffer = '';

    output.setEncoding('utf8');
    output.on('data', (chunk: string) => {
        buffer += chunk;
        for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
            const message = JSON.parse(buffer.slice(0, end));
            buffer = buffer.slice(end + 1);

            if (message.id === undefined) {
                listeners
                    .get(message.method)
                    ?.forEach((fn) => fn(message.params, message.sessionId));
                continue;
            }
            const call = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) call?.reject(new Error(`${message.error.message} (${message.id})`));
            else call?.resolve(message.result);
        }
    });

    return {
        send(method, params = {}, sessionId) {
            const id = ++next;
            input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
            return new Promise((resolve, reject) =>
                pending.set(id, { resolve: resolve as (result: Params) => void, reject }),
            );
        },
        on(method, listener) {
            listeners.set(method, [...(listeners.get(method) ?? []), listener]);
        },
        async close() {
            const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
            input.write(`${JSON.stringify({ id: ++next, method: 'Browser.close' })}\0`);
            await exited;
            clearTimeout(timeout);
        },
    };
}
