import { expect, it } from 'vitest';
import { UnsupportedSpineVersionError } from '../../../src/engine/errors';
import { pixiSpinePortSuite, portOf } from './portSuite';
import { loadLegacyStack, type Stack } from './stacks';

let stack: Stack | undefined;
const load = () => (stack ??= loadLegacyStack('pixi.js-v4', 'pixi-spine-v4-37', '1.5.23'));

pixiSpinePortSuite(load, '3.7');

it('refuses a 3.7 .skel: no 3.7 runtime reads binary', () => {
    const port = portOf(load());
    const header = new TextEncoder().encode('3.7.94');
    const skel = new Uint8Array([2, 0x78, header.length + 1, ...header]);

    expect(() => port.readSkeleton(skel, '', {})).toThrow(UnsupportedSpineVersionError);
    expect(() => port.readSkeleton(skel, '', {})).toThrow('Spine 3.7.94');
});
