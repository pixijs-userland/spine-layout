import { createHookSet } from '../shared/hookSet';
import type { Pixi4Spine } from './pixi4.types';

/** Runs after every `spine.update(dt)`, with that `dt`. Slot objects and the layout share it. */
export const onSpineUpdate = createHookSet<Pixi4Spine, [number]>((spine, run) => {
    const previous = spine.update;

    spine.update = (dt: number) => {
        previous.call(spine, dt);
        run(dt);
    };

    return () => {
        spine.update = previous;
    };
});
