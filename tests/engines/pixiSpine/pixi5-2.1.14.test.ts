import { pixiSpinePortSuite } from './portSuite';
import { loadLegacyStack, type Stack } from './stacks';

let stack: Stack | undefined;

pixiSpinePortSuite(
    () => (stack ??= loadLegacyStack('pixi.js-v5', 'pixi-spine-v5-38', '2.1.14')),
    '3.8',
);
