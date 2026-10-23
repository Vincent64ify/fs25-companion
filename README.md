# FS25 Companion

A free, real-time companion map for **Farming Simulator 25** that runs in your
browser. The goal is to replicate the in-game PDA: the map overview, fields
with their crop and growth state, farmlands, sell points, shops, productions
and every farm vehicle. You can open it on a second screen, a tablet or a
phone, on **Windows and macOS**.

Inspired by [Truck Dash](https://github.com/Nethercap/truck-companion)
(`Nethercap/truck-companion`), a companion dashboard for Euro Truck
Simulator 2 and American Truck Simulator.

> **Status:** the rework is built. Phases 0 to 4 (file transport, client and
> backend, the Leaflet map, the PDA's places, every vehicle, farmlands and
> fields) run live on Windows; macOS is still to test. Next:
> [Themes and layouts](docs/THEMES.md). See [docs/PLAN.md](docs/PLAN.md) for
> what's next, and [docs/DONE.md](docs/DONE.md) for what's built and the
> verified game API facts.

## How it works

```
FS25 + companion mod (Lua)
   │  writes one JSON message per line
   ▼
<profile>/modSettings/FS25_Companion/stream.ndjson
   │  tailed by
   ▼
Companion client (Python, runs next to the game)
   │  WebSocket + HTTP (map assets)
   ▼
Backend (FastAPI): local, or a hosted relay with pairing codes
   │  WebSocket
   ▼
Browser dashboard: Leaflet map in world coordinates, one layer per feature
```

- **Mod (Lua).** Small collectors, one per topic: `player`, `vehicles`,
  `hotspots`, `farmlands`, `farmland_grid`, `crop_types`, `field_outlines`,
  `fields`, `env`. Each runs at its own rate and writes
  versioned JSON envelopes (`{"v":1,"seq":…,"t":…,"topic":…,"data":…}`) to a
  plain file. Plain file I/O works the same on Windows and macOS, never blocks
  the game, and doesn't care about start order. Every collector is isolated, so
  a failing API call drops one topic, never the game.
- **Client (Python).** Finds the FS25 profile folder on Windows or macOS, tails
  the stream file, and forwards everything to the backend. It reads the map's
  overview image from the paths the mod reports (zipped mods included),
  converts it (DDS → PNG, plus a 2048 px copy for phones) and uploads it. It can record and replay sessions, so the
  dashboard can be developed without the game running.
- **Backend (FastAPI).** Validates messages, keeps the latest state per topic,
  gives new viewers a full snapshot, and stores the uploaded map images. It runs locally in one command or as a
  hosted relay where a pairing code links the game and the browser.
- **Dashboard (vanilla JS ES modules, no build step).** A Leaflet map in
  world meters (`lng = x`, `lat = -z`), with the overview image placed using
  the game's own map-extension values, so there's nothing to calibrate.
  Pan, zoom, follow-me, and one toggleable layer per feature: the PDA's
  places (sell points, shops, productions, animals, ...), every vehicle,
  farmland borders shaded by owner, and fields coloured like the PDA's
  filters (crop, growth, fertilizer, lime, plowing, weeds), with a legend
  that remembers your choices. Tap a field for its details.

## Repository layout

```
docs/PLAN.md   What's next: roadmap, open checks, ground rules
docs/DONE.md   What's built: architecture, phases, verified FS25 API facts
docs/THEMES.md Themes and layouts plan
docs/NEXT.md   Small fixes to do next
spike/         Phase 0 API probe mod (development only)
fixtures/      Recorded mod output used by tests and replay
mod/           Companion mod (Lua)
client/        Local client (Python)
backend/       FastAPI backend
web/           Browser dashboard (src/ modules, vendor/leaflet, vendor/fonts)
```

`scripts/build_mod.py` zips the mod.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | In-game API spike: file I/O, heading, hotspots, fields, farmlands, map geometry | ✅ done |
| 1 | New mod skeleton + file transport, client tailer with record/replay, backend protocol and state store; remove the named pipe | ✅ runs live on Windows (macOS still to test) |
| 2 | Leaflet map in world coordinates, overview image pipeline, player marker, pan/zoom/follow | ✅ runs live |
| 3 | PDA layers: sell points, shops, productions, animals; all vehicles; farmland ownership | ✅ runs live |
| 4 | Fields: outlines, crop and growth colours (PDA colours), field info panel | ✅ runs live |
| next | Themes and layouts: in-cab terminal styles, starting with New Holland | planned, see [THEMES.md](docs/THEMES.md) |
| later | Game controls from the dashboard, sell prices, missions, AI workers, multiplayer farm colours, tray app | ideas, see [PLAN.md](docs/PLAN.md) |

The checks still open for Phases 1 to 4 are in [docs/PLAN.md](docs/PLAN.md#open-checks).

## Development

Requirements: Python 3.12+, and FS25 on Windows or macOS for live testing.

```bash
pip install -r requirements-dev.txt

# install the mod into FS25's mods/ folder
python scripts/build_mod.py --install

# start the client with a built-in backend, then open http://localhost:8123
python client/companion_client.py --local

# no game? replay a recording instead
python client/companion_client.py --local --replay fixtures/solek_v1.ndjson --loop

# all tests: mod (through lupa), client, backend
python -m pytest mod/tests client/tests backend/tests

# map transform tests: open http://localhost:8123/test.html (all green)
```

The game and the client can start in any order. Details:
[mod](mod/README.md), [client](client/README.md), [backend](backend/README.md).

**Probe the game API (Phase 0 spike).** See [spike/README.md](spike/README.md).

FS25 mod folders:

- **Windows:** `Documents/My Games/FarmingSimulator2025/mods/`
- **macOS:** `~/Library/Application Support/FarmingSimulator2025/mods/`

## License

MIT, see [LICENSE](LICENSE). This project reads only what the game's Lua API
exposes and doesn't change your game or savegames.

Bundled third-party files keep their own licences: Leaflet (BSD-2-Clause,
`web/vendor/leaflet/LICENSE`) and the Archivo font (SIL Open Font License
1.1, `web/vendor/fonts/OFL.txt`).
