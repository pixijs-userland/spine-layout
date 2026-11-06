import { pixiSpinePortSuite } from './portSuite';
import { loadLegacyStack, type Stack } from './stacks';

let stack: Stack | undefined;

pixiSpinePortSuite(
    () => (stack ??= loadLegacyStack('pixi.js-v4', 'pixi-spine-v4', '1.6.2')),
    '3.8',
);
