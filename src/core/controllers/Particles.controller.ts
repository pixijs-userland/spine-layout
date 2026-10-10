import type { EmitterLike, Engine, EngineTypes, ParticlesPort } from '../../engine/Engine';
import type { ParticlesJson, ParticlesJsonEntry, SpineID } from '../config/types';
import { parcePointers } from '../config/parcePointers';
import { LOG } from '../config/logs';
import { log } from '../utils/Log';

type Emitter<T extends EngineTypes> = {
    spineID: SpineID;
    particleKey: string;
    spine: T['Spine'];
    container: T['Container'];
    emitter: EmitterLike;
    stopUpdates: () => void;
};

const { start, stop, once } = parcePointers.particleEvent;

/**
 * Emitters hung off `particles_<key>` slots, configured by `particles.json` and advanced with
 * their spine at the layout's speed. Registration keys follow {@link TextsController}: the bare
 * key, or `<spineID>_<key>` on a multiple-instance spine.
 */
export class ParticlesController<T extends EngineTypes = EngineTypes> {
    #settings: ParticlesJson | undefined;
    #emitters: Map<string, Emitter<T>> = new Map();
    #warnedUnavailable = false;

    constructor(
        private engine: Engine<T>,
        private spines: Map<SpineID, T['Spine']>,
        private multipleInstanceIDs: Set<string> = new Set(),
    ) {}

    set settings(settings: ParticlesJson) {
        this.#settings = settings;
    }

    get settings(): ParticlesJson | undefined {
        return this.#settings;
    }

    loadSettings() {
        if (this.#settings) return;

        const { assets } = this.engine;
        const alias = ['particles.json', 'settings/particles.json'].find((name) => assets.has(name));

        if (alias) this.#settings = assets.get<ParticlesJson>(alias);
    }

    attach(only?: Set<SpineID>) {
        log.open(LOG.PARTICLES);

        this.spines.forEach((spine, spineID) => {
            if (only && !only.has(spineID)) return;

            spine.state.data.skeletonData.slots.forEach((slot) => {
                if (!slot.name.startsWith(parcePointers.slot.particles)) return;

                const particleKey = slot.name.slice(parcePointers.slot.particles.length);
                const key = this.add(spine, spineID, slot.name, particleKey);

                if (key) log.add(LOG.PARTICLES, spineID, `${key} -> ${slot.name}`);
            });
        });

        log.close(LOG.PARTICLES);
    }

    play(key: string, spineID?: SpineID) {
        this.resolve(key, spineID).forEach(({ emitter }) => {
            emitter.emit = true;
        });
    }

    stop(key: string, spineID?: SpineID) {
        this.resolve(key, spineID).forEach(({ emitter }) => {
            emitter.emit = false;
        });
    }

    emitOnce(key: string, spineID?: SpineID) {
        this.resolve(key, spineID).forEach(({ emitter }) => emitter.playOnce());
    }

    isPlaying(key: string, spineID?: SpineID): boolean {
        return this.resolve(key, spineID).some(({ emitter }) => emitter.emit);
    }

    getAll(): string[] {
        return [...this.#emitters.keys()];
    }

    /** Every `particles_<key>` slot per spine, whether `particles.json` configures it or not. */
    getBySpine(): Map<SpineID, string[]> {
        const result = new Map<SpineID, string[]>();

        this.spines.forEach((spine, spineID) => {
            const keys = spine.state.data.skeletonData.slots
                .filter((slot) => slot.name.startsWith(parcePointers.slot.particles))
                .map((slot) => slot.name.slice(parcePointers.slot.particles.length));

            if (keys.length > 0) result.set(spineID, keys);
        });

        return result;
    }

    /** Rebuilds the emitter with `config`, still emitting if it was, and keeps it in the settings. */
    setConfig(key: string, config: Record<string, unknown>, spineID?: SpineID) {
        this.resolve(key, spineID).forEach((entry) => {
            const own = ((this.#settings ??= {})[entry.spineID] ??= {});
            const current = own[entry.particleKey] ??
                this.mergedEntry(entry.spineID, entry.particleKey) ?? { textures: [] };

            own[entry.particleKey] = { ...current, config };

            const port = this.port();
            const textures = port && this.texturesFor(own[entry.particleKey], entry.particleKey);
            if (!port || !textures) return;

            const emitting = entry.emitter.emit;

            entry.emitter.destroy();
            entry.emitter = port.createEmitter(entry.container, textures, config);
            entry.emitter.emit = emitting;
        });
    }

    /** Answers a `particles_<key>_start|_stop|_once` skeleton event fired by `spineID`. */
    handleEvent(eventName: string, spineID: SpineID) {
        const name = eventName.slice(parcePointers.slot.particles.length);
        const action = [start, stop, once].find((suffix) => name.endsWith(suffix));
        if (!action) return;

        const key = name.slice(0, -action.length);
        const own = this.resolve(key, spineID);
        const targets = own.length > 0 ? own : this.resolve(key);

        targets.forEach(({ emitter }) => {
            if (action === start) emitter.emit = true;
            else if (action === stop) emitter.emit = false;
            else emitter.playOnce();
        });
    }

    /** Takes down every emitter on `spineID`, before that spine is destroyed or replaced. */
    detachSpine(spineID: SpineID) {
        this.#emitters.forEach((record, key) => {
            if (record.spineID === spineID) this.remove(key);
        });
    }

    clear() {
        [...this.#emitters.keys()].forEach((key) => this.remove(key));
        this.#settings = undefined;
    }

    private add(
        spine: T['Spine'],
        spineID: SpineID,
        slotName: string,
        particleKey: string,
    ): string | undefined {
        const key = this.registrationKey(spineID, particleKey);
        this.remove(key);

        const entry = this.mergedEntry(spineID, particleKey);
        if (!entry) return undefined;

        const port = this.port();
        if (!port) return undefined;

        const textures = this.texturesFor(entry, particleKey);
        if (!textures) return undefined;

        const container = this.engine.display.container({ label: slotName, interactive: 'none' });
        this.engine.spine.attachSlotObject(spine, slotName, container);

        const record: Emitter<T> = {
            spineID,
            particleKey,
            spine,
            container,
            emitter: port.createEmitter(container, textures, entry.config),
            stopUpdates: () => {},
        };

        record.emitter.emit = !!entry.autoplay;
        record.stopUpdates = this.engine.spine.onUpdate(spine, (dt) =>
            record.emitter.update(dt * spine.state.timeScale),
        );

        this.#emitters.set(key, record);

        return key;
    }

    private remove(key: string) {
        const record = this.#emitters.get(key);
        if (!record) return;

        record.stopUpdates();
        record.emitter.destroy();
        this.engine.spine.detachSlotObject(record.spine, record.container);
        record.container.destroy({ children: true });
        this.#emitters.delete(key);
    }

    private registrationKey(spineID: SpineID, particleKey: string): string {
        const scoped = `${spineID}_${particleKey}`;
        if (this.multipleInstanceIDs.has(spineID)) return scoped;

        const taken = this.#emitters.get(particleKey);
        return taken && taken.spineID !== spineID ? scoped : particleKey;
    }

    private mergedEntry(spineID: SpineID, particleKey: string): ParticlesJsonEntry | undefined {
        const base = this.multipleInstanceIDs.has(spineID)
            ? this.#settings?.[spineID.replace(/_\d+$/, '')]?.[particleKey]
            : undefined;
        const own = this.#settings?.[spineID]?.[particleKey];

        if (!base && !own) return undefined;
        return { ...base, ...own } as ParticlesJsonEntry;
    }

    private texturesFor(
        entry: ParticlesJsonEntry,
        particleKey: string,
    ): T['Texture'][] | undefined {
        const textures = entry.textures.flatMap((alias) => {
            const texture = this.engine.assets.get<T['Texture']>(alias);
            if (!texture)
                console.warn(`[SpineLayout] particles "${particleKey}": no texture "${alias}"`);
            return texture ? [texture] : [];
        });

        if (textures.length > 0) return textures;

        console.warn(
            `[SpineLayout] particles "${particleKey}": no textures resolved, emitter skipped`,
        );
        return undefined;
    }

    /** `name` is a particle key or a registration key; a particle key reaches every spine's. */
    private resolve(name: string, spineID?: SpineID): Emitter<T>[] {
        const exact = this.#emitters.get(name);
        const byKey = [...this.#emitters.values()].filter(
            (record) => record.particleKey === name && (!spineID || record.spineID === spineID),
        );

        if (byKey.length > 0) return byKey;
        return exact && (!spineID || exact.spineID === spineID) ? [exact] : [];
    }

    private port(): ParticlesPort<T> | undefined {
        const { particles } = this.engine;

        if (!particles && !this.#warnedUnavailable) {
            this.#warnedUnavailable = true;
            console.warn(`[SpineLayout] particles unavailable on ${this.engine.name}`);
        }

        return particles;
    }
}
