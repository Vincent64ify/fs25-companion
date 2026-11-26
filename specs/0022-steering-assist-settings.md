# 0022: Steering Assist settings from the dashboard

Status: live-checked (revisions 2 and 3 too)
Mod: 0.23.1 (revision 2; 0.23.0 before) · Started: 2026-11-17 · Design: the "Steering Assist settings" row on the GPS canvas, approved 2026-11-24 (version 30) (`FS25 Companion: GPS`, https://claude.ai/artifact/45ruF2v1hH49JJi4HyRTeM, board `Settings`), drawn 2026-11-23, redrawn 2026-11-24; the brainstorm's brief, `concepts_brief.md`, is in git history (commit b0cffeb)

## Goal

The third GPS spec, after [0020](0020-steering-assist-state.md) and
[0021](0021-gps-screen.md).

Set up the game's Steering Assist without the game's dialog (holding H):
every setting of its AI Settings dialog from the GPS screen. With Steering
Assist selected the dialog has seven (Vincent's screenshot, 2026-11-23):
the mode, Working Width, Number of Headlands, Work Direction, Side Offset,
Show Lines, and Cruise Control Deactivation, then Reset, Back and OK.
Vincent changes all of them, field by field and tool by tool.

## Revision 2: the game's dialog left with Back

Drafted 2026-11-25 after the live check (open questions 9 and 10);
Vincent approved choice A the same day, built the same day (mod 0.23.1
and the web); Behaviour and the Data contract below say the same. No new
design board: it reuses the row's sub-line ("was Auto · 5.0 m").

**Why.** The game's dialog writes each row into its entries
(`userSettings`) as you step it, and Back keeps them; only OK builds a
course. The mod reads the entries, so after a Back:
- the panel shows the dialog's values as the game's while the lanes are
  still the old ones (live check: width 6.0 m on a 5 m course);
- an Apply sends only the rows the draft changed, and the mod applies the
  whole entry list, so **a value left in the dialog is committed with an
  unrelated Apply** (headlands 3 left behind, then Apply a width: the
  course gets 3 headlands too). Not seen live, but it follows from
  `applyAttr` and `userSettings:apply`.
- (question 10) in AI worker mode or before a vehicle has settings, Show
  lines and Cruise show "–", though they're the game's, every vehicle's.

**Choice A (approved): the lanes' settings, and the dialog's beside them.**
- The mod keeps, per vehicle, the entries as they were when the game
  built the course it has (taken when it first sees a new course table,
  `courseKey`). `cab.steering.settings` sends those: what the lanes are.
- When the entries now differ, `cab.steering.dialog` (new, the same
  shape, only the rows that differ) says what the game's dialog holds
  without OK.
- The panel shows the lanes' values. A row the dialog changed says so on
  its sub-line in the warn colour: "Dialog: 6.0 m" (built shorter than
  drafted, "6.0 m in the game's dialog, not applied", which didn't fit
  beside the value and its AUTO tag at 1180 wide). No other change:
  tapping it is the normal −/+.
- **Apply** puts every course row's entry back to the lanes' value first,
  then sets the draft's rows, applies and commits. A dialog leftover is
  never committed by the dashboard; the dialog then shows what the
  dashboard applied. Reset the same, all four to Auto. After the mod's
  own commit (Apply, Reset, the mode) the entries count as the lanes'
  until the game's next course table, so its own change is no leftover.
- The preview builds from the lanes' settings with the draft over them
  (it already builds on a clone of the course's settings: unchanged).
- Limit: if the mod first sees a vehicle after a Back, it takes the
  leftovers as the lanes' settings (the mod can't read what built the
  course for Auto's direction: −57 in the entry, the field's own angle in
  radians in the course). Loading a save or getting in is the usual first
  sight, and a dialog OK puts it right. A course the game kept and takes
  back keeps the settings it was first seen with.

**Choice B (not chosen): compare with the course directly.** The mod reads
`fieldCourseSettings` (metres, headlands, radians, offset) and calls a row
changed in the dialog where it differs from the entry. No memory kept,
right even on first sight, but Auto's direction can't be compared (the
field's angle in radians against −57), so a direction left on Auto or set
to the field's own angle is missed.

**Not chosen: the mod puts the entries back by itself** after a Back. It
would change what the game's own dialog shows without a press on the
dashboard (the mod acts only on commands).

**Question 10 (either choice):** `cab.steering` gains `showLines` and
`cruiseOff` at its top, sent whenever the game has the settings
(`g_gameSettings`, every vehicle); `settings` keeps them too (Protocol
v1). The two rows show the game's value; in AI worker mode they still
fade, as now.

**Tests** (the automated ones are in Acceptance, ticked).
- `mod/tests/run.lua`: the lanes' settings kept per course table; a
  changed entry with the same course gives `dialog` with that row only;
  a new course table takes the entries again; Apply puts the leftovers
  back before the draft's rows (headlands 3 left, width applied: the
  committed clone has the lanes' headlands); Reset the same;
  `showLines` and `cruiseOff` without `settings`.
- `companion/tests`: `dialog` and the two top fields passed through.
- `web/test.html`: the sub-line on a dialog-changed row, the draft and
  Apply against the lanes' values; Show lines and Cruise from the top
  fields.
- Live: change a row in the game's dialog and Back; the panel shows the
  lanes' value with the dialog's note; Apply another row; the dialog and
  the lanes have only the dashboard's change. A dialog OK clears the note.

## Revision 3: every setting at a glance

Drafted 2026-11-26 from Vincent's note: changing the settings must be
quicker than in the game, or the dashboard loses its point; opening each
row one by one is too slow. Drawn on the GPS canvas's "Every setting at
a glance" row (version 32, redrawn after his comments up to version 38),
approved by Vincent the same day and built the same day; Behaviour below
says the same. The recall per tool isn't in it (PLAN.md). Web only, no
mod change.

**Why.** Today a row opens its steps under it, one row at a time: a
width, a headland and a direction is tap, step, tap, step, tap, step,
Apply. In the game it's hold H, step, step, step, OK.

**Behaviour** (compact, after Vincent's canvas comment, 2026-11-26: "it's
cramped up"; a grouped list like a phone's settings, with nudge buttons
like the guidance terminals').
- **Mode:** a slim two-way switch at the top (36 px), AI worker |
  Steering Assist; it sets at once, as today, the choice tapped saying
  "Switching…" until the answer. Without a tool that allows it, Steering
  Assist fades and the reason at the foot says why (no line of its own:
  the mini's list has no height to spare).
- **Lanes:** one card, one line a setting, hairlines between. Each line
  has the name ("Width", "Headlands", "Direction", "Offset"; "Width · was
  6.0 m" while changed, "Applying…" while applying, the dialog's note as
  today), the value under it (in blue while changed, not applied: Vincent, 2026-11-26, blue text rather than a ring; day the on blue #0C4DB8, night a new stronger blue #7AA7F5, 6.4 : 1 on the row and apart from the white values), an AUTO tag on Auto
  or a small Auto chip outlined in that blue beside a set value, so it
  reads as a button (one tap back to Auto), and
  the steps in a small well on the right: width −1, −.1, +.1, +1;
  headlands −, +; direction −5°, +5°; offset ←, →. One tap a step.
- **Every vehicle:** a second card, Show lines Off | On and Cruise control
  Manual | Automatic.
- **Show lines and Cruise set at once,** like Mode (proposed; today they
  wait for Apply): they build no course, and their commands are their own
  already (`steering.lines.set`, `steering.cruiseOff.set`). Apply is then
  only the four course rows, as the game builds the lanes once. A tapped
  choice breathes until the game has it, and its switch rings in the
  alarm colour ("Failed") when the game doesn't take it.
- **What stays:** the preview after half a second, Reset, Apply, Close.
  Locked rows fade with their card and keep their place; the reason
  ("Steering is on", "Drive onto a field you may work", "Switch to
  Steering Assist") takes Reset and Apply's place at the foot, since
  neither can do anything then.
- **The width on two lines:** its name and value across the top, its
  four steps across the whole row, so nothing crowds its value.
- **Uses the column's height** and fits without scrolling at 1158 × 676
  in the Drive column's width (268 px): steps 48 px at 1180 × 820, 40 to
  42 px on the mini, where the list is full (checked in a browser at
  268 px wide, day and night). The Auto chip is small, its hit area
  larger.

**A question beside it: a recall per tool.** After every hitch the game
puts the settings back to Auto (Behaviour, "After hitching"), so the same
tool on the next field needs its width, headlands and offset again. A
button on the field under the tag, "As last time with the LEMKEN Smaragd: 5.0 m · 2 headlands · 0.3 m
right", one tap to put them in the draft (the direction stays: it's the
field's). Kept in the browser per tool name. Not in this revision unless
Vincent wants it here; else PLAN.md.

**Tests:** `web/test.html`'s settings checks that open a row first lose
that tap; new: every row's steps are there without a tap; a step changes
the draft at once; Show lines and Cruise send their command on the tap,
not on Apply; Apply counts only course rows; the column's list doesn't
scroll at 1158 × 676 (the pane).

## Behaviour

- **A settings column,** opened by Set up on the GPS screen's field card
  (Vincent, 2026-11-24): it takes the Drive column's place, so the field
  keeps its place and size and shows the preview (below) while you
  adjust. Every setting open, as the game holds it, never a copy
  (revision 3: a grouped list, a slim Mode switch, the four lane rows one
  line each with their steps in a small well, Show lines and Cruise in
  their own group; one tap a step). Close (where Set up was) drops what
  wasn't applied, as the game's Back, and brings the Drive column back:
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
    after spike 0.0.19), and one tap back to Auto. Leaving Auto, the steps
    start from the angle the game's lanes run at (to the nearest 5°), and
    175° steps on to 0° (a lane has no way round).
  - **Side offset:** for tools not centred on the lane (a plough, a
    trailed potato harvester); "Auto · 0 m" (the dialog's "0.0 M (AUTO)")
    or metres to one side, "0.5 m left" (the game's −) or "0.5 m right"
    (+) (Vincent tested it, 2026-11-23); −/+ in 0.1 m steps, and one tap
    back to Auto.
  - **Show lines:** On or Off, set at once (revision 3).
  - **Cruise control:** Manual or Automatic, the game's words for its
    "Cruise Control Deactivation" (off at the lane end), set at once
    (revision 3).
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
- **Apply,** like the dialog's OK: the panel holds the lane rows' changes
  until Apply, so the game builds the course once (Show lines and Cruise
  set at once since revision 3). The rows show "Applying…" until the
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
  tool; the panel shows that. It drops the dialog's settings until H is
  held, and on a detach that leaves no tool that allows steering it
  switches to AI worker mode (spike 0.0.21). No step in the game is
  needed (Vincent, 2026-11-24): the mod makes the settings the way holding
  H does, whenever a command needs them, and the Mode row brings Steering
  Assist back.
- **Changed in the game's dialog and left with Back** (revision 2): the
  dialog writes each row into its entries as you step it, and Back
  doesn't undo that; only OK builds a course. The panel shows the lanes'
  settings (the entries as they were when the game built this course),
  and a row the dialog holds otherwise says "Dialog: 6.0 m" under its
  name in the warn colour. Apply and Reset put such rows back to the
  lanes' values before the panel's changes, so the dashboard never
  commits a leftover.
- **Show lines and Cruise** show the game's value even before a vehicle
  has settings (revision 2); in AI worker mode they fade with the rest.
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
  - `settings`: `width` {`m`, `auto`, `min`, `max`}, `headlands`
    {`count`, `auto`, `min`, `max`}, `direction` {`deg`, `auto`} (no `deg`
    on Auto), `offset` {`m`, `auto`, `min`, `max`} (− left, + right),
    `showLines`, `cruiseOff` (Automatic: cruise off at the lane end), and
    `made` (false after a hitch, before the mod made the dialog's settings:
    then the course's own settings, all Auto); the ranges are the dialog's
    (`min` and `max` of its entries); Steering Assist's rows in either
    mode; absent until the game has settings for this vehicle; read from plain
    fields, never filled in by calling the game's width getter or course
    builder. `showLines` and `cruiseOff` are the game's
    (`g_gameSettings`' `steeringAssistLines` and
    `steeringAssistCruiseControl`), the same in every vehicle's message;
  - `canAssist` (boolean): whether a tool here allows Steering Assist, for
    the Mode row's fade: `getIsAutomaticSteeringAllowed`, plain reads in
    the game's scripts (spike 0.0.19).
  - Revision 2 (mod 0.23.1): `settings`' course rows are the lanes': the
    entries as they were when the mod first saw this course table (after
    its own commit, the entries until the next course). `dialog`, the
    same shape with only the course rows the entries hold otherwise
    (changed in the game's dialog, left with Back); absent when none.
    `showLines` and `cruiseOff` also at `cab.steering`'s top, sent with or
    without `settings`.
- **Mod → companion, a new topic `steering_preview`** (latest wins, like
  `steering_course`): `key` (a number per preview), `for` (the command's
  settings attribute as it was sent, so the web compares the string it
  built), `state` (`building`, `ready`, `none`, or `failed`: no answer in
  15 s, or another vehicle), and when ready the course in
  `steering_course`'s shape (`segments`, `width`, `boundary`; spec 0021),
  so the GPS screen's drawing takes it as is. Sent only for the controlled
  vehicle. The web shows it only while the panel's draft is the one it
  was built for, so a closed panel or an Apply leaves it unused. About the
  size of a course (13 KB on field 119).
- **Dashboard → companion → mod:** the commands' `settings` attribute is a
  string the web builds, `"width=6.6;headlands=auto;direction=45;offset=-0.4"`,
  the course rows in that order, each a number or `auto`; the companion
  checks its shape only, the mod each row against the dialog's entry.
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
| `aiModeSettingsChanged(aiMode, fieldCourseSettings)`: the dialog's own OK, on a clone of the game's settings; it stores the clone, sends `AIModeSelectionSettingsEvent`, calls `setAIModeSelection(aiMode)` and raises `onAIModeSettingsChanged`, and doesn't touch `userSettings` (the dialog changes those itself) | AIModeSelection.lua:249, 324-333 | seen (spike 0.0.20): with a clone the mode's entries were applied onto, the game stores it, rebuilds the course (about 200 ms) and its dialog then shows the change; a 45° course identical to the dialog's own, point for point; kept through a save and reload |
| `spec_aiModeSelection.userSettings` (class `AIUserSettings`: `new(fieldCourseSettings)`, `reinitialize(fieldCourseSettings, bool)`, `apply(fieldCourseSettings, mode)`, `saveToXML`, `loadFromXML`): what the player chose, per mode (the save's `settings`), applied onto `fieldCourseSettings`; nil after any attach or detach until H is held or a save loads (`onStateChange`), which may be why spike 0.0.15 didn't see it | AIModeSelection.lua:100-127, 155-180, 205-210, 224-249, 337-350; the class itself is not in the archive (nor any global named AI…Setting…, spike 0.0.19) | fields seen (spike 0.0.19, the table above); `apply(clone, mode)` seen (spike 0.0.20): writes that mode's entries onto the clone (Steering Assist's gave the game's own settings, the worker's its 90°), nothing else changed; the other methods **unverified** |
| `FieldCourseSettings.generate(rootVehicle)`: the tool's own settings, the Auto values; the game calls it when there are none | AIModeSelection.lua:231-233, 367 | seen (spike 0.0.21): called by the mod only where holding H calls it, when the course settings are missing after a hitch; gave the LEMKEN's Auto values |
| `AISettingsDialog.show(userSettings, fieldCourseSettings:clone(), vehicle, mode, fieldX, fieldZ, callback)`: the dialog gets the game's own `userSettings` (not a copy) and a clone of the course settings; its Reset is in the dialog's code | AIModeSelection.lua:249; the dialog is not in the archive | unverified |
| `g_fieldCourseManager:generateFieldCourseAtWorldPos(x, z, fieldCourseSettings, callback)`: the game's course builder; the course comes back later to `callback(_, course)`, nil if none; Steering Assist then wraps it (`SteeringFieldCourse.new(course)`) and sets it on the vehicle, which the preview never does. It builds one at a time per vehicle (`fieldCourseDetectionInProgress`, a pending one queued) | AIAutomaticSteering.lua:738-776; AIDriveStrategyFieldCourse.lua (the AI worker, the same call); the manager is not in the archive | **unknown: the spike** (that it leaves the vehicle alone, how long it takes, two at once) |
| the dialog's own preview (the map beside its settings) | not in the archive; likely the same builder | unverified |
| `GameSettings.SETTING.STEERING_ASSIST_LINES` = `"steeringAssistLines"`, a game setting for every vehicle, read raw from `g_gameSettings`; the key `TOGGLE_AI_STEERING_LINES` flips it with `g_gameSettings:setValue(…, not value, true)` (seen: active, `displayIsVisible` false, spike 0.0.15) | AIAutomaticSteering.lua:895, 922-925; spike 0.0.18 | read: seen (spike 0.0.18); the key: seen (spike 0.0.20), flips the setting, and holding H puts the dialog's entry back (the lines return) |
| `GameSettings.SETTING.STEERING_ASSIST_CRUISE_CONTROL` = `"steeringAssistCruiseControl"`, a game setting (true = Automatic) that each vehicle copies when you get in and when it changes (`registerVehicleSetting`); set with `g_gameSettings:setValue`, as the lines key does | AIAutomaticSteering.lua:157, 407; VehicleSettings.lua:96-170; spike 0.0.18 | read: seen (spike 0.0.18); `setValue`: seen (spike 0.0.20), the vehicle's copy follows, and holding H puts the dialog's entry back |

`AIUserSettings.new(fieldCourseSettings)`: the dialog's settings made
from the course settings, as holding H does (AIModeSelection.lua:242);
seen (spike 0.0.21): both modes' entries on Auto, with nothing else
changed.

Never called: `setAIModeFieldCourseSettings` (the receiving end of the
game's network event), a settings object the mod builds by hand,
`getAttacherToolWorkingWidth`, `setAIAutomaticSteeringCourse` with a
preview. `FieldCourseSettings.generate` and `AIUserSettings.new` only as
holding H calls them, when the settings are missing.

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
  steering"). As the dialog's OK with a new mode (spike 0.0.20): a clone of
  the course settings, that mode's entries applied onto it
  (`userSettings:apply(clone, mode)`), then `aiModeSettingsChanged(mode,
  clone)`; ok when `currentMode` reads it back. Not `setAIModeSelection`
  alone: it keeps the old mode's values in the course settings (spike
  0.0.19).
- **`steering.settings.apply`**, with the changed values in a new
  `settings` attribute (width, headlands, direction, offset, Auto per
  setting): in Steering Assist mode, on a field the farm may work,
  steering off. As the dialog's OK (spike 0.0.20): each changed row's
  entry in `userSettings` set (what the save writes; Auto is the entry's
  `defaultValue`, the direction's the first of its `textMapping`), the
  entries applied onto a clone (`userSettings:apply`), then
  `aiModeSettingsChanged(mode, clone)`. Ok when the game's settings read
  back the values. Reset is the four course rows to Auto, one Apply. This needs the attribute in
  `mod/src/Commands.lua`, `companion/server.py` and
  `companion/commands.py`.
- **`steering.lines.set`** and **`steering.cruiseOff.set`**, value 0 or 1,
  game-wide (the game's settings, every vehicle), sent on the tap since
  revision 3 (before, with Apply): as the dialog's OK, the
  row's entry in Steering Assist's `userSettings` (`showLines`,
  `cruiseControl`) and the game setting with `g_gameSettings:setValue(id,
  value, true)`. The setting alone, or the game's lines key, is undone the
  next time H is held: the dialog puts its entry back (spike 0.0.20).
  Writing both is inferred from what the dialog's OK changed (spike
  0.0.18); the live check confirms it. Ok when both read back.
- **`steering.settings.preview`**, with the panel's values in the same
  `settings` attribute: in Steering Assist mode, on a field the farm may
  work, steering off. A clone of the game's course settings, its fields
  set directly (metres, radians, −1 for Auto direction; the entries never
  touched), to
  `generateFieldCourseAtWorldPos` at the vehicle's position; one build at
  a time, the newest settings waiting behind it (as the game does), older
  ones dropped. Ok once the game has answered (a course or none), with the
  result in `steering_preview`; 5 s at most. After a hitch it first makes
  the settings as every command here does; else it changes nothing the
  game keeps. The mode is refused while the AI worker drives.
- **Settings missing** (after a hitch, until H is held): each command
  that needs them (mode, apply, lines, cruise) first makes them as
  holding H does (AIModeSelection.lua:231-243): `FieldCourseSettings.
  generate(rootVehicle)` when the course settings are missing, then
  `AIUserSettings.new` from them. The panel shows the rows from the
  course settings the game builds its course with, Auto, until then
  (spike 0.0.21).
- **`hello.commands.actions`** goes to 6 (the draft said 7, for two
  steps that shipped together).

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
   - then a multiplayer client (later: host only until then).
   A dump that disagrees with the Data contract sends the spec back for
   approval. Done 2026-11-24 (spikes 0.0.18 to 0.0.21, the Log).
2. **The panel on the GPS canvas** (done: approved 2026-11-24), at both sizes, day and night,
   approved before code.
3. **Mod:** `mod/src/Api.lua` (every new call guarded: the clone, the
   entries, `userSettings:apply`, `aiModeSettingsChanged`, the two calls
   holding H makes, the builder, the game settings; the course readers
   take the builder's raw course too), `mod/src/state/Steering.lua`
   (`settings` with each row's range, `canAssist`),
   `mod/src/SteeringCommands.lua` (its own file, loaded after
   Commands.lua: the four actions and the preview's job and state),
   `mod/src/collectors/SteeringPreview.lua` (the topic), `Commands.lua`'s
   `settings` attribute, `mod/modDesc.xml` 0.23.0, its file list and its
   description (the mod now changes what the game saves).
4. **Companion:** the `settings` attribute, its shape checked in
   `companion/protocol.py`, passed in `server.py`, written by
   `commands.py`.
5. **Web:** `web/src/types.js`; `data/steeringSettings.js` (the draft,
   the steps, the words, what Apply sends, the preview's `for`);
   `widgets/steeringSettings.js` (the column, in the GPS page's
   slots, shown in the Drive column's place while open); the GPS screen's
   Set up, tag and preview (painted on its own course canvas, keys apart
   from the course's); `theme.css` (the canvas's `st-` rules).
6. `docs/ARCHITECTURE.md`: the second exception.
7. **Risks:** as below; and a preview callback that arrives after the
   vehicle, map or session changed stores nothing.
8. **Risks:** a settings object written wrongly could fail later in the
   game's own save or network code, outside our guards (the brainstorm's
   B2); that is why only the game's own clone and commit are used, one
   setting at a time, and each spike ends with a save and a reload. A
   getter we can't read may change state (spec 0018's freeze), so the
   spikes call only the functions named above, one per session.

## Acceptance

Automated:
- [x] `mod/tests/run.lua`: `cab.steering.settings` from the spikes' dumps
  (`mod/tests/fixtures/spike0022/`): Auto (the entry's value its default;
  the direction negative, −57.2958 or −57 after a reload) and set values,
  each row's range; from the course's settings, all Auto, while the
  entries are missing after a hitch; `canAssist`.
- [x] `mod/tests/run.lua`: `steering.settings.apply` sets the entries
  (metres to tenths, the direction from its choices, auto to the
  default), applies them onto a clone and commits with
  `aiModeSettingsChanged`; ok on read-back; refused in AI worker mode, off
  the field, while steering, with a direction not among the choices and
  out of a row's range; Reset is the four rows to Auto.
- [x] `mod/tests/run.lua`: `steering.mode.set` applies the new mode's own
  choices and commits; already in that mode; refused without a tool that
  allows it and while the AI worker drives.
- [x] `mod/tests/run.lua`: `steering.lines.set` and
  `steering.cruiseOff.set` write the entry and the game setting; already
  only when both hold the value.
- [x] `mod/tests/run.lua`: after a hitch (no settings), each command makes
  them first as holding H does.
- [x] `mod/tests/run.lua`: `steering.settings.preview` builds with a
  clone at the vehicle's front, never sets the vehicle's course;
  `steering_preview` `building`, then `ready` with the course in
  `steering_course`'s shape or `none`, `for` the command's settings as
  sent; a timeout fails; an answer after the vehicle changed is dropped.
- [x] `mod/tests/test_version.py` (or run.lua): every file in `src/` is in
  modDesc.xml's list.
- [x] `companion/tests`: the `settings` attribute's shape checked, passed
  through and written; `steering_preview` kept as the latest.
- [x] `web/test.html`: each row's Auto and set values, −/+, the range's
  ends, back to Auto; one row open at a time; Apply's count, pending, ok
  and "Failed"; Reset puts the four course rows to Auto and leaves Show
  lines and Cruise; Close drops the draft; the faded rows and their words;
  the preview asked for half a second after the last change, one at a
  time, the newest waiting; the preview drawn from a fixture, "Building
  the preview…", "No lanes with these settings", back to the game's
  course when the settings return; a preview key and a course key with
  the same number each paint whole.
- [x] Replay in the browser pane at 1158×676 and 1180×820, day and night.
- [x] Revision 2, `mod/tests/run.lua`: the lanes' settings kept per
  course table; a dialog change left with Back gives `dialog` with only
  those rows; a new course takes the entries; Show lines and Cruise at
  the top without settings; Apply puts a leftover back before the
  draft's rows (committed with the lanes' headlands), the mod's own
  commit is no leftover, a kept course taken back keeps its own; refused,
  everything as it was.
- [x] Revision 2, `companion/tests`: `dialog` and the two top fields
  passed through.
- [x] Revision 2, `web/test.html`: "Dialog: …" for each row, Auto, none;
  the lanes' value on the row with the note, nothing to apply; a panel
  change's "was …" wins the sub-line; Show lines and Cruise from the top
  without settings.
- [x] Revision 2, the replay with a fed-in `dialog` on all four rows at
  1180×820 day and 1158×676 night: the notes fit, the column doesn't
  scroll.

Live check (Solek, mod 0.23.0):
- [x] Each setting set from the dashboard: the game's dialog shows the
  same, and the lanes move as they should.
- [x] The preview: each change shows lanes that match the game's dialog
  preview for the same settings, and the course after Apply; the
  vehicle's course doesn't change before Apply.
- [x] Back to Auto from the dashboard: the dialog shows Auto.
- [x] Reset and Apply from the dashboard: the dialog shows the four
  course rows on Auto, Show lines and Cruise as they were.
- [x] Rehitch: the panel shows Auto.
- [x] The offset left and right: the lanes move to the side the panel
  says.
- [x] Two tractors: a change on one leaves the other's settings.
- [x] Save and reload: the settings stay, Auto included.
- [x] In AI worker mode, off the field and while steering: faded, with
  the words.
- [x] A tool that doesn't allow steering: the Mode row's Steering Assist
  faded.
- [x] With H's hold never used, and with the lines key unbound.
- [x] Straight after a hitch, without H: the panel's rows, a preview, an
  Apply and the mode (spike 0.0.21's path).
- [x] Show lines and Cruise from the dashboard, then hold H: the dialog
  shows them, and they stay after Back.
- [x] The mode while steering, and while the AI worker drives (refused).
- ~~Precision Farming on and off.~~ Not needed (Vincent, 2026-11-25):
  PF changes nothing for the GPS, settled in earlier sessions.

- [x] `web/test.html`, revision 3: every row's steps there without a tap
  (the width's four on two lines); one tap a step, the value changed
  (blue), "Offset · was Auto · 0.0 m", the Auto chip; Show lines sent at
  once (not on Apply), breathing, held until the game says so; a flip the
  game doesn't take rings its switch; Apply sends the lane rows only;
  the reason in Reset and Apply's place in AI worker mode, off the field
  and while steering; the mode at once with "Switching…" and Failed;
  revision 2's dialog note beside the name.
- [x] Replay in the browser pane at 1158 × 676 night (steering: the list
  fits, 466 of 466 px, the reason at the foot) and 1180 × 820 day (two
  changes: blue values, the Auto chips, "Apply 2 changes").

Live check, revision 2 (mod 0.23.1):
- [x] Step a row in the game's dialog (width) and press Back: the panel
  shows the lanes' value with "Dialog: …" under the row.
- [x] Then Apply another row (headlands) from the dashboard: the lanes
  and the dialog have only the dashboard's change; the width is the
  lanes' again.
- [x] A row stepped in the dialog and confirmed with OK: the note goes,
  the panel shows the new value.
- [x] In AI worker mode (the Valtra after a detach), Show lines and
  Cruise show the game's values, faded.

Live check, revision 3 (no mod change):
- [x] On the iPad mini, day and night: every setting there without
  scrolling; width, headlands and direction changed and applied in a few
  taps, the preview following.
- [x] Show lines and Cruise set at once from the dashboard: the game's
  lines and its cruise setting change without Apply.

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
8. **After a hitch:** the game drops `userSettings` and the course
   settings (`onStateChange`) and makes them again only when H is held
   (`AIUserSettings.new`, `FieldCourseSettings.generate`, both never
   called by the mod). Until then the panel has no rows to show or set.
   Vincent (2026-11-24): no in-game step for the GPS, so the mod makes them
   the way holding H does. Answered by spike 0.0.21: it works (Commands,
   "Settings missing").
9. **Dialog rows left with Back** (live check, 2026-11-25): the panel
   shows the dialog's entries, which the dialog changes before OK (seen
   twice: width 6.0, and headlands 3 with 35°, after Back; the course
   kept its key). To fix: show what the course is built with
   (`fieldCourseSettings`) where it differs from the entries, or
   compare against it for Apply. Answered by revision 2 (built
   2026-11-25, choice A).
10. **Show lines and Cruise without settings:** in AI worker mode or
    before a vehicle has settings, the two game-wide rows show "–", as the
    four course rows do (`settings` is absent). They're the game's,
    every vehicle's, so they could show the game's value. Answered by
    revision 2.

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
- 2026-11-24: spike 0.0.20 run on field 119 (the Fendt and the LEMKEN),
  three game sessions; dumps in `mod/tests/fixtures/spike0022/`.
  `userSettings:apply` onto clones changed nothing: Steering Assist's
  entries gave the game's own settings and the worker's gave its 90°.
  Then entries set, applied onto a clone and committed with
  `aiModeSettingsChanged`:
  - direction 45°: the dialog showed 45°, and the course was identical to
    the one the dialog built, all 55 segments point for point; it was
    kept through a save and reload;
  - Auto: −57.2958 in the entry, −1 rad in the settings, the field's own
    angle;
  - width 6.6 m; Reset (5.0 m, 2, Automatic, 0.0 m, all Auto; lines and
    cruise as they were, Vincent's screenshot);
  - the mode to AI worker with its 90° and back to Steering Assist on Auto
    (course rebuilt within 35 ms).
  Each change rebuilt the course within about 200 ms, and the dialog
  showed it. Cruise through `g_gameSettings:setValue` and lines through
  the game's key changed the game settings, but holding H brought back
  the dialog's own entries (Automatic, lines On). Commands updated: the
  mode as the dialog's OK with a mode, Apply's entries, lines and cruise
  writing the entry and the setting. Open question 8 (after a hitch)
  added. The single-player spikes are done; a multiplayer client stays
  for later (host only).
- 2026-11-24: Vincent: no in-game step for the GPS, not even H after a
  hitch (open question 8). Spike 0.0.21 written: `csInit` runs the game's
  own lines from holding H (AIModeSelection.lua:231-243),
  `FieldCourseSettings.generate` for the rig, then `AIUserSettings.new`,
  without the dialog. Until the spike, the Data contract table's "never
  called" note still names `FieldCourseSettings.generate`.
- 2026-11-24: spike 0.0.21 run on field 119, one game session; dumps in
  `mod/tests/fixtures/spike0022/` (`init-init`, `settings-hitched`,
  `settings-init`, `apply-ts-afterinit`, `settings-reload-afterinit`).
  - Detaching the LEMKEN dropped the dialog's settings and also switched
    the tractor to AI worker mode: with no tool left that allows
    steering, the game does that itself (AIAutomaticSteering.lua:536-541).
    Reattaching kept AI worker mode, with no lanes.
  - Without H: `csInit` made the settings (`FieldCourseSettings.generate`,
    then `AIUserSettings.new`; both modes' entries on Auto, the worker's
    90° gone as holding H would), and `csApply mode steering` brought
    Steering Assist and the lanes back.
  - Direction 45° from the console showed in the dialog; Auto, a save and
    a reload kept Steering Assist on Auto.

  Open question 8 answered; Behaviour and Commands updated. The
  single-player spikes are done (Plan step 1, a multiplayer client
  later). The Commands now differ from the approved spec (the mode as the
  dialog's OK, Apply's entries, lines and cruise writing the entry,
  settings made after a hitch): Vincent's approval before the build.
- 2026-11-24: built (mod 0.23.0), Plan steps 3 to 6.
  - **Mod:** `Api.lua` (every new call guarded; the course readers take
    the builder's raw course), `state/Steering.lua` (`settings` with the
    dialog's ranges, `canAssist`), `SteeringCommands.lua` (its own file
    after `Commands.lua`: the five actions, the preview's job with a 15 s
    timeout, an answer after the vehicle changed stored nowhere),
    `collectors/SteeringPreview.lua`, the `settings` attribute in
    `Commands.lua`, `modDesc.xml`'s list and description. 11 new
    `run.lua` tests on the spikes' dumps.
  - **Companion:** the attribute's shape checked, passed and written.
  - **Web:** `data/steeringSettings.js` (the draft, steps, words, what's
    sent), `widgets/steeringSettings.js` (the column, in the GPS page's
    slots after the control column, which it hides while open), the GPS
    screen's Set up, tag and preview (on its own course canvas, the keys
    kept apart as "c3" and "p3"; the preview's legend only while it
    shows), the canvas's `st-` rules in `theme.css` on the app's tokens
    (`--btn`, `--font`).
  - **Checked:** pytest 224 passed (golden unchanged), test.html 455 all
    green (33 new). The replay with field 7's course and settings fed in
    at 1180×820 day and night (Set up, a width change, "Building the
    preview…", a preview) and at 1158×676 day (seven rows, one open, no
    scrolling) and night (AI worker mode, faded with the reason).
  - **Fixed on the way:** the column's long vehicle name widened it past
    its track (`min-width: 0`); the header looked the field up from the
    preview's lanes (now the game's course's field); the lane fill now
    dims with the course while the preview builds.
  - **Build choices for Vincent,** each in Behaviour or the Data contract:
    the direction leaves Auto from the lanes' own angle and 175° steps on
    to 0°; "Preview failed" when the game doesn't answer; the draft stays
    (faded) when the mode goes to AI worker, until Close; the mode refused
    while the AI worker drives; `hello` actions 6; the settings attribute
    a string the web builds.
- 2026-11-25: live check on Solek, mod 0.23.0 (the Fendt 728 and the
  LEMKEN on field 119, the Valtra S 286 and the Aerosem on field 150), all
  from the dashboard, Vincent reading the game's dialog and the ground.
  - Passed: width (7.0), headlands (3) and direction (90°) applied in one
    Apply, the dialog and the lanes the same, a new course each time;
    the preview the same as the course after Apply, the course's key
    unchanged before Apply; back to Auto; Reset and Apply (the four rows
    Auto, lines and cruise as they were); the offset −2.0 m (left) and
    2.0 m (right), the lanes to that side; two tractors kept their own;
    save and reload kept both, Auto included, no H; the rows faded with
    their words in AI worker mode, off the field and while steering; the
    Mode row's Steering Assist faded with only the front hopper ("No tool
    here allows steering"); the lines key unbound (it was), Show lines
    On through the setter; Show lines Off and Cruise Manual, kept after
    Back; the mode while steering (steering stops, AI worker) and while
    the AI worker drives (refused, "Failed" on the button); after a
    rehitch Auto (the Valtra's 4 headlands and 6.0 m dropped), and with
    no H the mode, a preview and an Apply.
  - "Changing starts a new course" showed with a lane done.
  - Found: the game's dialog writes its rows before OK and Back keeps
    them; the panel showed them as the game's (step 2's 6.0 m: no Apply
    was sent, the course stayed). Open questions 9 and 10. Precision
    Farming: not needed for the GPS (Vincent).
- 2026-11-25: revision 2 drafted (open questions 9 and 10): the lanes'
  settings with the dialog's beside them, Apply putting dialog leftovers
  back first, Show lines and Cruise at `cab.steering`'s top. Choices A
  and B for Vincent.
- 2026-11-25: Vincent approved choice A; revision 2 built (mod 0.23.1).
  The mod keeps the entries per course table (`lanesEntries`), sends
  `dialog` and the top `showLines`/`cruiseOff`; Apply puts leftovers back
  first and marks its own commit. The web shows "Dialog: 6.0 m" in the
  warn colour (the drafted "… in the game's dialog, not applied" was cut
  off beside the value at 1180 wide). Checked: pytest 226 (golden
  unchanged; run.lua 2 new), test.html 462 all green (5 new), the replay
  with a fed-in `dialog` at 1180×820 day and 1158×676 night. Live check
  open.
- 2026-11-25: revision 2 live-checked on Solek, mod 0.23.1, all four
  boxes. The Fendt on field 119 (7.0 m, 2 Auto): width stepped to 9.0 in
  the game's dialog, Back: the mod sent `dialog.width` 7.0 to 9.0 step by
  step, the panel kept 7.0 m with "Dialog: 9.0 m", nothing to apply.
  Headlands 3 applied from the dashboard: the leftover put back, the game
  built course 2 at 7 m with 3 rounds, and the dialog showed 7.0 M and 3
  (Vincent). Direction stepped to 45° in the dialog and OK: the note
  followed (35, 40, 45°), then course 3 at 45° and the note gone; the
  dialog said 45°. The Valtra with only the front hopper (AI worker
  mode): Show lines On and Cruise Manual from `cab.steering`'s top,
  faded, the course rows "–".
- 2026-11-26: revision 3 drafted from Vincent's note (changing the
  settings must be quicker than in the game): every row always open, one
  tap a step; Show lines and Cruise set at once (proposed); a recall per
  tool asked. Waiting for Vincent's answers and the canvas.
- 2026-11-26: revision 3 drawn on the GPS canvas (version 32): every row
  open at both sizes, the steering and AI worker states, Show lines set
  at once, and the recall question. Changed while drawing: Show lines and
  Cruise flip with one tap (two choices didn't fit the mini), the reason
  takes Reset and Apply's place, the recall sits on the field.
- 2026-11-26: Vincent's canvas comment ("cramped up", the mode switch too
  big, the four settings more compact): redrawn as a grouped list, one
  line a setting with its steps in a small well, a slim mode switch, Show
  lines and Cruise in their own small card (canvas version 34).
- 2026-11-26: Vincent's second comment (things overlapping, space left at
  the foot): the width's value and Auto chip crowded its four steps, so
  the width takes two lines; rows and steps grow to fill the column (48 px
  steps at 1180 × 820, 40 to 42 on the mini). Checked in a browser page
  at 268 px wide, day and night, at both heights (canvas version 35).
- 2026-11-26: night checked in a browser (canvas version 37): the changed
  value's blue made stronger at night (#7AA7F5, a new colour for
  `theme.css`), the ±0.1 steps no longer grey (they looked switched off),
  the Auto chip outlined in blue so it doesn't look like the AUTO tag.
- 2026-11-26: revision 3 approved by Vincent on the canvas and built (web
  only): `widgets/steeringSettings.js` rewritten as the grouped list (Show
  lines and Cruise at once, Apply the lane rows only, the reason at the
  foot); `theme.css` the gl- list in place of the rows that opened, night's
  changed blue #7AA7F5. test.html 478 green, pytest 226; the replay in the
  pane at both sizes. Live check open. The recall per tool went to PLAN.md.
- 2026-11-26: live check, revision 3 (Solek, mod 0.23.1, DEUTZ-FAHR 6135 C
  with the Knoche ECO-CULTIVATOR 300, iPad mini): every setting on screen
  without scrolling, day and night. Width +1, Headlands +, Direction +5°
  twice: "Apply 3 changes", previews built (acks 27 to 29), one
  `steering.settings.apply` (ack 30) and the game had width 3 → 4 m,
  headlands 3 → 4, direction Auto → 25°, a new course (key 4) a second
  later. At night a width step drew its preview (acks 31, 32), Reset sent
  nothing. Show lines Off then On (acks 33, 34) and Cruise Automatic →
  Manual → Automatic (acks 35, 36), each on the tap, the game's values
  changing, no Apply. Both boxes ticked; no new game names.
