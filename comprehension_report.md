# Stage 6: Comprehension Test

**Target:** `specs/0020-steering-assist-state.md`. FeatureRange is lines 1–98 (Goal to Commands); DetailedRange is lines 99–179 (Plan to Log).
**Reviewer:** `egm-comprehension` (completed). It read the spec on its own, with no linked or context files and no standard.
**Result:** no Blockers (every section could be paraphrased), 8 Major, 6 Nit.

Below is the reviewer's full result, lightly formatted. Check the two paraphrases against what you meant: a wrong paraphrase is itself a finding.

## What this proposes

This is the first of three specs for the game's Steering Assist (called "the GPS"). It adds a `steering` object to the mod's `cab` topic, which reports:
- the vehicle's AI mode (worker or Steering Assist);
- the steering state (off, ready or steering);
- whether a tap could start steering, with a reason if not;
- whether the vehicle is on a field it may work.

The Drive group's single button stays the "AI worker" button in worker mode. In Steering Assist mode it becomes a "Steering" button that sends a new `steering.set` command. The mod carries that out by pressing the game's TOGGLE_AI_STEERING input action and confirming the change by reading `steeringEnabled` in the same frame. `ai.set` is refused in Steering Assist mode. If a spike confirms the game never sees the key's release, `ai.set` also sends a release one frame after its press. The mode is only read here (it is set in the game's dialog until spec 0022), and the web shows the Steering job only when the mod reports `hello.commands.actions` 5.

## How the existing system works, per this document

A Lua mod runs inside the game and reads state through guarded reads in `mod/src/Api.lua`. It publishes topics such as `cab` to a "companion" and runs commands such as `ai.set`. Their answers (ok/`checked`, `already`, failed, refused) follow a "set" convention from spec 0008. A web dashboard shows button groups, Drive among them, whose buttons can be pending, lit or faded. Today the AI worker button sends `ai.set`, which presses the game's TOGGLE_AI (H) key down and apparently never lets go. The game acts on that key's release, and holding H opens the AI Settings dialog. The game owns the AI mode (saved per vehicle), builds the field course and its lanes by itself, and turns steering off by itself for many reasons.

Where the reviewer had to guess:
- whether "the companion", "the dashboard" and "the web" are one component or several;
- what a tap of the AI worker button visibly does today: nothing, hires a worker, or opens the dialog later.

---

## Findings

### 1. What a tap of the AI worker button does today is never stated, so it's unclear what "fixes that button" fixes. Major

**Scope:** Goal 16–18; Behaviour 24; Data contract 72; Commands 88–93; Plan 102–104; Acceptance 151–153; Out of scope 170.

- **Fact or guess?** Lines 16–18 state the stuck key as fact. Lines 90–93 make the fix depend on a spike, and line 72 marks the tap and hold behaviour unverified.
- **The job is never named.** Line 24 says "as today" and line 88 says `ai.set` "keeps its job", but neither says what that job is.
- **It suggests no hiring today.** Line 170 keeps hiring an AI worker as a separate PLAN.md item, which suggests the button doesn't hire one now.
- **The live check has no expected result.** Line 153's check is "what a tap does now": an observation, with no expected result beyond "no dialog opens later".
- **Nothing says which outcome is happening.** If the game acts on release and the mod never releases, a reader would expect either nothing to happen or the dialog to open once the hold time passes. The spec doesn't say which.
- **A logged value is unexplained.** Line 103 logs `spec_aiModeSelection.modeChangeStartTime` without saying what it is (presumably the game's timer for telling a tap from a hold) or which reading would confirm the bug.
- **Needed:**
  - the symptom seen today;
  - what `ai.set` should do in worker mode after this spec;
  - which spike result triggers the release fix.

### 2. The fallback doesn't fit the rest of the design. Major

**Scope:** Plan 117–120, against Goal 17, Commands 81–89, Acceptance 129–133, Decisions 158–159.

The fallback is "a real tap of `TOGGLE_AI` in Steering Assist mode":
- **It breaks the same-frame answer.** TOGGLE_AI acts on release (line 17). Under the fallback, the change can't be read in the same frame, as `steering.set` requires (lines 84–85).
- **It removes the Decision's reason.** The steering key was chosen because it acts on key-down, giving a same-frame answer (lines 158–159). That reason no longer holds.
- **No command sends it.** `ai.set` is refused in Steering Assist mode (lines 88–89), and nothing says which other command would press TOGGLE_AI.
- **It depends on another open choice.** The fallback needs the release fix, which is itself conditional.
- **Its reach and effects are unstated:**
  - whether it applies only to players who never bound the key, or to everyone;
  - how `steering.set`'s confirmation, answers and tests (129–133) change when it is taken.

### 3. "Live event" is never defined, and the spec contradicts itself about what it means. Major

**Scope:** 71, 85–86, 105–106, 117–118, read with 51–52 and 58.

- **The term is never explained.** "Its event active", "live event", "an active event" and "no live event" are ideas from the game's input system. A reader has to guess that the game registers an input action only while it can be used. Both the failure path and the main risk depend on this.
- **Two places disagree:**
  - Lines 85–86 say a missing live event means no lane, and the answer is failed "with `whyNot`".
  - Line 118 says an unbound key may also have no live event.
- **The result when they disagree.** With an unbound key a lane can exist, so `canSteer` is true, `whyNot` is absent (51–52), and the button isn't faded (58). The press then fails with no reason to give, and the button stays enabled but says "Failed" on every tap.

### 4. The contract fields are never tied to the game names they come from. Major

**Scope:** 12–14, 28–29, 46–54, 66–71, 76–77.

- **No mapping from game values to fields.**
  - The spec defines `state` as "no course, a course, or steering", and `whyNot` as `noCourse` / `noLane`.
  - Separately it lists `STATE.DISABLED / AVAILABLE / ACTIVE`, `steeringEnabled`, `steeringFieldCourse`, `lastIsOnField`, and `getIsAIAutomaticSteeringAllowed()` with its "no course" and "no segment" texts.
  - It never says which game value produces which field.
- **The likely mapping is still a guess.** DISABLED → off, AVAILABLE → ready, ACTIVE → steering, and "no segment" → `noLane` seem likely. But `state` could equally be built from `steeringEnabled` plus `steeringFieldCourse`.
- **"Course", "lane" and "segment" are never defined or related.** Is a course the set of lanes the game builds for a field? Is a segment the same as a lane?
- **Who builds the course, and when, must be inferred.** The reader has only "the course still building" (line 29) and the fact that the mod never calls the generators (76–77).
- **Off the field isn't mapped.** Line 28 lists "off the field" as a no-lane case, but doesn't say whether it gives `noCourse` or `noLane`.
- **`canSteer` is undefined while steering.** It means "whether a tap could turn steering on now" (52). Since the web fades on `canSteer`, a lit button could also be faded.

### 5. The button's lit and faded rules read as if they apply in both modes. Major

**Scope:** Data contract 56–58, against Behaviour 24 and 28–30.

- **The problem.** Lines 57–58 say the button reads `state` for lit and `canSteer` for faded, with no limit to one mode. In worker mode, though, the button is lit while a worker drives (line 24). That isn't a `state` value; it presumably comes from `getIsAIActive()` (73), but the spec doesn't say so.
- **Read literally,** the AI worker button lights only while the game steers, and fades whenever there is no lane.
- **Needed:** say these reads apply in Steering Assist mode only, and name where worker mode's lit and faded come from.

### 6. Some `steering.set` cases have no stated answer. Major

**Scope:** Commands 81–87; Acceptance 129–133.

- **Three cases are not covered:**
  - The event is live and the key is pressed, but `steeringEnabled` doesn't change in that frame.
  - `steering` is absent (a vehicle without Steering Assist). Presumably this is refused, but the spec doesn't say.
  - `steering.set 0`. The tests at 129–133 cover only `steering.set 1`.
- **An ambiguous phrase.** "The game ignores the value" (84) means the input value passed to the game's callback, not the command's 0 or 1, but it is easy to read as the command's value.

### 7. The rule behind the key-press design is never stated. Major

**Scope:** 36, 75–77, 81–84, 117–118, 178.

- **The unstated rule.** The design seems to rest on a project rule that the mod changes game state only by pressing the game's own input actions, never by calling functions that change state.
- **Where it shows.** Two places hint at it: "Never called (they change state…)" (75–77), and the Log's "setters are allowed (they come with 0022)" (178), which implies setters weren't allowed before.
- **Why it matters.** The rule explains both the indirect key-press design and its main risk, the unbound key. Without it, a fresh reader will ask why the mod doesn't just call a function that sets `steeringEnabled`.
- **"Setters" is also never defined.**

### 8. The components and the protocol are never introduced. Major

**Scope:** 12, 44–58, 81, 94–97, 134, 139.

- **The components.** "The dashboard", "the companion" and "the web" might be one thing or three.
  - The data contract says "Mod → companion" and then "Web".
  - The Plan touches only `mod/` and `web/`, but Acceptance cites `tests/test_golden.py` and a "Solek replay", which suggests a separate companion with its own code.
  - So a reader can't tell whether the companion needs changes or only passes the new fields through.
- **The protocol.** These words are never defined:
  - "Topics", "Protocol v1", `v` and "on change";
  - "a set" and "the reading" (spec 0008 is named by path but not linked);
  - the answers `already`, `checked`, refused and failed, and the pending state;
  - `hello.commands.actions`: its current value and what the number counts (a number of actions, or a capability level) aren't given, so "before actions 5" is hard to follow.

### 9. Line 60 calls the game names "all unverified", but the table marks two as verified. Nit

**Scope:** 60, against 72–73.

The table marks `getIsAIActive()` and the `TOGGLE_AI` name as verified.

### 10. The Precision Farming check can't be carried out as written. Nit

**Scope:** Acceptance 154.

"Precision Farming on and off" doesn't say:
- what Precision Farming is;
- why it might affect steering or `onField`;
- what result counts as a pass.

### 11. `onField` has no reader in this spec. Nit

**Scope:** 53–54, 68.

The web reads only `mode`, `state` and `canSteer`. `onField` is presumably for spec 0021, but the spec doesn't say so. It also doesn't say whether `onField` comes from `lastIsOnField`.

### 12. One kind of vehicle falls between two cases. Nit

**Scope:** 31–32, against 46–47.

- **The gap.** Behaviour covers "a vehicle with no AI modes at all", but the contract drops `steering` when the vehicle "has no Steering Assist". A vehicle with an AI worker but no Steering Assist falls between the two.
- **"As today" is unclear for a loader or truck:** shown, hidden or faded?

### 13. "Specs" means two things. Nit

**Scope:** 126, with 66 and 68.

"The game's AI specs" (126) means the game's vehicle data (the `spec_` tables). Everywhere else, "spec" means this project's spec documents. Use a different word or define it.

### 14. Shorthand that is unexplained, or only named. Nit

**Scope:** 38–40, 61, 67, 69, 73, 85, 96, 116, 134, 139–140, 143, 159, 161, 170.

- **Screens and look:**
  - "Day and Night", and 1158×676 / 1180×820 (39, 140): which screens or devices these are.
  - "In the set's style" (40): which icon set.
- **Test setup:** "Solek", "Solek save", `replay-solek` and "the browser pane" (61, 134, 139, 143): what these are and how to run the replay.
- **Game and code references:**
  - "The guards" in `Api.lua` (61).
  - "Values blanked in the archive" and `Api.missionStatus` (67, 69).
- **Labels from other documents:**
  - "Phase 0" (73) and "B1" (159).
  - "The seven" settings (161), which are never listed.
- **PLAN.md:**
  - It is named but not linked (116, 170).
  - Line 116 doesn't say what changes in spec 0008's `ai.set` row or in PLAN.md's items.
- **Ambiguous words:**
  - "The same frame" (96): the game's frame or the dashboard's?
  - "The game turns it off" (85): "it" reads as steering but means the event.

---

## Notes for weighing these findings (mine, not the reviewer's)

The reviewer read the spec with no project files, so some findings are about house conventions the spec is entitled to lean on. Others are real gaps that a reader with the context files would hit too.

- **Real gaps, also raised in Stage 5 by reviewers who had the full context:**
  - 1 and 2 (the AI worker tap and the fallback) are Stage 5's M1 and M2.
  - 3 (live event vs. lane) is part of M1.
  - The fading in 4 and 5 is M3.
- **New gaps that context does not close:**
  - 4: no mapping from game values to the contract fields, and no definitions of course, lane and segment.
  - 5: the lit and faded rules are not limited to one mode.
  - 6: three `steering.set` cases with no stated answer.
  - 12: the vehicle with an AI worker but no Steering Assist.
- **House conventions, covered by `CLAUDE.md`, `docs/ARCHITECTURE.md`, `specs/README.md` and spec 0008:**
  - 7: game keys over setters.
  - 8: what the mod, companion and web are; Protocol v1; topics; the answer words.
  - 14: Solek, the replay, the two screen sizes.

  One link to `docs/ARCHITECTURE.md` and one to spec 0008 would answer most of these without repeating them in the spec.
- **Line 116 (part of 14):** worth saying in one line what changes in spec 0008's `ai.set` row and in PLAN.md.
