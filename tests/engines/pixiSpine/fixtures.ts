import { readFileSync } from 'node:fs';

export type Minor = '3.7' | '3.8' | '4.0' | '4.1';

type Json = Record<string, unknown>;

const EXPORTED: Record<Minor, string> = {
    '3.7': '3.7.94',
    '3.8': '3.8.99',
    '4.0': '4.0.64',
    '4.1': '4.1.24',
};

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** The contract fixtures' page: `square` upright at 0,0 and `turned` packed turned at 44,0. */
export const ATLAS = `contract.png
size: 64,64
format: RGBA8888
filter: Linear,Linear
repeat: none
square
  rotate: false
  xy: 0, 0
  size: 40, 20
  orig: 40, 20
  offset: 0, 0
  index: -1
turned
  rotate: true
  xy: 44, 0
  size: 20, 10
  orig: 20, 10
  offset: 0, 0
  index: -1
`;

/** 3.7 keeps skins as an object by name, and reads a key with no `time` as NaN. */
function to37(skeleton: Json): Json {
    const keyed = (value: unknown): unknown => {
        if (Array.isArray(value)) {
            return value.map((key) =>
                key && typeof key === 'object' && !Array.isArray(key) && !('slot' in key)
                    ? { time: 0, ...(keyed(key) as Json) }
                    : keyed(key),
            );
        }
        if (value && typeof value === 'object') {
            return Object.fromEntries(
                Object.entries(value).map(([name, entry]) => [name, keyed(entry)]),
            );
        }
        return value;
    };
    const skins = skeleton.skins as { name: string; attachments: Json }[];

    return {
        ...skeleton,
        skins: Object.fromEntries(skins.map(({ name, attachments }) => [name, attachments])),
        animations: keyed(skeleton.animations),
    };
}

function exportedAs(skeleton: Json, minor: Minor): Json {
    const versioned = {
        ...skeleton,
        skeleton: { ...(skeleton.skeleton as Json), spine: EXPORTED[minor] },
    };
    return minor === '3.7' ? to37(versioned) : versioned;
}

/** The skeleton relabelled with another export version, read as that version would be. */
export function relabelled(skeleton: Json, version: string): Json {
    return { ...skeleton, skeleton: { ...(skeleton.skeleton as Json), spine: version } };
}

const contract = (): Json => JSON.parse(read('../../fixtures/contract-3.8.json'));

/** `tests/fixtures/contract-3.8.json`, the same skeleton as `minor` exports it. */
export function contractSkeleton(minor: Minor): Json {
    return exportedAs(contract(), minor);
}

/**
 * The contract skeleton drawn under a clip, from a slot below both of its own to `slot_b`. The
 * clip covers x 0 to 12, y 10 to 30 in skeleton space: around `bone_a` at 10, 20, and short of
 * the right half of anything wider than 4 centred on it.
 */
export function clippedSkeleton(minor: Minor): Json {
    const skeleton = contract() as {
        slots: Json[];
        skins: { attachments: Record<string, Json> }[];
    };

    skeleton.slots.unshift({ name: 'slot_clip', bone: 'root', attachment: 'clip' });
    skeleton.skins[0].attachments.slot_clip = {
        clip: {
            type: 'clipping',
            end: 'slot_b',
            vertexCount: 4,
            vertices: [0, 10, 12, 10, 12, 30, 0, 30],
        },
    };

    return exportedAs(skeleton, minor);
}

/** Bones rotated, sheared, scaled unevenly and flipped, and one keyed through all of it. */
export function skewedSkeleton(minor: Minor): Json {
    const angle = minor.startsWith('3.') ? 'angle' : 'value';

    return exportedAs(
        {
            skeleton: { hash: 'skewed', images: '', audio: '' },
            bones: [
                { name: 'root' },
                {
                    name: 'arm',
                    parent: 'root',
                    x: 30,
                    y: 10,
                    rotation: 35,
                    scaleX: 1.5,
                    scaleY: -0.7,
                    shearX: 12,
                    shearY: -25,
                },
                {
                    name: 'hand',
                    parent: 'arm',
                    x: 20,
                    rotation: -70,
                    scaleX: -1.2,
                    scaleY: 0.8,
                    shearY: 40,
                },
            ],
            slots: [
                { name: 'slot_arm', bone: 'arm', attachment: 'square' },
                { name: 'slot_hand', bone: 'hand', attachment: 'square' },
                { name: 'slot_empty', bone: 'hand' },
            ],
            skins: [
                {
                    name: 'default',
                    attachments: {
                        slot_arm: { square: { width: 40, height: 20 } },
                        slot_hand: { square: { width: 40, height: 20 } },
                    },
                },
            ],
            animations: {
                twist: {
                    bones: {
                        hand: {
                            rotate: [
                                { time: 0, [angle]: 0 },
                                { time: 1, [angle]: 300 },
                            ],
                            shear: [
                                { time: 0, x: 0, y: 0 },
                                { time: 1, x: 80, y: -60 },
                            ],
                            scale: [
                                { time: 0, x: 1, y: 1 },
                                { time: 1, x: -2, y: 0.3 },
                            ],
                        },
                    },
                },
            },
        },
        minor,
    );
}

/**
 * `sequence.png`: `frame1` a whole 10×10, `frame2` the same size trimmed to 4×6 at 5, 3, for a
 * 4.1 sequence of the two.
 */
export const SEQUENCE_ATLAS = `sequence.png
size: 64,16
format: RGBA8888
filter: Linear,Linear
repeat: none
frame1
  rotate: false
  xy: 0, 0
  size: 10, 10
  orig: 10, 10
  offset: 0, 0
  index: -1
frame2
  rotate: false
  xy: 20, 0
  size: 4, 6
  orig: 10, 10
  offset: 5, 3
  index: -1
`;

/**
 * 4.1 sequences of `frame1`, `frame2`: a region that starts on the first, which `flip` holds on
 * the second, and a mesh that starts on the second.
 */
export function sequenceSkeleton(): Json {
    return {
        skeleton: { hash: 'sequence', spine: EXPORTED['4.1'], images: '', audio: '' },
        bones: [{ name: 'root' }],
        slots: [
            { name: 'slot_frame', bone: 'root', attachment: 'frame' },
            { name: 'slot_strip', bone: 'root', attachment: 'strip' },
        ],
        skins: [
            {
                name: 'default',
                attachments: {
                    slot_frame: {
                        frame: {
                            width: 10,
                            height: 10,
                            sequence: { count: 2, start: 1, digits: 1, setup: 0 },
                        },
                    },
                    slot_strip: {
                        strip: {
                            type: 'mesh',
                            path: 'frame',
                            uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                            triangles: [0, 1, 2, 2, 3, 0],
                            vertices: [-5, -5, 5, -5, 5, 5, -5, 5],
                            hull: 4,
                            width: 10,
                            height: 10,
                            sequence: { count: 2, start: 1, digits: 1, setup: 1 },
                        },
                    },
                },
            },
        ],
        animations: {
            flip: {
                attachments: {
                    default: {
                        slot_frame: {
                            frame: { sequence: [{ time: 0, mode: 'hold', index: 1 }] },
                        },
                    },
                },
            },
        },
    };
}

/**
 * Two bones chained along a straight path at 45° by a `chain` path constraint, which turns them
 * along it: `tip`, on the end of the second, lands on the path's line too.
 */
export function chainSkeleton(minor: '4.0' | '4.1'): Json {
    return {
        skeleton: { hash: 'chain', spine: EXPORTED[minor], images: '', audio: '' },
        bones: [
            { name: 'root' },
            { name: 'first', parent: 'root', length: 20 },
            { name: 'second', parent: 'first', x: 20, length: 20 },
            { name: 'tip', parent: 'second', x: 20 },
        ],
        slots: [{ name: 'slot_path', bone: 'root', attachment: 'line' }],
        path: [
            {
                name: 'chain',
                bones: ['first', 'second'],
                target: 'slot_path',
                rotateMode: 'chain',
                spacingMode: 'fixed',
                spacing: 20,
            },
        ],
        skins: [
            {
                name: 'default',
                attachments: {
                    slot_path: {
                        line: {
                            type: 'path',
                            lengths: [106],
                            vertexCount: 6,
                            vertices: [-25, -25, 0, 0, 25, 25, 50, 50, 75, 75, 100, 100],
                        },
                    },
                },
            },
        ],
        animations: {},
    };
}

/**
 * A skeleton for what the contract one lacks: one IK, one transform and one path constraint, a
 * two-color slot and a deformed mesh, all keyed by its one animation, `rig`. The keys change
 * names between generations: 3.x mixes are `rotateMix`/`translateMix`, 4.x `mixRotate`/`mixX`/…;
 * 3.x colours are `color`/`twoColor`, 4.x `rgba`/`rgba2`; 4.x keys one value as `value`; 3.7
 * names path timelines `paths`; 4.1 moves `deform` under `attachments`.
 */
export function rigSkeleton(minor: Minor): Json {
    const v3 = minor.startsWith('3.');
    const transformMix = (mix: number) =>
        v3
            ? { rotateMix: mix, translateMix: mix, scaleMix: mix, shearMix: mix }
            : {
                  mixRotate: mix,
                  mixX: mix,
                  mixY: mix,
                  mixScaleX: mix,
                  mixScaleY: mix,
                  mixShearY: mix,
              };
    const pathMix = (mix: number) =>
        v3 ? { rotateMix: mix, translateMix: mix } : { mixRotate: mix, mixX: mix, mixY: mix };
    const deform = {
        default: {
            slot_mesh: {
                quad: [{ time: 0 }, { time: 1, offset: 0, vertices: [5, 5, 5, 5] }],
            },
        },
    };
    const deformKeys =
        minor === '4.1'
            ? {
                  attachments: {
                      default: { slot_mesh: { quad: { deform: deform.default.slot_mesh.quad } } },
                  },
              }
            : { deform };

    const skeleton: Json = {
        skeleton: { hash: 'rig', spine: EXPORTED[minor], images: '', audio: '' },
        bones: [
            { name: 'root' },
            { name: 'upper', parent: 'root', length: 50 },
            { name: 'lower', parent: 'upper', x: 50, length: 50 },
            { name: 'target', parent: 'root', x: 80, y: 20 },
            { name: 'spinner', parent: 'root', rotation: 45 },
            { name: 'follower', parent: 'root', x: 30 },
            { name: 'walker', parent: 'root' },
        ],
        slots: [
            { name: 'slot_mesh', bone: 'root', attachment: 'quad' },
            { name: 'slot_path', bone: 'root', attachment: 'track' },
            { name: 'slot_tint', bone: 'root', attachment: 'square', dark: '000000' },
        ],
        ik: [{ name: 'reach', order: 0, bones: ['upper', 'lower'], target: 'target', mix: 1 }],
        transform: [
            {
                name: 'follow',
                order: 1,
                bones: ['follower'],
                target: 'spinner',
                ...transformMix(1),
            },
        ],
        path: [{ name: 'walk', order: 2, bones: ['walker'], target: 'slot_path', ...pathMix(1) }],
        skins: [
            {
                name: 'default',
                attachments: {
                    slot_mesh: {
                        quad: {
                            type: 'mesh',
                            path: 'square',
                            uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                            triangles: [0, 1, 2, 2, 3, 0],
                            vertices: [-10, -10, 10, -10, 10, 10, -10, 10],
                            hull: 4,
                            width: 20,
                            height: 20,
                        },
                    },
                    slot_path: {
                        track: {
                            type: 'path',
                            lengths: [100],
                            vertexCount: 6,
                            vertices: [-50, 0, -25, 0, 0, 0, 25, 0, 50, 0, 75, 0],
                        },
                    },
                    slot_tint: { square: { width: 40, height: 20 } },
                },
            },
        ],
        animations: {
            rig: {
                slots: {
                    slot_tint: v3
                        ? {
                              color: [
                                  { time: 0, color: 'ffffffff' },
                                  { time: 1, color: 'ff000080' },
                              ],
                              twoColor: [
                                  { time: 0, light: 'ffffffff', dark: '000000' },
                                  { time: 1, light: 'ff0000ff', dark: '00ff00' },
                              ],
                          }
                        : {
                              rgba: [
                                  { time: 0, color: 'ffffffff' },
                                  { time: 1, color: 'ff000080' },
                              ],
                              rgba2: [
                                  { time: 0, light: 'ffffffff', dark: '000000' },
                                  { time: 1, light: 'ff0000ff', dark: '00ff00' },
                              ],
                          },
                },
                ik: {
                    reach: [
                        { time: 0, mix: 1 },
                        { time: 1, mix: 0 },
                    ],
                },
                transform: {
                    follow: [
                        { time: 0, ...transformMix(1) },
                        { time: 1, ...transformMix(0) },
                    ],
                },
                [minor === '3.7' ? 'paths' : 'path']: {
                    walk: {
                        position: [
                            { time: 0, [v3 ? 'position' : 'value']: 0 },
                            { time: 1, [v3 ? 'position' : 'value']: 1 },
                        ],
                        spacing: [
                            { time: 0, [v3 ? 'spacing' : 'value']: 0 },
                            { time: 1, [v3 ? 'spacing' : 'value']: 10 },
                        ],
                        mix: [
                            { time: 0, ...pathMix(1) },
                            { time: 1, ...pathMix(0) },
                        ],
                    },
                },
                ...deformKeys,
            },
        },
    };

    return minor === '3.7' ? to37(skeleton) : skeleton;
}
