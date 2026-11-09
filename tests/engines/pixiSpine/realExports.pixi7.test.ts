import { realExportsCheck } from './realExports';
import { loadPixi7Stack } from './stacks';

// pixi-spine 4.0.6's runtime-4.0 never turns a `chain` or `chainScale` path constraint's bones:
// `PathConstraint.update` tests `tangents` twice. Its poses differ from runtime-4.1's there.
realExportsCheck(() => loadPixi7Stack(['3.8', '4.0', '4.1']), {
    from: '4.0',
    to: '4.1',
    agree: false,
});
