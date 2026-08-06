---
title: Slot Naming
sidebar_position: 3
---

The scene is assembled by scanning slot names. No code changes are needed when the Spine file uses the right prefixes:

| Prefix         | Effect                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `spine_<id>`   | Attach the child spine with that ID into this slot                                                          |
| `text_<key>`   | Create a text node here (configured via `settings/texts.json`); fires `<key>_change` when its value changes |
| `button_<key>` | Create an invisible interactive sprite; fires `<key>_click/hover/...` events                                |

## Text change events

Whenever a text node's value actually changes, an event named `<key>_change` is fired — so
`text_balance` fires `balance_change`. Everything under the matching `event_<key>_change/`
animation folder plays, exactly like button events:

```
event_balance_change/
  balance_up
  balance_down
```

Seeding the configured `value` at registration is not a change and fires nothing, and setting
the same value again is a no-op. For an animated count-up (`animateNumber`, or `set(…, true)`)
the event fires once at the start, so the spine animation runs alongside the counter rather
than after it.

Listeners get the previous and next value:

```ts
layout.animations.addEventListener('balance_change', (_spineID, _spine, event) => {
    console.log(event); // { eventName: 'balance_change', from: '100', to: '250' }
});
```

On multiple-instance spines the bare slot key is used, so `counter_1`'s `text_reward` fires
`reward_change`, not `counter_1_reward_change`.
