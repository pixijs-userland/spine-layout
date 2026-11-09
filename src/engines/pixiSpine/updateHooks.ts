import { createHookSet } from '../shared/hookSet';
import type { PixiSpineView } from './types';

/** Runs after every `spine.update(dt)`, with that `dt`. Slot objects and the layout share it. */
export const onSpineUpdate = createHookSet<PixiSpineView, [number]>((spine, run) => {
    const previous = spine.update;

    spine.update = (dt: number) => {
        previous.call(spine, dt);
        run(dt);
    };

    return () => {
        spine.update = previous;
    };
});
