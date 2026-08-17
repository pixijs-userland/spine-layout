import { Howl, type HowlOptions, Howler } from 'howler';
import type { AssetSrc, AssetsManifest, UnresolvedAsset } from 'pixi.js';

/**
 * Two places asking for the same FX this close together mean one event, heard twice: the
 * animations of several spines fire the same named event on the same frame. Howler happily
 * starts a second sound id over the first, and identical waveforms in phase read as one
 * sound at double the volume. Play the first, drop the rest of the burst.
 */
const DUPLICATE_FX_WINDOW_MS = 50;

/**
 * The name a spine event would ask for, from any of the aliases the manifest lists a sound under.
 *
 * One file arrives as four of them — `sounds/spin.mp3`, `sounds/spin`, `spin.mp3`, `spin` — and
 * animations name the last. Reducing every alias to it is what keeps a preload from fetching the
 * same file four times, and what makes the instance it leaves behind the one the first `playFX`
 * finds. Bundle-qualified aliases are reduced too, since the bare one is dropped from the manifest
 * wherever a font or a texture has claimed it (see {@link Sounds.resolveSoundKey}).
 */
function bareName(alias: string): string {
    return alias.slice(alias.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
}

export type SoundSettings = {
    debug?: boolean;
    musicMuted: boolean;
    fxMuted: boolean;
    muted: boolean;
    /** Path prefix used for sound name lookups and file paths (e.g. 'sounds') */
    prefix?: string | null;
    /**
     * Base path the manifest `src` paths are resolved against (e.g. 'assets' or
     * 'assets/<theme>' when each theme has its own manifest). Defaults to 'assets'.
     */
    assetBase?: string;
    /**
     * The game's authored mix: how loud each kind of sound is meant to be relative to the
     * other, with `soundsVolumes` naming per-sound exceptions. The player never touches these.
     */
    musicVolume: number; // 0 to 1
    fxVolume: number; // 0 to 1
    soundsVolumes?: { [key: string]: number };
    /**
     * The player's dials, 0 to 1. Every music volume is scaled by `musicLevel` and every FX
     * volume — the per-sound exceptions included — by `fxLevel`, so turning a dial moves the
     * whole mix without flattening it.
     */
    musicLevel: number;
    fxLevel: number;
};

export class Sounds {
    private userInteraction = false;
    private initialized = false;
    private soundNames: Map<string, AssetSrc> = new Map();
    private sounds: Map<string, Howl> = new Map();
    private fxSounds: Map<string, Howl> = new Map();
    private musicSounds: Map<string, Howl> = new Map();
    /** When each FX request was last honoured, keyed by request — see DUPLICATE_FX_WINDOW_MS */
    private lastFXPlayedAt: Map<string, number> = new Map();
    private activeMusic: string | null = null;
    private onActivationCallbacks: (() => void)[] = [];
    private onReadyCallbacks: (() => void)[] = [];
    private settings: SoundSettings;
    activated = false;

    constructor(settings: Partial<SoundSettings> = {}) {
        this.settings = {
            musicMuted: false,
            fxMuted: false,
            muted: false,
            debug: false,
            musicVolume: 0.8,
            fxVolume: 0.8,
            musicLevel: 1,
            fxLevel: 1,
            ...settings,
        };

        window.addEventListener('visibilitychange', () => this.onVisibilityChange());
        window.addEventListener('pointerdown', () => this.onUserInteraction(), { once: true });

        this.mute();
    }

    init(pixiManifest?: AssetsManifest, settings?: Partial<SoundSettings>) {
        if (settings) {
            this.settings = { ...this.settings, ...settings };
        }

        if (pixiManifest) {
            this.extractSoundNames(pixiManifest);
        }

        this.initialized = true;

        if (this.settings.debug) {
            console.log('🎶 Sounds initialized', this.soundNames);
        }

        this.playSounds();
        this.fireReadyCallbacks();
    }

    /**
     * Fetches every sound the manifest named, in the background.
     *
     * Without this a sound is fetched the moment it is first asked for, which is the moment it
     * was meant to be heard: the reels of the first spin are already turning while the sound of
     * them is still on the wire. Called once the game is playable, this pays for all of them at a
     * time when nothing is waiting.
     *
     * Nothing waits on it either. Each file is its own request, the promise is there to be
     * watched rather than awaited, and one that will not load resolves like the rest — a sound is
     * not worth failing a game over. Anything asked for while its file is still coming is queued
     * by Howler and plays on arrival, so a preload that is still running changes nothing about
     * what the player hears.
     */
    preload(): Promise<void> {
        const names = new Set<string>();

        this.soundNames.forEach((_source, alias) => names.add(bareName(alias)));

        const loading = [...names]
            .filter((name) => !this.sounds.has(name))
            .map((name) => this.warm(name));

        if (this.settings.debug) {
            console.log(`🎶 Preloading ${loading.length} sounds`);
        }

        return Promise.all(loading).then(() => undefined);
    }

    private warm(name: string): Promise<void> {
        const src = this.getSoundName(name);

        if (src.length === 0) return Promise.resolve();

        const sound = new Howl({ src, preload: true, autoplay: false });

        this.sounds.set(name, sound);

        return new Promise((resolve) => {
            sound.once('load', () => resolve());
            sound.once('loaderror', (_id, error) => {
                if (this.settings.debug) {
                    console.warn(`🎶 Could not preload "${name}"`, error);
                }

                resolve();
            });
        });
    }

    private extractSoundNames(pixiManifest: AssetsManifest) {
        const bundleName = this.settings.prefix || 'sounds';
        const assets: UnresolvedAsset[] =
            (pixiManifest.bundles.find((item) => item.name === bundleName)
                ?.assets as UnresolvedAsset[]) ?? [];

        assets.forEach((asset) => {
            if (!asset.src) return;

            if (typeof asset.alias === 'string') {
                this.soundNames.set(asset.alias, asset.src);
            }

            if (Array.isArray(asset.alias)) {
                asset.alias.forEach((alias) => {
                    if (!asset.src) return;

                    this.soundNames.set(
                        alias,
                        (asset.src as []).map((src) => `${this.settings.assetBase ?? 'assets'}/${src}`),
                    );
                });
            }
        });
    }

    onUserInteraction() {
        this.userInteraction = true;
        this.activated = true;
        this.onActivationCallbacks.forEach((callback) => callback());

        if (this.settings.debug) {
            console.log('🎶 User interaction');
        }

        this.playSounds();
    }

    onActivation(callback: () => void) {
        this.onActivationCallbacks.push(callback);
    }

    playFX(fx?: string | string[], loop = false) {
        if (!loop && typeof fx === 'string' && fx.endsWith('_loop')) {
            loop = true;
            fx = fx.slice(0, -5);
        }

        try {
            this._playFX(fx, loop);
        } catch (e) {
            if (this.settings.debug) {
                console.error('🎶 playFX error', e);
            }
        }
    }

    private _playFX(fx?: string | string[], loop = false) {
        // Note: we intentionally do not gate on `userInteraction` here. Sounds
        // triggered by the init animation (which runs before the first user
        // interaction) should start playing immediately in a muted state — the
        // first interaction then unmutes them via `onUserInteraction` -> `unmute`.
        if (!fx || (Array.isArray(fx) && fx.length === 0) || !this.initialized) {
            return;
        }

        if (!this.hasSounds(fx)) {
            if (this.settings.debug) {
                console.warn(`🎶 No sound registered for "${this.requestKey(fx)}"`);
            }

            return;
        }

        // Keyed by the request rather than the resolved sound: a set of variants asked for
        // twice at once picks two different files, and those stack just as loudly.
        const requestKey = this.requestKey(fx);
        const now = Date.now();
        const lastPlayedAt = this.lastFXPlayedAt.get(requestKey);

        if (lastPlayedAt !== undefined && now - lastPlayedAt < DUPLICATE_FX_WINDOW_MS) {
            if (this.settings.debug) {
                console.log('🎶 Skip duplicate FX', requestKey);
            }

            return;
        }

        this.lastFXPlayedAt.set(requestKey, now);

        const randomFromArray = Array.isArray(fx) ? fx[Math.floor(Math.random() * fx.length)] : fx;
        const sound = randomFromArray;
        const fxInstance = this.fxSounds.get(sound);

        if (fxInstance) {
            // A looping FX re-fires every cycle of a looping animation. `Howl.play()` would
            // start a *second*, overlapping sound id each time (and only the newest would be
            // audible-but-doubled), so let the running loop carry on instead.
            if (loop && fxInstance.playing()) return;

            fxInstance.play();
            return;
        }

        if (this.settings.debug) {
            console.log('🎶 Play FX', sound);
        }

        const newInstance = this.addAndPlay(sound, {
            loop,
            volume: this.fxVolumeOf(sound),
            mute: this.settings.fxMuted,
        });

        if (!newInstance) {
            if (this.settings.debug) {
                console.warn(`Failed to play FX: ${sound} - sound not found`);
            }
            return;
        }

        this.fxSounds.set(sound, newInstance);
    }

    stopFX(fx: string) {
        const fxInstance = this.fxSounds.get(fx);

        // A stop is deliberate, so whatever follows it is a new sound rather than the tail of
        // a burst: let it through even if it lands inside the duplicate window.
        this.lastFXPlayedAt.delete(fx);

        if (fxInstance) {
            if (this.settings.debug) {
                console.log('🎶 Stop FX', fx);
            }

            fxInstance.stop();
        }
    }

    playMusic(music: string) {
        try {
            this._playMusic(music);
        } catch (e) {
            if (this.settings.debug) {
                console.error('🎶 playMusic error', e);
            }
        }
    }

    private _playMusic(music: string) {
        if (this.activeMusic === music) return;

        const musicInstance = this.musicSounds.get(music);

        if (musicInstance) {
            this.stopAllMusic();
            musicInstance.play();
            this.activeMusic = music;
            return;
        }

        if (this.settings.debug) {
            console.log('🎶 Play music', music);
        }

        // Started before the outgoing track is stopped, on purpose: a track that cannot be
        // resolved must leave the current music playing. Only other music stops music.
        const newInstance = this.addAndPlay(music, {
            loop: true,
            volume: this.settings.musicVolume * this.settings.musicLevel,
            mute: this.settings.musicMuted,
        });

        if (!newInstance) {
            if (this.settings.debug) {
                console.warn(`Failed to play music: ${music} - sound not found`);
            }

            return;
        }

        // `newInstance` is not registered yet, so it survives the stop
        this.stopAllMusic();

        this.musicSounds.set(music, newInstance);
        this.activeMusic = music;
    }

    private stopAllMusic() {
        this.musicSounds.forEach((sound) => sound.stop());

        if (this.settings.debug) {
            console.log('🎶 Stop all music');
        }

        this.activeMusic = null;
    }

    private addAndPlay(soundName: string, settings: Partial<HowlOptions>): Howl | null {
        const existing = this.sounds.get(soundName);

        if (existing) {
            // A sound made earlier carries whatever it was made with, and `preload` makes them
            // with nothing at all. How it plays is the caller's to say, every time.
            if (settings.loop !== undefined) existing.loop(settings.loop);
            if (settings.volume !== undefined) existing.volume(settings.volume);
            if (settings.mute !== undefined) existing.mute(settings.mute);

            existing.play();

            return existing;
        }

        const soundSources = this.getSoundName(soundName);

        if (!soundSources || soundSources.length === 0) {
            if (this.settings.debug) {
                console.warn(
                    `Cannot create sound instance for "${soundName}": no valid sound sources found`,
                );
            }
            return null;
        }

        const sound = new Howl({
            src: soundSources,
            preload: true,
            autoplay: true,
            ...settings,
        });

        this.sounds.set(soundName, sound);

        return sound;
    }

    private muteFX() {
        this.settings.fxMuted = true;

        if (this.settings.debug) console.log('🎶 Mute FX');

        this.fxSounds.forEach((sound) => sound.mute(true));
    }

    private unmuteFX() {
        this.settings.fxMuted = false;

        if (this.settings.debug) console.log('🎶 Unmute FX');

        this.fxSounds.forEach((sound) => sound.mute(false));
    }

    private muteMusic() {
        this.settings.musicMuted = true;

        if (this.settings.debug) console.log('🎶 Mute music');

        this.musicSounds.forEach((sound) => sound.mute(true));
    }

    private unmuteMusic() {
        this.settings.musicMuted = false;

        if (this.settings.debug) console.log('🎶 Unmute music');

        this.musicSounds.forEach((sound) => sound.mute(false));
    }

    updateSettings(settings: Partial<SoundSettings>) {
        this.settings = { ...this.settings, ...settings };

        if (this.settings.debug) {
            console.log('🎶 Update settings', this.settings);
        }

        if (this.settings.muted) this.mute();
        else this.unmute();
        if (this.settings.fxMuted) this.muteFX();
        else this.unmuteFX();
        if (this.settings.musicMuted) this.muteMusic();
        else this.unmuteMusic();

        this.musicSounds.forEach((sound) =>
            sound.volume(this.settings.musicVolume * this.settings.musicLevel),
        );
        this.fxSounds.forEach((sound, name) => sound.volume(this.fxVolumeOf(name)));
    }

    private fxVolumeOf(sound: string): number {
        return (this.settings.soundsVolumes?.[sound] ?? this.settings.fxVolume) * this.settings.fxLevel;
    }

    mute() {
        if (this.settings.debug) console.log('🎶 Mute');

        Howler.mute(true);
    }

    unmute() {
        if (!this.userInteraction || !this.initialized || this.settings.muted) return;

        if (this.settings.debug) console.log('🎶 Unmute');

        Howler.mute(false);
    }

    async loadSoundFile(name: string, file: File): Promise<void> {
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });

        this.soundNames.set(name, [dataUrl]);
    }

    /** Register a callback to run once sounds are initialized. Fires immediately if already ready. */
    onReady(callback: () => void) {
        if (this.initialized) {
            callback();
        } else {
            this.onReadyCallbacks.push(callback);
        }
    }

    private fireReadyCallbacks() {
        this.onReadyCallbacks.forEach((cb) => cb());
        this.onReadyCallbacks = [];
    }

    private playSounds() {
        if (!this.userInteraction || !this.initialized) return;

        // Apply the actual mute state — not just unmute. `init()` runs more than once
        // (SpineLayout auto-calls `sounds.init(manifest)` with default settings before the
        // game re-inits with the real `muted` value). If the user interacts before the game
        // loads, the first (defaults-only) init would unmute, and a later init carrying
        // `muted: true` would never re-mute here — leaving sound on despite the mute setting.
        if (this.settings.muted) this.mute();
        else this.unmute();
    }

    private onVisibilityChange() {
        if (document.hidden) {
            this.mute();
        } else if (!this.settings.muted) {
            this.unmute();
        }
    }

    private requestKey(fx: string | string[]): string {
        return Array.isArray(fx) ? fx.join('|') : fx;
    }

    /**
     * Spine events name a sound by its bare file name (`multiplier`), but that bare alias is not
     * guaranteed to reach the manifest: assetpack's `filterUniqueNames` silently drops any alias
     * claimed by more than one asset, across every bundle. A `multiplier.mp3` sound and a
     * `multiplier.fnt` font knock each other's shortcut out, and the sound then resolves to
     * nothing while every uncontested name keeps working. The bundle-qualified alias
     * (`sounds/multiplier`) can only ever be claimed by the sound, so ask for that first.
     *
     * Both forms are set to the same sources by `extractSoundNames`, and only the sounds bundle
     * is read into `soundNames`, so preferring one over the other cannot pick a different file.
     */
    private resolveSoundKey(soundName: string): string | null {
        const bundle = this.settings.prefix || 'sounds';

        return [`${bundle}/${soundName}`, soundName].find((key) => this.soundNames.has(key)) ?? null;
    }

    private hasSounds(fx: string | string[]): boolean {
        const names = Array.isArray(fx) ? fx : [fx];
        return names.some((name) => this.resolveSoundKey(name) !== null);
    }

    private getSoundName(soundName: string): string[] {
        const key = this.resolveSoundKey(soundName);
        const soundData = key === null ? undefined : this.soundNames.get(key);

        if (!soundData) {
            if (this.settings.debug) {
                const availableSounds = Array.from(this.soundNames.keys()).join(', ');
                console.error(
                    `Sound not found: "${soundName}". Available sounds: [${availableSounds}]`,
                );
            }
            return [];
        }

        if (Array.isArray(soundData)) return soundData as string[];

        if (typeof soundData === 'string') {
            return [
                `${this.settings.assetBase ?? 'assets'}/${this.settings.prefix ? this.settings.prefix + '/' : ''}sounds/${soundData}.ogg`,
            ];
        }

        if (this.settings.debug) {
            console.error(`Invalid sound data type for "${key}":`, soundData);
        }
        return [];
    }
}

export const sounds = new Sounds();
