# 0018: Contracts (read-only)

Status: live-checked
Mod: 0.19.1 · Started: 2026-11-14 · Design: the chrome in [THEMES.md](../docs/THEMES.md#layout); the tiles after the HEADLAND canvas's Haul and Yard pages (private, on claude.ai); the canvas [FS25 Companion: Contracts](https://claude.ai/artifact/T8NwTQTEp6jvCdRq82xHzP) (private, on claude.ai; at 1158 × 676 and 1180 × 820, day and night; version 9 reviewed by Vincent 2026-11-14: the detail in two columns at full height, the switches over the list)

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
  hour** (net ÷ the whole job's time, below) and **Left** (time before the deadline). A harvest
  or baling contract adds **+ extra** (what the crop you keep is worth, see
  below). A number the game doesn't give is left out, not shown as 0.
  One of yours shows its progress instead: the bar and %, then "field 83 %
  worked of 95 %" or "delivered 9,800 l of 14,880 l · 5,080 l to go", then
  its two times (below). An offer the work won't make at this game speed
  has its deadline in `warn`.
- **Two times, each named** (everywhere a contract shows: the row, the
  detail, the field panel's row):
  - **the deadline, in game time:** the game's own time left before the
    contract expires, "deadline 1 day 0 h game time". The same words at
    any game speed.
  - **the work, in real time:** how long you'll be at it, estimated
    (Work time, below). For an offer the whole job, "work ≈ 40 min real
    time"; for one of yours what's still to do, "work left ≈ 6 min real
    time" (the estimate × what's left of the game's completion).
  No third time is shown: the real time before the deadline (game time ÷
  game speed) only decides the warning.
- **Sort:** by Per hour (the default), Net, Left or Distance (from you, or
  from your vehicle). The choice is remembered per screen.
- **On offer by type:** the offers sit under a header per contract type
  (the game's own name for it: "Harvesting", "Cultivating" ...), always.
  Inside a type they follow the sort; the types follow their best
  contract by the sort, so the type holding the best per hour, or the
  nearest deadline, comes first. A type where no contract has the number
  (baling under Per hour) goes last, by name. The header says the type,
  how many, and its best ("best £9,150/h", "soonest 5 h 10 min", "nearest
  0.8 km"). A tap on a header folds its contracts away or shows them
  again: all are shown at first, and what you folded is remembered on the
  device. "Collapse all" at the end of the On offer line folds every
  type, and then reads "Open all". A contract opened from the map or a field panel opens its type
  again. Yours stay above, ungrouped.
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
    sowing, sprayers for herbicide, mowers for mowing ...). Fertilising
    takes spreaders, sprayers, slurry tankers and their booms, and manure
    spreaders (the game leases a sprayer for it as often as a spreader).
    A harvest takes what its lease list harvests with: a grain header
    where the lease has one, a corn header for corn, a potato harvester
    for potatoes, so your grain header is never offered for a root crop.
    The one you have attached now comes first if it fits, then the
    widest. You can pick another in the detail; the choice is remembered
    per contract type. No fitting tool: Time is blank, "No tool of yours
    fits: with lease only". A contract's leased machines are never
    "yours".
  - **no estimate, but your tools** for baling, bale wrapping and
    tedding: your balers, wrappers and tedders are listed (a baler has no
    working width in the shop's data), Time and Per hour are left out, and
    the detail says so. A baler that also wraps is a baler: it doesn't
    fit a wrapping contract, whose bales already lie on the field.
  - **no estimate** for the other kinds (stone picking, wood ...).
- **The rate:** width × working speed ÷ 10 ha/h, the speed being the
  tool's own limit (shop data), or the tractor's cruise top when lower.
- **The overhead per job:** headland turns, overlaps, refills and unloading
  make real work slower than that rate, and more for some jobs than
  others. The time is multiplied by a factor per contract type, starting
  from BetterContracts' table (spreading and spraying 1.15; sowing,
  cultivating and weeding 1.2; ploughing 1.25; mowing and harvesting 1.3).
  Vegetables (1.35 to 1.4 there) aren't in yet. The live check compares
  each with a real run.
- **The whole job:** a contract is more than its field work, and money
  per hour over the work alone is absurd for a short job (£7,215 for 2.7
  minutes of spreading read "£159,893/h", Vincent, 2026-11-15). So the
  time an offer shows, and Per hour divides by, is the whole job:
  - **work**, as above;
  - **the way there**, in a straight line at 30 km/h, from where the
    machines are: the shop for a lease (the game puts leased machines on
    the shop's spawn places), your own tool for own machines, and where
    you are when neither is known;
  - **10 minutes** to set up and hand in.
  The row says "job ≈ 20 min real time"; the detail's Work section says
  "Job · real time" and spells out the three parts. The 30 km/h and the
  10 minutes are guesses until the live check's real runs. A running
  contract counts only the work left.
- **Your own runs** (open question 1): the dashboard could time your
  running contracts (the game's completion against the clock, with the
  tool that did the work) and use your real rate for that tool next time,
  labelled "from your last run".
- **Time:** "Deadline · game time", and for one of yours "Work left ·
  real time" under it (an offer's "Job · real time" is in its Work
  section). If the work is longer than the real time before the deadline
  at this game speed, both are in `warn` with one line that says why ("At
  ×5 the deadline is ≈ 1 h 07 of real time away, and the work still takes
  ≈ 2 h 10: you won't make it at this speed"), and an offer's chip reads
  "Too late at ×5". Without the game speed (an older mod) there is no
  warning.
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
  here" mark, its label under the point.
- **A label stays whole and in the clear.** A pin stands over its point
  and the Deliver here label hangs under it, centred. Where that would run
  off the map's view or under one of the map's controls (the buttons, the
  scale, the land panel), the label starts or ends at the point, or goes
  to the other side. A point that's under a control itself gets the place
  where the least of its label is covered. Looked at again each time the
  view comes to rest, so a label can change sides after a pan.
- **Show on the map** (the detail) opens the Map, stops following you,
  centres on the contract at 1 px a metre or closer (as near as the map's
  edge allows) and opens its pin's popup. The first time the Map shows after a load on another
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
    shop        = { x, z },     -- where leased machines appear (absent: unknown)
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
    tools = [{                  -- your farm's own tools: a working width, or no motor
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
  "plow", "sow", "harvest" ...), `jobTime` (work + the way there + setup), `perHour` (net ÷ the whole job), `realMinutesLeft`
  (`minutesLeft ÷ env.timeScale`), `deliveredToGo`, `figures` (all of one
  contract's numbers), the sort orders, and the rows' words. Money and area
  go through `data/units.js`. The switch, the sort and the tool picked per
  job are kept on the device (`fs25companion.contracts`), with the types
  folded in the On offer list (`closed`).
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
| `g_missionManager:getMissions()` (or `.missions`) | SDK MissionManager.lua | verified (live check 2026-11-15 and 16) |
| `MissionManager.MAX_MISSIONS_PER_FARM` | SDK MissionManager.lua (value blanked) | verified (live check 2026-11-15 and 16) |
| `g_currentMission.storeSpawnPlaces[1].startX`, `.startZ` (the shop) | SDK AbstractMission.lua `spawnVehicles` (the list); the field names after PlacementUtil, our guess | verified 2026-11-16 (sent as x -73.3, z 272.2, beside the Vehicle Shop) |
| `mission.status`, `MissionStatus.CREATED/PREPARING/RUNNING/FINISHED` | SDK AbstractMission.lua | verified (live check 2026-11-15 and 16) |
| `mission.finishState`, `MissionFinishState.SUCCESS/FAILED/TIMED_OUT/CANCELED` | SDK AbstractMission.lua, MissionManager.lua | verified (live check 2026-11-15 and 16) |
| `mission.farmId`, `g_localPlayer.farmId` | SDK AbstractMission.lua | verified (live check 2026-11-15 and 16) |
| `mission:getUniqueId()`, `mission.type.name` | SDK AbstractMission.lua | verified (live check 2026-11-15 and 16) |
| `mission:getTitle()`, `getNPC().title`, `getLocation()` | SDK AbstractMission.lua, AbstractFieldMission.lua; `getNPC().title` from BC gui.lua | verified (live check 2026-11-15 and 16) |
| `mission:getWorldPosition()` (field: `field:getIndicatorPosition()`) | SDK AbstractMission.lua, AbstractFieldMission.lua | verified (live check 2026-11-15 and 16) |
| `mission.field`, `Api.fieldId(field)`, `field:getAreaHa()` | SDK AbstractFieldMission.lua; `Api.fieldId` is ours (Fields.lua) | verified (live check 2026-11-15 and 16) |
| `mission:getReward()` | SDK AbstractMission.lua, AbstractFieldMission.lua | verified (live check 2026-11-15 and 16) |
| `mission:getVehicleCosts()`, `mission.vehiclesToLoad` (`{filename, configurations}`) | SDK AbstractMission.lua | verified (live check 2026-11-15 and 16) |
| `mission:getReimbursement()`, `mission.stealingCost` | SDK AbstractMission.lua | unverified (a finished contract's sums looked right to Vincent; neither was seen in a stream) |
| `mission:getMinutesLeft()` | SDK AbstractMission.lua (game minutes from `endDate`) | verified (live check 2026-11-15 and 16) |
| `mission.completion` | SDK AbstractMission.lua (`updateTick`) | verified (live check 2026-11-15 and 16) |
| `AbstractMission.SUCCESS_FACTOR` | SDK AbstractFieldMission.lua (value blanked; BC says 0.95) | verified: sent as 0.98 on Solek (not BC's 0.95) |
| `HarvestMission.SUCCESS_FACTOR`, `BaleMission.FILL_SUCCESS_FACTOR` | BC betterContracts.lua (0.93 or 0.94; 0.9) | `HarvestMission.SUCCESS_FACTOR` verified (0.93); `BaleMission.FILL_SUCCESS_FACTOR` isn't there: no `bale` factor is sent ([NEXT.md](../docs/NEXT.md)) |
| `mission.expectedLiters`, `mission.depositedLiters`, `mission.fillTypeIndex` | BC betterContracts.lua | verified (live check 2026-11-15 and 16) |
| `mission.sellingStation`, `:getName()`, `:getEffectiveFillTypePrice(fillType)` | BC betterContracts.lua | verified (live check 2026-11-15 and 16) |
| `g_storeManager:getItemByXMLFilename(filename)`, `item.name`, brand and category titles | [GAME-API.md](../docs/GAME-API.md#verified-since-phase-0) "Brand and shop category" | verified for a vehicle's `configFileName`; unverified for a lease's `filename` |
| `item.specs.workingWidth.width` (a table `{width, minWidth}`), `item.specs.workingWidthConfig[config][index].width`, `item.specs.speedLimit` (km/h) | SDK Vehicle.lua (`loadSpecValueWorkingWidth`, `...Config`, `loadSpecValueSpeedLimit`) | verified (live check 2026-11-15 and 16) |
| `StoreItemUtil.loadSpecsFromXML(item)` (fills `item.specs`) | SDK StoreItemUtil.lua, StoreManager.lua (`specs = nil` at load) | verified (live check 2026-11-15 and 16) |
| `mission.spawnedVehicles` (you took the lease) | SDK AbstractMission.lua | verified (live check 2026-11-15 and 16) |
| `VehiclePropertyState.MISSION` on a leased vehicle | SDK AbstractMission.lua (`spawnVehicle`) | verified (live check 2026-11-15 and 16) |
| `MissionStatus.DISMISSED` (left out) | SDK AbstractMission.lua | unverified |
| `g_fillTypeManager:getFillTypeByIndex(i).name`, `.title` | already read by `collectors/vehicles/Fill.lua` | as there |
| `sellingStation.rootNode` through `getWorldTranslation` (the sell point's place) | our guess | verified (live check 2026-11-15 and 16) |
| `item.categoryName` for your own tools | [GAME-API.md](../docs/GAME-API.md#verified-since-phase-0) "Brand and shop category" (already sent per vehicle by `Vehicles.lua`) | verified |
| Shop category names per contract type | seen in the stream, 2026-11-15: `CUTTERS`, `POTATOHARVESTING`, `PLOWS`, `CULTIVATORS`, `POWERHARROWS`, `SEEDERS`, `SPRAYERS`, `FERTILIZERSPREADERS`, `SLURRYTANKS`, `SLURRYTOOLS`, `MOWERS`, `TEDDERS`, `BALERSROUND`, `BALEWRAPPERS` | seen live |
| The others (`DISCHARROWS`, `PLANTERS`, `WEEDERS`, `CORNHEADERS`, `MANURESPREADERS`, `BALERSSQUARE`) | BC userint.lua, and the shop's names as remembered | unverified (a wrong one: that tool isn't offered) |
| `vehicle.spec_motorized` (absent: a tool even without a working width) | already read by `collectors/Vehicles.lua` | as there |
| Mission type names (`plowMission`, `harvestMission` ...) | values blanked in the SDK; matched by what the name holds | seen live: `harvestMission`, `cultivateMission`, `sowMission`, `herbicideMission`, `fertilizeMission`, `mowMission`, `tedderMission`, `baleMission`, `baleWrapMission`, `treeTransportMission`, `deadwoodMission`, `destructibleRockMission`; `plowMission`, the weeding and stone-picking names not seen |
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

Live check (in game, Solek, mod 0.19.1, with `scripts/livewatch.py`; for
Vincent to run):
- [x] The On offer list matches the game's contracts screen: titles,
  fields, rewards, the lease cost.
- [x] A contract's lease vehicles match the game's list for it.
- [x] Time left matches the game's (the HUD or contracts screen), at ×1
  and at a faster speed.
- [x] Take a field-work contract with lease (plough or cultivate): the
  completion matches the HUD bar while you work, and it finishes when the
  game says done. Note the field % when it finishes (the success factor).
  (Confirmed 2026-11-15; the field % at the finish wasn't noted.)
- [x] Take a harvest contract: expected and delivered litres match the
  game's, the sell point is right, and what's left in the trailer after it
  finishes matches the Extra litres roughly.
- [x] Two contracts at once: both tiles, both field panel rows, the tab
  says "Contracts · 2".
- [x] Work time: for one contract done with lease and one with your own
  tool, note the real time (from taking it to handing it in, and the
  field work alone, at ×1) beside the estimate; the overhead factors, the
  30 km/h and the 10 minutes change from that. (2026-11-16: no times
  noted; Vincent found the estimates accurate on 0.19.0 and 0.19.1, so
  the factors, the 30 km/h and the 10 minutes stay as they are.)
- [x] With lease, the detail says "from the shop" and the distance looks
  right for where the leased machines appear. (2026-11-16, mod 0.19.1:
  the stream's `shop` is x -73.3, z 272.2, beside the Vehicle Shop.)
- [x] Own machines: the tools offered for a plough, a sowing and a spraying
  contract are the right ones from your farm; so are the ones for a
  fertilising and a baling contract, and a potato contract offers no
  grain header (first run, 2026-11-15: those three were wrong; fixed in
  0.19.1, to be seen again). (2026-11-16, mod 0.19.1: right; the Göweil
  G-1 F125 Kombi arrives as `BALERSROUND`.)
- [x] A finished contract shows its outcome and sums until dismissed.
- [x] After loading a save with a running harvest contract: its sell point,
  Deliver here mark and Extra are there (the mod never asks the game to
  resolve the sell point; if they're missing until you deliver, say so).
- [x] The pins sit on the right fields; the Contracts tab works with
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
- 2026-11-14: Vincent, first look in the game (mod 0.19.0), not the live
  check yet: a "Deliver here" mark showed on the map, cut off because the
  sell point sat at the very bottom.
- 2026-11-15: fixed, for the pins too: a label is placed where it's whole
  inside the view and clear of the map's controls (Behaviour, "A label
  stays whole"). Checked in the replay (the sample's Mill is at the bottom
  edge too); for Vincent to see on the iPad.
- 2026-11-15: Vincent, live check, Own machines (mod 0.19.0), three wrong:
  a potato contract offered the grain header; fertilising offered none of
  three sprayers and the slurry kit; baling and bale wrapping listed no
  baler. From the stream of that session: the game leases a
  `POTATOHARVESTING` machine for potatoes and a sprayer for fertilising,
  and the mod left out every tool without a working width (the Göweil G-1
  F125 Kombi). Fixed (mod 0.19.1): a harvest takes what its lease
  harvests with; fertilising takes sprayers, slurry and manure too; the
  mod sends tools without a motor even with no width; baling, wrapping
  and tedding list your tools, without a time. Not checked in the game:
  whether a slurry tanker completes a fertilising contract, and the
  Kombi's shop category (taken to be `BALERSROUND`).
- 2026-11-15: Vincent, live: "5 h 33 min left · ≈ 5 h 33 at ×1" read as
  the same time twice, and a deadline turned into real time is confusing
  at any speed. Now two times, each named: the deadline in game time, the
  work (left) in real time (Behaviour, "Two times"). The detail's Deadline
  section is Time, with "Work left · real time" for a running contract.
  This replaces the canvas's "≈ 4 h 50 at ×5".
- 2026-11-15: asked for by Vincent: the offers grouped by type under
  headers that fold (ordered by each type's best contract by the sort),
  and Show on the map opens the contract's pin. Built; checked in the
  replay at 1158 × 676.
- 2026-11-15: Vincent, live: Per hour over the field work alone read
  "£159,893/h" for a £7,215 fertilising contract. Per hour is now net ÷
  the whole job: work, the way there (from the shop with lease, from your
  tool with your own) and 10 minutes of setup. The mod sends the shop's
  place (`shop`, mod 0.19.1). Also: "Collapse all / Open all" on the On
  offer line.
- 2026-11-15: live check by Vincent on mod 0.19.0 (Solek): nine boxes
  confirmed ("it works great for all points"): the On offer list, the
  lease vehicles, the time left, a field-work contract with lease, a
  harvest contract, two at once, a finished contract, the sell point
  after a load, the pins and Precision Farming on and off. Three stay
  open because they need mod 0.19.1 or numbers: Own machines seen again
  (the baler), "from the shop", and the real times of two runs.
- 2026-11-16: live check closed by Vincent on mod 0.19.1: Own machines
  right (the Göweil under Baling, no grain header for potatoes, sprayers
  and slurry under Fertilising), "from the shop" right, and the time
  estimates accurate on both versions (no times noted, so the overhead
  factors, the 30 km/h and the 10 minutes stay). All twelve boxes ticked;
  Status live-checked. From the stream: the field factor is 0.98, and the
  game has no `BaleMission.FILL_SUCCESS_FACTOR`, so a baling contract has
  no litres needed or Extra (in [NEXT.md](../docs/NEXT.md)); a potato
  harvest's expected litres arrive as 0.
