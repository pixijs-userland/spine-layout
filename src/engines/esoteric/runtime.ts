import { minorOf } from '../../core/versions/minorOf';
import { RUNTIME_MATRIX } from '../../core/versions/runtimeMatrix';
import type { SpineRuntimeInfo } from '../../engine/Engine';
import { esotericMinorOf, esotericPixiOf } from './core';
import type { EsotericMinor, EsotericModule } from './types';

/** An Esoteric runtime its caller imported, ready for an engine to build a port from. */
export interface EsotericRuntime {
    readonly family: 'esoteric';
    readonly pixi: 7 | 8;
    readonly minor: EsotericMinor;
    readonly module: EsotericModule;
    readonly info: SpineRuntimeInfo;
}

const PATCH = /^\d+\.\d+\.\d+/;

/**
 * Wraps a spine-pixi-v7 or spine-pixi-v8 namespace. The spine-core minor is read off the module;
 * `version` checks it, and with a patch (`'4.3.7'`) is the package version logged.
 */
export function esotericRuntime(mod: EsotericModule, version?: string): EsotericRuntime {
    const minor = esotericMinorOf(mod);
    const pixi = esotericPixiOf(mod);

    if (version !== undefined && minorOf(version) !== minor) {
        throw new Error(`This spine-pixi-v${pixi} module reads Spine ${minor}, not ${version}`);
    }

    const entry = RUNTIME_MATRIX[pixi][minor];
    const packageVersion = version?.match(PATCH)?.[0] ?? entry.packageVersion;

    return {
        family: 'esoteric',
        pixi,
        minor,
        module: mod,
        info: { minor, ...entry, packageVersion },
    };
}
