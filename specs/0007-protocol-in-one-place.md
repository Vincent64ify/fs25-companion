# 0007: The protocol in one place

Status: live-checked
Mod: 0.9.0 · Started: 2026-10-31 · Plan: [SIMPLIFY.md, S2](../docs/SIMPLIFY.md#s2-the-protocol-in-one-place-spec-0007)

## Goal

Each part of the protocol is written once. Topic shapes live only in
`web/src/types.js` (the dashboard is the one reader that cares); the
companion checks the envelope and nothing more. The command list lives
only in the mod: it's keyed by the dashboard's action name and checks
values itself, so a new button touches the web and the mod, not four
layers. The player sees no change.

## Behaviour

What the player sees doesn't change: every button does what it does
today, with the same answers. Two refusals move:

- **An unknown action or a value out of range** is refused by the mod
  ("action not allowed", "value not allowed"), not by the companion. The
  answer comes a frame later than today; the dashboard shows it the same
  way.
- **A mod older than 0.9.0** (it reads the old action names): every
  command is answered at once by the companion with "update the mod", and
  no command file is written. Topics still show as usual.
- **A malformed topic** (say a player position that isn't a number) now
  reaches the dashboard instead of being dropped by the companion: only
  the envelope is checked. The dashboard ignores what it can't read.
- **`cruise.set` below 1 km/h** is refused ("value not allowed") by the
  mod; it used to clamp it to 1. The dashboard never sends one (the
  companion refused it before too), so nothing changes in use.

## Data contract

Topics don't change (Protocol v1). Commands change meaning in the command
file only.

- **Mod → companion, `hello.commands`:** gains `actions: 2` (integer):
  the command file's `action` is the dashboard's action name. Absent (mod
  0.8.x): the game's input name. A hello without `commands` (a replay) has
  no game to send commands to, as today.
- **Command file** (`cmd/<n>.xml`): `action="lights.toggle"` instead of
  `action="TOGGLE_LIGHTS"`; `value` as today.
- **`command_ack.action`:** the dashboard's action name (was the game's
  input name). `via` still names what ran: the input action, or "setter".
- **Companion, envelope check** (`protocol.py`, plain Python, no
  Pydantic): `v` an int equal to 1 (else `protocol_error`, as today),
  `seq` an int ≥ 0, `t` a number, `topic` matching
  `^[a-z][a-z0-9_]{0,31}$`, `data` an object, no other keys. What's inside
  `data` isn't checked: the dashboard ignores what it doesn't know.
- **Companion, command check:** `action` a string matching
  `^[a-zA-Z.]{1,40}$`, `value` a number (not a bool) or absent; anything
  else answered "action not allowed" / "value not allowed" at once, as
  today. Everything else goes to the mod.
- **Web** (`types.js`): the one description of every topic's fields. It
  gains what only `protocol.py` described today (`env`, the `vehicles`
  entries' fields, `fields`, `command_ack`, `hello.commands`), each with
  the comments that explain units and absence.

No new game API names: the mod's actions run exactly as today (the same
inputs, setters and jobs), only keyed differently.

## Commands

`mod/src/Commands.lua`: `Commands.ACTIONS` is keyed by the dashboard's
name, each entry as today plus its value rule:

| Dashboard action | Today's game name | Value |
|---|---|---|
| `lights.toggle`, `highBeam.toggle`, `beacon.toggle`, `hazard.toggle`, `turnLeft.toggle`, `turnRight.toggle` | `TOGGLE_LIGHTS`, ... | none |
| `engine.toggle`, `cruise.toggle`, `cruise.down`, `cruise.up`, `ai.toggle`, `hitch.toggle` | `TOGGLE_MOTOR_STATE`, ... | none |
| `cruise.set` | `CRUISE_SET_SPEED` | 1 to 250 (km/h) |
| `implement.select`, `implement.detach` | `SELECT_IMPLEMENT`, `DETACH_IMPLEMENT` | a tool id, 0 to 2³¹ |
| `implement.lower`, `.fold`, `.turnOn`, `.unload`, `.cover`, `.pipe`, `.tipSide`, `.rotate`, `.baleReset` | `LOWER_IMPLEMENT`, ... | a tool id, or none |
| `implement.key` | `PRESS_TOOL_KEY` | 1 to 64 |
| `implement.tipAll`, `implement.coverAll` | `TIP_ALL`, `COVER_ALL` | 0 or 1 |
| `implement.next`, `.previous`, `.lowerAll`, `.straw`, `.foldAll`, `.turnOnAll` | `SELECT_NEXT_IMPLEMENT`, ... | none |

A value where none is allowed, a missing one where one is needed, or one
out of range: "value not allowed". The log line becomes `command
lights.toggle via TOGGLE_LIGHTS`.

## Plan

- **Mod:** `Commands.lua` (ACTIONS keys, a `values` rule per entry, the
  check in `run`), `Companion.lua` (`hello.commands.actions = 2`),
  `modDesc.xml` 0.9.0. `mod/tests/run.lua`: the new names, the value
  checks, an unknown action.
- **Companion:**
  - `protocol.py`: the envelope check and the command shape check in
    plain Python (under 80 lines from 502); the topic models,
    `COMMAND_ACTIONS`, `COMMAND_VALUES` and `COMMAND_VALUE_OPTIONAL` go.
  - `commands.py`: `ACTIONS`, `VALUES`, `OPTIONAL` go; it writes the
    dashboard's name; it answers "update the mod" while the session's
    hello has `commands` without `actions: 2`. Coalescing `cruise.set`
    stays (S3).
  - `server.py`: the shape check instead of the allow-list.
  - `requirements.txt`: `pydantic` goes as a direct dependency (FastAPI
    still brings it).
- **Web:** `types.js` only.
- **Tests:** `companion/tests/test_protocol.py` keeps the envelope tests
  and loses the topic ones; `test_commands.py` and `test_server.py` for
  the pass-through, the shape check and "update the mod";
  `tests/test_golden.py`'s fake mod refuses what the real one refuses.
- **Docs:** `companion/README.md`, the spec template, DONE.md's command
  path.
- **Risk:** a dashboard and a mod out of step. The gate makes it an
  "update the mod" answer, never a wrong key.

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: every dashboard action runs as its old game
      name did; an unknown action and each kind of bad value are refused
      with the reason; the ack carries the dashboard's name; hello has
      `commands.actions = 2`.
- [x] `companion/tests/test_protocol.py`: the envelope check takes every
      fixture line and refuses each malformed envelope as today.
- [x] `companion/tests/test_commands.py`: the file carries the dashboard's
      name and value; a session whose hello says no `actions: 2` answers
      "update the mod" and writes nothing.
- [x] `companion/tests/test_server.py`: any well-formed action reaches the
      writer; a bad shape is refused at once.
- [x] `tests/test_golden.py`: viewer messages unchanged (the fake mod
      refuses `nope.toggle` and `cruise.set 999` with the same reasons);
      two step lines change: "an action the mod doesn't know" (was "the
      backend"), and "command file 7" (was 5: the two refusals now write
      files too).
- [x] `web/test.html` all green; replay at 1180×820 Day and Night.

Live check (in game, Vincent; mod 0.9.0):
- [x] Every button on the Vehicle page (cards and the All row), the
      Harvester and the Loader once: each does what it did on 0.8.17.
- [x] `python scripts/livewatch.py`: the log lines read `command <dashboard
      name> via <key>`.
- [x] With mod 0.8.17 installed instead: a button answers "update the
      mod".

## Decisions

- The gate is `hello.commands.actions = 2`, not a compare of
  `modVersion` (the fixture's is "fixture", a dev build's may be anything).
  (Vincent, 2026-10-31.)
- The mod ships as 0.9.0: the command file changes meaning (Vincent,
  2026-10-31).

## Out of scope / open questions

- S3: set commands instead of toggles.

## Log

- 2026-10-31: drafted; the gate and the version decided. Approved.
- 2026-10-31: built (mod 0.9.0). `protocol.py` 502 → 76 lines,
  `commands.py` 262 → 188; `companion/` 1,876 → 1,376. 110 tests and
  `web/test.html` green; the golden file's viewer messages unchanged. A
  test checks every action name the web sends is a key of the mod's
  `Commands.ACTIONS`. Replay at 1180×820 Day and Night fills; a socket
  probe got "no game (replay)" for `lights.toggle` and for an unknown
  well-formed action, and "action not allowed" / "value not allowed" for
  bad shapes. Only console error: `vehicleTools.js`, in NEXT.md since
  0006.
- 2026-10-31: live-checked by Vincent on mod 0.9.0: every button on the
  Vehicle page, the Harvester and the Loader did what it did on 0.8.17,
  and with 0.8.17 a button answered "update the mod". The game's log.txt
  shows each action once by its dashboard name (`command engine.toggle via
  TOGGLE_MOTOR_STATE`, `implement.select via setter`, `implement.tipAll
  via TOGGLE_TIPSTATE_GROUND`, ... 22 actions). Also in log.txt, at
  12:54:48: "Sharing violation on file .../cmd/37.xml" and "Failed to open
  xml file", right after an `implement.unload`. The mod then skips that
  number and answers without a ref, so that press is lost and its button
  times out. Not from this spec (the writer's file handling didn't
  change); in NEXT.md.
