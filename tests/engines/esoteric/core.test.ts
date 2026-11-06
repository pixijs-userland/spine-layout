// @vitest-environment happy-dom
import * as SP43 from '@esotericsoftware/spine-pixi-v8';
import * as SP42 from 'spine-pixi-v8-42';
import { describe, expect, it } from 'vitest';
import type { SkeletonDataLike } from '../../../src/engine/runtime';
import {
    createCore42,
    createCore43,
    esotericMinorOf,
    PROPERTY_42,
    type EsotericModule,
} from '../../../src/engines/esoteric';

type Timeline = { propertyIds: string[] };
const timeline = (name: string, ...args: unknown[]): Timeline => {
    const Class = (SP42 as unknown as Record<string, new (...args: unknown[]) => Timeline>)[name];
    return new Class(...args);
};

describe('spine-core 4.2 property numbers', () => {
    it.each([
        ['RotateTimeline', [1, 0, 3], 'rotate'],
        ['InheritTimeline', [1, 3], 'inherit'],
        ['RGBTimeline', [1, 0, 3], 'rgb'],
        ['AlphaTimeline', [1, 0, 3], 'alpha'],
        ['AttachmentTimeline', [1, 3], 'attachment'],
        ['EventTimeline', [1], 'event'],
        ['DrawOrderTimeline', [1], 'drawOrder'],
        ['IkConstraintTimeline', [1, 0, 3], 'ikConstraint'],
        ['TransformConstraintTimeline', [1, 0, 3], 'transformConstraint'],
        ['PathConstraintPositionTimeline', [1, 0, 3], 'pathConstraintPosition'],
        ['PathConstraintMixTimeline', [1, 0, 3], 'pathConstraintMix'],
        ['PhysicsConstraintInertiaTimeline', [1, 0, 3], 'physicsConstraintInertia'],
        ['PhysicsConstraintMixTimeline', [1, 0, 3], 'physicsConstraintMix'],
        ['PhysicsConstraintResetTimeline', [1, 3], 'physicsConstraintReset'],
    ] as const)('labels a %s as its own', (name, args, property) => {
        const [id] = timeline(name, ...args).propertyIds;

        expect(Number(id.split('|')[0])).toBe(PROPERTY_42[property]);
    });

    it('labels a two-colour timeline rgb, alpha and rgb2', () => {
        expect(timeline('RGBA2Timeline', 1, 0, 3).propertyIds).toEqual([
            `${PROPERTY_42.rgb}|3`,
            `${PROPERTY_42.alpha}|3`,
            `${PROPERTY_42.rgb2}|3`,
        ]);
    });
});

describe('classifying property ids', () => {
    const data42 = {
        ikConstraints: [{}, {}],
        transformConstraints: [{}, {}, {}],
        pathConstraints: [{}],
        physicsConstraints: [{}, {}],
    } as unknown as SkeletonDataLike;

    it.each([
        ['7|2', { kind: 'bone', index: 2 }],
        ['12|1|4', { kind: 'slot', index: 1 }],
        ['28|3|9', { kind: 'slot', index: 3 }],
        ['13', { kind: 'event' }],
        ['14', { kind: 'drawOrder' }],
        ['15|1', { kind: 'constraint', index: 1 }],
        ['16|2', { kind: 'constraint', index: 4 }],
        ['17|0', { kind: 'constraint', index: 5 }],
        ['19|0', { kind: 'constraint', index: 5 }],
        ['20|1', { kind: 'constraint', index: 7 }],
        ['26|-1', { kind: 'constraint', index: -1 }],
        ['27', { kind: 'constraint', index: -1 }],
    ])('4.2 reads %s per type, constraints flattened ik, transform, path, physics', (id, entry) => {
        expect(createCore42(SP42).classify(id, data42)).toMatchObject(entry);
    });

    it.each([
        ['7|2', { kind: 'bone', index: 2 }],
        ['29|1|5', { kind: 'slot', index: 1 }],
        ['14', { kind: 'drawOrder' }],
        ['15|2', { kind: 'drawOrder' }],
        ['16|0', { kind: 'constraint', index: 0 }],
        ['30|3', { kind: 'constraint', index: 3 }],
        ['28', { kind: 'constraint', index: -1 }],
    ])('4.3 reads %s off its own Property', (id, entry) => {
        expect(createCore43(SP43).classify(id, data42)).toMatchObject(entry);
    });

    it('keeps the id it was given, which is what claims compete by', () => {
        expect(createCore42(SP42).classify('16|2', data42)).toEqual({
            kind: 'constraint',
            index: 4,
            id: '16|2',
        });
    });
});

describe('telling the spine-core minor of a module', () => {
    it('reads 4.3 off DrawOrder and 4.2 off Physics', () => {
        expect(esotericMinorOf(SP43)).toBe('4.3');
        expect(esotericMinorOf(SP42)).toBe('4.2');
    });

    it('knows no other module', () => {
        expect(() => esotericMinorOf({} as EsotericModule)).toThrow(/4\.2 or 4\.3/);
    });
});
