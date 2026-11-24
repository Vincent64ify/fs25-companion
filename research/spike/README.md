# Phase 0 API spike

`FS25_CompanionSpike` is a development-only mod. It probes the live game API so
the rework (file transport + PDA map) is built on verified names instead of
guesses. It changes nothing in the game.

## Run it

1. Zip the *contents* of `FS25_CompanionSpike/` (or use the prebuilt
   `FS25_CompanionSpike.zip`) and copy it into
   `Documents/My Games/FarmingSimulator2025/mods/`. On macOS the folder is
   `~/Library/Application Support/FarmingSimulator2025/mods/`.
2. Enable it in the savegame's mod list and load the savegame. A map with
   fields, sell points and a few owned vehicles is best.
3. After about 5 s `report.json` is written. Since 0.0.18 nothing stays
   on screen: a console command's result shows for 5 s, and in the
   console.
4. For the heading check, get into a vehicle and drive due north, then due
   east, on the in-game PDA. The on-screen `hdg` should read about 0 and then
   about 90. Do the same on foot. Write down what you see.
5. Optional: open the F2/`~` console and type `csDump` to rewrite the report
   (for example after entering a vehicle).

## Send back

The three files from `Documents/My Games/FarmingSimulator2025/modSettings/FS25_CompanionSpike/`:

- `report.json`: API structure dump
- `stream.ndjson`: pose samples at 5 Hz (the first protocol fixture)
- `log.txt` from `Documents/My Games/FarmingSimulator2025/` (only if
  something failed: every probe call is logged as `[CompanionSpike] probing …`)

Remove the mod afterwards.

## Vehicle screen spike (spec 0002)

The report's `vehicles.controlledDetail.vehicleScreen` (spike 0.0.2) holds
what [spec 0002](../../specs/0002-vehicle-screen.md) needs: the joint type
names the game registered, each rig member's joint and its type, what
hangs on forks and hooks (`isPallet`, `spec_bigBag`, fills), the 5 nearest
other vehicles with their fill units and whether each takes what you carry
(`getFillUnitAllowsFillType`, `getFillUnitFreeCapacity`), and the motor's
temperature and lights specs.

1. Rebuild the zip from `FS25_CompanionSpike/` (it's not in git) and
   install it as above, beside FS25 Companion 0.8.5.
2. For each of these, get in, set it up, open the console and type
   `csDump`, then copy `report.json` away before the next (it's
   overwritten):
   - a tractor with a front loader and pallet forks, a pallet on the forks;
   - the same with a bigbag lifter and a seed bigbag on it, over a seeder;
   - the same with a bucket of potatoes, beside a trailer;
   - a tractor working hard until the engine warning shows, if it ever
     does.
3. Send back the reports (and `log.txt` if something failed).

Spike 0.0.3 adds, for every object near you, `mountable`: what
`spec_mountable` holds and what the mount getters answer (does the game
record what a bigbag on bare tines hangs on?), and `showOnHud` on each
fill unit (is a bucket's second unit hidden from the game's HUD?). Two
dumps:
- the pallet fork with bigbags hanging on the tines by their straps;
- the Volvo L90H with its General Purpose Bucket (full or empty).

## A card per tool spike (spec 0003)

Spike 0.0.4 answers what [spec 0003](../../specs/0003-implement-screen.md)
needs before the mod is built: what each tool can do, read from the
game's own parts, for every vehicle type the game knows.

- `census` (every report): every vehicle type the game loaded, base game,
  DLCs and mods, with its specializations and what the capability rule
  makes of it (`can`), how many types have each capability, and how often
  each specialization appears.
- `vehicles.controlledDetail.tools` (when you're in a vehicle): each rig
  member, the vehicle first, with its specializations, `can`, its fills,
  working width and speed limit, the fold and turn-on state with the
  game's own "can't now" answers (`getIsFoldAllowed`,
  `getIsTurnedOnAllowed`, `isDetachAllowed`), the keys each part has
  registered (`actionEvents`, live or not, with their text), and the parts
  spec 0003 isn't sure of: `spec_trailer` (tip sides), `spec_plow`,
  `spec_variableWorkWidth`, `spec_baler`, `spec_baleWrapper`, `spec_cover`
  and what's in reach to attach. Also the input actions the game has for
  folding, turning on, tipping, rotating, widths, sections and attaching.
- `selectTest` (after `csSelect`): the one probe that changes something.
  It selects each tool in turn, one every 0.4 s, notes what got selected
  and which of its keys went live, then puts your selection back.

1. Rebuild `FS25_CompanionSpike.zip` from the folder's contents and copy
   it into the mods folder beside FS25 Companion. Enable it in the
   savegame's mods.
2. Load the savegame: the first report (5 s after loading) already has the
   census. Copy that `report.json` away as `census.json`.
3. For each rig, get in, set it up, open the console (`~`) and type
   `csSelect`. Wait for "selection test written to report.json" on screen
   (about a second per tool), then copy `report.json` away under the rig's
   name before the next:
   - `mowers`: a tractor with a front and a rear mower, unfolded and
     lowered;
   - `trailers`: a tractor with two trailers, one that tips more than one
     way (and its tip side changed once with the game's key);
   - `sprayer`: a sprayer with sections, a few sections switched off with
     the game's keys (self-propelled or trailed);
   - `plow`: a tractor with a plow that rotates, raised;
   - `baler`: a baler, part way through a bale (and a baler-wrapper if you
     have one);
   - `weight`: a tractor with only a front weight;
   - `truck`: a tipper truck, loaded;
   - `attach`: a tractor backed up to a tool, with the game's Attach
     prompt on screen (`csDump` is enough here).
4. Send back the reports (and `log.txt` if something failed).

## The All row's keys (spike 0.0.5, spec 0003)

Why the dashboard's Lower all did nothing every other time while Ctrl+V
always worked: Companion's `runInputAction` calls every active handler of
a key, and the keyboard may reach only one. Two console commands:

- `csKeys`: `keys.json` with every handler registered for
  `LOWER_ALL_IMPLEMENTS`, `FOLD_ALL_IMPLEMENTS`, `TURN_ON_ALL_IMPLEMENTS`
  and the one-tool `LOWER_IMPLEMENT`, `FOLD_IMPLEMENT`,
  `TURN_ON_IMPLEMENT`: the object that owns it, the function it calls
  (`AttacherJoints.…`), active or not, its plain fields (trigger up /
  down, priority, context), and the rig's states.
- `csTrace`, then `csTrace` again: in between, every call to those
  handlers is logged (the keyboard's and the mod's) with its caller's
  stack and the tools' states before it and 30 frames after. The
  handlers still run; the second `csTrace` puts the originals back and
  writes `keys.json`.

1. Install `FS25_CompanionSpike.zip` (0.0.5) beside FS25 Companion and
   restart the game.
2. A tractor with a front and a rear mower, engine on, unfolded, raised.
   Console (`~`): `csKeys`.
3. `csTrace`. Then, waiting for each to finish: Ctrl+V on the keyboard,
   Ctrl+V again; the dashboard's Fold all, then the keyboard's fold-all
   key; Turn on all on the dashboard, then the keyboard's. Then
   `csTrace` again.

Spike 0.0.6 adds `csPress [KEY]` (default `LOWER_ALL_IMPLEMENTS`): on the
next frame it presses the key exactly as Companion's `runInputAction`
does (every active handler, 8 arguments), so the mod's press can be
compared with the keyboard's on the same rig. The trace now records
every argument from the 5th on, and marks the calls `csPress` made.

Spike 0.0.7 adds `csCombo`: live, the game's Lower all lowered the
T7.300's rear mower 2.0 s after the front one, every time. `csCombo`
writes `combo.json`: what the tractor's attacher joints hold (every field
named combo, each joint's plain fields, its Combo methods), then presses
Lower all as the mod does and records every change in those and in the
tools' states, frame by frame, for 8 s. Run it once to lower, once to
raise; on a second tractor if there is one.

Spike 0.0.8: `csKeys` also lists the tip keys, `TOGGLE_TIPSTATE` (I,
"Dump") and `TOGGLE_TIPSTATE_GROUND` (Ctrl+I, "Unload here"), and each
trailer's discharge (Dischargeable's spec and current node, plain fields,
and the FS22 getters' answers). Live (2026-10-31) the game showed I only
over a sale point that takes the load and Ctrl+I elsewhere, while both
events said `isActive`: the dumps show what tells them apart. `csKeys
NAME` writes `keys-NAME.json`. With a loaded trailer selected: `csKeys
sale` over a sale point that takes the load, `csKeys ground` on your own
land.

## Card buttons (spike 0.0.9, spec 0012)

[Spec 0012](../../specs/0012-card-buttons.md) builds a card's buttons from
what a tool is, read from its parts by the names in the game's own scripts
(`sdk/debugger/gameSource.zip`). Two console commands check those names
live:

- `csParts [NAME]`: `parts.json` (`parts-NAME.json`) with, for every rig
  member, its parts and what spec 0012 reads in each: the turn on part's
  settings (`isAlwaysTurnedOn`, `turnedOnByAttacherVehicle`) and
  `getCanToggleTurnedOn()`, the input attacher joint's `allowsLowering`
  and `canBeTurnedOn`, the fill unit's unloading places, the plow's
  limit to field and rotation, the baler's automatic drop, the bale
  counter, the sprayer's doubled rate and active spray type, the width's
  sections and `isActive`, every Precision Farming part's fields, and
  each part's keys (active, shown, text).
- `csRate [KEY] [VALUE]`: on the sprayer with a Precision Farming part
  (the selected one first), presses KEY (default
  `PRECISIONFARMING_SPRAY_AMOUNT`) as the mod does, with VALUE (default
  1), and records every change in its Precision Farming parts, its
  sprayer part and its tank for 3 s: `rate-KEY.json` (`rate-KEY-VALUE.json`
  for another value).

The files land in `modSettings/FS25_CompanionSpike/`. The steps are in
spec 0012's Live check ("Probe first").

## Steering Assist: the mode, the course, the steering key (spike 0.0.15, spec 0020)

`csParts NAME` gains `steering` on each rig member with Steering Assist
(`spec_aiModeSelection` or `spec_aiAutomaticSteering`): both parts' plain
fields, `currentMode` and its name among `AIModeSelection.MODE`'s keys,
`steeringEnabled`, the course's class and plain fields, and the
`TOGGLE_AI_STEERING` event found through the steering part's
`actionEvents` in `g_inputBinding.events` (`registered`, `found`,
`active`, `text`, `shown`). Reads only, no game calls.

1. Install the zip beside FS25 Companion 0.20.5, on Solek, a tractor with
   a cultivator (or the plough).
2. In the cab, `csParts NAME` for each (copy nothing between: each has its
   own file):
   - `worker`: AI worker mode, on a field;
   - `off`: Steering Assist mode (set in the dialog, hold H), off the field;
   - `ready`: the same, on a field you may work, once the course shows,
     not steering;
   - `steering`: the same, steering (Activate lane);
   - `building`: the same, right after driving onto the field, before the
     course shows (if you catch it);
   - `noassist`: a loader or a truck.
3. Send back the `parts-*.json` files from
   `modSettings/FS25_CompanionSpike/`.

## Steering Assist: the course's lanes (spike 0.0.17, spec 0021)

[Spec 0021](../../specs/0021-gps-screen.md) draws the game's own course.
Its class, `SteeringFieldCourse`, is not in the SDK's archive, and the save
keeps only the field's boundary, the settings and `workedLines`, so the
segments' names are unknown. `csCourse NAME` writes `course-NAME.json`:
the Steering Assist part's state, the rig's position, and for
`steeringFieldCourse` (and `lastActiveSteeringFieldCourse` when it is
another table) its class, method names, plain fields, a shape (every key,
its type and class, four levels down) and every list of tables found
three levels down with each item's plain fields (links between items are
refs), with the lists' size as JSON and the time to encode them. Reads
only: `pairs` and `rawget`, no method calls. 0.0.17 shows every value of
a list of plain values (0.0.16 showed six), so all of `segmentStates`,
the done flags.

1. Install the zip beside FS25 Companion 0.21.0, on Solek, the tractor and
   cultivator, Steering Assist mode, headlands 1 or more.
2. Each its own file, nothing to copy between:
   - `fresh`: on the field, the course built, nothing worked yet;
   - `midround`: halfway round the first headland, steering;
   - `round1`: the first round done, on the first lane;
   - `midlane`: halfway down that lane;
   - `lane1`: that lane done, through the turn, on the next;
   - `skip1`: a lane skipped by hand (the dialog has no setting for it):
     past the next lane, onto the one after, that lane worked, stopped
     at its end.
3. Save the game once at the end (the save holds `workedLines`).
4. Send back the `course-*.json` files from
   `modSettings/FS25_CompanionSpike/`, and say which savegame slot.

## Steering Assist: the preview and the settings (spike 0.0.18, spec 0022)

[Spec 0022](../../specs/0022-steering-assist-settings.md) shows the course
the game would build with the panel's settings before Apply. The game
builds its course with `g_fieldCourseManager:generateFieldCourseAtWorldPos`
and only then sets it on the vehicle (AIAutomaticSteering.lua:738-776), so
the spike asks the same builder for a course and never sets it. That
builder is the one new call. The spike also calls two functions the game
already calls itself: `fieldCourseSettings:clone()` (every time H opens the
dialog) and `roundToTerrainDetailPixel` (every frame in Steering Assist
mode). Two console commands:

- `csPreview NAME [DEG|auto] [two] [wait] [steering]` writes
  `preview-NAME.json`. On the next frame it clones the vehicle's course
  settings, sets the clone's direction to DEG degrees (`auto`: the game's
  Auto; none: the clone unchanged), and asks the builder for a course at
  the place the game asks (the vehicle's front). It records when the
  answer comes and how often, the course it got (dumped like `csCourse`,
  and compared point by point with the vehicle's own), and, before, at the
  answer and 3 s after, the vehicle's own course, its flags, its settings
  and the builder's fields. Those must stay unchanged. It writes after
  30 s even if nothing answers. `two` asks for a second course in the same
  frame at DEG + 30°. `wait` asks on the frame the game starts building
  its own course, after OK in the game's dialog. `steering` is the run
  while steering; without it, the spike refuses while steering is on. It
  also refuses outside Steering Assist mode, off a field you may work, and
  while the game is building.
- `csSettings NAME` writes `settings-NAME.json`, reads only: both Steering
  Assist parts three levels down (0.0.15 went one), where `userSettings`
  keeps each mode's choices, the vehicle's own settings (cruise at the
  lane end) and the game settings for Show lines and cruise.

1. Install the zip beside FS25 Companion 0.22.0, on Solek, the tractor and
   cultivator, Steering Assist mode, on field 7, the course showing, not
   steering. Hold H once and leave the dialog with Back (after a hitch the
   game keeps no `userSettings` until then).
2. The settings, each its own file:
   - `csSettings auto`: everything on Auto;
   - set width 6.6 m, headlands 2, direction 135°, offset −0.4 m, lines
     Off, cruise Manual in the dialog, OK: `csSettings set`;
   - Reset in the dialog, OK: `csSettings reset`;
   - AI worker mode in the dialog: `csSettings worker`; then back to
     Steering Assist.
3. The preview, each its own file. After each, check that the game's lanes
   didn't move and that Steering still activates:
   - `csPreview control`: the clone unchanged. Its course should be the
     game's own, point for point;
   - `csPreview dir 45`. Then set 45° in the game's dialog, OK, and once
     the lanes show, `csCourse dir45` (the game's own course, to compare
     with the preview's). Then back to Auto;
   - `csPreview two 45 two`: two at once;
   - `csPreview during 20 wait`, then close the console, hold H, change
     the direction to 30°, OK. Wait for "preview … written" on screen,
     then check the game built its own course: the lanes show and Steering
     activates. This one matters most: if the game's own build is lost,
     the vehicle never gets a course again (quit without saving). Then
     back to Auto;
   - steering on (Activate lane): `csPreview steer 60 steering`. Steering
     must stay on and the lanes stay put;
   - on field 6: `csPreview field6 45` (how long a bigger field takes).
4. Two reloads, so a set direction and Auto each come back once:
   - set the direction to 135° in the dialog, OK, drive a lane with
     steering, save, quit to the menu and load the save again. Hold H:
     write down what the dialog shows for the direction, then Back.
     `csSettings reload135` and `csCourse reload135`;
   - set the direction to Auto, OK, save, reload. Hold H: write down what
     the dialog shows for the direction (Automatic, or an angle?), then
     Back. `csSettings reloadauto` and `csCourse reloadauto`.
5. If anything looks wrong at any point (lanes gone, Steering won't
   activate, the game stutters), quit without saving and say which step.
6. Send back the `preview-*.json`, `settings-*.json` and `course-*.json`
   files from `modSettings/FS25_CompanionSpike/`, and `log.txt` if
   something failed.

## Steering Assist: Auto, the allowed check and the mode (spike 0.0.19, spec 0022)

0.0.18 showed the preview is safe and that `userSettings` keeps each
mode's choices, but stopped one level above them. 0.0.19:

- `csSettings NAME` now dumps `userSettings` (and `loadedUserSettings`,
  if a save's are still waiting) whole, with each table's class and
  methods. It also lists the game's AI settings classes (`AIUserSettings`
  and the like): their constants and method names, none of them called.
  The question: how the dialog tells "5.0 m (Auto)" from a set 5.0 m,
  and where the AI worker's own choices go.
- `csAllowed NAME` calls `getIsAutomaticSteeringAllowed()` (the game's own
  guard before Steering Assist mode) and each tool's
  `getImplementAllowAutomaticSteering()`. Both are plain reads in the
  game's scripts. Writes `allowed-NAME.json`.
- `csMode NAME worker|steering` switches the mode on the next frame with
  `setAIModeSelection`, the session's new call. It goes to Steering Assist
  only when the allowed check says yes. For 3 s it records every change in
  the mode, the course, the flags and the settings: `mode-NAME.json`.

1. Install the zip beside FS25 Companion 0.22.0, restart the game, load
   the save. The Fendt 728 with the LEMKEN on field 119, Steering Assist
   mode, the lanes showing, steering off.
2. Auto against a set value, each its own file:
   - `csSettings load`, before holding H;
   - hold H. Working Width shows 5.0 m (Auto): press + then −, and write
     down whether it now says 5.0 m without "(Auto)". OK. `csSettings five`;
   - hold H, Reset, OK: `csSettings auto`.
3. The AI worker's own choices:
   - hold H, AI Worker mode, Work Direction 90°, OK (don't start the
     worker): `csSettings worker90`;
   - hold H, Steering Assist mode. Write down what Work Direction shows,
     then OK: `csSettings back`.
4. `csAllowed fendt`.
5. The mode, from the console:
   - `csMode toworker worker`. The HUD should say AI worker and the lanes
     go;
   - `csMode tosteering steering`. The lanes should come back and
     Steering activate. Hold H: write down what the dialog shows, then
     Back.
6. A vehicle no tool steers with (a truck, or a loader):
   `csAllowed truck`, then `csMode truck steering` (should be refused).
7. Back in the Fendt: save, reload, hold H (write down what it shows),
   Back. `csSettings reload`.
8. Send back the `settings-*`, `allowed-*` and `mode-*` files (I read them
   from the folder during the session).

## Contracts: is getMaxCutLiters safe on an offer? (spike 0.0.14, spec 0018)

`csMaxCut N` calls `getMaxCutLiters()` once on harvest offer N (its
number from `csMissions`, or a piece of its id) and writes
`maxcut-ID.json`: the litres, and the offer's completion state
(`isFieldCompletionInitialized`, its partitions and modifier) before and
after. It refuses anything but a harvest offer, and an offer whose
completion had already started.

1. Load the save fresh (nothing taken, no `csMissions` needed but it's safe).
2. `csMissions offer`, pick a harvest offer you won't take, `csMaxCut N`.
3. **Unchanged:** mod 0.20.4 can read it again for offers' litres.
   **CHANGED:** don't take that contract; quit without saving.
4. Send back `maxcut-*.json`.

## Contracts: what a baling and a potato contract hold (spike 0.0.13, spec 0018)

**Spike 0.0.10 to 0.0.12 froze the game:** `csMissions` asked every
contract for `getTotalReward()` and `getReimbursement()`; on a harvest
offer that starts its field completion with no modifier, and once you take
it the game's update fails every frame (`AbstractFieldMission.lua:493`).
0.0.13 asks only a finished contract, and reads `fields` first. A save
where it happened is fine once loaded again without saving.

`csMissions` also writes, for each contract, every plain field it holds
(`fields`: litres, bales, fill type ...), and in `globals.classes` the
constants and functions of `AbstractMission`, `AbstractFieldMission`,
`HarvestMission`, `BaleMission` and `BaleWrapMission`. It only reads.
0.0.11 also called `getMaxCutLiters()`: never again, it froze the game
once the contract started (spec 0018's Log, 2026-11-17).

1. Rebuild the zip from `FS25_CompanionSpike/` and install it beside FS25
   Companion 0.20.3 (0.0.13 or later only).
2. With a baling and a potato harvest contract on offer: `csMissions offer`.
3. Take both (own machines or lease), work each a little:
   `csMissions running`.
4. Send back `missions-offer.json` and `missions-running.json`.

## Contracts: accept, cancel, hand in (spike 0.0.10, spec 0019)

[Spec 0019](../../specs/0019-contract-actions.md) calls the game's own
`g_missionManager:startMission`, `cancelMission` and `dismissMission`,
read in the SDK's scripts but never run by us. Four console commands:

- `csMissions [NAME]`: `missions.json` (`missions-NAME.json`). Only
  reads: whether the game is the server, the three functions, the
  `MissionStartState` names, what the menu's events and contracts frame
  hold (for a multiplayer client later), your money, and every contract
  with its number, id, status, reward, lease and the game's total. It
  also prints one line per contract in the console.
- `csAccept N lease` or `csAccept N own`, `csCancel N`, `csHandIn N`: N
  is the contract's number from `csMissions` (or a piece of its id).
  **Each changes the save**; a hand-in books money. Each makes the call
  on the next frame, then records for 6 s every change in the contract
  (status, farm, leased machines), your money, and whether the game
  shows a menu or a dialog: `accept-<id>-lease.json`,
  `cancel-<id>.json`, `handin-<id>.json`. A command the spec would
  refuse (not the server, not yours, not finished, no room at the shop)
  says so and calls nothing.

The numbers move when the list changes: run `csMissions` again before
each command. The steps are in spec 0019's Live check ("Spike first").

## Command spike (C0)

`FS25_CommandSpike` checked the command channel before Controls was built
(its results: [GAME-API.md](../../docs/GAME-API.md#c0-the-command-channel)):
the mod looks for `modSettings/FS25_CommandSpike/cmd/<n>.xml` every frame,
runs it as a game action and reports to `results.ndjson`.
`command_spike.py` writes the commands and times the round trip.

1. `python research/spike/command_spike.py install`, then start FS25, enable
   **FS25 Companion Command Spike** in the savegame's mods and load it. A
   line "[CommandSpike] session …" shows on screen.
2. Leave the game running (it doesn't need focus) and in a terminal in the
   repo:
   - `python research/spike/command_spike.py ping -n 50`: the channel alone.
   - `python research/spike/command_spike.py reread -n 10`: a rewritten file is read
     fresh (expect 10/10).
3. Get into a tractor, open the console (`~`) and type `csInput` (dumps the
   input actions active now), then `csBench`.
4. Still in the tractor, try an input action name, then the direct one,
   and watch the beacon in game each time:
   - `python research/spike/command_spike.py send TOGGLE_BEACON_LIGHTS`
   - `python research/spike/command_spike.py send BEACON --mode direct`
   - the same for lights, hazard, engine and cruise (input names are in the
     `csInput` dump; direct names are `LIGHTS`, `HAZARD`, `ENGINE`, `CRUISE`).
5. `python research/spike/command_spike.py bench TOGGLE_BEACON_LIGHTS -n 20`.

Send back `results.ndjson` and `driver.ndjson` from
`modSettings/FS25_CommandSpike/`, and whether the beacon visibly changed for
each command. Remove the mod afterwards. On a Mac, the same steps.
