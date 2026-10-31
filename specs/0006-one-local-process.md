# 0006: One local process

Status: live-checked
Mod: no change · Started: 2026-10-31 · Plan: [SIMPLIFY.md, S1](../docs/SIMPLIFY.md#s1-one-local-process-spec-0006)

## Goal

The client and the backend become one small app that tails the stream
file, keeps the latest state, writes commands, and serves the dashboard and
its WebSocket. The player sees the same dashboard; the code loses the relay
between two halves of one process (pairing, roles, the outbox, upload
tokens, hashed uploads). Local first: a hosted relay comes back later as an
add-on ([Hosted later](../docs/SIMPLIFY.md#hosted-later)).

## Behaviour

What the player sees doesn't change: every screen, the map image, the
buttons and their answers, Day and Night, 1180×820.

- **Starting it:** `python -m companion` (same as `--local` today), with
  `--replay FILE [--loop] [--speed X]`, `--record FILE`, `--port N`
  (8123), `--profile-dir`, `--stream`, `--no-map-sync`, `-v`. It prints
  the dashboard's address and its LAN address, as today. `--local`,
  `--backend` and `--pairing` go.
- **The dashboard** connects to its own origin's `/ws`. No `?pair=`, no
  `?backend=`, no `/api/info` lookup first. The connection pill: "backend
  offline" when the socket is down, "waiting for game" when no topic came
  for the stale time, else "live". "no pairing code" and "companion
  offline" go: the tailer is in the same process as the socket.
- **Order within a read:** the lines one poll of the stream file brings
  are sent latest-per-topic first (`hello` first), then the command acks
  in order (as the outbox did), so the cab state an ack's command changed
  is on the dashboard when its answer comes. A `hello` of a new session
  drops what came before it in that read (`server.in_order`).
- **The map image:** converted into the cache as today, and served from
  there; nothing is uploaded.

## Data contract

The mod and the stream file don't change. Protocol v1, same envelopes.

- **Viewer protocol** (server → dashboard), unchanged in shape:
  `snapshot`, `update`, `command_ack` (with `via`, `checked`, `unmoved`),
  `protocol_error`, `map_assets {mapId, hash}`, `client_status
  {connected: true}` (sent once on connect: the tailer is always there;
  the dashboard now ignores it, its store key `connection` is just
  `{backend}`).
- **Dashboard → server:** `{"type": "command", "id", "action", "value"?}`
  as today. The dashboard stops sending `{"type": "hello", "role":
  "viewer"}`; the server ignores anything but commands.
- **HTTP:** the dashboard's files at `/`, and
  `GET /api/maps/{mapId}/{hash}/{overview.png|overview_2048.png|meta.json}`
  read straight from the cache (`<cache>/maps/<mapId>/<hash>/`), same URLs
  as today. `PUT` and `/api/info` go.
- **Envelope checks** stay as they are (`protocol.py`, Pydantic) until S2.

No game API names are used.

## Commands

No change in what the mod gets: the same command files, numbered per
session, with `ref` now the server's own counter. The command writer is
called directly instead of through the relay. Refusals stay where they
are: action or value not allowed (server), no game (replay), game not
running, superseded (`cruise.set`).

## Plan

- **New package** `companion/` (replaces `client/` and `backend/`):
  - `tail.py`: today's `transport/file_tail.py` and `replay.py`.
  - `state.py`: today's `state_store.py`.
  - `commands.py`: today's `commands.py`, unchanged.
  - `protocol.py`: moved unchanged (S2 shrinks it).
  - `map_assets.py`: locate, convert and cache, unchanged; `upload`,
    `http_base` and `MapPublisher`'s upload go. Announces `map_assets`
    when the image is ready.
  - `server.py`: FastAPI: static `web/`, `/ws` for viewers, the map files
    from the cache. The viewers, the latest state, the pending command
    refs, `protocol_error`.
  - `paths.py` moved; `main.py` the command line; `__main__.py`.
- **Goes:** `client/relay.py`, `backend/app/sessions.py`,
  `backend/app/assets.py`'s PUT and token, `backend/app/main.py`'s own
  command line, pairing codes and roles, `client/companion_client.py`.
- **Web:** `connection.js` (no pairing, no `?backend=`, no hello),
  `selectors.js` `connectionStatus`, `themes/registry.js` comment,
  `test.html`'s connection checks.
- **Scripts:** `rig_check.py`, `allrow_check.py` connect to `/ws`
  directly (`--backend` becomes `--server`, default
  `http://localhost:8123`); `livewatch.py` and `build_mod.py` import from
  `companion`.
- **Tests:** client and backend tests move to `companion/tests/` and drop
  the relay, pairing and upload tests; `tests/test_golden.py` drives
  `companion.main` instead.
- **Docs:** `README.md`, `CLAUDE.md`, a `companion/README.md` (from the
  two old ones), `fixtures/README.md`, `docs/PLAN.md` ground rule "Local
  or hosted" → "Local first; hosted later as an add-on", DONE.md paths,
  `.claude/launch.json` (`-m companion`).
- **Risks:** the LAN address and binding on 0.0.0.0 stay as today; the
  Windows firewall rule is per python.exe, so it doesn't change.

Target: `client` + `backend/app` (3,375 lines) to about 1,800 in
`companion/`.

## Acceptance

Automated:
- [x] `tests/test_golden.py` passes against today's
      `fixtures/golden_viewer.ndjson`, unchanged, with nothing in
      `REMOVED_ON_PURPOSE` (the viewer protocol didn't change).
- [x] `companion/tests/test_server.py`: a viewer gets snapshot,
      `client_status`, then updates; a new session sends a snapshot; a
      command's ack goes only to the viewer that sent it; a disallowed
      action or value is refused; the map files are served from the
      cache and a bad map id or hash is a 404; there is no PUT.
- [x] `companion/tests/test_server.py`: one read's lines go out
      latest-per-topic, then the acks in order.
- [x] The moved tests pass (commands, tail, map assets without upload,
      paths, protocol, state, rig and All-row checkers).
- [x] `web/test.html` all green (connection pill without pairing).
- [x] Replay in the browser pane (`replay-solek`, now `-m companion`):
      every screen fills, the map image shows, at 1180×820 Day and Night.

Live check (in game, Vincent):
- [x] Solek: `python -m companion`, every screen fills, the map image
      shows.
- [x] Kinlaig (the DLC map): its overview shows (or the plain map, as
      today).
- [x] A light and a tool button each answer, and the cab state follows.
- [x] A dashboard reload, and a stream rotation (reload the savegame),
      keep working.

## Decisions

- The viewer protocol stays exactly as today, including `map_assets
  {mapId, hash}` and `client_status`, so the golden file passes unchanged
  and the web barely changes. SIMPLIFY.md's `GET /api/map/overview.png`
  and "reload when hello.mapId changes" would leave the dashboard
  guessing when the conversion is done; the hash is the cache folder's
  name anyway, so keeping it costs nothing. (Vincent, 2026-10-31.)
- The package is `companion/` (Vincent, 2026-10-31).
- `client_status` is always `connected: true`: the pill's "waiting for
  game" already comes from topics going stale (Vincent, 2026-10-31).

## Out of scope / open questions

- Hosted relay: later, its own spec.
- S2: `protocol.py` to the envelope check.

## Log

- 2026-10-31: drafted; map image, package name and client_status decided.
  Approved.
- 2026-10-31: built. `companion/` is 1,876 lines (from 3,375). The golden
  file passed unchanged; 124 tests (the relay, pairing and upload ones went) and `web/test.html` green; replay at
  1180×820 Day and Night fills, map image shown, pill Live. The Vehicle
  screen logs a `vehicleTools.js` error in the replay that the committed
  code (5d2d36c) logs too: not from this change, in NEXT.md.
- 2026-10-31: live-checked by Vincent: Solek and Kinlaig, a light and a
  tool button, a reload and a rotation all worked.
