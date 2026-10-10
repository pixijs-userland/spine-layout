import type { ParticlesPort } from '../../engine/Engine';
import type { Pixi4Namespace, Pixi4Types } from './pixi4.types';

export function createParticlesPort(PIXI: Pixi4Namespace): ParticlesPort<Pixi4Types> | undefined {
    const Emitter = PIXI.particles?.Emitter;
    if (!Emitter) return undefined;

    return {
        createEmitter(parent, textures, config) {
            const emitter = new Emitter(parent, textures, config);
            // the layout drives it, so its speed follows the layout's
            emitter.autoUpdate = false;
            return emitter;
        },
    };
}
