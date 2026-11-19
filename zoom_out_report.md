# Stage 5: Initial Zoom Out Review

**Target:** `specs/0020-steering-assist-state.md` (full file, lines 1–179)
**Context given to reviewers:** CLAUDE.md, docs/ARCHITECTURE.md, docs/THEMES.md, docs/GAME-API.md, concepts_brief.md, specs/README.md, specs 0008, 0021 and 0022.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` (simplicity and scope) | completed: 2 Major, 3 Nit |
| `egm-inventive-catalyst` (false compromises) | completed: 2 Major |

**Verdict: revise before approval.** No Blockers. After overlapping findings are merged, 3 Major and 3 Nit remain.

The three Majors share one cause. The spec tries to settle, before its own spike has run, how two keys behave and what a tap answers. Where the spike could go either way, the spec keeps both answers.

I checked three of the reviewers' code and file claims myself, and all three hold:
- `web/src/ui/control.js:152` returns before sending when the control is `unavailable`.
- `mod/src/Commands.lua:1166` makes `ai.set` a plain input press with an `aiState` reading.
- `concepts_brief.md:582` says spec 0020 "can start after probes 4 and 5".

---

## Prioritized Findings

### M1. The spec carries two designs, and its own spike has to pick one. Severity: Major

* **Reviewer lens:** `egm-zoom-out` (Finding 1) and `egm-inventive-catalyst` (Finding 2)
* **Affected scope:** Goal (16–18), Commands (83–93), Plan step 1 (101–108), Plan step 3 (111–112), Risks (117–120), Live check (151–153), Decisions (158–159)

**What is wrong**

1. **The fallback undoes the spec's main decision.**
   - The Risk at 117–119 says that if the player never bound `TOGGLE_AI_STEERING`, the fallback is "a real tap of `TOGGLE_AI` in Steering Assist mode".
   - The Decision at 158–159 picks the steering key over the AI key, so that the answer comes in the same frame.
   - Commands (88–89) refuses `ai.set` in that mode and presses nothing.
   - The AI key acts on its release, which is a frame later. So the same-frame check of `steeringEnabled` at line 84 cannot hold on the fallback path.
   - Commands, Acceptance and the live checks never mention the fallback again.
2. **The release is the same unsettled choice.** Lines 90–93 and 112 send a release only "if the spike asks for it", so the command's behaviour is undecided.
3. **The spike was moved behind approval.**
   - The brainstorm planned for spec 0020 to start after probes 4 and 5 (`concepts_brief.md:582`).
   - The spec puts those probes in its own Plan step 1 instead. They run only after the spec is approved, even though their results decide what the spec says.
4. **One signal is doing two jobs.**
   - The button fades on `canSteer`, which comes from the game's allowed-check, `getIsAIAutomaticSteeringAllowed()`.
   - A failed press is reported as "no live event". Line 85 assumes that always means "no lane under you".
   - If an unbound action has no live event, these two can disagree. A player without the binding would then see a button that never fades and fails every tap. `whyNot` would be missing, because `canSteer` is true, so the failure would carry no reason or the wrong one.
5. **No live-check row covers the steering key unbound.** The Risk names this case, and spec 0022 (line 165) and the brainstorm (lines 427, 595) both ask for that row.

**Recommendation**
- Run Plan step 1 before approval. It reads only, and the spike in `research/spike/FS25_CompanionSpike` already exists. Then write one design.
- **If `TOGGLE_AI_STEERING` has a live event, bound and unbound:** delete the fallback.
- **If it doesn't, there are two choices:**
  - The simpler one: say "not available now" to players who never bound the key, and write that cost into Decisions.
  - The other: keep the `TOGGLE_AI` path. Then the allowed-check alone decides the fade, and the key's liveness only decides which key to press. That failure needs its own reason (for example "no steering key"), and Commands and Acceptance gain a second, multi-frame path.
- Either way, add a live-check row with the steering key unbound.

**Cost the catalyst names for keeping both paths**
- Two press paths to maintain.
- The fallback rarely runs on Vincent's rig (the key is on joystick button 21), so it can break without anyone noticing unless a test forces it.
- The AI key's hold timer must be shown to stop when the key is released. Otherwise the fallback can still open the AI Settings dialog.

### M2. `ai.set` gets a new way to press, but its answer is still never checked. Severity: Major

* **Reviewer lens:** `egm-inventive-catalyst` (Finding 1); `egm-zoom-out` (Finding 1, the Goal and line 153)
* **Affected scope:** Goal (16–18), Behaviour (24), Commands `ai.set` (88–93), Acceptance (125–133), Live check (153), Out of scope 3 (170)

**What is wrong**
- **The answer comes too early to mean anything.**
  - Today `ai.set` answers ok as soon as the key's callback has run. It never reads `getIsAIActive()` back.
  - If the game acts only on the release, an answer given in the press frame cannot be checked even in principle.
  - That breaks the spec's own rule, "only a press that does nothing says 'Failed'". Spec 0008's log (lines 263, 281–283) already records this key running while nothing happened and the button answering ok.
- **The Goal states a guess as fact.**
  - Lines 16–18 say the button "presses the game's AI key down and never lets go, and the game acts on that key's release". The brainstorm marks that "(inferred)".
  - The cause on record is different: the key "does nothing without a job" (spec 0008 lines 232–236; GAME-API.md 371–372, 714–715).
- **"Fixes that button" claims more than the spec delivers.**
  - Hiring a worker is out of scope (line 170), and worker mode stays "as today" (line 24).
  - Yet a release turns a dashboard tap into a real H tap. That tap might now hire a worker or open a game screen for the first time, and the spec doesn't say which.
- **Nothing tests or checks it.**
  - The live-check row at 153, "what a tap does now", records whatever happens and has no pass condition.
  - No automated row checks what `ai.set` answers in worker mode.

**The reviewers propose opposite fixes, and you have to choose**
- **Larger (catalyst).** Make `ai.set` a checked tap: press, release the next frame, then read `getIsAIActive()` for a few frames. Answer ok only if the reading changed; otherwise answer "Failed".
  - Commands.lua can already do this: `lightsJob` runs frame by frame (Commands.lua 870–887), and `runInputAction` passes a value through (1332–1347).
  - Costs: the answer no longer comes in the same frame. The frame limit can't be tuned until a live check, because `getIsAIActive()` turning on is still unverified (GAME-API.md 714–715). Worker mode with no job would start saying "Failed" where today it says nothing. And if the tap opens a game screen, "Failed" would mislead.
- **Smaller (zoom-out).** Until PLAN.md's AI worker spec, make the worker-mode button show state only (lit while a worker drives) and send nothing.
  - Its press has never been seen to work, and what the press should do belongs to that spec.
  - Then lines 90–93 and the release clause on line 112 go away, unless the spike shows the hold timer needs them for H to keep working.

### M3. "Faded, and a tap says Failed" goes against how every faded control works today. Severity: Major

* **Reviewer lens:** `egm-zoom-out` (Finding 2)
* **Affected scope:** Behaviour (28–30), Data contract web line (57–58), Plan step 4 (114–115), Live check (150)

**What is wrong**
- **A faded control can't be pressed today.**
  - `web/src/ui/control.js:152` returns before sending when the state is `unavailable` (checked).
  - Tool card buttons work the same way (`vehicleTools.js` 268, 276), and so does the contract button (`contractsScreen.js` 411).
  - Attach is not a precedent. Its "Failed" comes only after a press that was actually sent.
- **The Plan doesn't list the file this needs.** Lines 28–30 and the live check at 150 need either a new control state or a change to `control.js` that affects every faded control. Plan step 4 doesn't list `web/src/ui/control.js`.
- **A lit button could fade.**
  - `canSteer` means "could turn steering on now" (51–52). If it goes false while steering is on, the button fades and the tap that turns steering off is blocked.
  - Line 71 says the steering key's event is live only with a course and a lane. So `steering.set 0` can itself get "no live event", and the spec doesn't say what the button does then.

**Recommendation**
- Keep the existing rule: a faded button ignores taps, and "Failed" stays for a press that was sent and did nothing. Line 150 then reads "faded; a tap does nothing".
- Fade only when `state` is not `"steering"` and `canSteer` is false, so a lit button never fades.
- Say what a tap that turns steering off does when there is no live event.
- Knock-on: once faded taps send nothing, the failure path at 85–86 is reached only in a race. That weakens the case for `whyNot` (see N1).

---

### N1. The data contract carries more than this spec reads. Severity: Nit

* **Reviewer lens:** `egm-zoom-out` (Finding 3)
* **Affected scope:** 46–58, 68, 125–128
- **`onField` has no reader in 0020.** The web doesn't read it, and neither the tests nor the live checks cover it. It still costs an unverified game name (`.lastIsOnField`). Its readers are 0021's "off the field" words and 0022's faded rows, so move it to 0021, which already extends `cab.steering`.
- **`whyNot` can be worked out from `state` and `canSteer`.** `"off"` means noCourse, and `"ready"` with `canSteer` false means noLane. Either drop it, or fold the three fields into one.
- **The names don't match the house pattern.** The existing pattern is `canNow` / `whyNot`, with `whyNot` in the game's own words (`mod/src/state/Tools.lua` 150–151, 534–541; `web/src/types.js` 158–159). If the pair stays, use those names and that meaning.

### N2. Two game sources for the same three states. Severity: Nit

* **Reviewer lens:** `egm-zoom-out` (Finding 4)
* **Affected scope:** 68–69, 107–108
- `steeringEnabled`, plus whether `steeringFieldCourse` is set, already gives off / ready / steering. `steeringEnabled` is needed for `steering.set`'s check anyway.
- `getAIAutomaticSteeringState()` gives the same values but needs the blanked `STATE` table, which is half of spike bullet 107–108.
- A getter first with a field as fallback is the house pattern (`state/Motor.lua`, `engineOn`), so keeping both is acceptable. Name which one comes first.

### N3. The web checks the same thing twice before showing the Steering job. Severity: Nit

* **Reviewer lens:** `egm-zoom-out` (Finding 5)
* **Affected scope:** 94–95, 138
- Keep the bump to actions 5; it follows precedent.
- `cab.steering` comes only from a mod that also reports actions 5, and without `cab.steering` the button is already "as today". So the web can key on `cab.steering` alone.
- Line 138's test then becomes "without `cab.steering`".

---

## Reuse the reviewers confirmed (not findings)

- **The action table already covers the refusals.** In `Commands.ACTIONS`, `when` handles refusals and `state` handles `already` (Commands.lua 1118–1123, 1395–1406), which covers both actions with no new machinery. A key with no live event already answers "not available now" (1470).
- **The mode compare has a helper.** `enumName` (Api.lua 161–171) is what the spec's mention of `Api.missionStatus` refers to.
- **controls.js needs one change.** Its `labels` hook (51–53) already handles a label and icon that change with state. Only `ControlDef.action` is fixed (40, 467), so a mode-dependent action is the one thing it has to grow, for example `send` returning the action.
- **`mod/src/state/Steering.lua` fits** the state/ split (Motor.lua holds `aiActive`), and 0022 extends it.
- The catalyst raised nothing against the core shape: one Drive button whose job follows the mode, the steering key over the AI key, the mode read-only until 0022, and each action refused in the other mode.

## Traceability

| Raw finding | Merged into |
| --- | --- |
| zoom-out 1: two designs; fallback against the Decision; release "if the spike asks"; spike moved behind approval | M1 |
| zoom-out 1: Goal states the release as fact; "fixes" overstates; line 153 has no pass condition | M2 |
| catalyst 1: `ai.set` answer unchecked; checked tap job | M2 |
| catalyst 2: fallback breaks the same-frame answer; key liveness doing two jobs; no unbound row; probes after approval | M1 |
| zoom-out 2: faded tap says Failed against control.js; a lit button could fade | M3 |
| zoom-out 3: `onField`, `whyNot`, naming | N1 |
| zoom-out 4: two sources for the state | N2 |
| zoom-out 5: actions 5 checked twice | N3 |
