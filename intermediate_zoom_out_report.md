# Stage 8: Intermediate Zoom Out Review

## Re-audit after the edits (2026-11-18)

The spec was revised after the first Stage 8 run, with Vincent's three choices:
- AI worker mode as today;
- no fallback key;
- faded when you can't steer.

The same edit touched `specs/0021` (`onField` moved there), `specs/0022` (its faded rows read `onField`) and `docs/PLAN.md` (the hold-timer question).

A fresh `egm-zoom-out` reviewer re-read the full revised file (lines 1–239 at the time) and the four reports.

**Verdict: pass.** No Blockers or Majors, and 7 Nits.
- Every Stage 5–8 Major is handled.
- The reviewer re-checked the code claims the revision rests on, and all hold: the refusal order, `timeScaleJob`'s wait, "not available now", `control.js:152`, `controls.js:569`, `enumName`, and the spike0012 dumps.

| Nit | What | Done |
| --- | --- | --- |
| 1 | `canSteer` was the last thing depending on a spike call (`getIsAIAutomaticSteeringAllowed()` every frame). The steering key's own event flag, read as `VehicleState.liveKey` already reads Tip's key, gives the same answer with no call. | **Applied:** `canSteer` now reads the key's event. The getter row, the spike's getter call and its risk are gone, and a Decision line says why. |
| 2 | The Goal promised "whether the game has built a course", but the button shows only "can steer now". | **Applied:** the Goal says "whether it can steer there now". |
| 3 | The Risks repeated the Plan, Decisions and Behaviour, and the spike's bound/unbound dump no longer decided anything. | **Applied:** Risks is one line of pointers, the spike's bound/unbound pass is gone, and the repeated Decision is removed. |
| 4 | Three wordings said more than the evidence: "every read and press goes through Api.lua"; "four vehicles" (three, ARION twice); "gear 8" as a key on record as unbound. | **Applied:** all three reworded. |
| 5 | 0021's Plan doesn't name where `onField` and `courseKey` are built. | Left for 0021's own review. |
| 6 | 0022 fades its rows from `onField`, which may be stale outside Steering Assist mode. Its `actions` line is still under Commands. | Left for 0022's own review. |
| 7 | PLAN.md's AI worker item stated "does nothing without a job" as fact, then doubted it. | **Applied:** "did nothing live", plus "per the game's source, unverified". |

The reviewer also suggests settling open question 1 ("Steering" or the game's "Lane") at approval, since the label appears in Behaviour, Acceptance and the icon.

After these edits the split is FeatureRange 1–117 and DetailedRange 118–236 (`## Plan` at line 118).

**Re-audit limit reached.** After the re-audit, a further doc update was asked for. So Nits 5 and 6 are recorded as accepted trade-offs for this spec, left to the reviews of 0021 and 0022, and the review moved on to Stage 9.

---

## First run (before the edits)

**Target:** `specs/0020-steering-assist-state.md`, the full file (lines 1–179). It is unchanged since Stage 5.
**Read alongside:** `zoom_out_report.md` (Stage 5), `comprehension_report.md` (Stage 6), `critic_report.md` (Stage 7), and the same nine context files.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed: 6 Major, 4 Nit |

**Verdict: revise before approval.** No Blockers.

## The main point

Stages 6 and 7 mostly add text, spike questions and answers to the spec, and nearly all of it comes from two choices the spec leaves open:

1. the fallback for a player whose steering key is unbound;
2. whether `ai.set` sends a release of the AI key in worker mode.

Applied as written, those additions make the spec bigger and still leave two designs in it. **Making the two choices removes most of the additions.** Two corrections about which existing code to reuse, and one choice about fading, do the rest.

If every default below is taken, the spec ends with:
- one way to press;
- no text that depends on a spike outcome;
- three cab fields (two under fading option a);
- two new Decision lines;
- **one read-only spike question to answer before approval.**

**Claims I checked myself; all hold:**
- `docs/PLAN.md:26–31`: the AI worker button is to open the game's AI job screen instead, in "its own spec" (Vincent, 2026-11-10).
- `Commands.lua:916` is `timeScaleJob`.
- `Api.tryCallAll` exists (`Api.lua:26`).
- `specs/0022:165` is about the **lines** key, not the steering key.

## Corrections to earlier reports

- **Stage 5 M1** cites spec 0022:165 as asking for an unbound steering-key check. That row is about the lines key. The brainstorm's lines 427 and 595 still ask for the steering-key check.
- **Stage 7 C4** points to `checking` (`Commands.lua:1528–1555`) as the wait to reuse. That code is built around tools. The fit is the frame-by-frame job, as spec 0017's `timeScaleJob` (916–951) does it. See Z4.
- **Stage 7 C10** says "the getter's second value is lost". The design reviewer's own text named `Api.tryCallAll` (`Api.lua:26–35`) as the fix, and my summary dropped it. Under Z5 the point no longer matters.
- **Stage 5 M3 and Stage 7 C1** both list `web/src/ui/control.js` as a Plan change. Under fading option (b) it needs no change, because `control.js:152` already ignores taps on a faded button.

---

## Findings

### Z1. The later stages grow the two open choices instead of closing them. Major

**Scope:** Goal 16–18; Commands 83–93; Plan 101–108, 111–112, 117–120; Live check 151–153; Decisions 158–159.

- **What the later stages add to keep both choices open:**
  - four spike questions (C3, C4, n5, C5);
  - a conditional Goal, with both spike outcomes written out (C3);
  - the fallback in Commands, with two separate failure answers (C5);
  - more Risks (C7);
  - Stage 6 items 1, 2, 3 and 6.
- **Why it matters.** Each of these is a running cost of not deciding.
- **What it means for Stage 5.** It backs Stage 5's M1 and M2 and changes their fix: make the two choices (Z2, Z3), and the spike shrinks to one read-only question.

### Z2. Worker mode: a smaller option than either of Stage 5 M2's. Major; your decision

**Scope:** Goal 16–18; Behaviour 24; row 72; Commands 88–93; Plan 102–104, 112; Live check 153; Out of scope 3 (170).

- **The release is costly to keep.** Stage 7 C3 assumes it stays, and then needs:
  - a conditional Goal;
  - both outcomes written out;
  - a probe that presses a key that might hire a worker or open a game screen;
  - a rule for when `ai.set` answers;
  - a pass condition for line 153.
- **The worker button's tap is already being redesigned elsewhere.** `docs/PLAN.md:26–31` (checked) plans for it to open the game's AI job screen and stop a running worker, in its own spec. Fixing how today's press releases is work on a press that is due to be replaced.
- **The smaller option.**
  - Keep `ai.set` in worker mode exactly as today (spec 0008; `Commands.lua:1166`).
  - Keep the refusal in Steering Assist mode.
  - Delete the fault sentence from the Goal.
  - Name the worker job by link: "as today, spec 0008's `ai.set`, lit while a worker drives". That also answers Stage 6 #5 for worker mode.
  - If the hold-timer question is worth keeping, it becomes one line in PLAN.md's AI worker item.
- **Why this is safe.** Once the fallback is gone (Z3), 0020 never presses `TOGGLE_AI` in Steering Assist mode, the one place where H's short press matters. The steering key has no hold, so the hold-timer question exists only in worker mode, as it does today.
- **What it removes:**
  - from the spec: spike bullet 102–104, Commands 90–93, the release clause in Plan step 3, row 72's tap-and-hold claim and live check 153;
  - from the earlier reports: all of C3, Stage 6 #1, and C7's "synthetic release" alternative.
- **Live check 151–152 can stay** as a cheap check that nothing interferes with H.

### Z3. The fallback: Stage 7 C5 entrenches it, and the existing code already gives its two answers as one. Major; your decision

**Scope:** Commands 81–87 (85–86 especially); row 71; Plan 105–106, 117–119; Decisions 158–159.

- **C5 pulls the other way.** It writes the fallback into Commands and splits "event inactive" from "event not registered". That is the opposite of Stage 5 M1's "write one design".
- **The code merges the two cases on purpose.**
  - `runInputAction` (`Commands.lua:1345`) and `hasLive` (540) skip inactive and missing events alike.
  - Both paths already answer "not available now" (1470 for plain keys, 884 and 946 for jobs).
  - ARCHITECTURE.md 79–80 and spec 0009 make this the rule.
  - With fading (Z6), a tap on an unfaded button that answers "not available now" already means "no usable steering key". The project's one answer is enough, and `whyNot` isn't needed for it.
- **The deciding fact is unknown: the key's default binding.** Vincent's binding is on the joystick only (brief 50), and `inputBinding.xml` isn't in the archive (brief 134). So a player who never bound the key may be the normal case, not an edge case.
- **Before approval, run one read-only check with the existing spike.** Does `TOGGLE_AI_STEERING` have a live event, bound and unbound? The answer says whether dropping the fallback costs a few players or most of them.
- **Default: drop the fallback.** Add one Decision line with its cost: "a player without the steering key bound gets 'not available now'".
  - Keep the fallback only if unbound is the default and you want those players served. Then Stage 5 M1's second branch applies, with its own reason and its own path.
  - If you accept the cost whatever the answer, the check can become a live-check row with the key unbound instead (brief 427 and 595).
- **Keep from C5:** cite the spike0012 dumps (the key registered with `active: false`) in the table.
- **A trap to avoid.** Once `steering.set` waits a few frames (Z4), the timing objection to the fallback goes away. Its other costs remain: a second path, a key that rarely runs on Vincent's setup, and the hold timer. Don't let a resolve pass bring the fallback back on timing grounds.

### Z4. Stage 7 C4 points at the wrong existing wait; the right one removes a spike question and changes a Decision's reason. Major

**Scope:** Commands 81–87, 96–97; Plan 101–108; Decisions 158–159; rows 68–69.

- **The right precedent.** Reuse the frame-by-frame job: `lightsJob` (870–887) for the vehicle-level pattern, and `timeScaleJob` (916–951) for "wait N frames for a change, else 'didn't move'". Not `checking`.
- **In the spec, this is a behaviour statement:**
  - press the steering key;
  - read one value, `steeringEnabled`, over a few frames;
  - answer ok once it changes, or "didn't change" if it doesn't;
  - use the same reading for `already`.
- **What this settles:**
  - C4's two-readings problem;
  - Stage 6 #6's "pressed, but nothing changed";
  - the same-frame question, which leaves the spike.
- **What it changes in the spec:**
  - Decision 158–159's reason ("the answer comes the same frame") no longer holds. Reword it around what does: the steering key does one job, acts on key-down, and has no hold that opens the dialog.
  - Delete Commands 96–97 (Stage 7 n8 also says to).
- **Stage 7 n3 needs nothing new.** The existing `when` refusal (1395–1400) answers before `already`.

### Z5. The data contract: most of Stage 7 C10 drops away once one reading serves both the cab and the command. Major

**Scope:** Data contract 46–58, rows 66–71; Plan 107–108; Behaviour 28–30. Knock-ons in 0021 (40–44, 67–68) and 0022 (41–45).

- **One source for `state`.** Spec 0008's rule (a command compares the reading the cab reports) means the cab's `state` and `steering.set` must read from the same place.
  - **The fields** (`steeringEnabled`, else whether `steeringFieldCourse` is set) are the smaller dependency: no enum.
  - **The getter**, read first, is also fine, as long as it drives the command too.
  - Either way, that "ready" matches the game's AVAILABLE rests on the brief's reading of the source (116–117), still unverified in game. Say so in the table.
- **Drop spike bullet 107–108.** `enumName` (`Api.lua:161–171`) compares by name at run time, so blanked values don't matter, and a missing table drops `steering` through the guards.
- **Drop `whyNot`; don't rename it.** 0021's four "no lanes" reasons (40–44) can be worked out from `mode`, `onField`, `state` and `canSteer`. Once `whyNot` is gone, C10's `noSegment` and its "no game text" point stop mattering.
- **Move `onField` to 0021,** its first reader. That it can go stale outside Steering Assist mode is one more reason.
- **Keep from C10:**
  - The mode value `"steeringAssist"`, which ends the clash between `mode == "steering"` and `state == "steering"`. Neither 0021 nor 0022 uses that literal, so the rename touches 0020 only.
  - One sentence defining a lane as the game's current segment.
- **Decline the shared word list.** 0021 owns the course words (CLAUDE.md: one home per fact).
- **Do Stage 6 #4 the small way:** add a "cab field" column to the game API table, as spec 0008's table has (0008:85).

### Z6. Fading: either option works; today's text mixes them. Major; your decision

**Scope:** Behaviour 28–30; 51–52, 56–58; Plan 114–115; Acceptance 136–137, 150.

| | (a) Always pressable; the mod refuses; the tap says "Failed" | (b) Faded; a tap does nothing |
| --- | --- | --- |
| **Contract** | `mode` and `state` only; `canSteer` moves to 0021 | Keeps `canSteer`, with one rule: in Steering Assist mode, fade when not steering and `canSteer` is false |
| **Game reads** | Drops `getIsAIAutomaticSteeringAllowed()` (row 70): the press is the check | Keeps it |
| **Web work** | No rule for lit against faded, no label fix, no flicker watch | The label follows the mode while faded; one test for lit with `canSteer` false; the nesting from C2. `control.js` needs no change |
| **Precedent** | Spec 0017 (paused: a tap says Failed) | Attach (spec 0016); THEMES.md 243–244, "only faded by the game's 'not now'" |
| **Cost** | Gives up the fade the Behaviour asks for, and breaks the Drive column's precedent | A little more web work |

**Default: (b)**, for consistency with Attach and THEMES.md. (a) is the further cut if you don't need the fade. Under (b), C2's "define `canSteer` for every state" isn't needed; the one rule covers it.

### Z7. Stage 7 C7: record only what this spec decides; the brief doesn't block 0020. Nit (Stage 7 rated it Major)

**Scope:** Decisions 156–163; Plan 117–120; line 4.

- **Nothing is lost by approving 0020.** The brief is deleted only once all three specs are approved (`concepts_brief.md:13`).
- **C7's six alternatives are already recorded, or go away:**
  - the second button: 0020:22–23 and 0021:24–25;
  - routing `ai.set` to steering: Decision 158–159;
  - the mode setter: Decision 160–162;
  - opening the dialog: 0022's subject;
  - `cab.steering` instead of its own topic: ARCHITECTURE.md:94;
  - the release: goes with Z2.
- **Don't grow the Risks.** After Z2–Z4 the Risks item shrinks instead.
- **Add only** the two "rejected because" Decision lines that Z2 and Z3 create, each with its cost.

### Z8. Stage 6's requests for background: link, don't restate. Nit

**Scope:** 44–58, 81–97, 134–143.

- Stage 6 #3, #7, #8 and most of #14 are answered by ARCHITECTURE.md (its Commands section, and the paragraph on game keys, not setters) and by spec 0008.
- One link each is enough. Add no glossary and no primer.

### Z9. Additions to decline. Nit

- **n6, logging the likely cause when steering turns off:** livewatch already prints cab changes.
- **n5, a flicker watch:** under (b) a lit button can't fade, and any flicker while ready would show in live check 146–147.
- **C3's released no-job `TOGGLE_AI` probe:** a press that may change the game's state, for a question 0020 no longer asks (Z2).
- **C4's multiplayer sentence:** Out of scope 4 (171) already covers it.
- **C5's "not registered" answer** (Z3) **and C10's word list** (Z5).
- **C7's template change:** outside this spec.

### Z10. Cheap fixes to adopt as they are. Nit

Each is a sentence or a row, and none adds a second path.

- **C6:** the button follows the mode the game holds, which a hitch can reset. Add one live-check row; no new code.
- **C8:** the Goal leads with the player's gain. It also gets shorter once Z2 removes the fault sentence.
- **C9:** fix the table heading and rows 66 and 73. Row 72 mostly goes with Z2.
- **n2 / Stage 6 #12:** without `cab.steering`, the button is as today.
- **n4:** one Plan line for the new icon's THEMES.md steps.
- **n7:** move `actions` to the Data contract.
- **n17:** one line saying Show Lines moved to 0022.
- **n14:** "you leave the field": cite a source line or drop it.
- **Stage 6 #10:** "the rows above, with Precision Farming on and off".

---

## Conflicts between the earlier recommendations

| Conflict | Settled by |
| --- | --- |
| C5 writes the fallback in; Stage 5 M1 asks for one design | Z3 |
| C3 assumes the release stays; Stage 5 M2's smaller option and PLAN.md 26–31 replace the tap | Z2 |
| Any wait (C4) removes Decision 158–159's "same frame" reason and Commands 96–97 | Z4 |
| C4's `checking` is built around tools; the frame-by-frame job fits | Z4 |
| Z4's wait removes one objection to the fallback, but not the others | Z3 |
| C10's mapping and reason names against Stage 5 N1 and N2 | Z5 |
| C1 (a) against Stage 5 M3 (b); the `control.js` Plan line is wrong under (b) | Z6 |
| C2's "define `canSteer` for every state" against M3's one-line rule | Z6 |
| C7's urgency against brief line 13; its "grow the Risks" against the shrinking spec | Z7 |

## What happens to each earlier item

| Stage | Adopt | Smaller | Moot or decline |
| --- | --- | --- | --- |
| **6** | #5, #6 (+ a `steering.set 0` test), #9, #11, #12, #13 | #3 (a link), #4 (cab-field column, "lane" defined once), #7 (a link), #10 (one clause), #14 (a PLAN.md link + what line 116 changes) | #1 (Z2), #2 (Z3), #8 (link, don't restate) |
| **7 Major** | C4 (with the right reuse), C6, C8, C9 | C1 (your choice; the label follows the mode), C2 (one rule, one test, nesting), C7 (two Decision lines), C10 (rename the mode value, define "lane") | C3 (Z2), C5 (except the dump citation) |
| **7 Nit** | n1, n2, n3, n4, n7, n8 (delete 96–97), n17; n9–n16 as wording only | | n5, n6 |

Stage 5 N3 stands unchanged: the web can key on `cab.steering` alone.

## Simplest path to an approvable spec, in order

1. **You decide: worker mode stays as today (Z2).** Remove the Goal's fault claim, the release, spike bullet 102–104 and live check 153. This needs no spike.
2. **Run the one remaining read-only spike question (Z3):** does `TOGGLE_AI_STEERING` have a live event, bound and unbound? Drop the class-table spike bullet (Z5).
3. **You decide, with that answer: drop the fallback** (the default), and write its cost into Decisions.
4. **You decide: fading option (b)** (the default) **or (a)** (Z6).
5. **`steering.set`:**
   - refused first when not in Steering Assist mode;
   - one reading for both `already` and success;
   - press, then a short wait, as `timeScaleJob` does;
   - "didn't change" when nothing happens;
   - a test for `steering.set 0`;
   - Decision 158–159 reworded, and 96–97 deleted (Z4).
6. **The data contract:**
   - `mode` is `"worker"` or `"steeringAssist"`;
   - `state` comes from one source, shared with the command;
   - `canSteer` stays only under (b);
   - the table gains a cab-field column;
   - `whyNot` is dropped;
   - `onField` moves to 0021, with the knock-ons in 0021 and 0022 (Z5).
7. **Wording:** Z10's cheap fixes, Z8's links, Z7's two Decision lines; decline Z9.

## Note for Stage 9 (mine, not the reviewer's)

Stage 9 reviews lines 99–179: Plan, Acceptance, Decisions, Out of scope and Log. Under Z2–Z5 most of the Plan and Acceptance changes:
- spike bullets go;
- the release goes;
- `steering.set`'s tests change;
- a live-check row is added and one is removed.

Running Stage 9 on today's text would review sections this stage expects to shrink. It would still catch problems that survive, such as test coverage, the icon steps and the Plan's file list. But a Stage 9 run after the edits would cost the same and review the text that ships.
