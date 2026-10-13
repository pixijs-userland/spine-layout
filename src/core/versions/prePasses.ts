import { isBinarySkeleton, type SkeletonSource } from '../../engine/runtime';

type Json = Record<string, unknown>;
type JsonMap = Record<string, Json>;

/**
 * A rewrite that lets the runtime of export minor `to` read a `from` export as that minor's own
 * runtime does. Measured on our exports (October 2026): through both, 52 of 52 4.0 exports pose
 * on spine-core 4.2.120 as on 4.0.31; through the second, 548 of 553 4.1 exports as on 4.1.56.
 */
export interface PrePass {
    id: string;
    from: string;
    to: string;
    description: string;
    apply(skeleton: Json): Json;
}

/**
 * 4.1 reads mesh deform keys from an animation's `attachments`, 4.0 wrote them under `deform`.
 * The same rewrite as pixi-spine's runtime-4.1 `SkeletonJson` ("ver40 compatibility").
 */
function deformToAttachments(skeleton: Json): Json {
    const animations = skeleton.animations as Record<string, Json> | undefined;
    if (!animations) return skeleton;

    const rewritten = Object.fromEntries(
        Object.entries(animations).map(([name, animation]) => {
            const deform = animation.deform as Record<string, JsonMap> | undefined;
            if (!deform) return [name, animation];

            const attachments: Record<string, JsonMap> = {};
            for (const [skin, slots] of Object.entries(deform)) {
                const skinMap: JsonMap = (attachments[skin] = {});
                for (const [slot, keysByAttachment] of Object.entries(slots)) {
                    const slotMap: Json = (skinMap[slot] = {});
                    for (const [attachment, keys] of Object.entries(keysByAttachment)) {
                        slotMap[attachment] = { deform: keys };
                    }
                }
            }

            return [name, { ...animation, attachments }];
        }),
    );

    return { ...skeleton, animations: rewritten };
}

/** 4.2 reads a bone's inherited transform from `inherit`; 4.1 called it `transform`. */
function transformToInherit(skeleton: Json): Json {
    const bones = skeleton.bones as Json[] | undefined;
    if (!bones?.some((bone) => bone.transform && !bone.inherit)) return skeleton;

    return {
        ...skeleton,
        bones: bones.map((bone) =>
            bone.transform && !bone.inherit ? { ...bone, inherit: bone.transform } : bone,
        ),
    };
}

export const PRE_PASSES: readonly PrePass[] = [
    {
        id: '4.0->4.1',
        from: '4.0',
        to: '4.1',
        description: 'animation deform -> attachments',
        apply: deformToAttachments,
    },
    {
        id: '4.1->4.2',
        from: '4.1',
        to: '4.2',
        description: 'bone transform -> inherit',
        apply: transformToInherit,
    },
];

/**
 * Runs pre-passes over a parsed `.json` in the order given, as `pickRuntime` lists them. The
 * source is left as it was. A binary `.skel` has none: it throws if any are asked for.
 */
export function applyPrePasses(source: SkeletonSource, ids: readonly string[]): SkeletonSource {
    if (!ids.length) return source;
    if (isBinarySkeleton(source)) {
        throw new Error(`Pre-passes ${ids.join(', ')} rewrite JSON; a binary skeleton has none`);
    }

    return ids.reduce<Json>((skeleton, id) => {
        const pass = PRE_PASSES.find((candidate) => candidate.id === id);
        if (!pass) throw new Error(`Unknown pre-pass "${id}"`);
        return pass.apply(skeleton);
    }, source as Json) as SkeletonSource;
}
