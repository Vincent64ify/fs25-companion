# Verified game API facts

What FS25's Lua API does, as seen in the running game. The mod is built on
these. A game name that isn't here is unverified: it goes through the
guards in `mod/src/Api.lua`, and a spec's Data contract table says so.

- A fact goes in once a live check confirms it: under
  [Verified since Phase 0](#verified-since-phase-0), newest last, with the
  vehicle, the date and the spec.
- The spec has the story: why it was checked and what it changed.
- The probes and their raw dumps are in [research/](../research/README.md)
  and `mod/tests/fixtures/spike*/`.

Contents:
- [Phase 0](#phase-0-spike-on-solek-windows-2026-10-20): the runtime, file
  I/O, heading, the map, hotspots, fields, farmlands, vehicles
- [Phases 3 and 4](#phases-3-and-4-as-built-2026-10-20): what the PDA
  layers and the fields read
- [Controls C0 to C3](#controls-c0-to-c3-2026-10-24): the command channel,
  input actions, selecting a tool
- [Verified since Phase 0](#verified-since-phase-0): everything after, by
  date
- [The Implement screen's readings](#the-implement-screens-readings-mods-080-to-082-2026-10-24-and-25)
- [Not verified yet](#not-verified-yet)

---

## Phase 0 (spike on Solek, Windows, 2026-10-20)

**Runtime**
- The scripting language is **Luau**, not Lua 5.1.
- `coroutine`, `debug`, `os`, `jit` are all nil.
- Metatables are hidden: class names and method lists can't be enumerated. Methods are still callable by name, for example `h:getCategory()` and `h:isa(Class)`.
- Consequence: time-sliced jobs must be explicit cursor state machines advanced from `update(dt)`, not coroutines. There is no traceback, so `pcall` with an error string is all we get.

**File I/O**
- `io.open(path, "w")` + `write` + `flush` works. `stream.ndjson` ran 5.4 minutes with 1,579 lines, 0 corrupt, contiguous `seq`, steady 200 ms spacing.
- File handles have **no `read` method**, so the mod is write-only. That's fine: it only writes.
- `g_modSettingsDirectory` = `<profile>/modSettings/` and `getUserProfileAppPath()` = `<profile>/`.
- **Verified live:** Python reads the file while FS25 holds it open. Over 3 s it saw 15 new complete lines; there is no file lock on Windows.
- **Later:** rotation (a `"w"` reopen truncates) was verified live, see [Verified since Phase 0](#verified-since-phase-0). macOS is still to test.

**Heading** (verified)
- `heading = atan2(dx, -dz)` in degrees, normalized to 0..360, with 0 = north (−Z) and clockwise.
- Vehicles: forward vector from `localDirectionToWorld(rootNode, 0, 0, 1)`. Matches the travel direction with a 0.3° median error.
- Player: `g_localPlayer.rootNode` never rotates (always +Z, which is why the old on-foot reading was a constant 180°). Use `g_localPlayer:getCurrentFacingDirection()`, which returns `(dx, dz)` = `(sin yaw, cos yaw)`. `getYaw()` gives the same angle.
- Other player methods: `getPosition()` returns `x, y, z`; also `getIsInVehicle()`, `getCurrentVehicle()`, `getSpeed()`, `farmId`.

**Map / overview**
- `missionInfo.map` has `id` (= mapId), `title`, `baseDirectory`, `mapXMLFilename`, `isModMap`.
- The overview image filename is read by the client from `<baseDirectory>/<mapXMLFilename>` (`imageFilename`), reusing the import_map.py parser.
- `g_currentMission.terrainSize` = 2048.
- `hud.ingameMap` has `worldSizeX/Z` (2048), `worldCenterOffsetX/Z` (1024), and **`mapExtensionScaleFactor` (0.5) / `mapExtensionOffsetX/Z` (0.25)**. Send these in `hello`; they replace the hard-coded `overviewSpanFactor = 2`.

**Hotspots**
- `hud.ingameMap.hotspots` holds 352 entries, each with `worldX`, `worldZ`, `name`, `ownerFarmId`, `isVisible`, `getCategory()` and `getWorldPosition()`.
- Category constants come from `MapHotspot.CATEGORY_*`: FIELD 1, ANIMAL 2, MISSION 3, TOUR 4, STEERABLE 5, COMBINE 6, TRAILER 7, TOOL 8, UNLOADING 9 (sell points), LOADING 10, PRODUCTION 11, SHOP 12, DEFAULT/OTHER 13, AI 14, PLAYER/MAP_UTILITY 15.
- The observed mix: 189 field, 108 other, 19 loading, 13 unloading, 9 production, 4 shop, 5 animal, plus vehicles and player.
- Display names: `h:getName()` works on placeable hotspots (sell points, productions, shops, animal pens, NPCs: "Mill", "Bakery", "Cow Barn"). The `MapHotspot` base class has no `getName`; farmland hotspots carry their number in the `name` field.
- `isVisible` / `getIsVisible()` is false for placeables owned by farm 15 (pre-placed, not bought yet) and for most unnamed OTHER hotspots. The PDA doesn't draw them.
- `MapHotspot` itself is enumerable (its `CATEGORY_*` constants and methods were listed), unlike the instances.

**Fields**
- `g_fieldManager.fields` holds 162 fields.
- Each field has `getId()`, `posX/posZ`, `areaHa`, `farmland` (table), **`densityMapPolygon.pointsX/pointsZ`** (a ready-made outline, so no sampling is needed), and `fieldState` with `fruitTypeIndex`, `growthState`, `groundType`, `limeLevel`, `plowLevel`, `sprayLevel`, `weedState`, `stoneLevel`, `ownerFarmId`.

**Farmlands**
- `g_farmlandManager.farmlands` holds 189 entries with `id`, `farmId`, `isOwned`, `price`, `areaInHa`, `boundingBox`, `xWorldPos/zWorldPos` and `name`.
- `getFarmlandIdAtWorldPosition` takes 7.4 ms per 10,000 calls, so a 512² grid at 4 m costs about 200 ms total. Slice it at ≤5 ms per frame. ID **255 = no farmland**.

**Vehicles**
- `g_currentMission.vehicleSystem.vehicles` returns `id`, `uniqueId`, `typeName`, `getFullName()`, `getOwnerFarmId()`, `getIsAIActive()`, `propertyState`, `rootNode` and `spec_*`.

**Crop colours**
- `g_fruitTypeManager.fruitTypes[i]` has `defaultMapColor` and `colorBlindMapColor`: the PDA's own crop colours. Send them once in a `types` topic.

## Phases 3 and 4, as built (2026-10-20)

What the mod's collectors read for the PDA layers and the fields. They run
live on Solek and Kinlaig; what's still to confirm is under
[Not verified yet](#not-verified-yet).

- **Phase 3, the mod.** `hotspots` (10 s) sends every PDA hotspot except fields, vehicles, AI and the player, with category, name, position, owner farm and `visible`. `vehicles` (2 Hz) now lists every vehicle in `vehicleSystem.vehicles`, adding `motorized`, `attached` (from `getAttacherVehicle()`, unverified and guarded), `speed` and `propertyState`. Only the controlled vehicle keeps the dashboard detail. `farmlands` (10 s) sends id, owner farmId (0 = none), price, area, centre and `listed` (`showOnFarmlandsScreen`). `farmland_grid` is sent once per map: a cursor job of 4,096 lookups per frame samples `getFarmlandIdAtWorldPosition` on 4 m cells (at most 512 a side) and sends the grid run-length encoded (about 85 KB on a 2 km map).
- **Phase 4, mod 0.4.0.** Three collectors. `field_outlines` (once per map, resent after a rotation): each field's outline from its `polygonPoints` nodes through `getWorldTranslation`, falling back to `densityMapPolygon.pointsX/Z`. `fields` (15 s): id, farmland, sign position, area and the game's `fieldState` values (fruit, growth, ground type, spray, lime, plow, roller, stubble, weeds, stones). `crop_types` (once): every fruit type with its PDA map colours (`defaultMapColor`, `colorBlindMapColor`) and growth thresholds (harvest, withered, cut, preparing), the `FieldGroundType` names (guarded) and the field manager's lime/plow/spray maximums. Field state and ownership are separate: the owner comes from the farmlands topic.

## Controls C0 to C3 (2026-10-24)

What the Controls project found before the specs started. How a command
travels today is in [ARCHITECTURE.md](ARCHITECTURE.md#commands).

### C0: the command channel

The spike is `FS25_CommandSpike`
([research/spike](../research/spike/README.md#command-spike-c0)).

**C0 results (Windows, 2026-10-24).** The channel works:
- 50 commands, file written to ack seen: median 19 ms, p95 32 ms, max 43 ms
  (the game ran at about 90 fps).
- A file rewritten 10 times was read fresh 10 times out of 10.
- `fileExists` every frame costs 0.08–0.11 ms on average, 0.37 ms at most.
- Running an action by name works: `TOGGLE_BEACON_LIGHTS` through
  `g_inputBinding.actionEvents[<action>]` (keyed by the action, not its
  name) toggled the beacon, and `cab` showed it in the same frame. The
  direct setter (`setBeaconLightsVisibility`) works too.
- `csInput` in a tractor listed 70 active actions, among them ATTACH,
  DETACH, LOWER_IMPLEMENT, LOWER_ALL_IMPLEMENTS, TOGGLE_LIGHTS,
  TOGGLE_HIGH_BEAM_LIGHT, TOGGLE_TURNLIGHT_HAZARD / LEFT / RIGHT,
  TOGGLE_CRUISE_CONTROL, TOGGLE_MOTOR_STATE, TOGGLE_AI and
  AXIS_FRONTLOADER_ARM.
- **Never `io.open(path, "r")`:** the game warns "only write mode ('w') is
  allowed" and opens the file for writing, which empties it (seen in 0.1.1:
  every reader after it found an empty file). `io.lines` is nil.
- **Reading cost:** the first open of a new command file costs about 4 ms
  (3.3–27 ms) with either `loadXMLFile` or `XMLFile.load`; reading the same
  file again right after costs 0.06 ms. So it's the first open, not the
  reader, likely Windows scanning a newly written file.
- **Fix, verified in 0.1.2:** when the client reads its own temp file back
  before the rename, the mod's first open drops to 0.07–0.23 ms (30 of 30
  commands), against 3.5–19 ms without it. The round trip stays at a 20 ms
  median. C1 uses `XMLFile.load` (both readers cost the same) plus the
  read-back.

### C1 and C2: lights, input actions, cruise

- **Reversing (mod 0.5.2):** the reverse lights are in the same light
  mask, so Lights read "on" while reversing with the stage at 0 (seen in
  the live stream). With stages known, "on" now means a stage is on (or,
  from the mask alone, one of the stages' own lights). Confirmed live
  (Vincent, 2026-10-24).

As C2 was built (mod 0.6.0). Since
[spec 0009](../specs/0009-one-way-to-run-each-action.md) every action
presses the game's key, and the mod runs only three setters (the cruise
set speed, select and detach):

- Input action names come from the game's own `inputBinding.xml`: fold is
  `IMPLEMENT_EXTRA2` (X), turn on `IMPLEMENT_EXTRA` (B), lower
  `LOWER_IMPLEMENT` (V), attach / detach `ATTACH` (Q) / `DETACH`, cruise
  speed the axis `AXIS_CRUISE_CONTROL`. There is no `IMPLEMENT_FOLD`.
- Mod: every action runs its input event first, as the key does (the
  implement keys' events belong to the selected implement), else the
  specialization's setter (FS22 names, guarded): `setLightsTypesMask`,
  `setBeaconLightsVisibility`, `setTurnLightState`, `startMotor` /
  `stopMotor`, `setCruiseControlState`, `handleLowerImplementEvent`,
  `setFoldState(getToggledFoldDirection())`, `setIsTurnedOn`,
  `detachImplementByObject`. Cruise −/+ use `setCruiseControlMaxSpeed`
  first (one exact step), the axis second. AI has no setter. The ack's
  `via` says which ran, and log.txt gets "command <action> via <what>"
  once per path.
- Third round (mod 0.6.3): no reverse cruise speed. Live, the L90H has
  none, and the Fastrac iCON 4160 and the Valtra T195 Active (reverse
  driving position) use the main set speed in reverse; the stream showed
  `speedReverse` 33 = `maxSpeedReverse` 33, so the HUD's number while
  reversing looks like the reverse speed limit, not a set speed. Cruise
  and −/+ now always show and set the one main set speed (no "R"); a
  step goes from the number on the button. To find out what that HUD
  number is, the first time each vehicle reverses log.txt gets a
  "reverse cruise check" line: the cruise control's fields and the
  motor's speed limits (not sent to the dashboard).
- Live (Vincent, 2026-10-24): all of C2 works with 0.6.3. The reverse
  cruise check on the Volvo L90H: `speedReverse` = `maxSpeedReverse` = 46
  km/h = the motor's `getMaximumBackwardSpeed()` (12.78 m/s), so the HUD's
  number while reversing is the vehicle's top reverse speed.

### C3: the selection spike

**Selection spike results (Windows, mod 0.6.4, 2026-10-24).** JCB Fastrac
iCON 4160 with a Quicke Q6M front loader, an Albutt bucket on it and a
Pöttinger Terria 6040 cultivator at the rear:
- **Direct selection works.** `root:setSelectedObject(object)` with an entry
  of `root.selectableObjects` selected the loader at the first try, same
  frame; `getSelectedObject` and `getSelectedVehicle` then both return it.
  `currentSelection.index` is the entry's index. Also present (not tried):
  `setSelectedVehicle`, `selectVehicle`, `setSelectedImplementByObject`,
  `unselectVehicle`, `getCanBeSelected`, `updateSelectableObjects`. No
  cycle fallback is needed; G is `SWITCH_IMPLEMENT` (`_BACK` the other way).
- **The game's order** is tractor, loader, bucket, cultivator (4 entries,
  no sub-selections): the bucket is selectable on its own, so it gets its
  own tile.
- **Front or rear** from the parent's attacher joint (`jointTransform` in the
  parent's `rootNode` frame): z 0.69 loader (jointType 12), z 2.90 bucket on
  the loader (jointType 7), z −2.95 cultivator (jointType 1). z ≥ 0 is
  front.
- **Not every key follows the selection, by design.** With the loader
  selected, `LOWER_IMPLEMENT`'s event belonged to the loader (inactive),
  but `IMPLEMENT_EXTRA2` (fold) still belonged to the cultivator, so X (and
  the dashboard's Fold, which runs the same event) folds the cultivator
  without cycling to it: the game keeps an action only one tool has live
  whatever is selected. `ATTACH` / `DETACH` belong to the tractor. The
  dashboard keeps this behaviour and shows which tool each button will
  act on.

## Verified since Phase 0

- **Rotation:** reopening the stream file with `"w"` truncates it. Seen live
  on 2026-10-22: five minutes into a Kinlaig session, the file restarted
  with `hello` at seq 1868.
- **Game folder:** `getAppBasePath()` gives the game's install folder, sent
  as `hello.gameDir` (seen live on Kinlaig, 2026-10-22).
- **Paid DLC maps:** the map id is `pdlc_<pack>.<map>`, and the mod reports
  `mapDir` as `<game>/pdlc/<pack>/`. The files are actually inside
  `<game>/pdlc/<pack>.dlc`, an encrypted GIANTS archive only the game can
  read.
- **Game archives:** `<game>/dataS.gar` is encrypted the same way; the HUD,
  menu and key-glyph icons are inside it. Plain DDS files under
  `<game>/data/` are readable, among them the cab symbol sheets (see
  [THEMES.md](THEMES.md#icons)).
- **Vehicle values** (JCB Fastrac 2115, Kinlaig, 2026-10-22):
  - fuel comes from the motor's consumer fill unit:
    `getConsumerFillUnitIndex(FillType.DIESEL)`, then
    `getFillUnitFillLevel` / `getFillUnitCapacity`;
  - wear comes from `getDamageAmount()`, as for implements;
  - hours come from the vehicle's operating time, in ms.

  `spec_motorized.fuelLevel` / `maxFuelLevel`, `spec_wearable.wear` and
  `getOperationTime()` gave nothing in the first live session (Solek, Volvo
  L90H).
- **Field ground types:** the `FieldGroundType` names arrive live (for
  example "Sown").
- **Gear** (Solek, 2026-10-23): the vehicle's `getGearInfoToDisplay()`
  gives the gear's name as the speedometer shows it, its group and
  whether it's automatic; the motor's `getGear()` gave nothing.
  - Volvo L90H: "1" to "3", "N", "-1" to "-3"; not automatic, no group.
  - JCB Fastrac iCON 4160 (CVT): "D", "N", "R"; automatic.
  - Antonio Carraro Mach 4R (ranges): the range is in the name ("1H",
    "3L", "-4H"), and the group comes as well ("H", "L"), sometimes still
    the old one mid-shift.

  The dashboard shows reverse as "R1" or "R4H", and a range under the
  Gear label only when the name doesn't carry it.
- **Brand and shop category** (2026-10-23):
  `g_storeManager:getItemByXMLFilename(vehicle.configFileName)`,
  `g_brandManager:getBrandByIndex(item.brandIndex).title` and
  `getCategoryByName(item.categoryName).title` work: "JCB" and "Medium
  Tractors" (`TRACTORSM`) for a Fastrac iCON 4160, "Volvo" and
  `WHEELLOADERVEHICLES` for the L90H.
- **Season** (confirmed by Vincent, 2026-10-24): `environment.currentPeriod`
  is the month, 1 = March, sent as `env.month`; the status bar names the
  season from it (Mar-May spring ... Dec-Feb winter) and matches the game's
  calendar. The 0-based `env.season` had shown Autumn in August.
- **Engine on** (confirmed by Vincent, 2026-10-24): `getIsMotorStarted()`,
  else `isMotorStarted`. `spec_motorized.engineStarted` was always nil.
- **Positions** (confirmed by Vincent, 2026-10-24): the player marker and
  the place markers line up with the in-game map.
- **Trailer Fill Limit** (confirmed by Vincent, 2026-10-25, a PÖTTINGER
  Aerosem with seed and fertilizer): with `missionInfo.trailerFillLimit`
  on, `getMaxComponentMassReached()` matches the HUD's MAX, which stopped
  the fertilizer at 76% while the seed was full: the limit is the whole
  vehicle's mass, every unit at once.
- **A combine folds itself** (confirmed by Vincent, 2026-10-25, New Holland
  CH7.70 with a SuperFlex header): `IMPLEMENT_EXTRA2`'s live event belongs
  to the combine, not the header, and the game won't thresh until it is
  unfolded ("You first need to unfold the tool").
- **Harvester screen** (confirmed by Vincent, 2026-10-25, New Holland
  CH7.70 with a SuperFlex header, mod 0.8.4; spec 0001):
  - `fillType.massPerLiter` (FillTypeManager) is t per litre: the grain
    tank's tonnes, throughput (t/h) and the ≈ yield came out right.
  - `spec_combine.swath.isAvailable`, `.chopper.isAvailable` and
    `isSwathActive` match the game's straw setting; the `TOGGLE_CHOPPER`
    input switches it as the key does. (`setIsSwathActive`, the
    fallback, didn't run and stays unverified.)
  - `spec_combine.workedHectars` matches the HUD's total and
    `workedHectars - workedHectarsInitial` its run; the run starts at 0
    both after getting in and after loading.
  - Precision Farming's `spec_<mod>.extendedCombine` (found by its
    `extendedcombine` suffix): `lastYieldWeight`, `lastYieldPercentage`
    and `lastYieldPotential` match its yield HUD.
- **Vehicle screen** (confirmed by Vincent, 2026-10-26, the Merlo
  EW25.5-90 with forks and a bigbag lifter, the Volvo L90H with its
  bucket, mod 0.8.6; spec 0002):
  - An attacher joint's `jointType` is a number;
    `AttacherJoints.jointTypeNameToInt` read backwards names it (24
    names, e.g. implement, frontloader, attachableFrontloader,
    wheelLoader, cutterTrailer, bigBag), and the rig strip's links match
    the couplings in game.
  - `spec_dynamicMountAttacher.dynamicMountedObjects` is keyed by the
    mounted objects; a pallet has `isPallet` true. A bigbag is its own
    vehicle (`spec_bigBag`, `isPallet` true). On a bigbag lifter it is an
    attached implement by joint type "bigBag"; hung on bare tines by its
    straps it isn't recorded anywhere (`spec_mountable` empty).
  - `spec_shovel` is on a bucket (the L90H's hangs by joint type
    "wheelLoader"). A fill unit with `showOnHud` false (the bucket's
    second unit) isn't on the game's HUD.
  - `getFillUnitAllowsFillType(index, fillType)` and
    `getFillUnitFreeCapacity(index, fillType, farmId)` answer: the
    target's level and "≈ n more loads" came out right.
  - An electric vehicle's consumer fill type is `ELECTRICCHARGE` (kWh).
  - `spec_motorized.motorTemperature` has value, valueMin 20 and valueMax
    120, no warning level; the motor fan switches on at 95 °C and off at
    85.
- **Tools on the Vehicle page** (confirmed by Vincent, 2026-10-30, a New
  Holland T7.300 with a Samasz KDF 341 S front and XT 390 rear mower,
  mod 0.8.7; spec 0003):
  - Selecting a tool (`setSelectedObject`), pressing its key and putting
    the selection back acts on that tool alone, in the same frame once
    its key is live: `LOWER_IMPLEMENT`, `IMPLEMENT_EXTRA2` (fold),
    `IMPLEMENT_EXTRA` (turn on).
  - `FOLD_ALL_IMPLEMENTS` and `TURN_ON_ALL_IMPLEMENTS`, pressed once on
    the selected tool, act on every tool; fold all won't fold one lowered
    on its joint (the front mower stayed lowered and on), and turns off
    and folds one that lowers through its fold.
  - `getIsFoldAllowed` → false, "Folding is not allowed while the tool
    is lowered." while lowered on its joint, true once raised;
    `isDetachAllowed` → false, "You first need to fold up the tool
    (mower)!" on the unfolded XT 390; "Detach while folding is not
    allowed!" while a fold moves.
  - `getCanBeTurnedOn()` is false while the tool is folded or the engine
    is off. `getTurnedOnNotAllowedWarning()` on a folded mower gives the
    game's own warning: "You first need to unfold the tool (mower)!" on
    the KDF 341 S, "You first need to fold up the tool (mower)!" on the
    XT 390 (the game shows that too).
  - With the engine off, the fold, Lower and Fold all keys only get the
    game's "Please start the engine first", raising too, while
    `getIsFoldAllowed` says yes; `getIsPowered()` answers false with
    "Please start the engine first!" then, true once the engine runs
    (mod 0.8.9).
  - The XT 390 lowers through its fold (`foldMiddleAnimTime`): its own
    `LOWER_IMPLEMENT` lowers and raises it, and `LOWER_ALL_IMPLEMENTS`
    lowers both mowers (mod 0.8.8).
- **The input binding** (spikes 0.0.5 and 0.0.6, 2026-10-30, the T7.300
  with the KDF 341 S and KDD 941 STH; Vincent watched each press;
  spec 0003's Log):
  - `g_inputBinding.actionEvents[g_inputBinding.nameActions[name]]` holds
    one event per registered handler: `callback`, `targetObject`,
    `isActive`, `callbackState`, `id` (also the key into
    `g_inputBinding.events`), `triggerDown` true, `triggerUp` and
    `triggerAlways` false, `hasFrameTriggered`, `displayPriority`,
    `contextDisplayText` ("Lower/raise all tools").
    `g_inputBinding.currentContextName` is "VEHICLE" in a vehicle.
  - One handler per All key on that rig: `LOWER_ALL_IMPLEMENTS` on the
    tractor, `FOLD_ALL_IMPLEMENTS` and `TURN_ON_ALL_IMPLEMENTS` on the
    selected tool.
  - A key press calls `callback(target, actionName, 1, callbackState,
    false, false, 253, <binding>)`; calling it with the last two nil (as
    Companion does) acts the same.
  - `getIsLowered` stays true while a tool that lowers through its fold
    is still rising.
- **Lower all's timing** (spike 0.0.7 and the 0.8.14 live check,
  2026-10-30, the T7.300 with the KDF 341 S and KDD 941 STH, and a Valtra
  S 286 with a front linkage and an Aerosem VT 5000 DD; spec 0003 revision
  2): the game's `LOWER_ALL_IMPLEMENTS` runs the tractor's attacher joint
  combo, `spec_attacherJoints.attacherJointCombos`: `isRunning`,
  `direction` (-1 raising), `duration` (2000 ms on both tractors),
  `currentTime`, and `joints[]` with `jointIndex`, `time`, `initialTime`;
  each attacher joint has `comboTime` (0 or 1). The front moves at once,
  the rear the frame `isRunning` turns false, `duration` after the press
  (the KDD 2.00 to 2.03 s after the KDF, five times). A tool's own Lower
  moves it in the frame of the press. `startAttacherJointCombo` is the
  tractor's method.
- **The states a command compares** (spec 0008's live check, mod 0.10.0,
  2026-10-31: a Volvo L90H with three light stages, the T7.300 with the
  KDF 341 S and KDD 941 STH, a CH7.70 with a SuperFlex header, the
  Vestrum 100 with two EDK 650). Each read what the game did, so a
  doubled command answered `already` without pressing anything:
  - the light stage (`spec_lights.currentLightState`, else the
    `lightStates` entry matching `lightsTypesMask`); `TOGGLE_LIGHTS`
    steps 1, 2, 3, then back to off, one stage per press, read the next
    frame;
  - `lightsTypesMask` bit 8 (high beam), `beaconLightsActive`,
    `turnLightState` (left, right, hazard);
  - the engine: `getIsMotorStarted()` and `getMotorState()` with
    `MotorState.STARTING` (about 4 s on the L90H);
  - cruise control on: `getCruiseControlState()`;
  - `getIsLowered`, `getIsUnfolded`, `getIsTurnedOn`, and
    `spec_foldable.foldMoveDirection` while a fold moves (a second fold
    command answered `already`; the opposite one reversed it);
  - the pipe: `spec_pipe.targetState` (the state it moves to);
  - straw: `spec_combine.isSwathActive`;
  - tipping: `getDischargeState()`. Ctrl+I with the engine off: the game
    asks to start the engine and nothing tips.
  - Not confirmed: `getIsAIActive()` turning on, since `TOGGLE_AI`
    without a job set up does nothing.
- **A trailer's tip keys** (spike 0.0.8 and the 0.8.15 / 0.8.16 live
  checks, 2026-10-31, the Case IH Vestrum 100 with two Farmtech EDK 650;
  spec 0003 revision 3):
  - Two keys, both registered and `isActive` while the trailer is
    selected: `TOGGLE_TIPSTATE` (I, "Start overloading": into what's
    under it) and `TOGGLE_TIPSTATE_GROUND` (Ctrl+I, "Unload here"). The
    game shows one at a time and hides the other with the event's
    `displayIsVisible` false: I over a sale point that takes the load,
    Ctrl+I elsewhere. The hidden one does nothing.
  - Dischargeable's `getCanDischargeToObject(spec_dischargeable.currentDischargeNode)`
    is true only over the sale point that takes the load, also for a
    trailer that isn't selected.
  - `getDischargeState()` turns non-zero the frame tipping starts, 0
    when it stops; Ctrl+I on land not ours tips nothing (the game warns
    that we have no access), as does I over a sale point that doesn't
    take the load.
  - `TOGGLE_TIPSIDE` steps `spec_trailer.preferedTipSideIndex` through
    `tipSideCount` sides (four on the EDK 650: Back, Grain door, Left,
    Right); `spec_cover.hasCovers` is false on it.
- **The setters with no key, and the All row's keys** (spec 0009's live
  check, mods 0.11.0 to 0.11.2, 2026-10-31, the T7.300 with the KDF 341 S
  and KDD 941 STH; the game's own scripts in `debugger/gameSource.zip`):
  - `setCruiseControlMaxSpeed(speed, speedReverse)` sets the cruise
    control's speed (held Cruise − / +); `detachImplementByObject` on what
    a tool hangs on detaches it (the Vestrum's EDK 650); with
    `setSelectedObject`, the only setters the mod runs.
  - Lower all (`AttacherJoints:startAttacherJointCombo`) reverses
    `attacherJointCombos.direction` on every press, whatever the tools
    did since: after each card's Raise, a press that last lowered
    raises (nothing moved).
  - Fold all (`Foldable.actionEventFoldAll`) goes the way the tool it's
    pressed on folds next (`getToggledFoldDirection`), for it and every
    tool whose next fold goes the same way: pressed on a folded mower in
    a mixed rig, it unfolded that one.
  - Turn on all (`TurnOnVehicle.actionEventTurnOnAll`) flips every tool
    (`setIsTurnedOn(not getIsTurnedOn())`), so a mixed rig swaps.
- **A card's buttons from the tool's parts** (spec 0012's live check, mods
  0.13.0 to 0.13.3, 2026-11-04 and 2026-11-07, Solek with Precision
  Farming; the game's own scripts in `debugger/gameSource.zip`):
  - Turn on: `spec_turnOnVehicle` with `isAlwaysTurnedOn` and
    `turnedOnByAttacherVehicle` false (the Berthoud, the Rogator 937H,
    the DINO II, the mowers, the Aerosem, the baler); the ARION 410 and
    the W 600 have no turn on part. `getCanBeTurnedOn()` false while
    folded or unpowered, with `getTurnedOnNotAllowedWarning()`
    ("You first need to unfold the tool (sprayer)!", "Attach tool to
    vehicle with a turned-on motor!").
  - Unload: `spec_fillUnit.unloading` set, `UNLOAD` pressed on the tool
    makes pallets with another tool selected; `unloadingFillUnitsRunning`
    true while it runs.
  - Lower: the input attacher joint's `allowsLowering` (the W 600 true,
    the Berthoud false); a baler's pickup lowers by `LOWER_IMPLEMENT` on
    the baler (the G-1 F125 Kombi).
  - The plow (the PÖTTINGER SERVO T 6000 P): `spec_plow.rotationPart
    .turnAnimation` set and `rotationMax` the rotated state;
    `IMPLEMENT_EXTRA` rotates, refused while lowered or folded
    (`getCanTogglePlowRotation`); `IMPLEMENT_EXTRA3` flips
    `limitToField`; Fold refused while turned ("Folding is not allowed
    while the plow is turned.").
  - A baler-wrapper (the G-1 F125 Kombi): its baler and wrapper share one
    `IMPLEMENT_EXTRA4` event, the wrapper's; a press flips
    `spec_baleWrapper.automaticDrop`, the baler's `automaticDrop` stays
    true (spike 0.0.9's `csParts`). `BALE_COUNTER_RESET` sets
    `spec_baleCounter.sessionCounter` to 0. Both keys are powered.
  - Precision Farming's sprayer part (`spec_FS25_precisionFarming
    .extendedSprayer`): `sprayAmountAutoMode`, `sprayAmountManual`
    (1 to 45); `PRECISIONFARMING_SPRAY_AMOUNT_MODE` toggles automatic,
    `PRECISIONFARMING_SPRAY_AMOUNT` with value 1 or -1 steps the rate,
    on the Berthoud, the Rogator, the Fliegl PFW 18000 and the Aerosem
    (fed from the FH 2200). No rate with herbicide in the tank (the keys
    inactive); fertilizer, liquid fertilizer and slurry are rated (its
    `PrecisionFarming.xml` lists them with the manures, digestate and
    lime). With it, the base game's Doubled rate is gone (no key on the
    Fliegl PFW 18000 with slurry) and its sections take the width keys.
  - Cover: `TOGGLE_COVER` opens and closes `spec_cover` on the FH 2200
    and the Aerosem, each and all.
  - A trailer's tip side with `canTip` false in its XML (the EDK 650's
    Grain door) never tips to the ground (Trailer
    `getCanDischargeToGround`).
- Spec 0013, revisions 3 and 4 (Solek, mods 0.14.0 and 0.15.0,
  2026-11-07):
  - `getIsLowered(default)` returns the default for a tool on a joint that
    doesn't lower (`Attachable.lua`): the trailed Vantage reads lowered
    when asked with `true`, folded or not. Lowered means something only
    for a tool that lowers.
  - Work areas: `spec_workArea.workAreas[i]`'s `start`, `width` and
    `height` nodes and `type`, `g_workAreaTypeManager:
    getWorkAreaTypeIsAIArea(type)`, and `localToLocal(node,
    vehicle.rootNode, 0, 0, 0)`: x is positive to the left, so metres
    right are -x. The T7.300's butterfly mower gives its two wings.
  - Precision Farming's nozzles: the tool's
    `spec_FS25_precisionFarming.extendedSprayerEffects` (found by its
    suffix), its `sprayerEffects[i].isActive` and `.effectNode`: the
    stretches whose nozzles are on match the game's sprayed map. Its
    automatic spraying never changes the boom's `leftSide` / `rightSide`.
- Spec 0001 revision 3, the Harvester page's field panel (confirmed by
  Vincent, 2026-11-08, Solek, a New Holland CH7.70 with a SuperFlex 25FT,
  mod 0.15.0):
  - A header's rig entry can only `lower` and `detach`: turning on is
    the combine's (`[fold, turnOn, pipe]`). So the trail follows the
    header's `lowered` alone, and stops while it's raised at the headland.
  - The header's `workWidth` (the cutter's work areas, Tools.lua's
    `workWidthOf`) gives a trail as wide as the header on the field.
- Spec 0014, checked answers for Pipe, Tip side and Cover (confirmed by
  Vincent, 2026-11-08, Solek, mod 0.16.0):
  - `spec_pipe.targetState` flips the frame `TOGGLE_PIPE` is taken (the
    CH7.70, out and in). With the engine off the key does nothing and the
    game gives no reason of its own.
  - `spec_trailer.preferedTipSideIndex` steps one side per press in the
    frame of the press, from the last side back to the first (the EDK
    650: Left, Right, Back, Grain door), also on a trailer that isn't
    selected.
  - `spec_cover.state` reads back open or closed the frame `TOGGLE_COVER`
    is taken (the Aerosem and the FH 2200, each and all).
- Spec 0015, Tip with the engine off (confirmed by Vincent, 2026-11-08,
  Solek, the Vestrum 100 with two EDK 650, mod 0.17.0):
  - Dischargeable's tip keys are powered ones: `getIsPowered` false with
    the engine off ("Please start the engine first!"), true again from
    "starting", before `engineOn`.
  - The EDK 650's Grain door is an ordinary tip side (its XML has no
    `canTip`): a trailer hitched behind blocks its discharge line, and
    the game warns "This action cannot be performed here"
    (`getCanDischargeAtPosition`); detached, it tips.

## The Implement screen's readings (mods 0.8.0 to 0.8.2, 2026-10-24 and 25)

What the mod reads for a tool's card, the tanks and the weight limit, as
it was first built. The names come from the game's own scripts. Confirmed
since, above: the pipe, tipping, the cover, MAX at the weight limit and a
combine's own fold. The others aren't recorded as confirmed.

- **Game names checked in the game's own scripts.** The SDK ships the game's
  Lua (`sdk/debugger/gameSource.zip` in the install, read locally, never
  committed): Pipe, Dischargeable, Trailer, Cover, WorkArea, Combine,
  AttacherJoints and Vehicle. The new data and keys use those names.
- **Mod:** each `cab.rig` entry (the vehicle too) gains `pipe {out, moving}`
  (targetState above 1 is out, currentState differs while it moves),
  `discharging` (getDischargeState not off), `trailer` and `cover {open}`;
  the vehicle's entry gains `turnedOn` / `canTurnOn` (a combine threshing).
  `cab.keys` gains `pipe` (TOGGLE_PIPE, O), `unload` (TOGGLE_TIPSTATE, I,
  else TOGGLE_TIPSTATE_GROUND, Ctrl+I, whichever is live), `cover`
  (TOGGLE_COVER, N) and `lowerAll` (LOWER_ALL_IMPLEMENTS, Ctrl+V). Each
  implement in `vehicles` gains `speedLimit` (km/h, `getSpeedLimit()`, with
  wear's cut), `workWidth` (m, `getAIWorkAreaWidth()`, else the widest work
  area) and `crop` for a combine (`lastValidInputFruitType` as its fill
  type); the vehicle gains `crop` and `speedLimit` (the rig's, while
  something works).
- **The game's rule** (FillUnit.lua, Vehicle.lua): with the Trailer Fill
  Limit setting on (`missionInfo.trailerFillLimit`), a vehicle with a
  maximum mass (`maxComponentMass`) takes no more load once
  `getMaxComponentMassReached()`, in every unit at once, unless the unit has
  `ignoreFillLimit`; the HUD then shows a lock and MAX. A seeder's
  fertilizer can stop at 76% because the seed already weighs the rest.
- **Mod, the weight limit (0.8.1):** each `fills` entry gains `maxReached` (the HUD's test) and
  `limit`, the litres it stops at when below its capacity: its level at
  MAX, else level + `getAvailableComponentMass()` ÷ the fill type's
  `massPerLiter` (empty units have no type to weigh). Neither is sent with
  the setting off.
- **A combine unfolds itself (mod 0.8.2):** the game won't thresh until the
  combine is unfolded, and the fold is the combine's own, not the
  cutter's. The rig's vehicle entry gains `foldable` / `unfolded` /
  `foldMoving` (VehicleState.fold, shared with the tools); `keyTool` takes
  the vehicle's entry for the fold key only, so Fold follows F wherever it
  points, naming the combine under the button when the cutter is
  selected. `implement.fold` no longer needs an implement: its setter falls
  back to the vehicle.

## Not verified yet

Read by the mod behind `mod/src/Api.lua`'s guards, but not recorded above
as confirmed: a wrong guess leaves the value out. Some have run live for
weeks without anyone writing it down; they stay here until a live check
says so.

- **macOS:** nothing here has been seen on a Mac.
- **Env:** the weather (`getWeatherTypeAtTime`, the temperatures) and each
  farm's money (`g_farmManager`).
- **Player:** `player.nickname`.
- **Fold and lower readings:** `getIsAnimationPlaying` and `foldAnimTime`
  (a fold that runs), `getAllowsLowering`.
- **A tool's speed limit:** `getSpeedLimit`.
- **Game data (Themes T6, mod, 2026-10-24).** The names come from the FS22
  script docs:
  - **Stream** (`Vehicles.lua`, controlled vehicle): `fuelUsage` (l/h, kWh/h
    for electric: `spec_motorized.lastFuelUsageDisplay`, else
    `lastFuelUsage`); `def` and `defCapacity` (the DEF consumer fill unit);
    `cruise` `{state: off|on|full, speed, maxSpeed}` (km/h, from
    `getCruiseControlState/Speed/MaxSpeed`, else `spec_drivable.cruiseControl`);
    `pto` (true when an attached implement's PTO turns, missing without one);
    `fills` (the vehicle's own fill units without fuel, DEF and air, and
    without units the HUD hides: `{unit, level, capacity, fillType,
    fillTitle}`, no fill type when empty). Each implement adds `pto`
    (`spec_powerConsumer.ptoRpm > 0`, then `getDoConsumePtoPower()`), `hitch`
    (0 raised to 1 lowered: the attacher joint's `moveAlpha` between its
    `upperAlpha` and `lowerAlpha`; missing for a joint that doesn't move) and
    `fills`. Every vehicle a worker drives adds `ai` `{job, description,
    helper}` (`getJob()`, then `getCurrentHelper()`).
  - **Units** (`Env.lua`): `env.units` `{miles, fahrenheit, acres, currency}`
    from `g_gameSettings:getValue` (`useMiles`, `useFahrenheit`, `useAcre`)
    and `g_i18n:getCurrencySymbol(true)`, else the `moneyUnit` setting. The
    mod keeps sending metric; `data/units.js` converts speeds, temperatures,
    areas and money on the dashboard, and falls back to metric and "$" (as
    before) without settings. Litres stay litres.
- **Fields:**
  - is `field.fieldState` kept current by the game (does the crop change
    on the dashboard after sowing or harvesting)?
  - do the outlines from `polygonPoints` match the PDA's fields?
  - `defaultMapColor`: linear RGB, as the dashboard assumes?
  - `weedState`: the dashboard counts anything above 0 as weeds;
  - `rollerLevel` above 0: the land panel guesses the field needs rolling;
  - `fillType.title` for the crop names.
- **A hitched implement:** `attached` comes from `getAttacherVehicle()`;
  whether it hides them on the map isn't checked.
- **The AI worker turning on:** `getIsAIActive()` after `TOGGLE_AI`, which
  does nothing without a job set up.
- **Not found yet** ([NEXT.md](NEXT.md)): the game's time scale, the call
  that opens the AI job screen, Refill at a fill station.
