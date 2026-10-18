# FS25 Companion

A free, real-time companion dashboard for **Farming Simulator 25**: live
position on the game map, vehicle status (speed, fuel, RPM, wear), attached
implements, weather and game clock — right in your browser, no login required.

The design mirrors [Truck Dash](https://github.com/Nethercap/truck-companion)
(ETS2/ATS), adapted to the FS25 modding ecosystem.

## Architecture

```
[FS25 + CompanionTelemetry.lua mod]  →  Windows named pipe \\.\pipe\fssimx
[Local bridge client (Python .exe)]  →  WebSocket  →  [Relay backend (FastAPI)]
                                                        →  WebSocket  →  [Your browser]
```

- The **mod** (Lua) exports a framed telemetry stream to the named pipe
  `\\.\pipe\fssimx`. Same pipe name and wire format as the
  [LS25_FSTelemetry](https://github.com/upsidedownLS13/LS25_FSTelemetry)
  base mod (MIT), plus position/heading/session fields.
- The **client** (Python) creates the pipe server, parses the frames, and
  relays them as JSON over a WebSocket to the backend, identified by a
  pairing code.
- The **backend** (FastAPI) is a stateless-ish relay: one game client and
  any number of browser viewers per pairing code. No accounts, no storage.
- The **web app** (vanilla JS) draws the vehicle on the game map image and
  updates the status panel.

Because the GIANTS engine's Lua `io` supports Windows named pipes, no game
DLL is needed (unlike the SCS Telemetry SDK) — just a Lua mod.

## Repository layout

```
mod/        Lua telemetry mod (zip the contents → FS25 mods folder)
client/     Local Python bridge client (pipe → WebSocket), PyInstaller-buildable
backend/    FastAPI WebSocket relay (deploy to Railway/Fly/…)
web/        Dashboard (static, no build step) + per-map configs in web/maps/
builder/    Scripts to generate map configs (image + world→image projection)
```

## Quickstart (development)

1. **Backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   python -m uvicorn main:app --port 8123
   ```
2. **Mod**: zip the *contents* of `mod/` (so `modDesc.xml` is at the zip
   root) and put the zip in your FS25 `mods/` folder. Enable it in the mod
   list.
3. **Client** (Windows, same machine as the game):
   ```bash
   cd client
   pip install -r requirements.txt
   python companion_client.py --backend ws://127.0.0.1:8123
   ```
   It prints a 6-digit pairing code.
4. **Dashboard**: serve `web/` (e.g. `python -m http.server` in `web/`) and
   open `http://localhost:8000/?pair=<CODE>`.
5. Start FS25 — the mod connects to the client's pipe automatically (either
   start order works; both sides retry).

Map assets are per-map and not included: see `web/maps/README.md` and
`builder/` for how to generate them.

## Roadmap / open items

- [ ] Real map projection for FS25 maps (placeholder in `web/maps/amdream.json`)
- [ ] Pan/zoom on the map canvas
- [ ] Field-state overlay (crop types / harvested areas) from map data
- [ ] Multi-vehicle tracking (all farm vehicles, not just the player's)
- [ ] System-tray mode for the client (`pystray`) + PyInstaller one-file build
- [ ] UDP transport (cross-platform, no local client needed) — the GIANTS
      engine ships luasocket
- [ ] Multiplayer: relay from the dedicated server host

## Attribution & licensing

- The telemetry mod is derived from
  [FarmingSimulatorTelemetry](https://github.com/Marciel032/FarmingSimulatorTelemetry)
  by Marciel Grützmann and the FS25 conversion
  [LS25_FSTelemetry](https://github.com/upsidedownLS13/LS25_FSTelemetry) by
  upsidedown — both MIT licensed.
- The relay architecture follows the pattern of
  [Truck Dash](https://github.com/Nethercap/truck-companion) (AGPL-3.0);
  this codebase is an independent, minimal implementation under MIT.
- This project reads only what the game's Lua API exposes and does not
  modify the game in any way.
