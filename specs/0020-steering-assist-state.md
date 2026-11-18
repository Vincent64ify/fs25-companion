# 0020: Steering Assist: state and the Drive button

Status: draft
Mod: 0.21.0 (planned) · Started: 2026-11-17 · Design: [THEMES.md](../docs/THEMES.md#layout) (the Drive group); the brainstorm is in [concepts_brief.md](../concepts_brief.md) until the GPS specs are approved

## Goal

The first of three specs for the GPS, which is the game's own Steering
Assist: this one, then the GPS screen ([0021](0021-gps-screen.md)), then
the course settings ([0022](0022-steering-assist-settings.md)).

The dashboard knows which mode the tractor is in (AI worker or Steering
Assist), whether the game has lanes for it, and whether it is steering.
The Drive group's AI worker button becomes the steering button in
Steering Assist mode, so a tap does what a short press of H does in game:
Activate lane or Deactivate lane. On the way it fixes that button: today
it presses the game's AI key down and never lets go, and the game acts on
that key's release.

## Behaviour

- **One Drive button, its job set by the mode** (the mode is a setup
  choice, saved per vehicle, so the button never comes and goes):
  - **AI worker mode:** "AI worker", as today, lit while a worker drives.
  - **Steering Assist mode:** "Steering", lit while the game steers. A tap
    asks for the opposite: on is the game's Activate lane on the lane under
    you, off is Deactivate lane.
  - **No lane under you** (off the field, the course still building, or no
    lane where you are): the button fades. A tap says "Failed" on it, like
    any press that does nothing.
  - A vehicle with no AI modes at all (a loader, a truck): the button as
    today.
- **Steering turning itself off** (you move the wheel or the joystick, you
  reverse, you leave the field or the cab, the settings change): the button
  follows quietly, with no "Failed". Only a press that does nothing says it.
- **The mode** is read and not set here. Until spec 0022, it is set once in
  the game's dialog (hold H); the game saves it per vehicle.
- **Day and Night, sizes:** the button keeps the Drive group's look and
  place at 1158×676 and 1180×820. Its icon changes with its label (a new
  icon for Steering, in the set's style).

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change.

- **Mod → companion** (`cab`, on change): `steering`, absent when the
  controlled vehicle has no Steering Assist:
  - `mode` (`"worker"` or `"steering"`): the vehicle's AI mode.
  - `state` (`"off"`, `"ready"` or `"steering"`): no course, a course, or
    steering.
  - `canSteer` (boolean) and `whyNot` (`"noCourse"` or `"noLane"`, absent
    when it can): whether a tap could turn steering on now.
  - `onField` (boolean): the game's own "on a field you may work" for this
    vehicle.
- **Web** (`web/src/types.js`): `Cab.steering`.
- **Web** (`web/src/widgets/controls.js`): the Drive button reads
  `cab.steering.mode` for its job and label, `state` for lit, `canSteer`
  for faded.

Game API names, all **unverified** (read in the SDK's `gameSource.zip` on
2026-11-17, and in Vincent's Solek save), each read behind the guards in
`mod/src/Api.lua`:

| Name | Where from | State |
|---|---|---|
| `spec_aiModeSelection.currentMode`, `getAIModeSelection()` | AIModeSelection.lua:91, 318; the save writes `currentMode="STEERING_ASSIST"` or `"WORKER"` | unverified |
| `AIModeSelection.MODE.WORKER`, `.STEERING_ASSIST` | AIModeSelection.lua (the values are blanked in the archive: compared at run time, as `Api.missionStatus` does) | unverified |
| `spec_aiAutomaticSteering.steeringEnabled`, `.steeringFieldCourse`, `.lastIsOnField` | AIAutomaticSteering.lua:129-141 | unverified |
| `getAIAutomaticSteeringState()`, `AIAutomaticSteering.STATE.DISABLED / AVAILABLE / ACTIVE` | AIAutomaticSteering.lua:796-808 (values blanked) | unverified |
| `getIsAIAutomaticSteeringAllowed()`: false with "no course" or "no segment" (the game's two warning texts) | AIAutomaticSteering.lua:781-792 | unverified |
| `TOGGLE_AI_STEERING`: Activate / Deactivate lane, on key-down, its event active only with a course and a lane | AIAutomaticSteering.lua:887, 905-918; Vincent binds it to joystick button 21 | unverified |
| `TOGGLE_AI` (H): a tap hires the worker or toggles steering by the mode; held, it opens the AI Settings dialog | AIModeSelection.lua:214-273 | the name verified ([GAME-API.md](../docs/GAME-API.md)); the tap and hold behaviour unverified |
| `getIsAIActive()` | AIJobVehicle | verified (GAME-API.md, Phase 0) |

Never called (they change state, or are heavy): `getAttacherToolWorkingWidth`,
`initializeLoadedAIModeUserSettings`, `FieldCourseSettings.generate`,
`FieldCourse.findClosestField`, `g_fieldCourseManager:generateFieldCourseAtWorldPos`.

## Commands

- **`steering.set`**, value 0 or 1 (a set, specs/0008): the reading is
  `state == "steering"`; already there → `already`, nothing pressed. Else
  press `TOGGLE_AI_STEERING` on the controlled vehicle (the game ignores
  the value and acts on key-down), read `steeringEnabled` in the same frame,
  and answer ok `checked` when it changed. No live event (the game turns it
  off with no lane under you) → failed with `whyNot`. Not in Steering
  Assist mode → refused "not steering assist", nothing pressed.
- **`ai.set`** keeps its job in AI worker mode, and is refused in Steering
  Assist mode ("steering assist: steering.set"), nothing pressed. How it
  presses `TOGGLE_AI` follows the spike (Plan 1): if the game never sees a
  release after the mod's press, the mod sends the release (value 0) the
  next frame, so a dashboard tap is a real tap and never leaves the game
  waiting on a held key.
- **`hello.commands.actions`** goes to 5; the web shows the Steering job
  only from 5.
- **The dashboard, the same frame:** the tapped button goes pending, then
  lit or unlit on the ok answer, as the other Drive buttons do.

## Plan

1. **Spike (read only, plus the key the mod already presses):**
   - log the values the game sends `TOGGLE_AI`'s callback for a real tap
     and a real hold of H, and `spec_aiModeSelection.modeChangeStartTime`
     before an `ai.set`, right after it and a frame later;
   - whether `TOGGLE_AI_STEERING` has an active event in each mode and
     state, bound (Vincent's joystick) and unbound;
   - the class tables `AIModeSelection.MODE` and `AIAutomaticSteering.STATE`
     (read only, no calls).
2. `mod/src/Api.lua`: the reads above. A new `mod/src/state/Steering.lua`
   reads them once a frame; `mod/src/collectors/Cab.lua` adds `steering`.
3. `mod/src/Commands.lua`: `steering.set`, `ai.set`'s refusal and its
   release if the spike asks for it, `actions = 5`. `mod/modDesc.xml`
   0.21.0.
4. `web/src/types.js`, `web/src/widgets/controls.js`, the icon in
   `web/src/ui/icons.js`, `theme.css` if needed; THEMES.md's Drive line.
5. In the same change: spec 0008's `ai.set` row, PLAN.md's AI worker items.
6. **Risks:** a player who never bound `TOGGLE_AI_STEERING` may have no
   live event for it (to see in the spike); then the fallback is a real
   tap of `TOGGLE_AI` in Steering Assist mode. Steering is turned off by
   the game for many reasons; the button only follows.

## Acceptance

Automated:
- [ ] `mod/tests/run.lua`: `cab.steering` from a faked vehicle: AI worker
  and Steering Assist modes; off, ready and steering; `canSteer` and
  `whyNot`; absent without the game's AI specs; a failing read drops only
  `steering`.
- [ ] `mod/tests/run.lua`: `steering.set` 1 presses `TOGGLE_AI_STEERING`
  once and answers ok when `steeringEnabled` turns true; `already`;
  no live event → failed with the reason; AI worker mode → refused,
  nothing pressed; `ai.set` in Steering Assist mode → refused, nothing
  pressed.
- [ ] `tests/test_golden.py` unchanged (the Solek replay has no `cab`).
- [ ] `web/test.html`: the Drive button reads "AI worker" or "Steering" by
  the mode; lit while steering; faded without a lane; a tap sends
  `steering.set` with the opposite state; steering turning off by itself
  shows no "Failed"; before actions 5, the button is as today.
- [ ] Replay in the browser pane (`replay-solek`, a patched `cab`): both
  modes, ready, steering and faded, at 1158×676 and 1180×820, day and
  night.

Live check (Solek, a tractor with a cultivator, mod 0.21.0):
- [ ] **The mode:** AI worker mode, then Steering Assist set in the game's
  dialog: the button's label follows.
- [ ] **On the field:** the button is ready; a tap steers (the game shows
  the lane active); a tap stops it.
- [ ] **From the joystick:** Activate lane on the joystick: the button
  lights; a wheel move: it goes out, with no "Failed".
- [ ] **Off the field:** the button is faded; a tap says "Failed".
- [ ] **H in game after a dashboard tap:** a short press of H still
  toggles the lane, and never opens the dialog by itself.
- [ ] **AI worker mode:** what a tap does now (no dialog opens later).
- [ ] Precision Farming on and off.

## Decisions

- **The steering key, not the AI key,** in Steering Assist mode: it acts on
  key-down, so the answer comes the same frame (the brainstorm's B1).
- **The mode moves to spec 0022** with the dialog's other settings, so the
  seven sit together as in the game. The brainstorm had it here; there is
  no place for it on screen before the GPS screen.
- **Steering turning itself off is not a failure.**

## Out of scope / open questions

1. The label: "Steering", or the game's own word "Lane"?
2. Why steering can't start, in words: on the GPS screen (spec 0021), not
   on the button.
3. Hiring an AI worker stays PLAN.md's own item.
4. A multiplayer client: not checked.

## Log

- 2026-11-17: drafted from the egm brainstorm (concepts_brief.md):
  Vincent wants the GPS set up and run from the dashboard alone. His
  answers: a short press of H is Activate / Deactivate lane and its hold
  opens the dialog; setters are allowed (they come with 0022).
