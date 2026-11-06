import { realExportsCheck } from './realExports';
import { loadPixi6Stack } from './stacks';

realExportsCheck(() => loadPixi6Stack(['3.8', '4.0', '4.1']), {
    from: '4.0',
    to: '4.1',
    agree: true,
});
