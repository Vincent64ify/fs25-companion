# 0021: GPS screen: the field, its lanes and the progress

Status: live-checked (revisions 2 to 5 too)
Mod: 0.22.0 · Started: 2026-11-17 · Design: the canvas [FS25 Companion: GPS](https://claude.ai/artifact/45ruF2v1hH49JJi4HyRTeM) (private, on claude.ai; at 1158 × 676 and 1180 × 820, day and night; approved by Vincent, 2026-11-19; revision 2's "Refined lanes" row approved 2026-11-23); the brainstorm's brief, `concepts_brief.md`, is in git history (commit b0cffeb)

## Goal

The second GPS spec, after [0020](0020-steering-assist-state.md) and
before [0022](0022-steering-assist-settings.md).

A screen of its own for the GPS, the game's Steering Assist. It shows the
whole field big, with the lanes the game built: the headland rounds and the
straight lanes, which are done, and the one you're on. It also shows how far
along you are and how long is left. Vincent drives with the joystick (turns,
the tool), so the screen is for looking at, not pressing: the field panel on
the Vehicle page is far too small for this.

## Revision 2: the lanes as strips

Drafted 2026-11-23 after the live check, from Vincent's screenshot of
field 6, drawn on the canvas's "Refined lanes" row and approved by
Vincent the same day (the trail inside the lanes still to do; to do as
faint strips). This section is the revision whole; Behaviour below says
the same. No mod change.

**Why.** Two things on field 6 looked wrong:
- The rounds were drawn with rounded ends, so at every joint they bulged
  out and nicked in: a corner looked as if a bit was missed. Lanes ended
  square across the round, at an angle to it.
- The trail sat beside and past every done lane as a pale halo. The
  Terria works 6.6 m on lanes the game spaced 6.0 m apart, so each pass
  spills 0.3 m onto its neighbours, and the trail runs on past a lane's
  end into the headland.

**Behaviour.**
- **Every lane and round is the strip it works:** its working width wide
  (the course's `width`), square ends, mitred corners, never a rounded
  end.
  - A round is one closed strip (its pieces end to end; on fields 6 and
    7 they close to 0.0 m). A notch narrower than the width overlaps
    itself, as the tool does. A round worked part way is cut on the
    corner's bisector at the joint between done and to do.
  - A lane stops flush at the innermost round, a hairline before it. The
    game's lanes already run 0.6 to 3 m into that round (fields 6 and
    7): nothing is moved or run out, the overlap is only hidden.
  - A hairline of the field between strips, so they stay countable.
- **Done:** solid green. **To do:** the strip faintly tinted (the to-do
  colour at 16 %), not a dashed line. **The lane you're on:** outlined
  in this lane's colour, the part ahead tinted with it, solid green up to
  the rig with a square cut there.
- **The trail only inside the lanes still to do**, at least 1.5 m in from
  their sides: what you worked that the game hasn't counted. Beside and
  past done lanes, on the rounds and under the lane you're on it's
  hidden. The legend calls it "Worked, not counted". This changes
  Vincent's 2026-11-19 answer (the trail under every lane).
- **Colours:** the `--gps-*` and `--trail-work` ones; nothing new.

**Painting** (Fast on the iPad stays):
- The course canvas: each lane a stroke its width less a pixel, square
  ends, mitred, its polyline run out a width past each end; then the
  rounds' strokes a pixel wider erase what reaches into them; then each
  round one closed stroke its width less a pixel (a round worked part way:
  its stroke clipped to each run's sector, cut on the bisectors). All
  clipped to the course's outline.
- A changed lane: erased its width wide, painted again, and the rounds
  over it again (as today: the counted pieces). A changed round: erased
  and painted again.
- The lane you're on filled by one SVG line its width less a pixel,
  square ends, masked by the rounds (an SVG mask made once per course), so
  a vehicles message still repaints no lane.
- The trail canvas (the Vehicle page's painter) gains a mask step for
  this screen only: after it paints, it keeps what's inside the lanes to
  do (their strokes 3 m narrower) and erases the rounds. When a lane goes
  back to to do, the trail is painted whole again.

## Revision 3: lanes you can count

Drafted 2026-11-26 from Vincent's note ("the lines of the lanes are
quite pale vs the background"); drawn the same day on the GPS canvas's
"Lanes you can count" row (version 32: field 7 and a big field with a
3 m tool, both sizes, day and night, and the three looks side by side);
approved by Vincent the same day (edge lines), built the same day.
Behaviour below says the same. Web only, no mod change.

**Why.** A lane to do is its strip at 16 % of `--gps-todo` over the
field, and the line between two lanes to do is a hairline of the field
itself: light on light, about 1.1 : 1 (day). With lanes 6 m wide on
field 7 you can still guess them; with a narrow tool on a big field
(a replay with 2 m lanes on field 7, about 5 px each at 1158 × 676) the
lanes to do are one pale wash and lane 21 can't be told from 22. Below
4 px (`DENSE_PX`) there is no line at all.

**Behaviour.**
- **Every lane to do has its edges drawn:** a line 1 px wide (in CSS
  pixels) in `--gps-todo` along each side of its strip, at least 3 : 1
  on the field in both palettes, so the lanes read like the game's own
  lines in the cab. Two lanes to do side by side share one line. A done
  lane keeps its hairline of the field (green on the field is already
  over 3 : 1).
- **The strip under it a little stronger:** to do at 24 % (was 16 %),
  so the field, the lanes to do and the lanes done are three steps
  apart.
- **Day's `--gps-todo` darker** to reach 3 : 1 on the field: `#8F9BB0`
  is 2.6 : 1 on `#F4F7FC`; about `#6F7C94` (3.9 : 1, 3.0 : 1 on its
  own strip). **Night's lighter:** `#5D6B86` is 3.1 : 1 on `#161E2F` but
  2.5 : 1 on its own strip; about `#7684A0` (4.4 : 1, 3.2 : 1 on its
  strip). The canvas settles
  both. Nothing yellow at night.
- **Dense:** the lines stay down to 3 px between them; closer, the
  lanes to do are one tinted area as today (they can't be counted at
  that size anyway: revision 4's close-up is for that).
- The legend's To do swatch gets its edges too.
- The canvas also shows a second look for Vincent to compare: lanes to
  do alternately tinted (22 % and 34 %), no lines. The lines are the
  recommendation (they are what the game draws, and they hold at night).

**Painting:** the lines are one stroke per lane to do along each side
(the lane's polyline offset half a width), painted with the lane, so a
changed lane still repaints only itself and the rounds over its ends.

## Revision 4: the close-up at the lane's end

Drafted 2026-11-26 from Vincent's note: on a big field with a narrow
tool the lanes are close, and near a lane's end he wants to see clearly
which lane he turns into and line up with it. He offered three ways:
two buttons (zoom on the rig, back to the field), an automatic zoom from
75 % of the lane until he's on another lane, or a picture in picture
with that same rule. Drawn on the GPS canvas's "The close-up at the
lane's end" row (version 32, interactive: Field, Auto, Close); approved
by Vincent the same day (Auto at first, 40 m, the lane numbers), built
the same day. Behaviour below says the same. Web only, no mod change.

**The choice: one view that zooms, automatic, with a manual override.**
- **Not a picture in picture.** At 1158 × 676 the field's box is about
  830 × 420 px. An inset big enough to line up in (300 × 220) covers a
  third of it, right where you are, since at a lane's end the rig is at
  the field's edge, so it would have to jump corners. It also paints the
  course twice, and the iPad already pays for every paint (spec 0013).
  In a turn you look at one picture; the close-up in the whole box is
  three times the size of an inset.
- **Not two buttons alone.** You drive with the joystick and the screen
  is for looking at (Goal): two presses at every lane's end is what the
  dashboard is meant to save. The buttons stay, as a choice that sticks.
- **Not 75 % of the lane.** 75 % of a 600 m lane is 150 m (about 35 s at
  15 km/h) too early; of a 40 m lane, 10 m. A distance from the lane's
  end works the same on every field.

**Behaviour.**
- **A view switch** on the field card, bottom right (the legend sits
  bottom left, Set up top right): three choices in a well, **Field**,
  **Auto**, **Close**. The choice is kept in the browser; Auto at first.
  - **Field:** the whole field, as today.
  - **Close:** always the close-up, following the rig.
  - **Auto:** the whole field while you work a lane; the close-up from
    the last 40 m of a lane (the rig's place along it, as the fill
    measures it), through the turn, and back to the whole field once you
    are settled on a lane: within half a width of it, heading along it
    (within 15°), for 3 s. The game's lane under you flickers between
    neighbours for a second in a turn (live check, 2026-11-23); the 3 s
    ride over it. Only where it helps: when a lane is under 16 px wide in
    the whole-field view; on a field where lanes are already wide Auto
    stays on the field. Headland rounds never zoom (their corners aren't
    a lane's end).
- **The close-up:** north up, like the whole field (the two line up and
  nothing turns or repaints as you steer); about nine lanes across the
  box's short side, so four lanes each side are in view (a skip of two
  or three for a smoother turn is on screen), never less than 30 m. The
  rig a third in from where it came, so the lane's end, the headland and
  the next lanes are ahead in view (the canvas: centred, a lane's end
  40 m ahead was off the screen). Auto says why it zoomed in a tag, top
  left on the field card ("Close-up · Auto"). The strips, the trail, the fill and the rig as in the
  whole-field view.
- **Lane numbers** in the close-up only: a small chip with the lane's
  number at the end of each lane in view, the end nearer the rig, so you
  can pick "lane 23" before you turn into it.
- **Moving:** going in and out of the close-up takes 0.4 s (the box
  scaled by a transform, then painted sharp once at the new scale). In
  the close-up the rig and the view glide between the positions (they
  come twice a second, 1 cm and 0.1°; spec 0013's `vehicles`), so the
  picture is about half a second behind and never jumps 2 m at a time.
- **The counts, time left and legend** stay as they are. Set up's preview
  (spec 0022) is always shown whole field.
- **Sizes:** works at 1158 × 676 and 1180 × 820, day and night; the
  switch's buttons at least 44 px.

**Painting** (Fast on the iPad stays):
- The close-up paints the course and the trail once for an area larger
  than the box (twice its size each way, kept under Safari's canvas
  limit), and slides that by a CSS transform as the rig moves; it paints
  again only when the rig nears the painted area's edge, and when a lane
  changes state (only that lane, as today). A vehicles message moves a
  transform and repaints nothing.
- Nothing painted while the page is hidden, as today.

**Risks:** if gliding between the twice-a-second positions isn't smooth
enough to line up with, the mod would send the controlled vehicle's pose
more often: a mod change, its own revision.

## Revision 5: Auto by the close-up's own picture, no jump at a new picture

Drafted 2026-11-26 from Vincent's live check of revision 4: "3 seconds
is too fast" (he wants the whole field again 40 m after a lane is
started) and "there is stuttering for the lane draw". Approved by
Vincent the same day ("Approve, build it") and built with 40 m in and
lanes under 100 m staying close; then, the same day, he asked for a rule
with no numbers of ours ("we will always run into a scenario where we're
either just a bit short or just a bit too long"), and no seconds either
(a player may leave the game running): approved ("Yes, build it") and
built as below. Behaviour below says the same. Web only, no mod change.

**Behaviour.**
- **Auto shows the close-up while an end of your lane is on the
  close-up's own picture**, in place of 40 m before the end and 3 s
  settled. On a lane (within half a width of it, heading along it within
  15°): the close-up if the lane's start or its end is inside the
  picture the close-up would show for the rig now (`closeView`: nine
  lanes across, the rig a third in), else the whole field. On a headland
  round the same, with the piece's corners for ends (each corner along
  the piece you're on, its two ends included; Vincent, 2026-11-26: the
  close-up into each corner, the field along the sides). Anywhere else
  (the turn, the game's piece flickering to a neighbour, heading across)
  it stays as it was. So it comes in as the lane's end appears on
  the close-up and goes out once the start you came from has left it;
  how early and how late follow the close-up's size, which follows the
  tool's width, with no distance and no time of ours. A lane that fits
  on the close-up is close all along (the whole field would show
  nothing more); one a little longer shows the whole field only while
  neither end could be on the close-up. It doesn't flap: on a lane the
  view is the rig's place alone, nothing remembered. The direction counts
  (north up, the box wider than tall), so with 3 m lanes at 1158 × 676
  it comes in about 20 to 45 m before the end. The tag says
  "Close-up · Auto" (no "the lane's end": it also shows at a lane's start).
- **The lane's fill steps with each position, as before:** the green
  up to the rig moves when a position comes (twice a second). A 500 ms
  slide with the arrow was built and taken out the same day: on the
  iPad it looked jittery, the step "more natural" (Vincent).
- **No jump at a new picture:** when the close-up is painted again for a
  new area, the picture and the arrow carry on gliding from where they
  were, instead of jumping to the newest position.

**Painting.** The fill is the whole lane's polyline, set once per lane,
shown up to the rig by its dash (`stroke-dasharray`, the length along
the lane), set per position with no slide; a vehicles message moves a
transform and the fill's dash, and repaints no lane. On a new picture: the layers
placed at once where the old view sits in the new area, then slid to the
new place.

## Behaviour

To be drawn on a canvas first; this is what it holds.

- **A GPS tab** in the tab bar, beside Map, Vehicle and Contracts. The
  screen keeps the control column (Lights and Drive), since you drive with
  it; steering on and off is the Drive button of spec 0020, with no second
  button here (one control per action).
- **The field, big:** the field's outline from the game's course, the
  headland rounds and the lanes in world metres, filling the screen.
  - Every lane and round is the strip it works, its width wide, square
    ends and mitred corners; lanes stop flush a hairline before the
    innermost round; a hairline of the field between strips so they can
    be counted (revision 2).
  - Done lanes and rounds are solid green ("worked", like the trail but
    darker); the ones to do are the strip tinted at 24 % with its two
    edges as lines of the to-do colour, a CSS pixel wide, while lanes are
    3 px or more apart (revision 3: at 16 % with a hairline of the field
    between them they were about 1.1 : 1 against it); the lane you're
    on is outlined in the on blue, the part ahead tinted with it, filled
    green up to where you are along it (measured from its points and your
    position, no rule of ours) with a square cut. A small legend sits in
    the field's corner (Vincent, 2026-11-19: done must read clearly).
  - The rig's position and heading, live.
  - With lanes closer than about 1 px on screen, they are shaded by state
    instead of drawn one by one.
- **The close-up** (revision 4): a switch bottom right on the field card,
  Field · Auto · Close, kept in the browser, Auto at first. Field: the
  whole field. Close: the close-up, always. Auto: the whole field while
  you work a lane; the close-up while an end of your lane is on the
  close-up's picture (revision 5: on the lane, within half a width,
  heading along it within 15°; on a headland round the same with the
  piece's corners; anywhere else, the turn included, it stays as it was); only where a lane is under 16 px in
  the whole-field view. It says so top left: "Close-up · Auto".
  The picture and the rig glide between the positions, also when the
  close-up is painted again; the fill's end steps with each position
  (revision 5). The close-up:
  north up, about nine lanes across the box's short side (at least 30 m),
  the rig a third in from where it came so the lane's end, the headland
  and the next lanes are ahead; the lanes' numbers in chips at each
  lane's end nearer the rig (done ones quiet, this lane ringed). Set up's
  column shows the whole field, the switch hidden.
- **The counts,** over the field: lanes done ("Lanes done 10 of 40"), the
  lane you're on beside it ("On lane 21"), and the headland rounds done
  ("Rounds done 0 of 2"). Done lanes aren't all behind you: many players
  (and farmers) skip a lane by hand and work the next for a smoother turn
  (the dialog has no such setting), so done is counted from the lanes the game marks,
  never from the lane you're on (Vincent, 2026-11-19). The lane you're on
  never counts as done, whatever the game's flag says: once you leave it,
  the game's flag decides, solid green and counted, or back to to do
  (Vincent, 2026-11-23: the game may mark a lane as you start it). The game
  cuts a lane crossing a notch in pieces with one number, each flagged on
  its own; the lane counts once, done once every piece is, as a round
  (Vincent, 2026-11-23, field 6: 19 lanes, 27 pieces). A lane
  started and left after a few metres counts as the game says; if it
  stays to do, the trail inside it shows what was worked. Headland rounds count too (Vincent,
  2026-11-17): a round is done once every piece of it is, and the piece
  you're on never counts, as with a lane. On a headland piece "On lane"
  reads "On headland" and the round's number (Vincent, 2026-11-23).
- **The worked part:** the Vehicle page's trail (spec 0013), only inside
  the lanes still to do, 1.5 m in from their sides: what you worked that
  the game hasn't counted ("Worked, not counted"). Beside and past done
  lanes, on the rounds and under the lane you're on it's hidden
  (revision 2; on 2026-11-19 Vincent had it under every lane). It is that
  trail as it is today, kept in each browser.
- **Time left:** "≈ 18 min left", in real time (work runs at real-time
  rates at any game speed), from your own times on this field in this
  session: the lanes left times your time per lane and per turn, plus the
  rounds left at your time per metre, less how far along the lane you're
  on you are. So it follows skipping, your speed and your turns (Vincent,
  2026-11-19), and doesn't drop a lane as you start one (2026-11-23). "–"
  until two lanes are done. Built as one rate (Vincent's OK, 2026-11-23,
  judged in the live check): the seconds you spent on each lane, its turn in included
  (the game moves to the next lane as you reach the end, so the turn
  counts with the lane it leads to), over its metres; only lanes the game
  marks done as you leave them, and only time the rig moves (over
  0.5 km/h, as the trail), so a skipped lane or a pause doesn't count.
  Each lane counts once, and only once you drove half of it: in a turn
  the game's lane under you flickers for a second across the round and
  the lanes beside you, and every moving second since the last lane
  counted, whatever it crossed, goes to the next one (the first lane
  counted takes only its own seconds). Live check, 2026-11-23.
  What's left is the metres of the lanes and pieces not done, less how
  far along the one you're on you are, at that rate. Kept per course in
  the page, so a new course starts again.
- **A contract's field:** the same screen; the field line names your
  running contract on it ("Field 58 · Contract: Cultivating"), from the
  `contracts` topic (spec 0018: its `fieldId` and `title`) (Vincent,
  2026-11-19).
- **When there are no lanes,** the screen says why, in the game's words:
  - not in Steering Assist mode ("Steering Assist is off for this tractor");
  - off the field ("Drive onto a field you may work");
  - building ("Building the lanes…");
  - no lane under you ("No lane here").

  On the field, the outline shows while the lanes are building. On foot
  "Get into a vehicle", and on a vehicle without Steering Assist "No
  Steering Assist on this vehicle" (Vincent's OK, 2026-11-23).
- **The lane you're on fills** up to the rig: the rig's place on the lane
  by its length, from the end it drives from (its heading against the
  lane), while it is within a lane's width of it; else not at all.
- **The game's last course** for this rig is drawn when you come back to a
  field you already worked with the same settings (the game keeps it).
- **Day and Night:** `--gps-done`, `--gps-current`, `--gps-todo` (and the
  field and its edge) in `theme.css`, from the canvas: done at least 3:1
  on the field, lighter than this lane, darker than the trail in both
  palettes; nothing yellow at night (this lane takes the select ring's
  light grey).
- **Fast on the iPad:** the field is drawn on a `<canvas>`, never an
  element per lane: the course once per `key` (and per size and palette),
  then only the lanes whose state changed, and the rounds over their ends
  (revision 2's painting); the trail as on the Vehicle page (its newest
  stretch, the same painter: `web/src/ui/trailCanvas.js`), masked to the
  lanes to do; the rig one element moved by a CSS transform, the lane
  you're on filled by one SVG line masked by the rounds (a headland
  round's own fill unmasked, or the mask hides it), so a vehicles
  message repaints no lane; nothing painted while the page is hidden. The Vehicle page's field
  panel was slow on iPad Safari for doing otherwise (spec 0013).
  Revision 4: every layer sits in one element; the close-up paints the
  course and the trail once for twice the box each way (less where a
  canvas would pass 15 Mpx: Safari's limit is 16.7) and slides them by
  a CSS transform as the rig moves (gliding 0.5 s between its twice-a-
  second positions), painted again only when the view comes within an
  eighth of the box of the painted area's edge (the arrow then jumps
  with the picture, and turns the short way round); going in and out
  scales the old picture for 0.4 s, then paints the new one sharp.
- **Sizes:** works on any tablet down to 1158×676; the compact class keeps
  the field on top and the control column under it.

## Data contract

Topics gain fields (Protocol v1); `v` doesn't change.

- **Mod → companion,** a new topic `steering_course` for the controlled
  vehicle's course (resend on; read every 500 ms, sent once per course and
  again when `done` or `current` changes; nothing without a course):

  ```json
  {"key": 3, "width": 6, "boundary": [-564.2, -609.2, -578.2, -592.2],
   "segments": [{"i": 1, "lane": 1, "pts": [-793.0, -654.6, -785.1, -653.4, -573.0, -606.0]},
                {"i": 11, "round": 1, "pts": [-567.0, -610.8, -580.7, -594.0]}],
   "done": [7, 9, 10, 11, 12, 13, 14],
   "current": {"i": 9, "left": true}}
  ```

  - `key`: a new number for each new course table, so the web redraws only then;
  - `width`: the course's working width in metres (its settings' `implementWidth`), the lanes' spacing;
  - `boundary`: the field's outline, world metres, a flat array like
    `field_outlines`, 0.1 m;
  - `segments`: every segment in the game's order, `i` its index, `lane`
    (a lane's number) or `round` (a headland piece's round), `pts` its
    polyline, flat, 0.1 m (one list where the draft had `headlands` and
    `lanes`: simpler, the game's own one table in its order; Vincent's
    OK, 2026-11-23);
  - `done`: the indices whose flag is set, ascending (the save calls them `workedLines`);
  - `current`: the segment under you and its side; absent with none (the
    game's `currentSegment` nil: "No lane here").

  A course the mod can't read whole (a segment without its points) sends
  nothing. About 30 bytes a point: 100 lanes of three points, 10 KB.
- **`cab.steering`** (spec 0020) gains `courseKey` (the topic's `key`,
  while there is a course) so the web knows the topic matches, and
  `onField` (boolean): the game's own "on a field the farm may work" for
  this vehicle, for the "Drive onto a field you may work" words (moved
  here from 0020, its first reader).
- **Web** (`web/src/types.js`): `SteeringCourse`; a new screen in
  `web/src/widgets/` and its tab.

Game API names, read live by spike 0.0.16 and 0.0.17 on Solek field 7
(2026-11-23, `course-*.json`); verified once the live check passes:

| Name | Where from | State |
|---|---|---|
| `spec_aiAutomaticSteering.steeringFieldCourse`, `.lastActiveSteeringFieldCourse` | AIAutomaticSteering.lua:133-134; both are in the save; the same table once you've steered on it | seen: the spike |
| the segments: `course.fieldCourse.segments[i]` (`course.segments` is the same table), each with `segmentId` (= `i`), `positions` (`{x, z}` pairs, world metres, 2 to 4 points), `isHeadlandSegment`, `headlandIndex` (the round, headland only), `offsetLineIndex` (the lane's number, lanes only), `lineGroupIndex`, `length` | field 7, one headland: lanes 1 to 10, then the round as segments 11 to 14; 5 KB as JSON, encoded in 0.2 ms | seen: the spike |
| `currentSegmentIndex`, `currentSegmentIsLeft`, `currentSegment` (the segment's own table) | AIAutomaticSteering.lua:357, 689-690; the index follows the lane under you, steering or not | seen: the spike |
| `spec_aiAutomaticSteering.lastIsOnField` (`onField`) | AIAutomaticSteering.lua:129-141; the game updates it only for the local player's vehicle in Steering Assist mode (:440-441), so it may be stale outside it | unverified |
| the lanes done: `course.segmentStates[i]`, one boolean per segment; the save's `workedLines indices` are the same indices, and a reload puts them back | the round and lanes 10 and 9 done gave `9 10 11 12 13 14` in the save and in memory after reloading; lane 8 skipped by hand and lane 7 worked gave `7 9 10 ...` | seen: the spike |
| the field's outline: `course.fieldCourse.courseField.boundaryPositions` (`{x, z}` pairs, world metres; `course.rootBoundaryLine` is the same table); in the save, `field boundary positions` | field 7: 9 points | seen: the spike |

## Commands

None. Steering on and off is spec 0020's; the settings are spec 0022's.

## Plan

1. **Spike (read only):** a shallow dump of `steeringFieldCourse` and one
   segment's plain fields; drive one headland round and one lane, then a
   lane skipped by hand, and record which indices go done; the size of a course as JSON and the time
   to encode it. Done 2026-11-23 (the Log).
2. **The canvas** at both sizes, day and night, approved before code
   (2026-11-19; field 7's real course and the lane fill, 2026-11-23).
3. `mod/src/Api.lua` reads; `mod/src/collectors/SteeringCourse.lua` (one
   collector, one topic); `mod/modDesc.xml` 0.22.0.
4. `web/src/types.js`, the GPS screen and its tab, the colours in
   `theme.css`, THEMES.md's Screens.
5. **Risks:** the course class is missing from the archive; a large field
   with narrow lanes makes a big topic; the Vehicle page is already slow on
   the iPad, and the browser pane can't show it: Vincent checks the GPS
   screen on the iPad, day and night, before the live check.

## Acceptance

Automated:
- [x] Course fixtures from the spike's dumps: `mod/tests/fixtures/spike0021/`
  (fresh, reload, skip1) and `web/fixtures/steering_course.json` (the
  topic from skip1). Precision Farming doesn't touch the course (its
  settings hold no Precision Farming field), so there's no PF-off live
  check (Vincent, 2026-11-23).
- [x] `mod/tests/run.lua`: `steering_course` from the dumps' courses: the
  boundary, the ten lanes and four round pieces with their numbers and
  points, `width`, `done` (none, `9..14`, `7 9..14`) and `current`; the
  segment you're on read from `currentSegment`'s points; sent once per
  course, again when `done` or `current` changes, not otherwise; a new
  course table gets a new `key`; nothing without a course, on foot, or
  for a course with a segment without points; `cab.steering` carries
  `courseKey` and `onField`; 100 lanes of three points stay under 12 KB.
- [x] `web/test.html`, the counts (`web/src/data/gps.js`): from the
  fixture, lanes done 2 of 10 on lane 7 (lane 7's flag set: it's the one
  you're on), rounds 1 of 1; on a round piece "On headland 1" and the round
  not done; the fill from the rig's place and heading, 0 off the lane.
- [x] `web/test.html`, time left: "–" until two lanes are done; then the
  rate from the lane times fed in, a skipped lane and a stop left out,
  less the part of the lane you're on done; a new course starts again.
- [x] `web/test.html`, time left in a turn (the live check's flicker): a
  lane brushed for a second never counts, done before or timed already;
  each lane once; the turn's seconds go to the lane after it.
- [x] `web/test.html`, the counts: a lane in two pieces (one number) is
  one lane, done once both pieces are.
- [x] `web/test.html`, the screen: the fixture's course drawn with its
  counts and the field line naming a running contract on the field; each
  "no lanes" reason shows its words (on foot, no part, AI worker mode, off
  the field, building with the field's outline, no lane); a topic whose
  `key` isn't the cab's `courseKey` isn't drawn; a new `key` redraws the
  whole course, a changed `done` repaints only the lanes that changed
  (counted); a rig update repaints no lane (the fill is its own element);
  nothing painted while the page is hidden (0 × 0).
- [x] `web/test.html`: the theme has the GPS tab with the control column.
- [x] `web/test.html`, revision 2 (`web/src/data/gps.js`): each round's
  pieces end to end into one closed loop (field 7: seven points, the joints
  where the pieces meet); a round worked part way in runs of one state,
  each a sector cut on the bisectors at its joints; a lane's polyline run
  out a width past each end.
- [x] `web/test.html`, revision 2, the course canvas's pixels: at a
  round's outer corner the strip reaches the mitre's point (no rounded
  end); a done lane's end inside a round to do shows the round's tint, not
  the lane's green (cut flush); between two done lanes a hairline of the
  field; a round worked part way green on one side of the joint's
  bisector and tinted on the other; a lane to do tinted, not dashed.
- [x] `web/test.html`, revision 2, the trail: painted in a lane to do's
  middle, not on a done lane, within 1.5 m of a lane to do's side, on a
  round or under the lane you're on; a lane going back to to do paints the
  trail whole again; the Vehicle page's trail unmasked as before.
- [x] `web/test.html`, revision 2: the fill is the lane's width less a
  pixel, square ended, masked by the rounds; a rig update still repaints
  no lane; the legend reads Done, This lane, To do, Worked, not counted.
- [x] Replay in the browser pane, field 6's course and trail fed in, at
  1158×676 and 1180×820, day and night.
- [x] Replay in the browser pane at 1158×676 and 1180×820, day and night,
  the fixture's course fed in.

- [x] `web/test.html`, revision 3: a polyline offset half a width each
  side, mitred (`offsetLine`); on the course canvas, between two lanes to
  do a line of the to-do colour and the strip between at about 24 %;
  under 3 px apart no lines; the legend's swatch at 24 % with its edges.
- [x] `web/test.html`, revision 4, Auto (`createAutoZoom`): the whole field
  on a lane, close from its last 40 m, through the turn and a round, back
  once settled on the next lane for 3 s; never with lanes of 16 px or
  more, never from a round (revision 5: a round's corners count).
- [x] `web/test.html`, revision 4: the close-up's view (`closeView`: nine
  lanes, 30 m at least, the rig a third in); the lanes' numbers at their
  ends nearer the rig, in view, with their state (`laneNumbersOf`).
- [x] `web/test.html`, revision 4, the screen: the switch (Field, Auto,
  Close; Auto at first; kept in the browser); field 7 at 800 × 400 never
  zooms on Auto; Close paints once at twice the box; a few metres slide
  the picture with no paint, near the edge one paint more with the lane
  ends' numbers; Field the whole field; Auto with narrow lanes zooms at
  the lane's end with its tag; Set up open: the whole field, no switch.
- [x] `web/test.html`, revision 5, Auto: the whole field mid-lane, close
  once the lane's end is on the close-up's picture (50 m to go, 6 m
  lanes in 900 × 600), through the turn and a round, still close 10 m
  into the next lane (its start on the picture), kept while heading
  across, the field 60 m in; a 40 m lane close all along, the next 300 m
  lane the field mid-way; the tag "Close-up · Auto". On a headland
  round's 200 m piece: the field mid-side, close 30 m before its corner,
  the field again mid-side.
- [x] `web/test.html`, revision 5, the fill: the lane's points set once,
  a rig update moves only its dash, which ends at the rig; painted again
  near the edge, the picture and the arrow pass through the old view's
  place and glide on (no jump).
- [x] The live game in the browser pane at 1180 × 820 (field 122, 3 m
  lanes), a rig fed along lane 64: in the close-up the green stops
  square at the arrow, the lane ahead blue, cut by the rounds as before.
- [x] Replay in the browser pane, a 59-lane field of 3 m lanes fed in: the
  edge lines at 1180 × 820 day; Auto's close-up 25 m from the lane's end
  (numbers 34 to 43, the tag); in the turn at 1158 × 676 night; Set up
  open shows the whole field.

Live check (Solek, mod 0.22.0):
- [x] The dashboard's lanes match the ones the game draws (fields 7 and 6).
- [x] Two headlands, and a field with an island: the rounds count and the
  pieces draw (the spike saw one round, no island, `lineGroupIndex` 1 only).
  Field 6: three headlands and a notch that cuts lanes in two; no island
  field tried.
- [x] Building the lanes: the words and the outline (the spike never caught it).
- [x] Field 7: the field line (its area, the contract), the trail under
  the lanes, and the lanes at the top and bottom edges against the round.
- [x] One round, then lanes: the counts step once per round and per lane.
- [x] Save and reload: the done lanes come back.
- [x] Off the field, building, no lane: the words ("No lane here" from
  the files: the game has no lane only for half a second near an edge).
- [x] The time left against the clock over a whole field (field 7
  replayed through the fix; field 6 over five lanes).

Live check, revision 2 (no mod change: 0.22.0):
- [x] On the iPad, day and night, a field being worked: the rounds' corners
  square, lanes flush against the headland, no halo beside or past the
  lanes; a lane started and left (to do) shows its trail inside it.
- [x] Smooth on the iPad as before: a lane going done, the rig moving.

Live check, revisions 3, 4 and 5 (no mod change):
- [x] On the iPad, day and night: the lanes to do countable by their
  edge lines, on a field with a narrow tool.
- [x] Auto with a narrow tool: the close-up as the lane's end comes onto
  it, through the turn, back to the whole field once the lane's start has
  left it (revision 5); it doesn't flicker in the turn.
- [x] The lane numbers match the game's lanes (the one you turn into).
- [x] Close and Field picked: they stay, after a reload too.
- [x] Revision 5, Auto: the close-up comes in early enough to line up and
  goes out late enough, on the 3 m tool; it stays put with the game left
  running; a lane's sliver past a round stays close.
- [x] Revision 5, on the iPad: no jump every 10 to 20 m when the
  close-up is painted again; the fill stepping with each position as
  before (its slide taken out, 2026-11-26).
- [x] Smooth enough to line up by on the iPad: the glide between the
  twice-a-second positions, no stutter when the picture is painted again.

## Decisions

- **Strips, not lines** (revision 2, Vincent, 2026-11-23): every lane and
  round drawn as the strip it works, cut flush and mitred; the game's
  lanes and their ends stay the game's, only the overlap under the round
  is hidden. Replaces PLAN.md's "Tidy GPS lanes" (which would have
  straightened lanes and run them out).

- **A screen of its own** (Vincent, 2026-11-17), not a layer on the
  Vehicle page's field panel, which the brainstorm had proposed.
- **The game's course, never our own:** the dashboard draws what the game
  built, so it can't disagree with the game. No course before the field
  (that would need the game's heavy course builder).

## Out of scope / open questions

1. ~~The counts~~: lanes done, and the lane you're on (Behaviour).
2. ~~The worked part~~: the Vehicle page's trail under the lanes
   (Behaviour).
3. ~~Time left~~: your own lane and turn times on this field (Behaviour).
4. ~~A GPS layer on the Map~~: not in this spec; PLAN.md keeps it.
5. ~~Contract fields~~: the same screen, the contract named (Behaviour).
6. ~~When a lane goes done~~: once you've left it, as the game marks it;
   the lane you're on fills as you go (Behaviour).

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
- 2026-11-19: Vincent answered questions 3 to 5: time left from his own
  lane and turn times on this field ("–" until two lanes are done); no Map
  layer in this spec (PLAN.md); a contract's field shows the same screen
  with the contract named. No open questions left: ready for his approval.
- 2026-11-19: approved by Vincent. Next: the build, starting with the spike
  (Plan, step 1); a dump that disagrees with the Data contract sends it
  back for approval.
- 2026-11-22: spike 0.0.16 written for the Plan's step 1: `csCourse NAME`
  dumps the course by shape, raw reads only (the save keeps no segments,
  and 0.0.15's course dump showed only its plain fields). Six runs and a
  save in `research/spike/README.md`; waiting for Vincent's files.
- 2026-11-23: five dumps of spike 0.0.16 on field 7 (a cultivating
  contract, one headland): 14 segments in `fieldCourse.segments` (each
  with `positions`, `isHeadlandSegment`, `headlandIndex`, `lineGroupIndex`,
  `offsetLineIndex`, `segmentId`), the current one in `currentSegment`,
  and the done flags in `course.segmentStates`, one boolean per segment.
  The shape showed only its first 6 values, so spike 0.0.17 shows them
  all. "Skip Lines" is not in the AI Settings dialog (Vincent's
  screenshot); the course settings' `skipNumLines` is the game's own and
  not used here; Behaviour and the Plan now say skipping by hand.
- 2026-11-23: spike 0.0.17, three more dumps and the save (slot 13): the
  done flags are `segmentStates`, the save's `workedLines` are the same
  indices and come back on reload, and a lane skipped by hand stays not
  done while the one after goes done (the Data contract table). Lane 9
  was done in the save Vincent made at its start, so a lane may go done
  when you start it, not when you finish it: open question 6.
- 2026-11-23: Vincent answered question 6: the lane you're on never
  counts; it fills green up to where you are, and once you leave it the
  game's flag decides; no threshold of ours (the game's course, never our
  own). The time left takes off how far along it you are. Behaviour
  updated; approved by Vincent.
- 2026-11-23: built (mod 0.22.0). Mod: Api.lua's course reads (plain
  fields), `collectors/SteeringCourse.lua` (500 ms, the geometry once per
  course table, sent on a new course or a change in `done` or `current`),
  `cab.steering` `courseKey` and `onField`; three spike dumps as the
  tests' fixtures. Web: `data/gps.js` (counts, the fill, the time left,
  the words), `widgets/gpsScreen.js` and the GPS tab between Vehicle and
  Contracts, the `--gps-*` colours in `theme.css`; the field panel's
  trail painter moved to `ui/trailCanvas.js` unchanged, shared. Build
  choices for Vincent's OK, each in Behaviour or the Data contract: one
  `segments` list (lane or round on each) where the draft had `headlands`
  and `lanes`, and `width`; "On round" on a headland piece; the words on
  foot and without the part; the time left as one rate, a lane's turn in
  counted with it. The field line finds the field from the middle of the
  course's middle lane: the live game's field 7 outline (the mod's stream,
  2026-11-23) is the course's boundary point for point; the replay's older
  Solek has a smaller field 7 (0.43 ha), which the screen still finds
  through another lane. Every layer of the field's box shares one
  measured box (one fit); a course gone while the page is hidden makes
  the next one paint whole, so a key the mod gives again after a restart
  doesn't keep old lanes, and the times start again; the mod reads a
  course again until it is whole. pytest 152 passed (golden unchanged),
  test.html 413 all green, the replay with field 7's course fed in at
  1180×820 and 1158×676, day and night (lane 7 and lane 1 at the edge),
  and the tab bar with four tabs at 1158. Live check next; the design
  system isn't refreshed for the `--gps-*` tokens yet.
- 2026-11-23: Vincent answered the four build choices: one `segments`
  list (the simpler code), the words on foot and without the part, and
  the time left as one rate (judged against the clock in the live
  check) stay; a headland piece reads "On headland 1", not "On round 1".
- 2026-11-23: live check, Solek field 7 (mod 0.22.0, Precision Farming
  on), working its contract: the lanes match the game's; the counts right
  (2 of 10, on lane 7, round 1 of 1, then one lane at a time in Vincent's
  skipping order 7, 5, 3, 1, 2, 4, 6, 8; 9 of 10 at the end, as the
  contract ended on lane 8 before he left it); the field line whole at
  1180 and 1158 ("1.46 ha · Contract: Cultivating · 6.0 m"); "Get into a
  vehicle" on foot. The time left was about half the real one: in each
  turn the game's `current` flickers for a second across the round and
  the lanes beside you (7, round, 8, 7, round, 5), and each brush of a
  done lane counted it again (6 lanes driven, 14 timed). Fixed in
  `data/gps.js` (web only): each lane once, half of it driven, the turn's
  seconds to the next lane. The lap replayed through the fix against the
  clock: 5 to 6 min shown with 5.6 left, 3 with 3.1, 2 with 2.0, 1 with
  0.7; it moves by about a minute within a turn. test.html 414 green.
- 2026-11-23: live check, Solek field 6 (yours, 3 headlands): "Building
  the lanes…" with the outline, seen at last; three rounds (11, 11 and 10
  pieces) and 19 lanes, matching the game's. The game cuts lanes 11 to 18
  in two at the field's notch, one number on both pieces, each flagged
  done on its own, so "Lanes done" said "of 27": now it counts lane
  numbers, a lane done once all its pieces are (Vincent's pick). test.html
  415 green.
- 2026-11-23: field 6, round 1: every piece flagged, yet "Rounds done 0
  of 3" while Vincent kept driving on it (a round ends on its first
  piece, which you're on, so it never counts there); it went to 1 of 3
  as he moved onto round 2. The rule stays (Vincent). Lanes 13 and 14
  counted whole; the short pieces of 15 to 17 east of the notch wait for
  their long pieces, as chosen.
- 2026-11-23: the Precision Farming on-and-off live check removed
  (Vincent): PF has no GPS functions of its own, and the screen reads
  nothing from it.
- 2026-11-23: live-checked. Field 6, after the save and reload (spike
  still on, read only): the same 18 done segments came back; off the
  field "Drive onto a field you may work" with the course faded; "No lane
  here" only as the game's half-second blinks near the edge (four in an
  hour, from the files). The time left with the fix: "≈ 29 min" after
  lanes 1 and 3 (about 90 s a 240 m lane with its turn, 4.6 km left with
  rounds 2 and 3), "≈ 27 min" on lane 7 after lane 5; the iPad matched
  the replay of the page's own code each time. Island fields not tried.
  Verified names moved into GAME-API.md's Steering Assist section.
- 2026-11-23: revision 2 built (web only, mod 0.22.0): `data/gps.js`
  `roundLoopsOf`, `roundRuns`, `runOut`; `widgets/gpsScreen.js` paints the
  strips (lanes, cut by the rounds' strokes, then each round, worked part
  way by sector), the fill masked by the rounds; `ui/trailCanvas.js` takes
  a mask (the GPS screen's: the lanes to do, 1.5 m in, less the rounds),
  the Vehicle page's trail unmasked as before; the legend's swatches and
  "Worked, not counted". test.html 422 green (seven new); field 6's
  recorded session replayed in the pane at 1180×820 day and 1158×676
  night: corners square, lanes flush, no halo. PLAN.md's "Tidy GPS lanes"
  removed (this replaces it).
- 2026-11-23: revision 2 live-checked on the iPad by Vincent, day and
  night: the corners square, the lanes flush, no halo, smooth as before
  ("everything working fine").
- 2026-11-26: revisions 3 and 4 drafted from Vincent's notes: the lanes
  to do too pale against the field (1.1 : 1; one pale wash with 2 m lanes
  in the replay), and a close-up at a lane's end for narrow tools on big
  fields. Recommended: edge lines on the lanes to do; one view that zooms
  (Field, Auto, Close), not a picture in picture or two buttons alone, from
  the last 40 m rather than 75 %. Waiting for Vincent's answers and the
  canvas.
- 2026-11-26: revisions 3 and 4 drawn on the GPS canvas (version 32):
  the three looks side by side at the screen's own scale, the edge lines
  at both sizes, the close-up's boards (Auto at the end and in the turn,
  Auto on a lane, Close mid-lane, Field at the end) and the field drawing
  alone. The close-up now looks ahead (the rig a third in), since a
  centred view left the lane's end off screen.
- 2026-11-26: revisions 3 and 4 approved by Vincent on the canvas and
  built (web only): `data/gps.js` `offsetLine`, `createAutoZoom`,
  `closeView`, `laneNumbersOf`; `widgets/gpsScreen.js` the edge lines, the
  layers in one element, the switch, the tag, the chips, the slide and the
  zoom; `ui/trailCanvas.js` paints again when its view changes;
  `theme.css` `--gps-todo` #6F7C94 day and #7684A0 night, the legend's
  swatch, the switch and the chips. test.html 478 green, pytest 226; the
  replay in the pane with a 59-lane field at both sizes, day and night.
  Live check open.
- 2026-11-26: live check, revision 3 (Solek, mod 0.23.1, no mod change):
  on the iPad, day and night, a field with a narrow tool, the lanes to do
  countable by their edge lines. The close-up's four boxes still open.
- 2026-11-26: live check, revision 4 (Solek, mod 0.23.1): Close and Field
  stay picked, after a reload too. Auto's way back out is too quick:
  Vincent wants the whole field again 40 m into the next lane, in place of
  3 s settled. The lane's draw stutters in the close-up. In the code: the
  fill's end is set per vehicles message while the arrow and the picture
  glide 500 ms, and a new picture (every 10 to 20 m) jumps to the newest
  position. Both for a revision 5; the lane numbers and the turn not
  reported yet (field 122 with a 3 m tool: 73 lanes in 107 pieces, the
  lanes 104 to 309 m; 34 lanes split, each with a sliver of 1 to 31 m
  past a round, lane 55 in 8 and 167 m).
- 2026-11-26: revision 5 approved and built (web only): `data/gps.js`
  `createAutoZoom` out 40 m into another lane (`startM`, `fieldM`: a lane
  under 100 m stays close; no time in the rule), `fillOf` also gives the
  whole lane, its length and the metres along; `widgets/gpsScreen.js` the
  fill set once per lane and shown by its dash, a new close-up picture
  glides on from the old view (layers and arrow), the tag "Close-up ·
  Auto"; `theme.css` the dash's 500 ms slide in the close-up (none with
  reduced motion). The draft's "under 80 m" became 100 m: just over 80 m
  would have flapped (out at 40 m in, back at the last 40 m). test.html
  480 green, pytest 226. Live check open.
- 2026-11-26: Auto's rule again, no numbers of ours (Vincent): the
  close-up while an end of your lane is on the close-up's own picture
  (`createAutoZoom` takes `closeView`'s picture; `startM`, `fieldM`,
  `endM` and the zoomed-in lane gone; the rounds and the turn keep the
  view as it was). test.html 481 green, pytest 226.
- 2026-11-26: Vincent on the iPad: the fill's slide is "so jittery",
  the half-second step "more natural". The slide is out (`theme.css`'s
  transition on the dash); the fill still is the lane once with a dash,
  set per position. The picture and the arrow keep their glide and the
  no-jump at a new picture. test.html 481 green.
- 2026-11-26: working a headland round showed no green (Vincent): since
  revision 2 the fill was masked by the rounds' strokes, which hid a
  round piece's own fill whole. The mask is now on only while the piece
  you're on is a lane. test.html 482 green. Vincent saw a headland's
  green on the iPad the same day.
- 2026-11-26: live check, revision 5's Auto (Solek field 122, 3 m tool,
  iPad): in and out "feels right"; the lane numbers match the game's.
  Left open: the game left running, a sliver past a round, no jump at a
  new picture, the glide's smoothness.
- 2026-11-26: Auto on a headland round (Vincent: "Auto zoom doesn't
  work on headland segments?"; it never did, by revision 4's rule): the
  same picture rule with the piece's corners for ends; the heading
  checked against the stretch under the rig. test.html 482 green.
  Vincent on the iPad the same day: it works.
- 2026-11-26: live check on the iPad: the close-up smooth, no jump when
  it is painted again. Then the game left running (the view stayed put)
  and a lane's sliver past a round (the close-up stayed): every box
  ticked, revisions 4 and 5 live-checked (Solek field 122, 3 m tool, mod
  0.23.1, web only).
- 2026-11-26: the lane numbers sat off centre in their chips on the iPad
  (Vincent): `dominant-baseline` is ignored by iPad Safari. The baseline
  is now placed by hand, 0.34 em under the chip's middle (Archivo 700's
  digits are 0.70 em tall). test.html 481 green.
