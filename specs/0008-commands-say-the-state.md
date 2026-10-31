# 0008: Commands say the state they want

Status: live-checked
Mod: 0.10.0 · Started: 2026-10-31 · Plan: [SIMPLIFY.md, S3](../docs/SIMPLIFY.md#s3-commands-say-the-state-they-want-spec-0008)

## Goal

A tap says what the player wants ("lights on", "this mower lowered"),
not "press the key once". The mod reads the state the cab already
reports and presses the game's key only when it differs, so a doubled,
late or repeated command can never flip something back. That makes the
command path's guards against doubled toggles unnecessary: the
companion's one-at-a-time slot, its superseding and its timeout go, and
the web stops guessing at a toggle's next state. The player sees the same
buttons; a second tap on something already there answers at once and
does nothing.

## Behaviour

What the player sees doesn't change, apart from these:

- **A tap on a switch sends the state it shows next.** Lights: the next
  light stage after the one the button's dots show (after the last, off).
  High beam, Beacon, Hazard, Turn L / R, Engine, Cruise, AI worker,
  Straw swath: the opposite of what the button shows (Engine while it
  starts shows off, so a tap asks for on: "already"). A tool's Lower /
  Raise, Fold / Unfold, Turn on / off, Pipe out / in and Tip / Stop: what
  its label says (mid-fold, the label's guess from `unfolded`).
- **Already there:** when the game is already in the asked state (two
  quick taps, or the key pressed in game meanwhile), the mod presses
  nothing and answers ok with `already: true`. The button stops pending
  at once instead of waiting 1.5 s for a change that won't come.
- **Moving counts as there:** a fold, a pipe, a tool that lowers through
  its fold, or an engine that is starting, already on its way to the
  asked state, answers "already". A tap the other way reverses it, as the
  key does.
- **Lights step through their stages** with one press a frame, read after
  each, until the asked stage shows (at most stages + 1 presses); else
  "lights didn't reach stage N".
- **The All row** (Lower all, Fold all, Turn on all) sends the state its
  label names, like Tip all and Uncover all already do (1: lower, fold,
  on; 0: raise, unfold, off). The game's key is pressed when the key's
  own rule gives that state for every tool; otherwise each tool not there
  yet gets its own action toward it, as the no-key path does today. All
  already there: "already". Two exceptions: Lower all with no tool that
  lowers (a combine's header) presses Ctrl+V as before, a toggle; Turn on
  all with no tool that turns on answers "nothing turns on" (it pressed
  the key). Tip all and Uncover all answer as before, never "already".
- **Cruise − / +** work as today; three values sent while the first is
  still in the game are all written (the web already sends one at a time,
  latest wins), none answered "superseded".
- **No automatic resend.** A command without an answer still shows "no
  answer" after 10 s, and a tap again is now safe. (SIMPLIFY.md planned
  a resend; see Decisions.)
- **A mod older than 0.10.0:** every command is answered at once with
  "update the mod", as spec 0007 does for 0.8.x.

One-shot actions stay as they are: select (next, previous, by id), tip
side, rotate plow, bale counter reset, the tool's other keys, Attach,
Detach, Cover (its rig's reading isn't confirmed: spec 0003 moved cover
out) and Uncover all (already a set).

The column's Unload control (on no screen today) asks `tool.tip` of the
tool `cab.keys.unload` names: it tips a trailer; a combine has no Tip
(`tip` is a trailer's capability), so it answers "can't tip" there.

## Data contract

Topics don't change (Protocol v1); `command_ack` gains a field and the
viewer's command gains one.

- **Viewer → companion, `command`:** gains `tool` (integer ≥ 0, a rig id
  from `cab.rig`), absent for actions on the vehicle. `value` as today.
- **Command file** (`cmd/<n>.xml`): gains `tool="9"`.
- **Mod → companion, `hello.commands.actions`:** 3 (the set actions
  below). Below 3, every command is answered "update the mod".
- **`command_ack`:** gains `already: true` when nothing needed doing
  (`ok` is true, `via` absent). Absent otherwise.
- **Companion, command check:** `tool` an integer ≥ 0 (not a bool) or
  absent, else "value not allowed" at once.
- **Web** (`types.js`): `command_ack.already`; the command's `tool`.

Readings the mod compares, and whether each is confirmed in game:

| Reading (cab field) | Name | Where from | State |
|---|---|---|---|
| engine on, starting (`engineOn`, `engineState`) | `getIsMotorStarted()` | Motorized | verified ([DONE.md, Engine on](../docs/DONE.md#verified-since-phase-0)) |
| lowered (`lowered`) | `getIsLowered(true)` | AttacherJoints | verified (C2; lag while rising, spike 0.0.6, [DONE.md](../docs/DONE.md#verified-since-phase-0)) |
| turned on (`turnedOn`) | `getIsTurnedOn()` | TurnOnVehicle | verified (C2, spec 0003) |
| unfolded, fold moving (`unfolded`, `foldMoving`) | `getIsUnfolded()`, `spec_foldable.foldMoveDirection` | Foldable | verified (C2; direction in spikes 0.0.5 and 0.0.6) |
| tipping (`discharging`) | `getDischargeState()` | Dischargeable | verified ([DONE.md](../docs/DONE.md#verified-since-phase-0), spike 0.0.8) |
| straw swath (`straw.swath`) | `spec_combine.isSwathActive` | Combine | verified ([DONE.md, Harvester screen](../docs/DONE.md#verified-since-phase-0)) |
| light stage (`lights.stage`, `stages`) | `spec_lights.lightsTypesMask`, the light states | Lights | seen live (C1: the dots step like the key), not in DONE.md |
| high beam, beacon, hazard, turn L / R (`lights.*`) | `lightsTypesMask` bit 8, `beaconLightsActive`, `turnLightState` | Lights | seen live (C2: the buttons lit with the game), not in DONE.md |
| cruise on (`cruise.state`) | `getCruiseControlState()` | Drivable | seen live (C2), not in DONE.md; the T6 check is still open |
| AI worker (`aiActive`) | `getIsAIActive()` | AIJobVehicle | the name in [DONE.md, Phase 0](../docs/DONE.md#phase-0-spike-on-solek-windows-2026-10-20); its value seen live in C2 |
| pipe out, moving (`pipe.out`) | `spec_pipe.targetState`, `currentState` | Pipe | seen live (spec 0001's pipe button), not in DONE.md |
| the light key's cycle after the last stage | `TOGGLE_LIGHTS` | Lights | unverified: the job reads after each press, so it works either way |

The "seen live, not in DONE.md" rows count as verified (Vincent,
2026-10-31); this spec's live check moves them into DONE.md.

## Commands

`mod/src/Commands.lua`. Each set action reads its state, answers
"already" when it's there, else runs as its toggle does today (the key,
else the setter; S4 trims setters). The toggles they replace go.

| Action | Value | Tool | Replaces |
|---|---|---|---|
| `lights.set` | stage, 0 to `stages` (0 or 1 without stages) | no | `lights.toggle` |
| `highBeam.set`, `beacon.set`, `hazard.set`, `turnLeft.set`, `turnRight.set` | 0 or 1 | no | the `.toggle`s |
| `engine.set` | 0 or 1 | no | `engine.toggle` |
| `cruiseOn.set` | 0 or 1 | no | `cruise.toggle` |
| `ai.set` | 0 or 1 | no | `ai.toggle` |
| `straw.set` | 1 swath, 0 chopper | no | `implement.straw` |
| `tool.lower`, `tool.fold`, `tool.turnOn`, `tool.pipe`, `tool.tip` | 0 or 1 (lowered, folded, on, out, tipping) | yes | `implement.lower`, `.fold`, `.turnOn`, `.pipe`, `.unload` |
| `implement.lowerAll`, `.foldAll`, `.turnOnAll` | 0 or 1 | no | the same names without a value |
| `cruise.set` | km/h, 1 to 250 | no | unchanged |

`tool.*` needs `tool`: the rig id. The controls column's Lower, Fold,
Work, Pipe and Unload send the id `cab.keys` names for that key (today
they send none and the mod looks it up); the Thresher sends the combine's
own id. Every one is checked as `implement.*` is today (spec 0003
revision 2): ok once the tool started moving that way.

Unchanged: `cruise.down`, `cruise.up` (unused by the web; they go in S4
if nothing sends them), `hitch.toggle`, `implement.select`, `.next`,
`.previous`, `.detach`, `.tipSide`, `.rotate`, `.baleReset`, `.key`,
`.cover`, `.tipAll`, `.coverAll`.

## Plan

- **Mod:** `Commands.lua`: a `state` reader per set action (from
  `VehicleState`, the same functions `Cab.lua` uses) and the "already"
  answer in `run` and `aimed`; `aimed` takes the asked state instead of
  `wantOf`; the lights job; the All row's jobs take the value. `tool` read
  from the command file. `Commands:info()` says `actions = 3`.
  `modDesc.xml` 0.10.0. `mod/tests/run.lua`.
- **Companion:** `commands.py`: `COALESCE`, `_in_game`, `_waiting`,
  `_free`, `IN_GAME_TIMEOUT_S` and "superseded" go; it writes `tool`;
  the gate is `actions == 3`. `protocol.py` / `server.py`: the `tool`
  shape check and pass-through.
- **Web:** `commands.js` (`send(action, value, tool)`, `already`);
  `widgets/controls.js` (the CONTROLS' actions and the value each sends;
  `cab.keys` for the tool); `widgets/vehicleTools.js` (each card button's
  value and tool); `ui/control.js` (an "already" answer ends pending);
  `types.js`.
- **Tests:** `tests/test_golden.py`: the step "cruise.set 20, 21, 22
  while the first is in the game" now writes three files and answers
  three oks (built: "sent together: each written, each answered"); the fake mod speaks `actions: 3` and answers a set with
  "already" when its pretend state matches. `GOLDEN_UPDATE=1` on purpose.
- **Docs:** SIMPLIFY.md's S3 (built), `companion/README.md`, DONE.md's
  command path, the spec template's Commands line.
- **Risks:** a reading that's wrong in some rig makes a button do nothing
  ("already") where the toggle worked. The live check presses each
  action twice; a rig where a reading is wrong goes back to its toggle,
  noted here and in NEXT.md.

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: each set action presses its key once when the
      state differs and answers "already" without pressing when it's
      there; moving toward it counts as there (fold, pipe, a tool that
      lowers through its fold, an engine starting); `lights.set` presses
      once a frame until the stage reads right, and gives up after
      stages + 1; a stage above `stages` is "value not allowed"; `tool.*`
      without `tool`, or with one not on the rig, is refused; the All
      row's key is pressed only when its rule gives the asked state, else
      each tool's own action; hello has `actions = 3`.
- [x] `companion/tests/test_commands.py`: every command is written as it
      comes, `tool` included, none "superseded"; a hello with
      `actions: 2` answers "update the mod"; the superseding and
      slot-freeing tests go.
- [x] `companion/tests/test_server.py`: `tool` passes through; a bool, a
      negative or a non-integer `tool` is refused at once.
- [x] `tests/test_golden.py`: as in Plan; a doubled `lights.set` answers
      "already" the second time.
- [x] `web/test.html`: each control and card button sends the state it
      shows next, with its tool; a second tap while one is out sends
      nothing (as before); an "already" answer ends pending at once; every action the web sends
      is a key of the mod's `Commands.ACTIONS` (spec 0007's test).
- [x] Replay in the browser pane (`replay-solek`) at 1180×820, Day and
      Night: the screens look as before.

Live check (in game, Vincent; mod 0.10.0, `livewatch.py` running):
- [x] A tractor with lights stages: Lights to each stage and off; then
      High beam, Beacon, Hazard, Turn L, Turn R, Engine and Cruise each
      sent twice: one press in game, the second answers "already"
      (livewatch shows it).
- [x] A mower and a trailer (spec 0003's rigs): each card's Lower, Fold,
      Turn on and Tip sent twice: the tool moves once.
- [x] Mid-fold, the opposite button: the fold reverses.
- [x] The All row's Lower all / Raise all and Fold all with the tools in
      mixed states: every tool ends in the asked state.
- [x] A combine: Thresher, Pipe out / in, Straw swath twice each.
- [x] Cruise − / + held: the set speed follows, nothing "superseded".

Not checked, on purpose (Vincent, 2026-10-31): the AI worker (its key
does nothing without a job; see Out of scope) and an older mod answering
"update the mod" (the mod and the companion are always updated
together, so version checks aren't live-checked).

## Decisions

Decided by Vincent (2026-10-31):
- The readings seen live in C1, C2 and spec 0001 but not in DONE.md
  (lights, beacon, turn lights, cruise on, AI, pipe) count as verified;
  this spec's live check moves their names into DONE.md.
- The All row (Lower all, Fold all, Turn on all) takes the asked state
  in S3.
- The mod ships as 0.10.0; the gate is `hello.commands.actions = 3`.
- No automatic resend (SIMPLIFY.md planned one): a set sent again 10 s
  later could undo what the player did in game meanwhile, and a tap
  again is now safe.

Approved with the spec (2026-10-31):
- New names (`*.set`, `tool.*`) rather than a value on the old ones: a
  file the old mod reads can never mean something else, and the gate
  (`actions: 3`) says which the mod speaks.
- Cruise on / off is `cruiseOn.set`: `cruise.set` stays the set speed.
- High beam, the turn lights, straw and tip become sets too (SIMPLIFY.md
  named lights, beacon, hazard, engine, AI and four tool actions): their
  readings are as good as the others'.

## Out of scope / open questions

Out of scope: dropping setters (S4), cover and the rigs spec 0003 moved
out.

- **AI worker:** `ai.set` is built as specified, but live `TOGGLE_AI`
  did nothing on the L90H or the T7.300: a worker needs a job chosen,
  which the dashboard can't do. Vincent (2026-10-31): the button should
  rather open the game's worker screen, and stop a running worker. In
  NEXT.md; not live-checked here.

## Log

- 2026-10-31: drafted; readings, the All row, the version and the
  resend decided. Approved.
- 2026-10-31: built (mod 0.10.0). `companion/commands.py` 198 → 153
  lines, `companion/` 1,343; `Commands.lua` 1,421 → 1,614 (state readers,
  the lights job, the All row's two paths; S4 trims it). 56 Lua tests, 111
  pytest and `web/test.html` (273) green. The golden file changed on
  purpose: the new names, `tool="7"` in file 4, the three cruise files
  each answered (no "superseded"), and a second `lights.set 1` answered
  `already`. Found while building: the cards' button row dropped the
  tool on its way to the socket (`vehicleTools.js` buttonRow), fixed and
  covered by test.html. Replay at 1180×820 Day and Night looks as
  before; with the mowers rig fed in, Raise on the XT 390 sent `tool.lower
  0` with tool 996, Turn on on the KDF `tool.turnOn 1` with 994, Beacon
  `beacon.set 1`, Raise all `implement.lowerAll 0`. Only console error:
  `vehicleTools.js` toolsAlso, in NEXT.md since 0006.
- 2026-10-31: live check, round 1 (mod 0.10.0, Solek, Volvo L90H, 3 light
  stages). Lights from the dashboard: stage 1, 2, 3, then off, one
  `TOGGLE_LIGHTS` each, so the key goes back to off after the last stage.
  Each switch sent twice back to back over a second socket, on then off:
  High beam, Beacon, Hazard, Turn L, Turn R and Cruise ran their key once
  and answered `already` to the double; Engine pressed once, and an "on"
  sent while it was starting answered `already`. Vincent: each light,
  the engine and cruise changed once each way, no flicker. AI worker:
  `TOGGLE_AI` ran twice and the game showed nothing (the L90H has no
  worker, so `aiActive` never turned on); to check on a tractor.
- 2026-10-31: live check, round 2 (T7.300, KDF 341 S front 522, KDD 941
  STH rear 534). Each mower: Unfold, Lower, Turn on, Turn off, Raise,
  Fold, each sent twice back to back: the key once (`IMPLEMENT_EXTRA2`,
  `LOWER_IMPLEMENT`, `IMPLEMENT_EXTRA`), the double `already` (a fold
  still moving counted as there). Fold reversed: Unfold on the front,
  then Fold 0.8 s later pressed again and it went back folded. The All
  row with mixed states: Raise all (front lowered, rear raised) ran the
  front's own Lower; Unfold all (front unfolded, rear folded) the rear's
  own fold; Lower all, Turn on all, Turn off all, Raise all and Fold all
  the game's keys; every double `already`. Vincent: each mower moved once
  per step. One hiccup: the first Lower all (13:46:35, both raised and
  unfolded, game in focus) answered "Nothing moved" for both, the front
  lowered about 3 s after the press (DONE.md: at once), and its double,
  finding the rear still raised, pressed the key again; both ended
  lowered. The same Lower all again at 13:47:52 was clean (ok, then
  `already`). The stream had rotated, so the frames are gone; in NEXT.md
  to watch. AI worker on the T7.300: `TOGGLE_AI` ran twice, the game
  showed nothing and `aiActive` stayed false, so the key does nothing
  without a job set up; `ai.set` needs a worker hired in game to check.
- 2026-10-31: live check, round 3 (New Holland CH7.70 511 with the
  SuperFlex 25FT 506). Engine on, Thresher on and off (`IMPLEMENT_EXTRA`
  on the combine), Pipe out and in (`TOGGLE_PIPE`), Straw chopper then
  swath (`TOGGLE_CHOPPER`), header Lower and Raise (`LOWER_IMPLEMENT`),
  each sent twice: the key once, the double `already`. Vincent: each
  happened once. Cruise − / + held on the dashboard, twice: 37 and 38
  `cruise.set` in about 4 s, every one ok, none "superseded"; the set
  speed 9 → 28 → 9 km/h and the game's HUD followed (Vincent).
- 2026-10-31: live check, round 4 (Case IH Vestrum 100, two Farmtech EDK
  650 loaded, 525 and 526, tipping to the ground). With the engine off,
  Tip pressed `TOGGLE_TIPSTATE_GROUND` and the game said to start the
  engine first: nothing tipped, each Tip answered "Nothing moved" and its
  double pressed again (the trailer never got there). Tip has no "needs
  the engine" check as fold and lower do: in NEXT.md. Engine on, then each
  trailer's Tip and Stop sent twice: the key once, the double `already`;
  Tip all and Stop all twice: the keys once, the double ok with nothing
  to do (tip all has no `already`, as specified). Vincent: each tip and
  stop happened once.
- 2026-10-31: live-checked. Vincent left out the AI worker (it should
  open the game's worker screen instead: NEXT.md) and the "update the
  mod" check (the mod and the companion always move together). The
  states the commands compare are in DONE.md.
