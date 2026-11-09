# Companion mod

Streams game state to `<profile>/modSettings/FS25_Companion/stream.ndjson`,
one JSON envelope per line. The companion tails that file. It works the
same on Windows and macOS, never blocks the game, and doesn't care whether
the game or the companion starts first.

The other way, the companion writes the dashboard's commands to
`cmd/<n>.xml` in the same folder; the mod runs them (only actions on its
own list) and answers with `command_ack` and the `cab` topic in the same
frame (`src/Commands.lua`;
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#commands)).

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
  Api.lua         guarded calls for game API names that aren't verified
  Transport.lua   file open / write / flush / rotate at 2 MB, seq counter
  Scheduler.lua   runs each collector at its interval, under pcall
  state/          VehicleState, the readers vehicles, cab and commands share:
                  Lights, Motor (engine, cruise, AI), Tools, Rig
  Commands.lua    reads cmd/<n>.xml every frame, runs allowed input actions
                  (their keys; setters only where the game has none)
  collectors/     one file per topic (Hello, Env, Player, Vehicles,
                  Hotspots, Farmlands, FarmlandGrid, CropTypes,
                  FieldOutlines, Fields, Cab)
  collectors/vehicles/  the vehicles topic's parts: Fill, Motor, Tools, Loader
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

What each topic's data holds is described once, in
[`web/src/types.js`](../web/src/types.js).

| topic | rate | what |
|---|---|---|
| `hello` | start, and after each rotation | protocol and mod version, session, platform, the map's id, title and folders, terrain size, the PDA's map values (`ingameMap`), game and profile folders, player and farm, where commands go and the number read next |
| `env` | 1 Hz | day, season, time, weather, temperatures, money per farm, the player's units |
| `player` | 10 Hz | position, heading, in a vehicle or not, vehicle id, farm |
| `vehicles` | 2 Hz | every vehicle: pose, name, type, farm, AI, hitched or not, speed. The one you drive also carries its engine, fuel, gear, wear, fills and each attached tool |
| `hotspots` | 0.1 Hz | the PDA's places: category, name, position, owner farm, visible; fields, vehicles, AI and the player are left out |
| `farmlands` | 0.1 Hz | id, owner farm (0 = nobody), price, area, centre, listed |
| `farmland_grid` | once per map, and after each rotation | the farmland id per 4 m cell (at most 512 cells a side), run-length encoded |
| `crop_types` | once per map, and after each rotation | fruit types with the PDA's colours and growth thresholds, ground type names, lime / plow / spray maximums |
| `field_outlines` | once per map, and after each rotation | each field's outline in world meters |
| `fields` | every 15 s | each field's state (fruit, growth, ground, spray, lime, plow, roller, stubble, weeds, stones), farmland, sign position, area |
| `cab` | every frame, sent only on change | what the controls show: lights, engine, cruise, AI worker, the rig (the vehicle and every attached tool, with what each can do and its state) |
| `command_ack` | the frame a command runs, with `cab` | the command's number and `ref`, ok or the reason, what ran (`via`), `already` when nothing had to |

A collector whose API call fails drops only its own topic (or a single
value) and logs once to `log.txt` as `[FS25_Companion] topic … failed`.

## Adding a topic

Add `src/collectors/<Name>.lua` returning
`{ topic = "...", interval = ms, collect = function(ctx) return data end }`,
list it in `modDesc.xml` and register it in `Companion.lua`. Optional:
`reset()` clears per-map state, and `resend = true` re-sends the last data
after a file rotation (for topics sent once). Expensive work is a cursor
job: `interval = 0`, a bounded slice per call, and `nil` until done (see
`FarmlandGrid.lua`). The companion passes unknown topics through
unchanged; describe the new one in `web/src/types.js`.

## Tests

```bash
lua mod/tests/run.lua           # any Lua 5.1+
python -m pytest mod/tests      # same suite through lupa
```

## Game API names

A name the mod reads is either verified in the running game or guarded by
`src/Api.lua` (a wrong guess leaves the value out). Both lists are in
[docs/GAME-API.md](../docs/GAME-API.md): the verified facts, and
[what's not verified yet](../docs/GAME-API.md#not-verified-yet).
