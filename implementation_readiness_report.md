# Stage 9: Implementation Readiness Test (round 1)

**Target:** `specs/0020-steering-assist-state.md`, DetailedRange lines 118–236 (Plan, Acceptance, Decisions, Out of scope, Log). Lines 1–117 were read as the design the Plan has to build.
**Standards:** `implementation-readiness-standard.md` for the readiness and code-accuracy reviewers; none for style.
**Context given to reviewers:** the same nine files as before.

## Reviewer Status

| Reviewer | Status | Raw count |
| --- | --- | --- |
| `egm-implementation-readiness` | completed | 1 Blocker, 7 Major, 2 Nit |
| `egm-codebase-details` | completed | 6 Major, 4 Nit |
| `egm-style` | completed | 2 Major, 14 Nit |

**After merging:** 1 Blocker, 8 Major and 6 Nit groups. **Verdict: not ready to build.**

The design in lines 1–117 holds up. Both code reviewers re-checked its claims, and these are accurate:
- `when` runs before `already`;
- a faded tap sends nothing;
- the golden test is unchanged;
- `actions = 5` is safe for the companion;
- the spike0012 dumps;
- `liveKey`, `enumName` and `replay-solek` all exist.

The gaps are in the Plan and the tests.

**Claims I checked in the code myself; all hold:**
- `mod/src/Companion.lua:16` is `"0.20.5"`, and `mod/tests/test_version.py` requires it to match modDesc's `<version>`.
- `mod/modDesc.xml` lists every source file (lines 15–41); `src/state/Rig.lua` is at 23 and `src/Commands.lua` at 24.
- `mod/tests/run.lua` keeps its own load list (27–36) and asserts `actions` 4 at lines 993 and 5093.
- On the vehicle path, `run()` uses a job only when one is returned (`Commands.lua:1446–1451`). With no job, it falls through to `inputs` and then "not available now" (1453–1470).
- `contractJob` (`Commands.lua:962–980`) is "ok the frame `done()` reads true, else 'didn't change' after `CONTRACT_WAIT_FRAMES` (10), `checked`". That is the behaviour the spec describes. `timeScaleJob` presses repeatedly and answers "didn't move".
- `companion/tests/test_commands.py:172–183` finds only *literal* action strings in `web/src`.
- `SpikeRigs.binding()` and `SpikeRigs.register()` exist (`mod/tests/spike_rigs.lua:168, 175`).
- `ICON_GROUPS` lists **82** icons today. THEMES.md still says 81.

---

## Blocker

### R1. The Plan misses three edits without which the mod breaks in game while every test passes

* **Reviewers:** readiness (F1), code accuracy (M1, M5)
* **Lines:** Plan 124–138
* **What is wrong:**
  - **The new file never loads in game.** `mod/modDesc.xml` needs `<sourceFile filename="src/state/Steering.lua"/>` between `src/state/Rig.lua` and `src/Commands.lua`. The game loads only the listed files, and no test compares that list with `mod/src/`.
    - Without the line, the tests pass, but in game the steering reader is nil.
    - `Cab.lua` then fails every frame, and the Scheduler's one `pcall` drops the whole `cab` topic. Every control on the dashboard goes unavailable.
  - **The version test fails.** `Companion.VERSION` (`mod/src/Companion.lua:16`) must become `"0.21.0"` along with modDesc, or `test_version.py` fails. The Plan names only modDesc.
  - **The test harness never loads the file, and two asserts break.**
    - `mod/tests/run.lua` needs `load("src/state/Steering.lua")` after Rig.lua.
    - Its asserts at lines 993 and 5093 expect `actions` 4.
  - **Created and changed files aren't marked.** Only `Steering.lua` is marked new.
* **Proposed fix:** add a short **Files** list to the Plan, with each path marked new or changed. Include:
  - the modDesc source line and where it goes;
  - `Companion.VERSION`;
  - `run.lua`'s load line and its two `actions` asserts;
  - the test files (`mod/tests/run.lua`, `web/test.html`);
  - the docs (see N3).

## Major

### R2. The spike can't be run as written, and nothing says what happens if it disagrees

* **Reviewers:** readiness (F2), code accuracy (M6)
* **Lines:** Plan 120–123, Risks 140–142
* **What is wrong:**
  - **Nothing to run is named:** no spike version, console command, output file or fixture folder.
    - The existing spike is `research/spike/FS25_CompanionSpike/` at 0.0.14.
    - `csParts` already dumps each spec's registered keys (it produced spike0012), and `describe()` dumps plain fields.
  - **It misses two reads.**
    - `AIModeSelection.MODE`'s key names, which the `mode` compare depends on.
    - The path `canSteer` actually reads: `spec_aiAutomaticSteering.actionEvents.TOGGLE_AI_STEERING.actionEventId` into `g_inputBinding.events`.
  - **No gate.** If the dump contradicts the Data contract, the implementer has to redesign mid-build.
* **Proposed fix:**
  - Name the spike step: spike 0.0.15, `csParts` plus a `describe()` of the two specs, and fixtures in `mod/tests/fixtures/spike0020/`.
  - Add the two missing reads.
  - List the rigs: both modes; off, ready and steering; on and off the field; one vehicle with no Steering Assist.
  - Add one gate line: if the dump disagrees with the Data contract, update the contract and stop for approval before step 2.

### R3. The read layer has no stated shape, and "a failing read drops only `steering`" has no mechanism

* **Reviewers:** readiness (F3), code accuracy (M2), style (M2)
* **Lines:** Plan 124–126, Acceptance 147–150
* **What is wrong:**
  - **No name or return shape** for the reader.
  - **Cache or plain reader?** "Reads them once a frame" could mean either. Every other `state/` file is a plain reader.
  - **No guard in `Cab.lua`.** `cabOf` has no per-field guard, so an error in the steering read drops the whole topic. The precedent is the `pcall` around `dumpReverseCruise` (`Cab.lua:121`).
  - **Two edge cases are undefined:**
    - **No event registered:** `liveKey` returns nil. Is `canSteer` then false, or is `steering` absent? Decision 204–205 needs false, so the button fades.
    - **Unreadable mode:** `currentMode` matches neither name, or `MODE` is missing. Is `steering` then absent?
* **Proposed fix**, one or two lines in the Plan:
  - `VehicleState.steering(vehicle)` returns `{mode, state, canSteer}` or nil. It is a plain reader, with no cache.
  - Cab.lua calls it inside a `pcall`, as it does `dumpReverseCruise`.
  - No event registered → `canSteer` false, and `steering` is still sent.
  - An unreadable mode → `steering` absent.
  - The test makes a read fail with a raising metatable on the spec.

### R4. `steering.set` copies the wrong job, and its press may hit a different event than the fade reads

* **Reviewers:** readiness (F4), code accuracy (M3); style (N4)
* **Lines:** Plan 127–129. It also reaches Commands 104–107, which name spec 0017's wait.
* **What is wrong:**
  - **The wrong template.** The behaviour the spec describes (press once, wait, ok `checked` or "didn't change") is `contractJob`, not `timeScaleJob`. Copying `timeScaleJob` gives the wrong reason text ("didn't move") and repeated presses.
  - **The wait has no number or name.** Acceptance's "within the wait" needs a named constant to drive the tests. Both existing waits are 10 frames.
  - **The entry must have no `inputs`.**
    - On the vehicle path, a nil job falls through to `inputs`.
    - With `inputs = {"TOGGLE_AI_STEERING"}`, "no live event" would become an unchecked press.
    - With no `inputs`, it becomes "not available now", which is what the spec says.
  - **The press target isn't stated.**
    - `runInputAction` with no target presses every active event for the key, whatever object it belongs to. `canSteer` reads this vehicle's event only.
    - Decision 213–215 ("the fade agrees with what a press would find") holds only if the press targets the vehicle: `runInputAction("TOGGLE_AI_STEERING", nil, vehicle)`.
  - **`ai.set`'s new check isn't scoped.** Say that it refuses only when the mode reads `"steeringAssist"`, and works as today when `steering` is absent or unreadable.
* **Proposed fix:**
  - **Commands step 3:** replace "as the game speed command waits (spec 0017)" with "as the contract commands wait (spec 0019)".
  - **Plan step 3:** a job in the style of `contractJob`:
    - the entry has `when`, `state` and `job`, and no `inputs`;
    - the job returns nil when the vehicle's event isn't live;
    - it presses once, targeted at the vehicle;
    - it waits `Commands.STEERING_WAIT_FRAMES` (10);
    - `via = "TOGGLE_AI_STEERING"`, and `checked` on both answers.
  - **`ai.set`:** refused only when the mode reads `"steeringAssist"`.

### R5. How the Drive button changes its action and label is left to the implementer, and the test that guards actions can't see it

* **Reviewers:** readiness (F5), code accuracy (M4)
* **Lines:** Plan 132–134
* **What is wrong:**
  - **A fixed action is assumed in four places:** `ControlDef.action` is a fixed string, and `pressOf`, `controlGroup` and `controlTiles` all depend on it (`controls.js:40, 465–468, 481, 551`).
  - **The action guard can't see a computed name.** `test_commands.py:172–183` catches only literal strings. If the action is computed, `"steering.set"` escapes the guard that checks the mod runs every action the web sends.
  - **The label sticks.** `setLabel` keeps the last label (`control.js:254–264`). So `labels` must also return "AI worker" with the `aiWorker` icon in AI worker mode and without `cab.steering`. Otherwise "Steering" stays on a loader after a vehicle change.
  - **Labels while faded.** Changing the shared loop for every control would change what other faded buttons show (Unload, Lower, Fold and others).
  - **The control id** `aiWorker` is used in `themes/newholland/theme.js:36` and `web/test.html`.
* **Proposed fix**, one Plan bullet:
  - The `aiWorker` control (same id) gains an `actionOf(v, cab)` beside its literal `action: "ai.set"`, returning `"steering.set"` in Steering Assist mode.
  - The literal `"steering.set"` sits in the code where the guard's pattern finds it.
  - `labels` always answers ("AI worker" / `aiWorker`, or "Steering" / the new icon).
  - Only this control sets its label while faded.

### R6. The new icon has no name, group, picture or approval step

* **Reviewers:** readiness (F6), code accuracy (N1)
* **Lines:** Plan 135–137
* **What is wrong:**
  - **Nothing about the icon is decided.** It has no id, no `ICON_GROUPS` group and no picture, and choosing the picture is a design decision.
  - **No approval step.** THEMES.md says icons are reviewed on `web/tools/icons.html` before a screen uses them.
  - **The count is already wrong:**
    - `ICON_GROUPS` holds 82 icons (checked), but THEMES.md says 81 in three places (402, 441, 446);
    - with Steering it becomes 83.
  - **The icon test misses it.** The "every control's icon exists" check in `web/test.html` reads only `def.icon`, so an icon set through `labels` is covered only by being listed in `ICON_GROUPS`.
* **Proposed fix:**
  - Icon `steering`, in the Controls group. The picture is yours to describe; a steering wheel with a lane line is one option.
  - Reviewed on the contact sheet before the web uses it.
  - THEMES.md's count becomes 83 in all three places.

### R7. The button's label is still an open question

* **Reviewers:** readiness (F7), code accuracy (N3), style (N12)
* **Lines:** Out of scope 1 (219), against Behaviour 27, 32 and Acceptance 158–159
* **What is wrong:**
  - Open question 1 still asks "Steering" or the game's "Lane".
  - Meanwhile Behaviour, the web test and the THEMES.md Drive line all fix "Steering".
  - So the implementer would choose a visible string that the tests and docs depend on.
* **Proposed fix:** your decision. Either settle it and record it in Decisions, or write "Steering, unless changed at approval".

### R8. The tests miss cases the change touches

* **Reviewers:** readiness (F8), code accuracy (M5); style (outside its lens)
* **Lines:** Acceptance 146–166
* **Missing in the mod tests (`mod/tests/run.lua`):**
  - **actions 5:** hello reports it, and the asserts at 993 and 5093 change.
  - **`ai.set` in AI worker mode:** with `spec_aiModeSelection` present, it still presses `TOGGLE_AI`. This guards the worker against the new check.
  - **An unreadable mode:** `steering` absent, and what each command answers then.
  - **No event registered:** `canSteer` is false.
  - **The fade and the press agree.** This needs a fake event both `liveKey` and `runInputAction` reach.
    - The usual `bindInputs` helper (run.lua:852–867) builds only the press side, so `canSteer` would always read false.
    - `SpikeRigs.register` builds both sides. Name it as the harness.
* **Missing in the web tests (`web/test.html`):**
  - **AI worker mode with `cab.steering` present:** a tap sends `ai.set`. Choosing the action by mode is the core of the change.
  - **Switching back** from Steering Assist mode to no `cab.steering`: the label and icon go back to "AI worker".
  - **The icon** changes by mode (`data-icon`).
* **Proposed fix:** add these as rows.

### R9. The AI worker Decision's cost doesn't say what the player would see

* **Reviewer:** style (M1)
* **Lines:** Decisions 195–199
* **What is wrong:**
  - "Whether a dashboard tap leaves the game's H hold timer armed" names a mechanism, not what the player sees.
  - The consequence is written only in the brief, which is deleted on approval: the player's next press of H may open the AI Settings dialog at once.
* **Proposed fix:** "Cost: in AI worker mode a dashboard tap presses `TOGGLE_AI` once with no release. If that leaves the game's hold timer running, the player's next press of H may open the AI Settings dialog at once. Not checked; PLAN.md's AI worker item holds it."

---

## Nits

| # | Finding | Reviewers |
| --- | --- | --- |
| N1 | **The Plan's shape.** No test checkpoint per step. The order doesn't show tests written first (CLAUDE.md). Risks is numbered as a step. It doesn't say steps 2–5 ship as one change; if only the mod side ships, the web's button in Steering Assist mode sends `ai.set` and shows "Failed". | readiness, code accuracy |
| N2 | **Live-check gaps.** No vehicle without Steering Assist (the button as today). Only a wheel move is checked among the ways steering turns off. `scripts/livewatch.py` isn't mentioned. "A patched `cab`" has no written method, though the method is in use. | readiness, code accuracy, style |
| N3 | **Docs the Plan doesn't list:** `mod/README.md` (the state/ list, the `cab` row); the `actions` comment in `web/src/types.js` (48–52); `Cab.lua`'s header; the `actions` comments in `Commands.lua` (lines 5, 1292–1295). Also `docs/THEMES.md` and `specs/0008…` by their repo paths. | readiness, code accuracy |
| N4 | **Claims stated more firmly than shown:** "can never open the dialog" (190) and "never opens the dialog by itself" (179) rest on unverified game source. "Every game name is unverified" (141) ignores the two verified rows. "Is to be redesigned in its own spec" (196–198) presents a PLAN.md idea as a commitment. | style |
| N5 | **Wording:** inconsistent words for the button's look (173 "ready", 176 "goes out", 159–160). Terse phrases (122–124, 127–128, 214, 221). Two stacked colons (192–194). Word order (201–203). The mode and Show Lines Decisions could be one (209–212). The Log's "`whyNot` dropped" and its pointer to untracked reports (232–235). | style |
| N6 | **Small scope notes:** a multiplayer client is "not checked", but nothing says whether the command runs there (224). The golden test's reason could name the fake mod's `actions` number (157). | style, readiness |

---

## Notes for weighing these (mine, not the reviewers')

**The standard asks for more than the project template wants.**
- The implementation-readiness standard asks for a plan with zero decisions left and an exact list of files that may be written.
- `specs/_template.md` says the Plan is "a checklist for the build, not a design document. Keep it short."
- So the fixes above are deliberately one or two lines each: names, a file list, edge-case rules. They are not code. I would decline anything longer, such as full Lua entries or signatures for every Api function.

**R1 is the one to fix whatever else you decide.** It is a real silent failure: a mod that passes every test and loses the whole cab topic in game.

**R4 changes one line in the feature part.** Commands step 3 names the wrong precedent.

**Two decisions are yours:**
- **R6:** the icon's picture.
- **R7:** the label, "Steering" or "Lane".

Everything else can be fixed without you.

**Outside the spec:**
- THEMES.md's icon count (81 against 82) is already out of date. That is a `docs/NEXT.md`-sized fix, or it rides along with this spec's step 4.
- "A patched `cab`" in replay checks is used by specs 0011, 0013, 0017 and 0019, but no repo doc says how it is done.
