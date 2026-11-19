# 0022: Steering Assist settings from the dashboard

Status: draft
Mod: 0.23.0 (planned) · Started: 2026-11-17 · Design: the settings panel on the GPS screen's canvas (spec 0021); the brainstorm's brief, `concepts_brief.md`, is in git history (commit b0cffeb)

## Goal

The third GPS spec, after [0020](0020-steering-assist-state.md) and
[0021](0021-gps-screen.md).

Set up the game's Steering Assist without the game's dialog (holding H):
all seven of its settings from the GPS screen. They are the mode, working
width, headlands, work direction, side offset, show lines, and cruise
control deactivation. Vincent changes all of them, field by field and tool
by tool.

## Behaviour

- **A settings panel,** opened from the GPS screen (like the game speed
  panel), one row per setting, with the game's values as it holds them,
  never a copy:
  - **Mode:** AI worker or Steering Assist, in a well (as Settings' Day /
    Night).
  - **Working width:** "Auto · 7.6 m" (the attached tool's width: a
    header, a boom, a cultivator) or a set value; −/+ in 0.1 m steps, and
    one tap back to Auto.
  - **Headlands:** how many rounds around the field before the straight
    lanes; "Auto · 1" or a count, −/+.
  - **Work direction:** the lanes' angle in degrees; "Auto" or a set
    angle.
  - **Side offset:** for tools not centred on the lane (a plough, a
    trailed potato harvester); "Auto · 0 m" or metres to one side, −/+ in
    0.1 m steps.
  - **Show lines:** On or Off.
  - **Cruise off before the lane end:** On or Off (the game's "Cruise
    Control Deactivation", Automatic or Manual).
- **Apply,** like the dialog's OK: the panel holds the changes until Apply,
  so the game builds the course once. The rows show "Applying…" until the
  game reads the change back; a change that doesn't get there says "Failed"
  on Apply.
- **Only on a field the farm may work** (Vincent, 2026-11-17): its own, a
  contract field it took, or in multiplayer another farm's field that
  allows it. Elsewhere the rows are faded, with "Drive onto a field you
  may work". (The mode can be set anywhere.)
- **While steering,** the course rows fade with "Steering is on": a change
  would turn steering off and build a new course. **With lanes done,** a
  note says "Changing starts a new course" (the game keeps the old one and
  takes it back if the settings return).
- **After hitching,** the game puts the settings back to Auto for the new
  tool; the panel shows that. Set up after hitching.
- **These are Steering Assist's own settings:** the AI worker's are kept
  apart by the game (seen in the save).
- **Day and Night, sizes:** as the GPS screen's canvas.

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change.

- **Mod → companion** (`cab.steering`, spec 0020, gains `settings`):
  - `width` {`m`, `auto`}, `headlands` {`count`, `auto`}, `direction`
    {`deg`, `auto`}, `offset` {`m`, `auto`}, `showLines`, `cruiseOff`;
  - absent until the game has settings for this vehicle; never filled in
    by calling the game's width getter or course builder.
- **Web** (`web/src/types.js`): `Cab.steering.settings`; the panel in
  `web/src/ui/` or `widgets/`. The rows fade off the field from
  `cab.steering.onField` (spec 0021).

What Vincent's Solek save showed (2026-11-17, with set values and on Auto),
all **unverified** live:

| Setting | Saved settings (`aiModeSelection` › `settings` › `steering_assist`) | The course (`fieldCourseSettings`) |
|---|---|---|
| Working width | `implementWidth`, tenths of a metre (69 = 6.9 m; Auto 76) | `implementWidth`, metres |
| Headlands | `numHeadlands`, a count | `numHeadlands` |
| Work direction | `workDirection`, whole degrees (135); **-57 = Auto** (-1 radian) | `workDirection`, radians (2.356194); **-1 = Auto** |
| Side offset | `sideOffset`, metres, signed (-0.5) | `sideOffset`, metres |
| Show lines | `showLines` | — |
| Cruise deactivation | `cruiseControl` | — |
| Mode | `currentMode` (`STEERING_ASSIST`, `WORKER`) | — |

No Auto flag is saved: Auto may be "the value equals the tool's default"
(inferred). Which side a negative offset is: not checked.

Game API names, all **unverified**:

| Name | Where from | State |
|---|---|---|
| `setAIModeSelection(aiMode)`: sends its own event | AIModeSelection.lua:294-314 | unverified |
| `getIsAutomaticSteeringAllowed()`: whether a tool allows steering (the dialog's guard; the game puts the mode back to AI worker otherwise) | AIAutomaticSteering.lua:629-645 | unverified |
| `aiModeSettingsChanged(aiMode, fieldCourseSettings)`: the dialog's own OK, on a clone of the game's settings | AIModeSelection.lua:249, 324-333 | unverified |
| the in-memory settings object (`spec_aiModeSelection.userSettings`, class `AIUserSettings`) and its fields | not in the archive; the save's names above | **unknown: the spike** |
| `GameSettings.SETTING.STEERING_ASSIST_LINES` (every vehicle) and the key `TOGGLE_AI_STEERING_LINES` | AIAutomaticSteering.lua:895, 922-925 | unverified |
| `GameSettings.SETTING.STEERING_ASSIST_CRUISE_CONTROL` (a vehicle setting) and its setter | AIAutomaticSteering.lua:407; the setter is not in the archive | **unknown: the spike** |

Never called: `setAIModeFieldCourseSettings` (the receiving end of the
game's network event), a settings object the mod builds itself,
`FieldCourseSettings.generate`, `getAttacherToolWorkingWidth`.

## Commands

The game has no keys for these settings, only its dialog. So this is the
second exception to "the game's keys, not its setters", beside spec 0019's
contracts (Vincent, 2026-11-17), and the paragraph in ARCHITECTURE.md
names it. Like 0019, it runs the game's own checks first, changes only
through the game's own functions, and answers ok only once the game reads
the change back. It is host only until checked on a multiplayer client.

- **`steering.mode.set`**, value 0 (AI worker) or 1 (Steering Assist): a
  set. Steering Assist needs `getIsAutomaticSteeringAllowed()` (else
  refused "no tool allows steering"). `setAIModeSelection`; ok when
  `getAIModeSelection()` reads it back.
- **`steering.settings.apply`**, with the changed values in a new
  `settings` attribute (width, headlands, direction, offset, Auto per
  setting): on a field the farm may work, steering off. The game's own
  clone, changed, through `aiModeSettingsChanged`; the in-memory settings
  object changed too, the way the dialog does, once the spike shows how.
  Ok when the game's settings and the new course read back the values. This
  needs the attribute in `mod/src/Commands.lua`,
  `companion/server.py` and `companion/commands.py`.
- **`steering.lines.set`** and **`steering.cruiseOff.set`**, value 0 or 1:
  show lines through its key if that changes what the dialog shows, else
  the setter; cruise through the vehicle setting's setter.
- **`hello.commands.actions`** goes to 6.

## Plan

1. **Spikes, one new call per session,** after each: drive, steer, save,
   reload and open the game's dialog to compare (the brainstorm's probe 6):
   - a shallow dump of `userSettings` and the course settings, before and
     after a change in the game's dialog, to see the in-memory names;
   - `getIsAutomaticSteeringAllowed`, then `setAIModeSelection`;
   - the cruise setting's setter; show lines through the key;
   - `aiModeSettingsChanged` with one value changed (direction first);
   - then a multiplayer client.
2. **The panel on the GPS screen's canvas,** approved before code.
3. `mod/src/Api.lua` (the calls, guarded), `mod/src/state/Steering.lua`
   (the settings), `mod/src/Commands.lua`, the companion's `settings`
   attribute, `mod/modDesc.xml` 0.23.0 and its description (the mod now
   changes what the game saves).
4. `web/src/types.js`, the panel, `theme.css`.
5. `docs/ARCHITECTURE.md`: the second exception.
6. **Risks:** a settings object written wrongly could fail later in the
   game's own save or network code, outside our guards (the brainstorm's
   B2); that is why only the game's own clone and commit are used, one
   setting at a time, and each spike ends with a save and a reload.

## Acceptance

Automated (to be filled in after the spikes):
- [ ] `mod/tests/run.lua`: `cab.steering.settings` from faked settings,
  Auto and set; `steering.mode.set` refused without a tool that allows it;
  `steering.settings.apply` refused off the field and while steering; ok
  only on read-back.
- [ ] `companion/tests`: the `settings` attribute passes through.
- [ ] `web/test.html`: each row's Auto and set values, −/+, back to Auto,
  Apply's pending, ok and "Failed"; the faded rows and their words.
- [ ] Replay in the browser pane at 1158×676 and 1180×820, day and night.

Live check (Solek, mod 0.23.0):
- [ ] Each setting set from the dashboard: the game's dialog shows the
  same, and the lanes move as they should.
- [ ] Back to Auto from the dashboard: the dialog shows Auto.
- [ ] Rehitch: the panel shows Auto.
- [ ] Save and reload: the settings stay.
- [ ] Off the field and while steering: faded, with the words.
- [ ] With H's hold never used, and with the lines key unbound.
- [ ] Precision Farming on and off.

## Decisions

- **The game's setters are allowed here** (Vincent, 2026-11-17): every
  setting must be controlled from the dashboard.
- **One Apply,** like the dialog's OK, so the game builds one course per
  change, not one per tap.
- **The mode is here,** with the dialog's other settings (moved from
  spec 0020).

## Out of scope / open questions

1. **Steps:** the width in 0.1 m steps is many taps from 7.6 m to 3 m; a
   number pad, or ±1 m too? The direction in steps of 1° or 5°, and a
   "along my heading" button?
2. **Show lines:** the save keeps it per vehicle, the key changes it for
   every vehicle; which one does the dialog change?
3. **The offset's side:** what to call it ("left" and "right" of the
   direction of travel?), once a live check shows the sign.
4. The AI worker's own settings (its headlands, skipped lanes): not here;
   PLAN.md's AI worker item.

## Log

- 2026-11-17: drafted from the egm brainstorm (concepts_brief.md) and three
  of Vincent's Solek saves, which gave the settings' names and units.
  Vincent: direction is an angle in degrees, headlands are rounds before
  the lanes, width is Auto from the tool or set in 0.1 m steps, offset is
  for tools not centred; set up only on a field the farm may work.
