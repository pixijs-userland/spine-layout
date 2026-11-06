import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { minorOf } from '../../../src/core/versions';
import type { PixiSpinePort } from '../../../src/engines/pixiSpine';
import { portOf } from './portSuite';
import { canvasPage, type Loaded, type Stack } from './stacks';

/** `SPINE_EXPORT_LISTS`: comma-separated files, each listing one `.json` export per line. */
export const EXPORTS = (process.env.SPINE_EXPORT_LISTS ?? '')
    .split(',')
    .filter(Boolean)
    .flatMap((list) => readFileSync(list, 'utf8').split('\n'))
    .filter(Boolean);

type Json = Loaded;

/** Every region a skeleton names, 4.1 sequence frames included, as 1×1 regions on one page. */
function permissiveAtlas(skeleton: Json): string {
    const skins = Array.isArray(skeleton.skins)
        ? skeleton.skins.map((skin: Json) => skin.attachments ?? {})
        : Object.values(skeleton.skins ?? {});
    const names = new Set<string>();

    skins.forEach((slots: Json) =>
        Object.values(slots).forEach((attachments) =>
            Object.entries(attachments as Json).forEach(([name, map]: [string, Json]) => {
                if (!['region', 'mesh', 'linkedmesh'].includes(map.type ?? 'region')) return;

                const path = map.path ?? map.name ?? name;
                if (!map.sequence) return names.add(path);

                const { count = 0, start = 1, digits = 0 } = map.sequence;
                for (let i = 0; i < count; i++) {
                    names.add(path + String(start + i).padStart(digits, '0'));
                }
            }),
        ),
    );

    const region = (name: string) =>
        `${name}\n  rotate: false\n  xy: 0, 0\n  size: 1, 1\n  orig: 1, 1\n  offset: 0, 0\n  index: -1\n`;

    return `page.png\nsize: 4,4\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n${[...names].map(region).join('')}`;
}

const worldOf = (spine: Loaded) =>
    spine.skeleton.bones.flatMap((bone: Loaded) => [bone.worldX, bone.worldY]) as number[];

export interface CrossCheck {
    from: string;
    to: string;
    /** Whether the two runtimes must pose every bone alike, or their differences are reported. */
    agree: boolean;
}

/**
 * Reads every listed export the stack has a runtime for, then for each animation: classifies
 * its timelines, plays it, checks every bone lands somewhere finite and puts every constraint
 * back to its setup. Where `crossCheck` names a runtime, the export is read again without it,
 * through the pre-passes, and the two poses are compared.
 */
export function realExportsCheck(load: () => Stack, crossCheck?: CrossCheck) {
    it.skipIf(!EXPORTS.length)(
        'reads, classifies, plays and resets real exports',
        () => {
            const stack = load();
            const port = portOf(stack, new Map(), []);
            const textures = { 'page.png': canvasPage(stack.PIXI, 4, 4) };
            const minors = new Set(port.runtimes.map((runtime) => runtime.minor));
            const crossPort =
                crossCheck &&
                portOf(
                    {
                        ...stack,
                        runtimes: stack.runtimes.filter((r) => r.info.minor !== crossCheck.from),
                    },
                    new Map(),
                    [],
                );

            const stats = {
                files: 0,
                skipped: 0,
                notJson: [] as string[],
                unreadable: [] as string[],
                animations: 0,
                claims: { bone: 0, slot: 0, constraint: 0, drawOrder: 0, event: 0 },
                badClaims: [] as string[],
                nonFinite: [] as string[],
                constraintsReset: 0,
                notReset: [] as string[],
                regions: 0,
                crossChecked: 0,
                crossDiffer: [] as string[],
            };

            const { error, warn } = console;
            console.error = console.warn = () => {};

            for (const file of EXPORTS) {
                let skeleton: Json;
                try {
                    skeleton = JSON.parse(readFileSync(file, 'utf8'));
                } catch {
                    stats.notJson.push(file);
                    continue;
                }
                const minor = minorOf(skeleton.skeleton?.spine);
                if (!minor || !minors.has(minor)) {
                    stats.skipped++;
                    continue;
                }
                stats.files++;

                let spine: Loaded;
                try {
                    const data = port.readSkeleton(skeleton, permissiveAtlas(skeleton), textures);
                    spine = port.create(data);
                } catch (error) {
                    stats.unreadable.push(`${file}: ${(error as Error).message}`);
                    continue;
                }
                spine.autoUpdate = false;

                const data = spine.skeleton.data;
                const constraints = [
                    ...spine.skeleton.ikConstraints,
                    ...spine.skeleton.transformConstraints,
                    ...spine.skeleton.pathConstraints,
                ];
                const limits: Record<string, number> = {
                    bone: data.bones.length,
                    slot: data.slots.length,
                    constraint: constraints.length,
                };

                data.skins.forEach((skin: Loaded) =>
                    skin.attachments.forEach((bySlot: Loaded) =>
                        Object.values(bySlot ?? {}).forEach((attachment) => {
                            if (port.regionTexture(attachment)) stats.regions++;
                        }),
                    ),
                );

                const crossSpine =
                    crossCheck?.from === minor && readCross(crossPort!, skeleton, textures);

                for (const animation of data.animations) {
                    stats.animations++;
                    port.claimOf(animation, data).forEach((claim) => {
                        stats.claims[claim.kind]++;
                        const limit = limits[claim.kind];
                        if ('index' in claim && !(claim.index >= 0 && claim.index < limit)) {
                            stats.badClaims.push(
                                `${file} ${animation.name} ${JSON.stringify(claim)}`,
                            );
                        }
                        if (claim.kind !== 'event' && typeof claim.id !== 'string') {
                            stats.badClaims.push(`${file} ${animation.name} id ${claim.id}`);
                        }
                    });

                    const time = Math.min(animation.duration, 1) * 0.6;
                    [spine, crossSpine].filter(Boolean).forEach((target: Loaded) => {
                        target.state.clearTracks();
                        target.skeleton.setToSetupPose();
                        target.state.setAnimation(0, animation.name, false);
                        port.update(target, time);
                    });

                    const world = worldOf(spine);
                    if (!world.every(Number.isFinite))
                        stats.nonFinite.push(`${file} ${animation.name}`);
                    if (crossSpine) {
                        stats.crossChecked++;
                        const other = worldOf(crossSpine);
                        const delta = Math.max(
                            ...world.map((value, i) => Math.abs(value - other[i])),
                        );
                        if (!(delta < 1e-3)) {
                            stats.crossDiffer.push(`${file} ${animation.name} ${delta}`);
                        }
                    }

                    constraints.forEach((constraint: Loaded, index: number) => {
                        port.constraintToSetup(spine.skeleton, index);
                        const fields = Object.keys(constraint.data).filter(
                            (key) =>
                                key in constraint &&
                                ['number', 'boolean'].includes(typeof constraint[key]),
                        );
                        const off = fields.filter(
                            (key) => constraint[key] !== constraint.data[key],
                        );
                        if (off.length) stats.notReset.push(`${file} ${index} ${off}`);
                        else stats.constraintsReset++;
                    });
                }
            }

            Object.assign(console, { error, warn });
            const summary = {
                ...stats,
                notJson: stats.notJson.length,
                unreadable: stats.unreadable.length,
                badClaims: stats.badClaims.length,
                nonFinite: stats.nonFinite.length,
                notReset: stats.notReset.length,
                crossDiffer: stats.crossDiffer.length,
            };
            process.stdout.write(`[pixiSpine real exports] ${JSON.stringify(summary)}\n`);
            stats.notJson.forEach((line) => process.stdout.write(`  not JSON ${line}\n`));
            stats.unreadable.forEach((line) => process.stdout.write(`  unreadable ${line}\n`));
            stats.crossDiffer
                .slice(0, 10)
                .forEach((line) => process.stdout.write(`  cross-read differs ${line}\n`));

            expect(stats.files).toBeGreaterThan(0);
            expect(stats.unreadable).toEqual([]);
            expect(stats.badClaims).toEqual([]);
            expect(stats.nonFinite).toEqual([]);
            expect(stats.notReset).toEqual([]);
            if (crossCheck?.agree) expect(stats.crossDiffer).toEqual([]);
        },
        300_000,
    );
}

function readCross(port: PixiSpinePort, skeleton: Json, textures: Record<string, Loaded>) {
    const spine = port.create(
        port.readSkeleton(structuredClone(skeleton), permissiveAtlas(skeleton), textures),
    );
    spine.autoUpdate = false;
    return spine;
}
