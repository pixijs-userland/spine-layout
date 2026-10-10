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
    /**
     * The two states the layout plays for itself, from the shape of the screen: a window
     * taller than it is wide poses `state_portrait/`, a wider one `state_landscape/`. See
     * {@link OrientationController} — nothing else is needed to make a scene turn with the
     * device.
     */
    orientation: {
        portrait: 'portrait',
        landscape: 'landscape',
    } as const,
    sound: {
        /**
         * Word marking a skeleton event, anywhere in its name, as a music track (`music`,
         * `fs_music`) instead of an FX. Music always loops and replaces the playing track,
         * so it takes no `_loop` modifier — a trailing one is stripped and ignored. `_loop`
         * alone does *not* mean music — it means the sound loops, so `spin_loop` is a
         * looping FX owned by the animation that fired it.
         */
        music: 'music',
    },
};
