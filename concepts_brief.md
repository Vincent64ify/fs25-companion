# GPS: Steering Assist from the dashboard
* **Author:** Vincent64ify
* **Date:** 2026-11-17

## How to pick this up in a new session

This file holds the reasoning from the brainstorm session of 2026-11-17, so the chat itself isn't needed. The three specs drafted from it the same night are now the home of the feature: [0020](specs/0020-steering-assist-state.md), [0021](specs/0021-gps-screen.md) and [0022](specs/0022-steering-assist-settings.md). Claude's memory note `gps-brainstorm` points here.

1. **Read "After the review" first.** It has Vincent's decisions and what his saves showed, and it overrides the Analysis wherever they differ.
2. **Spec 0020:** run `/egm:egm-review` on it, then Vincent approves it, then `/spec build 0020`. Its spike can also run 0021's read-only probe of the course.
3. **Spec 0021:** the GPS screen's canvas at both sizes, the probe's findings in its Data contract, then the egm review and approval.
4. **Spec 0022:** its spikes, one new game call per session, then the same.
5. **Delete this file** once the three specs are approved: they hold the decisions, and this file only adds the reasoning (the Alternatives and Risks are worth a look while reviewing).

**Temporary references.** Paths under `AppData\Local\Temp\claude\…` (the extracted game files and the screenshots) belonged to that session and may be gone.
- The game files can be extracted again from the SDK's `gameSource.zip`: `dataS/scripts/vehicles/specializations/AIAutomaticSteering.lua` and `AIModeSelection.lua`, and `dataS/scripts/vehicles/ai/AIDriveStrategyFieldCourse.lua`. Line numbers below refer to those files.
- Each screenshot is described in words where it is used.
- The earlier design canvas is [HEADLAND companion](https://claude.ai/artifact/RVS2AuL7h9JQeHC3NcJuSE).

## Overview

**The concept.** "GPS" means the base game's own Steering Assist, not a mod.
- **Before a field:** set it up from the dashboard alone, with all seven settings of the game's AI Settings dialog: mode, working width, headlands, work direction, side offset, show lines, and cruise control deactivation. No in-game menu, no GPS key.
- **While driving:** show the whole field with the course's lines, the part already worked, lines done out of the total, and the time left.
- **Left with the player:** headland turns and the tool stay on the joystick.

**How it was reviewed.** Seven lenses each read the concept, the project and the game's own scripts. All seven completed.
- Every game fact below comes from GIANTS' Lua in the SDK copy and is **unverified in game**. None of it is in `docs/GAME-API.md` yet.
- Where lenses disagreed on a game fact, the synthesizer reread the source and settled it. These are marked "checked".

**The verdict.**
- **Worth building, but not as one spec.**
- **Can be specced today:** the read side (mode, steering state, the course once the game has built it) and the game's own steering and lines keys.
- **Can't be specced yet:**
  - Writing the four course settings (width, headlands, direction, offset). Their names and units are now known from Vincent's saves (see After the review), but the safe write path isn't, and they persist into the savegame.
  - Drawing the course's lines. The course class isn't in the archive.
- **The first problem is one the project already has.** The Drive group's AI worker button presses the same game key, and that key's job changes with the mode. It has to be decided before any new button.
- **Most of the "while driving" half already exists.** Spec 0013's field panel already shows the whole field, the trail and "This run ≈ N %". The lenses proposed extending that panel; Vincent turned it down: the GPS gets a screen of its own (see After the review).

**How to read the references.**
- A reference like `AIAutomaticSteering.lua:887` points to the game's own file (see How to pick this up for getting it again). During the session they were in a temporary `scratchpad\gs\` folder.
- Project references are relative to the repo root.

## After the review: Vincent's answers and a first look at a save (2026-11-17)

These override anything further down that says otherwise.

### Vincent's answers

1. **The H key.** In game, a short press of H is "Activate lane" or "Deactivate lane" on the selected lane; holding H opens the AI Settings dialog ("Mode: Steering Assist", hold H). The dashboard's button does what the short press does, and the dashboard's own settings replace the hold. His bindings (`inputBinding.xml`): `TOGGLE_AI` on H and joystick button 8, `TOGGLE_AI_STEERING` on joystick button 21 only, `TOGGLE_AI_STEERING_LINES` unbound.
2. **Setters are allowed.** Everything is controlled from the dashboard: the mode, the four course settings and cruise deactivation go through the game's own functions. It is the second exception beside spec 0019, to be written into `docs/ARCHITECTURE.md`.
3. **All four settings are needed**, so spec 0022 is worth its cost:
   - **Work direction:** the angle of the lanes, in degrees, set by hand.
   - **Headlands:** how many rounds around the field before the straight lanes (Vincent's picture: grey headland rounds along the field's edge, straight lanes inside).
   - **Working width:** Auto is the attached tool's width (a header, a boom, a cultivator); it can be set by hand in 0.1 m steps.
   - **Side offset:** for tools that aren't centred on the lane, such as a plough or a trailed potato harvester.
4. **After hitching, on the field: yes.** The GPS is set up only on a field the farm may work: its own, a contract field it took, or in multiplayer another farm's field that allows it. That is the game's own check too (`canFarmAccessLand` or `getIsMissionWorkAllowed`, `AIAutomaticSteering.lua:453-457`).
5. **Progress:** headland rounds count, probably with a counter of their own beside the lanes. Work done while ignoring the lanes must still count somehow. Options to weigh in the spec:
   - the trail of spec 0013, as today (in each browser's memory, lost on a reload or a vehicle change);
   - the same trail kept by the companion, so both iPads agree and a reload keeps it;
   - sampling the ground a few points per lane with the engine read the game itself uses here (`getDensityAtWorldPos`, `AIAutomaticSteering.lua:445`), so a lane counts as worked whoever drove it. A probe must show its cost first.
6. **Time left** comes with the course spec, not ahead of it (A1 is not shipped alone).
7. **A GPS screen of its own.** The field panel is far too small. This replaces M5's field panel layer and A13's verdict: the GPS gets its own tab, with the whole field big.

### A zero-risk look at a save

`Documents\My Games\FarmingSimulator2025\savegame3\vehicles.xml` (Solek, saved 2026-11-17 19:15) holds one tractor in Steering Assist mode. This is probe 1 done on an existing save: written by the game's own save code, read with no game call, still unverified live.

- **`aiModeSelection currentMode="STEERING_ASSIST"`**, with `settings` holding **one block per mode**:
  - `worker`: `implementWidth="76"`, `numHeadlands="1"`, `workDirection="-57"`, `workHeadlands`, `headlandFirst`, `skipNumLines`;
  - `steering_assist`: `implementWidth="76"`, `numHeadlands="1"`, `workDirection="-57"`, `sideOffset="0"`, `showLines="true"`, `cruiseControl="true"`.

  So the worker and Steering Assist keep **separate** settings (M10 is weaker than it says), Show Lines is also stored per vehicle, and cruise deactivation is `cruiseControl`. The width looks stored in 0.1 m units (76 for 7.6 m). How AUTO is stored, and what -57 means, are unknown.
- **`aiAutomaticSteering`** holds the course, `steeringFieldCourse`:
  - `field` with `boundary positions="x z x z …"`: the field's outline in world metres;
  - `fieldCourseSettings` with every field: `implementWidth="7.6"`, `numHeadlands`, `headlandsFirst`, `workHeadlands`, `skipNumLines`, `workDirection="-1"` (likely automatic), `sideOffset`, `headlandForcedDirection`, `segmentSplitAngle` and more;
  - `workedLines indices="3"`: the lanes done, by index.

  So **lanes done survive a save** (B3's reload question), and the lanes themselves are not saved: the game rebuilds them from the outline and the settings.
- **Probe 1 proper (2026-11-17 20:17).** Vincent set direction 30°, headlands 2, width 6.3 m and offset 0.5 m, drove one headland round and one lane, saved, set everything back to Auto and saved again. The second save overwrote the first, but the game keeps two courses per vehicle, so most of it shows:
  - `lastActiveSteeringFieldCourse` (the course last steered): `implementWidth="6.3"`, `numHeadlands="2"`, `workDirection="0.523599"`, `sideOffset="0.5"`, `workedLines indices="10 12 13 14 15"`.
  - `steeringFieldCourse` (rebuilt after the change back to Auto): `implementWidth="7.6"`, `numHeadlands="1"`, `workDirection="-1"`, `sideOffset="0"`, `workedLines indices=""`.
  - **Units in the course:** width and offset in metres, direction in **radians** (0.523599 = 30°), **-1 = automatic**.
  - **Units in the saved settings** (`steering_assist`, the Auto state): width in tenths of a metre (76 = 7.6 m); direction in whole degrees, and **-57 is automatic**: -1 radian written as degrees (inferred). No AUTO flag is saved, so "auto" may simply be "the value equals the tool's default" (inferred).
  - **The saved settings with set values (2026-11-17 20:20):** Vincent set width 6.9 m, headlands 2, direction 135° and offset -0.5 m. `steering_assist` became `implementWidth="69"`, `numHeadlands="2"`, `workDirection="135"`, `sideOffset="-0.5"`, and the new course `implementWidth="6.9"`, `numHeadlands="2"`, `workDirection="2.356194"` (135° in radians), `sideOffset="-0.5"`. The `worker` block stayed at 76, 1, -57: the two modes' settings are separate (seen). So the saved settings are width in tenths, headlands as a count, direction in whole degrees (-57 for automatic), offset in metres with a sign (which side is negative is not checked).
  - **`workedLines` counts segments, not lanes:** one round and one lane gave five indices. A round is several segments (this field has six corners, and the course splits at 25°). Telling rounds from lanes needs the course's segments in memory (probe 3).
  - **A settings change starts a new course with no lanes done** (M3, now seen). The old course stays as the last active one, with its lanes done, and the game reuses it when the settings come back the same (`AIAutomaticSteering.lua:740-746`).

## Analysis

### Lens status

| Lens | Role | Status |
| --- | --- | --- |
| `egm-design` | Skeptical Architect Brainstormer | completed |
| `egm-codebase-details` | Codebase Accuracy and Debuggability Brainstormer | completed |
| `egm-zoom-out` | Contrarian / YAGNI Brainstormer | completed |
| `egm-comprehension` | UX & Ergonomics Brainstormer | completed |
| `egm-implementation-readiness` | Implementation Readiness & Compatibility Brainstormer | completed |
| `egm-structural` | Maintainability & Structure Brainstormer | completed |
| `egm-inventive-catalyst` | Inventive Catalyst Brainstormer | completed |

All seven opened both screenshots, the `.webp` included. The dialog shows exactly the seven settings, "Cruise Control Deactivation: MANUAL", and "No field detected for preview."

### Corrections to the concept's game facts

Settled from the source, all still unverified in game.

- **Four field names come from archive files outside `gs\`** (the Elephant checked the whole `gameSource.zip`; the lenses saw only `gs\`). The tool decides part of them, so a value set from the dashboard can be overridden by the tool:
  - `numHeadlands`: clamped to the tool's own minimum and maximum (`AIImplement.lua:418-422`).
  - `headlandsFirst`: forced on by cutters, mowers, sowing machines, tedders, windrowers, mulchers, stone pickers and fruit preparers (for example `SowingMachine.lua:1185`, `Mower.lua:872`).
  - `sideOffsetHeadlandAlternate`: from the tool's XML (`AIImplement.lua:414`).
  - `segmentSplitAngle`: forced to 25 by the plough (`Plow.lua:922`).

  The fields seen in `gs\` are `implementWidth` (`AIAutomaticSteering.lua:470`), and `workInitialSegment`, `toolAlwaysActive`, `canTurnBackward` and `allowStraightReversing` (`AIDriveStrategyFieldCourse.lua:182-268`). None of them is a work direction.
- **"No tool allows steering" is not an engage check.** Engaging checks only for a course and a current segment (`AIAutomaticSteering.lua:781-792`, checked). The tool check runs on attach or detach, and there it switches the mode back to Worker on the server (`:532-544`, checked).
  - So AVAILABLE does not mean "can engage": a course can exist with no current segment.
- **Only the user settings are saved.** The savegame stores `userSettings` (AIUserSettings), not `fieldCourseSettings` (`AIModeSelection.lua:45, 122-129`).
  - `setAIModeFieldCourseSettings` sends no network event: it is the receiving end of `AIModeSelectionSettingsEvent` (`AIModeSelectionSettingsEvent.lua:59-62`).
  - The dialog's own commit is `aiModeSettingsChanged(aiMode, fcs)` (`AIModeSelection.lua:249, 324-333`).
- **The course is saved with the vehicle; its line states may not be.**
  - The current course and the last active course are saved through `SteeringFieldCourse:saveToXML` and restored on load (`AIAutomaticSteering.lua:64-67, 164-188, 260-273`, checked).
  - That class is missing, so whether the per-line states are part of what it saves is unknown. It is probe 1's question.
- **The tool's width is not sent with the course request.** It only decides whether to rebuild (`AIAutomaticSteering.lua:464-474, 487`).
- **Steering turns itself off in more ways than the concept lists.**
  - Wheel input: any keyboard input at once; a joystick move over 0.1 after a 2.5 s grace (`:834-856`).
  - Leaving the cab (`:592-603`).
  - Reversing (`:507-527`).
  - The course being dropped (`:709-713`).
  - Any settings change (`:563`).
  - Leaving Steering Assist mode (`:549-550`).
- **The per-line state stream goes from server to client only** (`:302-319`). In single player the states live only on the course object, in memory. What a state means is unknown: `SteeringFieldCourse` is missing.
- **The enums and constants are blanked in the archive** (`AIModeSelection.lua:12-31`, `AIAutomaticSteering.lua:12-39`). That covers MODE, STATE, `MODE_CHANGE_DURATION`, `RESET_COURSE_TIME` and the distances.
- **"No key for the mode" holds only for these files.** `inputBinding.xml` and `AISettingsDialog` aren't in the archive.

### 🔴 Blocker

**B1. One key, two jobs: the existing AI worker button breaks in Steering Assist mode, and may open the very menu the player wants gone**
- **Raised by:** every lens. Design, structural and comprehension rate it Blocker; zoom-out, codebase-details, readiness and inventive rate it Major. It is kept as a Blocker because it already affects a shipped control, and every new button depends on it.
- **The button's side (checked):**
  - `ai.set` presses `TOGGLE_AI` (`mod/src/Commands.lua:1166`).
  - The mod calls the key's callback once, with `value or 1` (`Commands.lua:1347`).
  - The button's state is `getIsAIActive()` (`mod/src/state/Motor.lua:151-153`). The web sends the opposite of `aiActive` (`web/src/widgets/controls.js:339-341`).
- **The game's side (checked):**
  - `TOGGLE_AI` is registered with four `true` flags (`AIModeSelection.lua:214`). Read as up, down and always; the argument order is inferred.
  - A value of 1 only starts a hold timer (`:226-229`).
  - Held past `MODE_CHANGE_DURATION`, it opens `AISettingsDialog` (`:231-251`).
  - The real job runs only on a later call with another value (`:253-273`): hire the worker in Worker mode, toggle steering in Steering Assist mode.
- **What that means (inferred).** It depends on whether the engine sends the release after the mod's single press:
  - **If it does:** in Steering Assist mode each tap toggles steering. The button stays unlit, a value of 0 answers "already", and a doubled command undoes itself. That breaks spec 0008's "commands say the state".
  - **If it doesn't:** the timer stays armed, and the player's next real tap of the AI key can open the AI Settings dialog at once.
  - Spec 0008's live "TOGGLE_AI ran twice and nothing showed" (`specs/0008-commands-say-the-state.md:232-236, 263, 281-283`; `docs/PLAN.md:26-31`) fits both readings. "Needs a job" may be a misdiagnosis.
- **Why not a second button:**
  - A separate steering on/off button breaks "one control per action" (`docs/ARCHITECTURE.md:163-166`).
  - The Drive group is already full, at two rows of three (`docs/THEMES.md:156-159`).
- **Resolution (all lenses agree):**
  - **One Drive button whose label and action follow the vehicle's mode:**
    - In Worker mode it stays "AI worker" (`ai.set`).
    - In Steering Assist mode it is "Steering" and presses `TOGGLE_AI_STEERING`. That key fires on key-down only (`AIAutomaticSteering.lua:887`), ignores the value (`:905-907`) and is active only with a course and a current segment (`:911-918`), so it acts in the same frame as the press. Its state is `spec_aiAutomaticSteering.steeringEnabled` (`:141`).
    - The mode is a setup choice, not live state, so "buttons never come and go" holds. The Lower/Raise label is the precedent.
  - **`ai.set` refuses in Steering Assist mode** and never presses `TOGGLE_AI` there.
  - **Probe it:** trace a real `TOGGLE_AI` tap's value sequence, and read `spec_aiModeSelection.modeChangeStartTime` before an `ai.set`, right after it, and one frame later.
  - **One spec owns the button in both modes.** No spec owns it today: it predates specs, and its own spec is a PLAN.md idea. In the same change, update 0008's `ai.set` row and PLAN.md's AI worker item.

**B2. The four course settings have no known names and no known safe write path, and a bad write lands in the savegame**
- **Raised by:** six lenses, all but comprehension. Inventive rates it Major, blocking only that part.
- **Where the settings live:**
  - Working Width, Headlands, Work Direction and Side Offset live in `AIUserSettings` and `FieldCourseSettings`. Neither class is in the archive.
  - Whether each value is AUTO or set very likely lives in AIUserSettings (inferred from `AIModeSelection.lua:173-179, 345-349, 371-372`).
- **What a direct write would break:**
  - Writing `FieldCourseSettings` fields directly would likely turn "7.6 m (auto)" into a fixed 7.6 m that no longer follows the tool. It might also not survive a save.
  - The client ships its own settings with each course request (`AIAutomaticSteering.lua:477-487`), so a half-written object goes straight into course building.
- **The main hazard beyond pcall (design, readiness).** A settings object the mod built or half-filled could fail later, in the game's own `saveToXML` or `writeStream`. That happens at the player's next save or when a client joins, outside any guard of ours. It is the same class of failure as the `getTotalReward` freeze (`docs/GAME-API.md:577-588`; `mod/src/Api.lua:199-202`).
- **The spec can't name them yet.** The template's Data contract needs a name per value (`specs/_template.md`). There is none for these four, nor for their AUTO flags or for the direction's unit.
- **Resolution:**
  - Take these four (and the cruise deactivation writer) out of the first spec. Stage them; don't drop them.
  - Learn the names passively first (see Staging, Stage 0):
    1. the savegame's `vehicles.xml`, which needs no game call at all;
    2. then a field-only dump.
  - Writes may only ever pass objects the game made: its own clone (`AIModeSelection.lua:247`), through the dialog's own commit (`:324-333`). Never a hand-built table, never `setAIModeFieldCourseSettings`.
  - Answer ok only once the game's settings read back the change, as spec 0019 does.

**B3. The course's lines and per-line states have no known source**
- **Raised by:** readiness (Blocker), codebase-details, design, zoom-out and inventive (Major), structural (Nit). It is kept as a Blocker for the course-view spec only. The status-and-keys spec does not depend on it.
- **What is known:**
  - Fields seen on `steeringFieldCourse`: `currentSegment`, `currentSegmentIndex`, `currentSegmentIsLeft`, `segmentStatesDirty` and `fieldCourseSettings.implementWidth` (`AIAutomaticSteering.lua:357, 422-425, 470, 689-690`).
  - `.segments` is seen only on the AI worker's `FieldCourse` (`AIDriveStrategyFieldCourse.lua:203`). `SteeringFieldCourse.new(course)` wraps one (`AIAutomaticSteering.lua:759`), under a field name nobody has seen.
  - Worker segments include turns and a starting segment (`AIDriveStrategyFieldCourse.lua:231-253`), so a segment is not necessarily a line.
- **What that leaves open:**
  - "Pass 21 / 60" has no rule yet. Do headland rounds count? Does a line driven by hand count? `updateVehicleData` takes `steeringEnabled` as an argument (`AIAutomaticSteering.lua:352`), which hints that only steered lines may count (inferred).
  - Whether the states survive a save and reload is unknown too (see Corrections).
- **Resolution:**
  - The Stage 0 dump also counts the course object's members, and dumps one segment's scalars.
  - The spike drives one line steered and one by hand, and records which ones the game marks done.
  - Design "lines done" only from what the dump shows.
  - If the geometry proves unreadable or too large, fall back to counts only (A4b under Alternatives).

### 🟡 Major

**M1. "Before a field" really means "after hitching": attach or detach wipes the settings, and the server can switch the mode back**
- **Raised by:** all seven. Comprehension rates it Blocker.
- **What the code does:**
  - Attach or detach sets `fieldCourseSettings` and `userSettings` to nil (`AIModeSelection.lua:198-204`, checked).
  - It also drops `lastActiveSteeringFieldCourse`, and the line progress with it (`AIAutomaticSteering.lua:536`).
  - If no tool allows steering, the server forces the mode back to Worker (`:538-541`).
  - The next course is built from the game's defaults (`:477-481`).
- **What it means for the player:** "set it up in the yard, then hitch the cultivator" loses the whole setup.
- **Resolution:**
  - The game is the only home of the settings. The dashboard shows what the mod reads back, never what it last sent, so a wipe is visible.
  - The spec says: hitch first, then set up.
  - A companion profile that puts the settings back after each hitch would fight the game's reset, whose purpose is to recompute AUTO for the new tool. It is rejected for now. If it ever comes, it is a workaround and goes in `docs/NEXT.md`.

**M2. No course before the field: lines appear only on the field**
- **Raised by:** all seven.
- **When the game asks for a course:**
  - only for the vehicle the local player drives (`AIAutomaticSteering.lua:440`);
  - only in Steering Assist mode (`:441`);
  - only with the front or back of the vehicle on a field the farm may work, contract fields included (`:442-457`).
- **When it drops or reuses one:**
  - The course is dropped `RESET_COURSE_TIME` after leaving the field, but only while steering is off (`:489-503`).
  - It is reused when the vehicle comes back with identical settings (`:740-746`).
- **Why no preview:** a preview would need `g_fieldCourseManager:generateFieldCourseAtWorldPos` (`:752`), an asynchronous, heavy call the mod has never made. The probe rule forbids it.
- **This answers known unknown 2.**
- **Resolution:**
  - A preview before the field is a non-goal.
  - Off the field, show the outline from `field_outlines` and words such as "Lines appear on your field".
  - On a field already steered with this rig, draw the game's last active course.
  - Name four states in the player's words: off the field, building, ready, and left the field to refill.

**M3. A settings change while driving drops steering, rebuilds the course and likely resets lines done**
- **Raised by:** design, comprehension, codebase-details, readiness, inventive and structural.
- **What the code does:**
  - `onAIModeSettingsChanged` sets the course to nil (`AIAutomaticSteering.lua:560-568`, checked). That turns steering off (`:709-713`).
  - A new course starts with no lines done (inferred, from `:759`).
  - Each stepper tap would be a rebuild and a network round trip. The game's dialog collects changes until OK.
- **Resolution:**
  - The four course settings fade while steering is ACTIVE, with "Steering is on". Live state only fades them, which the rules allow.
  - With lines done and steering off, they stay live with "Changing starts a new course".
  - Prefer one Apply over seven separate writes (see M9).

**M4. "Worked part", "lines done" and "time left" are undefined, and one field would get up to four "done" figures**
- **Raised by:** all seven.
- **The sources a field would have:**
  - **Spec 0013's trail and "This run ≈ 54 % of the field":** our own estimate, in each browser's memory, cleared on a vehicle change (`web/src/data/coverage.js:1-22`; `specs/0013-vehicle-screen-calm.md`). Two iPads can disagree.
  - **Spec 0018's contract %:** the game's `mission.completion` (`specs/0018-contracts.md:191-227`).
  - **The course's line states:** new.
  - **The field's real ground state:** no per-cell read exists. The completion getters froze the game.
- **The words and numbers have gaps:**
  - "Pass 21 / 60" beside "This pass" on the canvas reads as a position, not a count.
  - "Time left" doesn't say which clock or what it counts. Spec 0018 already learned to name game time versus real time, and work runs at real-time rates at any game speed (`docs/PLAN.md:16-22`).
  - The earlier canvas's DataMap planned a mod-side coverage collector. That would duplicate `coverage.js`.
- **Resolution:**
  - "21 of 60 lines done" comes from the game's line states.
    - They are the game's, so every tablet shows the same, and they are synced to multiplayer clients.
    - The course itself is saved with the vehicle. Whether its line states come back after a reload is probe 1's question.
  - The "worked part" on the map stays 0013's trail, and remains the only "% of the field".
  - Where the two disagree, that is information: it shows a skipped line.
  - Keep one time-left per field: "≈ 18 min left · real time", from one estimator in `web/src/data/` (reuse `rates.js`), hidden while the rate is unsteady.
  - Never call the completion getters; list them as "never called" in the Data contract.
  - The mod-side coverage collector is rejected.

**M5. The while-driving picture already exists; put the course on the field panel, not on a new page**
- **Raised by:** zoom-out, design, codebase-details, inventive, structural and comprehension.
- **What is already there:** `web/src/widgets/fieldPanel.js` draws the whole field fixed to its bounds, the rig's arrow, the trail, "This run ≈ N %" and the contract row with "work left". The concept never mentions it.
- **What limits it:**
  - The panel is 260 px wide on the mini, and the Vehicle page has about 30 px to spare at 1158×676.
  - Spec 0013's panel has a performance budget.
  - The panel disappears with three or more working tools.
- **Resolution:**
  - The course lines become a fourth layer of the field panel: an SVG written once per course, with done, this-line and to-do lines.
  - Below about 1 px between lines (3 m lines on an 800 m field), shade them by state instead.
  - Add one row: "21 of 60 lines · ≈ 18 min left · real time".
  - The settings open as a panel in the style of spec 0017's game-speed panel, from the mode-aware button or a tap on the field panel. Spec 0013 still leaves the field-panel tap open.
  - Optionally, one Map layer in `web/src/map/layers/`. No new screen.

**M6. Mode, cruise deactivation and the four settings need setters: a second exception to "the game's keys, not its setters"**
- **Raised by:** zoom-out, design, codebase-details, readiness, structural and inventive.
- **Why it is an exception:**
  - The one exception today is spec 0019's contract actions (`docs/ARCHITECTURE.md:199-207`). Those call the game's own functions, run the same checks first, change nothing themselves, answer ok on read-back, and work only on the server.
  - The mode has a setter, `setAIModeSelection` (`AIModeSelection.lua:294-314`), which sends its own event. It doesn't check `getIsAutomaticSteeringAllowed`, so the dashboard could set a mode the dialog wouldn't offer, and the game would silently undo it at the next hitch.
  - Cruise Control Deactivation is a vehicle setting (`AIAutomaticSteering.lua:157, 405-411`) whose setter isn't in the archive.
- **Resolution:**
  - Vincent decides the exception explicitly, as for 0019, and ARCHITECTURE.md's paragraph names this spec beside 0019.
  - Run the game's own guard first, once a probe shows `getIsAutomaticSteeringAllowed` changes nothing.
  - Answer ok only when `getAIModeSelection()` reads back.
  - Writes answer "host only" on a joined game until checked live on a client.
  - Keys stay on every game: steering and lines go through the game's own events.
  - If Vincent declines, show the mode read-only with a hint to set it once in the game. It is saved per vehicle (`AIModeSelection.lua:100-104, 122-124`).

**M7. Some of the game's "getters" change state; the probe rule applies**
- **Raised by:** design, codebase-details and readiness.
- **The calls to avoid:**
  - `getAttacherToolWorkingWidth` calls `updateAIMarkerWidth()` on every tool (`AIAutomaticSteering.lua:607-625`).
  - `initializeLoadedAIModeUserSettings` uses up the loaded settings (`AIModeSelection.lua:337-351`).
  - `FieldCourseSettings.generate` and `FieldCourse.findClosestField` are heavy.
- **The safe reads:**
  - fields: `spec_aiModeSelection.currentMode`, `spec_aiAutomaticSteering.steeringEnabled`, `.steeringFieldCourse` and the course's fields above;
  - pure getters: `getAIModeSelection`, `getAIModeFieldCourseSettings`, `getAIAutomaticSteeringState` and `getIsAIAutomaticSteeringAllowed`.
- **Resolution:**
  - Put only those reads in `mod/src/Api.lua`.
  - Compare the enums at run time, as `Api.missionStatus` does.
  - Before a course exists, show "Auto" with no number. Never call the width getter or `generate` to fill it in.
  - List the side-effect calls as "never called" in the Data contract.

**M8. Message shape: small state in `cab`, course geometry in its own topic**
- **Raised by:** design, codebase-details, structural and zoom-out.
- **How the topics behave today:**
  - `cab` is JSON-encoded every frame to compare (`mod/src/collectors/Cab.lua:122-127`).
  - Topics are latest-wins (`companion/state.py`).
  - Resend topics go out again at each 2 MB rotation (`mod/src/Scheduler.lua:118-131`).
- **Size estimates (design):**
  - a 19 ha field at 7.6 m: about 2 to 5 KB of lines;
  - with headland polylines: 15 to 400 KB.
- **Resolution:**
  - Add a small `cab.steering`: mode, state, a not-ready reason, current line, lines done and total, and the settings as the game holds them. It is read through a new `mod/src/state/Steering.lua`, so each answer shows the same frame.
  - Add one new course topic, with its own collector (`mod/src/collectors/SteeringCourse.lua`):
    - a course key, so the web redraws only on change;
    - lines as flat arrays, like `field_outlines`;
    - a compact state per line;
    - resend on;
    - lines only in v1.
  - The companion needs no change.
  - The DataMap's 10 Hz guidance collector, and its "worked out in the companion", are not inherited.

**M9. The command shape: one number per command, and AUTO needs an encoding**
- **Raised by:** structural, design, codebase-details and readiness.
- **What a command can carry today:** `action`, one number `value`, `tool`, `side`, `key` and `contract` (`companion/server.py:257-259`; `Commands.lua:1275`).
- **The choice:**
  - **Per-setting `.set` actions**, each with a documented AUTO sentinel or a separate `*.auto` action. This keeps Protocol v1 and the companion as they are, but every tap rebuilds the course.
  - **One Apply action**, like the dialog's OK. It needs a new attribute in `Commands.lua`, `server.py` and `commands.py`.
- **Either way:**
  - raise `hello.commands.actions` to 5;
  - gate the new web controls on it;
  - bump `mod/modDesc.xml` (0.20.5 to a new minor version).

**M10. The "GPS" settings also drive the hired AI worker**
- **Raised by:** comprehension, design, readiness and structural.
- **What the code does:** the worker's course reads the same `getAIModeFieldCourseSettings()` (`AIDriveStrategyFieldCourse.lua:81-88`). Setting 0 headlands "for GPS" changes the worker's next job on that vehicle too.
- **Resolution:**
  - Name them "AI settings", as the game does, and say on the panel that they apply to both modes.
  - A later AI worker spec reuses the same fields and actions.

**M11. Failures would be invisible: a silent course build, steering turning off unexplained, and a topic livewatch can't see**
- **Raised by:** codebase-details.
- **The gaps:**
  - The game logs a failed build only at `Logging.devInfo` (`AIAutomaticSteering.lua:756`).
  - Steering turns itself off for at least six reasons.
  - `scripts/livewatch.py` prints `cab` diffs and acks, but no other topic.
- **Resolution:**
  - `cab.steering` carries why it isn't ready:
    - not Steering Assist mode;
    - not on a field you may work;
    - building;
    - no course;
    - no line under you (the game's two warning texts).
  - The mod logs one line when `steeringEnabled` goes from true to false, with the likely cause read in that frame.
  - It logs once per course: build time, size and segment count.
  - livewatch prints one line per course, never the geometry.

**M12. Setup failures need words, not only "Failed"**
- **Raised by:** comprehension.
- **Why:** a failed press shows "Failed" on its button with the reason hidden. Setup failures are the ones the player must read: "no tool allows steering", "drive onto your field", "no line under you". The game shows them only as blinking warnings in game (`AIModeSelection.lua:262, 269`; `AIAutomaticSteering.lua:781-792`).
- **Resolution:** add a fixed status line on the settings panel, in the game's words, as spec 0019's action row does. No toasts.

**M13. AUTO, set values and the controls are unstated**
- **Raised by:** comprehension.
- **The gaps:**
  - "7.6 m (auto)" mixes a state with a value. A hand-set 7.6 m looks the same as an auto one.
  - With no tool, the auto width is 0.
  - The concept doesn't say how to return to AUTO.
  - "Work Direction" has no unit in the player's words: degrees, a compass point, or "along my heading"?
- **Resolution:**
  - Show each row as "Auto · 7.6 m" versus "7.6 m", with one tap back to Auto.
  - With no tool, show "Auto · from the tool".
  - Use −/+ steppers as Cruise does, not a slider.
  - Two-way settings reuse the Contracts page's segment wells.
  - Define Work Direction before drawing any UI.

**M14. Cut and ownership: a probe, then three specs, each fact with one home**
- **Raised by:** structural, zoom-out, readiness and design.
- **The cut:**
  - **0020 Steering Assist: state and keys.** The mode-aware Drive button (B1), steering and lines keys, `cab.steering`, and the mode setter if accepted.
  - **0021 Steering Assist: the course on the field.** The course topic and collector, the lines layer, lines done and time left.
  - **0022 Steering Assist: the course settings.** The four settings and cruise deactivation, after the probes.
- **What each touches:**
  - 0008's `ai.set` row;
  - 0013's field panel and its budget;
  - 0018's time convention;
  - PLAN.md's two AI worker items;
  - ARCHITECTURE.md's exception paragraph;
  - GAME-API.md after each live check.
- **There is no map spec and no AI worker spec today.** Both came before specs.

**M15. Test cost: the golden replay can't show this feature as it stands**
- **Raised by:** readiness, codebase-details and design.
- **Why:**
  - `fixtures/solek_v1.ndjson` has no `cab` envelopes, and its field outlines are synthetic rectangles.
  - It is regenerated by `research/convert_spike.py`.
  - Golden lines point at fixture line numbers (`tests/test_golden.py:13-14, 122-124`).
- **The lenses offer two ways, to choose in the spec:**
  - **Readiness:** emit a synthetic course in `convert_spike.py`, appended after the last envelope, and rewrite the golden file once with `GOLDEN_UPDATE=1`, noted in the spec's Log. That is a deliberate change to what viewers get, which is the only case CLAUDE.md allows it.
  - **Codebase-details:** keep the golden file untouched, and give the tests a separate made-up course topic on a real Solek field, replaced by a real dump after the live check, as spec 0018 did.
- **Either way:** turn the probe dumps into rig fixtures, with their Precision Farming off variants.

**M16. The concept as input to a spec: no alternatives, risks, cost, timeline or exams, and facts mixed with guesses**
- **Raised by:** structural, zoom-out, design, comprehension, readiness and inventive.
- **The gaps:**
  - It starts with background, not Goal and Behaviour.
  - Its game section mixes read facts with guesses ("probably which lines are done").
  - It copies rules that already have a home.
  - It offers no evidence for "changes all of them".
  - It needs a Words table: segment, course, line and pass, headland (the edge rounds and the turn at a line's end), and AUTO / AUTOMATIC / Automatic (three meanings).
  - It uses one feature name too many: GPS, Steering Assist and steering.
- **Resolution:**
  - Open the spec with Goal and Behaviour.
  - Turn the game section into the Data contract, every row unverified.
  - Link the rules instead of copying them.
  - Add the Alternatives and Risks below.
  - Ask Vincent how often he leaves AUTO, setting by setting.

### 🟢 Nit

- **Show Lines is game-wide.** It is a `g_gameSettings` value (`AIAutomaticSteering.lua:922-925`). Cruise deactivation and the course settings are per vehicle. Label it "Lines in game · every vehicle", and say the dashboard always draws its own.
- **Cruise Control Deactivation's meaning and setter are unknown.** The default is `true` (`:157`), and true turns cruise off before the line end (`:405-411`). The screenshot shows MANUAL. "Automatic = true" is inferred. Reword it as something like "Cruise off before line end: On / Off", and expect the Cruise button to go dark without a tap.
- **Steering turning itself off is not "Failed".** The button follows the game's state quietly.
- **Night colours for the lines.** Name tokens for to-do, done and this line, checked against the trail (`web/src/themes/newholland/theme.css:186-187`) in both palettes, with no yellow at night.
- **"No GPS key" means never pressing it, not unbinding it.** An unbound key may not register its event (inferred). Add a live check with the key unbound.
- **`Commands.lua` is large** (about 1,750 lines). Game calls go in `Api.lua`, readers in `state/Steering.lua`, and only thin ACTIONS entries in Commands.
- **Commands need the player in the vehicle** (`Commands.lua:1391-1394`). Settings can't be prepared from the office iPad on foot; state it in the spec.
- **Contract fields get a course** (`AIAutomaticSteering.lua:454`), but the field panel shows only your own fields. Say what it shows there.
- **Vehicles without Steering Assist** (no `spec_aiModeSelection`, such as loaders and trucks) have no card. What the vehicle is decides it.
- **Rewrite modDesc's description.** It promises "never your savegames" (`mod/modDesc.xml:10`), but mode and settings will persist through the game's own save.
- **Live check rows** for Precision Farming on and off, a bare tractor, and a multiplayer host.
- **Time left could learn the player's rhythm:** seconds per metre of line plus seconds per turn on this field, shown only after one line and one turn (inventive). An option for the spec.

### Inventive contradictions

Each one is stated as "improving X worsens Y", with the transform that removes it and the design move.

1. **Completeness against safety.**
   - **Contradiction:** setting all seven from the dashboard worsens safety and verifiability, because four names are unknown and the writes happen outside the dialog.
   - **Transform:** Intermediary (the dialog's own OK callback, on the game's own clone), Preliminary action (learn the names passively, from the savegame and a field dump), and Segmentation (three mechanisms).
   - **Move:** keys for steering and lines; the dialog's commit for the mode and the four course settings; the vehicle-setting setter for cruise, once found.
2. **Reuse against correctness.**
   - **Contradiction:** one button pressing the game's one AI key is wrong, because the key's job and the way it is pressed both change with the mode.
   - **Transform:** Extraction (take steering out of the shared key) and Segmentation (split by mode).
   - **Move:** the `TOGGLE_AI_STEERING` press, and a button that follows the mode (B1).
3. **Setup before the field against persistence.**
   - **Contradiction:** the game wipes the settings on any hitch change.
   - **Transform:** Inversion: after every rig change, show the game's own values as the truth. Self-Service (re-apply a profile) is rejected because it fights the game.
   - **Move:** set up after hitching; AUTO is right for most rigs.
4. **Flexibility against safety and progress.**
   - **Contradiction:** any setting at any time drops steering and the done lines.
   - **Transform:** Beforehand cushioning.
   - **Move:** the course settings fade while steering is on.
5. **An exact worked part against safety and truth.**
   - **Contradiction:** an exact worked part costs either safety (reading the ground) or truthfulness (one source answering two questions).
   - **Transform:** Segmentation (two marks, two names) and Blessing in disguise (where they disagree, a line was skipped).
   - **Move:** lines done from the game's line states; the worked area from the trail.
6. **Lines before the field (mis-stated).**
   - **The real tension:** the exact game course early, against "call only what the mod already calls".
   - **Transform:** Preliminary action from what the game already holds.
   - **Move:** the lines arrive by themselves on the field, and the last course is reused. A preview is a later spike.
7. **The game's keys against "no GPS key": no false compromise.**
   - The mod runs the key's own callback; the player never presses anything. Only the keyless settings carry a real trade-off (contradiction 1).
8. **A small, calm cab against the whole-field picture.**
   - **Transform:** Segmentation by attention, plus reuse.
   - **Move:**
     - the picture is the existing field panel, with one more layer at no per-frame cost;
     - setup is a panel off the driving surface, the same on both iPads.
9. **An exact finish time against turns done by hand.**
   - **Transform:** Dynamics.
   - **Move:** learn the time from the player's own passes and turns.

### Ideal Final Result

The game already builds the course when the tractor enters the field, and it keeps it, syncs it and saves it. The dashboard shows that course as it is. It changes the game only through the game's own steering key and the dialog's own OK. So the lines, the done passes and the progress arrive by themselves, and nothing the dashboard does can differ from pressing OK in the game's dialog.

| Question | Alternative | Distance from the Ideal Final Result |
| --- | --- | --- |
| Settings | Mode only; everything else AUTO, the game's default | Closest, but misses the values the player sets |
| Settings | The dialog's own commit, on the game's own clone | Close |
| Settings | Writing `FieldCourseSettings` fields directly | Far: loses AUTO and the save |
| Settings | A companion profile that re-applies them | Far: fights the game's reset |
| Settings | Opening the game's dialog from the dashboard | Fails the want ("no menu") |
| Steering press | `TOGGLE_AI_STEERING` | At it |
| Steering press | `TOGGLE_AI` | Wrong (B1) |
| Lines done | The game's line states | Close; their meaning, and whether they survive a reload, are still to probe |
| Lines done | The trail | Partial: it answers a different question, and lives in memory only |
| Lines done | Our own course drawn from the outline | Far: duplicates the game and will disagree |
| Lines done | Reading the ground | Out: freeze risk |
| Field picture | A layer on the existing field panel | Close |
| Field picture | A new page, or the Map only | Further: a new piece, not in the cab |

## Goals vs. Non-Goals

**Goals, first (read and keys; can be specced now):**
- **What the dashboard shows:** whether Steering Assist is set, has a course, and is steering. It also shows why it isn't ready, in the game's words.
- **One button:** steering on and off through the game's own steering key, via the one Drive button whose job follows the mode. The AI worker button is fixed in the same change.
- **Show Lines** through its own key, labelled as applying to every vehicle.
- **The settings as the game holds them**, shown as "Auto" or a value, never a cached copy.
- **Once the game has built the course** (after the probes): its lanes big on a GPS screen of its own, lanes and headland rounds done, the worked part, and one time-left in real time.
- **Everywhere:**
  - The same on every tablet, because it comes from the game. After a reload too, if probe 1 shows the line states are saved with the course.
  - It works with Precision Farming on and off, and on any tablet down to 1158×676.

**Goals, later (staged, not refused):**
- **The mode** from the dashboard, if Vincent accepts the setter exception. It can join the first spec if he decides early.
- **The four course settings:**
  - through the dialog's own commit, as one Apply;
  - only while steering is off;
  - ok only once the game reads them back;
  - host only until checked on a client.
- **Cruise Control Deactivation**, once its setter and its meaning are found.

**Non-goals, kept out:**
- Lines before reaching the field, or the mod generating or previewing a course.
- A lightbar, off-line distance, GNSS accuracy, or a 10 Hz guidance topic.
- Automating headland turns, or raising, lowering or turning the tool.
- Reading the game's ground state or the completion getters.
- A mod-side coverage collector, or work done in the companion.
- Progress or presets kept by the companion or the browser.
- Re-applying settings after a hitch change.
- Opening the game's AI Settings dialog from the dashboard.
- Settings for a vehicle the player isn't in.
- Hiring an AI worker: still PLAN.md's own item.
- Headland geometry beyond lines, unless the probe shows it is cheap.

## Alternatives Weighed

| # | Alternative | Cost | Value | Verdict |
| --- | --- | --- | --- | --- |
| A0 | Nothing new: set the mode once per tractor in the game (it is saved), keep AUTO | None | Low | The baseline |
| A1 | Web only: time left and work rate on the field panel, from the trail %, `rates.js` area and the field's area | Very low, no mod change | Medium-high, for any tool | Worth it; can ship as a 0013 revision ahead of the rest |
| A2 | Steering state plus the game's keys: `cab.steering`, the mode-aware Drive button, Show Lines | Low: known names, keys only | Medium; fixes B1 | First spec |
| A3 | Mode setter (`setAIModeSelection`, guarded, ok on read-back) | Low-medium: a rule exception | Medium | With Vincent's decision; joins A2 or follows it |
| A4 | Read the course: a lines layer, lines done, the course's own width and headlands read back | Medium: probe, collector, topic, panel layer | High: the "bigger field picture" | Second spec, after Stage 0 |
| A4b | Counts only: `cab.steering` gives line i of n, lines done and the state; no geometry topic; the existing panel and trail cover the map | Low | Medium: no course lines on screen | The fallback if probe 3 finds the geometry unreadable or too large |
| A5 | Cruise Control Deactivation writer | Medium: setter unknown | Low: set once | Later |
| A6 | The four settings through the dialog's commit, one Apply, direction first | High (B2) | Depends on how often Vincent leaves AUTO | Last, after a write spike |
| A6b | Write `FieldCourseSettings` fields directly, or call `setAIModeFieldCourseSettings` | Low code, high risk | Negative | Rejected: loses AUTO and the save, and skips the network event |
| A7 | A dashboard button that opens the game's own dialog (hold `TOGGLE_AI`) | Low-medium | Low | Rejected: fails "no menu", and held controls are ruled out (`docs/PLAN.md:49-51`) |
| A8 | Read the worked part from the game's ground (density maps, completion getters) | High | Marginal over the trail | Rejected: freeze risk |
| A9 | Lines drawn in the browser from the outline, width and direction (a preview before the field) | Medium | An estimate that will disagree with the game's real course | Rejected as truth; maybe a later idea |
| A10 | The companion reads the savegame's `vehicles.xml` | Low | Only as fresh as the last save | Use it as the zero-risk probe, not as a feed |
| A11 | A companion profile that re-applies settings after each hitch | Medium, plus a new store | Fights the game's reset | Rejected for now |
| A12 | Per-setting `.set` commands against one Apply | Per-setting keeps Protocol v1; Apply needs a new attribute | Apply matches the dialog's single OK, with one rebuild | Decide in the settings spec |
| A13 | Where it lives: a GPS page, a field panel layer, or a Map layer | Page high; layer low | The panel is already in the cab | Field panel layer; optional Map layer |
| A14 | A second steering button beside the AI worker button | Low | Breaks "one control per action"; Drive is full | Rejected (B1) |

## Key Decisions & Staging for Next Steps

**Decisions for Vincent before any spec:** answered on 2026-11-17 (see After the review). Still open:
- A headland counter of its own beside the lanes ("Headland 1 of 2 · Lane 21 of 60")?
- Where "worked even when the lanes are ignored" comes from (the three options under answer 5).

**Staging**
- **Stage 0: probes, safest first.** On a copy of the save, using the existing spike (`research/spike/FS25_CompanionSpike`). Each probe is a mid-term exam.
  1. **No game code.** Set non-AUTO values for all four settings and a set direction in the game's dialog, steer two lines, save, and read `vehicles.xml`:
     - `aiModeSelection#currentMode` and `.settings`, for the names, the AUTO encoding and the direction's unit;
     - `aiAutomaticSteering.steeringFieldCourse`, to see whether the save holds the lines and their states.

     Save once more with everything on AUTO, and compare.
  2. **Class tables only:** constants and function names, no calls. That covers MODE, STATE and `MODE_CHANGE_DURATION`, and `FieldCourseSettings`, `AIUserSettings` and `SteeringFieldCourse`.
  3. **Shallow field dumps** of `spec_aiModeSelection`, its two settings objects, `spec_aiAutomaticSteering` and the course. Take them:
     - before and after each dialog change;
     - after one steered line and one line driven by hand;
     - after an attach or detach.

     Record the size and the encode time of the would-be topic.
  4. **Live keys:** whether `TOGGLE_AI_STEERING` and `TOGGLE_AI_STEERING_LINES` exist and are active in each mode and state. Read Show Lines through `g_gameSettings`.
  5. **Presses:** a trace of a real `TOGGLE_AI` tap, then the two steering keys, then `TOGGLE_AI` as 1 followed by 0. This settles B1.
  6. **New calls last, one per session.** After each one, drive, engage, save, reload and open the game's dialog to compare:
     - `getIsAutomaticSteeringAllowed`;
     - `setAIModeSelection`;
     - the vehicle setting's setter;
     - `aiModeSettingsChanged` with one value changed;
     - then a multiplayer client.

     Never call `getAttacherToolWorkingWidth`, `FieldCourseSettings.generate`, `findClosestField` or `generateFieldCourseAtWorldPos`.
- **Stage 1 (optional, web only):** time left and work rate on the field panel (A1). Its exam: one field worked, with the estimate checked against the clock.
- **Stage 2: spec 0020, "Steering Assist: state and keys"** (A2, plus A3 if accepted). It can start after probes 4 and 5.
  - Its exam: one tractor and a cultivator on Solek.
  - The mode is read; the state goes DISABLED, then AVAILABLE on the field; a tap makes it ACTIVE.
  - A wheel move drops it, and the dashboard follows.
  - Lines toggle; the Drive button is right in both modes.
  - Precision Farming on and off.
- **Stage 3: spec 0021, "Steering Assist: the course on the field"** (A4, or A4b if the geometry can't be read), after probes 1 to 3.
  - Its exam: the dashboard's lines match the game's drawn lines, and lines done steps once per line. It also survives a save and reload, if probe 1 shows the line states are saved.
- **Stage 4: spec 0022, "Steering Assist: the course settings"** (A6, then A5), after probe 6, one setting at a time.
  - Its final exam:
    - set all of them from the dashboard, and the game's dialog shows the same;
    - rehitch, and they show Auto;
    - save and reload, and they stay;
    - with the GPS key unbound and with Precision Farming off.

**Same-change housekeeping for each spec**
- Data contract rows marked unverified, citing the `gs\` line or the probe dump.
- A "never called" row.
- The spec's own row in `specs/README.md`.
- Edits to 0008's `ai.set` row and PLAN.md's AI worker items, made with spec 0020.
- The ARCHITECTURE.md exception paragraph, if A3 or A6 is accepted.
- The `hello.commands.actions` gate raised to 5.
- A `mod/modDesc.xml` version bump, and its description reworded.
- After each live check, verified names moved into `docs/GAME-API.md`.
