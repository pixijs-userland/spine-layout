import type { ParticlesPort } from '../../engine/Engine';
import type { LegacyCompat } from './compat';
import type { LegacyEmitter, LegacyNamespace, LegacySpine, LegacyTypes } from './legacy.types';

/**
 * The library's own `playOnce` only sets `emit`, which a looping config never turns off. The
 * `emit` setter starts the life countdown from `emitterLifetime`, and `update` takes `frequency`
 * off it before each wave and stops at zero: a life of one and a half waves is one wave.
 */
function burstOnce(emitter: LegacyEmitter, playOnce: () => void) {
    if (emitter.emitterLifetime > 0) return playOnce();
    if (emitter.emit) return;

    const { emitterLifetime } = emitter;

    emitter.emitterLifetime = emitter.frequency * 1.5;
    emitter.emit = true;
    emitter.emitterLifetime = emitterLifetime;
}

/**
 * pixi-particles 4.x on v4–v6, which takes the art apart from a v1/v2 config, or
 * @pixi/particle-emitter 5.x on v6–v7, which takes one v3 config with the art inside it.
 */
export function createParticlesPort<S extends LegacySpine>(
    PIXI: LegacyNamespace,
    compat: LegacyCompat,
): ParticlesPort<LegacyTypes<S>> | undefined {
    const particles = PIXI.particles;
    if (!particles || !compat.particles) return undefined;

    // its ES5 Particle subclasses v7's native Sprite class, which throws on the first emit
    if (compat.particles === 'pixi-particles' && compat.major >= 7) {
        console.warn(
            `[SpineLayout] pixi-particles cannot run on Pixi ${compat.version}: load @pixi/particle-emitter 5`,
        );
        return undefined;
    }

    const { Emitter, upgradeConfig } = particles;

    return {
        createEmitter(parent, textures, config) {
            const emitter = upgradeConfig
                ? new Emitter(parent, upgradeConfig(config, textures))
                : new Emitter(parent, textures, config);
            const playOnce = emitter.playOnce.bind(emitter);

            emitter.autoUpdate = false;
            emitter.playOnce = () => burstOnce(emitter, playOnce);
            return emitter;
        },
    };
}
