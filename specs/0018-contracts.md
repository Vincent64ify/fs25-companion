# 0018: Contracts (read-only)

Status: built
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
  ("Lease instead: 4 vehicles for £2,900"). In the compact size class
  (under 900 wide, or portrait) the detail opens over the list, with a Back
  button; under 600 wide its two columns become one. Bigger screens get
  more rows, not other content.
- **Two groups:** **Yours** (running and preparing, nearest deadline
  first, then the finished ones not yet dismissed in the game) first, then
  **On offer**. Other farms' contracts (multiplayer) are not shown. The
  detail opens on the first row; before the game has sent anything the page
  says "No contracts from the game yet.".
- **One row per contract:** what it is and where ("Harvest · Field 12 ·
  wheat"), who it's for, then four numbers in one line: **Net** (reward
  minus the lease, if you lease), **Time** (estimated work time), **Per
  hour** (net ÷ time) and **Left** (time before the deadline). A harvest
  or baling contract adds **+ extra** (what the crop you keep is worth, see
  below). A number the game doesn't give is left out, not shown as 0.
  One of yours shows its progress instead: the bar and %, then "field 83 %
  worked of 95 %" or "delivered 9,800 l of 14,880 l · 5,080 l to go", the
  time left and what that is in real time ("≈ 4 h 50 at ×5"). An offer the
  work won't make at this game speed has its time left in `warn`.
- **Sort:** by Per hour (the default), Net, Left or Distance (from you, or
  from your vehicle). The choice is remembered per screen.
- **Lease or own machines:** a switch at the top, "With lease / Own
  machines". With lease, Net subtracts the lease and Time uses the leased
  machines; with own machines, Net is the full reward and Time uses your
  own tool for the job (see Work time). The row always says which
  ("Net £1,900 leased", "Net £3,900 own"), and so does the On offer header.
- **The limit:** the Yours header says how many you hold of the game's
  per-farm limit ("3 of 3 taken", as the canvas has it; finished ones
  count until dismissed, as in the game). With none of yours it's on the On
  offer header.

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
    fits: with lease only". Only tools with a working width in the shop's
    data are offered; a contract's leased machines are never "yours".
  - **no estimate** for the kinds outside the table below (stone picking,
    baling, tedding, wood ...): Time and Per hour are left out, and the
    detail says so.
- **The rate:** width × working speed ÷ 10 ha/h, the speed being the
  tool's own limit (shop data), or the tractor's cruise top when lower.
- **The overhead per job:** headland turns, overlaps, refills and unloading
  make real work slower than that rate, and more for some jobs than
  others. The time is multiplied by a factor per contract type, starting
  from BetterContracts' table (spreading and spraying 1.15; sowing,
  cultivating and weeding 1.2; ploughing 1.25; mowing and harvesting 1.3).
  Vegetables (1.35 to 1.4 there) aren't in yet. The live check compares
  each with a real run.
- **Your own runs** (open question 1): the dashboard could time your
  running contracts (the game's completion against the clock, with the
  tool that did the work) and use your real rate for that tool next time,
  labelled "from your last run".
- **Deadline:** time left in game time, and what that is in real time at the
  current game speed ("2 days 4 h · about 52 min at ×60"). If the work time
  is longer than the real time left at this speed, the line says so in
  `warn`, and an offer's chip reads "Too late at ×5". A running contract
  counts only the work still to do (the estimate × what's left of the
  game's completion). Without the game speed (an older mod) there is no
  real time and no warning.
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
  finishes at 99.5 % of that); for a harvest, "delivered 37,000 l of
  40,920 l, 3,920 l to go": the litres needed are the expected ones × the
  factor (44,000 × 0.93), and the rest is the Extra you keep. The success
  factors come from the game, not written in the dashboard.
- **Lease or not** is what you took when you accepted (the game's
  `spawnedVehicles`), not the page's switch: Net and the vehicles follow
  it. With your own machines the detail names the tool of yours that fits.
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
  its row. The Map's land panel shows the row under the field you tapped.
  The Vehicle and Harvester pages' panel only took fields your farm owns
  ([spec 0013](0013-vehicle-screen-calm.md) revision 3), and the game
  offers no contract on owned land: a field with one of your running
  contracts now counts as yours to work, so the panel, its trail and
  "This run" show there too.
- **The Contracts tab** carries a count of your running contracts in a
  small pill ("2"; the tab's name reads "Contracts · 2"), and the pill
  turns `warn` when one of them won't make its deadline at the current
  speed. None running: "Contracts" alone.
- **Map pins** show every contract you hold, each with its % (a finished
  one its outcome).

### On the map

- A contract layer with its own legend entry: a pin at each contract's place
  (the field's number position for field work), filled for yours, outlined
  for offers with their money per hour by the page's switch (the net when
  there's no time). A tap opens a popup with the row's line and a "Details"
  button that opens the Contracts tab on it.
- The sell point of your running harvest contract gets a small "Deliver
  here" mark.
- **Show on the map** (the detail) opens the Map, stops following you and
  centres on the contract at 1 px a metre or closer (as near as the map's
  edge allows). The first time the Map shows after a load on another
  page, it centres again once the map has its size.

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
      leased      = true,       -- you took the lease vehicles (yours only)
      finishState = "success" | "failed" | "timedOut" | "canceled",  -- when finished
      x, z        = …,          -- world metres, where the game puts its marker
                                -- (absent when the game answers 0, 0)
      fieldId     = 12,         -- the `fields` topic's id (absent: no field)
      areaHa      = 12.4,
      fruitTypeIndex = 3,       -- the field's crop (absent: none)
      fillType    = "WHEAT",    -- what is delivered (absent: nothing)
      fillTitle   = "Wheat",    -- its title, in the game's language
      reward      = 18450,      -- €, the game's reward with its difficulty
                                -- (absent when the game answers 0)
      vehicleCosts = 2100,      -- €, the lease (absent: no lease vehicles)
      reimbursement = 0,        -- € (finished)
      stealingCost  = 0,        -- € (finished)
      minutesLeft = 3120,       -- game minutes to the deadline (absent: none)
      completion  = 0.87,       -- the game's own 0..1 (running, finished)
      expectedLiters  = 44000,  -- harvest, baling, delivery
      depositedLiters = 41200,  -- running
      sellPoint   = { name = "Grain mill", x, z, price = 0.216 },  -- €/l, effective
      vehicles = [{ name, brand, category, categoryTitle, workingWidth, speedLimit }],
    }],
    tools = [{                  -- your farm's own tools with a working width
      id, name, brand,          -- the `vehicles` topic's id; the shop's name
      category, categoryTitle,  -- shop category name and title
      workingWidth, speedLimit, -- m, km/h, from the shop data
    }]
  }
  ```

  Every field is optional; a missing one hides its row on the dashboard.
  Sent: the offers and your farm's own; another farm's and dismissed ones
  are left out, and a mission whose reads throw is skipped. `vehicleCosts`
  is the lease's price whether you took it or not (the game's
  `getVehicleCosts()`); `leased` says whether you did. `tools` leaves out
  a contract's leased machines (they carry your farm id, with
  `VehiclePropertyState.MISSION`).

  The mod only reads: no game function is replaced, nothing is written into
  a mission, and calls that change state (`getCompletion()` drives the
  field's completion modifier, `tryToResolveSellingStation()` sets the sell
  point) are never made. A running contract's completion is the value the
  game keeps (`mission.completion`). One thing is loaded: a shop item's
  specs (`item.specs`, which the game clears at start and the shop fills
  when it lists the item), through the game's own
  `StoreItemUtil.loadSpecsFromXML`: once per item, two items a tick at
  most, so a width can arrive a few seconds after its vehicle.

- **Web** (`web/src/types.js`): a `Contracts` typedef with the fields above.
- **Web** (`web/src/data/contracts.js`, new, pure functions): `net`,
  `neededLiters` (`expectedLiters × factor`), `extraLiters`
  (`expectedLiters × (1 − factor)`), `extraValue` (× `sellPoint.price`),
  `fittingTools` (contract type → shop categories, attached first, then
  widest), `leaseTool`, `workHours` (area ÷ (width × speed ÷ 10) ha/h × the
  type's overhead factor; the table of categories and factors, `JOBS`,
  lives in this one file and matches the game's type name by what it holds:
  "plow", "sow", "harvest" ...), `perHour` (net ÷ time), `realMinutesLeft`
  (`minutesLeft ÷ env.timeScale`), `deliveredToGo`, `figures` (all of one
  contract's numbers), the sort orders, and the rows' words. Money and area
  go through `data/units.js`. The switch, the sort and the tool picked per
  job are kept on the device (`fs25companion.contracts`).
- **Web** (widgets): `web/src/widgets/contractsScreen.js` (the tab),
  `web/src/map/layers/contractsLayer.js` (pins, popup, legend), and the tab
  registered in `web/src/themes/newholland` (a screen's `count` names the
  number on its tab, `themes/render.js` `COUNTS`).
- **Web** (going from one page to another): a widget sets the store's
  `goto` (`{screen, contract?, at?: {x, z}}`); the renderer shows the
  screen, the Contracts page opens on the contract, `main.js` centres the
  map.

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
| `item.specs.workingWidth.width` (a table `{width, minWidth}`), `item.specs.workingWidthConfig[config][index].width`, `item.specs.speedLimit` (km/h) | SDK Vehicle.lua (`loadSpecValueWorkingWidth`, `...Config`, `loadSpecValueSpeedLimit`) | unverified |
| `StoreItemUtil.loadSpecsFromXML(item)` (fills `item.specs`) | SDK StoreItemUtil.lua, StoreManager.lua (`specs = nil` at load) | unverified |
| `mission.spawnedVehicles` (you took the lease) | SDK AbstractMission.lua | unverified |
| `VehiclePropertyState.MISSION` on a leased vehicle | SDK AbstractMission.lua (`spawnVehicle`) | unverified |
| `MissionStatus.DISMISSED` (left out) | SDK AbstractMission.lua | unverified |
| `g_fillTypeManager:getFillTypeByIndex(i).name`, `.title` | already read by `collectors/vehicles/Fill.lua` | as there |
| `sellingStation.rootNode` through `getWorldTranslation` (the sell point's place) | our guess | unverified (absent: no "Deliver here" mark) |
| `item.categoryName` for your own tools | [GAME-API.md](../docs/GAME-API.md#verified-since-phase-0) "Brand and shop category" (already sent per vehicle by `Vehicles.lua`) | verified |
| Shop category names per contract type (`PLOWS`; `CULTIVATORS`, `DISCHARROWS`, `POWERHARROWS`; `SEEDERS`, `PLANTERS`; `SPRAYERS`; `FERTILIZERSPREADERS`; `WEEDERS`; `MOWERS`; `CUTTERS`, `CORNHEADERS`) | BC userint.lua, and the shop's names as remembered | unverified (a wrong one: that tool isn't offered) |
| Mission type names (`plowMission`, `harvestMission` ...) | values blanked in the SDK; matched by what the name holds | unverified (no match: no work time) |
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
  and legend entry, the field panels' contract row
  (`widgets/fieldPanel.js`, `panels/fieldInfoPanel.js`), the tab's count
  and `goto` (`themes/render.js`, `main.js`), `isOwnField` taking a
  contract's field (`data/selectors.js`), the styles in the theme's CSS.
- **Design docs:** THEMES.md's Layout and Screens: the Contracts page, the
  first without the control column.
- **Fixture:** `web/fixtures/contracts.json` (where the browser reaches it;
  `fixtures/*.ndjson` must be whole sessions), a made-up `contracts` topic
  on real Solek fields: two running (a leased harvest, a plough with your
  own machines), a finished one, six offers with lease and one without.
  Used by the tests and the pane check. Replaced by a real dump after the
  live check.
- **Docs:** this spec and `specs/README.md`'s row ("Missions and contracts"
  left `docs/PLAN.md` with the draft).
- **Risks:** harvest, baling and transport contracts aren't in the SDK copy,
  so their names are BetterContracts' only; mod contract types may lack
  fields (the row hides what's missing). A long list on the iPad mini.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [x] `mod/tests/run.lua`: the collector turns fake missions (offer, running
  field work, running harvest, finished) into the shape above; an offer
  has no `mine`; another farm's running contract is left out; a mission
  whose calls throw is skipped, the others still sent; it never calls
  `getCompletion` or `tryToResolveSellingStation`, and changes nothing on
  the missions.
- [x] `companion/tests/`: a `contracts` envelope reaches a viewer unchanged.
- [x] `tests/test_golden.py`: the Solek golden is unchanged (it has no
  contracts).
- [x] `web/test.html`: `data/contracts.js`: net with and without lease;
  extra litres and value from the factor and price; fitting tools for each
  contract type (attached first, then widest; none fits → none); work time
  from width, speed and the type's factor, and none without them; per hour; real minutes left at ×1,
  ×5 and ×60; litres to go; the sort orders; missing fields give no
  number, never 0 or NaN.
- [x] `web/test.html`: the list groups Yours before On offer, hides
  other farms', and the limit line shows "3 of 3 taken"; two running
  contracts give two tiles, nearest deadline first, the tab label
  "Contracts · 2", and each its field panel row.
- [x] `web/test.html`: the Contracts page has no control column; the others
  keep theirs.
- [x] Replay in the browser pane (`replay-solek` plus the fixture): the
  tab and its count, a detail with lease vehicles, own machines with the
  tool picker, a running harvest's progress, a deadline you won't make, the
  field panel's contract row (the Vehicle page with a plough rig on field
  58, and the Map's land panel), the pins and popup on the map, Show on the
  map (from a fresh load too); at 1158 × 676 first, then 1180 × 820,
  1376 × 1032, 1024 × 600 and 820 × 1180 (portrait: the detail over the
  list, with Back); day and night at 1158 × 676; every row opened with
  lease and with own machines: nothing overflows, the detail never scrolls,
  no button under 44. Not looked at in the pane: the row on the Harvester
  page's compact panel (`web/test.html` covers the panel's row).

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
- [ ] After loading a save with a running harvest contract: its sell point,
  Deliver here mark and Extra are there (the mod never asks the game to
  resolve the sell point; if they're missing until you deliver, say so).
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
regular 1180 × 820; the tab label shows the count. Per hour is net ÷
time, without the Extra (the canvas had worked it out from net + extra;
the build stays as the spec says).

Open after the build, for Vincent:
2. **The tab's icon** is `money` until a `contract` icon is drawn.

## Log

- 2026-11-14: drafted from the SDK's mission scripts and BetterContracts'
  source. Revised the same day with Vincent: the page takes the whole width
  (no control column), several contracts at once, the field panel row and
  the tab's count, and work time from your own fitting tools with an
  overhead factor per job.
- 2026-11-14: canvas reviewed (version 9: the detail in two columns at
  full height, the switches over the list, the lease list folded to one
  line with own machines). Approved by Vincent; not built yet.
- 2026-11-14: built (mod 0.19.0). Different from the approved text, each
  now in Behaviour or the Data contract: `leased` (the game's lease price
  is the same whether you took it; `spawnedVehicles` says); a contract's
  leased machines kept out of your tools; the shop's specs loaded a few a
  tick (the game clears them at start); a field with one of your running
  contracts counts as yours for the Vehicle page's field panel (the game
  offers none on owned land, so the row could never have shown); the
  litres needed are expected × factor (the example's numbers fixed); the
  limit line on Yours and the count as a pill, as the canvas has them; the
  detail over the list from the compact size class (under 900 wide or
  portrait), not 760; no work time for kinds outside the overhead table;
  the fixture in `web/fixtures/`; a reward of 0 (the base class's answer)
  is left out; the page draws nothing while another screen shows. Checked
  in the replay at five sizes, day and night. Live check open.
