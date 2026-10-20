# Companion mod

Streams game state to `<profile>/modSettings/FS25_Companion/stream.ndjson`,
one JSON envelope per line. The companion client tails that file. It works
the same on Windows and macOS, never blocks the game, and doesn't care
whether the game or the client starts first.

## Install

```bash
python scripts/build_mod.py --install   # builds dist/FS25_Companion.zip and copies it to mods/
```

Or zip the contents of this folder yourself (`modDesc.xml` at the zip root)
and name it `FS25_Companion.zip`. Enable it in the savegame's mod list.

Remove the old `FS25_CompanionTelemetry.zip` (named-pipe prototype) from
`mods/` if it's still there.

## Layout

```
modDesc.xml
src/
  Json.lua        JSON encoder (NaN/inf -> null, sorted keys)
  Geo.lua         one heading convention: degrees, 0 = north (-Z), clockwise
  Api.lua         guarded calls for API names not verified in Phase 0
  Transport.lua   file open / write / flush / rotate at 2 MB, seq counter
  Scheduler.lua   runs each collector at its interval, under pcall
  collectors/     one file per topic (Hello, Env, Player, Vehicles,
                  Hotspots, Farmlands, FarmlandGrid)
  Companion.lua   bootstrap (loaded last)
tests/run.lua     offline tests with a stubbed game
```

## Envelope (protocol v1)

```json
{"v":1,"seq":1234,"t":5123456,"topic":"player","data":{...}}
```

`seq` counts up for the whole session, across rotations. `t` is game time
in ms. When the file reaches 2 MB it is reopened with `"w"` and `hello` is
sent again.

| topic | rate | data |
|---|---|---|
| `hello` | start, and after each rotation | protocolVersion, modVersion, sessionId, platform, mapId, mapTitle, mapDir, mapXmlFilename, isModMap, terrainSize, ingameMap (world size and map extension values), farmId, playerName, profileDir |
| `env` | 1 Hz | day, dayTimeMinutes, season, weather (tempMin, tempMax, tempTrend, current, next), money (farmId → money) |
| `player` | 10 Hz | x, y, z, heading, inVehicle, vehicleId, farmId |
| `vehicles` | 2 Hz | vehicles[] (every vehicle: id, typeName, name, farmId, x/y/z, heading, isAI, motorized, attached, speed, propertyState) and controlledId. The controlled vehicle also carries rpm, gear, fuel, motorTemp, wear, operatingHours, mass, lights and implements[] |
| `hotspots` | 0.1 Hz | hotspots[]: the PDA's places (category, name, x, z, farmId, visible); fields, vehicles, AI and the player are left out |
| `farmlands` | 0.1 Hz | farmlands[]: id, farmId (0 = nobody), price, areaHa, x, z, name, listed |
| `farmland_grid` | once per map, and after each rotation | farmland id per 4 m cell (at most 512 cells a side), run-length encoded: cell, cols, rows, originX, originZ, runs [id, count, ...] |

A collector whose API call fails drops only its own topic (or a single
value) and logs once to `log.txt` as `[FS25_Companion] topic … failed`.

## Adding a topic

Add `src/collectors/<Name>.lua` returning
`{ topic = "...", interval = ms, collect = function(ctx) return data end }`,
list it in `modDesc.xml` and register it in `Companion.lua`. Optional:
`reset()` clears per-map state, and `resend = true` re-sends the last data
after a file rotation (for topics sent once). Expensive work is a cursor
job: `interval = 0`, a bounded slice per call, and `nil` until done (see
`FarmlandGrid.lua`). The client and
the backend pass unknown topics through unchanged.

## Tests

```bash
lua mod/tests/run.lua           # any Lua 5.1+
python -m pytest mod/tests      # same suite through lupa
```

## To verify in game

These names were not covered by Phase 0 and are guarded (a wrong guess
leaves the value out):

- `getCurrentFacingDirection()` → heading on foot: is it the facing
  direction in world space (same convention as vehicles)?
- weather (`getWeatherTypeAtTime`, temperatures) and `g_farmManager` money
- `player.nickname`, vehicle motor/lights/implement fields (from the old mod)
- rotation: does reopening with `"w"` truncate the file?
