import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as spine42 from 'spine-pixi-v8-42';
import { minorOf } from '../../../src/core/versions/minorOf';
import { applyPrePasses, PRE_PASSES } from '../../../src/core/versions/prePasses';

type Json = Record<string, any>;

/** spine-core 4.2.120 reading against an atlas that has every region, so only the format counts. */
function read42(skeleton: object) {
    const region = Object.assign(new spine42.TextureRegion(), {
        u: 0,
        v: 0,
        u2: 1,
        v2: 1,
        width: 100,
        height: 100,
        originalWidth: 100,
        originalHeight: 100,
    });
    const loader = new spine42.AtlasAttachmentLoader({ findRegion: () => region } as never);

    return new spine42.SkeletonJson(loader).readSkeletonData(skeleton);
}

const deformTimelines = (data: spine42.SkeletonData) =>
    data.animations
        .flatMap((animation) => animation.timelines)
        .filter((timeline) => timeline instanceof spine42.DeformTimeline).length;

const inheritOf = (transform: string) =>
    spine42.Inherit[
        (transform[0].toUpperCase() + transform.slice(1)) as keyof typeof spine42.Inherit
    ];

function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object') Object.values(Object.freeze(value)).forEach(deepFreeze);
    return value;
}

const mesh = {
    type: 'mesh',
    uvs: [0, 0, 1, 0, 0, 1],
    triangles: [0, 1, 2],
    vertices: [0, 0, 10, 0, 0, 10],
    hull: 3,
};
const keys = [{ vertices: [1, 1] }, { time: 1 }];

const export40 = (): Json => ({
    skeleton: { spine: '4.0.64' },
    bones: [{ name: 'root' }, { name: 'tail', parent: 'root', transform: 'noScale' }],
    slots: [{ name: 'body', bone: 'root', attachment: 'body' }],
    skins: [{ name: 'default', attachments: { body: { body: mesh } } }],
    animations: {
        wobble: { deform: { default: { body: { body: keys } } } },
        idle: { bones: { tail: { rotate: [{ angle: 10 }] } } },
    },
});

const export41 = (): Json => ({
    skeleton: { spine: '4.1-from-4.2.43' },
    bones: [
        { name: 'root' },
        { name: 'a', parent: 'root', transform: 'onlyTranslation' },
        { name: 'b', parent: 'a', transform: 'noRotationOrReflection' },
        { name: 'c', parent: 'b', transform: 'normal' },
        { name: 'd', parent: 'c' },
    ],
});

describe('PRE_PASSES', () => {
    it('lists 4.0 -> 4.1 and 4.1 -> 4.2', () => {
        expect(PRE_PASSES.map(({ id, from, to }) => [id, from, to])).toEqual([
            ['4.0->4.1', '4.0', '4.1'],
            ['4.1->4.2', '4.1', '4.2'],
        ]);
    });
});

describe('applyPrePasses', () => {
    it("moves 4.0 deform keys under `attachments`, as pixi-spine's runtime-4.1 does", () => {
        const source = deepFreeze(export40());
        const out = applyPrePasses(source, ['4.0->4.1']) as Json;

        expect(out.animations.wobble.attachments).toEqual({
            default: { body: { body: { deform: keys } } },
        });
        expect(out.animations.wobble.deform).toBe(source.animations.wobble.deform);
        expect(out.animations.idle).toBe(source.animations.idle);
        expect(out.bones).toBe(source.bones);
    });

    it('names 4.1 bone `transform` `inherit`, leaving bones that set none alone', () => {
        const source = deepFreeze(export41());
        const out = applyPrePasses(source, ['4.1->4.2']) as Json;

        expect(out.bones.map((bone: Json) => bone.inherit)).toEqual([
            undefined,
            'onlyTranslation',
            'noRotationOrReflection',
            'normal',
            undefined,
        ]);
        expect(out.bones[0]).toBe(source.bones[0]);
    });

    it('is what spine-core 4.2 needs to read a 4.0 export as 4.0 did', () => {
        const raw = read42(export40());
        const passed = read42(applyPrePasses(export40(), ['4.0->4.1', '4.1->4.2']));

        expect(deformTimelines(raw)).toBe(0);
        expect(raw.findBone('tail')!.inherit).toBe(spine42.Inherit.Normal);
        expect(deformTimelines(passed)).toBe(1);
        expect(passed.findBone('tail')!.inherit).toBe(spine42.Inherit.NoScale);
    });

    it('is what spine-core 4.2 needs to read a 4.1 export as 4.1 did', () => {
        const passed = read42(applyPrePasses(export41(), ['4.1->4.2']));
        const raw = read42(export41());

        expect(passed.bones.map((bone) => bone.inherit)).toEqual([
            spine42.Inherit.Normal,
            spine42.Inherit.OnlyTranslation,
            spine42.Inherit.NoRotationOrReflection,
            spine42.Inherit.Normal,
            spine42.Inherit.Normal,
        ]);
        expect(raw.bones.every((bone) => bone.inherit === spine42.Inherit.Normal)).toBe(true);
    });

    it('returns the source itself for no pre-pass, and refuses a binary or an unknown one', () => {
        const source = export41();

        expect(applyPrePasses(source, [])).toBe(source);
        expect(applyPrePasses(new Uint8Array(4), [])).toBeInstanceOf(Uint8Array);
        expect(() => applyPrePasses(new Uint8Array(4), ['4.1->4.2'])).toThrow(/binary/);
        expect(() => applyPrePasses(source, ['4.2->4.3'])).toThrow(/Unknown pre-pass "4\.2->4\.3"/);
    });
});

/**
 * Real exports, read-only: `SPINE_EXPORT_LISTS` names files, comma-separated, that list one
 * skeleton `.json` path per line. Skipped without it.
 */
const exportFiles = (process.env.SPINE_EXPORT_LISTS ?? '')
    .split(',')
    .filter(Boolean)
    .flatMap((list: string) => readFileSync(list, 'utf8').split('\n').filter(Boolean));

describe.skipIf(!exportFiles.length)('pre-passes on real 4.0 and 4.1 exports', () => {
    it('let spine-core 4.2 read every deform key and bone transform they carry', () => {
        const seen = { files: 0, unreadable: 0, deformKeys: 0, transforms: 0, lostWithout: 0 };

        for (const file of exportFiles) {
            let json: Json;
            try {
                json = JSON.parse(readFileSync(file, 'utf8'));
            } catch {
                seen.unreadable++;
                continue;
            }

            const minor = minorOf(json.skeleton?.spine);
            if (minor !== '4.0' && minor !== '4.1') continue;
            seen.files++;

            const ids = minor === '4.0' ? ['4.0->4.1', '4.1->4.2'] : ['4.1->4.2'];
            const before = JSON.stringify(json);
            const passed = read42(applyPrePasses(json, ids));

            expect(JSON.stringify(json), file).toBe(before);

            // 4.0 keys deform by skin/slot/attachment; 4.1 by skin/slot/attachment/`deform`
            const deformKeys = Object.values(json.animations ?? {}).flatMap((animation: any) =>
                Object.values(
                    (minor === '4.0' ? animation.deform : animation.attachments) ?? {},
                ).flatMap((slots: any) =>
                    Object.values(slots).flatMap((attachments: any) =>
                        Object.values(attachments)
                            .map((keys: any) => (minor === '4.0' ? keys : keys.deform))
                            .filter((frames: any) => frames?.length),
                    ),
                ),
            ).length;
            expect(deformTimelines(passed), file).toBe(deformKeys);
            seen.deformKeys += deformKeys;

            const bones = (json.bones as Json[]).filter((bone) => bone.transform);
            bones.forEach((bone) =>
                expect(passed.findBone(bone.name)!.inherit, `${file} ${bone.name}`).toBe(
                    inheritOf(bone.transform),
                ),
            );
            seen.transforms += bones.length;

            const changes = deformKeys || bones.some((bone) => bone.transform !== 'normal');
            if (changes) {
                try {
                    const raw = read42(json);
                    const kept =
                        deformTimelines(raw) === deformKeys &&
                        bones.every(
                            (bone) =>
                                raw.findBone(bone.name)!.inherit === inheritOf(bone.transform),
                        );
                    if (!kept) seen.lostWithout++;
                } catch {
                    seen.lostWithout++;
                }
            }
        }

        console.info('[pre-passes on real exports]', JSON.stringify(seen));
        expect(seen.files).toBeGreaterThan(0);
    }, 120_000);
});
