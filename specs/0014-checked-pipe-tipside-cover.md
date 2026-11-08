# 0014: Pipe, Tip side and Cover answer once they moved

Status: live-checked
Mod: 0.16.0 · Started: 2026-11-08 · From: [NEXT.md](../docs/NEXT.md) ("The other buttons' answers")

## Goal

Every other tool button answers ok only once the game did what it asked
(fold, lower, turn on since spec 0003 revision 2, Tip since revision 3,
spec 0012's switches). Pipe, Tip side and Cover still answer ok as soon as
their key ran, so a press the game ignores looks like it worked. Tip did
just that before its check (over a sale point that doesn't take the load,
on land not ours: spec 0003's Log). This gives the last three the same
check, so the dashboard never says ok when nothing moved.

## Behaviour

Nothing changes on screen when the game acts. When it doesn't:

- **Pipe** (Harvester screen, a combine's card): ok once the pipe's
  target state is the one asked (out or in). That flips the frame the
  game accepts the key, so a pipe that takes seconds to swing answers at
  once; the tile's "Moving" shows the rest, as today.
- **Tip side** (a trailer's card): ok once the side stepped (the side's
  index changed). On a side that can't tip (the EDK 650's Grain door) the
  step still counts. Whether Tip fades there is NEXT.md's other item.
- **Cover** (a card's Uncover / Cover) and **Cover all**: ok once the
  cover opened or closed; Cover all names each tool whose cover didn't
  move, in driving order, as Tip all does.
- Otherwise, after the check's wait (`CHECK_MS`, as the others), the ack
  is not ok with the game's words where the cab has them, else "Nothing
  moved"; the dashboard shows it as it does Tip's today.

## Data contract

- **Mod → companion:** none new. These acks gain `checked: true` and,
  when not ok, `unmoved` (fields that exist since spec 0003 revision 2).
- **Web:** no change; the ack's reason is already shown for every button.

Game API names used (all already read by the cab topic):

| Name | Where from | State |
|---|---|---|
| `spec_pipe.targetState` (> 1 out) | Pipe.lua | verified (DONE.md, the states the commands read) |
| `spec_trailer.preferedTipSideIndex`, stepped by `TOGGLE_TIPSIDE` | Trailer.lua | verified (DONE.md, a trailer's tip keys) |
| `spec_cover.state` (0 closed), toggled by `TOGGLE_COVER` | Cover.lua | verified (DONE.md, spec 0014: reads back the frame of the press) |

## Commands

As today (keys, values, fallbacks unchanged); only the answer changes.
In `mod/src/Commands.lua`:

- `tool.pipe` (set, value 1 out): `AIMED.TOGGLE_PIPE` gets
  `check = "pipe"`; moved when the readings' `pipeOut == want`.
- `implement.tipSide` (one-shot, the tool's id): `AIMED.TOGGLE_TIPSIDE`
  gets `check = "tipSide"`; moved when `tipSideIndex ~= before`.
- `implement.cover` (one-shot, the tool's id): `AIMED.TOGGLE_COVER` gets
  `check = "cover"`; moved when `coverOpen ~= before`. Sent without an id
  it still presses N for the selected tool, unchecked, as before (the
  dashboard always sends the id).
- `implement.coverAll` (value 1 open): `cover` joins `CHECKED`; moved
  when `coverOpen == want`.
- `readings()` gains `pipeOut`, `tipSideIndex`, `coverOpen`, read as the
  cab reads them (`VehicleState.extras` / `capabilities`).

## Plan

- `mod/src/Commands.lua`: the three aims' `check`, `readings()`, `moved()`
  (a one-shot compares with `before`), `CHECKED`.
- `mod/tests/run.lua`: tests first (below); the "unchecked action answers
  as before" check (it was Tip side) is gone: no card button is
  unchecked now. `mod/tests/spike_rigs.lua`: the mock keys step the tip
  side, flip the cover and move the pipe.
- `mod/modDesc.xml`: 0.16.0.
- `docs/NEXT.md`: the item goes; this spec's table row in
  `specs/README.md`.
- Risk: a key the game takes but answers later than `CHECK_MS` (none
  seen for these: pipe and cover states flip the frame of the press).

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: `tool.pipe` 1 ok and `checked` once
  `targetState` goes out; a pipe key that does nothing → "Nothing moved";
  `tool.pipe` 1 on a pipe out → `already` as today.
- [x] `mod/tests/run.lua`: `implement.tipSide` ok and `checked` once the
  index steps (also from the last side back to the first); unmoved →
  "Nothing moved".
- [x] `mod/tests/run.lua`: `implement.cover` ok and `checked` when the
  cover opens, and when it closes; unmoved → "Nothing moved".
- [x] `mod/tests/run.lua`: `implement.coverAll` 1 with two tools, one
  cover not moving → not ok, that tool named.
- [x] `python -m pytest mod/tests companion/tests tests` green; the
  golden replay unchanged (it has no such acks to change), else
  regenerated on purpose.

Live check (Solek, mod 0.16.0, `scripts/livewatch.py` running):
- [x] A combine with a pipe: Pipe out and in from the Harvester screen,
  each ok, `checked` in the ack.
- [x] The Vestrum 100 with an EDK 650: Tip side through all four sides
  and back to the first, each ok, `checked`.
- [x] The FH 2200 and the Aerosem: Uncover / Cover on each and Cover all
  both ways, each ok, `checked`.
- [x] One press the game ignores, if a rig gives one (Vincent's pick):
  not ok, "Nothing moved" or the game's words.

## Decisions

- One spec for all three rather than one per rig (NEXT.md said each in
  its rig's spec): the change is the same few lines for each, and there's
  no trailer spec yet. The live check covers each rig.
- Pipe counts as moved by its target state, not by reaching it, as the
  fold counts once it starts moving.

## Out of scope / open questions

- Tip fading where the game won't tip (engine off, a side that can't
  tip): NEXT.md's own item, for the trailer's spec.
- Whether the game refuses the tip side key while tipping: the live check
  may show it; the check answers either way.

## Log

- 2026-11-08: drafted from NEXT.md, approved by Vincent.
- 2026-11-08: built, mod 0.16.0. Tests: "commands, checked: Tip side
  once the side stepped" and "Pipe, Cover and Cover all once they
  moved" in `run.lua`; 120 passed, golden unchanged. The item left
  NEXT.md. Live check open.
- 2026-11-08: live-checked, mod 0.16.0, Solek, `livewatch.py` running,
  confirmed by Vincent. The CH7.70: Pipe with the engine off answered
  "Nothing moved" (the pipe stayed; the game gives no reason of its
  own), then out and in ok, `pipe.out` flipping the frame of the press.
  The Vestrum 100's EDK 650s: Tip side on the selected one Left, Right,
  Back, Grain door, Left, each ok (the wrap from 4 to 1 too); on the
  other, Left to Right, selected and put back. The Valtra S 286's Aerosem
  and FH 2200: Uncover and Cover on the Aerosem, Uncover on the FH (not
  selected), Uncover all with the FH open (the Aerosem alone pressed),
  Cover all (both closed, the selection put back), each ok, `checked`.
  The Cover all ack shown twice was the stream's rotation replaying it.
