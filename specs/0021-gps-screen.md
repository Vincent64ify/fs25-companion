# 0021: GPS screen: the field, its lanes and the progress

Status: draft
Mod: 0.22.0 (planned) · Started: 2026-11-17 · Design: the canvas [FS25 Companion: GPS](https://claude.ai/artifact/45ruF2v1hH49JJi4HyRTeM) (private, on claude.ai; at 1158 × 676 and 1180 × 820, day and night; approved by Vincent, 2026-11-19); the brainstorm's brief, `concepts_brief.md`, is in git history (commit b0cffeb)

## Goal

The second GPS spec, after [0020](0020-steering-assist-state.md) and
before [0022](0022-steering-assist-settings.md).

A screen of its own for the GPS, the game's Steering Assist. It shows the
whole field big, with the lanes the game built: the headland rounds and the
straight lanes, which are done, and the one you're on. It also shows how far
along you are and how long is left. Vincent drives with the joystick (turns,
the tool), so the screen is for looking at, not pressing: the field panel on
the Vehicle page is far too small for this.

## Behaviour

To be drawn on a canvas first; this is what it holds.

- **A GPS tab** in the tab bar, beside Map, Vehicle and Contracts. The
  screen keeps the control column (Lights and Drive), since you drive with
  it; steering on and off is the Drive button of spec 0020, with no second
  button here (one control per action).
- **The field, big:** the field's outline from the game's course, the
  headland rounds and the lanes in world metres, filling the screen.
  - Done lanes and rounds are solid green ("worked", like the trail but
    darker), a hairline of the field between them so they can be counted;
    the lane you're on is the on blue with an outline; the ones to do are
    faint dashed lines. A small legend sits in the field's corner
    (Vincent, 2026-11-19: done must read clearly against the lines).
  - The rig's position and heading, live.
  - With lanes closer than about 1 px on screen, they are shaded by state
    instead of drawn one by one.
- **The counts,** over the field: lanes done ("Lanes done 10 of 40"), the
  lane you're on beside it ("On lane 21"), and the headland rounds done
  ("Rounds done 0 of 2"). Done lanes aren't all behind you: many players
  (and farmers) skip a lane and work the next for a smoother turn (the
  game's Skip Lines), so done is counted from the lanes the game marks,
  never from the lane you're on (Vincent, 2026-11-19). Headland rounds
  count too (Vincent, 2026-11-17).
- **The worked part:** the Vehicle page's trail (spec 0013) under the lanes,
  so what you worked while ignoring the lanes still shows (Vincent,
  2026-11-19). It is that trail as it is today, kept in each browser.
- **Time left:** "≈ 18 min left", in real time (work runs at real-time
  rates at any game speed), hidden until the estimate settles.
- **When there are no lanes,** the screen says why, in the game's words:
  - not in Steering Assist mode ("Steering Assist is off for this tractor");
  - off the field ("Drive onto a field you may work");
  - building ("Building the lanes…");
  - no lane under you ("No lane here").

  On the field, the outline shows while the lanes are building.
- **The game's last course** for this rig is drawn when you come back to a
  field you already worked with the same settings (the game keeps it).
- **Day and Night:** `--gps-done`, `--gps-current`, `--gps-todo` (and the
  field and its edge) in `theme.css`, from the canvas: done at least 3:1
  on the field, lighter than this lane, darker than the trail in both
  palettes; nothing yellow at night (this lane takes the select ring's
  light grey).
- **Fast on the iPad:** the field is drawn on a `<canvas>`, never an
  element per lane: the course once per `key`, then only the lanes whose
  state changed; the trail as on the Vehicle page (its newest stretch);
  the rig one element moved by a CSS transform. The Vehicle page's field
  panel was slow on iPad Safari for doing otherwise (spec 0013).
- **Sizes:** works on any tablet down to 1158×676; the compact class keeps
  the field on top and the control column under it.

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change.

- **Mod → companion,** a new topic `steering_course` (resend on, sent once
  per course and again when a lane's state changes):
  - `key`: changes with each new course, so the web redraws only then;
  - `boundary`: the field's outline, world metres, a flat array like
    `field_outlines`;
  - `headlands` and `lanes`: polylines in world metres, flat arrays, each
    with its segment indices;
  - `done`: the indices done (the save calls them `workedLines`);
  - `current`: the segment you're on, and its side.
- **`cab.steering`** (spec 0020) gains `courseKey` so the web knows the
  topic matches, and `onField` (boolean): the game's own "on a field the
  farm may work" for this vehicle, for the "Drive onto a field you may
  work" words (moved here from 0020, its first reader).
- **Web** (`web/src/types.js`): `SteeringCourse`; a new screen in
  `web/src/widgets/` and its tab.

Game API names, all **unverified**:

| Name | Where from | State |
|---|---|---|
| `spec_aiAutomaticSteering.steeringFieldCourse`, `.lastActiveSteeringFieldCourse` | AIAutomaticSteering.lua:133-134; both are in the save | unverified |
| the course's segments, which are headland and which lanes, and their geometry | `SteeringFieldCourse` is not in the archive; the AI worker's `FieldCourse` has `.segments` (AIDriveStrategyFieldCourse.lua:203) | **unknown: the spike** |
| `currentSegmentIndex`, `currentSegmentIsLeft`, `currentSegment` | AIAutomaticSteering.lua:357, 689-690 | unverified |
| `spec_aiAutomaticSteering.lastIsOnField` (`onField`) | AIAutomaticSteering.lua:129-141; the game updates it only for the local player's vehicle in Steering Assist mode (:440-441), so it may be stale outside it | unverified |
| the lanes done: the save's `workedLines indices` (segment indices: one round and one lane gave five); in memory, the field name is unknown | Vincent's Solek save, 2026-11-17 | **unknown: the spike** |
| the field's outline: the save's `field boundary positions` (x z pairs, world metres) | Vincent's Solek save | unverified |

## Commands

None. Steering on and off is spec 0020's; the settings are spec 0022's.

## Plan

1. **Spike (read only):** a shallow dump of `steeringFieldCourse` and one
   segment's plain fields; drive one headland round and one lane, then a
   lane with Skip Lines at 1, and record which indices go done; the size of a course as JSON and the time
   to encode it.
2. **The canvas** at both sizes, day and night, approved before code.
3. `mod/src/Api.lua` reads; `mod/src/collectors/SteeringCourse.lua` (one
   collector, one topic); `mod/modDesc.xml` 0.22.0.
4. `web/src/types.js`, the GPS screen and its tab, the colours in
   `theme.css`, THEMES.md's Screens.
5. **Risks:** the course class is missing from the archive; a large field
   with narrow lanes makes a big topic; the Vehicle page is already slow on
   the iPad, and the browser pane can't show it: Vincent checks the GPS
   screen on the iPad, day and night, before the live check.

## Acceptance

Automated (to be filled in once the spike shows the course):
- [ ] `mod/tests/run.lua`: `steering_course` from a faked course: the
  boundary, rounds and lanes, the done indices; sent once per course and on
  a state change; absent without a course.
- [ ] `web/test.html`: the screen draws a fixture course with its counts;
  each "no lanes" reason shows its words; a new `key` redraws the whole
  course, a changed `done` repaints only the lanes that changed (counted),
  and a rig update repaints no lane.
- [ ] A course fixture from the spike's dump (Precision Farming on and off).
- [ ] Replay in the browser pane at 1158×676 and 1180×820, day and night.

Live check (Solek, mod 0.22.0):
- [ ] The dashboard's lanes match the ones the game draws.
- [ ] One round, then lanes: the counts step once per round and per lane.
- [ ] Save and reload: the done lanes come back.
- [ ] Off the field, building, no lane: the words.
- [ ] The time left against the clock over a whole field.
- [ ] Precision Farming on and off.

## Decisions

- **A screen of its own** (Vincent, 2026-11-17), not a layer on the
  Vehicle page's field panel, which the brainstorm had proposed.
- **The game's course, never our own:** the dashboard draws what the game
  built, so it can't disagree with the game. No course before the field
  (that would need the game's heavy course builder).

## Out of scope / open questions

1. ~~The counts~~: lanes done, and the lane you're on (Behaviour).
2. ~~The worked part~~: the Vehicle page's trail under the lanes
   (Behaviour).
3. **Time left:** from the lanes left and your time per lane and per turn
   on this field, or from the area left and the work rate.
4. A GPS layer on the Map too?
5. Contract fields have lanes too: what the screen shows there.

## Log

- 2026-11-17: drafted from the egm brainstorm (concepts_brief.md). Vincent:
  the field panel is far too small, the GPS gets its own screen; headland
  rounds count; the time left comes with this spec.
- 2026-11-19: the canvas drawn ahead of the Plan's spike, so its field,
  lanes and numbers are invented: ten boards (steering, ready, building,
  off the field, no lane, AI worker mode, dense lanes, the colours beside
  the trail's), the open questions 1 and 2 as Tweaks on Main (count: on
  or done; worked: lanes or the trail). Off the field the course stays,
  dimmed (spec 0020's live check: the game keeps it). Lanes first, then
  the rounds, as Vincent's dialog has it (Start with: Up / Down). The tab
  icon is a placeholder (`area`). Waiting for Vincent's look.
- 2026-11-19: Vincent's answers on the canvas: the counts are lanes done
  with the lane you're on beside them (players skip lanes for a smoother
  turn, so done isn't "every lane behind you"); the trail goes under the
  lanes. Behaviour, the open questions and the spike updated; the canvas
  gained a skip Tweak (Night steering skips one) and the trail by default.
- 2026-11-19: Vincent asked for clearer done against to do, and whether it
  will be fast: done is now solid green with hairlines between lanes, this
  lane outlined, to do dashed, a legend (the canvas and Behaviour); the
  screen draws on a `<canvas>`, the course once per `key` and then only
  changed lanes (Behaviour, Acceptance), after spec 0013's iPad lesson.
- 2026-11-19: the canvas approved by Vincent ("Looks right"). Open before
  the spec's approval: questions 3 to 5 (time left, a Map layer, contract
  fields).
