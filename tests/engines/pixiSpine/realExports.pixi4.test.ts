import { realExportsCheck } from './realExports';
import { loadLegacyStack } from './stacks';

realExportsCheck(() => loadLegacyStack('pixi.js-v4', 'pixi-spine-v4', '1.6.2'));
