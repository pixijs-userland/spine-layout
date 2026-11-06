// @vitest-environment happy-dom
import { describeLegacyPorts } from './legacySuite';

describeLegacyPorts({ major: 6, particles: ['pixi-particles', 'particle-emitter'] });
