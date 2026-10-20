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
