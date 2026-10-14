// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLegacyPorts } from '../../../src/engines/legacy';
import { describeLegacyPorts } from './legacySuite';
import { loadPixi, withParticles, type LoadedPixi } from './loadLegacyPixi';

describeLegacyPorts({ major: 7, particles: ['particle-emitter'] });

describe('Pixi 7 only', () => {
    let PIXI: LoadedPixi;

    beforeAll(() => {
        PIXI = loadPixi(7);
    });

    it('turns down 7.0 and 7.1, which have federated events but no eventMode', () => {
        const before72 = Object.create(PIXI, { Container: { value: class {} } });
        expect(() => createLegacyPorts(before72)).toThrow(/7\.2 or later/);
    });

    it('leaves particles out, saying why, when pixi-particles is all there is', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(createLegacyPorts(withParticles(PIXI, 'pixi-particles')).particles).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('pixi-particles cannot run on Pixi 7.4.3'),
        );
        warn.mockRestore();
    });
});
