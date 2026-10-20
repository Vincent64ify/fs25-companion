# FS25 Companion

A free, real-time companion map for **Farming Simulator 25** that runs in your
browser. The goal is to replicate the in-game PDA: the map overview, fields
with their crop and growth state, farmlands, sell points, shops, productions
and every farm vehicle. You can open it on a second screen, a tablet or a
phone, on **Windows and macOS**.

> **Status: under rework.** The first prototype (Windows named pipe and a
> single position arrow) is being replaced by a cross-platform, layered design.
> Phase 0 (verifying the game's API in game) is done. Phase 1 (file
> transport, client, backend protocol) and Phase 2 (Leaflet map in world
> coordinates, overview image pipeline, player marker) are built and tested
> offline with a replay, and still need their first live run in the game. See
> [docs/PLAN.md](docs/PLAN.md) for the full plan and the verified API facts.

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
  `hotspots`, `fields`, `farmlands`, `env`. Each runs at its own rate and writes
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
  Pan, zoom, follow-me, and one toggleable layer per feature.

## Repository layout

```
docs/PLAN.md   Architecture, phased roadmap, verified FS25 API facts
spike/         Phase 0 API probe mod (development only)
fixtures/      Recorded mod output used by tests and replay
mod/           Companion mod (Lua)
client/        Local client (Python)
backend/       FastAPI backend
web/           Browser dashboard (src/ modules, vendor/leaflet)
```

`scripts/build_mod.py` zips the mod.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | In-game API spike: file I/O, heading, hotspots, fields, farmlands, map geometry | ✅ done |
| 1 | New mod skeleton + file transport, client tailer with record/replay, backend protocol and state store; remove the named pipe | built, live test pending |
| 2 | Leaflet map in world coordinates, overview image pipeline, player marker, pan/zoom/follow | built, live test pending |
| 3 | PDA layers: sell points, shops, productions, animals; all vehicles; farmland ownership | planned |
| 4 | Fields: outlines, crop and growth colours (PDA colours), field info panel | planned |
| later | Sell prices, missions, AI workers, multiplayer farm colours, tray app | ideas |

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
