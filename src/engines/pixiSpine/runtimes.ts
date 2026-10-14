import type { SpineRuntimeInfo } from '../../engine/Engine';
import type { Exports } from '../shared/exports';
import { core3, core4, type CoreShim } from './cores';
import type {
    PixiSpineAtlasClass,
    PixiSpineClass,
    PixiSpineCore,
    PixiSpineLegacyNamespace,
    PixiSpineModularBase,
    PixiSpineModularRuntime,
} from './types';

export type AttachmentKind = 'region' | 'mesh' | 'clipping';

/** One pixi-spine runtime as the port drives it: its classes, display class and core shim. */
export interface PixiSpineRuntime {
    readonly info: SpineRuntimeInfo;
    readonly classes: PixiSpineCore;
    readonly Spine: PixiSpineClass;
    readonly TextureAtlas: PixiSpineAtlasClass;
    readonly core: CoreShim;
    yDown(): boolean;
    /** What a drawn attachment is, or `undefined` for anything that draws nothing. */
    kindOf(attachment: unknown): AttachmentKind | undefined;
}

export interface PixiSpineAdapterOptions {
    /** The pixi-spine release the namespace comes from, as it is logged; none carries its own. */
    packageVersion: string;
}

export type PixiSpineMinor = '3.7' | '3.8' | '4.0' | '4.1';

/** The export minor a runtime reads, by what it has that the one before lacks. */
export function minorOfRuntime(classes: PixiSpineCore): PixiSpineMinor {
    const timeline = classes.Timeline?.prototype as { getPropertyIds?: unknown } | undefined;

    if (typeof timeline?.getPropertyIds === 'function') return classes.Sequence ? '4.1' : '4.0';

    return 'addSkin' in classes.Skin.prototype ? '3.8' : '3.7';
}

const coreOf = (minor: PixiSpineMinor) => (minor.startsWith('3.') ? core3 : core4);

/**
 * pixi-spine 1.x (Pixi 4) or 2.x (Pixi 5): `PIXI.spine` with one runtime at `core`, whose
 * attachments carry no `type`. Which runtime that is shows in its classes.
 */
export function pixiSpineLegacy(
    ns: Exports<PixiSpineLegacyNamespace>,
    { packageVersion }: PixiSpineAdapterOptions,
): PixiSpineRuntime {
    const { core: classes, Spine } = ns as PixiSpineLegacyNamespace;
    const minor = minorOfRuntime(classes);

    return {
        info: { minor, family: 'pixi-spine-legacy', packageName: 'pixi-spine', packageVersion },
        classes,
        Spine,
        TextureAtlas: classes.TextureAtlas,
        core: coreOf(minor),
        yDown: () => classes.Bone.yDown,
        kindOf(attachment) {
            if (attachment instanceof classes.RegionAttachment) return 'region';
            if (attachment instanceof classes.MeshAttachment) return 'mesh';
            if (attachment instanceof classes.ClippingAttachment) return 'clipping';
            return undefined;
        },
    };
}

/**
 * `@pixi-spine/*` 3.x (Pixi 6) or 4.x (Pixi 7): one base and a runtime per export minor, keyed by
 * that minor. A key that is not the runtime's own minor is refused: pixi-spine reads a mismatched
 * export with no more than a `console.error`.
 */
export function pixiSpineModular(
    given: Exports<PixiSpineModularBase>,
    runtimes: Partial<Record<PixiSpineMinor, Exports<PixiSpineModularRuntime>>>,
    { packageVersion }: PixiSpineAdapterOptions,
): PixiSpineRuntime[] {
    const base = given as PixiSpineModularBase;
    const { AttachmentType, TextureAtlas, settings } = base;

    const kindOf = (attachment: unknown): AttachmentKind | undefined => {
        const type = (attachment as { type?: unknown } | null)?.type;

        if (type === AttachmentType.Region) return 'region';
        if (type === AttachmentType.Mesh) return 'mesh';
        if (type === AttachmentType.Clipping) return 'clipping';
        return undefined;
    };

    const modules = runtimes as Partial<Record<PixiSpineMinor, PixiSpineModularRuntime>>;

    return Object.entries(modules).map(([key, classes]) => {
        const minor = minorOfRuntime(classes);
        if (key !== minor) {
            throw new Error(`pixiSpineModular: the runtime given as ${key} reads Spine ${minor}`);
        }
        if (!(classes.Spine.prototype instanceof base.SpineBase)) {
            throw new Error(`pixiSpineModular: runtime ${minor} was built against another base`);
        }

        return {
            info: {
                minor,
                family: 'pixi-spine-modular',
                packageName: `@pixi-spine/runtime-${minor}`,
                packageVersion,
            },
            classes,
            Spine: classes.Spine,
            TextureAtlas,
            core: coreOf(minor),
            yDown: () => settings.yDown,
            kindOf,
        };
    });
}
