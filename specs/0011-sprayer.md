# 0011: Sprayer

Status: draft
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
- **Working width** (new), on a sprayer with sections, under the buttons:
  - a strip with one segment per section, left to right as seen from the
    cab, the off ones grey (off: dashed outline, as an unavailable
    control, specs/0010);
  - the width in use against the full width: "30 / 33 m" (or "8 / 9
    sections" while the section widths aren't known: open question 1);
  - **Left in, Left out, Right in, Right out**: four buttons, one row,
    always together (like the Cruise row). Each changes one side by one
    section, as the game's keys do. A side at its limit fades its button. Whether these are the game's
    keys or a game call is open question 1.
  - In the compact form (three or more cards), the strip and the width
    stay and the four buttons go: the card's other buttons need the room.
- **The other keys** (the selected sprayer's, with the game's labels) stay
  as they are: "Dump", "Dump on ground" and "Unload" (open question 2).
  Precision Farming's keys ("Change application rate" and the rest) show
  the same way when they're live; nothing more for them here.
- **The tank**: "Herbicide · 96%", litres, and "empty in" once the level
  falls while spraying, as every tank (`data/rates.js`). The time it
  shows ignores the game's time scale until that spec (NEXT.md).
- **The vehicle's own card** (self-propelled): its other keys leave out
  the driving keys (Accelerate, Steer vehicle, Honk, and every other key
  from the vehicle's driving parts), so only the sprayer's own keys show.

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
    the game gives them (open question 1). Absent when the tool has no
    sections or a read fails.
  - `can` gains `width` for a tool with sections. The All row ignores it.
  - `canNow.width` false (and `whyNot.width`) while the game won't change
    the width now (folded, or not turned on, if the probe shows that).
  - `extraKeys` on the vehicle's own entry (depth 0) leaves out the keys
    of its driving parts.
- **Web** (`web/src/types.js`): `RigEntry.width` and the `width` capability
  in the `can` notes.
- **Web** (selectors, widgets): `BUTTON_CAPABILITIES` gains `width`.
  `toolButtons` makes the four width buttons. A new `widthStrip` in
  `vehicleTools.js` draws the segments and the "30 / 33 m" line.
  `cardStats`' Width shows the width in use when `width` is there.

Game API names used:

| Name | Where from | State |
|---|---|---|
| `getIsTurnedOn`, `getCanBeTurnedOn`, `getTurnedOnNotAllowedWarning`, `IMPLEMENT_EXTRA` (turn on) | TurnOnVehicle.lua | verified (DONE.md, the mowers): not yet on a sprayer |
| `getIsUnfolded`, `getIsFoldAllowed`, `IMPLEMENT_EXTRA2` (fold) | Foldable.lua | verified (DONE.md, the mowers): not yet on a sprayer |
| `spec_variableWorkWidth.hasSections`, `leftSide`, `leftSideMax`, `rightSide`, `rightSideMax`, `hasCenter` | VariableWorkWidth.lua | seen in spike 0.0.4 (Berthoud Vantage 4300: 4 + 4 + centre); unverified while it changes |
| `spec_variableWorkWidth.sections[i]` (each section's width) | VariableWorkWidth.lua | unverified |
| `VARIABLE_WORK_WIDTH_LEFT`, `_RIGHT`, `_TOGGLE` | inputBinding.xml | exist (spike 0.0.4's input actions); not registered while the sprayer was selected, folded state unknown: unverified |
| a call that sets a side's sections (e.g. `setSectionsActive`) | VariableWorkWidth.lua | unverified, only if the keys don't do |
| `TOGGLE_TIPSTATE` "Dump", `TOGGLE_TIPSTATE_GROUND` "Dump on ground" (Dischargeable), `UNLOAD` "Unload" (FillUnit) | spike 0.0.4's sprayer keys | the keys are live (spike 0.0.4); what they do on a sprayer is unverified |
| the driving parts' specs (`spec_drivable`, `spec_motorized`, `spec_honk`, ...) to leave out of the vehicle's keys | Drivable.lua and others | unverified on a self-propelled sprayer |

## Commands

- **`tool.turnOn`** and **`tool.fold`**: as today (specs/0008: the state
  asked for, by the tool's id; the game's key; ok once the reading
  changed). Nothing new. The live check confirms them on a sprayer.
- **`tool.width`** (new): value `-1` or `+1` and a side (`left` / `right`),
  with the tool's id: one section in or out. It compares
  `leftSide` / `rightSide` before and after, and answers ok once that side
  moved by one; "Nothing moved" after the wait. It presses
  `VARIABLE_WORK_WIDTH_LEFT` / `_RIGHT` if those keys go live while the
  sprayer works. Their direction is open question 1, and so is the
  fallback: a game call through `Api.lua`, noted in the spec and NEXT.md
  as a workaround (memory: game keys over workarounds).
- The dashboard shows the width button pending until the ack, then until
  `width` changes (at most 1.5 s), as every card button.

## Plan

- **Mod**: `state/Tools.lua` reads `width` (guarded) and adds the `width`
  capability. `VehicleState.extraKeys` leaves out the driving parts' keys
  on the vehicle itself. `Commands.lua` adds `tool.width`. `modDesc.xml`
  goes to 0.12.0.
- **Companion**: the action list (`protocol`) gains `tool.width`.
- **Web**: `types.js`, `selectors.js` (`BUTTON_CAPABILITIES`),
  `vehicleTools.js` (the width buttons and strip), `theme.css` (the strip,
  the four-button row).
- **Fixtures**: a probe dump of the sprayer with sections switched off and
  turned on (`mod/tests/fixtures/spike0003/`, or a new spike 0.0.9). The
  sprayer rig fixture is redone from it (`fixtures/rig_fixtures.py`).
- **Risks**: the width keys may only register while the boom is unfolded
  and turned on, or have no default binding. Precision Farming's extended
  sprayer may change what the sections do. The golden replay has no `cab`,
  so it shouldn't change.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [ ] `mod/tests/run.lua`: `width` from a mock `spec_variableWorkWidth`
  (4 + 4 + centre, one side at 2); absent with no sections or when a read
  throws; `can` has `width` only with `hasSections`.
- [ ] `mod/tests/run.lua`: `tool.width` left −1 presses the left key (or
  calls the setter) once and answers ok when `leftSide` drops by one;
  "Nothing moved" when it doesn't; refused with the game's words while
  folded.
- [ ] `mod/tests/run.lua`: the vehicle's own `extraKeys` leave out the
  driving keys (a mock self-propelled sprayer with `spec_drivable` and
  `spec_honk` keys and a `spec_sprayer` key: only the last one shows).
- [ ] `companion/tests`: `tool.width` passes through with its value and
  tool; an unknown side is refused.
- [ ] `web/test.html`: the sprayer rig fixture: Fold, Turn on, Detach, the
  four width buttons, the other keys; the strip has 9 segments with
  2 grey; "Left out" is faded at the left side's max.
- [ ] `web/test.html`: compact: strip and width, no width buttons.
- [ ] `web/test.html`: a self-propelled sprayer's own card: no Detach,
  no wear, no driving keys.
- [ ] Replay in the browser pane (`replay-solek` with the sprayer rig
  patched in): the card at 1180×820, day and night.

Live check (in game; Solek, CLAAS ARION 410 with the Berthoud Vantage
4300, then a self-propelled sprayer from the shop; `rig_check.py` and
`livewatch.py`):
- [ ] Probe first: unfolded and turned on, are the width keys live, and
  what do they do (one press: which side, in or out)?
- [ ] Unfold / Fold: ok once the boom moved; with the engine off refused
  at once with the game's words.
- [ ] Turn on / off: ok once it's on; folded, faded.
- [ ] Left in / out, Right in / out: one section each, the strip and the
  game's PARTIAL WIDTH HUD the same after each press; a side at its limit
  fades its button.
- [ ] Dump, Dump on ground, Unload: what each does in game, and whether
  the label says it (open question 2).
- [ ] The tank's "empty in" while spraying (at x1).
- [ ] Self-propelled: its card has no driving keys, Fold and Turn on work
  as on the trailed one.
- [ ] After every card button, the game's selected tool is the one it was.

## Decisions

Choices made while building that the live check should confirm or change.

## Out of scope / open questions

1. **The width's buttons and metres.** The width keys weren't registered
   while the folded or idle sprayer was selected (spike 0.0.4). The plan:
   probe the sprayer unfolded and turned on first. If the keys go live,
   the buttons press them. If not, either a guarded game call or the
   strip stays read-only with no buttons. Which do you want if the keys
   aren't there? And should the width line be metres ("30 / 33 m", needs
   each section's width, unverified) or sections ("8 / 9 sections")?
2. **Dump, Dump on ground, Unload.** Today they're the selected sprayer's
   other keys with the game's labels. Keep them like that, or make "Dump"
   a real button with an answer (as Tip, spec 0003 revision 3)? Most
   players never dump a sprayer, so I'd keep them as other keys.
3. **Precision Farming** (application rate, nitrogen reference,
   automatic rate): a DLC's keys, left as other keys. A rate readout on
   the card is a later spec if you want one.
4. **Time scale**: "empty in" follows the real clock until the time-scale
   spec (NEXT.md).
5. A spreader (fertiliser) has the same sections in FS25. It gets the
   width for free if its parts are the same; it's not in this live check.

## Log

- 2026-11-01: drafted from spec 0003's moved-out list, the spike 0.0.4
  sprayer dump (Berthoud Vantage 4300 on a CLAAS ARION 410) and NEXT.md
  ("The vehicle's other keys").
