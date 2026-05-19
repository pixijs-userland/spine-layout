import { Howl, type HowlOptions, Howler } from 'howler';
import type { AssetSrc, AssetsManifest, UnresolvedAsset } from 'pixi.js';

export type SoundSettings = {
  debug?: boolean;
  musicMuted: boolean;
  fxMuted: boolean;
  muted: boolean;
  prefix?: string;
  musicVolume: number; // 0 to 1
  fxVolume: number; // 0 to 1
  soundsVolumes?: { [key: string]: number };
};

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class Sounds {
  private userInteraction = false;
  private initialized = false;
  private soundNames: Map<string, AssetSrc> = new Map();
  private sounds: Map<string, Howl> = new Map();
  private fxSounds: Map<string, Howl> = new Map();
  private musicSounds: Map<string, Howl> = new Map();
  private activeMusic: string | null = null;
  activated = false;
  private onActivationCallbacks: (() => void)[] = [];
  private settings: SoundSettings = {
    musicMuted: false,
    fxMuted: false,
    muted: false,
    debug: false,
    musicVolume: 0.1,
    fxVolume: 0.8,
  };

  constructor(settings?: Partial<SoundSettings>) {
    this.settings = {
      ...this.settings,
      ...settings,
    }
    window.addEventListener('visibilitychange', () => this.onVisibilityChange());

    this.mute();
  }

  init(pixiManifest: AssetsManifest, settings?: Partial<SoundSettings>) {
    if (settings) {
      this.settings = {
        ...this.settings,
        ...settings,
      };
    }

    this.extractSoundNames(pixiManifest);

    this.initialized = true;

    if (this.settings.debug) {
      console.log('🎶 Sounds initialized', this.soundNames);
    }

    this.playSounds();
  }

  private extractSoundNames(pixiManifest: AssetsManifest) {
    const assets: UnresolvedAsset[] =
      (pixiManifest.bundles.find((item) => item.name === this.settings.prefix ? `${this.settings.prefix}/sounds` : 'sounds')?.assets as UnresolvedAsset[]) ?? [];

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
            (asset.src as []).map((src) => `assets/${src}`)
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

  async playFX(fx?: string | string[], loop = false) {
    if (!fx || fx.length === 0 || !this.userInteraction || !this.initialized) {
      return;
    }

    let sound: string;

    if (Array.isArray(fx)) {
      sound = randomFromArray(fx);
    } else {
      sound = fx;
    }

    const fxInstance = this.fxSounds.get(sound);

    if (fxInstance) {
      fxInstance.play();
      return;
    }

    const volume = this.settings.soundsVolumes?.[sound] ?? this.settings.fxVolume;

    if (this.settings.debug) {
      console.log('🎶 Play FX', sound);
    }

    const newInstance = await this.addAndPlay(sound, {
      loop,
      volume,
      mute: this.settings.fxMuted,
    });

    this.fxSounds.set(sound, newInstance);
  }

  stopFX(fx: string) {
    const soundName = this.settings.prefix ? `${this.settings.prefix}/${fx}` : fx;
    const fxInstance = this.fxSounds.get(soundName);

    if (fxInstance) {

      if (this.settings.debug) {
        console.log('🎶 Stop FX', fx);
      }

      fxInstance.stop();
    }
  }

  async playMusic(music: string) {
    if (this.activeMusic === music) {
      return;
    }

    this.stopAllMusic();

    const soundName = this.settings.prefix ? `${this.settings.prefix}/${music}` : music;
    const musicInstance = this.musicSounds.get(soundName)!;

    if (musicInstance) {
      musicInstance.play();

      return;
    }

    if (this.settings.debug) {
      console.log('🎶 Play music', music);
    }

    const newInstance = await this.addAndPlay(music, {
      loop: true,
      volume: this.settings.musicVolume,
      mute: this.settings.musicMuted,
    });

    this.musicSounds.set(music, newInstance);
    this.activeMusic = music;
  }

  private stopAllMusic() {
    this.musicSounds.forEach((sound) => {
      sound.stop();
    });

    if (this.settings.debug) {
      console.log('🎶 Atop all music');
    }

    this.activeMusic = null;
  }

  private async addAndPlay(soundName: string, settings: Partial<HowlOptions>): Promise<Howl> {
    return new Promise<Howl>((resolve) => {
      if (this.sounds.has(soundName)) {
        const sound = this.sounds.get(soundName)!;

        sound.play();

        return sound;
      }

      const sound = new Howl({
        src: this.getSoundName(soundName),
        preload: true,
        autoplay: true,
        ...settings,
      });

      sound.on('end', () => {
        resolve(sound);
      });

      this.sounds.set(soundName, sound);

      return sound;
    });
  }

  private muteFX() {
    this.settings.fxMuted = true;

    if (this.settings.debug) {
      console.log('🎶 Mute FX');
    }

    this.fxSounds.forEach((sound) => {
      sound.mute(true);
    });
  }

  private unmuteFX() {
    this.settings.fxMuted = false;

    if (this.settings.debug) {
      console.log('🎶 Unmute FX');
    }

    this.fxSounds.forEach((sound) => {
      sound.mute(false);
    });
  }

  private muteMusic() {
    this.settings.musicMuted = true;

    if (this.settings.debug) {
      console.log('🎶 Mute music');
    }

    this.musicSounds.forEach((sound) => {
      sound.mute(true);
    });
  }

  private unmuteMusic() {
    this.settings.musicMuted = false;

    if (this.settings.debug) {
      console.log('🎶 Unmute music');
    }

    this.musicSounds.forEach((sound) => {
      sound.mute(false);
    });
  }

  updateSettings(settings: Partial<SoundSettings>) {
    this.settings = {
      ...this.settings,
      ...settings,
    };

    if (this.settings.debug) {
      console.log('🎶 Update settings', this.settings);
    }

    if (this.settings.muted) {
      this.mute();
    } else {
      this.unmute();
    }

    if (this.settings.fxMuted) {
      this.muteFX();
    } else {
      this.unmuteFX();
    }

    if (this.settings.musicMuted) {
      this.muteMusic();
    } else {
      this.unmuteMusic();
    }

    this.musicSounds.forEach((sound) => {
      sound.volume(this.settings.musicVolume);
    });

    this.fxSounds.forEach((sound) => {
      sound.volume(this.settings.fxVolume);
    });
  }

  mute() {
    if (this.settings.debug) {
      console.log('🎶 Mute');
    }

    Howler.mute(true);
  }

  unmute() {
    if (!this.userInteraction || !this.initialized || this.settings.muted) {
      return;
    }

    if (this.settings.debug) {
      console.log('🎶 Unmute');
    }

    Howler.mute(false);
  }

  private playSounds() {
    if (!this.userInteraction || !this.initialized) {
      return;
    }

    this.unmute();
  }

  private onVisibilityChange() {
    if (document.hidden) {
      this.mute();
    } else if (!this.settings.muted) {
      this.unmute();
    }
  }

  private getSoundName(soundName: string): string[] {
    const soundData = this.soundNames.get(`${this.settings.prefix}/${soundName}`);

    if (!soundData) {
      console.error(`Sound not found: ${soundName}`);

      return [];
    }

    if (Array.isArray(soundData)) {
      return soundData as string[];
    }

    if (typeof soundData === 'string') {
      return [`assets/${this.settings.prefix}/${soundData}.ogg`];
    }

    return [];
  }
}

export const sounds = new Sounds();

const userInteraction = () => {
  window.removeEventListener('pointerdown', userInteraction);

  sounds.onUserInteraction();
};

window.addEventListener('pointerdown', userInteraction);
