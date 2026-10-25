# 0002: Vehicle screen

Status: approved
Mod: 0.8.5 · Started: 2026-10-25 · Design: [THEMES.md, Vehicle screen](../docs/THEMES.md#t4-vehicle-screen)
(revised by this spec),
canvas [FS25 Companion: Vehicle screen](https://claude.ai/artifact/UCGXbQrd4gTozRk67NcnWw)

## Goal

The Vehicle tab's default page: good at everything, and second best to
the specialized pages (Harvester, the Implement tab). It answers "what is
my machine, what is hitched to it, and what am I handling". Road driving
belongs to the Map, field work to the Implement tab, so this page is tuned
for yard work with a loader: what's on the loader, how full the thing
you're filling is, how many more loads it takes, and what you've moved so
far. It drops what the Implement tab already does (per-tool buttons,
implement rows), the same clean-up as spec 0001's revision 2.

## Behaviour

- **Picking the screen:** as now. The Vehicle tab shows this page (the menu's
  "Vehicle", formerly "Tractor") for everything except a combine, which
  gets Harvester (spec 0001). The tab's menu and Screen for what I drive
  are unchanged.
- **Layout (1180×820):** the band with the rig strip under it, both on one
  readout card (as the Implement tab's rig band); under that, two
  cards side by side, Load (left) and Target (right). The control column
  on the right, as on every screen. No vehicle card, no Show on map (the
  bottom nav opens the Map), no condition tiles row, no implement rows.
- **Band:** on the left, the job (the model is on the vehicle's rig tile
  only, its state line ends with the operating hours: "PTO on · 1,240 h").
  On the right, always shown:
  - speed, with the gear and the direction under it ("F2 · forward",
    "R1 · reverse");
  - fuel as a range, "≈ 5 h" at the last 5 minutes' usage, with the % under
    it; "%" only while the usage isn't known yet;
  - DEF the same way, only for engines with DEF;
  - wear, %, orange from 70% with "repair soon" under it.
  An orange chip "Engine hot" appears when the engine temperature is high
  (the game's own warning level); otherwise the temperature isn't shown.
- **The job:** an AI worker's job; else "Loading · Potatoes" while
  something is on the loader (the fill type or the pallet's content);
  else the Implement tab's job ("Seeding", "Driving", "Standing", "Parked").
- **Rig strip:** every vehicle in the rig as a tile in driving order (rear
  tools on the left, the vehicle, front tools on the right; a tool on a
  tool beside its parent), each with its icon badge (yellow while
  working), model, a state line ("Lowered · Working", "Raised", "Bucket")
  and a thin bar per fill unit. Between two tiles, a **link**: a short
  line with a chip naming the coupling, from the attacher joint:
  "3-point", "Drawbar", "Loader", "Tool" (a loader's quick coupler),
  "Header"; unknown joints read "Front" or "Rear". The link is solid while
  the tool is lowered, dashed while raised. The game's selected tool is
  the yellow tile, as on the Implement tab. A tap on a tile selects that
  tool in game and opens the Implement tab. With nothing attached, the
  strip shows the vehicle alone and "Nothing attached".
- **Load card** ("On the loader"), when the rig has a loader, a loader tool
  or the vehicle is itself a loader (wheel loader, telehandler, skid
  steer, forklift):
  - what's on it, big: a bucket's or shovel's fill type, litres and t; a
    pallet or bigbag on forks or a hook: its content ("Seed bigbag",
    "Potatoes pallet"), litres and t, one line each when there are several;
    "Empty" otherwise;
  - the tool's name and kind ("Albutt bucket · Bucket");
  - **This session** (the tally): "14 loads · 42.3 t", and one line per
    fill type under it ("Potatoes · 11 loads · 34.1 t"). A load counts when
    a bucket drops from more than 50% to under 5% of its capacity, or when
    a pallet or bigbag leaves the forks or hook. Mass from litres × the fill
    type's mass per litre. Since the page was opened; a Reset button on the
    card clears it.
  Without a loader, the card is **Loads**: every fill unit in the rig as a
  meter ("Seeds · 58% · 2,900 L"), and the rig's weight against its limit
  when Trailer Fill Limit is on.
- **Target card** (with a loader only; without one, Load takes the full
  width): the nearest vehicle that can take what you carry:
  - picked by the mod: within 15 m of the loader tool, not in your own rig,
    yours (the farm's), with a fill unit that accepts the carried fill
    type; the nearest wins. While the loader is empty, the last carried
    fill type counts, so the target stays while you fetch the next load;
  - its model, category and distance ("Väderstad Spirit 600C · Seeders ·
    6 m"), a big meter for the unit that takes the fill type, "3,200 /
    5,000 L", and its weight against the limit for a trailer;
  - **"≈ 2 more loads"**: free space ÷ what you carry now (else the last
    load), rounded up; "Full" (green chip) when it's at capacity or the
    weight limit;
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
    for the vehicle itself and when unknown.
  - `carried[]`: objects mounted on any rig member's dynamic mount (forks,
    hooks), each `{id, name, pallet: bool, bigBag: bool, fills[]}` (fills
    as everywhere, with `massPerLiter`). Absent when nothing is mounted.
  - `target`: `{id, name, category, distance (m, 1 decimal), fillType,
    fills[] (the accepting unit only), massLimit}` as picked above.
    Absent when nothing qualifies and nothing was picked before; `stale:
    true` when it's the last target out of range.
  - `temperatureWarning: bool` beside `engineTemp`, if the game has a
    warning level (spike).
- **Backend:** nothing new (topic models take extras).
- **Web:**
  - `web/src/widgets/vehicleScreen.js`: `vehicleBand`, `rigStrip`,
    `loadCard`, `targetCard`; the tally (`createTally`) and the range
    (`fuelRange`).
  - `web/src/data/rates.js`: the fuel usage over 5 minutes.
  - `web/src/themes/newholland/theme.js`: the Vehicle screen definition.

| Name | Where from | State |
|---|---|---|
| `AttacherJoints.jointTypeNameToInt` (read backwards for a name) | AttacherJoints.lua, registerJointType | unverified (spike) |
| `spec_dynamicMountAttacher.dynamicMountedObjects` (keys are the objects) | DynamicMountAttacher.lua | unverified (spike) |
| `object.isPallet` | Pallet.lua | unverified (spike) |
| `spec_bigBag` on a bigbag, and how a lifter holds it | BigBag.lua | unverified (spike) |
| `getFillUnitAllowsFillType(index, fillType)` | FillUnit.lua | unverified (spike) |
| `getFillUnitFreeCapacity(index, fillType, farmId)` | FillUnit.lua | unverified (spike) |
| the engine's temperature warning level | Motorized.lua | unverified (spike) |
| `fillType.massPerLiter` | FillTypeManager | verified (DONE.md, Harvester screen) |
| attacher joint front / rear (`jointTransform` z) | AttacherJoints.lua | verified (PLAN.md, C3) |

## Commands

One new use of an existing one: a rig tile sends `implement.select` with
its id (as the Implement tab's tiles) and opens the Implement tab. Cruise
−, Cruise, Cruise +, Engine and AI worker as on Harvester. Reset (the
tally) is local to the page.

## Plan

1. **Spike** (`spike/FS25_CompanionSpike`, `controlledDetail`): per rig
   member, the joint type number and its name; `dynamicMountedObjects`
   with each object's typeName, `isPallet`, specs and fills; a bigbag on
   a lifter (what holds it); for the 5 nearest vehicles, their fill units
   and `getFillUnitAllowsFillType` for the carried type; Motorized's
   temperature fields. Vincent runs it: a pallet on forks, a seed bigbag
   on a lifter over a seeder, a bucket of potatoes by a trailer.
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

Risks:
- Finding the target scans the farm's vehicles; done at the 500 ms
  topic's rate, only with a loader in the rig, and only within 15 m.
- The tally reads a bucket's level at 500 ms; a quick dump still shows as
  above 50% then under 5%, but two loads within half a second count as one.
- Pallets are vehicles; a pallet on the ground near you could be "nearest"
  if it accepts the fill type. Pallets are left out as targets.

## Acceptance

Automated (written before the code):
- [ ] `mod/tests/run.lua`: rig entries carry `joint` from the joint's type
  name; none for the vehicle.
- [ ] `mod/tests/run.lua`: `carried` lists mounted pallets and bigbags with
  fills, absent with nothing mounted.
- [ ] `mod/tests/run.lua`: `target` is the nearest farm vehicle within 15 m
  that allows the fill type; not in the own rig, not a pallet, not another
  farm's; the last one stays `stale` out of range.
- [ ] `web/test.html` "vehicle screen: band": job, model and hours, speed
  with gear and direction, fuel and DEF range, wear's orange, Engine hot.
- [ ] `web/test.html` "vehicle screen: rig strip": driving order, links
  named by joint, solid / dashed, tap selects and opens Implement; "Nothing
  attached".
- [ ] `web/test.html` "vehicle screen: load card": bucket, pallet, bigbag,
  several, Empty; Loads without a loader.
- [ ] `web/test.html` "vehicle screen: tally": a bucket's dump counts once,
  a pallet leaving counts, mass per fill type, Reset.
- [ ] `web/test.html` "vehicle screen: target": meter, "≈ n more loads",
  Full, out of range, none yet; full width Load without a loader.
- [ ] `web/test.html`: the column has no Implement group, Drive shows
  Cruise − / Cruise / Cruise +.
- [ ] Replay in the browser pane at 1180×820, day and night: loader with a
  bucket by a trailer, pallet forks, a seeding rig without a loader;
  nothing overflows, touch targets 48 px or more.

Live check (mod 0.8.5; a tractor with a front loader, a bucket, pallet
forks and a bigbag lifter; a trailer and a seeder nearby):
- [ ] The rig strip's links name the couplings the game uses.
- [ ] The bucket's fill type and litres match the game's HUD.
- [ ] A pallet and a bigbag on the loader show their content.
- [ ] The target is the trailer or seeder you're filling, its level
  matches the game, and "≈ n more loads" is right after one more load.
- [ ] The tally counts each bucket dumped and each pallet set down once.
- [ ] Fuel range is close to what the game's usage says.
- [ ] A tap on a rig tile selects that tool in game and opens Implement.

## Decisions

- The page stays "Vehicle", the default for everything but combines;
  specialized pages win when they exist (Vincent, 2026-10-25).
- Links between rig tiles name the coupling (Vincent, 2026-10-25, from the
  Implement screen's first canvas).
- Target is the nearest vehicle, not a pinned one (Vincent, 2026-10-25).
- Pallets and bigbags get a spike first (Vincent, 2026-10-25).
- The tally is in (Vincent, 2026-10-25); it counts from when the page
  opens, across vehicles, until Reset.
- Engine moves to the column's Drive group, as on Harvester.
- Engine is two columns wide in Drive, on every screen that shows it
  (Vincent, 2026-10-25, canvas comment).

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
