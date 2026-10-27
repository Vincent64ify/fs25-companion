# 0002: Vehicle and Loader screens

Status: live-checked (revision 2, 2026-10-27; revision 1, mod 0.8.6, 2026-10-26)
Mod: 0.8.6 · Started: 2026-10-25 · Design: [THEMES.md, Vehicle screen](../docs/THEMES.md#t4-vehicle-screen)
(revised by this spec),
canvas [FS25 Companion: Vehicle screen](https://claude.ai/artifact/UCGXbQrd4gTozRk67NcnWw)

## Goal

The Vehicle tab's pages for what isn't a combine. It answers "what is my
machine, what is hitched to it, and what am I handling". Road driving
belongs to the Map, field work to the Implement tab. **Loader** is tuned
for yard work: what's on the loader, how full the thing you're filling
is, how many more loads it takes, and what you've moved so far. **Vehicle**
is the plain page for everything else, for now the band and the rig's
tanks. Both drop what the Implement tab already does (per-tool buttons,
implement rows), the same clean-up as spec 0001's revision 2.

Revision 2 (Vincent, after revision 1's live check): revision 1's page
turned out to be a loader page, half empty with a seeder or on a truck,
and a tap on the Merlo's or the L90H's tile opened the Implement tab,
where a telehandler or a wheel loader has nothing to do. So the page
became Loader, picked by itself like Harvester, with a plain Vehicle page
beside it, and a tap no longer changes the page.

## Behaviour

- **Three pages on the Vehicle tab:** the tab wears the icon of the page
  it opens on and names it: "Vehicle · Loader", "Vehicle · Harvester",
  just "Vehicle" on the plain page, with a chevron for its menu
  (Vincent, 2026-10-27, as on the Harvester canvas). Its menu offers
  Vehicle, Loader, Harvester:
  - **Loader** (icon `loader`): the band with the rig strip, then On the
    loader and Target;
  - **Vehicle** (icon `tractor`), for now: the band with the rig strip,
    then the Loads card full width. No On the loader, no Target;
  - **Harvester**: spec 0001.
- **The pick** (Screen for what I drive, on by default):
  - Harvester for a combine;
  - Loader when the vehicle is a loader machine (its shop category says
    loader, telehandler, skid steer or forklift, but not a loader wagon;
    else its type name: wheelLoader, teleHandler, skidSteer, forklift),
    or a loader tool is in the rig (a bucket or shovel, forks, a hook or
    bigbag lifter, a bale grab), or something is carried. A front loader
    with no tool on it isn't enough: the arm often stays on while you
    pull a trailer (Vincent, 2026-10-26);
  - Vehicle for everything else.
- **When the pick runs:** when what it picks changes (you get into
  another vehicle, or couple or drop a loader tool), the Vehicle tab takes
  the page for it. If you are on the Vehicle tab, the page changes there
  at once (Vincent, 2026-10-26). On any other tab nothing moves; the
  Vehicle tab opens on the new page the next time you tap it. A page
  chosen from the tab's menu stays until the pick changes again. With the
  setting off, the tab never picks.
- **The Implement tab is never picked by itself,** and nothing opens it
  but its own tab.
- **A tap selects; it never changes the page.** On every page, a tap on
  a rig tile selects that tool, or the vehicle, in game
  (`implement.select`), as the game's select key would; the tile turns
  yellow and the page stays. Only the bottom tabs change the page, plus
  the pick inside the Vehicle tab. (Harvester's tiles are its buttons;
  they act and stay too.)
- **Layout (1180×820):** the band with the rig strip under it, both on one
  readout card (as the Implement tab's rig band); under that, on Loader,
  two cards side by side, Load (left) and Target (right); on Vehicle,
  Loads full width. The control column on the right, as on every screen.
  No vehicle card, no Show on map (the bottom nav opens the Map), no
  condition tiles row, no implement rows.
- **Band:** on the left, the job (the model is on the vehicle's rig tile
  only, its state line ends with the operating hours: "PTO on · 1,240 h").
  On the right, always shown:
  - speed, with the gear and the direction under it ("F2 · forward",
    "R1 · reverse", "N · neutral"); the direction comes from the gear's
    name (R… reverse, N neutral, else forward);
  - fuel as a range, "≈ 5 h" (under an hour "≈ 40 min") at the last 5
    minutes' usage, with the % under it; "%" only while the usage isn't
    known yet. The usage is the mean of the game's L/h over the last 5
    minutes, from 30 s of it. On an electric vehicle it's "Battery" (the
    mod reads its charge in kWh);
  - DEF the same way, only for engines with DEF. The game has no DEF usage
    figure, so its usage is how far the level dropped over the last 5
    minutes, once a minute and 0.05 L of it are in (the mod sends DEF to
    0.01 L); "%" until then;
  - wear, %, "good" under it, orange from 70% with "repair soon".
  An orange chip "Engine hot" appears from 100 °C: the game has no
  warning level of its own (spike: only the temperature and its 20–120 °C
  range; the fan comes on at 95 °C). Otherwise the temperature isn't
  shown.
- **The job:** an AI worker's job; else "Loading · Potatoes" while
  something is on the loader (the fill type or the pallet's content);
  else the Implement tab's job ("Seeding", "Driving", "Standing", "Parked").
- **Rig strip:** every vehicle in the rig as a tile in driving order (rear
  tools on the left, the vehicle, front tools on the right; a tool on a
  tool beside its parent), each with its icon badge (yellow while
  working), model, a state line and a thin bar per fill unit. The state
  line: the vehicle's is what it does and its hours ("PTO on · 1,240 h",
  "Engine on · 1,240 h"); a loader's tool with a load shows the load
  ("Potatoes · 82%"), an empty one its kind ("Bucket", "Forks"); other
  tools the Implement tab's line ("Working · Lowered", "Raised"), else
  their kind ("Loader"). A front loader and its tools never read Lowered
  or Raised. Between two tiles, a
  **link**: a short line with a chip naming the coupling of the tile
  farther from the vehicle, from the attacher joint's type name:
  "3-point" (implement), "Drawbar" (trailers, hook lift, a cutter
  trailer), "Loader" (a front loader on its console), "Tool" (a loader's
  quick coupler: frontloader, wheel loader, telehandler, skid steer,
  forks), "Hook" (a bigbag on its lifter), "Header" (cutter); the other
  joints (conveyor, manure barrel, train...) read "Front" or "Rear". The link is solid while
  the tool is lowered, dashed while raised; a tool that doesn't lower (a
  trailer, a front loader and its tools) is solid. The game's selected
  tool is the yellow tile, as on the Implement tab. A tap on a tile
  selects that tool in game (unless it is selected already); the page
  stays. With nothing attached, the strip shows the vehicle alone and
  "Nothing attached".
- **No lowered or raised for loader gear,** anywhere on the dashboard: a
  front loader and its tools (bucket, forks, hooks, a bigbag lifter;
  known by the joint, the shop category or the type name, `isLoaderGear`
  in selectors.js) have no such state in the game. So no Lowered / Raised
  on their tiles (here and on the Implement tab), no Lift on the
  Implement card, no hitch chip in the implement rows; Lower and Lower
  all are unavailable for them; a lowered loader tool doesn't make the
  job "Working" or count worked area.
- **Only what the game records** (Vincent, 2026-10-26): something counts
  as on the loader only when the game says so (mounted on the forks or
  hook, or attached in the rig like a bag on a bigbag lifter). A bigbag
  hanging on bare tines by its straps isn't recorded anywhere (the
  fork's mounts and the bag's `spec_mountable` are empty; spike, 0.0.3),
  so it isn't carried, and forks with nothing mounted read "Nothing
  mounted", not "Empty".
- **Load card** ("On the loader"), on Loader when the pick's rule holds
  (a loader machine, a loader tool in the rig, or something carried):
  - what's on it, big: a bucket's or shovel's fill type, litres and t; a
    pallet or bigbag on forks or a hook: its content ("Seed bigbag",
    "Potatoes pallet"), litres and t, one line each when there are several;
    "Nothing mounted" for forks or a hook with nothing on them, "Empty"
    otherwise;
  - the tool's name and kind ("Albutt bucket · Bucket", "Pallet Fork ·
    Forks"); a bucket's load also gets a big meter. A bag or pallet
    hanging in the rig (on a bigbag lifter) is the load, never the tool:
    the lifter is;
  - **This session** (the tally): "14 loads · 42.3 t", and one line per
    fill type under it ("Potatoes · 11 loads · 34.1 t"). A load counts when
    a bucket drops from more than 50% to under 5% of its capacity (with
    what it held at the top), or when a pallet or bigbag leaves the forks
    or hook. Mass from litres × the fill type's mass per litre. Since the
    page was opened, across vehicles; getting out isn't setting down (a
    pallet still on the forks then doesn't count). A Reset button on the
    card clears it.
  On the Vehicle page, and on Loader with no loader in the rig (chosen
  from the menu), the card is **Loads**: every fill unit in the rig as a
  meter ("Seeds · 58%", "2,900 / 5,000 L"), with the weight limit's
  shading and MAX as elsewhere, and the rig's weight in the card's head
  ("Rig 14.6 t", the vehicle's total mass). The data has no limit for the
  whole rig, so each unit shows its own.
- **Target card** (Loader only, with a loader; without one, Load takes
  the full width): the nearest vehicle that can take what you carry:
  - picked by the mod: within 15 m of the vehicle you drive (its own
    position, not the tool's: simple, Vincent 2026-10-26), not in your own rig,
    yours (the farm's), with a fill unit that accepts the carried fill
    type; the nearest wins. While the loader is empty, the last carried
    fill type counts, so the target stays while you fetch the next load;
  - its name, then category and distance ("Väderstad Spirit 600C",
    "Seeders · 6 m"; feet with miles), a big meter for the unit that takes
    the fill type ("Seeds · 64%", "3,200 / 5,000 L"), and its weight
    against the limit ("9.8 / 15.0 t") under Trailer Fill Limit;
  - **"≈ 2 more loads"** ("≈ 1 more load"): free space (the game's, else
    to where the unit stops; less if the weight limit comes first) ÷ what
    you carry now (else the last load), rounded up; "Full" (green chip)
    when it's at capacity or the weight limit;
  - no target in range: the last target stays, dimmed, "out of range ·
    85 m", its numbers still live; none yet: "Come near something to fill".
- **Column:** Lights (Lights, High beam, Beacon, Hazard, Turn L, Turn R) and
  Drive (Cruise −, Cruise with its set speed, Cruise +; then Engine and AI
  worker), as on Harvester. No Implement group: the tools' buttons are on
  the Implement tab, and Lower all and Hitch stay there. Engine takes two
  columns of the Drive grid, and that's the same on every screen whose
  column has Engine (Map, Harvester). The column stays as on the other
  screens: group labels over the buttons, no box around a group.
- **Day and Night:** both palettes. The band and strip in readout colours;
  links and chips follow the Night selection colours.
- **Compact (portrait):** one column; the strip scrolls sideways, Target
  under Load.

## Data contract

All additions; Protocol v1 is unchanged. The pallet and bigbag names come
from a spike first (Plan, step 1); this table changes with its results.

- **Mod → backend** (`vehicles`, the controlled vehicle):
  - `cab.rig[]` entries gain `joint`: the attacher joint's type name as the
    game registers it ("implement", "trailer", "frontloader"...), absent
    for the vehicle itself and when unknown. Read from the joint's
    `jointType` number.
  - `carried[]`: objects mounted on any rig member's dynamic mount (forks,
    hooks), and pallets or bigbags hanging in the rig itself, each `{id,
    name, pallet: bool, bigBag: bool, fills[]}` (fills as everywhere, with
    `massPerLiter`), by id. Absent when nothing is mounted.
  - `target`: `{id, name, brand, category, categoryTitle, distance (m, 1
    decimal), fillType, fills[] (the accepting unit only, with `free`
    when the game answers), massLimit {max, mass, reached} (t, under
    Trailer Fill Limit)}` as picked above, measured from the controlled
    vehicle. Only with a loader's tool in the rig (a member with
    `spec_shovel` or `spec_dynamicMountAttacher`) or something carried.
    Absent
    when nothing qualifies and nothing was picked before; `stale: true`
    when it's the last target out of range.
  - No temperature warning: the game has no level (0.8.5 tried three
    guessed fields as `temperatureWarning`; 0.8.6 dropped it).
  - `def` to 0.01 L (was 0.1), for the DEF range.
- **Backend:** nothing new (topic models take extras).
- **Web:**
  - `web/src/widgets/vehicleScreen.js`: `vehicleBand`, `rigStrip`,
    `loadCard`, `targetCard`; the tally (`createTally`) and the range
    (`fuelRange`).
  - `web/src/data/rates.js`: the fuel usage over 5 minutes.
  - `web/src/themes/newholland/theme.js`: the Vehicle and Loader screens
    (Loader: tab `vehicle`, choice "Loader", when `loader`); `loadCard`'s
    variant `loads` on Vehicle.
  - `web/src/themes/render.js`: a `loader` detector next to `harvester`
    (`hasLoader` in vehicleScreen.js); the first screen in the tab whose
    detector holds wins.
  - Revision 2 has no mod change. `main.js` no longer listens for
    `showscreen` (nothing sends it).

| Name | Where from | State |
|---|---|---|
| `AttacherJoints.jointTypeNameToInt` (read backwards for a name) | AttacherJoints.lua, registerJointType | verified (DONE.md, Vehicle screen): 24 names, e.g. 1 implement, 7 frontloader, 12 attachableFrontloader |
| `spec_dynamicMountAttacher.dynamicMountedObjects` (keys are the objects) | DynamicMountAttacher.lua | verified (DONE.md, Vehicle screen) |
| `object.isPallet` | Pallet.lua | verified (DONE.md, Vehicle screen): true on a pallet, typeName pallet |
| `spec_bigBag` on a bigbag, and how a lifter holds it | BigBag.lua | verified (DONE.md, Vehicle screen): a bag is its own vehicle (typeName bigBag, `isPallet` true); a lifter holds it as an attached implement by joint type "bigBag", so it is a rig member; on bare tines it hangs by physics, not recorded |
| `getFillUnitAllowsFillType(index, fillType)` | FillUnit.lua | verified (DONE.md, Vehicle screen): answers true |
| `getFillUnitFreeCapacity(index, fillType, farmId)` | FillUnit.lua | verified (DONE.md, Vehicle screen): answers (0 on a full pallet) |
| attacher joint `jointType` (the number registered) | AttacherJoints.lua | verified (DONE.md, Vehicle screen): a number on the joint |
| `spec_shovel` on a bucket (the loader's tool) | Shovel.lua | verified (DONE.md, Vehicle screen): on the bucket (typeName shovelLeveler), which hangs by joint type "wheelLoader" |
| the engine's temperature warning level: `motorTemperature.warningTemperature`, `valueWarning` or `warning` (guesses) | Motorized.lua | not there (spike, 2026-10-26: the electric Merlo and the diesel Volvo L90H alike): motorTemperature has only value, valueMin 20, valueMax 120 and heating rates; motorFan switches on at 95 °C, off at 85 |
| `fillType.massPerLiter` | FillTypeManager | verified (DONE.md, Harvester screen) |
| attacher joint front / rear (`jointTransform` z) | AttacherJoints.lua | verified (PLAN.md, C3) |

## Commands

One new use of an existing one: a rig tile sends `implement.select` with
its id (as the Implement tab's tiles); the page stays. Cruise
−, Cruise, Cruise +, Engine and AI worker as on Harvester. Reset (the
tally) is local to the page.

## Plan

1. **Spike** (`spike/FS25_CompanionSpike`, `controlledDetail.vehicleScreen`;
   written 2026-10-26, not run yet; how to run it in
   [spike/README.md](../spike/README.md#vehicle-screen-spike-spec-0002)): per rig
   member, the joint type number and its name; `dynamicMountedObjects`
   with each object's typeName, `isPallet`, specs and fills; a bigbag on
   a lifter (what holds it); for the 5 nearest vehicles, their fill units
   and `getFillUnitAllowsFillType` for the carried type; Motorized's
   temperature fields. Vincent runs it: a pallet on forks, a seed bigbag
   on a lifter over a seeder, a bucket of potatoes by a trailer. The probe
   also dumps the lights spec (work lights apart?). The mod was built
   before it, on the names in the table, all guarded: a wrong name leaves
   its field out.
2. **Mod (0.8.5):** `VehicleState.lua` adds `joint` to `cab.rig`;
   `collectors/Vehicles.lua` adds `carried`, `target` and the warning;
   the version in `mod/modDesc.xml` and `Companion.VERSION`.
3. **Web:** `vehicleScreen.js` rebuilt around the band, strip and cards;
   `theme.js`; `style.css` (reusing the Implement screen's rig tile and
   the Harvester band where they fit); the wide Engine in the Drive grid
   (`theme.css`), for every screen.
4. **Removed:** the readout card's speed arc, the vehicle card, the
   condition tiles row, the implements rows and the Implement group on
   this page.

5. **Revision 2** (web only): the `loader` detector and `hasLoader`'s
   new rule, the Loader screen and Vehicle's Loads, the strip's tap.

Risks:
- The pick changes the page while you drive (coupling a bucket on the
  Vehicle tab switches to Loader): wanted, but the first time the page
  moves without a change of vehicle.
- Finding the target scans the farm's vehicles; done at the 500 ms
  topic's rate, only with a loader in the rig, and only within 15 m.
- The tally reads a bucket's level at 500 ms; a quick dump still shows as
  above 50% then under 5%, but two loads within half a second count as one.
- Pallets are vehicles; a pallet on the ground near you could be "nearest"
  if it accepts the fill type. Pallets are left out as targets.

## Acceptance

Automated (written before the code):
- [x] `mod/tests/run.lua`: rig entries carry `joint` from the joint's type
  name; none for the vehicle.
- [x] `mod/tests/run.lua`: `carried` lists mounted pallets and bigbags with
  fills, absent with nothing mounted.
- [x] `mod/tests/run.lua`: `target` is the nearest farm vehicle within 15 m
  that allows the fill type; not in the own rig, not a pallet, not another
  farm's; the last one stays `stale` out of range.
- [x] `web/test.html` "vehicle screen: band": job, model and hours, speed
  with gear and direction, fuel and DEF range, wear's orange, Engine hot.
- [x] `web/test.html` "vehicle screen: rig strip": driving order, links
  named by joint, solid / dashed, tap selects; "Nothing
  attached".
- [x] `web/test.html` "vehicle screen: load card": bucket, pallet, bigbag,
  several, Empty; Loads without a loader.
- [x] `web/test.html` "vehicle screen: tally": a bucket's dump counts once,
  a pallet leaving counts, mass per fill type, Reset.
- [x] `web/test.html` "vehicle screen: target": meter, "≈ n more loads",
  Full, out of range, none yet; full width Load without a loader.
- [x] `web/test.html`: the column has no Implement group, Drive shows
  Cruise − / Cruise / Cruise +.
- [x] Replay in the browser pane at 1180×820, day and night: loader with a
  bucket by a trailer, pallet forks, a seeding rig without a loader;
  nothing overflows, touch targets 48 px or more.

Automated, revision 2:
- [x] `web/test.html` "loader pick": the Merlo (telehandler), the L90H
  (wheel loader), a skid steer, a forklift, a tractor with a bucket,
  with forks, with a bigbag lifter → Loader; a tractor with a front
  loader and no tool, a forage wagon, a seeder, a truck, a combine → not.
- [x] `web/test.html` "loader pick: when": on the Vehicle tab the page
  follows the pick (Loader, Vehicle, Harvester); on the Map tab nothing
  moves and the Vehicle tab opens on the new page; a page chosen from
  the menu stays until the pick changes; setting off: no pick.
- [x] `web/test.html` "tab name": the Vehicle tab reads "Vehicle",
  "Vehicle · Harvester", "Vehicle · Loader" (also while another tab is
  shown), with the chevron; Map has neither.
- [x] `web/test.html` "tap selects": a tap on a strip tile sends
  `implement.select` with its id; no `showscreen` event.
- [x] `web/test.html` "vehicle page" and "theme: the Vehicle screen's
  slots": Vehicle has Loads and no Target; Loader both cards; Loader
  with no loader shows Loads.
- [x] Replay in the browser pane at 1180×820, day and night: Loader with
  a bucket, then the bucket swapped for a seeder while on the tab (the
  page turns to Vehicle, Loads full width); nothing overflows, touch
  targets 48 px or more.

Live check (mod 0.8.6; a tractor with a front loader, a bucket, pallet
forks and a bigbag lifter; a trailer and a seeder nearby; the spike is
done):
- [x] The rig strip's links name the couplings the game uses.
- [x] The bucket's fill type and litres match the game's HUD.
- [x] A pallet and a bigbag on the loader show their content.
- [x] The target is the trailer or seeder you're filling, its level
  matches the game, and "≈ n more loads" is right after one more load.
- [x] The tally counts each bucket dumped and each pallet set down once.
- [x] Fuel range is close to what the game's usage says.
- [x] A tap on a rig tile selects that tool in game and opens Implement
  (revision 1; revision 2 no longer opens Implement).
- [x] Engine hot shows once the engine reaches 100 °C.
- [x] DEF shows a range after a few minutes of work.
- [x] On the Merlo (electric) the band says Battery.
- [x] The L90H's bucket tile has one bar (its second unit hidden).
- [x] A bag on the bigbag lifter: the lifter is the tool, the strip's
  link reads Hook, the seeder is the target; emptied into the seeder and
  set down, the tally counts its 1,000 L once.
- [x] Bags hung on bare tines: "Nothing mounted", no target.

Live check, revision 2 (no mod change: reload the dashboard):
- [x] Get into the Merlo, then the L90H: the Vehicle tab opens on Loader.
  A tractor with a seeder: Vehicle.
- [x] In a tractor with a front loader, on the Vehicle tab: couple the
  bucket and the page turns to Loader; drop it and it turns back.
  The same on the Map tab: the Map stays.
- [x] The Vehicle tab names its page ("Vehicle · Loader") on the tablet,
  and the chevron's tap opens the menu as before.
- [x] A tap on the Merlo's tile, then on the bucket's: each is selected
  in game, and the page doesn't move.
- [x] Loader chosen from the tab's menu on a tractor with a seeder
  stays until you get into another vehicle.

## Decisions

- Revision 1: the page stays "Vehicle", the default for everything but
  combines; specialized pages win when they exist (Vincent, 2026-10-25).
  Revision 2 made it Loader, picked by itself (Vincent, 2026-10-26).
- Links between rig tiles name the coupling (Vincent, 2026-10-25, from the
  Implement screen's first canvas).
- Target is the nearest vehicle, not a pinned one (Vincent, 2026-10-25).
- Pallets and bigbags get a spike first (Vincent, 2026-10-25).
- The tally is in (Vincent, 2026-10-25); it counts from when the page
  opens, across vehicles, until Reset.
- Engine moves to the column's Drive group, as on Harvester.
- Engine is two columns wide in Drive, on every screen that shows it
  (Vincent, 2026-10-25, canvas comment).
- The target's distance runs from the vehicle you drive, not the tool or
  the load (Vincent, 2026-10-26).
- Front loaders and their tools have no lowered or raised: the dashboard
  never shows one for them (Vincent, 2026-10-26, while testing).
- Coupling a loader tool while on the Vehicle tab turns the page to
  Loader at once; a tractor with a front loader but no tool gets Vehicle
  (Vincent, 2026-10-26).
- Until it gets its own spec, the plain Vehicle page is the band, the
  strip and the Loads card (Vincent, 2026-10-26). Vincent wants it to
  become one card per attached tool with all its controls; how it divides
  the work with the Implement tab (spec 0003) is decided later.
- As built: `hasLoader` (vehicleScreen.js) is the rule, used by the
  detector and the cards, instead of the drafted `isLoaderVehicle` and
  `loaderRig` in selectors.js. Its old rule took any implement whose
  category says LOADER, so a front loader with no tool, or a forage
  wagon ("loaderWagons"), made a loader rig; both now don't.

## Out of scope / open questions

- Work lights (front and rear) as separate column buttons: only if the
  game exposes them separately; check in the spike.
- The same links on the Implement tab's rig band: likely, in a later fix.
- Filling from silos and fill triggers (the target is a vehicle only).

## Log

- 2026-10-25: drafted from the brainstorm with Vincent: Vehicle stays the
  default page, links between rig tiles, nearest target, a spike for
  pallets and bigbags, the tally. Waiting for approval.
- 2026-10-25: canvas mock-up: a loader with a bucket by a trailer and a
  seeding rig without a loader, by day and at night, at 1180×820.
- 2026-10-25: canvas comments from Vincent: the column's groups had boxes
  the other screens don't have (removed, buttons now 80 px as in the app);
  the wide Engine goes on every screen (Behaviour, Decisions); the model
  was on the band and on its tile, now on the tile only, with the hours.
- 2026-10-25: canvas rebuilt on the new design system
  ([FS25 Companion](https://claude.ai/artifact/LBCPbVhewCFvKcYyEFE9GH)):
  the app's frame, column, rig, cards and icons as its components. It
  corrected two things the hand-made boards had wrong: the selected rig
  tile is all yellow (not a yellow border) and the page gaps are 12.
- 2026-10-25: approved by Vincent, with the tally kept across vehicles
  until Reset; build not started.
- 2026-10-26: built (mod 0.8.5). The spike's probes are written but not
  run: the mod reads the names in the Data contract table, all guarded, so
  the spike and the live check can go together. Automated: 5 new Lua tests
  (pytest 104 passed) and 16 new checks in `web/test.html` (251, all
  green); the old readout card and vehicle card are gone with their tests,
  and the condition tiles and implement rows left this page. Replay
  checked in the browser pane at 1180×820, day and night (a loader with a
  bucket by a trailer, pallet forks with Engine hot, a seeding rig) and
  in portrait: no overflow, every button 48 px or more, a tile's tap
  opens Implement. Settled while building (now in Behaviour and the Data
  contract): the direction comes from the gear's name; DEF's usage from
  its level's drop (DEF now to 0.01 L); Engine hot falls back to 100 °C
  without a game level; a tool that doesn't lower has a solid link; tool
  tiles keep the Implement tab's "Working · Lowered"; a loaded tool's tile
  shows its load; Loads shows the rig's mass, as there's no rig limit in
  the data; Reset is a column-style button. The column's controls carry
  `data-control`, so Engine is two columns wide on Map, Vehicle and
  Harvester.
- 2026-10-26: spike, first report (Vincent: a Merlo EW25.5-90 telehandler
  with an Albutt Pallet Fork, a Corteva Solid Fertilizer pallet on it).
  The joint registry holds 24 names (implement, trailer, trailerLow,
  trailerSaddled, trailerCar, telehandler, frontloader, loaderFork,
  semitrailer, semitrailerHook, semitrailerCar, attachableFrontloader,
  wheelLoader, manureBarrel, cutter, cutterHarvester, cutterTrailer,
  skidSteer, conveyor, hookLift, bigBag, train, injectorToolCarrier,
  premosBaleShredder); the forks hang on the telehandler by "frontloader".
  `dynamicMountedObjects` is keyed by the pallet, `isPallet` is true, its
  fills read as everywhere; `getFillUnitAllowsFillType` and
  `getFillUnitFreeCapacity` answer. The telehandler itself has
  `spec_dynamicMountAttacher` too, so without a tool it counts as its own
  loader's tool. Nothing within 15 m took fertilizer, so the target wasn't
  seen. The Merlo is electric (Vincent): its temperature has no warning
  level (only value, valueMin 20, valueMax 120; the fan on at 95 °C, off
  at 85), but that says nothing yet about a diesel's; a dump in a diesel
  tractor settles it. Found for the code: the link names miss
  "cutterTrailer" (reads Header, should be Drawbar) and "bigBag" (reads
  Front or Rear); on an electric vehicle the band's "Fuel" is the battery
  and should say so. Still to see: a bucket (`spec_shovel`), a bigbag on a
  lifter, a target, a diesel's temperature.
- 2026-10-26: spike, second report (the Merlo's pallet fork with two
  Lizard Seeds bigbags hanging on the tines by their straps, a Pöttinger
  Aerosem VT 5000 DD 4.3 m away). The fork's `dynamicMountedObjects` and
  `pendingDynamicMountObjects` are empty: the bags hang by physics, not a
  mount. Each bag is its own vehicle (typeName bigBag, `isPallet` true,
  `spec_bigBag` with its strap joint, `spec_mountable`,
  `spec_fillTriggerVehicle`: it fills what's under it), 1,000 L of seeds,
  0.5 m from the fork. So the mod sends no `carried` and, with no carried
  fill type, no target. Decided with Vincent: don't guess from distance;
  next, look at the bags' `spec_mountable`.
- 2026-10-26: fix from Vincent's testing: front loaders and their tools
  have no lowered or raised, so the dashboard never shows one for them
  (Behaviour, Decisions). `isLoaderGear` and `lowersInRig` in
  selectors.js, used by the Vehicle strip, the Implement tab's tiles and
  card, Lower, Lower all, the implement rows, the job and the worked
  area. Web only, no mod change. 6 new checks in `web/test.html` (257,
  all green); pytest 104.
- 2026-10-26: spike, third report (the Merlo with a Quicke BIG BAG LIFTER
  - DUAL, two Lizard Seeds bigbags hooked on it, the Pöttinger Aerosem VT
  5000 DD 5–7 m away). Here the game does record the load: the lifter
  hangs on the Merlo by "frontloader" (typeName implement, no
  `spec_dynamicMountAttacher`, no `spec_shovel`), and each bag hangs on
  the lifter by joint type "bigBag" as an attached implement, so the bags
  are rig members with `spec_bigBag`, `isPallet` and 1,000 L of seeds each.
  The mod lists them as `carried` (rig members that are pallets or
  bags). The seeder's first unit answers `getFillUnitAllowsFillType` for
  seeds (1,400 L free); its fertilizer unit doesn't: so the target is
  the seeder, from what the game says. With the build as it is: the
  loader's tool is the Merlo itself (it has a dynamic mount; the lifter
  has neither spec), so the distance runs from the Merlo (7.0 m; from the
  bags 5.4–5.7 m).
  To fix, with the others found so far (after the bucket and diesel
  reports):
  1. link names: "cutterTrailer" reads Drawbar; "bigBag" gets a name of
     its own ("Hook" proposed), not Front / Rear;
  2. on an electric vehicle the band's "Fuel" says "Battery";
  3. mod: the target's distance from the controlled vehicle, always
     (Vincent: keep it simple; the Merlo here, 7.0 m), and the target is
     looked for when something is carried too, not only with a bucket or
     forks (a tractor's front loader with a bigbag lifter has neither);
  4. web: a carried bag or pallet in the rig is never the loader's tool:
     today the bag matches the tool pattern, so the card would name it
     the tool and the tally would count its emptying as a bucket's dump,
     then count it again when it's set down;
  5. tally: a carried bag or pallet counts what it held at the most, so a
     bag emptied into the seeder and set down counts its 1,000 L, not 0;
  6. forks with nothing mounted say "Nothing mounted", not "Empty"
     (settled by spike 0.0.3, below);
  7. the three guessed temperature fields go: the game has no warning
     level, Engine hot goes by 100 °C (the fan comes on at 95 °C).
- 2026-10-26: spike, fourth and last report (a Volvo L90H wheel loader,
  diesel with DEF, its General Purpose Bucket full of potatoes beside a
  Fliegl ASW 271 hitched to a Versatile Nemesis 255 CVT). The bucket
  (typeName shovelLeveler, `spec_shovel`) hangs by "wheelLoader" (reads
  Tool); it holds 3,102 L of potatoes in its first unit and has a second,
  empty one of 3,100 L (to see live whether the game hides it from the
  HUD; if not, the bucket's tile shows two bars). The trailer's unit
  answers that it takes potatoes, 29,500 L free; the tractor pulling it
  doesn't. From the L90H, 4.1 m: so the target is the trailer, ≈ 10 more
  loads. Its weight: max 24 t, 16.3 t available. The L90H's temperature
  table is the electric Merlo's (value, valueMin 20, valueMax 120): no
  warning level for diesels either. Its typeName is "tractor"; its shop
  category makes it a loader. With this, the spike is done; the bags'
  `spec_mountable` (fix 6) is the only probe left open.
- 2026-10-26: spike 0.0.3, bags on bare tines again (the Merlo's pallet
  fork, two Lizard Seeds bigbags, the Aerosem 4.5 m away). The fork's
  mounts and pending mounts are empty; each bag's `spec_mountable` holds
  the same fields as the seeder's or a tractor's (its component node,
  force limits, empty lock positions and listeners), nothing that names
  the fork, and none of the mount getters answer. The game doesn't record
  what a strap-hung bag hangs on, so it isn't carried (Behaviour, Only
  what the game records); fix 6 stands. `showOnHud` is true on the bags'
  and the seeder's units; the bucket's second unit is still to dump.
- 2026-10-26: spike 0.0.3, the L90H's bucket with 2,498 L of potatoes
  (the Fliegl now holds 9,992 L, 19,508 L free, 4.4 m away). The
  bucket's first unit has `showOnHud` true. The second (3,100 L, empty)
  came back with none, as did the Versatile's diesel, DEF and air: the
  spike wrote a false as nothing (fixed in the spike, same version).
  FillUnit loads `showOnHud` as true unless the vehicle's file says
  false, and Vincent's HUD shows one unit, so the second is hidden; the
  mod already skips hidden units, so the bucket's tile has one bar. To
  confirm in the live check.
- 2026-10-26: the 7 fixes from the spike, built (mod 0.8.6, installed):
  1. links: "cutterTrailer" reads Drawbar, "bigBag" reads Hook;
  2. an electric vehicle's Fuel reads Battery;
  3. mod: the target's distance runs from the controlled vehicle, and a
     target is looked for when something is carried too (a bigbag lifter
     has no bucket or forks);
  4. web: a carried bag or pallet in the rig is never the loader's tool,
     so the lifter is the tool and the bag's emptying isn't a dump;
  5. tally: a carried bag or pallet counts what it held at the most;
  6. forks or a hook with nothing mounted read "Nothing mounted";
  7. mod: the guessed temperature fields and `temperatureWarning` are
     gone; Engine hot goes by 100 °C.
  Also fixed: the Load card kept "Empty" when the tool changed but the
  load stayed empty (its redraw check left the tool out). Lua: a new test
  for a bag on a lifter, the target test measures from the tractor, the
  temperature test checks nothing is sent (pytest 104). `web/test.html`
  259, all green (joint names, Battery, Engine hot at 100 °C, Nothing
  mounted, a bag on a lifter). Live check boxes added for these.
- 2026-10-26: live check passed, all 13 boxes confirmed by Vincent (mod
  0.8.6; the Merlo EW25.5-90 with forks and a bigbag lifter, the Volvo
  L90H with its bucket, a Fliegl trailer and a seeder). "Fuel" on the Merlo turned out to be a dashboard tab
  opened before the update; a reload showed "Battery". The game API
  names in the Data contract table are moved to DONE.md. Status:
  live-checked.
- 2026-10-26: revision 2 drafted with Vincent: the page is a loader
  page, so it becomes Loader, picked by itself like Harvester; a plain
  Vehicle page for everything else; a tap on a tile selects and no longer
  opens the Implement tab. The Implement tab gets its own spec (0003).
  Waiting for approval.
- 2026-10-26: Vincent's answers: Loader at once on coupling a loader
  tool; a front loader with no tool gets Vehicle; the plain Vehicle page
  keeps the Loads card until its own spec. No open questions left.
- 2026-10-26: revision 2 approved by Vincent; build not started.
- 2026-10-27: revision 2 built (web only, no mod change): the Loader
  screen with its own pick, a plain Vehicle page with Loads, a tap on a
  tile no longer opens Implement. `web/test.html` 262, all green (3 new
  checks, 2 changed); pytest 104. Replay checked at 1180×820, day and
  night. Live check open.
- 2026-10-27: the Vehicle tab names the page it opens on ("Vehicle ·
  Loader"), with a chevron for its menu (Vincent, from the Harvester
  canvas); render.js `setPick`. `web/test.html` 263, all green; replay
  checked by day and night.
- 2026-10-27: revision 2 live-checked: Vincent confirmed all 5 boxes (the
  pick for the Merlo, the L90H and a seeder; a bucket coupled and dropped
  on the Vehicle tab and on the Map; the tab's name and menu; a tap only
  selects; a page chosen from the menu stays). No new game API names.
  Status: live-checked.
