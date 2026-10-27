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
3. After about 5 s a status line appears on screen and `report.json` is
   written.
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
what [spec 0002](../specs/0002-vehicle-screen.md) needs: the joint type
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

Spike 0.0.4 answers what [spec 0003](../specs/0003-implement-screen.md)
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

## Command spike (C0)

`FS25_CommandSpike` checks the command channel planned for Controls (see
[PLAN.md](../docs/PLAN.md#after-that-controls-control-the-game-from-the-dashboard)):
the mod looks for `modSettings/FS25_CommandSpike/cmd/<n>.xml` every frame,
runs it as a game action and reports to `results.ndjson`.
`command_spike.py` writes the commands and times the round trip.

1. `python spike/command_spike.py install`, then start FS25, enable
   **FS25 Companion Command Spike** in the savegame's mods and load it. A
   line "[CommandSpike] session …" shows on screen.
2. Leave the game running (it doesn't need focus) and in a terminal in the
   repo:
   - `python spike/command_spike.py ping -n 50`: the channel alone.
   - `python spike/command_spike.py reread -n 10`: a rewritten file is read
     fresh (expect 10/10).
3. Get into a tractor, open the console (`~`) and type `csInput` (dumps the
   input actions active now), then `csBench`.
4. Still in the tractor, try an input action name, then the direct one,
   and watch the beacon in game each time:
   - `python spike/command_spike.py send TOGGLE_BEACON_LIGHTS`
   - `python spike/command_spike.py send BEACON --mode direct`
   - the same for lights, hazard, engine and cruise (input names are in the
     `csInput` dump; direct names are `LIGHTS`, `HAZARD`, `ENGINE`, `CRUISE`).
5. `python spike/command_spike.py bench TOGGLE_BEACON_LIGHTS -n 20`.

Send back `results.ndjson` and `driver.ndjson` from
`modSettings/FS25_CommandSpike/`, and whether the beacon visibly changed for
each command. Remove the mod afterwards. On a Mac, the same steps.
