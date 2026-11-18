# 0021: GPS screen: the field, its lanes and the progress

Status: draft
Mod: 0.22.0 (planned) · Started: 2026-11-17 · Design: a canvas at 1158×676 and 1180×820, to draw before approval; the brainstorm is in [concepts_brief.md](../concepts_brief.md) until the GPS specs are approved

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
  - Done lanes and rounds are filled; the lane you're on is marked; the
    ones to do are thin lines.
  - The rig's position and heading, live.
  - With lanes closer than about 1 px on screen, they are shaded by state
    instead of drawn one by one.
- **The counts,** one line: "Headland 1 of 2 · Lane 21 of 60". Headland
  rounds and lanes each have their own count (Vincent, 2026-11-17: rounds
  count).
- **The worked part:** what you worked even while ignoring the lanes still
  counts (Vincent). Where it comes from is open (question 2).
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
- **Day and Night:** names its colours for done, this lane and to do,
  checked against the trail's in both palettes; nothing yellow at night.
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
  topic matches.
- **Web** (`web/src/types.js`): `SteeringCourse`; a new screen in
  `web/src/widgets/` and its tab.

Game API names, all **unverified**:

| Name | Where from | State |
|---|---|---|
| `spec_aiAutomaticSteering.steeringFieldCourse`, `.lastActiveSteeringFieldCourse` | AIAutomaticSteering.lua:133-134; both are in the save | unverified |
| the course's segments, which are headland and which lanes, and their geometry | `SteeringFieldCourse` is not in the archive; the AI worker's `FieldCourse` has `.segments` (AIDriveStrategyFieldCourse.lua:203) | **unknown: the spike** |
| `currentSegmentIndex`, `currentSegmentIsLeft`, `currentSegment` | AIAutomaticSteering.lua:357, 689-690 | unverified |
| the lanes done: the save's `workedLines indices` (segment indices: one round and one lane gave five); in memory, the field name is unknown | Vincent's Solek save, 2026-11-17 | **unknown: the spike** |
| the field's outline: the save's `field boundary positions` (x z pairs, world metres) | Vincent's Solek save | unverified |

## Commands

None. Steering on and off is spec 0020's; the settings are spec 0022's.

## Plan

1. **Spike (read only):** a shallow dump of `steeringFieldCourse` and one
   segment's plain fields; drive one headland round and one lane, and
   record which indices go done; the size of a course as JSON and the time
   to encode it.
2. **The canvas** at both sizes, day and night, approved before code.
3. `mod/src/Api.lua` reads; `mod/src/collectors/SteeringCourse.lua` (one
   collector, one topic); `mod/modDesc.xml` 0.22.0.
4. `web/src/types.js`, the GPS screen and its tab, the colours in
   `theme.css`, THEMES.md's Screens.
5. **Risks:** the course class is missing from the archive; a large field
   with narrow lanes makes a big topic; the Vehicle page is already slow on
   the iPad (the GPS screen draws a course once, then only states).

## Acceptance

Automated (to be filled in once the spike shows the course):
- [ ] `mod/tests/run.lua`: `steering_course` from a faked course: the
  boundary, rounds and lanes, the done indices; sent once per course and on
  a state change; absent without a course.
- [ ] `web/test.html`: the screen draws a fixture course with its counts;
  each "no lanes" reason shows its words; a new `key` redraws.
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

1. **The counts:** "Lane 21 of 60" as the lane you're on, or lanes done?
2. **The worked part, counted even when the lanes are ignored:**
   - the Vehicle page's trail (spec 0013), as today: in each browser, lost
     on a reload;
   - the same trail kept by the companion, so both iPads agree and it
     survives a reload;
   - the ground checked at a few points per lane, as the game itself checks
     whether you're on a field (`getDensityAtWorldPos`,
     AIAutomaticSteering.lua:445). A spike must show its cost first.
3. **Time left:** from the lanes left and your time per lane and per turn
   on this field, or from the area left and the work rate.
4. A GPS layer on the Map too?
5. Contract fields have lanes too: what the screen shows there.

## Log

- 2026-11-17: drafted from the egm brainstorm (concepts_brief.md). Vincent:
  the field panel is far too small, the GPS gets its own screen; headland
  rounds count; the time left comes with this spec.
