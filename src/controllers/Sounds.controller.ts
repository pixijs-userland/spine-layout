import { Howl, type HowlOptions, Howler } from 'howler';
import type { AssetSrc, AssetsManifest, UnresolvedAsset } from 'pixi.js';

export type SoundSettings = {
    debug?: boolean;
    musicMuted: boolean;
    fxMuted: boolean;
    muted: boolean;
    /** Path prefix used for sound name lookups and file paths (e.g. 'sounds') */
    prefix?: string | null;
    musicVolume: number; // 0 to 1
    fxVolume: number; // 0 to 1
    soundsVolumes?: { [key: string]: number };
};

export class Sounds {
    private userInteraction = false;
    private initialized = false;
    private soundNames: Map<string, AssetSrc> = new Map();
    private sounds: Map<string, Howl> = new Map();
    private fxSounds: Map<string, Howl> = new Map();
    private musicSounds: Map<string, Howl> = new Map();
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

    private extractSoundNames(pixiManifest: AssetsManifest) {
        const assets: UnresolvedAsset[] =
            (pixiManifest.bundles.find((item) => item.name === 'sounds')
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
                        (asset.src as []).map(
                            (src) =>
                                `assets/${this.settings.prefix ? this.settings.prefix + '/' : ''}${src}`,
                        ),
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
        if (
            !fx ||
            (Array.isArray(fx) && fx.length === 0) ||
            !this.userInteraction ||
            !this.initialized ||
            !this.hasSounds(fx)
        ) {
            return;
        }

        const randomFromArray = Array.isArray(fx) ? fx[Math.floor(Math.random() * fx.length)] : fx;
        const sound = randomFromArray;
        const fxInstance = this.fxSounds.get(sound);

        if (fxInstance) {
            fxInstance.play();
            return;
        }

        if (this.settings.debug) {
            console.log('🎶 Play FX', sound);
        }

        const volume = this.settings.soundsVolumes?.[sound] ?? this.settings.fxVolume;
        const newInstance = this.addAndPlay(sound, { loop, volume, mute: this.settings.fxMuted });

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

        this.stopAllMusic();

        const musicInstance = this.musicSounds.get(music);

        if (musicInstance) {
            musicInstance.play();
            this.activeMusic = music;
            return;
        }

        if (this.settings.debug) {
            console.log('🎶 Play music', music);
        }

        const newInstance = this.addAndPlay(music, {
            loop: true,
            volume: this.settings.musicVolume,
            mute: this.settings.musicMuted,
        });

        if (!newInstance) {
            if (this.settings.debug) {
                console.warn(`Failed to play music: ${music} - sound not found`);
            }

            return;
        }

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
        if (this.sounds.has(soundName)) {
            const sound = this.sounds.get(soundName)!;

            sound.play();

            return sound;
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

        this.musicSounds.forEach((sound) => sound.volume(this.settings.musicVolume));
        this.fxSounds.forEach((sound) => sound.volume(this.settings.fxVolume));
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
        console.log(`🎶 Loaded sound file "${name}" from user input`);
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

        this.unmute();
    }

    private onVisibilityChange() {
        if (document.hidden) {
            this.mute();
        } else if (!this.settings.muted) {
            this.unmute();
        }
    }

    private hasSounds(fx: string | string[]): boolean {
        const names = Array.isArray(fx) ? fx : [fx];
        return names.some((name) => this.soundNames.has(name));
    }

    private getSoundName(soundName: string): string[] {
        const key = this.settings.prefix ? `${this.settings.prefix}/${soundName}` : soundName;
        const soundData = this.soundNames.get(key);

        if (!soundData) {
            if (this.settings.debug) {
                const availableSounds = Array.from(this.soundNames.keys()).join(', ');
                console.error(`Sound not found: "${key}". Available sounds: [${availableSounds}]`);
            }
            return [];
        }

        if (Array.isArray(soundData)) return soundData as string[];

        if (typeof soundData === 'string') {
            return [
                `assets/${this.settings.prefix ? this.settings.prefix + '/' : ''}sounds/${soundData}.ogg`,
            ];
        }

        if (this.settings.debug) {
            console.error(`Invalid sound data type for "${key}":`, soundData);
        }
        return [];
    }
}

export const sounds = new Sounds();
