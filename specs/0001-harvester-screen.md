# 0001: Harvester screen

Status: built (live check open)
Mod: 0.8.3 · Started: 2026-10-25 · Design: [THEMES.md, Harvester screen](../docs/THEMES.md#harvester-screen-mod-083-2026-10-25)

## Goal

In a combine, the dashboard shows what a combine driver watches: the
header, thresher, pipe and straw, the grain tank filling and when it will
be full, and the yield. It's the Vehicle tab's other page, not a fourth tab.
Combines first; forage, beet, potato and cotton harvesters come later, once
their keys are seen in game.

## Behaviour

- **Picking the screen:** with the setting Screen for what I drive (Settings
  › Screen, on by default), the Vehicle tab shows Harvester when you drive a
  combine (`vehicleKind` "harvester", the shop's Harvesters category) and
  Tractor otherwise. A tap on the Vehicle tab while it's shown opens a menu,
  Tractor / Harvester. A pick by hand stays until what you drive changes.
  With the setting off, the tab stays on Tractor unless you pick.
- **Layout:** the Implement screen's rig band; under it the work card
  (Header lift, Thresher, Pipe, Straw, Speed against the header's limit)
  and the grain tank; beside them the details (header and combine wear,
  working width, done this run, folding, Show on map).
- **Grain tank:** level, MAX and the weight limit's shading, the estimate
  and Call a trailer (as on the Implement card), "Filling at about … L per
  minute" from the last minute, then Yield (t/ha), Of potential (%), This
  run and Total (ha). Without Precision Farming: area only, no yield rows.
- **Column:** Lights and Drive, plus a Harvester group: Lower, Thresher,
  Fold, Pipe, Unload, Straw swath. Lower all and Hitch stay on the
  Implement tab (a third group doesn't fit 820 px).
- **Implement card:** with the header selected, the combine's own keys
  (Pipe, Unload, Straw swath) still act on the combine. A button that acts
  on another vehicle than the selected tool names it by the model alone
  ("CH7.70"), the same for every button.

## Data contract

All additions; Protocol v1 is unchanged.

- **Mod → backend:**
  - `cab.rig[]` entry: `straw: {swath: bool}`, only when the combine can
    both swath and chop. Absent otherwise (the cutter never has it).
  - `cab.keys.straw`: the game's straw key (TOGGLE_CHOPPER).
  - `vehicles` controlled vehicle: `hectares: {run, total}` in ha, 2
    decimals; `run` is `workedHectars - workedHectarsInitial`, never below
    0. Only on the controlled vehicle, not on its implements.
  - `vehicles` controlled vehicle, with Precision Farming only:
    `yield: {tPerHa, pct, potential}` (t/ha 1 decimal, % as the game has
    them). Absent without the mod.
- **Backend:** the action `implement.straw` is allowed
  (`backend/app/protocol.py`); topic models allow the new fields as extras.
- **Web:** `web/src/widgets/harvesterScreen.js` (`isHarvester`,
  `harvestRig`), the `harvester` detector in `web/src/themes/render.js`,
  the screen in `web/src/themes/newholland/theme.js`, the `straw` control
  in `web/src/widgets/controls.js`, the setting in `web/src/ui/settings.js`.

| Name | Where from | State |
|---|---|---|
| `spec_combine.swath.isAvailable`, `.chopper.isAvailable`, `isSwathActive` | Combine.lua | unverified |
| `spec_combine.workedHectars`, `workedHectarsInitial` | Combine.lua | unverified |
| `spec_<mod>.extendedCombine` `lastYieldWeight`, `lastYieldPercentage`, `lastYieldPotential` | Precision Farming, ExtendedCombine | unverified |
| `TOGGLE_CHOPPER` input | Combine.lua | unverified |
| `setIsSwathActive` (fallback) | Combine.lua | unverified |

## Commands

- `implement.straw` → client `TOGGLE_STRAW` → mod presses `TOGGLE_CHOPPER`,
  else falls back to `setIsSwathActive` (`mod/src/Commands.lua`,
  `toggleStraw`; "no straw choice" when the combine has none). The Straw
  swath button is lit while it lays a swath, and follows the game the same
  frame.
- Pipe, Unload, Fold, Lower and Thresher reuse the Implement screen's
  actions.

## Plan

As built (mod 0.8.3): `mod/src/VehicleState.lua` (straw, its key),
`mod/src/collectors/Vehicles.lua` (`hectaresOf`, `yieldOf`),
`mod/src/Commands.lua` (`TOGGLE_STRAW`), `client/commands.py`,
`backend/app/protocol.py`, and the web files above.

Risk: the Precision Farming spec key is found by its suffix
(`extendedcombine`) and cached on first find; a different mod name or a
renamed spec gives no yield, not an error.

## Acceptance

Automated:
- [x] `mod/tests/run.lua` "harvester screen: straw, its key, worked area
  and Precision Farming's yield": straw only when both choices exist, none
  on the cutter, `cab.keys.straw`, `hectares.run` / `total`, `yield`, and
  no `hectares` on implements.
- [x] `client/tests/test_commands.py`: `implement.straw` maps to
  `TOGGLE_STRAW`.
- [x] `web/test.html` "harvester screen: a combine, its work states, grain
  tank, yield and details" and "without Precision Farming, area only".
- [x] `web/test.html`: the combine's keys on the implement card with the
  header selected.
- [x] Replay in the browser pane with a made-up New Holland CH7.70 and
  SuperFlex header at 1180×820, day and night: the tab picks Harvester by
  itself, the menu switches back and forth, a pick by hand stays.

Live check (mod 0.8.3 installed; restart the game and the client first so
the tablet loads the new page; a combine with a header and a trailer, with
and without Precision Farming):
- [ ] Get in the combine: the Vehicle tab opens Harvester by itself.
- [ ] A second tap on the tab offers Tractor / Harvester, and both switch
  every time, not only the first (fixed after the first look).
- [ ] A pick by hand stays until you get in another vehicle.
- [ ] Settings › Screen for what I drive off: the tab stays on Tractor.
- [ ] Work card: Header lift, Thresher, Pipe, Straw and Speed match the
  game; Speed reads against the header's limit.
- [ ] Straw swath toggles the same way as the game's straw key, and the
  button is lit while it lays a swath. A combine without the choice shows
  no Straw swath.
- [ ] Grain tank: the rate ("Filling at about … L per minute") is close to
  the level's change over a minute; the estimate and Call a trailer appear
  as it nears full.
- [ ] This run and Total match the game's HUD; This run starts at 0 after
  getting in or loading.
- [ ] With Precision Farming: Yield and Of potential match its combine HUD.
  Without it: no yield rows, nothing broken.
- [ ] Implement card with the header selected: Pipe, Unload and Straw swath
  still act on the combine, each named "CH7.70" like Fold.

## Decisions

- One page on the Vehicle tab, picked by what you drive, rather than a
  fourth tab (decided 2026-10-25).
- Lower all and Hitch stay on the Implement tab only.
- Buttons acting on another vehicle than the selected tool name it by the
  model alone (`entryModel`).

## Out of scope / open questions

- Forage, beet, potato and cotton harvesters: later, once their keys are
  seen in game.
- Does `workedHectarsInitial` reset when you get in, or only on load? The
  live check's This run row answers it.

## Log

- 2026-10-25: built (mod 0.8.3); replay checks and all suites pass.
- 2026-10-25: first look: Fold named the full vehicle name, now the model
  only; the Vehicle tab's menu worked once only (a leftover "tap elsewhere
  closes" listener), fixed.
- 2026-10-25: moved to this spec from PLAN.md's Open checks.
