# 0011: Sprayer

Status: built
Mod: 0.12.0 · Started: 2026-11-01 · Design: [THEMES.md](../docs/THEMES.md#implement-screen-design-2026-10-24) (the card); spec [0003](0003-implement-screen.md) (moved out at its close)

## Goal

A sprayer is one of the most common tools, and spec 0003 closed without
checking it. With this spec, the sprayer's card on the Vehicle page does
what the cab's keys do, with answers you can trust: Fold and Turn on on a
trailed and a self-propelled sprayer, the Dump keys, and the working
width (the boom's sections), which the player otherwise reads off the
game's "PARTIAL WIDTH" HUD block. The self-propelled sprayer is also the
first vehicle that is its own card, so its card must not list every
driving key (NEXT.md, "The vehicle's other keys").

## Behaviour

On the Vehicle page, a sprayer gets a card like any working tool (spec
0003). A trailed or mounted one has its own card. A self-propelled one is
the vehicle's own card, with no Detach and no wear (the band has both).

- **Buttons**, in the mod's order (`can`):
  - **Fold / Unfold**, as today. The answer is ok only once the boom
    moved (spec 0003 revision 2). With the engine off it's refused at
    once with the game's words (`VehicleState.powered`).
  - **Turn on / Turn off**: the sprayer sprays while it's on and moving.
    It's faded while folded, and while the game refuses it
    (`getCanBeTurnedOn`); a faded button shows no reason.
    The answer is ok only once `getIsTurnedOn` changed.
  - **Lower / Raise**, only on a sprayer that lowers (a mounted one).
    The Berthoud doesn't (`canLower` false).
  - **Detach**, on a trailed or mounted one.
- **Working width** (new), on a sprayer with sections, one row under the
  buttons: **Left out, Left in**, the strip over its line, **Right in,
  Right out**:
  - a strip with one segment per section, left to right as seen from the
    cab, a side's outer sections off first, the middle one always on, the
    off ones grey with a dashed outline (as an unavailable control,
    specs/0010);
  - under it, the sections and the width in use, both: "8 / 9 sections ·
    30 / 33 m" (Vincent, 2026-11-01). The metres need each section's width
    (unverified); until the mod has them, the line is "8 / 9 sections"
    alone, never an estimate;
  - the four buttons, always together in that row (like the Cruise row),
    each side's pair at its end of the strip. In takes one section off
    that side, out puts one back; each presses the game's width key for
    that side, as the keyboard does. A side at its limit fades its button
    (Left out with the left side all on, Left in with it all off). Only
    where those keys are live: the mod offers `width` once it has seen
    them live on that tool (the game registers a tool's keys only while
    it's selected, so the buttons don't come and go with the selection).
    Never live, the strip and the line are read-only, with no buttons
    (Vincent, 2026-11-01).
  - Folded, the four are faded; the mod refuses with the game's words.
  - In the compact form (three or more cards), the strip and the line
    stay and the four buttons go: the card's other buttons need the room.
  - With two cards at 1180×820 (a front tank and the sprayer), the card's
    button rows are 64 px instead of 80 so the width row and the tank fit.
- **The other keys** (the selected sprayer's, with the game's labels) stay
  as they are: "Dump", "Dump on ground" and "Unload" (Vincent,
  2026-11-01). The game's own "Activate doubled application rate" and
  Precision Farming's keys ("Change application rate" and the rest) show
  the same way when they're live.
- **With or without Precision Farming**, the card is the same: nothing
  in it reads Precision Farming (see "Precision Farming" below).
- **The Width stat**: the width in use where the section widths are
  known ("25.0 m"), else the tool's working width as today.
- **The tank**: "Herbicide · 96%", litres, and "empty in" once the level
  falls while spraying, as every tank (`data/rates.js`). The time it
  shows ignores the game's time scale until that spec (NEXT.md).
- **The vehicle's own card** (self-propelled): its other keys leave out
  the driving keys (Accelerate, Steer vehicle, Honk, and every other key
  from the vehicle's driving parts), so only the sprayer's own keys show.
  The driving parts, by name: drivable, motorized, enterable, honk,
  lights, wipers, crabSteering, articulatedAxis, reverseDriving,
  dashboard, aiDrivable, aiFieldWorker, aiJobVehicle, aiAutomaticSteering,
  aiVehicle, extendedMotorized (Precision Farming's) and
  enterableCameraMirrors (a mod's prefix left off).

Day and Night as every card; at 1180×820 a trailed sprayer's card is
full width (one card), and the width strip fits a two-card rig (a front
tank and the sprayer) without scrolling.

## Data contract

- **Mod → companion** (`cab` topic, each rig entry; Protocol v1, new
  fields only):
  - `width`, on a tool with sections only:
    `{left: number, leftMax: number, right: number, rightMax: number, center: boolean, sections?: number[]}`.
    `left` and `right` are how many sections are on each side (0 to its
    max). `center` says whether there's a middle section that's always on.
    `sections` are each section's width in metres, left to right, when
    the game gives them (absent until verified: the line shows sections
    alone then). Absent when the tool has no sections or a read fails.
  - `can` gains `width` (after `bales`, before `detach`) for a tool with
    sections whose width keys the mod has seen live (`VARIABLE_WORK_WIDTH_LEFT`
    or `_RIGHT` registered on it, remembered per tool). The All row ignores it.
  - `canNow.width` false while folded, with `whyNot.width` Foldable's
    `unfoldWarning` (unverified). Not turned on: added if the probe shows
    the game refuses then.
  - The width keys aren't other keys where the tool has `width`;
    `VARIABLE_WORK_WIDTH_TOGGLE` stays one, with the game's label.
  - `extraKeys` on the vehicle's own entry (depth 0) leaves out the keys
    of its driving parts.
- **Viewer → companion → mod**: a command gains `side` ("left" or
  "right"), only on `tool.width`: the viewer's message, the companion's
  shape check (`command_refusal`: anything else is "value not allowed")
  and the command file (`side="left"`); the mod refuses a side on any
  other action, and `tool.width` without one.
- **Web** (`web/src/types.js`): `RigEntry.width` (`RigWidth`) and the
  `width` capability in the `can` notes.
- **Web** (selectors, widgets): `CAPABILITIES` and `BUTTON_CAPABILITIES`
  gain `width`. `toolButtons` makes the four width buttons (keys
  `width:leftOut` and so on, sent with their side). In `vehicleTools.js`,
  `widthSegments`, `widthMetres` and `widthLine` give the strip and the
  "8 / 9 sections · 30 / 33 m" line; the card's width row draws them.
  `cardStats`' Width shows the width in use when the section widths are
  there. Four icons: `widthLeftIn`, `widthLeftOut`, `widthRightIn`,
  `widthRightOut`.

Game API names used:

| Name | Where from | State |
|---|---|---|
| `getIsTurnedOn`, `getCanBeTurnedOn`, `getTurnedOnNotAllowedWarning`, `IMPLEMENT_EXTRA` (turn on) | TurnOnVehicle.lua | verified (DONE.md, the mowers): not yet on a sprayer |
| `getIsUnfolded`, `getIsFoldAllowed`, `IMPLEMENT_EXTRA2` (fold) | Foldable.lua | verified (DONE.md, the mowers): not yet on a sprayer |
| `spec_variableWorkWidth.hasSections`, `leftSide`, `leftSideMax`, `rightSide`, `rightSideMax`, `hasCenter` | VariableWorkWidth.lua | seen in spike 0.0.4 (Berthoud Vantage 4300: 4 + 4 + centre); unverified while it changes |
| `spec_variableWorkWidth.sections[i].width` (each section's width, left to right) | VariableWorkWidth.lua | unverified |
| `spec_foldable.unfoldWarning` (the words while folded) | Foldable.lua | unverified |
| `VARIABLE_WORK_WIDTH_LEFT`, `_RIGHT`, `_TOGGLE` | inputBinding.xml | exist (spike 0.0.4's input actions); not registered while the sprayer was selected, folded state unknown: unverified |
| `TOGGLE_TIPSTATE` "Dump", `TOGGLE_TIPSTATE_GROUND` "Dump on ground" (Dischargeable), `UNLOAD` "Unload" (FillUnit) | spike 0.0.4's sprayer keys | the keys are live (spike 0.0.4); what they do on a sprayer is unverified |
| the driving parts' specs (`spec_drivable`, `spec_motorized`, `spec_honk`, ...) to leave out of the vehicle's keys | Drivable.lua and others | unverified on a self-propelled sprayer |

## Commands

- **`tool.turnOn`** and **`tool.fold`**: as today (specs/0008: the state
  asked for, by the tool's id; the game's key; ok once the reading
  changed). Nothing new. The live check confirms them on a sprayer.
- **`tool.width`** (new): value `-1` or `+1` and a side (`left` / `right`),
  with the tool's id: one section in or out. Refused at once without the
  `width` capability, while folded (the game's words), or past the side's
  limit ("at its limit"). It presses `VARIABLE_WORK_WIDTH_LEFT` /
  `_RIGHT` on the tool, selecting it first if its key isn't live, as every
  tool command (specs/0009), with the value as the key's input (as an
  axis would: which way a press goes is the probe's), then compares
  `leftSide` / `rightSide` with what it asked for and answers ok once that
  side moved by one; "Nothing moved" after the check's wait. No other way
  in: if the keys aren't live, there's no `width` and no width buttons
  (Vincent, 2026-11-01).
- The dashboard shows the width button pending until the ack, then until
  `width` changes (at most 1.5 s), as every card button.

## Plan

- **Mod**: `state/Tools.lua` reads `width` (guarded) and adds the `width`
  capability only where the width keys are live (else the strip is
  read-only). `VehicleState.extraKeys` leaves out the driving parts' keys
  on the vehicle itself. `Commands.lua` adds `tool.width`. `modDesc.xml`
  goes to 0.12.0.
- **Companion**: the action list (`protocol`) gains `tool.width`.
- **Web**: `types.js`, `selectors.js` (`BUTTON_CAPABILITIES`),
  `vehicleTools.js` (the width buttons and strip), `theme.css` (the strip,
  the four-button row).
- **Fixtures**: a probe dump of the sprayer with sections switched off and
  turned on (`mod/tests/fixtures/spike0003/`, or a new spike 0.0.9). The
  sprayer rig fixture is redone from it (`fixtures/rig_fixtures.py`).
  Built before the probe: `sprayer` stays spike 0.0.4's (sections, no
  width keys: read-only), and `rig_fixtures.py` makes two from it,
  `sprayer-width` (the width keys live, the right side at 2 of 4) and
  `sprayer-self` (a self-propelled sprayer with driving keys), until the
  probe's dumps replace them.
- **Risks**: the width keys may only register while the boom is unfolded
  and turned on, or have no default binding. Precision Farming's extended
  sprayer may change what the sections do. The golden replay has no `cab`,
  so it shouldn't change.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [x] `mod/tests/run.lua`: `width` from a mock `spec_variableWorkWidth`
  (4 + 4 + centre, one side at 2); absent with no sections or when a read
  throws; `can` has `width` only with `hasSections`.
- [x] `web/test.html`: a sprayer with `width` but no `width` capability
  (keys not live): the strip and the width line, no width buttons.
- [x] `mod/tests/run.lua`: `tool.width` left −1 presses the left key once and answers ok when `leftSide` drops by one;
  "Nothing moved" when it doesn't; refused with the game's words while
  folded.
- [x] `mod/tests/run.lua`: the vehicle's own `extraKeys` leave out the
  driving keys (a mock self-propelled sprayer with `spec_drivable` and
  `spec_honk` keys and a `spec_sprayer` key: only the last one shows).
- [x] `companion/tests`: `tool.width` passes through with its value and
  tool; an unknown side is refused.
- [x] `web/test.html`: the sprayer rig fixture (`sprayer-width`): Fold, Turn on, Detach, the
  four width buttons, the other keys; the strip has 9 segments with
  2 grey; "Left out" is faded at the left side's max.
- [x] `web/test.html`: compact: strip and width, no width buttons.
- [x] `web/test.html`: a self-propelled sprayer's own card: no Detach,
  no wear, no driving keys.
- [x] Replay in the browser pane (`replay-solek` with the sprayer rig
  patched in): the card at 1180×820, day and night.

Live check (in game; Solek, CLAAS ARION 410 with the Berthoud Vantage
4300, then a self-propelled sprayer from the shop; `rig_check.py` and
`livewatch.py`):
- [ ] Probe first: unfolded and turned on, are the width keys live, and
  what do they do (one press: which side, in or out)? Not live: the
  strip follows the game's keys pressed in game, read-only.
- [ ] Unfold / Fold: ok once the boom moved; with the engine off refused
  at once with the game's words.
- [ ] Turn on / off: ok once it's on; folded, faded.
- [ ] If the keys are live: Left in / out, Right in / out: one section each, the strip and the
  game's PARTIAL WIDTH HUD the same after each press; a side at its limit
  fades its button.
- [ ] Dump, Dump on ground, Unload: what each does in game, and whether
  the label says it (open question 2).
- [ ] The tank's "empty in" while spraying (at x1).
- [ ] Self-propelled: its card has no driving keys, Fold and Turn on work
  as on the trailed one.
- [ ] After every card button, the game's selected tool is the one it was.
- [ ] The same card with Precision Farming off (a savegame without it,
  if there is one): Fold, Turn on, the strip and the tank as above, no
  Precision Farming keys.

## Decisions

Choices made while building that the live check should confirm or change.

- The width buttons press the game's own width keys or don't exist: if
  those keys aren't live, the strip is read-only, with no game-call
  workaround (Vincent, 2026-11-01).
- The width line shows sections and metres; metres only from the game's
  section widths, never estimated (Vincent, 2026-11-01).
- Dump, Dump on ground and Unload stay the game's own keys with its
  labels (Vincent, 2026-11-01).
- This spec reads nothing from Precision Farming; it works the same with
  it on or off. Precision Farming gets its own spec (below).
- The width row is one row: Left out, Left in, the strip over its line,
  Right in, Right out, each side's pair at its end of the strip. Built
  as a strip over a row of four, it didn't fit the two-card rig at
  1180×820 (the tank was cut off); one row fits, with the card's button
  rows at 64 px in a two-card rig.
- `width` stays once its keys were seen live on a tool, so its buttons
  don't come and go with the selection; pressed while the tool isn't
  selected, the command selects it and waits for the key, as every tool
  command does.
- `tool.width` gives the key its value (−1, +1) as an axis would; if the
  probe finds each key goes one way only, or cycles, this changes.

## Out of scope / open questions

1. ~~The width line~~, 2. ~~Dump keys~~: decided, see Decisions.
3. **Precision Farming** changes how a sprayer is used. Without it, the
   rate is fixed (doubled at most) and you spray the whole field. With
   it, the rate follows the soil map (automatic or set by hand, l/ha),
   fertiliser follows a nitrogen target, and herbicide can spot-spray
   only the weeds (`weedSpotSpray`), so the tank empties unevenly. This
   spec stays the same both ways: Fold, Turn on, sections and the tank
   are the base game's, and "empty in" is measured from the tank, so it
   follows a variable rate by itself (a little jumpier). Precision
   Farming's keys are other keys, with its labels. What a player would
   want on top (the rate now and its mode, auto or manual, the nitrogen
   target, spot spray on or off) is a spec of its own after a probe of
   Precision Farming's sprayer parts (`FS25_precisionFarming.extendedSprayer`,
   `weedSpotSpray`; all unverified). The mod would send it only when
   those parts are on the tool, so a game without Precision Farming
   sees nothing new.
4. **Time scale**: "empty in" follows the real clock until the time-scale
   spec (NEXT.md).
5. A spreader (fertiliser) has the same sections in FS25. It gets the
   width for free if its parts are the same; it's not in this live check.

## Log

- 2026-11-01: drafted from spec 0003's moved-out list, the spike 0.0.4
  sprayer dump (Berthoud Vantage 4300 on a CLAAS ARION 410) and NEXT.md
  ("The vehicle's other keys").
- 2026-11-01: Vincent: no width keys live, no width buttons; the strip is
  read-only then.
- 2026-11-01: Vincent: the width line shows sections and metres; the Dump
  keys stay the game's. Precision Farming: this spec works the same with
  it on or off; its rate and spot spray get their own spec.
- 2026-11-01: approved by Vincent; not built yet.
- 2026-11-01: built (mod 0.12.0), before the probe: the width from
  VariableWorkWidth, `can.width` once its keys were seen live,
  `tool.width` with a side (viewer, companion, command file, mod), the
  card's width row and Width stat, no driving keys on the vehicle's own
  card. The width row became one row with the strip between the pairs
  (Decisions). Fixtures `sprayer-width` and `sprayer-self` are made from
  spike 0.0.4's sprayer until the probe. pytest and `web/test.html` green;
  the replay checked at 1180×820, one and two cards and compact, day and
  night. Four new icons: the design system artifact needs a refresh.
