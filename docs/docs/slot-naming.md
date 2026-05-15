---
title: Slot Naming
sidebar_position: 3
---

The scene is assembled by scanning slot names. No code changes are needed when the Spine file uses the right prefixes:

| Prefix         | Effect                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| `spine_<id>`   | Attach the child spine with that ID into this slot                           |
| `text_<key>`   | Create a text node here (configured via `settings/texts.json`)               |
| `button_<key>` | Create an invisible interactive sprite; fires `<key>_click/hover/...` events |
