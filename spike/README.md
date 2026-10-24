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
