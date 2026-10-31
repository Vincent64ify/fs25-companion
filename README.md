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
> fields) run live on Windows; macOS is still to test. The first theme, a
> New Holland style, has its chrome, Map, Vehicle and Implement screens,
> and a Harvester page for combines; it fits tablets and monitors and goes
> full screen ([Themes and layouts](docs/THEMES.md)). Controls work live
> from the dashboard: lights, cruise, engine, AI worker and the implements,
> down to picking one tool. See
> [docs/PLAN.md](docs/PLAN.md) for what's next, and
> [docs/DONE.md](docs/DONE.md) for what's built and the verified game API
> facts.

## How it works

```
FS25 + companion mod (Lua)
   │  writes one JSON message per line
   ▼
<profile>/modSettings/FS25_Companion/stream.ndjson
   │  tailed by
   ▼
Companion (Python, runs next to the game): tails it, keeps the state,
   │  writes commands, serves the dashboard
   │  WebSocket + HTTP (map images)
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
- **Companion (Python, FastAPI).** One program. Finds the FS25 profile folder
  on Windows or macOS, tails the stream file, validates messages, keeps the
  latest state per topic, gives new viewers a full snapshot, and writes the
  dashboard's commands where the mod reads them. It reads the map's overview
  image from the paths the mod reports (zipped mods included), converts it
  (DDS → PNG, plus a 2048 px copy for phones) and serves it. It can record
  and replay sessions, so the dashboard can be developed without the game
  running. A hosted relay may come back later as an add-on.
- **Dashboard (vanilla JS ES modules, no build step).** A Leaflet map in
  world meters (`lng = x`, `lat = -z`), with the overview image placed using
  the game's own map-extension values, so there's nothing to calibrate.
  Pan, zoom, follow-me, and one toggleable layer per feature: the PDA's
  places (sell points, shops, productions, animals, ...), every vehicle,
  farmland borders shaded by owner, and fields coloured like the PDA's
  filters (crop, growth, fertilizer, lime, plowing, weeds), with a legend
  that remembers your choices. Tap a field for its details.
- **Themes.** The dashboard is styled after a tractor's in-cab terminal.
  For now there is one theme, **New Holland style**, after the IntelliView
  12 terminal (more brands later, picked in Settings), with a status
  bar, a map toolbar, the vehicle's lights, engine and implement state, a
  speed and fuel readout, a Vehicle screen (speed arc, gear and rpm, fuel,
  temperature, wear, hours and the attached implements), and a Day / Night
  switch. A bookmark can choose too: `?theme=newholland&palette=night`.
- **On a tablet.** The Settings panel (and New Holland's status bar) has a
  Full screen button, where the browser allows it. On an iPad, Safari's
  Share → Add to Home Screen opens the dashboard without browser bars.
  Keep screen on only works over `localhost` or HTTPS; on the LAN address,
  set the tablet's own auto-lock instead.

## Repository layout

```
docs/PLAN.md   What's next: roadmap, open checks, ground rules
docs/DONE.md   What's built: architecture, phases, verified FS25 API facts
docs/THEMES.md Themes and layouts plan
docs/NEXT.md   Small fixes to do next
spike/         Phase 0 API probe mod (development only)
fixtures/      Recorded mod output used by tests and replay
mod/           Companion mod (Lua)
companion/     The companion: tailer, state, commands and server (Python)
tests/         The golden replay test
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
| themes | In-cab terminal styles: New Holland style chrome, Map and Vehicle screens, tablet sizes, full screen (T0 to T5), more game data (T6) | ✅ done; T6 waits for a live check, see [THEMES.md](docs/THEMES.md) |
| controls | Game controls from the dashboard through an in-mod command channel (C0 to C4) | C0 to C3 work live on Windows; C4 (macOS, multiplayer) next, see [PLAN.md](docs/PLAN.md) |
| screens | Implement screen (rig, tool card, tank estimates, weight limit) and the Harvester page for combines | Implement screen in its live check (weight limit and combine fold confirmed); Harvester built, see [PLAN.md](docs/PLAN.md#open-checks) |
| later | More screens (Fields, Farm, Work, Yard), sell prices, missions, AI workers, multiplayer farm colours, tray app | ideas, see [PLAN.md](docs/PLAN.md) |

The checks still open for Phases 1 to 4 are in [docs/PLAN.md](docs/PLAN.md#open-checks).

## Development

Requirements: Python 3.12+, and FS25 on Windows or macOS for live testing.

```bash
pip install -r requirements-dev.txt

# install the mod into FS25's mods/ folder
python scripts/build_mod.py --install

# start the companion, then open http://localhost:8123
python -m companion

# no game? replay a recording instead
python -m companion --replay fixtures/solek_v1.ndjson --loop

# all tests: mod (through lupa), the companion, the golden replay
python -m pytest mod/tests companion/tests tests

# map transform tests: open http://localhost:8123/test.html (all green)
```

The game and the companion can start in any order. Details:
[mod](mod/README.md), [companion](companion/README.md).

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
