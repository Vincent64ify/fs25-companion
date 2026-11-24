# 0022: Steering Assist settings from the dashboard

Status: approved
Mod: 0.23.0 (planned) · Started: 2026-11-17 · Design: the "Steering Assist settings" row on the GPS canvas, approved 2026-11-24 (version 30) (`FS25 Companion: GPS`, https://claude.ai/artifact/45ruF2v1hH49JJi4HyRTeM, board `Settings`), drawn 2026-11-23, redrawn 2026-11-24; the brainstorm's brief, `concepts_brief.md`, is in git history (commit b0cffeb)

## Goal

The third GPS spec, after [0020](0020-steering-assist-state.md) and
[0021](0021-gps-screen.md).

Set up the game's Steering Assist without the game's dialog (holding H):
every setting of its AI Settings dialog from the GPS screen. With Steering
Assist selected the dialog has seven (Vincent's screenshot, 2026-11-23):
the mode, Working Width, Number of Headlands, Work Direction, Side Offset,
Show Lines, and Cruise Control Deactivation, then Reset, Back and OK.
Vincent changes all of them, field by field and tool by tool.

## Behaviour

- **A settings column,** opened by Set up on the GPS screen's field card
  (Vincent, 2026-11-24): it takes the Drive column's place, so the field
  keeps its place and size and shows the preview (below) while you
  adjust. One row per setting, its value on the right, with the game's
  values as it holds them, never a copy; tap a row and its steps open
  under it, one row at a time. Close (where Set up was) drops what wasn't
  applied, as the game's Back, and brings the Drive column back:
  - **Mode:** AI worker or Steering Assist, two choices in a well. It sets
    at once (its own command, like the game speed steps), not on Apply;
    the rows below follow the game's mode. Steering Assist is faded with
    "No tool here allows steering" when the game wouldn't take it (as its
    dialog greys it out: the Arocs truck, spec 0020).
  - **Working width:** "Auto · 7.6 m" (the attached tool's width: a
    header, a boom, a cultivator) or a set value; −/+ in 0.1 m and in
    1 m steps (Vincent, 2026-11-23), and one tap back to Auto.
  - **Headlands:** how many rounds around the field before the straight
    lanes; "Auto · 1" or a count, −/+.
  - **Work direction:** the lanes' angle in degrees; "Auto" (the game
    picks the angle for the field) or a set angle, one of the game's
    dialog's choices, 0° to 175°; −/+ in 5° steps (Vincent, 2026-11-24,
    after spike 0.0.19), and one tap back to Auto.
  - **Side offset:** for tools not centred on the lane (a plough, a
    trailed potato harvester); "Auto · 0 m" (the dialog's "0.0 M (AUTO)")
    or metres to one side, "0.5 m left" (the game's −) or "0.5 m right"
    (+) (Vincent tested it, 2026-11-23); −/+ in 0.1 m steps, and one tap
    back to Auto.
  - **Show lines:** On or Off.
  - **Cruise control:** Manual or Automatic, the game's words for its
    "Cruise Control Deactivation" (off at the lane end).
  - Show lines and Cruise are the game's own settings, the same for every
    vehicle (spike 0.0.18; Vincent, 2026-11-24: game-wide, as the game
    does).
- **While Set up is open there is no Drive column** (Vincent, 2026-11-24):
  close it to steer; setting up happens standing still.
- **The preview's look:** the lanes tinted in this lane's colour with a
  centre line each; the game's own course keeps the GPS screen's look, and
  the counts over the field go quiet while a preview shows.
- **Reset,** like the dialog's (Vincent, 2026-11-23): the course rows
  (width, headlands, direction, offset) back to Auto; Show lines and
  Cruise stay as they are, as in the game (Vincent's check: 6.6 m, 5
  headlands, 160°, −0.4 m, lines Off, Manual became 6.0 m (Auto), 3
  (Auto), Automatic, 0.0 m (Auto), lines Off, Manual). Held in the panel
  until Apply, like any other change.
- **The preview,** like the dialog's map (Vincent, 2026-11-23): the field
  beside the panel shows the course the game would build with the panel's
  settings, before Apply. On opening it is the course the game has. Half
  a second after the last change, the mod asks the game's course builder
  for a course with those settings, and never gives it to the vehicle;
  the field draws it in the preview look, tagged "Preview · not applied",
  with "Building the preview…" while the game works, and "No lanes with
  these settings" when the game builds none. Back to the game's own
  settings, the field shows the game's course again. No preview where the
  course rows are faded (off the field, steering, AI worker mode). If the
  spike shows the builder isn't safe to call this way, the preview goes
  and the field shows the game's new course after Apply.
- **Apply,** like the dialog's OK: the panel holds the changes until Apply,
  so the game builds the course once. The rows show "Applying…" until the
  game reads the change back; a change that doesn't get there says "Failed"
  on Apply.
- **Only the selected mode's settings** (Vincent, 2026-11-23): the rows
  are Steering Assist's, so they're set only in Steering Assist mode (the
  game also keeps "on a field you may work" fresh only there, spec 0021's
  `onField`). In AI worker mode only the Mode row is live; the others fade
  with "Switch to Steering Assist" (open question 4: the worker's own
  rows later).
- **Per vehicle:** the course rows (width, headlands, direction,
  offset) and the mode belong to the vehicle you're in (Vincent,
  2026-11-23: changed on one tractor on one field, the other tractor on
  another field kept its own); the panel shows the controlled vehicle's.
  Show lines and Cruise are game-wide (above).
- **Only on a field the farm may work** (Vincent, 2026-11-17): its own, a
  contract field it took, or in multiplayer another farm's field that
  allows it. Elsewhere the course rows are faded, with "Drive onto a field
  you may work" (the GPS screen's words, from `cab.steering.onField`).
  The mode can be set anywhere.
- **While steering,** the course rows fade with "Steering is on": a change
  would turn steering off and build a new course. **With lanes done,** a
  note says "Changing starts a new course" (the game keeps the old one and
  takes it back if the settings return).
- **After hitching,** the game puts the settings back to Auto for the new
  tool; the panel shows that. Set up after hitching.
- **These are Steering Assist's own settings:** the save keeps the AI
  worker's apart (`settings` › `worker` and `steering_assist`). In memory
  both modes showed the same values (spike 0.0.15), so where the game
  keeps them apart is a spike question (Plan, step 1).
- **Day and Night, sizes:** as the GPS screen's canvas, at 1158×676 and
  1180×820.

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change.

- **Mod → companion** (`cab.steering`, spec 0020, gains `settings` and
  `canAssist`):
  - `settings`: `width` {`m`, `auto`}, `headlands` {`count`, `auto`},
    `direction` {`deg`, `auto`}, `offset` {`m`, `auto`} (− left, + right),
    `showLines`, `cruiseOff` (Automatic: cruise off at the lane end);
    absent until the game has settings for this vehicle; read from plain
    fields, never filled in by calling the game's width getter or course
    builder. `showLines` and `cruiseOff` are the game's
    (`g_gameSettings`' `steeringAssistLines` and
    `steeringAssistCruiseControl`), the same in every vehicle's message;
  - `canAssist` (boolean): whether a tool here allows Steering Assist, for
    the Mode row's fade, once the spike shows `getIsAutomaticSteeringAllowed`
    is safe to call (else from the fields it reads).
- **Mod → companion, a new topic `steering_preview`** (latest wins, like
  `steering_course`): `key` (a number per preview), `for` (the settings it
  was built with, as `cab.steering.settings`), `state` (`building`,
  `ready`, `none`), and when ready the course in `steering_course`'s shape
  (`segments`, `width`; spec 0021), so the GPS screen's drawing takes it as
  is. Sent only for the controlled vehicle; cleared when the panel closes
  or the settings are applied. About the size of a course (5 to 10 KB).
- **Web** (`web/src/types.js`): `CabSteering.settings` and `canAssist`,
  `SteeringPreview`; the panel in `web/src/widgets/` beside `gpsScreen.js`,
  the preview drawn by the GPS screen's own field drawing. `mode` stays
  `"worker"` or `"steeringAssist"` (spec 0020).

What Vincent's Solek save showed (2026-11-17, with set values and on Auto)
and what the spikes read in memory:

| Setting | Saved settings (`aiModeSelection` › `settings` › `steering_assist`) | In memory (`spec_aiModeSelection.fieldCourseSettings`, spike 0.0.15) | The course (`course.fieldCourseSettings`, spikes 0.0.16–17) |
|---|---|---|---|
| Working width | `implementWidth`, tenths of a metre (69 = 6.9 m; Auto 76) | `implementWidth`, metres (6) | `implementWidth`, metres: **verified** (GAME-API.md, the lanes' spacing) |
| Headlands | `numHeadlands`, a count | `numHeadlands` (3) | `numHeadlands` (1, field 7) |
| Work direction | `workDirection`, whole degrees (135); -57 saved for Auto | `workDirection`, radians; **-1 = Auto** | `workDirection`, radians: -0.99484 on field 7, before and after a reload (open question 5) |
| Side offset | `sideOffset`, metres, signed (-0.5); − is left of the way you drive, + right (Vincent, live) | `sideOffset` (0); also `sideOffsetHeadlandAlternate`, `variableSideOffset` | `sideOffset` |
| Show lines | `showLines`, per vehicle | not in `fieldCourseSettings`: `g_gameSettings.steeringAssistLines`, every vehicle (spike 0.0.18: the dialog changed it) | — |
| Cruise deactivation | `cruiseControl` | not in `fieldCourseSettings`: `g_gameSettings.steeringAssistCruiseControl`, true = Automatic, every vehicle; the vehicle's own copy (`spec_vehicleSettings`) follows it (spike 0.0.18) | — |
| Mode | `currentMode` (`STEERING_ASSIST`, `WORKER`) | `spec_aiModeSelection.currentMode`, 1 or 2: **verified** (`AIModeSelection.MODE`, GAME-API.md) | — |

No Auto flag is saved or kept, and Auto means two things:
- **Width, headlands, offset:** Auto is the value equal to the default
  the game takes from the tool (`FieldCourseSettings.generate`), the same
  on every field (spike 0.0.19: back at 5.0 m from 5.1 m the dialog said
  "(Auto)" again, the entry's value 50 against its default 50).
- **Direction:** Auto is a choice of its own, the first of the dialog's
  choices: −57.2958° (−1 rad in the course settings); the save rounds it
  to −57, which comes back as −0.99484 rad, and the game's course builder
  picks the angle for each field: on Auto the lanes ran at 30° on field
  119 and 77° on field 7, angles that aren't among the dialog's 5° choices
  (the lanes measured in the dumps; a set 45° measured 45°). How it picks
  is in the builder, which isn't in the archive (likely the field's
  longest side, inferred). The dialog shows "(AUTO)"
on width and headlands, "AUTOMATIC" on direction, "0.0 M (AUTO)" on the
offset at 0.

What the dialog holds (spike 0.0.19, `userSettings.settings`, one list per
mode, `[1]` the AI worker and `[2]` Steering Assist, an entry per row, each
with `value`, and where it has one `defaultValue`, `min`, `max`, `step`,
and `setting` with the row's `identifier`, `title` and texts):

| Row (Steering Assist) | `identifier` | `value` | Range and step | Auto |
|---|---|---|---|---|
| Working Width | `implementWidth` | tenths of a metre (50) | 5 to 600 (0.5 to 60 m), step 1 (0.1 m) | `value == defaultValue` (the tool's) |
| Number of Headlands | `numHeadlands` | a count | 1 to 4 (the worker's 2 to 4), step 1 | `value == defaultValue` |
| Work Direction | `workDirection` | degrees, from `setting.textMapping` | 37 choices: −57.2958 (Automatic, −1 rad; −57 once saved), then 0° to 175° in 5° steps | the first choice: the builder picks the angle per field |
| Side Offset | `sideOffset` | metres | −5 to 5, step 0.1 | `value == defaultValue` (0) |
| Show Lines | `showLines` | boolean (`loadedValue` from the save) | | |
| Cruise Control Deactivation | `cruiseControl` | boolean, false Manual, true Automatic | | |

The AI worker's list has its own width, headlands and direction, then
`workHeadlands`, `headlandFirst` and `skipNumLines`. `fieldCourseSettings`
holds **the selected mode's** values, applied by the dialog's OK (the
worker's 90° became 1.5708 rad in AI worker mode, Steering Assist's Auto
−0.99484 back in its mode); the save keeps both lists (`settings` ›
`worker` and `steering_assist`) and reloads them. The AI worker dialog's own rows
(Work the Headlands, Start with, Skip Lines) are `workHeadlands`,
`headlandsFirst` and `skipNumLines` (its screenshot against the dumps);
not set here. The AI worker
mode's dump held the same `fieldCourseSettings` values as the Steering
Assist dumps (the Mach 4R and Terria, 2026-11-19).

Game API names, all **unverified** unless marked:

| Name | Where from | State |
|---|---|---|
| `spec_aiModeSelection.fieldCourseSettings` and its plain fields (above) | spike 0.0.15's `csParts` (`mod/tests/fixtures/spike0020/`); spikes 0.0.18–19 | seen: the selected mode's (spike 0.0.19) |
| `setAIModeSelection(aiMode)`: sends its own event | AIModeSelection.lua:294-314 | seen (spike 0.0.19): the mode changes on the frame; to AI worker the course goes, to Steering Assist the game builds a new one (187 ms); it does **not** apply the new mode's choices onto `fieldCourseSettings` (the worker's 90° stayed Steering Assist's Auto) |
| `getIsAutomaticSteeringAllowed()`: whether a tool allows steering (the dialog's guard; the game puts the mode back to AI worker otherwise); each tool's `getImplementAllowAutomaticSteering()` returns a constant or reads its work areas' types | AIAutomaticSteering.lua:629-645; AIImplement.lua:761, WorkArea.lua:693, Combine.lua:1886, TreePlanter.lua:958 | seen (spike 0.0.19): true with the LEMKEN (the cultivator's own true), false in the Arocs 4133 |
| `aiModeSettingsChanged(aiMode, fieldCourseSettings)`: the dialog's own OK, on a clone of the game's settings; it stores the clone, sends `AIModeSelectionSettingsEvent`, calls `setAIModeSelection(aiMode)` and raises `onAIModeSettingsChanged`, and doesn't touch `userSettings` (the dialog changes those itself) | AIModeSelection.lua:249, 324-333 | unverified |
| `spec_aiModeSelection.userSettings` (class `AIUserSettings`: `new(fieldCourseSettings)`, `reinitialize(fieldCourseSettings, bool)`, `apply(fieldCourseSettings, mode)`, `saveToXML`, `loadFromXML`): what the player chose, per mode (the save's `settings`), applied onto `fieldCourseSettings`; nil after any attach or detach until H is held or a save loads (`onStateChange`), which may be why spike 0.0.15 didn't see it | AIModeSelection.lua:100-127, 155-180, 205-210, 224-249, 337-350; the class itself is not in the archive (nor any global named AI…Setting…, spike 0.0.19) | fields seen (spike 0.0.19, the table above); its methods **unverified** |
| `FieldCourseSettings.generate(rootVehicle)`: the tool's own settings, the Auto values; the game calls it when there are none | AIModeSelection.lua:231-233, 367 | never called by the mod |
| `AISettingsDialog.show(userSettings, fieldCourseSettings:clone(), vehicle, mode, fieldX, fieldZ, callback)`: the dialog gets the game's own `userSettings` (not a copy) and a clone of the course settings; its Reset is in the dialog's code | AIModeSelection.lua:249; the dialog is not in the archive | unverified |
| `g_fieldCourseManager:generateFieldCourseAtWorldPos(x, z, fieldCourseSettings, callback)`: the game's course builder; the course comes back later to `callback(_, course)`, nil if none; Steering Assist then wraps it (`SteeringFieldCourse.new(course)`) and sets it on the vehicle, which the preview never does. It builds one at a time per vehicle (`fieldCourseDetectionInProgress`, a pending one queued) | AIAutomaticSteering.lua:738-776; AIDriveStrategyFieldCourse.lua (the AI worker, the same call); the manager is not in the archive | **unknown: the spike** (that it leaves the vehicle alone, how long it takes, two at once) |
| the dialog's own preview (the map beside its settings) | not in the archive; likely the same builder | unverified |
| `GameSettings.SETTING.STEERING_ASSIST_LINES` = `"steeringAssistLines"`, a game setting for every vehicle, read raw from `g_gameSettings`; the key `TOGGLE_AI_STEERING_LINES` flips it with `g_gameSettings:setValue(…, not value, true)` (seen: active, `displayIsVisible` false, spike 0.0.15) | AIAutomaticSteering.lua:895, 922-925; spike 0.0.18 | read: seen (spike 0.0.18); the key: unverified |
| `GameSettings.SETTING.STEERING_ASSIST_CRUISE_CONTROL` = `"steeringAssistCruiseControl"`, a game setting (true = Automatic) that each vehicle copies when you get in and when it changes (`registerVehicleSetting`); set with `g_gameSettings:setValue`, as the lines key does | AIAutomaticSteering.lua:157, 407; VehicleSettings.lua:96-170; spike 0.0.18 | read: seen (spike 0.0.18); `setValue` for cruise: unverified |

Never called: `setAIModeFieldCourseSettings` (the receiving end of the
game's network event), a settings object the mod builds itself,
`FieldCourseSettings.generate`, `getAttacherToolWorkingWidth`,
`setAIAutomaticSteeringCourse` with a preview.

## Commands

The game has no keys for these settings, only its dialog. So this is the
second exception to "the game's keys, not its setters", beside spec 0019's
contracts (Vincent, 2026-11-17), and the paragraph in ARCHITECTURE.md
names it. Like 0019, it runs the game's own checks first, changes only
through the game's own functions, and answers ok only once the game reads
the change back. It is host only until checked on a multiplayer client.

- **`steering.mode.set`**, value 0 (AI worker) or 1 (Steering Assist),
  mapped to `AIModeSelection.MODE.WORKER` and `.STEERING_ASSIST` read at
  run time (1 and 2 today): a set. Steering Assist needs
  `getIsAutomaticSteeringAllowed()` (else refused "no tool allows
  steering"). `setAIModeSelection`; ok when `currentMode` reads it back.
- **`steering.settings.apply`**, with the changed values in a new
  `settings` attribute (width, headlands, direction, offset, Auto per
  setting): in Steering Assist mode, on a field the farm may work,
  steering off. The game's own clone, changed, through
  `aiModeSettingsChanged`; the saved settings object changed too, the way
  the dialog does, once the spike shows how. Ok when the game's settings
  and the new course read back the values. This needs the attribute in
  `mod/src/Commands.lua`, `companion/server.py` and
  `companion/commands.py`.
- **`steering.lines.set`** and **`steering.cruiseOff.set`**, value 0 or 1,
  game-wide (the game's settings, every vehicle): show lines through the
  game's own key, `TOGGLE_AI_STEERING_LINES`, pressed only when the
  setting differs; cruise through `g_gameSettings:setValue`, the way the
  lines key sets its own (the game has no key for cruise). Ok when
  `g_gameSettings` reads the value back.
- **`steering.settings.preview`**, with the panel's values in the same
  `settings` attribute: in Steering Assist mode, on a field the farm may
  work, steering off. A clone of the game's course settings, changed, to
  `generateFieldCourseAtWorldPos` at the vehicle's position; one build at
  a time, the newest settings waiting behind it (as the game does), older
  ones dropped. Ok once the game has answered (a course or none), with the
  result in `steering_preview`. It changes nothing the game keeps.
- **`hello.commands.actions`** goes to 7.

## Plan

1. **Spikes, one new call per session,** after each: drive, steer, save,
   reload and open the game's dialog to compare (the brainstorm's probe 6).
   Reads first, as always (plain fields, `pairs` and `rawget`):
   - **the preview first** (it decides the layout): a clone of the course
     settings with the direction changed, to
     `generateFieldCourseAtWorldPos`; the callback dumps the course's
     segments and times the build; before and after, the vehicle's own
     course, `fieldCourseDetectionInProgress` and settings must be
     unchanged; then two builds at once, and one while steering;
   - a dump of all of `spec_aiModeSelection` and `spec_aiAutomaticSteering`
     with every table followed one level deeper than 0.0.15 did, in both
     modes, on Auto and with set values, before and after a change in the
     game's dialog: where the worker's settings are kept apart, where show
     lines and cruise live, and what Auto reads after a reload
     (question 5);
   - `getIsAutomaticSteeringAllowed`, then `setAIModeSelection`;
   - the cruise setting's setter; show lines through the key;
   - `aiModeSettingsChanged` with one value changed (direction first);
   - then a multiplayer client.
   A dump that disagrees with the Data contract sends the spec back for
   approval.
2. **The panel on the GPS canvas** (done: approved 2026-11-24), at both sizes, day and night,
   approved before code.
3. `mod/src/Api.lua` (the calls, guarded), `mod/src/state/Steering.lua`
   (the settings, `canAssist`), `mod/src/Commands.lua`, the companion's
   `settings` attribute, `mod/modDesc.xml` 0.23.0 and its description (the
   mod now changes what the game saves).
4. `web/src/types.js`, the panel, `theme.css`.
5. `docs/ARCHITECTURE.md`: the second exception.
6. **Risks:** a settings object written wrongly could fail later in the
   game's own save or network code, outside our guards (the brainstorm's
   B2); that is why only the game's own clone and commit are used, one
   setting at a time, and each spike ends with a save and a reload. A
   getter we can't read may change state (spec 0018's freeze), so the
   spikes call only the functions named above, one per session.

## Acceptance

Automated (to be filled in after the spikes):
- [ ] `mod/tests/run.lua`: `cab.steering.settings` from the spike's dumps,
  Auto and set; `steering.mode.set` refused without a tool that allows it;
  `steering.settings.apply` refused in AI worker mode, off the field and
  while steering; ok only on read-back.
- [ ] `mod/tests/run.lua`: `steering.settings.preview` builds with a clone
  and never sets the vehicle's course; newest wins; `steering_preview`
  `building`, `ready`, `none`, cleared on Apply.
- [ ] `companion/tests`: the `settings` attribute passes through;
  `steering_preview` kept as the latest.
- [ ] `web/test.html`: each row's Auto and set values, −/+, back to Auto,
  Apply's pending, ok and "Failed"; Reset puts the four course rows to
  Auto and leaves Show lines and Cruise; the faded rows and their words;
  the preview drawn from a fixture, "Building the preview…", "No lanes
  with these settings", back to the game's course when the settings
  return.
- [ ] Replay in the browser pane at 1158×676 and 1180×820, day and night.

Live check (Solek, mod 0.23.0):
- [ ] Each setting set from the dashboard: the game's dialog shows the
  same, and the lanes move as they should.
- [ ] The preview: each change shows lanes that match the game's dialog
  preview for the same settings, and the course after Apply; the
  vehicle's course doesn't change before Apply.
- [ ] Back to Auto from the dashboard: the dialog shows Auto.
- [ ] Reset and Apply from the dashboard: the dialog shows the four
  course rows on Auto, Show lines and Cruise as they were.
- [ ] Rehitch: the panel shows Auto.
- [ ] The offset left and right: the lanes move to the side the panel
  says.
- [ ] Two tractors: a change on one leaves the other's settings.
- [ ] Save and reload: the settings stay, Auto included.
- [ ] In AI worker mode, off the field and while steering: faded, with
  the words.
- [ ] A tool that doesn't allow steering: the Mode row's Steering Assist
  faded.
- [ ] With H's hold never used, and with the lines key unbound.
- [ ] Precision Farming on and off.

## Decisions

- **The game's setters are allowed here** (Vincent, 2026-11-17): every
  setting must be controlled from the dashboard.
- **One Apply,** like the dialog's OK, so the game builds one course per
  change, not one per tap.
- **A preview before Apply,** like the dialog's map (Vincent,
  2026-11-23), built by the game's own course builder and never given to
  the vehicle; dropped if the spike shows the builder isn't safe.
- **The mode is here,** with the dialog's other settings (moved from
  spec 0020).
- **Steps** (Vincent, 2026-11-23): width ±0.1 m and ±1 m. Direction ±5°
  only, the game's own choices (Vincent, 2026-11-24: its dialog has no
  other angles; was ±1° and ±5°). No number pad, no "along my heading"
  button.
- **Per vehicle** (Vincent, 2026-11-23): the dialog's course settings
  and mode belong to the vehicle; a command changes the controlled
  vehicle's only. **Show lines and Cruise are game-wide** (Vincent,
  2026-11-24, after spike 0.0.18 showed the dialog changes the game's
  settings): the panel sets them as the game does, for every vehicle.
- **The offset's side** (Vincent, tested 2026-11-23): − is left, + is
  right.
- **Only the selected mode's settings** (Vincent, 2026-11-23): in AI
  worker mode the Steering Assist rows can't be set.
- **Reset** as the dialog's (Vincent, 2026-11-23): the four course rows to
  Auto, Show lines and Cruise untouched.

## Out of scope / open questions

1. The AI worker's own settings (Work the Headlands, Start with, Skip
   Lines, and its width, headlands and direction): not here; PLAN.md's AI
   worker item.
2. ~~**Where the two modes' settings are kept apart:**~~ answered
   2026-11-24 (spike 0.0.19): `userSettings` keeps both lists;
   `fieldCourseSettings` is the selected mode's. A mode set with
   `setAIModeSelection` alone keeps the old mode's values there, so the
   dashboard's mode change must apply the new mode's choices as the
   dialog's OK does (a spike call: `userSettings:apply`).
3. ~~**Show lines' key:**~~ answered 2026-11-24 (spike 0.0.18): the dialog
   changes the game's setting, every vehicle; so does the key. The save
   still writes it per vehicle; the game reads the game's. Game-wide
   (Vincent).
4. **AI worker rows on this panel later?** With the worker's own spec,
   the panel may show the selected mode's rows (Vincent: only the
   selected mode's settings are set).
5. ~~**Auto after a reload:**~~ answered 2026-11-24: the dialog says
   Automatic; `userSettings` holds −57 (Auto), `fieldCourseSettings`
   −0.99484 rad. The panel reads Auto from `userSettings`.
6. ~~**How the dialog builds its preview:**~~ answered 2026-11-24 (spike
   0.0.18): 150 to 340 ms a build here.
7. ~~**The direction's steps:**~~ answered 2026-11-24 (Vincent): 5° only,
   as the game's dialog (0° to 175° and Automatic).

## Log

- 2026-11-17: drafted from the egm brainstorm (concepts_brief.md) and three
  of Vincent's Solek saves, which gave the settings' names and units.
  Vincent: direction is an angle in degrees, headlands are rounds before
  the lanes, width is Auto from the tool or set in 0.1 m steps, offset is
  for tools not centred; set up only on a field the farm may work.
- 2026-11-23: brought up to date with specs 0020 and 0021 (both
  live-checked): spike 0.0.15's dumps already hold the settings in memory
  as plain fields in `spec_aiModeSelection.fieldCourseSettings`, the same
  values in AI worker and Steering Assist mode; the mode's numbers come
  from `AIModeSelection.MODE` (verified); the course's `implementWidth` is
  verified; `onField` is fresh only in Steering Assist mode, so the rows
  are proposed live only in that mode; the Mode row fades Steering Assist
  without a tool that allows it (`canAssist`); "Start with" added from
  Vincent's dialog. Open questions 5 to 7 added; the Plan's first spike
  narrowed to what the dumps don't show. Waiting for the dialog's
  screenshot and Vincent's answers, then the canvas.
- 2026-11-23: Vincent's two screenshots of the AI Settings dialog. With
  Steering Assist: Working Width, Number of Headlands, Work Direction,
  Side Offset (no Auto: "-0.5 M"), Show Lines, Cruise Control
  Deactivation; "Start with" is the AI worker's (with Work the Headlands
  and Skip Lines), so it left this spec. His answers: width ±0.1 and
  ±1 m, direction ±1° and ±5°; settings per vehicle (tested on two
  tractors on two fields); − offset is left, + right (tested); only the
  selected mode's settings are set. Decisions updated; open questions now
  the Reset button, the spike's three and the worker's rows later.
- 2026-11-23: the offset has Auto at 0 (Vincent's screenshot: "0.0 M
  (AUTO)"). Vincent wants the dialog's Reset: added. The game's
  AIModeSelection.lua read for it: the dialog and `AIUserSettings` aren't
  in the archive, so Reset's code can't be read (open question 1, a check
  in the game); the code shows `userSettings` (what the player chose, per
  mode, nil after any hitch), `FieldCourseSettings.generate` (the Auto
  values) and that `aiModeSettingsChanged` leaves `userSettings` to the
  dialog (the Data contract table).
- 2026-11-23: Vincent checked the dialog's Reset: width, headlands,
  direction and offset go back to Auto; Show lines and Cruise stay. Back
  just closes the dialog. Behaviour and Decisions updated; the Reset
  question closed (the others renumbered).
- 2026-11-23: the panel drawn on the GPS canvas (version 25): an interactive
  board (Settings, every state as a Tweak) and nine more at 1180×820 and
  1158×676, day and night (as the game holds them, two changes waiting,
  Applying…, Failed, lanes done, steering, off the field, AI worker mode,
  no tool, closed). Choices for Vincent, not in Behaviour until he says
  so: the mode sets at once (its own command), the rest waits for Apply;
  "Set up" top right on the field card; Cruise control as the game's
  Manual / Automatic; a dial for the direction (north up, not checked)
  and a tool-beside-the-lane drawing for the offset; leaving Auto, the
  direction starts from the course's angle.
- 2026-11-23: Vincent asked for the course preview the game's dialog has.
  The game's code (AIAutomaticSteering.lua:738-776) builds a course with
  `g_fieldCourseManager:generateFieldCourseAtWorldPos` and only then sets
  it on the vehicle, so the mod can ask for a preview without setting it.
  Added: the preview in Behaviour, the `steering_preview` topic, the
  `steering.settings.preview` command (actions 7), the builder in the
  API table (unknown until the spike), the preview as the first spike,
  its tests and live check. The panel moves to the left, the field to its
  right as the preview, as the dialog.
- 2026-11-23: the canvas redrawn (version 26): the settings on the left,
  the field on the right as the preview (tinted lanes, "Preview · not
  applied", "Building the preview…" over the game's course dimmed, "No
  lanes with these settings"), a Building board and the preview drawing
  alone. The preview's lanes on the canvas are a sketch on field 7's real
  outline; in the app they are the game builder's. The counts over the
  field hide while the panel is open (a choice for Vincent).
- 2026-11-24: Vincent: the preview must be as big as the GPS field, the
  settings over the Drive column. Canvas revision 2 (version 30): Set up
  turns the Drive column into the settings column (rows that open to their
  steps, Reset and Apply at its foot), the field unchanged as the
  preview, the counts quiet while a preview shows; the direction dial and
  offset drawing dropped (the preview shows both). Fits the mini at 44 px
  rows. Behaviour's first bullet updated; the canvas's note n8 has
  Vincent's five calls (no Drive column while open, Close drops changes,
  Mode at once, one row open, Cruise words).
- 2026-11-24: canvas approved by Vincent ("looks perfect!"), with the
  choices it draws: no Drive column while Set up is open, Close drops
  what wasn't applied, Mode at once, one row open at a time, Cruise in the
  game's words, the preview's look. Behaviour updated. Next: Vincent's
  approval of the spec, then the build, starting with the preview spike.
- 2026-11-24: approved by Vincent. Next: the build, starting with the
  preview spike (Plan, step 1); a dump that disagrees with the Data
  contract sends it back for approval.
- 2026-11-24: spike 0.0.18 written for the Plan's step 1, the preview
  and the deep dump in one session (the dump only reads). `csPreview`
  asks `generateFieldCourseAtWorldPos` for a course with a clone of the
  vehicle's settings, from `update`. Its callback only stores what it got.
  The spike never calls `SteeringFieldCourse.new` and never writes the
  game's flags. It reads the vehicle's course, flags and settings and the
  builder's fields before, at the answer and after. The runs: the clone
  unchanged (it must match the game's own course point for point), a
  changed direction, two at once, one during the game's own build, one
  while steering, and field 6 for the time. `csSettings` dumps both parts
  three levels down, the vehicle's settings and the game settings for
  lines and cruise. Also read in the game's scripts: Show lines' key
  flips a game setting (`g_gameSettings`, every vehicle,
  AIAutomaticSteering.lua:922-925), and cruise at the lane end reads a
  vehicle setting that copies the game setting when you get in
  (VehicleSettings.lua:96-170). Offline tests:
  `mod/tests/test_spike_preview.py`. The steps are in
  `research/spike/README.md`; waiting for Vincent's files.
- 2026-11-24: spike 0.0.18 run on Solek, field 119: the Fendt 728 Vario
  with the LEMKEN Smaragd 9/500K (5 m) and a front weight. The dumps are
  in `mod/tests/fixtures/spike0022/`.
  **The preview is safe** (Plan step 1's first bullet). The builder always
  answers on a later frame, never in the call: 150 to 170 ms for one
  build. Two at once are queued (`pendingFieldCourseGenerators`) and
  answered in turn (152 and 339 ms). One sent while the game built its
  own course, after OK in the dialog, came 312 ms later; the game's own
  course was built and Steering worked. One sent while steering left
  steering on, on the same segment. In every run the vehicle's course,
  `lastActiveSteeringFieldCourse`, settings and flags stayed the same
  tables and values, and the builder kept no copy. The unchanged clone
  gave the game's own course point for point (42 segments). The 45° clone
  gave exactly the course the game built when Vincent set 45° in its
  dialog (55 segments). A built course is about 13 KB as JSON and carries
  its settings (`courseField.fieldCourseSettings`).
  **The settings:**
  - Each dialog row is a plain field of
    `spec_aiModeSelection.fieldCourseSettings`: width in metres, headlands
    a count, direction in radians, offset in metres.
  - Reset brought back exactly the Auto values.
  - In AI worker mode the Steering Assist course goes, and the settings
    read the same (both modes were on Auto).
  - **Show lines and Cruise are game-wide:** the dialog changed
    `g_gameSettings`' `steeringAssistLines` and
    `steeringAssistCruiseControl`, and the vehicle's cruise setting
    followed. This disagrees with Behaviour's "per vehicle" and the
    Decisions, so it goes to Vincent before the build.
  - `userSettings.settings` holds one list per mode, six entries each,
    and is there after a save loads. The dump stopped one level above
    the entries, so the next spike goes deeper.
  **Question 5, answered:**
  - A set 135° came back after a reload as 135°.
  - Auto is saved as −57 (the save's degrees) and comes back as
    −0.99484 rad, yet the dialog shows Automatic. So "Auto" is likely any
    negative direction (inferred), not −1 exactly.
  - Width and headlands on Auto are saved as plain values (50 tenths, 2),
    so how the dialog tells Auto from a set 5.0 m is in `userSettings`:
    the next spike.

  **Question 6, answered:** builds take 150 to 340 ms here, so half a
  second after the last tap is enough. The field 6 run was skipped.
- 2026-11-24: Vincent: Show lines and Cruise game-wide, as the game does.
  Behaviour, the Data contract (read from `g_gameSettings`), Commands (the
  lines key, cruise through `g_gameSettings:setValue`), Decisions and
  open question 3 updated. Still the spec as approved otherwise. Next
  spike (0.0.19, a game restart): `userSettings.settings` deeper (how the
  dialog tells Auto from a set value, open question 2), then the Plan's
  calls one per session: `getIsAutomaticSteeringAllowed`,
  `setAIModeSelection`, cruise's `setValue`, `aiModeSettingsChanged`.
- 2026-11-24: spike 0.0.19 written for the next session (Plan step 1's
  second and third bullets). `csSettings` dumps `userSettings` whole, with
  each table's class and methods, and the game's AI settings classes by
  name. Nothing in them is called. `csAllowed` calls
  `getIsAutomaticSteeringAllowed` and each tool's
  `getImplementAllowAutomaticSteering` (plain reads in the game's
  scripts). `csMode` calls `setAIModeSelection`, the session's new call,
  and records 3 s of changes. The steps are in `research/spike/README.md`.
- 2026-11-24: spike 0.0.19 run on Solek, field 119 (the Fendt 728 and the
  LEMKEN), and the Arocs 4133; dumps in `mod/tests/fixtures/spike0022/`.
  `userSettings` holds the dialog's rows, one list per mode, an entry per
  row with its value, default, range and texts (the Data contract's new
  table). Auto is the value equal to the tool's default: no flag; the direction's
  Auto is −57, the builder's own angle per field (30° on field 119, 77° on
  field 7), and its other choices are 0° to 175° in 5° steps (open
  question 7). `fieldCourseSettings` is the selected mode's, applied by
  the dialog's OK (open question 2). `getIsAutomaticSteeringAllowed`:
  true with the cultivator, false in the Arocs. `setAIModeSelection`
  switched both ways (the course gone, then rebuilt in 187 ms) but left
  the old mode's values in `fieldCourseSettings`: the mode command must
  also apply the new mode's choices. Save and reload kept both modes'
  choices and the mode.
- 2026-11-24: Vincent: the direction in the game's 5° steps only (open
  question 7); Behaviour and Decisions updated. Auto told apart in the Data
  contract: the tool's value for width, headlands and offset, the game's
  own angle per field for the direction.
- 2026-11-24: spike 0.0.20 written (the Plan's last single-player bullets).
  The game saves `userSettings` (`saveToXML`, AIModeSelection.lua:120-126),
  so Apply has to change the dialog's own entries. `csApply` sets them,
  applies the mode's entries onto a clone (`userSettings:apply`) and
  commits with `aiModeSettingsChanged`. It also does Reset and the mode
  with the new mode's own choices, and has a dry run that only applies.
  `csCruise` uses `g_gameSettings:setValue`; `csLines` presses the game's
  key. Three game sessions, one new call each.
