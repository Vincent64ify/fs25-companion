# 0017: Game speed

Status: live-checked
Mod: 0.18.0 · Started: 2026-11-11 · Design: the canvas [FS25 Companion: Game speed](https://claude.ai/artifact/9UuXJgqaeVwvzxsLJfYP64) (private, on claude.ai; approved by Vincent on 2026-11-13), [THEMES.md](../docs/THEMES.md#layout) (the status bar's centre pill)

## Goal

See the game's speed (its time scale, ×0.5 to ×360) next to the clock and
change it from the dashboard, without reaching for 7 and 8. Speeding up
the night or a long sowing run is something you do often, and the pill
already says the time it changes.

## Behaviour

- **The pill:** "Spring · Day 6 · 09:44 · ×5". The speed is always shown,
  ×1 too. Without a reading (an older mod, a value the
  game doesn't give) the pill is as today and isn't a button.
- **A tap on the pill** opens the speed panel under it, in the main area
  like the Settings panel (12 below the status bar, never over it). A
  second tap on the pill, or a tap outside, closes it. The pill shows the
  "where you are" ring while the panel is open.
- **The panel:** a "Game speed" label, then **every step the game
  offers** (from the mod, not written in the dashboard) and nothing
  else: no Slower or Faster, since any speed is one tap away.
  - The steps sit in one well, like Settings' Day / Night switch
    (`line` behind, 4 padding, 4 apart, 16 radius): flat segments 52
    tall, six to a row; the "×" in 13 px muted, the number in 17 px.
  - The current one is raised and ringed ("where you are"): by day
    `card-solid` with the 2 px `select` ring and a small lift, at night
    `sel-tint` with the ring.
  - The panel is 384 wide, 16 padding, 12 below the status bar under
    the pill, over a backdrop (as Settings).
- **A tap on a step** asks for that speed: pending on touch-down (its
  ring breathes in `on-border`, the current one keeps its ring), until
  the mod answers ok (it checked the speed); then the pill and the ring
  show the new speed at once, without waiting for the next `env`, and
  the panel closes.
  - Another tap while one is pending does nothing.
  - **A tap that doesn't get there** says "Failed" on the step tapped
    (spec 0013 revision 6: `alarm` ring and text), no toast, and the
    panel stays open (a tap outside or on the pill closes it).
- **Multiplayer:** a player the game doesn't let change the speed gets
  "Failed" on the step, like any press that does nothing; the pill is
  a button for everyone.
- **On foot and in a vehicle alike:** the speed is the game's, not a
  vehicle's.
- **Paused** (the game's menu open): the pill keeps the speed set; a tap
  on a step does nothing in the game and says "Failed" on that step,
  like any press that does nothing.
- **Day and Night:** the pill's speed takes the pill's ink, after a
  hairline; while the panel is open the pill shows `sel-tint` with the
  `select` ring. The panel uses the Settings panel's surface. Nothing
  yellow at night (spec 0013). At 1180×820 the pill grows by the speed's
  width; compact (narrower than 900 px) the same pill and panel, the
  panel full width under the status bar, the steps in one row. The
  pill sits centred between the status bar's left side (Settings, the
  map's name) and its right side (temperature to full screen), at
  every width: each side is as wide as its content, and with too little
  room the map's name gives way first (Vincent, 2026-11-14). The panel
  opens under the pill wherever it is.
- **Escape** closes the panel too, as it does Settings.

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change.

- **Mod → companion** (`env`, every second):
  - `timeScale` (number, ×): the speed the player set. Absent when it
    can't be read.
  - `timeScaleSteps` (array of numbers, slowest first): every step the
    game's 7 and 8 go through. Absent when the game doesn't give them;
    then the dashboard shows the speed but no panel.
- **Web** (`web/src/types.js`): `env.timeScale`, `env.timeScaleSteps`.
- **Web** (`web/src/widgets/farm.js`): `dayClock` adds the speed and
  opens the panel; a new `speedPanel` (its own file in `web/src/ui/` or
  `widgets/`, the Settings panel's layer pattern).

| Name | Where from | State |
|---|---|---|
| `g_currentMission.missionInfo.timeScale`: the speed set | FS22's script docs | verified 2026-11-14 ([GAME-API.md](../docs/GAME-API.md#verified-since-phase-0)) |
| `g_currentMission:getEffectiveTimeScale()`: used by the game's own Lua (BaleManager, LoadTrigger, VehicleSystem); may differ from the speed set (e.g. while paused) | gameSource.zip (read 2026-11-11) | unverified live; read only if `missionInfo.timeScale` is missing |
| `Utils.getNumTimeScales()`, `Utils.getTimeScaleFromIndex(i)`: the steps (plain functions, no self; the mod reads the index from 1, else from 0, and sorts the list) | gameSource.zip's Utils.lua (declared, body not in the zip) | verified 2026-11-14 |
| `INCREASE_TIMESCALE` (8), `DECREASE_TIMESCALE` (7) input actions | FS25's `profileTemplate/inputBindingDefault_KeyboardMouse.xml` (read 2026-11-14); who registers their events is not in the Lua zip | verified 2026-11-14 |
| whether those keys have live events on foot and in a vehicle | the game's action events | verified 2026-11-14: both; none while paused |

## Commands

- **`timeScale.set`**, value: the asked speed, one of `timeScaleSteps`
  (refused "value not allowed" otherwise). A set (specs/0008): the
  reading is `timeScale`; already there → `already`, nothing pressed.
  Else a job presses `INCREASE_TIMESCALE` or `DECREASE_TIMESCALE` once a
  frame, reading the speed after each, until it shows the asked one
  (at most as many presses as there are steps, else failed "didn't
  reach the speed"), then `checked` ok. A press after which the speed
  doesn't move within 10 frames (`Commands.TIME_SCALE_WAIT_FRAMES`, room
  for a multiplayer client's round trip) ends it: failed, "didn't move".
  No key with a live event: failed at once, nothing pressed. No speed to
  read: failed "no speed to read".
- **Not tied to a vehicle:** today `run` answers "not in a vehicle"
  before anything; `timeScale.set` runs before that check.
- **The dashboard, the same frame:** the tapped step goes pending;
  an ok answer shows the asked speed on the pill and the ring at once
  (`env` comes once a second, so it may still say the old speed for up
  to a second: the asked one holds until `env` agrees, or 2 s).

## Plan

1. Read FS25's `inputBinding.xml` / `inputActions` (the game's `dataS`,
   or the SDK) for the time scale action names before the build; the
   Lua zip doesn't have them. Done: `profileTemplate/inputBindingDefault_
   KeyboardMouse.xml` binds `INCREASE_TIMESCALE` to 8 and
   `DECREASE_TIMESCALE` to 7.
2. `mod/src/collectors/Env.lua`: `timeScale`, `timeScaleSteps`, each
   read in `mod/src/Api.lua` (`Api.timeScale`, `Api.timeScaleSteps`)
   and left out on failure.
3. `mod/src/Commands.lua`: `timeScale.set` (a job pressing one key a
   frame, checked by the reading); the on-foot path in `run`. Mod 0.18.0.
4. `web/src/types.js`, `web/src/widgets/farm.js` (the pill), the speed
   panel (`web/src/ui/speedPanel.js`), `theme.css`; `docs/THEMES.md`'s status bar line names the speed.
5. Risks: the keys may be bound to a context that isn't active when the
   mod presses them (in a vehicle vs on foot); in multiplayer a client
   that isn't the host may have no live event (it fails on the button).

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: `env` carries `timeScale` and
  `timeScaleSteps` from the game's calls; each is left out when its call
  is missing or fails.
- [x] `mod/tests/run.lua`: `timeScale.set` from ×5 to ×60 presses
  Increase until the reading is ×60, one a frame, then ok `checked`;
  down presses Decrease; the speed already there → `already`, nothing
  pressed; a value not in the steps → "value not allowed"; a press that
  doesn't move the speed → failed; no live key → failed, nothing pressed;
  runs on foot (no controlled vehicle).
- [x] `tests/test_golden.py` unchanged (the Solek replay has no speed).
- [x] `web/test.html`: the pill shows "×5" with `timeScale` 5, and "×1";
  without `timeScale` it's as today and not a button; without
  `timeScaleSteps` it shows the speed but doesn't open.
- [x] `web/test.html`: a tap opens the panel with one button per step
  and nothing else (no Slower or Faster), the current ringed; a tap
  outside or on the pill closes it.
- [x] `web/test.html`: a step sends `timeScale.set` with its value;
  pending until the ok answer, then the pill shows it and the panel
  closes; a second tap while pending sends nothing; a stale `env` with
  the old speed doesn't put it back.
- [x] `web/test.html`: a failed answer, or none in time, says "Failed"
  on that step and the panel stays open.
- [x] Replay in the browser pane (`replay-solek`, a patched `env` with
  a speed and steps), 1180×820 and compact, day and night: the pill and
  the open panel.

Live check (in game; Solek, mod 0.18.0):
- [x] **The reading:** ×1, then 8 three times in the game: the pill
  follows each step; the panel's steps match the game's list.
- [x] **A step, in a vehicle:** from ×1 tap ×120: the game shows ×120,
  the ring moves; tap ×1: back.
- [x] **On foot:** tap the step next to the current one, then one
  further away: the game follows each.
- [x] **The ends:** tap the slowest step, then ×360: the game shows
  each.
- [x] **Paused** (the game's menu open): what the pill shows, and what a
  press does.

## Decisions

- The steps come from the mod (the game's own list), so the dashboard
  holds no copy of them.
- The steps go in `env` every second (a short list) rather than in
  `hello`, so the pill reads one topic.
- The mod presses 7 and 8, not a setter (game keys over workarounds):
  the game's own rules (multiplayer, limits) apply.

- **Steps only** (Vincent, 2026-11-13, from the canvas): Slower and
  Faster felt slow (each waited for the mod's answer, then 0.5 s before
  the panel closed), and the grid already reaches any speed in one tap.
  So the panel holds the steps alone; a step closes it on the ok answer,
  and a failure keeps it open so "Failed" can be seen. This replaces
  2026-11-11's "Slower and Faster leave it 0.5 s".
- **The steps in a well** (Vincent, 2026-11-13): one well like Settings'
  Day / Night switch, not twelve raised buttons.
- **The speed always on the pill**, ×1 too (Vincent, 2026-11-11).
- **Multiplayer:** "Failed" on the button, nothing more (Vincent,
  2026-11-11).

## Out of scope / open questions

1. Production buildings timed on the game clock (PLAN.md) can use
   `timeScale` later; not this spec.

## Log

- 2026-11-11: drafted (Vincent: control the game speed from the pill
  with the season, day and time).
- 2026-11-11: Vincent's answers: a step closes the panel, Slower and
  Faster leave it 0.5 s; the speed always shown; multiplayer just fails.
- 2026-11-11: approved by Vincent as drafted.
- 2026-11-13: designed on a canvas before the build. Vincent dropped
  Slower and Faster for the steps alone, in one well; the spec says so
  now, approved by Vincent the same day.
- 2026-11-14: built (mod 0.18.0). The time scale actions' names read
  from FS25's keyboard binding file first. Tests first: 2 Lua tests and
  11 test.html checks failed, then passed; pytest 122, golden unchanged,
  test.html all green. Checked in the replay with a patched `env` at
  1180×820 and 820 wide, day and night: the pill, the open panel, a
  "Failed" step (the replay refuses commands). Found there: at 820 the
  wider pill ran into the temperature; Vincent then asked for the pill
  centred between the bar's two sides, so each side is now as wide as
  its content and the pill sits in the middle of the room between
  (Behaviour; checked at 1180, 820 and 700 wide). On the way: the "didn't move" wait
  of 10 frames, "didn't reach the speed", and Escape closes the panel.
- 2026-11-14: live-checked by Vincent (Solek, mod 0.18.0), all five
  boxes: the pill follows 8 pressed in the game and the panel's steps
  match the game's list; ×120 and back to ×1 in a vehicle; near and far
  steps on foot; the slowest step and ×360. Paused with the game's menu
  open, the pill kept the speed set and every step tapped said "Failed"
  (Behaviour). Names moved into GAME-API.md.
