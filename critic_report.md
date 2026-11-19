# Stage 7: Critic Review (round 1)

**Target:** `specs/0020-steering-assist-state.md`, FeatureRange lines 1–98 (Goal, Behaviour, Data contract, Commands)
**Standards:** `feature-spec-standard.md` for the design and structure reviewers; none for style. The project template, `specs/_template.md`, was also used.
**Context given to reviewers:** the same nine files as Stage 5.

## Reviewer Status

| Reviewer | Status | Raw count |
| --- | --- | --- |
| `egm-design` | completed | 7 Major, 8 Nit |
| `egm-structural` | completed | 6 Major, 7 Nit |
| `egm-style` | completed | 3 Major, 12 Nit |

**After merging:** 10 Major, 0 Blocker, and 17 Nit groups. The round is **not clean**: every Major is still open.

The design reviewer says one Major (C7, the missing alternatives) could be read as a Blocker under the standard's own wording. Both it and the structure reviewer kept it at Major, because the spec does record one rejected alternative with a reason.

**Claims I checked in the code myself; all hold:**
- `web/src/widgets/controls.js:569` sets a label only when the reading is not `undefined`. So a faded button keeps its default label.
- `mod/src/Commands.lua:1395–1406` checks `when`, then `fits`, then answers `already`. A refusal that is not a `when` comes after `already`.
- Four spike0012 dumps (`arion-on`, `arion-off`, `rogator`, `dino`) list `TOGGLE_AI_STEERING` as registered with `"active": false` and `"visible": true`.
- `concepts_brief.md:116` records, from the game source, that attaching or detaching a tool can switch the mode back to Worker.

The **Seen before** column says whether an earlier stage of this review already raised the finding (S5 is `zoom_out_report.md`, S6 is `comprehension_report.md`).

---

## Major

| # | Finding | Reviewers | Seen before |
| --- | --- | --- | --- |
| C1 | A faded button that says "Failed" can't be built with today's control, and a faded button shows the wrong label | design | S5 M3 (the label part is new) |
| C2 | When lit and faded disagree, nothing says which wins; the lit and faded rules aren't limited to one mode | design, structural, style | S5 M3, S6 #5 |
| C3 | The Goal states the AI key fault as fact; the worker-mode result of the fix is unstated | design, structural, style | S5 M2, S6 #1 |
| C4 | `steering.set` assumes the state flips in the press frame, and reads two different values | design | new (S6 #6 in part) |
| C5 | The fallback isn't in Commands; "no live event" means two different things | design, structural | S5 M1, S6 #2, #3 |
| C6 | The mode also changes on a hitch, not only in the dialog | design | **new** |
| C7 | Alternatives and risks live only in a file that is deleted on approval | design, structural | **new** |
| C8 | The Goal gives no reason the player wants this | structural | **new** |
| C9 | The game API table claims more than has been checked | style, structural, design | S6 #9 (a Nit there) |
| C10 | The state words are overloaded and don't map to the game's names | style, structural, design | S6 #4 |

### C1. A faded button that says "Failed" can't be built with today's control, and a faded button shows the wrong label

* **Affected scope:** 28–30 and 56–58; carries into Plan step 4 (114–115) and Acceptance (136–137, 150)
* **What is wrong:**
  - **A faded tap sends nothing.** Faded is the control's `unavailable` state, and `web/src/ui/control.js:152` returns before sending in that state. A tap there does nothing and shows nothing, so "a tap says Failed" (29–30) is impossible as written.
  - **The precedents don't support it.** Attach (spec 0016) is faded and ignores taps. Spec 0017's "a tap says Failed" was on a control that was not faded.
  - **New: a faded button keeps the wrong label.** `controls.js:569` sets the label only when the reading isn't `undefined`. So a Steering Assist tractor that starts off the field (faded from its first frame) would show "AI worker" with its icon, which breaks line 25.
  - **The Plan misses the file.** Plan step 4 doesn't list `web/src/ui/control.js`.
* **Recommendation:**
  - **Pick one of two:**
    - (a) With no lane, the button stays pressable in its off look, the mod refuses, and the tap says "Failed".
    - (b) The button is faded, a tap does nothing, and lines 29–30, 137 and 150 change to match.
  - Either way, say the label and icon follow `mode` even while faded.
  - Add `ui/control.js` and `controls.js`' update loop to the Plan.

### C2. When lit and faded disagree, nothing says which wins; the lit and faded rules aren't limited to one mode

* **Affected scope:** 22–32, 51–52, 56–58
* **What is wrong:**
  - **Steering mode.** `canSteer` is defined only as "a tap could turn steering on now", so its value while steering, and in worker mode, is undefined. The control can show only one state (`controls.js:573`).
    - If `canSteer` reads false while steering (for example when the current segment is briefly empty), the lit button fades.
    - Under C1 option (b), the player then can't turn steering off from the dashboard.
  - **Worker mode.** Lines 56–58 ("`state` for lit, `canSteer` for faded") carry no mode condition. In worker mode the game builds no course, so `state` is `"off"` and `canSteer` is false. Built literally, the AI worker button would be faded and never lit.
  - **The Behaviour nesting adds to it.** "No lane under you" (28–30) and "a vehicle with no AI modes" (31–32) sit beside the two mode bullets. One list mixes two modes, a state of one mode, and a kind of vehicle.
* **Recommendation:**
  - Steering always wins: a lit button is never faded.
  - Define `canSteer` for every state, or leave it out while steering and in worker mode.
  - Scope lines 56–58: in Steering Assist mode, `state` for lit and `canSteer` for faded; in worker mode, the AI reading as today (spec 0008).
  - Nest "No lane under you" under Steering Assist mode.
  - Give the vehicle with no AI modes its own top-level bullet.
  - Add a web test for lit together with `canSteer` false.

### C3. The Goal states the AI key fault as fact; the worker-mode result of the fix is unstated

* **Affected scope:** Goal 16–18, Behaviour 24, Commands 88–93, table row 72
* **What is wrong:**
  - **The fault isn't established.**
    - The Goal says the button "presses the game's AI key down and never lets go, and the game acts on that key's release".
    - But row 72 marks the tap and hold behaviour unverified, and lines 90–93 make the fix depend on the spike.
    - The brief calls the reading inferred (`concepts_brief.md` 145, 149–152), and spec 0008's "ran and nothing showed" fits both readings.
  - **The fix changes a shipped control.**
    - Today a worker-mode tap visibly does nothing (spec 0008, 232–236).
    - If a release is added, the brief's reading is that the tap path runs and hires a worker (`concepts_brief.md:148`). What that does on a vehicle with no job set up is written nowhere, yet line 24 says "as today".
  - **`ai.set`'s answer is unspecified.** Nothing says whether it answers on the press frame or the release frame, or what it compares.
  - **Line 153 is an observation to record, not a check that can pass or fail.**
* **Recommendation:**
  - Make the Goal conditional. Style's wording: "the mod sends only the key-down; whether the game sees a release is the spike's question; if not, `ai.set` sends it."
  - State the expected worker-mode result for both spike outcomes.
  - Add to the spike a real released `TOGGLE_AI` tap in worker mode with no job.
  - Say when `ai.set` answers.
  - Turn line 153 into a check that can fail.

### C4. `steering.set` assumes the state flips in the press frame, and reads two different values

* **Affected scope:** 81–87, table rows 68–71
* **What is wrong:**
  - **The same-frame flip is assumed, not shown.** Line 84 reads `steeringEnabled` "in the same frame" and answers ok "when it changed". "Acts on key-down" says when the callback fires, not that the state changes within that frame, and no spike step in Plan 1 checks it.
  - **"Pressed, but nothing changed" has no answer.** If the flip lands a frame later, every tap says "Failed" while the button lights up.
  - **Two readings for one command.**
    - `already` compares `state == "steering"`, which comes from `getAIAutomaticSteeringState()`. Success compares `steeringEnabled`.
    - If the two can differ, `steering.set 0` could answer `already` while steering is still on.
    - Spec 0008 has each command compare the reading the cab reports.
* **Recommendation:**
  - Use one reading for both `already` and success.
  - Either add the same-frame flip to the spike, or use the checked wait that already exists (Commands.lua `checking`, as specs 0003 and 0014 do).
  - State the answer when nothing changed.
  - Say what happens on a multiplayer client, even if only "unchecked, see Out of scope 4".

### C5. The fallback isn't in Commands; "no live event" means two different things

* **Affected scope:** Commands 81–87 (line 86 especially); `_template.md` 34–37; Plan 117–119; Decisions 158–159
* **What is wrong:**
  - **No fallback where the template asks for one.** The template requires each action's fallback in Commands. `steering.set` names none.
  - **The only fallback contradicts the rest of the spec.**
    - It sits in Plan risks: "a real tap of `TOGGLE_AI`" in Steering Assist mode.
    - Decisions 158–159 rejects exactly that press.
    - It can't meet line 84's same-frame check, because that key acts on release.
  - **"No live event" covers two cases.** Line 86's "No live event → failed with `whyNot`" assumes no event always means no lane. With an unbound key and a lane present, `canSteer` is true and `whyNot` is absent, so the failure has no reason to give.
  - **New evidence from the spike0012 dumps (checked).** In four of them, `TOGGLE_AI_STEERING` is *registered* with `active: false`. The mode and field state when they were taken aren't known.
    - This suggests the game keeps the event registered and toggles whether it is active, rather than registering it only when usable.
    - So "registered but inactive" and "not registered" are separate cases, and the spec should keep them apart.
* **Recommendation:**
  - Write the fallback, or its absence, into Commands, with its reading and timing.
  - Give "event inactive" (no course or no lane: `whyNot`) and "event not registered" (for example, a key never bound) separate answers.
  - Cite the spike0012 dumps in the table as what has been seen.
  - Have Plan item 6 point to Commands instead of carrying its own rule.

### C6. The mode also changes on a hitch, not only in the dialog. New

* **Affected scope:** Behaviour 22–23, 36–37; Live check 144–145
* **What is wrong:**
  - **The spec treats the mode as fixed.** Behaviour calls it "a setup choice", "set once in the game's dialog".
  - **The game can reset it.** The brief's reading of the game source (`concepts_brief.md:116` and M1, 200–206, citing `AIAutomaticSteering.lua:532–544`; checked) says otherwise. On attach or detach, if no tool allows steering, the server switches the mode back to Worker and the settings are wiped.
  - **So the label and the job can change on a hitch,** with no dialog at all.
  - **Nothing covers it.** Neither Behaviour nor the Plan risks mention this, and the live check covers only the dialog path. The brief also asked for a check on a bare tractor (`concepts_brief.md:433`).
* **Recommendation:**
  - State that the button follows the mode the game holds, including its reset on a hitch change.
  - Add a live-check row: hitch and unhitch a tool that doesn't allow steering, then try a bare tractor; the label follows.

### C7. Alternatives and risks live only in a file that is deleted on approval. New

* **Affected scope:** the whole spec, against `feature-spec-standard.md` 13–27; the metadata on line 4; Decisions 156–163
* **What is wrong:**
  - **What the standard requires.** A spec fails if it "proposes a single path without proving that other viable designs were considered and rejected for specific, documented reasons". It must also name its own failure modes.
  - **What the spec records.** Decisions has two rejections with reasons: the AI key instead of the steering key, and the mode moving to 0022.
  - **What it doesn't record.** These in-scope choices have no recorded alternative:
    - a second steering button (brief A14: one control per action, and the Drive group is full);
    - opening the game's dialog (A7);
    - routing `ai.set` to steering instead of refusing it;
    - `cab.steering` instead of a topic of its own;
    - the synthetic release instead of other fixes;
    - the mode setter here (A3).
  - **That reasoning lives only in `concepts_brief.md`.** The brief's line 13, and line 4 of the spec, say it is deleted once the three specs are approved.
  - **The risks are thin.** Plan item 6 lists two. The failure modes in C3–C6 are not among them.
  - **The template has a gap.** `_template.md` has no Alternatives slot, so the spec has to bridge this itself.
* **Recommendation:**
  - Before the brief is deleted, add short "rejected: X, because Y" lines to Decisions for the choices above.
  - Grow the Risks item with C3–C6.
  - Separately: `_template.md` lacks the Alternatives section the standard asks for. That is a template change, outside this spec.

### C8. The Goal gives no reason the player wants this. New

* **Affected scope:** Goal 6–18
* **What is wrong:**
  - **The template asks for value and reason.** It wants one paragraph on "what the player gets, and why it's worth building".
  - **The Goal gives neither.** Its first paragraph only places the spec in the series of three. The second lists what the dashboard knows and does, plus a defect fix, but not why the player wants it.
  - **The reason sits elsewhere.** It appears only in the Log (175–178) and the temporary brief, while 0021 (14–16) and 0022 (14–15) both put theirs in the Goal.
* **Recommendation:**
  - Make the Goal one paragraph that leads with the player's gain (run the GPS from the dashboard alone, from the Log), then the button fix.
  - Move the series pointer to a closing sentence.

### C9. The game API table claims more than has been checked

* **Affected scope:** 60–62, rows 66, 72, 73
* **What is wrong:**
  - **The heading contradicts the rows.** It says "all **unverified**", but row 72 says "the name verified" and row 73 says "verified".
  - **Row 73 overstates.** `docs/GAME-API.md` 371–372 and 714–715 still list `getIsAIActive()` *turning on* as not confirmed, and "lit while a worker drives" (line 24) depends on exactly that.
  - **Row 66 claims a value no one has seen.** It says the save writes `"WORKER"`, but the brief records only `currentMode="STEERING_ASSIST"` (`concepts_brief.md:69`).
  - **"Each read behind the guards" doesn't fit two rows.** `TOGGLE_AI_STEERING` and `TOGGLE_AI` are key presses, not reads.
  - **The template asks for anchors.** Each verified name needs its place in GAME-API.md. Row 72 links the file with no anchor, and row 73 has no link at all.
* **Recommendation:**
  - Heading: "Unverified unless the State column says otherwise. Every read and press goes through the guards in `mod/src/Api.lua`."
  - Row 73: word it as spec 0008:96 does, "the name verified (Phase 0); its turning on not yet". Anchor `#phase-0-spike-on-solek-windows-2026-10-20`.
  - Row 72: anchor `#c0-the-command-channel`.
  - Row 66: say only what the save was seen to write.

### C10. The state words are overloaded and don't map to the game's names

* **Affected scope:** 13, 28–30, 46–52, 69–71, and the uses at 82 and 85–87
* **What is wrong:**
  - **`"steering"` means five things.** It is the cab key, a `mode` value (48), a `state` value (49), the button label (25) and the command name (81). So `mode == "steering"` and `state == "steering"` mean different things.
  - **`"off"` is ambiguous.** It means "no course", but steering is also off in `"ready"`.
  - **No mapping to the game's values.** Nothing says which of the game's `DISABLED / AVAILABLE / ACTIVE` gives off, ready and steering.
  - **"Lane" stands in for the game's "segment".**
    - The game's reason is "no segment", yet `whyNot` is `"noLane"`.
    - The brief (line 86) shows segments are not lanes: one round and one lane gave five segment indices.
    - Spec 0021 counts headland rounds and lanes separately, so `noLane` will mislead there.
  - **"No lane under you" defines itself.** Lines 28–29 define it as "off the field, the course still building, or no lane where you are". The definition contains its own term, and it mixes `noCourse` and `noLane`.
  - **Telling `noCourse` from `noLane` by text would break.** If the mod uses the game's warning texts, those change with the game's language.
  - **The getter's second value is lost.** `Api.tryCall` returns only the first result (`Api.lua:15–24`).
  - **The brainstorm already asked for this.** Its M16 (412–413) asked for a short word list.
* **Recommendation:**
  - Use the game's names:
    - `mode`: `"worker"` / `"steeringAssist"`;
    - `state`: `"none"` / `"ready"` / `"active"`, mapped to DISABLED / AVAILABLE / ACTIVE.
  - Name the reasons: `whyNot` `"noCourse"` / `"noSegment"`, or define "lane" once as the game's current segment.
  - Tell the two reasons apart without game text: no `steeringFieldCourse` means noCourse, otherwise noSegment.
  - Add a short word list (course, segment, lane, headland round) shared with 0021 and 0022.
  - Reword lines 28–30 as "Can't steer now (`canSteer` false): …".

---

## Nits

| # | Finding | Lines | Reviewers |
| --- | --- | --- | --- |
| n1 | `onField` has no reader in 0020. The game may update `lastIsOnField` only for the local player's vehicle in Steering Assist mode, so it can be stale elsewhere. Mark it "for 0021" or move it there. (S5 N1.) | 53–54 | design, structural |
| n2 | "No AI modes at all" (31), "no Steering Assist" (47) and "without the game's AI specs" (127) describe one case three ways. Name which game spec decides, and say that falling back to "AI worker" when the read fails is intended. | 31–32, 46–47 | design, structural, style |
| n3 | Refusal order: `already` is answered before any refusal that isn't a `when` (checked, Commands.lua:1395–1406). So `steering.set 0` in worker mode would answer `already`, not "refused". Make the mode refusal a `when` and list it first. | 81–89 | design, style |
| n4 | A new icon brings three duties (THEMES.md 402–406, 444–446): review on `web/tools/icons.html`, a design-system refresh in the same change, and the icon count. Plan step 4 lists none of them. | 39–40 | design |
| n5 | Can `canSteer` go false between segments or at corners while you drive? `cab` is sent on every change, so the button could flicker. Have the spike watch for it. | 51–52 | design |
| n6 | When steering turns itself off, log one line with the likely cause, as the brief's M11 asks. It helps live checks. | 33–35 | design |
| n7 | `hello.commands.actions` sits under Commands, but spec 0008 (75–76) puts it under Data contract. Pick one place, and align 0022 with it. | 94–95 | structural |
| n8 | The Commands list mixes two actions with two non-actions (94–97). The "same frame" bullet repeats ARCHITECTURE.md's command flow and never says whose frame it means. | 94–97 | structural, style |
| n9 | Refusal strings aren't parallel: "not steering assist" vs "steering assist: steering.set". Suggested: "not in Steering Assist mode" and "in Steering Assist mode: use steering.set". "Keeps its job" is vague. | 87–89 | structural, style |
| n10 | "Ok `checked`" isn't linked to spec 0014, where it is defined. "The game turns it off" (86) reads as steering but means the event. | 85–86 | structural, style |
| n11 | Behaviour's bold lead-ins follow four patterns. Pick one. | 22–38 | structural |
| n12 | Lines 25–27 use "lane" twice and leave the game's labels unquoted. Suggested: "unlit, the game's 'Activate lane'; lit, 'Deactivate lane'". | 25–27 | style |
| n13 | "A press that does nothing" also covers the `already` path. Write "a press the mod answers failed". | 29–30, 35 | style |
| n14 | "You leave the field" isn't among the brief's listed causes of steering turning off. Cite a source line or drop it. Suggested heading: "The game turning steering off". | 33–34 | style |
| n15 | The Goal's wording: "the dashboard knows" (write "reads and shows"). "Does what a short press of H does" should add "through the game's steering key", since the button doesn't press H. "Saved per vehicle" appears twice (22–23, 37). | 12–16, 22–23, 37 | style |
| n16 | In the table: the "Where from" column carries a design note (row 67) and Vincent's binding (row 71). Row 67 lacks a line number, and row 73 names a class but no file. Quoted "no course" / "no segment" and "on a field you may work" may be paraphrases presented as game text. | 53–54, 66–73 | structural, style |
| n17 | The brief gives the Show Lines key to 0020 (M14, Goals, Stage 2), but 0022 takes it up (119–121). Record the move in Decisions or Out of scope. | — | structural |

---

## Notes for weighing these (mine, not the reviewers')

**New in this stage, and the ones to settle first:**
- **C6:** the mode changes on a hitch. It changes what the button may show between two dialog visits.
- **C7:** the alternatives and risks. They have to move into the spec before `concepts_brief.md` is deleted, or they are lost.
- **C4:** the same-frame flip. It is a third thing the spike has to show.
- **C1 (the label part):** a faded button shows the wrong label.

**Raised again from Stages 5 and 6.** C1, C2, C3 and C5 have now been raised by four or five separate reviewers each. They are not one reviewer's view.

**Choices only you can make.** Several fixes conflict, so a resolve pass can't just apply them all:
- **C1:** option (a) or (b).
- **C10:** whether to rename `mode` and `state` to the game's names. The rename touches 0021 and 0022 too.
- **Stage 5 M2:** the larger or the smaller fix for `ai.set` in worker mode.
