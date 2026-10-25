# 0001: Harvester screen

Status: approved (revision 2, not built yet; revision 1 is built, mod 0.8.3)
Mod: 0.8.4 · Started: 2026-10-25 · Design: [THEMES.md, Harvester screen](../docs/THEMES.md#harvester-screen-mod-083-2026-10-25),
canvas [FS25 Companion: Harvester screen](https://claude.ai/artifact/7arT5R4WwC9qJTTi3i99aL)

## Goal

In a combine, the dashboard answers what a driver needs at a glance during
a harvest: how full the grain tank is, when it will be full, how good the
crop is (yield) and how fast it comes in, and whether the speed suits the
header. The combine's and the header's states are also their buttons, so
one tap on what you read changes it. It's the Vehicle tab's other page, not
a fourth tab. Combines first; forage, beet, potato and cotton harvesters
come later, once their keys are seen in game.

## Behaviour

- **Picking the screen:** with the setting Screen for what I drive (Settings
  › Screen, on by default), the Vehicle tab shows Harvester when you drive a
  combine (`vehicleKind` "harvester", the shop's Harvesters category) and
  Tractor otherwise. A tap on the Vehicle tab while it's shown opens a menu,
  Tractor / Harvester. A pick by hand stays until what you drive changes.
  With the setting off, the tab stays on Tractor unless you pick.
- **Layout (1180×820):** the content area holds the band and, under it, two
  cards side by side: Combine (wider) and Header. The control column on the
  right starts at the top, as on every screen. No rig band, no Details
  column, no Show on map (the bottom nav opens the Map), no PTO chip.
- **Band:** the job and "CH7.70 with SuperFlex 25FT" on the left; four
  numbers on the right, always shown:
  - grain tank, %;
  - until full, "≈ 4 min", or "–, not filling" when the level isn't
    rising;
  - yield (see Yield);
  - speed, with "limit 10 km/h" from the header's working speed limit
    ("no limit" without one).
- **The job:** "Harvesting · Wheat" only while the thresher is on, the
  header is lowered and the combine moves (over 0.5 km/h). "Ready" with the
  thresher on otherwise, "Standing" with it off.
- **Combine card:**
  - Head: the model ("CH7.70"), "Combine", and a chip with the job
    (Harvesting lit, Ready, Standing).
  - Grain tank: crop, %, the meter, "6,700 / 9,300 L · 5.2 t", and
    "Filling at about 650 L/min" from the last minute while it rises.
  - Tiles, each the state and its button (one tap toggles): Thresher
    (On / Off, lit when on), Pipe (In / Out, lit when out), Straw (Swath /
    Chop, the current one; only when the combine has both).
  - Stats: Yield (with "92% of potential" under it with Precision Farming,
    "estimate, no Precision Farming" without), Throughput (t/h, last
    minute), This run (since you got in), Total (this combine), in ha or ac.
  - Combine wear, with its bar.
- **Header card:**
  - Head: the header's model and "Header".
  - Lift: Raised / Lowered with its bar.
  - Tiles: Header (Down / Up, lit while lowered; one tap lowers or raises)
    and Fold (Folded / Unfolded). Fold only when the header folds.
  - Rows: working width, speed limit, header wear with its bar.
  - Without a header attached, the card says "No header" and the band's
    limit reads "no limit".
- **Call a trailer:** at 80% of where the tank stops (its capacity, or the
  weight limit when that comes first) or 3 minutes before full, the meter
  turns orange, a "Call a trailer" chip shows under it, and the band's
  "until full" turns orange and pulses gently until the level drops. The
  game's own beacon behaviour is left alone.
- **No Unload:** with the pipe out over a trailer the combine unloads by
  itself, so the screen has no Unload button.
- **Yield:** with Precision Farming, its value (t/ha) and % of potential.
  Without it, our own estimate, marked "≈": the grain that went into the
  tank this run (litres × the crop's mass per litre) divided by the area
  done this run, counted only while the tank rises and the pipe is in (so
  unloading on the move doesn't pull it down). "–" until 0.05 ha is done.
- **Throughput:** the tank's rate over the last minute × mass per litre, in
  t/h. "0" while not filling.
- **Units:** follow the game's settings, as the rest of the app (`env.units`):
  miles → mph; acres → ac, and yield per acre (t/ac). Litres and tonnes
  stay as the game shows them.
- **Column:** Lights (Lights, High beam, Beacon, Hazard, Turn L, Turn R) and
  Drive (Cruise −, Cruise with its set speed, Cruise +; then Engine and AI
  worker). Cruise is never shown without − and +. No Harvester group: its
  actions are the cards' tiles. Lower all and Hitch stay on the Implement
  tab.
- **Day and Night:** both palettes, as the built screens. Night lights the
  tiles in yellow, as elsewhere.
- **Implement tab:** with the header selected, the combine's own keys
  (Pipe, Straw swath) still act on the combine. A button that acts on
  another vehicle than the selected tool names it by the model alone
  ("CH7.70"), the same for every button.

## Data contract

All additions; Protocol v1 is unchanged.

- **Mod → backend:**
  - New in 0.8.4: each `fills[]` entry gains `massPerLiter` (t per litre,
    as the game has it), absent when the fill type has none. Already read
    for the weight limit (`fillTypeInfo` in `mod/src/collectors/Vehicles.lua`),
    now sent.
  - As in 0.8.3: `cab.rig[]` entry `straw: {swath: bool}` only when the
    combine can both swath and chop; `cab.keys.straw` (TOGGLE_CHOPPER);
    the controlled vehicle's `hectares: {run, total}` (ha, 2 decimals,
    `run` never below 0) and, with Precision Farming, `yield: {tPerHa,
    pct, potential}`.
- **Backend:** nothing new (`implement.straw` is allowed since 0.8.3; topic
  models take extras).
- **Web:**
  - `web/src/widgets/harvesterScreen.js`: the band, the two cards, the job
    rule, yield estimate and throughput.
  - `web/src/data/rates.js`: the last minute's rate, as now.
  - `web/src/themes/newholland/theme.js`: the Harvester screen without the
    rig band, Details and the Harvester group; Drive as the Tractor
    screen's.
  - `web/src/widgets/controls.js`: tile variants of thresher, pipe, straw,
    lower (Header) and fold, reading the same state as today's buttons.

| Name | Where from | State |
|---|---|---|
| `fillType.massPerLiter` | FillTypeManager | in use (weight limit), unverified |
| `spec_combine.swath.isAvailable`, `.chopper.isAvailable`, `isSwathActive` | Combine.lua | unverified |
| `spec_combine.workedHectars`, `workedHectarsInitial` | Combine.lua | unverified |
| `spec_<mod>.extendedCombine` `lastYieldWeight`, `lastYieldPercentage`, `lastYieldPotential` | Precision Farming, ExtendedCombine | unverified |
| `TOGGLE_CHOPPER` input | Combine.lua | unverified |
| `setIsSwathActive` (fallback) | Combine.lua | unverified |

## Commands

No new ones. The tiles send the actions today's buttons send:

- Thresher → the Implement screen's work toggle, on the combine.
- Pipe → the pipe toggle, on the combine.
- Straw → `implement.straw` → client `TOGGLE_STRAW` → mod presses
  `TOGGLE_CHOPPER`, else `setIsSwathActive` ("no straw choice" when the
  combine has none).
- Header → lower / raise, on the header.
- Fold → fold, on the header.
- Cruise −, Cruise, Cruise +, Engine, AI worker → as on the Tractor screen.

Each tile follows the game the same frame its state changes.

## Plan

- **Mod (0.8.4):** `mod/src/collectors/Vehicles.lua` sends `massPerLiter`
  on fills; `mod/modDesc.xml` version.
- **Web:** `harvesterScreen.js` rebuilt around the band and two cards;
  `controls.js` tile variant; `theme.js` screen definition; `style.css` for
  the band, cards and tiles (reusing the Implement card's classes where
  they fit).
- **Removed:** the Harvester screen's rig band, work card, Details column,
  Harvester control group and Show on map.

Risks:
- The estimate needs `hectares.run` to move; at 2 decimals it moves every
  ~100 m² so a minute's window is fine, but the first seconds of a run read
  "–".
- Precision Farming's spec key is found by its suffix (`extendedcombine`);
  a different mod name gives the estimate instead, not an error.
- Throughput and until full lean on the last minute: after a stop they read
  low for up to a minute.

## Acceptance

Automated (written before the code):
- [ ] `mod/tests/run.lua`: fills carry `massPerLiter` when the fill type
  has one, and not otherwise.
- [x] `mod/tests/run.lua` "harvester screen: straw, its key, worked area
  and Precision Farming's yield" (0.8.3, unchanged).
- [x] `client/tests/test_commands.py`: `implement.straw` maps to
  `TOGGLE_STRAW` (0.8.3, unchanged).
- [ ] `web/test.html` "harvester screen: band": tank %, until full, "not
  filling", yield, speed against the limit; "no limit" without a header.
- [ ] `web/test.html` "harvester screen: the job": Harvesting · crop only
  with thresher on, header lowered and moving; Ready; Standing.
- [ ] `web/test.html` "harvester screen: tiles": Thresher, Pipe, Straw,
  Header and Fold show the state, light as specified and send their action;
  no Straw tile without both choices; no Fold tile on a header that doesn't
  fold; no Unload anywhere.
- [ ] `web/test.html` "harvester screen: yield estimate": litres × mass ÷
  area while rising with the pipe in; skips unloading; "–" under 0.05 ha;
  Precision Farming's value wins when present.
- [ ] `web/test.html` "harvester screen: throughput and units": t/h from
  the last minute; acres → ac and t/ac; miles → mph.
- [ ] `web/test.html` "harvester screen: Call a trailer": at 80% of the stop
  or 3 min left, the orange meter, the chip and the band's pulse.
- [ ] `web/test.html`: the column has no Harvester group, Drive shows
  Cruise − / Cruise / Cruise +, no Show on map.
- [x] `web/test.html`: the combine's keys on the implement card with the
  header selected (0.8.3, unchanged).
- [ ] Replay in the browser pane at 1180×820, day and night, against the
  canvas: harvesting, nearly full, standing without Precision Farming;
  nothing overflows, touch targets 48 px or more.

Live check (mod 0.8.4; restart the game and the client; a combine with a
header and a trailer, with and without Precision Farming):
- [ ] Get in the combine: the Vehicle tab opens Harvester by itself.
- [ ] A second tap on the tab offers Tractor / Harvester, and both switch
  every time.
- [ ] A pick by hand stays until you get in another vehicle.
- [ ] Settings › Screen for what I drive off: the tab stays on Tractor.
- [ ] The band reads Harvesting · crop only while really harvesting; Ready
  and Standing otherwise.
- [ ] Thresher, Pipe, Straw, Header and Fold tiles match the game and each
  tap does what the game's key does.
- [ ] Until full and throughput are close to the level's change over a
  minute; Call a trailer and the pulse appear as it nears full.
- [ ] Without Precision Farming: the ≈ yield is in the range the crop
  should give on that field. With it: Yield and % of potential match its
  HUD.
- [ ] This run and Total match the game's HUD; This run starts at 0 after
  getting in or loading.
- [ ] With acres in the game's settings: ac and t/ac; with miles: mph.

## Decisions

- One page on the Vehicle tab, picked by what you drive, rather than a
  fourth tab (2026-10-25).
- States are their buttons; no separate Harvester group (2026-10-25,
  revision 2, "one control per action").
- Header raise and lower are one toggle tile (2026-10-25).
- No Unload button: the pipe over a trailer unloads by itself (2026-10-25).
- Cruise always comes with Cruise − and + (2026-10-25).
- Yield without Precision Farming is our own estimate, marked ≈
  (2026-10-25).
- Units follow the game's settings; there's no bushel setting in the game,
  so yield is t/ha or t/ac.
- Lower all and Hitch stay on the Implement tab only.

## Out of scope / open questions

- Forage, beet, potato and cotton harvesters: later, once their keys are
  seen in game.
- Does `workedHectarsInitial` reset when you get in, or only on load? The
  live check's This run row answers it.
- Bushels: only if the game gets a setting for it, or we add our own.

## Log

- 2026-10-25: built (mod 0.8.3); replay checks and all suites pass.
- 2026-10-25: first look: Fold named the full vehicle name, now the model
  only; the Vehicle tab's menu worked once only (a leftover "tap elsewhere
  closes" listener), fixed.
- 2026-10-25: moved to this spec from PLAN.md's Open checks.
- 2026-10-25: review with Vincent: the rig band and work card said the
  same things twice, the Harvester buttons repeated the status tiles, and
  the tank and yield weren't up front. Redesigned on the canvas (band, Combine
  and Header cards, tiles as buttons); this revision 2 replaces revision 1's
  Behaviour, waiting for approval.
- 2026-10-25: revision 2 approved by Vincent; build not started.
