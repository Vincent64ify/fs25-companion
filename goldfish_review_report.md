# Goldfish Annotated Review Report

Status: resolved

**Target:** `specs/0020-steering-assist-state.md`, DetailedRange lines 118–236 (Plan to Log), plus one line in Commands (104–107) that R4 reaches.
**Findings from:** `implementation_readiness_report.md` (Stage 9, round 1).

**Summary:** 15 findings, ordered by severity.
- **PROPOSE FIX:** 14 (R1–R9, N1–N5). Two of them need your choice first: the icon's picture (R6) and the label (R7). N2 is fixed only in part.
- **DECLINE:** 3 (two parts of N2, and N6). They are listed, with reasons, under Declined.
- **CONTEST:** 0. **ESCALATE:** 0.

The fixes stay short, as `specs/_template.md` asks ("a checklist for the build, not a design document"). They are names, a file list and rules for edge cases, not code.

---

## Prioritized Findings & AI Suggestions

### [R1] [`egm-implementation-readiness`, `egm-codebase-details`]: Severity: Blocker
* **Affected Scope:** [Lines 124-138](specs/0020-steering-assist-state.md#L124-L138) (Plan)
* **Discrepancy Description:** The Plan misses three edits. `mod/modDesc.xml` needs a `<sourceFile>` line for `src/state/Steering.lua`, `Companion.VERSION` needs the bump, and `mod/tests/run.lua` needs a load line and two `actions` asserts changed. No path is marked new or changed.
* **Rationale:** Without the modDesc line every test passes, but in game the reader is nil. The cab collect then fails every frame and the whole `cab` topic is lost. `test_version.py` fails without the version bump.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Checked in the code: `Companion.lua:16`, `modDesc.xml:15–41`, `run.lua:27–36, 993, 5093`.
* ***Proposed Edit:***
    * Location: Plan, a new **Files** list after step 5, plus a version line.
    * Change: list every file, marked new or changed:
      - **New:**
        - `mod/src/state/Steering.lua`
        - `mod/tests/fixtures/spike0020/`
      - **Changed, mod:**
        - `mod/src/Api.lua`, `mod/src/collectors/Cab.lua` (with its header), `mod/src/Commands.lua`
        - `mod/modDesc.xml`: `<version>` 0.21.0, and `<sourceFile filename="src/state/Steering.lua"/>` between `src/state/Rig.lua` and `src/Commands.lua`
        - `mod/src/Companion.lua`: `Companion.VERSION = "0.21.0"`
        - `mod/tests/run.lua`: `load("src/state/Steering.lua")` after Rig.lua; its `actions` asserts go from 4 to 5
        - `research/spike/FS25_CompanionSpike/`, at 0.0.15
      - **Changed, web:** `web/src/types.js`, `web/src/widgets/controls.js`, `web/src/ui/icons.js`, `web/test.html`
      - **Changed, docs:** `docs/THEMES.md`, `mod/README.md`, `specs/0008-commands-say-the-state.md`

### [R2] [`egm-implementation-readiness`, `egm-codebase-details`]: Severity: Major
* **Affected Scope:** [Lines 120-123](specs/0020-steering-assist-state.md#L120-L123) (Plan step 1)
* **Discrepancy Description:** The spike names no version, command, output or fixture folder. It misses `AIModeSelection.MODE`'s names and the event path `canSteer` reads. It has no gate if it disagrees with the Data contract.
* **Rationale:** Steps 2–5 rest on unverified names. Without a gate, the implementer redesigns in the middle of the build.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** The spike already has `csParts` (which produced spike0012) and `describe()`.
* ***Proposed Edit:***
    * Location: Plan step 1.
    * Change: "**Spike (read only, no calls),** 0.0.15:
      - `csParts`, plus a `describe()` of `spec_aiModeSelection`'s and `spec_aiAutomaticSteering`'s plain fields;
      - `AIModeSelection.MODE`'s key names;
      - `TOGGLE_AI_STEERING`'s event, through `spec_aiAutomaticSteering.actionEvents` into `g_inputBinding.events`, as `VehicleState.liveKey` walks it.

      Rigs: both modes; off, ready and steering; on and off the field; one vehicle without Steering Assist. Dumps go to `mod/tests/fixtures/spike0020/`. **Gate:** if a dump disagrees with the Data contract, update the contract and get it approved before step 2."

### [R3] [`egm-implementation-readiness`, `egm-codebase-details`, `egm-style`]: Severity: Major
* **Affected Scope:** [Lines 124-126](specs/0020-steering-assist-state.md#L124-L126), [147-150](specs/0020-steering-assist-state.md#L147-L150)
* **Discrepancy Description:** Several things about the reader are unstated:
  - its name and return shape;
  - whether it caches;
  - how `Cab.lua` keeps a failing read from dropping the whole topic;
  - what `canSteer` is with no event registered;
  - what happens with an unreadable mode.
* **Rationale:** Each is a choice the implementer would make alone.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** `Cab.lua:121` already wraps `dumpReverseCruise` in a `pcall`, and every other `state/` file is a plain reader. Decision 204–205 needs `canSteer` false when no event is registered, so that the button fades.
* ***Proposed Edit:***
    * Location: Plan step 2.
    * Change:
      - "`VehicleState.steering(vehicle)` is a plain reader (no cache). It returns `{mode, state, canSteer}`, or nil without Steering Assist or with a mode that matches neither name."
      - "`canSteer` is `liveKey`'s `active`; no event registered reads false, and `steering` is still sent."
      - "`Cab.lua` calls it inside a `pcall`, as it does `dumpReverseCruise`."

### [R4] [`egm-implementation-readiness`, `egm-codebase-details`, `egm-style`]: Severity: Major
* **Affected Scope:** [Lines 127-129](specs/0020-steering-assist-state.md#L127-L129); Commands [104-107](specs/0020-steering-assist-state.md#L104-L107)
* **Discrepancy Description:** `steering.set` copies `timeScaleJob`, which presses repeatedly and answers "didn't move". The behaviour described is `contractJob`'s.
  - The wait has no name or number.
  - Whether the entry carries `inputs` decides what "no live event" answers.
  - The press target isn't stated, so it may hit a different event than the fade reads.
  - `ai.set`'s check isn't scoped.
* **Rationale:** On the vehicle path, a nil job falls through to `inputs` (`Commands.lua:1446–1470`, checked). With no target, `runInputAction` presses every active event for the key.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** `contractJob` (`Commands.lua:962–980`) is "ok the frame `done()` reads true, else 'didn't change' after 10 frames, `checked`", which is the spec's behaviour exactly.
* ***Proposed Edit:***
    * **Commands step 3:** "presses the vehicle's `TOGGLE_AI_STEERING` once, then reads `steeringEnabled` each frame for a few frames, as the contract commands wait ([spec 0019](0019-contract-actions.md))".
    * **Plan step 3, the `steering.set` entry:** `when` (the two refusals), `state` (`steeringEnabled`), and a job in the style of `contractJob`, with no `inputs`.
      - The job returns nil when the vehicle's event isn't live, so the answer is "not available now".
      - Otherwise it presses once with `runInputAction(name, nil, vehicle)`.
      - It answers ok the frame `steeringEnabled` reads the value asked for, and "didn't change" after `Commands.STEERING_WAIT_FRAMES` (10).
      - `via = "TOGGLE_AI_STEERING"`, and `checked` on both answers.
    * **Plan step 3, `ai.set`:** its `when` refuses only when the mode reads `"steeringAssist"`.
    * **Plan step 3, hello:** `Commands:info()` and its comments go to 5.

### [R5] [`egm-implementation-readiness`, `egm-codebase-details`]: Severity: Major
* **Affected Scope:** [Lines 132-134](specs/0020-steering-assist-state.md#L132-L134)
* **Discrepancy Description:** The spec doesn't say how the action changes by mode, and the guard test `test_commands.py:172–183` sees only literal action names. The label sticks (`setLabel` keeps the last one), the label change while faded isn't scoped to this control, and the control's id isn't stated.
* **Rationale:** A computed `"steering.set"` would escape the check that the mod runs every action the web sends. "Steering" would stay on a loader after a vehicle change.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Checked: the guard's pattern matches only `action: "…"`, `command: "…"`, `send("…")` and `sendCommand("…")`.
* ***Proposed Edit:***
    * Location: Plan step 4, the `controls.js` bullet.
    * Change:
      - The `aiWorker` control (same id) gains `actionOf(v, cab)` beside its literal `action: "ai.set"`. It returns `"steering.set"` in Steering Assist mode, written as a literal `action: "steering.set"` where the guard's pattern finds it.
      - `labels` always answers: "AI worker" with `aiWorker`, or "Steering" with `steering`.
      - Only this control sets its label while faded.

### [R6] [`egm-implementation-readiness`, `egm-codebase-details`]: Severity: Major: **needs your choice**
* **Affected Scope:** [Lines 135-137](specs/0020-steering-assist-state.md#L135-L137)
* **Discrepancy Description:** The icon has no id, group, picture or approval step. THEMES.md's count is already wrong: it says 81, but `ICON_GROUPS` holds 82.
* **Rationale:** Choosing the picture is a design decision.
* ***AI Suggestion:*** PROPOSE FIX, with a default picture you can replace.
* ***Justification:*** THEMES.md says icons are reviewed on `web/tools/icons.html` before a screen uses them.
* ***Proposed Edit:***
    * Location: Plan step 4, the icon bullet.
    * Change: "Icon `steering` in `ICON_GROUPS`' Controls group: **a steering wheel above a straight lane line** (default; yours to change), in the set's stroke style. It is reviewed on `web/tools/icons.html` before the web uses it." THEMES.md's count becomes 83 in all three places.

### [R7] [`egm-implementation-readiness`, `egm-codebase-details`, `egm-style`]: Severity: Major: **needs your choice**
* **Affected Scope:** [Line 219](specs/0020-steering-assist-state.md#L219), against Behaviour 27 and 32 and Acceptance 158
* **Discrepancy Description:** The label, "Steering" or "Lane", is still open, while Behaviour and the tests fix "Steering".
* **Rationale:** The implementer would be choosing a visible string.
* ***AI Suggestion:*** PROPOSE FIX, with "Steering" as the default.
* ***Justification:*** "Steering" names what the button does in any state. "Lane" is the game's word for the thing being steered along.
* ***Proposed Edit:***
    * Remove open question 1.
    * Add a Decision: "**The label is "Steering"** (Vincent, 2026-11-18): what the button does, lit or not. The game's "Lane" names the thing steered along."

### [R8] [`egm-implementation-readiness`, `egm-codebase-details`]: Severity: Major
* **Affected Scope:** [Lines 146-166](specs/0020-steering-assist-state.md#L146-L166) (Acceptance, automated)
* **Discrepancy Description:** These test rows are missing:
  - `actions` 5;
  - `ai.set` in AI worker mode with `spec_aiModeSelection` present;
  - an unreadable mode;
  - `canSteer` with no event;
  - the fade and the press agreeing (this needs `SpikeRigs.register`; `bindInputs` builds only the press side);
  - the web sending `ai.set` in AI worker mode with `cab.steering` present;
  - the label going back;
  - the icon changing by mode.
* **Rationale:** These are the changed paths.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Checked: `SpikeRigs.register` (`spike_rigs.lua:175`) builds both sides of a key.
* ***Proposed Edit:***
    * Location: Acceptance, automated.
    * Change: rewrite the three mod rows and the web row to cover these cases (the full text is in the edit). Add "hello says `actions` 5".

### [R9] [`egm-style`]: Severity: Major
* **Affected Scope:** [Lines 195-199](specs/0020-steering-assist-state.md#L195-L199)
* **Discrepancy Description:** The AI worker Decision's cost names a mechanism ("H hold timer armed"), not what the player would see.
* **Rationale:** The consequence is written only in the brief, which is deleted on approval.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** `concepts_brief.md:151`.
* ***Proposed Edit:***
    * Location: the same Decision.
    * Change: "Cost: in AI worker mode a dashboard tap presses `TOGGLE_AI` once with no release. If that leaves the game's hold timer running, the player's next press of H may open the AI Settings dialog at once. Not checked; PLAN.md's AI worker item holds it." Also: "a later spec may replace this press (PLAN.md's AI worker button idea)", in place of "is to be redesigned".

### [N1] [`egm-implementation-readiness`, `egm-codebase-details`]: Severity: Nit
* **Affected Scope:** [Lines 118-142](specs/0020-steering-assist-state.md#L118-L142)
* **Discrepancy Description:** The Plan has no test checkpoint per step and no "tests first". Risks is numbered as a step. Nothing says the steps ship as one change.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** If only the mod side ships, the button in Steering Assist mode sends `ai.set` and shows "Failed".
* ***Proposed Edit:***
    * Add an opening line: "Tests first (CLAUDE.md). Steps 2–4 ship as one change. Each step ends with `python -m pytest mod/tests companion/tests tests` green; step 4 also ends with `web/test.html` green."
    * Risks becomes an unnumbered line.

### [N2] [`egm-implementation-readiness`, `egm-style`]: Severity: Nit
* **Affected Scope:** [Lines 164-184](specs/0020-steering-assist-state.md#L164-L184)
* **Discrepancy Description:** The live check has no vehicle without Steering Assist. The replay row has no pass condition.
* ***AI Suggestion:*** PROPOSE FIX
* ***Proposed Edit:***
    * Add a live-check row: "**Without Steering Assist** (a loader or a truck): the button is as today."
    * Replay row: "…the Drive group keeps its two rows of three, and the label fits."

### [N3] [`egm-implementation-readiness`, `egm-codebase-details`]: Severity: Nit
* **Affected Scope:** [Lines 136-138](specs/0020-steering-assist-state.md#L136-L138)
* **Discrepancy Description:** These docs are missing from the Plan:
  - `mod/README.md`;
  - the `actions` comment in `types.js`;
  - Cab.lua's header;
  - Commands.lua's comments;
  - THEMES.md and spec 0008 given by their repo paths.
* ***AI Suggestion:*** PROPOSE FIX
* ***Proposed Edit:*** fold them into R1's Files list.

### [N4] [`egm-style`]: Severity: Nit
* **Affected Scope:** Lines [141](specs/0020-steering-assist-state.md#L141), [179](specs/0020-steering-assist-state.md#L179), [188-191](specs/0020-steering-assist-state.md#L188-L191), [196-198](specs/0020-steering-assist-state.md#L196-L198)
* **Discrepancy Description:** Some claims are stated more firmly than the evidence:
  - "can never open the dialog" and "never opens the dialog by itself" rest on unverified game source;
  - "every game name is unverified" ignores the two verified rows.
* ***AI Suggestion:*** PROPOSE FIX
* ***Proposed Edit:***
    * "per the game's source (AIAutomaticSteering.lua:887), a dashboard tap cannot open the dialog; the H row of the live check confirms it"
    * "a short press of H right after a dashboard tap toggles the lane and does not open the AI Settings dialog"
    * "the game names the Data contract marks unverified"
    * "acts only on a second call (the release)"

### [N5] [`egm-style`]: Severity: Nit
* **Affected Scope:** Lines 122-124, 159-160, 173, 176, 192-194, 201-203, 209-214, 221, 224, 232-236
* **Discrepancy Description:** Wording problems:
  - mixed words for the button's look;
  - terse phrases;
  - two stacked colons;
  - awkward word order;
  - two Decisions that say the same thing;
  - the multiplayer line doesn't say whether the command runs there;
  - the Log's pointers.
* ***AI Suggestion:*** PROPOSE FIX
* ***Proposed Edit:***
    * The looks: "reads Steering, unlit, not faded", "goes unlit", "steering with `canSteer` false: lit, not faded", "including while faded".
    * Merge the mode and Show Lines Decisions into one.
    * "`TOGGLE_AI_STEERING_LINES` registered and active, though Vincent never bound it".
    * "a field read instead of a game call every frame".
    * "`onField` moves to 0021 with it".
    * Multiplayer: "On a multiplayer client, `steering.set` presses the key as on a host; not checked live."
    * The Log names the five report files and glosses `whyNot`.

---

## Declined

| Finding | Why declined |
| --- | --- |
| **N2, part:** write down how "a patched `cab`" is done in replay checks | A convention used by specs 0011, 0013, 0017 and 0019, not something this spec should define. It belongs in a project doc, as a `docs/NEXT.md` item. |
| **N2, part:** live checks for every way steering turns off, and a `livewatch.py` line | One wheel move checks "follows quietly", and the others take the same path. CLAUDE.md already makes livewatch part of every live check. |
| **N6:** the golden test's reason | The replay fixture's hello comes from a recorded old mod, so its `actions` number doesn't change. "Unchanged" stands as written. |

Status: resolved (auto accept, 2026-11-18: all PROPOSE FIX items applied with the defaults, "Steering" and the wheel-and-lane icon).
