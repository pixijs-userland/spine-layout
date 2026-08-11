export const parcePointers = {
    slot: {
        spine: 'spine_',
        text: 'text_',
        button: 'button_',
    },
    folder: {
        state: 'state_',
        event: 'event_',
    },
    mod: {
        next: '_next',
        loop: '_loop',
        /**
         * Suffix marking a bone — or a slot, which moves the bone it hangs from — as
         * following the pointer: `crosshair_followPointer` sits under the mouse, or under
         * the finger on a touch screen. See {@link PointerController}.
         */
        followPointer: '_followPointer',
    },
    sound: {
        /**
         * Prefix marking a skeleton event as a music track (`music_loop`, `music2`) instead of
         * an FX. `_loop` alone does *not* mean music — it means the sound loops, so `spin_loop`
         * is a looping FX owned by the animation that fired it.
         */
        music: 'music',
    },
};
