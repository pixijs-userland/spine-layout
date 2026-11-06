/**
 * The built-in sound player, on Howler: the default `sounds` adapter of the pixi8 `SpineLayout`.
 * `./core` and `./pixi4` leave it (and Howler) out; a game on them that wants it passes it in:
 * `new SpineLayoutCore({ engine, sounds })`.
 */
export { Sounds, sounds, type SoundSettings } from './core/controllers/Sounds.controller';
