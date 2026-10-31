# NNNN: Feature name

Status: draft | approved | built | live-checked
Mod: 0.x.y · Started: YYYY-MM-DD · Design: [THEMES.md](../docs/THEMES.md#...) (if any)

## Goal

One paragraph: what the player gets, and why it's worth building.

## Behaviour

What the screen shows and what each tap does, as the player sees it. Day
and Night, and the sizes that matter (1180×820 is the reference tablet).

## Data contract

What changes between the layers. Topics may gain fields freely (Protocol
v1); say so if `v` must change.

- **Mod → companion** (topic, field, type, unit, when it's absent):
- **Companion** (`companion/protocol.py`): new models or fields, if any.
- **Web** (selectors, widgets): what reads it.

Game API names used, each one **verified** (with its place in
[DONE.md](../docs/DONE.md)) or **unverified** (behind the guards in
`mod/src/Api.lua`):

| Name | Where from | State |
|---|---|---|
| `spec_x.y` | Foo.lua | unverified |

## Commands

Web → game actions (`companion/commands.py`, `mod/src/Commands.lua`): the
action name, the game input it presses, its fallback, and what the
dashboard shows the same frame.

## Plan

Files that change, layer by layer, and the risks. Keep it short: it's a
checklist for the build, not a design document.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [ ] `mod/tests/run.lua`: ...
- [ ] `companion/tests/...`: ...
- [ ] `web/test.html`: ...
- [ ] Replay in the browser pane (`replay-solek`): ...

Live check (in game; say the map, vehicle and steps):
- [ ] ...

## Decisions

Choices made while building that the live check should confirm or change.

## Out of scope / open questions

## Log

- YYYY-MM-DD: what happened (built, first look, fixes, confirmed).
