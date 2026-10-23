# Done

What FS25 Companion has built so far, why it's built this way, and the game
API facts it relies on. What's next is in [PLAN.md](PLAN.md). Small fixes go
in [NEXT.md](NEXT.md), and the themes project is in [THEMES.md](THEMES.md).

- [Why the rework](#why-the-rework)
- [Verified game API facts](#verified-game-api-facts)
- [Architecture](#architecture)
- [Phases 0 to 4](#phases-0-to-4)
- [After Phase 4](#after-phase-4)

---

## Why the rework

The first prototype worked, but two parts were built on early assumptions:

1. **Transport.** Mod → client uses the Windows named pipe `\\.\pipe\fssimx` (`mod/CompanionTelemetry.lua`, `client/pipe_server.py`). It is Windows-only. It is also fragile: `pipe_server.py` documents a long debugging saga where the engine's pipe can get stuck until the game restarts, and there are five pipe-debugging scripts. The wire format (`HEADER<k<k<BODY<v<v`) is a flat key list. It can't carry nested or variable-size data such as lists of vehicles, fields or sell points.
2. **Map.** `web/app.js` draws one PNG on a hand-rolled canvas and positions one arrow using calibration knobs (`rotateDeg`, `flipX/Z`, `headingOffset`, `overviewSpanFactor`). Heading has sign hacks that differ between player and vehicle (`CompanionTelemetry.lua:250-282`). Map assets are found by guessing install paths on Windows (`builder/import_map.py`). There is no pan/zoom and no layer model, so nothing to hang fields, sell points or vehicles on.

**Goal:** a foundation that runs the same on Windows and macOS, carries structured data, and renders like the in-game PDA: overview image, farmlands, fields, POIs and all vehicles, as toggleable layers. Each new feature should mean adding one collector in the mod and one layer on the web side, with no changes in between.

**Decisions taken:**
- No compatibility with the old pipe or the old wire format.
- Vanilla JS with no build step: ES modules plus `// @ts-check` and JSDoc types, and a vendored Leaflet.
- The backend still supports both local use and the remote pairing relay.

---

## Verified game API facts

### Phase 0 (spike on Solek, Windows, 2026-10-20)

These results override any API guesses later in this document.

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

### Verified since Phase 0

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

---

## Architecture

> The design written before Phases 1 to 4. "As built" notes mark where the
> build differs; [Phases 0 to 4](#phases-0-to-4) has the details.

```
FS25 mod (Lua) ──append NDJSON──► <profile>/modSettings/FS25_Companion/stream.ndjson
                                         │  (plain file: identical on Windows and macOS)
Python client ──tail + validate──────────┘
      │  WebSocket (typed envelopes)        HTTP PUT (map assets, once per map)
      ▼                                     ▼
FastAPI backend: per-session StateStore (latest value per topic) ──► browsers (WebSocket)
      ▼
web/: Leaflet in world coordinates, one module per layer
```

### 1. Transport: a file stream instead of a named pipe

Why a file:
- The mod already relies on Lua `io` (`io.open`), and GIANTS exposes `getUserProfileAppPath()` / `g_modSettingsDirectory` on both operating systems. Writing a normal file avoids every pipe and FIFO problem: nothing blocks the game, there is no OS-specific API, and start order doesn't matter.
- macOS FIFOs (`mkfifo`) are rejected: `open()` for writing blocks until a reader exists, which would freeze the game.
- luasocket is rejected: it is not reliably exposed to mods.

**Mod side** (`mod/src/Transport.lua`):
- At mission start, open `modSettings/FS25_Companion/stream.ndjson` in mode `"w"` (truncate) and keep it open.
- Write one JSON object per line and `flush()` after each tick.
- Rotate when the file reaches about 2 MB: close it and reopen with `"w"`. The reader detects the shrink and restarts from offset 0.
- Keep the total write rate around 10–20 lines/s. That is a few KB/s, which is negligible.

**Envelope (protocol v1):**

```json
{"v":1,"seq":1234,"t":5123456,"topic":"player","data":{...}}
```

- `seq` increases monotonically per session. A gap or a reset tells the reader about a rotation or a new session.
- `t` is game time in ms.
- `topic` is one of a fixed set of channels, each with its own rate and its own "latest wins" semantics:

| topic | rate | content |
|---|---|---|
| `hello` | session start, and after each rotation | protocol and mod version, session, platform, map id, title and folders, terrain size, the PDA's map values (`ingameMap`), game and profile folders, player and farm |
| `env` | 1 s | day, season, time, weather, temperatures, money per farm |
| `player` | 100 ms | position, heading, in a vehicle or not, vehicle id, farm |
| `vehicles` | 500 ms | every vehicle: pose, name, type, farm, AI, engine or not, hitched or not, speed, property state; the controlled one also gets engine, fuel, rpm, gear, temperature, wear, hours, mass, lights, implements (each with its type and shop category), and its brand and shop category |
| `hotspots` | 10 s | the PDA's places: category, name, position, owner farm, visible |
| `farmlands` | 10 s | id, owner farm, price, area, centre, listed |
| `farmland_grid` | once per map, resent after a rotation | farmland ids on 4 m cells, run-length encoded |
| `crop_types` | once, resent after a rotation | fruit types with the PDA's colours and growth thresholds, ground type names, lime / plow / spray maximums |
| `field_outlines` | once per map, resent after a rotation | each field's outline in world meters |
| `fields` | 15 s | each field's state (fruit, growth, ground, spray, lime, plow, roller, stubble, weeds, stones), farmland, sign position, area |

As built (mod 0.4.0). A `prices` topic is still to come (see [PLAN.md](PLAN.md#later)).

The `hello` message is re-emitted after every rotation, so a reader that starts late always gets the context it needs.

**Client side** (`client/transport/file_tail.py`):
- Poll the file every 50 ms. Track the read offset, buffer partial lines, and drop lines that aren't valid JSON (for example a line cut off during rotation). If the file is smaller than the offset, reset to 0.
- Pure Python, no OS-specific code. `watchdog` is not needed.
- Profile directory discovery (`client/paths.py`), with `--profile-dir` to override:
  - **Windows:** `Documents/My Games/FarmingSimulator2025`, with the OneDrive variant. Resolve Documents through `SHGetKnownFolderPath` rather than guessing.
  - **macOS:** `~/Library/Application Support/FarmingSimulator2025` and the Mac App Store container `~/Library/Containers/*/Data/Library/Application Support/FarmingSimulator2025`.
  - **Steam vs Epic vs Giants installs:** no install path is needed, because the mod reports file paths in `hello`.
- **Delete:** `pipe_server.py`, `diagnose_pipe.py`, `pipe_probe.py`, `pipe_connect_test.py`, `pipe_thread_test.py`, the old `protocol.py` FrameParser, and `tests/test_pipe_roundtrip.py`.

**Recording and replay** (`client/companion_client.py --replay file.ndjson`, `--record`): the stream file is already a recording. Replay lets you develop the whole web side without the game running, and feeds the tests.

### 2. Mod structure: one collector per topic

```
mod/
  modDesc.xml
  src/
    Companion.lua          -- bootstrap, addModEventListener, scheduler (per-topic intervals, time-sliced jobs)
    Json.lua               -- small encoder (no os/json lib in GIANTS Lua): NaN/inf → null, string escaping
    Transport.lua          -- file open/rotate/write, seq counter
    Geo.lua                -- worldPose(node) -> x, z, heading using localDirectionToWorld(node,0,0,1); atan2(dx,dz)
    collectors/
      Hello.lua  Env.lua  Player.lua  Vehicles.lua  Hotspots.lua  Farmlands.lua  Fields.lua
```

- **Collector contract:** `{ topic = "vehicles", interval = 500, collect = function(ctx) return data end }`.
  - The scheduler wraps every `collect` call in `pcall`. One broken API call drops only that topic for that tick and logs once. It never crashes the game or the other topics.
  - Expensive work runs as a cursor job advanced each frame, limited to N ms per frame. Luau has no coroutines. Examples: sampling the farmland grid, walking all fields.
- **One heading convention everywhere:** 0 = north (−Z), clockwise, in degrees, computed from the node's forward vector. This replaces the separate rotY/yaw sign hacks for player and vehicle. The web side does no heading calibration.
- **Hotspots:** read them from the same source the PDA uses (`g_currentMission.hud.ingameMap` hotspots / `mapHotspots`). Each hotspot carries category, world position and name. This makes the dashboard match the PDA for any map without per-map tables.

### 3. Map data pipeline

Every coordinate stays in **world meters (x, z)**, from the mod to the screen. Only one transform exists: the one that places the overview image.

**Overview image**
- `hello` carries the absolute path of the overview image and `terrainSize`. The client no longer guesses from savegames or install paths.
- The client hashes the image file, converts DDS → PNG with Pillow (reusing the logic in `builder/import_map.py:175`), and makes a 2048 px variant for phones.
- It uploads both to the backend with `PUT /api/maps/{mapId}/{hash}/overview.png`, which is content-addressed and skipped if already present. Uploading works the same whether the backend is local or remote.
- Map metadata goes to `PUT /api/maps/{mapId}/{hash}/meta.json`, holding `{terrainSize, overviewSpanFactor: 2}`. As built: `meta.json` holds `imageBounds` / `playableBounds` in world meters, computed from `hello.ingameMap` (Phase 2).
- Keep the empirically verified factor of 2 (the playable area is the central half of the texture) as a single constant with a test. Delete `rotateDeg` and `flipX/Z`. As built: the factor comes from the game's `mapExtensionScaleFactor`; 2 is only the fallback.
- **Fallback:** if the overview is inside a packed basegame archive and unreadable, the dashboard shows a plain terrain-colored background, and all vector layers still work. As built: paid DLC maps always get it, with a faint 250 m grid and a "DLC map: no overview image" note.

**Farmlands**
- The mod samples `g_farmlandManager:getFarmlandIdAtWorldPosition(x, z)` on a grid: 4 m cells, so 512×512 for a 2 km map. It runs time-sliced over a few seconds after load.
- It sends the grid run-length encoded, roughly 10–50 KB.
- The client vectorizes the grid into polygons (marching squares or simple boundary tracing in Python) and sends GeoJSON-like polygons to the backend. As built: the browser traces the outlines instead (`web/src/map/farmlandGeometry.js`, Phase 3); the grid passes through unchanged.
- This works for any map without parsing GIANTS `.grle` files.

**Fields**
- Use the field polygon from FS25's `Field` object if the API exposes one (to be verified in Phase 0). As built: each field's `polygonPoints`, falling back to `densityMapPolygon` (Phase 4).
- Otherwise build the outline from the same sampling technique, using the field id at a position.
- The field state (fruit, growth) is read with FieldState sampling at the field's center and sent per field. As built: the mod sends each field's `fieldState` values (Phase 4).

### 4. Backend (FastAPI): keep it, add structure

```
backend/app/
  main.py          -- app factory, static mount
  protocol.py      -- pydantic models for the envelope + each topic (source of truth; also exported to web/protocol/schema.json)
  sessions.py      -- Session: client ws, viewers, StateStore
  state_store.py   -- latest data per topic + seq; snapshot() for new viewers
  ws.py            -- /ws?pair=… (client role / viewer role), unchanged handshake
  assets.py        -- PUT/GET /api/maps/{mapId}/{hash}/… (disk cache dir, size limits, client-token auth)
```

- **New viewers** receive `snapshot` (all topics) and then live `update` messages per topic. This replaces the single `last_telemetry` dict.
- **Validation:** the backend validates envelopes with pydantic. A protocol version mismatch is reported to the viewer ("update your mod").
- **Local mode:**
  - `companion_client.py --local` starts the backend in-process (uvicorn) and uses a fixed pairing code.
  - You run one program and open `http://<pc-ip>:8123`.
  - Remote relay mode stays exactly as it works today.
- **Asset uploads** require the client's session token. The token is issued in the `welcome` reply, so random people can't fill a hosted relay.

### 5. Web: vanilla ES modules + Leaflet in world coordinates

```
web/
  index.html  style.css
  vendor/leaflet/          -- vendored Leaflet 1.9.4 (works offline/LAN, no CDN)
  src/
    main.js                -- bootstrap
    store.js               -- topic store: subscribe(topic, fn); applies snapshot/update
    connection.js          -- WebSocket, reconnect, protocol-version check
    map/
      mapView.js           -- L.map with L.CRS.Simple; world (x,z) ↔ LatLng adapter in ONE place
      overviewLayer.js     -- image overlay from meta.json bounds
      layers/
        playerLayer.js  vehiclesLayer.js  hotspotsLayer.js  farmlandsLayer.js  fieldsLayer.js
      icons.js             -- category → icon/colour (PDA-like legend)
      legend.js            -- toggles per layer/category, persisted in localStorage
    panels/
      fieldInfoPanel.js    -- click a field → details
    types.js               -- JSDoc typedefs mirroring backend protocol.py
```

As built, `map/` also has `followControl.js`, `glide.js`, `farmlandGeometry.js`, `fieldStyle.js` and `popupPlacement.js`.

Since Themes T1 (see [THEMES.md](THEMES.md#as-built-t1)), `index.html` is an empty `#app` that the theme draws: `themes/` holds the theme contract, the renderer and the Default theme; `widgets/` the live values (the old vehicle and farm panels); `data/selectors.js` the pure reads of the store; `ui/dom.js` the DOM helpers; and `map/mapFrame.js` the map's box with its overlays.

Since T2 and T3 (see [THEMES.md](THEMES.md#as-built-t3)): `ui/icons.js` is our own SVG icon set; `themes/newholland/` the New Holland style (data, CSS per palette and size class, and the map's edge toolbar); `ui/settings.js` the Settings button and panel shared by every theme; `ui/control.js` and `widgets/controls.js` the control buttons, which show the game's state until the controls project wires them; and `vendor/fonts/` the self-hosted Archivo font. Since T4: `widgets/vehicleScreen.js` holds the Vehicle screen's readout and vehicle cards, and the renderer groups slots for a theme's CSS.

- **Layer contract:** `createLayer(map, store) → { id, title, leafletLayer, legendItems }`. A layer subscribes only to its own topic(s). Adding a feature means adding one file and registering it.
- **Vehicle markers:** rotated SVG icons, interpolated between updates so 2 Hz still looks smooth. There is a "follow me" toggle and a click popup with vehicle details.
- **Fields:** polygons filled by fruit or growth state, like the PDA filter modes. They have field-number labels at higher zooms.
- **Type checking:** `// @ts-check` in every file, and a `jsconfig.json`. This gives editor type checking with no build. An optional `npx tsc --noEmit` can run in CI.

### 6. Tests and guardrails

- **Golden fixtures** (`fixtures/*.ndjson`): recorded from a real session in Phase 0, one per map.
  - Client tests: tailing, rotation, partial lines, seq reset.
  - Backend tests: pydantic validates every fixture line, and StateStore snapshot semantics hold.
  - Lua tests: the `Json.lua` encoder and the scheduler run under a plain Lua 5.1 (`busted`), with a stubbed `g_currentMission`. As built: `mod/tests/run.lua` runs through pytest with lupa (`mod/tests/test_lua.py`) and also covers the collectors against a stubbed game.
- **Protocol version:** bump `v` for breaking changes. Topics may gain fields freely, and the web side must ignore unknown fields.
- **Transform tests:** `mapView.js` world↔LatLng has one tested test page (`web/test.html` with known points). For example, world (0,0) maps to the image center, and +X maps to the right.

---

## Phases 0 to 4

**Phase 0: API spike (in game, about 1 session)** (done 2026-10-20)
- Build a debug mod that dumps to the log:
  - whether `io.open(append)` works under the modSettings directory on Windows (and on macOS if possible)
  - the structure of `ingameMap` hotspots
  - the `Field` API (polygon?)
  - the farmland lookup
  - the overview path in `missionInfo` / `map`
- Record the first `stream.ndjson` fixture.
- These results fix the exact API names that sections 2 and 3 assume.

**Phase 1: transport + protocol** (built; runs live on Windows; macOS still to test)
- Mod skeleton (`Companion`, `Json`, `Transport`, `Geo`, plus the `Hello`/`Env`/`Player`/`Vehicles`(controlled-only) collectors).
- Client tailer, `paths.py`, record/replay.
- Backend pydantic protocol and StateStore.
- Delete the pipe code.
- **Done when:** the current dashboard features work from the file stream on Windows, and the client runs on macOS in replay mode.

**Phase 2: map foundation** (built 2026-10-20; runs live, see [open checks](PLAN.md#open-checks))
- Leaflet + world CRS, the overview pipeline (hash + upload), the player marker, pan/zoom/follow.
- Delete `rotateDeg` and the other calibration knobs, plus `builder/make_map_config.py`.
- Fold the reusable parts of `import_map.py` (DDS → PNG) into `client/map_assets.py`.
- As built: `meta.json` carries `imageBounds` / `playableBounds` in world meters computed from `hello.ingameMap` (factor 2 only as a fallback). `hello` gained `gameDir` from `getAppBasePath()` (guarded; verified live on Kinlaig, 2026-10-22) so base-game `$data/` maps need no install-path guessing. The backend issues the upload token in a `welcome` reply and relays `map_assets {mapId, hash}` to viewers. Follow and the whole-map view are buttons; the layer toggle is Leaflet's layer control until Phase 3's legend.

**Phase 3: PDA layers** (built 2026-10-20; runs live)
- Hotspots (sell points, shops, productions, fuel, animals) with a legend.
- All vehicles with interpolation.
- Farmlands with owned/unowned shading.
- As built:
  - **Mod.** `hotspots` (10 s) sends every PDA hotspot except fields, vehicles, AI and the player, with category, name, position, owner farm and `visible`. `vehicles` (2 Hz) now lists every vehicle in `vehicleSystem.vehicles`, adding `motorized`, `attached` (from `getAttacherVehicle()`, unverified and guarded), `speed` and `propertyState`. Only the controlled vehicle keeps the dashboard detail. `farmlands` (10 s) sends id, owner farmId (0 = none), price, area, centre and `listed` (`showOnFarmlandsScreen`). `farmland_grid` is sent once per map: a cursor job of 4,096 lookups per frame samples `getFarmlandIdAtWorldPosition` on 4 m cells (at most 512 a side) and sends the grid run-length encoded (about 85 KB on a 2 km map).
  - **Scheduler.** Collectors may have `reset()`, called once per map, and `resend = true`. After a file rotation, `hello` and the last data of every resend topic are sent again, so a reader that starts late still gets the grid.
  - **Outlines are traced in the browser, not in the client** (`web/src/map/farmlandGeometry.js`). Every boundary edge of every farmland is walked into rings, the 4 m staircases are simplified with Douglas-Peucker (0.75 cell), and the result is drawn with the even-odd rule, so holes need no classification. No new message type and no client-side geometry: the grid passes through like any other topic, and tracing takes a few tens of ms on a phone.
  - **Web.** `vehiclesLayer.js` hides the vehicle the player drives (the player arrow is that one) and hitched implements. It has your vehicles, other farms' and loose implements as legend items. `hotspotsLayer.js` groups the categories like the PDA. `farmlandsLayer.js` draws your land, other farms' land and land for sale on a canvas renderer, with popups (area, price, owner). `legend.js` replaces Leaflet's layer control and keeps its choices in localStorage. `glide.js` holds the interpolation the player and vehicle markers share.
  - **Fixture.** `solek_v1.ndjson` now carries the PDA topics. Hotspots and vehicles are real (from the Phase 0 report, `fixtures/spike_solek_pda.json`); the farmland grid is synthetic (a Voronoi diagram around the real farmland centres) until a live session is recorded.

**Phase 4: fields** (built 2026-10-20; runs live, see [open checks](PLAN.md#open-checks))
- Field polygons, fruit/growth fill modes, a field info panel.
- As built:
  - **Mod 0.4.0.** Three collectors. `field_outlines` (once per map, resent after a rotation): each field's outline from its `polygonPoints` nodes through `getWorldTranslation`, falling back to `densityMapPolygon.pointsX/Z`. `fields` (15 s): id, farmland, sign position, area and the game's `fieldState` values (fruit, growth, ground type, spray, lime, plow, roller, stubble, weeds, stones). `crop_types` (once): every fruit type with its PDA map colours (`defaultMapColor`, `colorBlindMapColor`) and growth thresholds (harvest, withered, cut, preparing), the `FieldGroundType` names (guarded) and the field manager's lime/plow/spray maximums. Field state and ownership are separate: the owner comes from the farmlands topic.
  - **Backend.** Models for the three topics; outlines need at least three points.
  - **Web.** `fieldStyle.js` holds the colour modes as pure functions (tested in test.html): crop (the game's colours, converted from linear RGB), growth (plowed, cultivated, sown, growing, ready, harvested, withered), fertilizer (a red-to-green ramp over the spray level), lime, plowing and weeds. `fieldsLayer.js` draws the fields on the same canvas as the farmlands (`landRenderer` in mapView.js), so a tap finds the field over the farmland, with field numbers from zoom −1. The legend gained a drop-down (`legendChoice`) and a colour key (`legendExtra`). Tapping a field sets the store's `selectedField`; `fieldInfoPanel.js` shows owner, crop, stage and needs over the map, the same on a phone.
  - **Fixture.** The farmland grid and farmlands are now real (the first live Phase 3 session). Field positions are real; outlines (rectangles inside the real farmlands), crop types and all field states but one are synthetic.
  - **Still to verify live:** see [PLAN.md](PLAN.md#open-checks).

---

## After Phase 4

Changes since Phase 4 (2026-10-21 to 2026-10-22):

- **Map clicks** (`871daa4`): a click inside a field selects it, and also
  opens the popup of the farmland under it. The farmland is found by a hit
  test in world meters, so this works at any zoom. A click anywhere else
  closes the field panel.
- **Playable area only** (`c33e285`): the view stays inside the playable
  area. Zooming out stops where it fills the map, and panning stops at its
  edges. The overview image is clipped to it, and the map box is square on
  every screen.
- **Vehicle values** (`d1e9fda`): fuel, wear and hours through the FS25 API
  (see [Verified since Phase 0](#verified-since-phase-0)). The spike's
  report dumps the controlled vehicle's candidate values
  (`controlledDetail`).
- **Paid DLC maps** (`62ba93f`): the client recognises `pdlc_` maps and
  skips the image. The dashboard's plain map gets a faint 250 m grid and a
  "DLC map: no overview image" note.
- **Popups** (`5c72eb3`): popups flip below the click, or slide sideways, to
  stay inside the map. The field panel moves to the bottom-right when a
  popup would land on it.
- **Docs:** the command channel design for dashboard buttons (`51b0862`),
  and the Themes and layouts plan (`ab36061`, [THEMES.md](THEMES.md)).

## Themes T0 to T4

2026-10-23; the details are in each phase's "As built" note in
[THEMES.md](THEMES.md).

- **T0, design** (`321990c` to `7ac1f83`): the Deep Blue direction, then the
  Map and Vehicle screens, the night palette, the Settings panel and the
  other sizes, approved in Claude Design. Tokens, measurements and the
  layout grid are in THEMES.md's "Design result (T0)".
- **T1, foundation** (`4a9f19c`): themes as data with one renderer,
  Default as a theme that builds today's markup, widgets and selectors,
  tokens, and the map frame. No visible change.
- **T2, icons** (`c533084` to `245ba24`): 49 SVG icons of our own in the
  cab-symbol style, reviewed on a contact sheet. Nothing is read from the
  game for icons.
- **T3, New Holland style** (`804acb2`, `ef3ce7b`): the status bar, control
  column, tab bar with the vehicle readout, and the Map screen with its
  edge toolbar, Layers panel, scale and slot zoom, in day and night; the
  Settings panel with theme and Day / Night, in both themes; the Archivo
  font, self-hosted.
- **T4, Vehicle screen** (`5927a45`): the readout card, vehicle card with
  Show on map, condition tiles and implement rows, in day and night and
  every size; six vehicle-type icons; brand and shop category from the
  mod; each map slot's view remembered per device. The shop picture is
  left for later.
