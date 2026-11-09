import { pixiSpinePortSuite } from './portSuite';
import { loadLegacyStack, type Stack } from './stacks';

let stack: Stack | undefined;

pixiSpinePortSuite(
    () => (stack ??= loadLegacyStack('pixi.js-v5', 'pixi-spine-v5-37', '2.0.5')),
    '3.7',
);
