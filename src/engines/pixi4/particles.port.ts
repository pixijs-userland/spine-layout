import type { ParticlesPort } from '../../engine/Engine';
import type { Pixi4Emitter, Pixi4Namespace, Pixi4Types } from './pixi4.types';

/**
 * pixi-particles' own `playOnce` only sets `emit`, which a looping config never turns off. The
 * `emit` setter starts the life countdown from `emitterLifetime`, and `update` takes `frequency`
 * off it before each wave and stops at zero: a life of one and a half waves is one wave.
 */
function burstOnce(emitter: Pixi4Emitter, playOnce: () => void) {
    if (emitter.emitterLifetime > 0) return playOnce();
    if (emitter.emit) return;

    const { emitterLifetime } = emitter;

    emitter.emitterLifetime = emitter.frequency * 1.5;
    emitter.emit = true;
    emitter.emitterLifetime = emitterLifetime;
}

export function createParticlesPort(PIXI: Pixi4Namespace): ParticlesPort<Pixi4Types> | undefined {
    const Emitter = PIXI.particles?.Emitter;
    if (!Emitter) return undefined;

    return {
        createEmitter(parent, textures, config) {
            const emitter = new Emitter(parent, textures, config);
            const playOnce = emitter.playOnce.bind(emitter);

            // the layout drives it, so its speed follows the layout's
            emitter.autoUpdate = false;
            emitter.playOnce = () => burstOnce(emitter, playOnce);
            return emitter;
        },
    };
}
