# 0018: Contracts (read-only)

Status: approved
Mod: 0.19.0 · Started: 2026-11-14 · Design: the chrome in [THEMES.md](../docs/THEMES.md#layout); the tiles after the HEADLAND canvas's Haul and Yard pages (private, on claude.ai); the canvas [FS25 Companion: Contracts](https://claude.ai/artifact/T8NwTQTEp6jvCdRq82xHzP) (private, on claude.ai; at 1158 × 676 and 1180 × 820, day and night; version 9 reviewed by Vincent 2026-11-14: the detail in two columns at full height, the switches over the list)

## Goal

Pick the contract that pays best for your time, and follow the one you're
doing, without opening the game's contracts screen. Contracts are the first
income in every start mode and players keep taking them while their own
crops grow, so the choice comes up all the time. The game shows the reward
and little else. The dashboard adds what the decision needs: what you keep
after the lease, how long the work takes, money per hour, what the extra
grain from a harvest contract is worth, and which machines the lease brings.
Read-only: accepting, cancelling and finishing a contract come later
(Out of scope).

What is possible, and the names used, come from the game's own scripts (the
SDK's `gameSource.zip`) and from
[FS25_BetterContracts](https://github.com/Mmtrx/FS25_BetterContracts) by
Mmtrx (GPL 3.0, like this project), which reads and works out the same
things. We take facts and names from it, no code. The dashboard never needs
it installed, and reads raw values, so they're the same with it on or off.

## Behaviour

### The contracts list

- **Where:** a Contracts tab beside Map and Vehicle. The status bar and
  tab bar stay; **the control column doesn't**: choosing a contract isn't
  done while driving, so the page takes the whole width (Vincent,
  2026-11-14). The first page without the column: THEMES.md's Layout gets
  that exception. The main area holds tiles like the HEADLAND canvas's
  Haul and Yard pages. A later Office page gets a small Contracts tile
  (yours, and the best offer) that opens this tab; this tab stays the one
  home of the list.
- **Any tablet:** no part of it is for one screen. The iPad mini's page
  (1158 × 676) is the smallest it's built for: there the page is about
  1134 × 532: on the left the switches (With lease / Own machines, and
  the sort) over the list, as wide as it; beside them the detail tile, the
  page's full height (about 560 wide, two columns inside: Money and Deadline on the left; Progress
  or Work, then the vehicles, on the right). The detail fits the mini
  without scrolling: with own machines the lease list folds to one line
  ("Lease instead: 4 vehicles for £2,900"). Under about 760 wide (compact, portrait) the detail opens
  over the list, with a Back button. Bigger screens get more rows, not
  other content.
- **Two groups:** **Yours** (running, preparing, finished but not yet
  dismissed in the game) first, then **On offer**. Other farms' contracts
  (multiplayer) are not shown.
- **One row per contract:** what it is and where ("Harvest · Field 12 ·
  wheat"), who it's for, then four numbers in one line: **Net** (reward
  minus the lease, if you lease), **Time** (estimated work time), **Per
  hour** (net ÷ time) and **Left** (time before the deadline). A harvest
  or baling contract adds **+ extra** (what the crop you keep is worth, see
  below). A number the game doesn't give is left out, not shown as 0.
- **Sort:** by Per hour (the default), Net, Left or Distance (from you, or
  from your vehicle). The choice is remembered per screen.
- **Lease or own machines:** a switch at the top, "With lease / Own
  machines". With lease, Net subtracts the lease and Time uses the leased
  machines; with own machines, Net is the full reward and Time uses your
  own tool for the job (see Work time). The row always says which.
- **Full:** when you hold as many contracts as the game allows (its per-farm
  limit), the On offer header says "3 of 3 taken" (the game's number).

### A contract's detail

A tap on a row opens its detail in a tile beside the list (over it when
narrow):

- **Money:** Reward, Lease (the game's vehicle cost, if leased), **Net**,
  and for a harvest or baling contract **Extra**: the litres you keep and
  their value at the contract's sell point, with the price used ("1 240 l
  wheat · 268 € at Grain mill, 216 €/1000 l"). **Total** = Net + Extra.
- **Work:** the field (number, area), the estimated work time and how it's
  worked out ("12.4 ha · your Lemken Karat 9, 6 m at 12 km/h → about
  1 h 25"), and Per hour. With own machines, a "Tool" picker lists your
  tools that fit (see Work time) and the time follows the one picked.

### Work time

Contracts don't say how long they take, so the dashboard estimates it,
always labelled an estimate:
- **The tool:**
  - **with lease:** the leased tool with a working width (the widest, if
    more than one);
  - **with own machines:** your farm's tools whose shop category fits the
    contract (ploughs for a plough contract, seeders and planters for
    sowing, sprayers for herbicide, spreaders for fertiliser and lime,
    harvesters with their header for a harvest, mowers for mowing ...).
    The one you have attached now comes first if it fits, then the
    widest. You can pick another in the detail; the choice is remembered
    per contract type. No fitting tool: Time is blank, "No tool of yours
    fits: with lease only".
- **The rate:** width × working speed ÷ 10 ha/h, the speed being the
  tool's own limit (shop data), or the tractor's cruise top when lower.
- **The overhead per job:** headland turns, overlaps, refills and unloading
  make real work slower than that rate, and more for some jobs than
  others. The time is multiplied by a factor per contract type, starting
  from BetterContracts' table (spreading and spraying 1.15; sowing,
  cultivating and weeding 1.2; ploughing 1.25; mowing and harvesting 1.3;
  vegetables 1.35 to 1.4). The live check compares each with a real run.
- **Your own runs** (open question 3): the dashboard could time your
  running contracts (the game's completion against the clock, with the
  tool that did the work) and use your real rate for that tool next time,
  labelled "from your last run".
- **Deadline:** time left in game time, and what that is in real time at the
  current game speed ("2 days 4 h · about 52 min at ×60"). If the work time
  is longer than the real time left at this speed, the line says so in
  `warn`.
- **Lease vehicles:** the list the game gives you if you lease: for each,
  brand and name ("New Holland T7.315"), its shop category, and the working
  width or speed when it has one. The total lease cost under it. A contract
  without lease vehicles says "No lease".
- **On the map:** a button that switches to the Map tab and centres on the
  contract's place.

### The contracts you're doing

You can hold several contracts at once (up to the game's per-farm limit),
and they run at the same time. Each running one has its own tile in Yours,
nearest deadline first, with:

- **Progress:** the game's own completion, in % (the HUD's bar), and what
  it means: for field work, "field 83 % worked of the 95 % that counts as
  done" (the game divides the worked share by its success factor and
  finishes at 99.5 % of that); for a harvest, "delivered 41 200 l of
  44 000 l needed, 2 800 l to go". The success factors come from the game,
  not written in the dashboard.
- **Time left** as in the detail.
- **Where to deliver** (harvest, baling, transport): the sell point's name,
  and a pin on the map.
- **Finished:** a finished contract shows its outcome (success, failed,
  timed out) and the game's final sums (reward, lease, reimbursement,
  penalty) until you dismiss it in the game.

### On the other pages, without taking room

No drawer and no new strip: the Vehicle page has no room for one on the
mini, and a drawer like the canvas's Fleet would cover the tool cards.
Instead (agreed to try, 2026-11-14):
- **The field panel** (Map and Vehicle pages), on a field with one of your
  running contracts: one more row for that contract, "Contract · Plough ·
  87 % · 2 days 4 h left". A tap opens the Contracts tab on it. The game
  allows one contract per farmland as far as the SDK shows
  (`getIsMissionRunningOnFarmland`); if a field ever has two, each gets
  its row.
- **The Contracts tab's label** counts your running contracts
  ("Contracts · 2"), and its count turns `warn` when one of them won't
  make its deadline at the current speed. One running: "Contracts · 1";
  none: "Contracts".
- **Map pins** show every contract you hold, each with its %.

### On the map

- A contract layer with its own legend entry: a pin at each contract's place
  (the field's number position for field work), filled for yours, outlined
  for offers. A tap opens a popup with the row's line and a "Details"
  button that opens the Contracts tab on it.
- The sell point of your harvest contract gets a small "deliver here" mark.

### Look

The tokens and components already in [THEMES.md](../docs/THEMES.md): the
list in cards like the field panel's, numbers in the stat line style of spec
0013 revision 8, `warn` for a deadline you won't make. Day and night,
checked from the iPad mini's 1158 × 676 up through the sizes in
[THEMES.md](../docs/THEMES.md#responsive). How it looks is drawn on the
canvas first.

## Data contract

- **Mod → companion:** a new `contracts` topic, about every 2 s (a running
  contract's completion changes every 2.5 s in the game), from a new
  collector `mod/src/collectors/Contracts.lua`. Protocol v1, no `v` change.

  ```
  contracts = {
    limit       = 3,            -- contracts one farm may hold (absent: unknown)
    factors     = { field = 0.95, harvest = 0.93, bale = 0.9 },  -- read at run time
    items = [{
      id          = "…",        -- the mission's unique id
      type        = "harvestMission",   -- the game's type name
      title       = "Harvest",  -- the game's title, in the game's language
      npc         = "…",        -- who it's for (absent: none)
      location    = "Field 12", -- the game's location text
      status      = "offer" | "preparing" | "running" | "finished",
      mine        = true,       -- your farm's (absent on offers)
      finishState = "success" | "failed" | "timedOut" | "canceled",  -- when finished
      x, z        = …,          -- world metres, where the game puts its marker
      fieldId     = 12,         -- the `fields` topic's id (absent: no field)
      areaHa      = 12.4,
      fruitTypeIndex = 3,       -- the field's crop (absent: none)
      fillType    = "WHEAT",    -- what is delivered (absent: nothing)
      reward      = 18450,      -- €, the game's reward with its difficulty
      vehicleCosts = 2100,      -- €, the lease (absent: no lease vehicles)
      reimbursement = 0,        -- € (finished)
      stealingCost  = 0,        -- € (finished)
      minutesLeft = 3120,       -- game minutes to the deadline (absent: none)
      completion  = 0.87,       -- the game's own 0..1 (running, finished)
      expectedLiters  = 44000,  -- harvest, baling, delivery
      depositedLiters = 41200,  -- running
      sellPoint   = { name = "Grain mill", x, z, price = 0.216 },  -- €/l, effective
      vehicles = [{ name, brand, category, workingWidth, speedLimit }],
    }],
    tools = [{                  -- your farm's own vehicles, for Work time
      id, category,             -- the `vehicles` topic's id; shop category name
      workingWidth, speedLimit, -- m, km/h, from the shop data
    }]
  }
  ```

  Every field is optional; a missing one hides its row on the dashboard.
  The mod only reads: no game function is replaced, nothing is written into
  a mission, and calls that change state (`getCompletion()` drives the
  field's completion modifier, `tryToResolveSellingStation()` sets the sell
  point) are never made. A running contract's completion is the value the
  game keeps (`mission.completion`).

- **Web** (`web/src/types.js`): a `Contracts` typedef with the fields above.
- **Web** (`web/src/data/contracts.js`, new, pure functions): `net`,
  `extraLiters` (`expectedLiters × (1 − factor)`), `extraValue`
  (× `sellPoint.price`), `fittingTools` (contract type → shop categories,
  attached first, then widest), `workHours` (area ÷ (width × speed ÷ 10)
  ha/h × the type's overhead factor; the table of categories and factors
  lives in this one file), `perHour`, `realMinutesLeft` (`minutesLeft ÷
  env.timeScale`), `deliveredToGo`, and the sort orders. Money and area go
  through `data/units.js`.
- **Web** (widgets): `web/src/widgets/contractsScreen.js` (the tab),
  `web/src/map/layers/contractsLayer.js` (pins, popup, legend), and the tab
  registered in `web/src/themes/newholland`.

Game API names used. None of the contract names are in
[GAME-API.md](../docs/GAME-API.md) yet: all go behind the guards in
`mod/src/Api.lua`. "SDK" is FS25's own `dataS/scripts/missions/*.lua` in
`gameSource.zip`; that copy holds only the base classes, field work, plough,
sowing and stone picking, and its constants are blanked out. "BC" is only
in BetterContracts; where the two differ the SDK wins (BC's `debug.lua` still
uses FS22's `getMissionsList` and `AbstractMission.STATUS_RUNNING`).

| Name | Where from | State |
|---|---|---|
| `g_missionManager:getMissions()` (or `.missions`) | SDK MissionManager.lua | unverified |
| `MissionManager.MAX_MISSIONS_PER_FARM` | SDK MissionManager.lua (value blanked) | unverified |
| `mission.status`, `MissionStatus.CREATED/PREPARING/RUNNING/FINISHED` | SDK AbstractMission.lua | unverified |
| `mission.finishState`, `MissionFinishState.SUCCESS/FAILED/TIMED_OUT/CANCELED` | SDK AbstractMission.lua, MissionManager.lua | unverified |
| `mission.farmId`, `g_localPlayer.farmId` | SDK AbstractMission.lua | unverified |
| `mission:getUniqueId()`, `mission.type.name` | SDK AbstractMission.lua | unverified |
| `mission:getTitle()`, `getNPC().title`, `getLocation()` | SDK AbstractMission.lua, AbstractFieldMission.lua; `getNPC().title` from BC gui.lua | unverified |
| `mission:getWorldPosition()` (field: `field:getIndicatorPosition()`) | SDK AbstractMission.lua, AbstractFieldMission.lua | unverified |
| `mission.field`, `Api.fieldId(field)`, `field:getAreaHa()` | SDK AbstractFieldMission.lua; `Api.fieldId` is ours (Fields.lua) | unverified (`areaHa` already runs in `fields`) |
| `mission:getReward()` | SDK AbstractMission.lua, AbstractFieldMission.lua | unverified |
| `mission:getVehicleCosts()`, `mission.vehiclesToLoad` (`{filename, configurations}`) | SDK AbstractMission.lua | unverified |
| `mission:getReimbursement()`, `mission.stealingCost` | SDK AbstractMission.lua | unverified |
| `mission:getMinutesLeft()` | SDK AbstractMission.lua (game minutes from `endDate`) | unverified |
| `mission.completion` | SDK AbstractMission.lua (`updateTick`) | unverified |
| `AbstractMission.SUCCESS_FACTOR` | SDK AbstractFieldMission.lua (value blanked; BC says 0.95) | unverified |
| `HarvestMission.SUCCESS_FACTOR`, `BaleMission.FILL_SUCCESS_FACTOR` | BC betterContracts.lua (0.93 or 0.94; 0.9) | unverified |
| `mission.expectedLiters`, `mission.depositedLiters`, `mission.fillTypeIndex` | BC betterContracts.lua | unverified |
| `mission.sellingStation`, `:getName()`, `:getEffectiveFillTypePrice(fillType)` | BC betterContracts.lua | unverified |
| `g_storeManager:getItemByXMLFilename(filename)`, `item.name`, brand and category titles | [GAME-API.md](../docs/GAME-API.md#verified-since-phase-0) "Brand and shop category" | verified for a vehicle's `configFileName`; unverified for a lease's `filename` |
| `item.specs.workingWidth`, `item.specs.speedLimit` | BC userint.lua | unverified |
| `item.categoryName` for your own tools | [GAME-API.md](../docs/GAME-API.md#verified-since-phase-0) "Brand and shop category" (already sent per vehicle by `Vehicles.lua`) | verified |
| Shop category names per contract type (`PLOWS`, `CULTIVATORS`, `SEEDERS`, `PLANTERS`, `SPRAYERS`, `FERTILIZERSPREADERS`, `MOWERS`, `CUTTERS` ...) | BC userint.lua | unverified (a wrong one: that tool isn't offered) |
| `MissionManager:getIsMissionRunningOnFarmland` (one contract per farmland) | SDK MissionManager.lua | unverified, read only to explain; not called |

## Commands

None: read-only. Accepting, cancelling and finishing come later (Out of
scope).

## Plan

- **Mod:** `collectors/Contracts.lua` (read-only, one entry per mission,
  each read guarded), the names in `Api.lua`, registered at 2000 ms in
  `Companion.lua`; version 0.19.0 in `modDesc.xml`; the topic in
  `mod/README.md`.
- **Companion:** nothing (it passes topics through); a test that
  `contracts` reaches a viewer.
- **Web:** `types.js`, `data/contracts.js`, `widgets/contractsScreen.js`,
  `map/layers/contractsLayer.js`, the tab (without the control column)
  and legend entry, the field panel's contract row, the tab label's count.
- **Design docs:** THEMES.md's Layout and Screens: the Contracts page, the
  first without the control column.
- **Fixture:** `fixtures/contracts_sample.ndjson`, made up from the SDK's
  shapes (an offer with lease, one without, a running harvest, a finished
  one), used by the tests and the pane check. Replaced by a real dump after
  the live check.
- **Docs:** this spec and `specs/README.md`'s row ("Missions and contracts"
  left `docs/PLAN.md` with the draft).
- **Risks:** harvest, baling and transport contracts aren't in the SDK copy,
  so their names are BetterContracts' only; mod contract types may lack
  fields (the row hides what's missing). A long list on the iPad mini.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [ ] `mod/tests/run.lua`: the collector turns fake missions (offer, running
  field work, running harvest, finished) into the shape above; an offer
  has no `mine`; another farm's running contract is left out; a mission
  whose calls throw is skipped, the others still sent; it never calls
  `getCompletion` or `tryToResolveSellingStation`, and changes nothing on
  the missions.
- [ ] `companion/tests/`: a `contracts` envelope reaches a viewer unchanged.
- [ ] `tests/test_golden.py`: the Solek golden is unchanged (it has no
  contracts).
- [ ] `web/test.html`: `data/contracts.js`: net with and without lease;
  extra litres and value from the factor and price; fitting tools for each
  contract type (attached first, then widest; none fits → none); work time
  from width, speed and the type's factor, and none without them; per hour; real minutes left at ×1,
  ×5 and ×60; litres to go; the sort orders; missing fields give no
  number, never 0 or NaN.
- [ ] `web/test.html`: the list groups Yours before On offer, hides
  other farms', and the limit line shows "3 of 3 taken"; two running
  contracts give two tiles, nearest deadline first, the tab label
  "Contracts · 2", and each its field panel row.
- [ ] `web/test.html`: the Contracts page has no control column; the others
  keep theirs.
- [ ] Replay in the browser pane (`replay-solek` plus the fixture): the
  tab, a detail with lease vehicles, a running harvest's progress, the
  field panel's contract row, the tab's %, the pins and popup on the map;
  at 1158 × 676 first, then 1180 × 820, 1376 × 1032 and a portrait size;
  day and night; nothing overflows, no button under 44.

Live check (in game, Solek, mod 0.19.0, with `scripts/livewatch.py`; for
Vincent to run):
- [ ] The On offer list matches the game's contracts screen: titles,
  fields, rewards, the lease cost.
- [ ] A contract's lease vehicles match the game's list for it.
- [ ] Time left matches the game's (the HUD or contracts screen), at ×1
  and at a faster speed.
- [ ] Take a field-work contract with lease (plough or cultivate): the
  completion matches the HUD bar while you work, and it finishes when the
  game says done. Note the field % when it finishes (the success factor).
- [ ] Take a harvest contract: expected and delivered litres match the
  game's, the sell point is right, and what's left in the trailer after it
  finishes matches the Extra litres roughly.
- [ ] Two contracts at once: both tiles, both field panel rows, the tab
  says "Contracts · 2".
- [ ] Work time: for one contract done with lease and one with your own
  tool, note the real time (start to finish, at ×1) beside the estimate;
  the overhead factors change from that.
- [ ] Own machines: the tools offered for a plough, a sowing and a spraying
  contract are the right ones from your farm.
- [ ] A finished contract shows its outcome and sums until dismissed.
- [ ] The pins sit on the right fields; the Contracts tab works with
  Precision Farming on and off.

## Decisions

- **Raw facts from the mod, decisions on the web.** Every number Vincent
  decides with is worked out in `data/contracts.js`, so it's tested without
  the game and can change without a mod update.
- **The game's success factors are read, not written in.** The SDK's copy
  blanks them and BetterContracts disagrees with itself (0.93 in a comment,
  0.94 in its config): only the game knows.
- **Work time is an estimate** from a real tool's shop width and speed
  (leased, or your own that fits) and an overhead factor per job, labelled
  as such. Contracts don't say how long they take.

## Out of scope / open questions

Later, each its own spec once this one is live-checked:
- **Accept and cancel from the dashboard:** `g_missionManager:startMission`
  is server-only; a client sends the game's start event. Unverified.
- **Finish a stuck contract** (Vincent, 2026-11-14): the "91 %" is the
  success factor. A field contract counts the field as done at about 95 %
  worked, and a harvest at about 93 % delivered, and the game finishes at
  99.5 % of that. A corner the tools can't reach can keep it short of that.
  A Finish button would call the game's `mission:finish(MissionFinishState.SUCCESS)`
  (server-only, unverified). It changes the game's outcome rather than
  pressing a key the player has, so it'd be the project's first cheat: its
  own spec, its own decision.
- **Input costs** (seed, fertiliser, lime, herbicide for contracts you do
  with your own machines): BetterContracts estimates them from usage per
  ha and the shop price; whether leased machines come filled in FS25
  isn't checked.
- **Sell prices** (the `prices` topic in PLAN.md) and a better place to sell
  the Extra than the contract's sell point.

Open questions for Vincent:
1. **Timing your own runs:** in this spec, or a revision once the first
   live check has shown how good the shop-data estimate is? It needs the
   companion to keep a small file of your rates per tool between sessions
   (today it keeps nothing), so both tablets see the same numbers. Until
   Vincent says otherwise: a later revision.

Settled 2026-11-14: a canvas first, at the mini's 1158 × 676 and the
regular 1180 × 820; the tab label shows the count.

## Log

- 2026-11-14: drafted from the SDK's mission scripts and BetterContracts'
  source. Revised the same day with Vincent: the page takes the whole width
  (no control column), several contracts at once, the field panel row and
  the tab's count, and work time from your own fitting tools with an
  overhead factor per job.
- 2026-11-14: canvas reviewed (version 9: the detail in two columns at
  full height, the switches over the list, the lease list folded to one
  line with own machines). Approved by Vincent; not built yet.
