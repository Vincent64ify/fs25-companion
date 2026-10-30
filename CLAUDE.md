# FS25 Companion

A live dashboard for Farming Simulator 25 on a tablet or second monitor.
The mod (`mod/`, Lua) writes an NDJSON file; the client (`client/`, Python)
tails it and runs or feeds the backend (`backend/`, FastAPI); the web
dashboard (`web/`, vanilla ES modules + Leaflet) shows it and sends
commands back.

## Before you code

- **Features are spec-driven.** Read the feature's spec in `specs/` first
  ([specs/README.md](specs/README.md) has the workflow). No spec yet → draft
  one from `specs/_template.md` (or `/spec new <name>`) and get it approved
  before writing code. Small fixes go in `docs/NEXT.md` and need no spec.
- **Ground rules** are in [docs/PLAN.md](docs/PLAN.md#ground-rules): same on
  Windows and macOS, no build step, one piece per feature, world meters,
  never break the game (unverified game API names go through
  `mod/src/Api.lua`), Protocol v1 (topics gain fields freely).
- **Game API facts** that are confirmed live are in
  [docs/DONE.md](docs/DONE.md#verified-game-api-facts). Anything not there
  is unverified: say so in the spec's Data contract table.
- **Design** (look, layout, icons) is in [docs/THEMES.md](docs/THEMES.md).

## While you code

- Write the spec's automated acceptance tests first, then the code.
- Match the code around you: `// @ts-check` and JSDoc in `web/`, short
  comments that say where a game name comes from in `mod/`.
- When behaviour changes from the spec, update the spec in the same
  change: it must always say what the code does now.
- A mod change bumps the version in `mod/modDesc.xml`.

## Checking

```bash
python -m pytest mod/tests client/tests backend/tests
```

- `web/test.html` (all green) through the `replay-solek` launch config
  (`.claude/launch.json`, port 8124): `http://localhost:8124/test.html`.
- The same replay is the browser-pane check for screens at 1180×820, day
  and night.
- Live checks need the game: list them in the spec's Live check section
  for Vincent to run; never tick them yourself.
- During a live check the game runs on this PC: run
  `python scripts/livewatch.py` in the background (the mod's log lines,
  acks and cab changes) and the `live` launch config (port 8125) to press
  the dashboard's buttons; Vincent sets up each rig and says what the game
  showed. Read the files, never guess.

## When it's done

- Tick the automated boxes, set the spec's Status to built, add a Log line.
- After a live check: tick the boxes Vincent confirmed, move verified API
  names into DONE.md, set Status to live-checked, update the table in
  `specs/README.md` and "Where things stand" in PLAN.md.
