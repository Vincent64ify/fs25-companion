# 0009: One way to run each action

Status: live-checked
Mod: 0.11.2 · Started: 2026-10-31 · Plan: [SIMPLIFY.md, S4](../docs/SIMPLIFY.md#s4-one-way-to-run-each-action-spec-0009)

## Goal

Every action the mod runs has two paths today: the game's key, and when
the key has no live event, a specialization setter (`fallback`) that
copies what the key does. The live checks show the setters never ran:
every action with a key ran its key. So the fallbacks go, and with them
about twenty guarded setter names that were never verified. An action
runs the game's key, or answers "not available now", the same answer the
game gives a player whose key does nothing. Setters stay only where the
game has no key (`direct`). The two biggest mod files split by part with
no change in what they send. The player sees nothing new.

## Evidence

The mod logs `command <action> via <what>` once per action per game
session (`Commands:logVia`). Every saved `livewatch.py` log of the live
checks for specs 0003, 0007 and 0008 (the scratchpads of those sessions,
2026-10-28 to 2026-10-31), tallied:

| Ran via | Actions |
|---|---|
| its key | `lights.set`, `highBeam.set`, `beacon.set`, `hazard.set`, `turnLeft.set`, `turnRight.set`, `engine.set`, `cruiseOn.set`, `ai.set`, `straw.set`, `tool.lower`, `tool.fold`, `tool.turnOn`, `tool.pipe`, `tool.tip`, `implement.lowerAll` (Ctrl+V, or each tool's lower), `implement.foldAll` (its key, or each tool's fold), `implement.turnOnAll`, `implement.tipAll`, `implement.tipSide`, `implement.key`, `hitch.toggle`; and under 0.8.x's names the same (`LOWER_IMPLEMENT`, `FOLD_IMPLEMENT`, `TURN_ON_IMPLEMENT`, `TOGGLE_DISCHARGE`, `TOGGLE_TIPSIDE`, the three all-tools keys) |
| "setter" | `implement.select`, `implement.detach`, `cruise.set`: all three `direct`, the game has no key for them |
| never seen | `implement.next`, `implement.previous`, `implement.cover`, `implement.coverAll`, `implement.rotate`, `implement.baleReset`, `cruise.up`, `cruise.down` |

No action with a `fallback` ever logged "via setter". The live check
below adds one round through every button so the "never seen" row is
filled in before the fallbacks are called gone for good (this is also
spec 0003's last log check, moved here at its close).

## Behaviour

What the player sees doesn't change, apart from one case: **a key with no
live event** (the game wouldn't run it either: wrong tool selected for
too long, a tool that doesn't register that key) now answers "not
available now" instead of running the setter. On a tool card that is
`KEY_WAIT_FRAMES` (30 frames) after selecting the tool, as today; the
selection is put back as today.

- **Switches** (lights, high beam, beacon, hazard, turn L / R, engine,
  cruise on, AI worker, straw): the key, or "not available now". The
  lights press their key once a frame until the stage shows, as today;
  with no live key, "not available now" (no mask setter).
- **A tool's card** (lower, fold, turn on, pipe, tip, tip side, rotate,
  bale reset, Uncover): select, press, put back, as today; a key that
  never comes answers "not available now" (for the checked ones, with
  nothing pressed: no `unmoved`).
- **The All row**: Lower all, Fold all, Turn on all press the game's key
  where it gives the asked state, else each tool's own key, as today.
  Lower all's key goes the opposite way of its own last press, whatever
  the tools did since (found in this live check), so the mod reads where
  it goes next (`attacherJointCombos.direction`) and presses it only when
  that's the asked way; otherwise each tool's Lower. Unreadable: as
  before (it lowers every tool while one is raised).
  Fold all's key goes the way the tool it's pressed on folds next, for
  every tool whose next fold goes that way, so the mod presses it on a
  tool not in the asked state yet (the selected one if it's pending);
  mixed states need no per-tool path any more. Turn on all's key flips
  every tool, so the mod presses it only when every tool needs turning;
  otherwise each pending tool's own Turn on. (Both found in this live
  check, read in the game's own scripts: `gameSource.zip`.)
  Where the all-tools key would give the state but has no live event:
  Lower all uses each tool's Lower (as before); Fold all and Turn on all
  answer "not available now" (they used to run every tool's setter).
  No last resort (the combo for Lower all). Lower all with no tool that
  lowers (a combine's header): Ctrl+V, else "not available now". Tip all
  and Uncover all as today.
- **G / Shift+G** (`implement.next`, `implement.previous`): the key, else
  "not available now".
- **Unchanged, `direct` (no key in the game):** select by id
  (`setSelectedObject`), Detach (`detachImplementByObject`), the cruise
  set speed (`setCruiseControlMaxSpeed`). Their ack keeps `via:
  "setter"`.
- **`cruise.up` and `cruise.down` go.** The web stopped sending them in
  spec 0008 (Cruise − / + send `cruise.set`); the mod refuses them as
  "action not allowed", like any unknown action.

## Data contract

No topic changes; Protocol v1 and hello's `commands.actions` 3 stay.

- **Mod → companion**: `command_ack.via` is the input action's name, or
  "setter" for the three `direct` actions only. A refused key is `ok:
  false, reason: "not available now"` (already a reason today).
- **Web**: nothing reads `via`; nothing changes.
- **Golden test**: the Solek replay's acks are recorded, so
  `golden_viewer.ndjson` doesn't change.

Game API names, by what happens to them:

| Name | Where from | State |
|---|---|---|
| `g_inputBinding.nameActions`, `.actionEvents`, event `callback`, `targetObject`, `isActive`, `displayIsVisible` | the key path | verified ([DONE.md](../docs/DONE.md#verified-game-api-facts), C0, spike 0.0.8) |
| `setSelectedObject`, `getSelectedVehicle` | select by id (kept) | verified (DONE.md, C3) |
| `detachImplementByObject`, `isDetachAllowed`, `getAttacherVehicle` | Detach (kept) | ran live (0003, 0008 logs); `detachImplementByObject` moves into DONE.md at this live check |
| `setCruiseControlMaxSpeed`, `spec_drivable.cruiseControl.maxSpeed`, `.speedReverse` | the cruise set speed (kept) | ran live (0008 log); moves into DONE.md at this live check |
| `getCruiseControlSpeed` | `cruise.up` / `down` | goes |
| `spec_attacherJoints.attacherJointCombos.direction` (-1 raising) | where Lower all's key goes next | verified (DONE.md, Lower all's timing, spike 0.0.7); a press reverses it: `AttacherJoints:startAttacherJointCombo` (gameSource.zip), live in step 2b |
| `FOLD_ALL_IMPLEMENTS`: the pressed tool's `getToggledFoldDirection` for every tool going that way | Fold all | `Foldable.actionEventFoldAll` (gameSource.zip); live recheck: step 2c |
| `TURN_ON_ALL_IMPLEMENTS`: every tool `setIsTurnedOn(not getIsTurnedOn())` | Turn on all | `TurnOnVehicle.actionEventTurnOnAll` (gameSource.zip); live recheck: step 2c |
| `setLightsTypesMask`, `setBeaconLightsVisibility`, `setTurnLightState`, `Lights.TURNLIGHT_*`, `startMotor`, `stopMotor`, `setCruiseControlState` | switch fallbacks | go (never verified) |
| `setFoldState`, `getToggledFoldDirection`, `setIsTurnedOn`, `handleLowerImplementEvent`, `startAttacherJointCombo`, `setPipeState`, `getIsPipeStateChangeAllowed`, `setIsSwathActive`, `setCoverState`, `getIsNextCoverStateAllowed`, `setPreferedTipSide`, `setRotationMax` | tool and All-row fallbacks | go from `Commands.lua` (readers in `VehicleState.lua` stay) |

## Commands

`Commands.ACTIONS` keeps every action but `cruise.up` / `cruise.down`.
The fields:

- `inputs`: the keys tried in order, the first with a live event wins.
- `direct`: a setter, only where the game has no key: `cruise.set`,
  `implement.select`, `implement.detach`.
- `fallback` goes from the actions and from `AIMED`; `allKeyStep` loses
  its setter, the job its `lastResort`, `giveUp` just refuses.

## Plan

1. **Tests first** (`mod/tests/run.lua`): turn the setter tests into
   "no live key → not available now, nothing changed" (C2's setter test,
   the lights' mask, the card's "key never comes", the All row's "no
   event", lower all's combo, implement-screen setters, the beacon ack
   in the two frame tests at 2947 and 3085 gets a live key); add
   "`cruise.up` refused"; a test that `Commands.lua` has no `fallback`
   field and only the three `direct` actions.
2. **`Commands.lua`**: drop the fallback setters and their helpers
   (lights mask, turn lights, engine, cruise state and step, fold, turn
   on, lower, select step, lower all's combo, pipe, straw, cover, tip
   side, rotate, fold all and turn on all by setter), the `fallback`
   branches in `run`, `giveUp`, `allKeyStep`, `lastResort` and the
   lights job; update the header comment. 1,614 → 1,264 lines (also
   `VehicleState.lightStageMask`, which only the lights' setter used).
3. **Split by part, nothing sent changes:** `VehicleState.lua` (943) into
   `mod/src/state/` `Lights.lua`, `Motor.lua` (engine, cruise, AI,
   reverse), `Tools.lua` (implement, extras, capabilities, keys) and
   `Rig.lua` (selection, attached tree, rig), all filling the one
   `Companion.VehicleState` table so no caller changes;
   `collectors/Vehicles.lua` (895) into the collector plus
   `collectors/vehicles/` `Motor.lua`, `Fill.lua`, `Tools.lua` and
   `Loader.lua`. `state/` shares nothing but the one table (`rootOf`
   was already on it); the vehicles parts share their pieces through a
   private table, `Companion.VehicleParts` (each part exports what the
   others call, and `reset` calls each part's own). `modDesc.xml`,
   `run.lua` (`loadVehicles`) and `fixtures/rig_fixtures.py` load the
   new files in order. `run.lua`'s cab and vehicles tests and the golden test pin
   what's sent.
4. `mod/modDesc.xml` to 0.11.0 (the companion gates on hello's
   `commands.actions`, still 3, so nothing changes there); SIMPLIFY.md's
   S4 "Built" line with the line counts.

Risks: a rig whose key the game registers late or never (cover, plow,
baler: rigs not yet confirmed) now answers "not available now" where the
setter used to act; their own specs find that out and add a workaround
with evidence if needed. The split moves locals across files: Lua load
order in `modDesc.xml` matters.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [x] `mod/tests/run.lua`: every switch with no live key answers "not
      available now" and changes nothing (no setter).
- [x] `mod/tests/run.lua`: the lights with no live key: "not available
      now", the mask untouched.
- [x] `mod/tests/run.lua`: a tool's key that never comes: "not available
      now", the selection put back, nothing changed.
- [x] `mod/tests/run.lua`: Lower all with no all-tools key: each tool's
      Lower; Fold all and Turn on all with no live key, and Lower all
      with no keys at all: "not available now", no combo, no setter.
- [x] `mod/tests/run.lua`: `cruise.up` / `cruise.down` refused "action
      not allowed"; `cruise.set`, select and detach still via "setter".
- [x] `mod/tests/run.lua`: no action or aim has a `fallback`; only
      `cruise.set`, `implement.select`, `implement.detach` have `direct`.
- [x] `mod/tests/run.lua`: every existing cab, vehicles and capabilities
      test passes unchanged after the split.
- [x] `tests/test_golden.py` passes without `GOLDEN_UPDATE`.
- [x] `mod/tests/run.lua`: Lower all after each card's Raise (the
      combo's last press lowered): each tool's Lower, not the key; the
      key when its next press is the asked way.
- [x] `mod/tests/run.lua`: Fold all in a mixed state, the folded one
      selected: pressed on the unfolded one, both folded; the other way
      round, pressed on a folded one. Turn on all with one on: the other
      one's own Turn on, not the key. (The fake keys in `spike_rigs.lua`
      follow the game's code.)
- [x] `python -m pytest mod/tests companion/tests tests` green;
      `web/test.html` all green (`replay-solek`).

Live check (in game, Vincent; mod 0.11.0, 0.11.1 for Lower all, 0.11.2 for Fold all and Turn on all; `livewatch.py` running):

Setup: the game on Solek with mod 0.11.0, the dashboard at
`http://localhost:8125` (the `live` launch config). Tap each button once
and watch the game: it should do what the key would. Say "done" after
each rig, and what the game showed when something looked wrong; Claude
reads livewatch for each step. Every button should answer ok or
"already"; "not available now" on a button that worked on 0.10.0 is a
failure.

- [x] **1. Tractor, the switches** (the one with light stages from 0008):
      Lights through each stage and off, High beam, Beacon, Hazard,
      Turn L, Turn R, Engine off and on, Cruise on and off, Cruise − / +
      held a moment. Each switch acts in game.
- [x] **2. Tractor with front and rear mowers** (spec 0003's rig): on
      each mower's card Lower, Raise, Fold, Unfold, Turn on, Turn off;
      then the All row: Lower all, Raise all, Fold all, Unfold all, Turn
      on all, Turn off all. Each tool ends as the button asked.
- [x] **3. Same rig, selecting:** tap each card's name (select). The
      game's selection follows each tap. (Next tool / Previous tool were
      here too, but no screen has those buttons now: the `implements`
      widget that held them is in no theme since the Vehicle page.)
- [x] **4. Tractor with a trailer:** the trailer's Tip and Stop, Tip side
      (if it has more than one), Tip all, then Detach on its card. (Attach
      has no button since spec 0003's close: it waits for its own spec.)
- [x] **2b. Lower all recheck (0.11.1, after a game restart):** on the
      mower rig, Lower all; Raise on each card; Lower all again: both go
      down (livewatch: each tool's `LOWER_IMPLEMENT`, not the key). Then
      Raise all and Lower all twice more: each does what it says.
- [x] **2c. Fold all and Turn on all recheck (0.11.2, after a game
      restart)**, on the mower rig, engine on, both raised:
      1. Fold the front mower with its card's Fold; select the rear one
         (tap its card's name). Tap Fold all: both end folded.
      2. Unfold the front mower with its card. Tap Unfold all: both end
         unfolded.
      3. Turn on the front mower with its card. Tap Turn on all: both end
         on (the front one stays on).
      4. Turn off all: both off.
- [x] **5. Combine with its header** (Harvester screen): Thresher on and
      off, Pipe out and in, Straw swath and chop, the header's Lower and
      Raise on its card. (The step first said Lower all / Raise all: the
      Harvester page has none, the header's lift is on its card, and the
      All row only shows what two cards share.)
- [x] **6. Loader** (the Volvo L90H or another with a bucket or forks):
      open the Loader screen, check it shows what's carried and the
      target as on 0.10.0. (The step also asked for Lower / Raise on its
      tool's card: a front loader's bucket isn't driven from the
      dashboard, by design.)
- [x] **7. Livewatch** (Claude): no `via setter` line except
      `implement.select`, `implement.detach` and `cruise.set`; no "not
      available now" from steps 1 to 6.
- [x] **8. log.txt** (Claude): no Lua error or call stack from
      FS25_Companion during the round (the files the split moved).

## Decisions

- 2026-10-31 (Vincent, at approval): `Commands.lua` at about 1,300 lines
  is accepted; SIMPLIFY.md's ~900 assumed more of it was fallbacks. The
  job runner and the checked answers stay in it.
- 2026-10-31: the never-seen rigs (cover, plow rotate, bale reset) lose
  their fallbacks too; their own specs after the S phases test them on
  the key path.
- 2026-10-31: the split stays in S4, as planned.

## Out of scope / open questions

- The rigs spec 0003 moved out (sprayer, plow, baler, cover, Attach):
  their own specs, on the key path.

## Log

- 2026-10-31: drafted from the saved `livewatch.py` logs (0003, 0007,
  0008): no `fallback` ever ran.
- 2026-10-31: approved (the three questions as proposed: see
  Decisions). Built: the setter tests became "not available now"
  first (8 failed), then the fallbacks went. `Commands.lua` 1,614 →
  1,264; `VehicleState.lua` (943) → `state/` Lights 156, Motor 153, Tools
  422, Rig 226; `collectors/Vehicles.lua` (895) → 174 plus
  `collectors/vehicles/` Fill 156, Motor 182, Tools 197, Loader 281.
  `mod/src` 5,030 → 4,789. pytest 111 passed, the golden file unchanged;
  `web/test.html` 272 green. Two more tests had leaned on a setter
  without saying so (a file read again, the value checks): they use
  `cruise.set` and a live beacon key now.
- 2026-10-31: live check steps 1 and 2 (the Volvo L90H's switches; the
  T7.300 with the KDF 341 S and KDD 941 STH): every command went through
  its key, select through its setter. Once, the first Lower all of the
  session (command 60, after the mowers were moved by their cards)
  pressed the game's key and nothing moved; the next four worked. Not
  from S4 (the key was live; the same path as 0.10.0). Guess: the game's
  combo keeps its own `direction` and flips it on each press, so after
  the cards moved the tools its first press went the other way. Repro
  asked for.
- 2026-10-31: step 3: eight selects by card, each followed in game.
  `implement.next` / `previous` have no button on any screen (the old
  `implements` widget is in no theme), so nothing sends them and they
  can't be live-checked; G pressed in game changed the selection with
  no command behind it.
- 2026-10-31: the Lower all repro (Vincent): Lower all (82, ok, both
  lowered), each card's Raise (83, 84), Lower all again (85): the key
  pressed, "Nothing moved". So the game's key doesn't follow the tools:
  it goes the opposite way of its own last press
  (`attacherJointCombos.direction`, DONE.md: -1 raising). The mod's
  "lowers every tool while one is raised" holds only until a card moves
  a tool. From before S4 (0003 revision 2); fix to come: press the key
  only when its next direction is the asked one, else each tool's Lower.
- 2026-10-31: step 4 (the Vestrum 100 with two EDK 650): Tip, Stop, Tip
  side, Tip all through their keys, Detach by its setter. Attach wasn't
  checked: no button since spec 0003's close (the step named it by
  mistake).
- 2026-10-31: Lower all fixed (mod 0.11.1): `comboNext` reads the combo's
  `direction`; the key only when its next press is the asked way, else
  each tool's Lower. Test first (it failed as the game did), then the
  fix; pytest 111 passed. The fake key in `spike_rigs.lua` follows the
  combo when the tractor has one. Recheck: step 2b.
- 2026-10-31: step 2b on 0.11.1 (after a restart): Lower all, each
  card's Raise, Lower all: both down, `via LOWER_IMPLEMENT` (each tool's
  Lower: the key's next press would have raised); Raise all and Lower
  all after it through the key. Step 2 ticked with it.
- 2026-10-31: found in 2b's setup: the first Fold all (command 2, the
  KDF folded, the KDD unfolded) unfolded the KDF and left the KDD,
  "Nothing moved". The game's Fold all key seems to go the way of the
  tool it's pressed on (pressed on the selected one, the folded KDF), not
  "fold every tool while one is unfolded" (0.8.7, when the selected one
  was unfolded). From before S4. Fix to come: press it on a tool that
  isn't in the asked state yet.
- 2026-10-31: the All row's keys read in the game's scripts
  (`gameSource.zip`): Lower all flips the combo's stored direction
  (0.11.1's fix holds); Fold all goes the way the tool it's pressed on
  folds next; Turn on all flips every tool. Tip all and Uncover all press
  each tool's own key. Fixed (mod 0.11.2): Fold all is pressed on a
  pending tool; Turn on all's key only when every tool needs it, else
  each tool's own. Tests first (each failed as the game did); the fake
  keys follow the game's code; pytest 111 passed. Recheck: step 2c.
- 2026-10-31: step 2c on 0.11.2 (after a restart): Fold all and Unfold
  all from mixed states (commands 5, 7) ok through the key; Turn on all
  with one on (11) by the other one's own Turn on; Turn off all with both
  on (12) through the key. Vincent: all as asked.
- 2026-10-31: step 5 (the CH7.70 with the SuperFlex 25FT): Thresher,
  Pipe, Straw and the header's Lower / Raise through their keys, both
  ways each.
- 2026-10-31: step 6 (the L90H): the Loader screen as on 0.10.0. Steps 7
  and 8 (Claude, the whole session): `via setter` only for `cruise.set`
  (22), `implement.select` (12), `implement.detach` (1); the only
  answers not ok were the three found above (60, 85, and the first Fold
  all on 0.11.1), none "not available now"; no Lua error in log.txt (the
  reverse cruise diagnostic came from the moved `state/Motor.lua`).
  Live-checked (Vincent), mod 0.11.2. Verified names into DONE.md.
  `Commands.lua` ends at 1,280 lines with the All row fixes.
