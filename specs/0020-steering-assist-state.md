# 0020: Steering Assist: state and the Drive button

Status: built
Mod: 0.21.0 · Started: 2026-11-17 · Design: [THEMES.md](../docs/THEMES.md#layout) (the Drive group); the canvas [FS25 Companion: Steering](https://claude.ai/artifact/HrDpmDUhL6iE4sEaRqcvaQ) (private, on claude.ai; at 1158 × 676 and 1180 × 820, day and night; the button's states and three ideas for the icon; Vincent picked C, 2026-11-19); the brainstorm's brief, `concepts_brief.md`, is in git history (commit b0cffeb)

## Goal

Vincent wants the game's Steering Assist (the GPS) set up and run from the
dashboard alone, without reaching for H. This first step shows which mode
the tractor is in (AI worker or Steering Assist), whether it can steer there
now, and whether it is steering, and it turns steering on
and off from the Drive group: in Steering Assist mode the AI worker button
becomes the Steering button, and a tap does what a short press of H does
there ("Activate lane" or "Deactivate lane"), through the game's own
steering key. In AI worker mode the button stays as it is today.

The first of three GPS specs: this one, then the GPS screen
([0021](0021-gps-screen.md)), then the course settings
([0022](0022-steering-assist-settings.md)).

## Behaviour

- **One Drive button whose job follows the mode.** It never comes and goes:
  only its label, icon and action change with the mode.
  - **AI worker mode:** "AI worker", as today (spec 0008's `ai.set`): lit
    while a worker drives.
  - **Steering Assist mode:** "Steering", lit while the game steers. A tap
    asks for the opposite: unlit, the game's "Activate lane"; lit,
    "Deactivate lane".
    - **Can't steer now** (off the field, the course still building, or no
      lane under you): the button fades and a tap does nothing, as Attach
      does. It still reads "Steering". A lit button never fades.
  - **Without Steering Assist** (any vehicle the game gives neither part):
    the button as today. A truck may carry both parts (spike 0.0.15: the
    Arocs 4133 hooklift does, in AI worker mode); in AI worker mode it
    looks as today either way.
- **The game turning steering off** (you move the wheel or the joystick,
  you reverse, you leave the cab, the course is dropped, the settings
  change, you leave Steering Assist mode): the button follows, with no
  "Failed". Only a press the mod answers failed says it.
- **The mode is the game's:** read here, never set. Until spec 0022 it is
  set in the game's dialog (hold H), and the game saves it per vehicle. The
  game also switches it back to AI worker by itself when a hitch leaves no
  tool that allows steering; the button follows.
- **Day and Night, sizes:** the button keeps the Drive group's look and
  place at 1158×676 and 1180×820. Steering gets a new icon in the icon
  set's style ([THEMES.md, Icons](../docs/THEMES.md#icons)).

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change. How a command travels
and is answered: [ARCHITECTURE.md, Commands](../docs/ARCHITECTURE.md#commands).

A **course** is what the game builds for a field the farm may work, once
you're on it in Steering Assist mode: headland rounds and straight lanes,
cut into segments. A **lane** here is the segment under you, the one
"Activate lane" steers along.

- **Mod → companion** (`cab`, on change): `steering`, absent when the
  controlled vehicle has no Steering Assist (no `spec_aiAutomaticSteering`
  or no `spec_aiModeSelection`) or a read fails:
  - `mode` (`"worker"` or `"steeringAssist"`): the vehicle's AI mode.
    Sent for every vehicle with both parts, trucks included (spike
    0.0.15), so the web never tells a truck from a tractor: the mode does.
  - `state` (`"off"`, `"ready"` or `"steering"`): no course; a course, not
    steering; steering.
  - `canSteer` (boolean): whether the game would take the steering key now,
    read from the key's own event (active only with a course and a lane
    under you), as `VehicleState.liveKey` reads Tip's key. A read, no call.
- **Mod → companion** (`hello.commands.actions`): 5, for `steering.set`.
- **Web** (`web/src/types.js`): `Cab.steering`.
- **Web** (`web/src/widgets/controls.js`): the Drive button keys on
  `cab.steering`; without it, the button is as today. With it, `mode` sets
  the button's job, label and icon. In Steering Assist mode `state` sets
  lit, and `canSteer` false fades it unless `state` is `"steering"`. In AI
  worker mode lit is `aiActive`, as today.

Game API names, read in the SDK's `gameSource.zip` and Vincent's Solek save
on 2026-11-17. Unverified unless the State column says otherwise. Every read
is guarded (`mod/src/Api.lua`, `VehicleState.liveKey`); the press goes
through `runInputAction`:

| Name | Cab field | Where from | State |
|---|---|---|---|
| `spec_aiModeSelection.currentMode`, against `AIModeSelection.MODE.WORKER` / `.STEERING_ASSIST` | `mode` | AIModeSelection.lua:91; the save writes `currentMode="STEERING_ASSIST"`. The MODE values are blanked in the archive, so the mod compares names at run time (`enumName` in Api.lua); at run time `WORKER = 1`, `STEERING_ASSIST = 2`, `currentMode` 1 or 2 as the dialog set it (spike 0.0.15, `mod/tests/fixtures/spike0020/`) | unverified (read by the spike) |
| `spec_aiAutomaticSteering.steeringEnabled` | `state` `"steering"`; `steering.set`'s reading | AIAutomaticSteering.lua:141; `true` only in the steering dump (spike 0.0.15) | unverified (read by the spike) |
| `spec_aiAutomaticSteering.steeringFieldCourse` | `state` `"ready"` (set) or `"off"` (nil) | AIAutomaticSteering.lua:133; in the save; nil in the worker and off dumps, a course in ready and steering (spike 0.0.15) | unverified (read by the spike) |
| `TOGGLE_AI_STEERING`: "Activate lane" / "Deactivate lane"; acts on key-down and ignores the input value; its event is active only with a course and a current segment (the game's own check, `getIsAIAutomaticSteeringAllowed()`, never called here) | `canSteer` (its event's `isActive`); `steering.set`'s key | AIAutomaticSteering.lua:781-792, 887, 905-918; registered with `active: false` in all four spike0012 dumps, three vehicles (`mod/tests/fixtures/spike0012/`); spike 0.0.15: found through the steering part's `actionEvents` in `g_inputBinding.events`, inactive in worker, off and the truck, active in ready and steering; its text is "Toggle Steering Assist" | unverified (read by the spike) |
| `TOGGLE_AI` (H) | `ai.set`'s key, unchanged | AIModeSelection.lua:214 | the name verified ([GAME-API.md, C0](../docs/GAME-API.md#c0-the-command-channel)) |
| `getIsAIActive()` | `aiActive`, unchanged | AIJobVehicle | the name verified ([GAME-API.md, Phase 0](../docs/GAME-API.md#phase-0-spike-on-solek-windows-2026-10-20)); its turning on not yet (GAME-API.md, Not verified yet) |

The game switching the mode back to AI worker on a hitch:
AIAutomaticSteering.lua:532-544, unverified.

Never called (they change state, or are heavy): `getAttacherToolWorkingWidth`,
`initializeLoadedAIModeUserSettings`, `FieldCourseSettings.generate`,
`FieldCourse.findClosestField`, `g_fieldCourseManager:generateFieldCourseAtWorldPos`.

## Commands

- **`steering.set`**, value 0 or 1 (a set,
  [spec 0008](0008-commands-say-the-state.md)), on the controlled vehicle:
  1. Refused "not in Steering Assist mode" in AI worker mode, and "no
     Steering Assist" without it; nothing pressed. Both are checked before
     the reading.
  2. The reading is `steeringEnabled` (the cab's `state == "steering"`):
     already there → `already`, nothing pressed.
  3. Else it presses the vehicle's `TOGGLE_AI_STEERING` once, then reads
     `steeringEnabled` each frame for a few frames, as the contract commands
     wait ([spec 0019](0019-contract-actions.md)): ok, `checked`
     ([spec 0014](0014-checked-pipe-tipside-cover.md)), once it reaches the
     state asked for; "didn't change" if it doesn't. No live event for the
     key → "not available now", as for every key.

  No second key as a fallback (Decisions).
- **`ai.set`:** in AI worker mode, as today (spec 0008). In Steering Assist
  mode, refused "in Steering Assist mode", nothing pressed.
- **The dashboard:** the tapped button shows pending, then lit or unlit
  when the answer comes, as the other Drive buttons do; a failed answer
  says "Failed" on it.

## Plan

Tests first (CLAUDE.md). Steps 2 to 4 ship as one change: a mod that
refuses `ai.set` in Steering Assist mode needs the web that sends
`steering.set` there. Each step ends with
`python -m pytest mod/tests companion/tests tests` green; step 4 also with
`web/test.html` all green.

1. **Spike (read only, no calls),** `research/spike/FS25_CompanionSpike/`
   0.0.15: `csParts`, a `describe()` of `spec_aiModeSelection`'s and
   `spec_aiAutomaticSteering`'s plain fields, `AIModeSelection.MODE`'s key
   names, and `TOGGLE_AI_STEERING`'s event through
   `spec_aiAutomaticSteering.actionEvents` into `g_inputBinding.events` (the
   path `VehicleState.liveKey` walks). Rigs: both modes; off, ready and
   steering; on and off the field; one vehicle without Steering Assist. The
   dumps go to `mod/tests/fixtures/spike0020/`. **Gate:** if a dump
   disagrees with the Data contract, update the contract and get it
   approved before step 2.
2. **Reads:** `mod/src/Api.lua` gains the mode and steering reads. The new
   `mod/src/state/Steering.lua` is a plain reader like the other `state/`
   files (no cache): `VehicleState.steering(vehicle)` returns
   `{mode, state, canSteer}`, or nil without Steering Assist or with a mode
   that matches neither name. `canSteer` is `liveKey`'s `active`; with no
   event registered it reads false, and `steering` is still sent.
   `mod/src/collectors/Cab.lua` calls it inside a `pcall`, as it does
   `dumpReverseCruise`, so a failing read drops only `steering`.
3. **Commands** (`mod/src/Commands.lua`):
   - `steering.set`: `when` (its two refusals), `state` (`steeringEnabled`)
     and a job in the style of `contractJob`, with no `inputs`. The job is
     nil when the vehicle's `TOGGLE_AI_STEERING` event isn't live (so "not
     available now"); else it presses once,
     `runInputAction("TOGGLE_AI_STEERING", nil, vehicle)`, and answers ok
     the frame `steeringEnabled` reads the value asked for, "didn't change"
     after `Commands.STEERING_WAIT_FRAMES` (10); `via =
     "TOGGLE_AI_STEERING"`, `checked` on both.
   - `ai.set` gains a `when`: refused only when the mode reads
     `"steeringAssist"`; as today when `steering` is absent.
   - `Commands:info()` says `actions = 5`, with its comments.
4. **Web:**
   - `web/src/types.js`: `Cab.steering`, and 5 in the `actions` comment.
   - `web/src/widgets/controls.js`, the `aiWorker` control (same id): an
     `actionOf(v, cab)` beside its literal `action: "ai.set"`, giving
     `"steering.set"` in Steering Assist mode, written as a literal
     `action: "steering.set"` where `companion/tests/test_commands.py`'s
     guard finds it. `labels` always answers: "AI worker" with `aiWorker`,
     or "Steering" with `steering`. Only this control sets its label while
     faded.
   - Icon `steering` in `web/src/ui/icons.js`, `ICON_GROUPS`' Controls
     group: a steering wheel above a dotted lane line (five round dots,
     the middle one under the wheel's spoke: the canvas's C), in the set's
     stroke style; reviewed on `web/tools/icons.html` before the web uses
     it.
5. **Docs, in the same change:** `docs/THEMES.md` (the Drive line; the
   icon count, 83, in its three places; the design system refreshed),
   `mod/README.md` (the `state/` list, the `cab` row),
   `specs/0008-commands-say-the-state.md` (the `ai.set` row: refused in
   Steering Assist mode).

**Files:**
- New: `mod/src/state/Steering.lua`; `mod/tests/fixtures/spike0020/`.
- Changed, mod: `mod/src/Api.lua`; `mod/src/collectors/Cab.lua` (and its
  header); `mod/src/Commands.lua`; `mod/modDesc.xml` (`<version>` 0.21.0,
  and `<sourceFile filename="src/state/Steering.lua"/>` between
  `src/state/Rig.lua` and `src/Commands.lua`: the game loads only listed
  files); `mod/src/Companion.lua` (`Companion.VERSION = "0.21.0"`, which
  `mod/tests/test_version.py` checks); `mod/tests/run.lua`
  (`load("src/state/Steering.lua")` after Rig.lua, its two `actions`
  asserts 4 → 5, the new rows); `research/spike/FS25_CompanionSpike/`.
- Changed, web: `web/src/types.js`, `web/src/widgets/controls.js`,
  `web/src/ui/icons.js`, `web/test.html`.
- Changed, docs: `docs/THEMES.md`, `mod/README.md`,
  `specs/0008-commands-say-the-state.md`.

**Risks:** the steering key's event needing a binding after all
(Decisions, no fallback key); the game names the Data contract marks
unverified, until the spike and the live check.

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: `cab.steering` from a faked vehicle, its keys
  built with `SpikeRigs.register` so `liveKey` and the press reach the same
  event: AI worker and Steering Assist modes; off, ready and steering;
  `canSteer` true with the vehicle's event active, false when it is
  inactive or not registered; absent without `spec_aiAutomaticSteering` or
  `spec_aiModeSelection`, and when the mode matches neither name; a read
  that raises drops only `steering`.
- [x] `mod/tests/run.lua`: `steering.set` 1 and 0 press the vehicle's
  `TOGGLE_AI_STEERING` once and answer ok `checked` when `steeringEnabled`
  reaches the value within `STEERING_WAIT_FRAMES`; "didn't change" after
  it; `already`, nothing pressed; no live event → "not available now"; AI
  worker mode and no Steering Assist → refused, nothing pressed; with
  `canSteer` true the press finds the event.
- [x] `mod/tests/run.lua`: `ai.set` in Steering Assist mode → refused,
  nothing pressed; in AI worker mode, with `spec_aiModeSelection` present,
  it still presses `TOGGLE_AI`; hello says `actions` 5.
- [x] `tests/test_golden.py` unchanged (the Solek replay has no `cab`).
- [x] `web/test.html`: the Drive button reads "AI worker" (icon `aiWorker`)
  or "Steering" (icon `steering`) by the mode, including while faded, and
  goes back to "AI worker" when `cab.steering` goes; lit while steering;
  faded when not steering and `canSteer` is false; steering with `canSteer`
  false: lit, not faded; in Steering Assist mode a tap sends `steering.set`
  with the opposite state, in AI worker mode `ai.set`; a tap on the faded
  button sends nothing; steering turning off by itself shows no "Failed";
  without `cab.steering`, the button is as today.
- [x] Replay in the browser pane (`replay-solek`, a patched `cab`): both
  modes, ready, steering and faded, at 1158×676 and 1180×820, day and
  night; the Drive group keeps its two rows of three, and the label fits.

Live check (Solek, a tractor with a cultivator, mod 0.21.0):
- [ ] **The mode:** AI worker mode, then Steering Assist set in the game's
  dialog: the button's label follows.
- [ ] **A hitch:** unhitch the cultivator, then hitch a tool that doesn't
  allow steering: the label follows the mode the game holds.
- [ ] **On the field:** the button reads Steering, unlit, not faded; a tap
  steers (the game shows the lane active); a tap stops it.
- [ ] **From the joystick:** Activate lane on the joystick: the button
  lights; a wheel move: it goes unlit, with no "Failed".
- [ ] **Off the field:** the button is faded; a tap does nothing.
- [ ] **H after a dashboard tap:** a short press of H right after a
  dashboard tap toggles the lane and does not open the AI Settings dialog.
- [ ] **The steering key unbound** (joystick button 21 cleared for the
  check): a tap still steers.
- [ ] **AI worker mode:** the button lights while a worker hired in game
  drives, as today.
- [ ] **A truck in Steering Assist mode,** if the game's dialog lets you
  set it there: the button follows as on a tractor.
- [ ] **Without Steering Assist** (a loader or a truck): the button is as
  today.
- [ ] The rows above with Precision Farming on and off.

## Decisions

- **The steering key, not the AI key,** in Steering Assist mode: it does one
  job, acts on key-down and has no hold, so per the game's source
  (AIAutomaticSteering.lua:887) a dashboard tap cannot open the AI Settings
  dialog; the H row of the live check confirms it. Rejected: pressing
  `TOGGLE_AI`, which acts only on a second call (the release) and opens the
  dialog when held.
- **One button whose job follows the mode.** Rejected: a second Steering
  button, because the Drive group is full at two rows of three.
- **The label is "Steering"** (Vincent, 2026-11-18): what the button does,
  lit or not. The game's "Lane" names what is steered along.
- **AI worker mode stays as today** (Vincent, 2026-11-18). Rejected: the mod
  sending `TOGGLE_AI`'s release after its press, because a later spec may
  replace this press (PLAN.md's AI worker button idea). Cost: in AI worker
  mode a dashboard tap presses `TOGGLE_AI` once with no release; if that
  leaves the game's hold timer running, the player's next press of H may
  open the AI Settings dialog at once. Not checked; PLAN.md's AI worker
  item holds it.
- **No fallback key when the steering key is unbound** (Vincent,
  2026-11-18). The mod calls the key's event, not the player's binding, and
  the spike0012 dumps show `TOGGLE_AI_STEERING_LINES` registered and
  active, though Vincent never bound it (his bindings, 2026-11-17). Cost:
  if this key's event needs a binding after all, a player who never bound
  it sees the button faded; one live check runs with it unbound.
- **Faded when you can't steer, and a tap does nothing** (Vincent,
  2026-11-18), as Attach: "Failed" stays for a press that went out and did
  nothing. Rejected: a button that stays pressable and that the mod refuses.
- **The mode and Show Lines move to spec 0022** with the dialog's other
  settings, so all seven sit together as in the game. The brainstorm had
  the mode here; there is no place for it on screen before the GPS screen.
- **`canSteer` from the steering key's event,** not the game's
  `getIsAIAutomaticSteeringAllowed()`: a field read instead of a game call
  every frame, and the press targets the same event, so the fade agrees
  with what a press would find.

## Out of scope / open questions

1. Why steering can't start, in words: on the GPS screen (spec 0021), not
   on the button. `onField` moves to 0021 with it.
2. Hiring an AI worker, and what the worker button's tap does: PLAN.md's own
   item.
3. A multiplayer client: `steering.set` presses the key as on a host; not
   checked live.

## Log

- 2026-11-17: drafted from the egm brainstorm (concepts_brief.md):
  Vincent wants the GPS set up and run from the dashboard alone. His
  answers: a short press of H is Activate / Deactivate lane and its hold
  opens the dialog; setters are allowed (they come with 0022).
- 2026-11-18: egm review, Stages 5 to 9. Vincent's choices: AI worker mode as today,
  no fallback key, faded when you can't steer, the label "Steering".
  `steering.set` waits for the change and reads one value, pressing the
  vehicle's own event; `whyNot` (the reason steering can't start) dropped,
  `onField` moved to 0021; the mode value is `"steeringAssist"`; the Plan
  gained its file list and the spike its gate.
- 2026-11-19: approved by Vincent as drafted. Not built yet: the build
  starts with the spike (Plan, step 1), and a dump that disagrees with the
  Data contract sends it back for approval before step 2.
- 2026-11-19: the canvas drawn before the build: the Drive group as the
  app has it (Engine one column wide, Attach sixth), the fifth button in
  each state, and three ideas for the `steering` icon (A in the screens).
  Waiting for Vincent's look and his pick of the icon.
- 2026-11-19: Vincent picked icon C, the dotted line centred with the
  wheel: five round dots (r 1) at x 3 to 21, the middle one under the
  wheel's spoke (the canvas has it). Build, step 1: spike 0.0.15's
  `csParts` gains `steering` (tests in `mod/tests/test_spike_steering.py`);
  waiting for Vincent's dumps, the gate before step 2.
- 2026-11-19: spike 0.0.15 run by Vincent on Solek (Antonio Carraro Mach
  4R with a Pöttinger Terria 6040; the Arocs 4133 hooklift truck): five
  dumps, `building` not caught, in `mod/tests/fixtures/spike0020/`. The
  mode, `steeringEnabled`, the course and the steering key's `isActive`
  read as the contract says, in all four tractor rigs. One difference:
  the truck carries both parts, in AI worker mode, so `steering` is sent
  for it; Behaviour, the contract and a live check row say so. Waiting
  for Vincent's approval of that before step 2.
- 2026-11-19: approved by Vincent ("Approved, build"). Built, mod 0.21.0,
  as planned: `Api.aiMode` and `Api.automaticSteering`, the new
  `state/Steering.lua` (`VehicleState.steering`, `steeringEnabled`), `cab.steering`
  in a `pcall`, `steering.set` (press the vehicle's own key, read each frame,
  `STEERING_WAIT_FRAMES` 10) and `ai.set` refused in Steering Assist mode,
  hello `actions` 5. Web: the `aiWorker` control gains `actionOf` (the
  literal `action: "steering.set"` sits in `STEERING` beside it) and
  `labelsAlways` (its label follows the mode while faded); icon `steering`
  (Vincent's C on the canvas, 83 icons; reviewed on the canvas rather than
  `web/tools/icons.html`). The mod tests build the vehicle from the five
  spike0020 dumps. Checks: pytest 142 passed, `web/test.html` 398 all
  green; the replay with a patched `cab` (the plough rig): ready, steering,
  faded, AI worker mode and no `steering`, each at 1180 × 820 and
  1158 × 676, day and night (20, read off the button: label, icon, state,
  size, the label fits), screenshots of four; the Drive group two rows of
  three. The spike's readings in GAME-API.md (Steering Assist), the press
  under its Not verified yet. The design system refreshed (versions 23 and
  24: the icon, `DriveGroup` as the app has it with Steering, its cards).
  Mod 0.21.0 installed in the game's mods folder. The live check is next.
