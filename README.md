# FS25 Companion

A free, real-time companion for **Farming Simulator 25** that runs in your
browser: the in-game PDA's map, and an in-cab terminal for the vehicle you
drive, with buttons that work the game. You can open it on a second
screen, a tablet or a phone, on **Windows and macOS**.

Inspired by [Truck Dash](https://github.com/Nethercap/truck-companion)
(`Nethercap/truck-companion`), a companion dashboard for Euro Truck
Simulator 2 and American Truck Simulator.

> **Status:** it runs live on Windows; macOS is still to test. What each
> feature does and where it stands is in [specs/](specs/README.md), and
> what's next in [docs/PLAN.md](docs/PLAN.md).

## What it does

- **The map.** The PDA's overview in world coordinates, with pan, zoom and
  follow-me, and one layer per feature: the PDA's places (sell points,
  shops, productions, animals), every vehicle, farmland borders shaded by
  owner, and fields coloured like the PDA's filters (crop, growth,
  fertilizer, lime, plowing, weeds). Tap a field for its details.
- **The vehicle.** Speed, gear, fuel, temperature and wear, the rig with a
  card per tool, the field you're working with the trail you've made, and
  pages of their own for a combine and a loader.
- **Controls.** Lights, cruise, engine, and each tool's fold, lower, turn
  on, pipe, tip and cover, from the dashboard. A button presses the game's
  own key and shows the game's state.
- **In-cab look.** Styled after a tractor's terminal, for now a New
  Holland style after the IntelliView 12, in day and night. A bookmark can
  choose: `?theme=newholland&palette=night`.
- **On a tablet.** Settings has a Full screen button, where the browser
  allows it. On an iPad, Safari's Share → Add to Home Screen opens the
  dashboard without browser bars. Keep screen on only works over
  `localhost` or HTTPS; on the LAN address, set the tablet's own auto-lock
  instead.

## How it works

```
FS25 + companion mod (Lua)
   │  writes one JSON message per line
   ▼
<profile>/modSettings/FS25_Companion/stream.ndjson
   │  tailed by
   ▼
Companion (Python, runs next to the game): keeps the state,
   │  writes commands, serves the dashboard
   ▼
Browser dashboard: a Leaflet map and the vehicle's screens
```

The mod only writes a plain file and reads small command files, so it
works the same on Windows and macOS and never blocks the game. More in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

Requirements: Python 3.12+, and FS25 on Windows or macOS.

```bash
pip install -r requirements.txt

# install the mod into FS25's mods/ folder, then enable it in the savegame
python scripts/build_mod.py --install

# start the companion, then open http://localhost:8123
python -m companion

# no game? replay a recording instead
python -m companion --replay fixtures/solek_v1.ndjson --loop
```

The game and the companion can start in any order. Details:
[mod](mod/README.md), [companion](companion/README.md).

FS25 mod folders:

- **Windows:** `Documents/My Games/FarmingSimulator2025/mods/`
- **macOS:** `~/Library/Application Support/FarmingSimulator2025/mods/`

## Development

```bash
pip install -r requirements-dev.txt

# all tests: the mod (through lupa), the companion, the golden replay
python -m pytest mod/tests companion/tests tests

# the dashboard's tests: open http://localhost:8123/test.html (all green)
```

```
specs/         one file per feature: what it does, how it's checked, its log
docs/          ARCHITECTURE (how it works, ground rules), GAME-API (verified
               game API facts), THEMES (the design), PLAN (what's next),
               NEXT (small fixes)
mod/           the companion mod (Lua)
companion/     the companion: tailer, state, commands and server (Python)
web/           the dashboard (src/ modules, vendored Leaflet and fonts)
tests/         the golden replay test
fixtures/      recorded mod output, for the tests and replay
scripts/       build the mod, live-check helpers
research/      the spike mods and their data (development only)
```

New features start as a spec: [specs/README.md](specs/README.md).

## License

MIT, see [LICENSE](LICENSE). This project reads only what the game's Lua API
exposes and doesn't change your game or savegames.

Bundled third-party files keep their own licences: Leaflet (BSD-2-Clause,
`web/vendor/leaflet/LICENSE`) and the Archivo font (SIL Open Font License
1.1, `web/vendor/fonts/OFL.txt`).
