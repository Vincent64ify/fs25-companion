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
