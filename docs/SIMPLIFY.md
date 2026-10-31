# Simplify

A plan to make the project smaller without losing anything the player has
today. It changes the code in place, one phase at a time, so every phase
ends with a dashboard that works the same and passes its checks. Local
first: the hosted relay comes back later as an add-on (see
[Hosted later](#hosted-later)).

Each phase gets its own spec in [specs/](../specs/README.md) when it
starts, as usual: approved before code, tests first. This file is the
roadmap; the specs carry the detail.

## Why

The game forces one thing: the mod writes a file and something tails it.
Most of the rest grew on top:

- **Four hops for a local game.** Mod → file → client → WebSocket →
  backend → WebSocket → browser. In local mode the client and backend are
  one process but still talk through the relay protocol (pairing, roles,
  an outbox, upload tokens, hashed map uploads).
- **The protocol is written several times.** Topic shapes in the Lua, in
  Pydantic (`backend/app/protocol.py`) and in JSDoc (`web/src/types.js`).
  The command list in the backend (`COMMAND_ACTIONS`, `COMMAND_VALUES`,
  `COMMAND_VALUE_OPTIONAL`), the client (`ACTIONS`), the mod
  (`Commands.ACTIONS`) and the web (`widgets/controls.js`). A new button
  touches four layers.
- **Toggles aren't safe to repeat.** A lost or doubled toggle does the
  wrong thing, so the command path grew numbering, slot freeing,
  superseding and timeouts (specs 0004 and 0005 fixed bugs there).
- **Two ways to run most actions in the mod.** The game's key, else a
  specialization setter (`fallback`), each with its own checks.
- **Research code in the product tree.** `spike/`, the rig and All-row
  checkers and their fixtures sit beside the code they informed.

## Keep

- The NDJSON stream file, its envelope and Protocol v1 for topics.
- `mod/src/Api.lua` guards, world meters, the one transform in
  `web/src/map/mapView.js`.
- No build step: vanilla ES modules with `// @ts-check`, vendored Leaflet
  and fonts.
- The store and selectors in `web/src/`, the map layers, the look.
- The theme engine (`web/src/themes/`): it stays as it is, ready for
  more brands.
- `--replay` and `--record`, and the `replay-solek` check at 1180×820.
- The game's own keys over workarounds.

## Baseline (2026-10-31)

Lines of code, for the before/after (tests and fixtures not counted):

| Area | Lines | Files |
|---|---|---|
| `mod/src` | 4,773 | 19 |
| `client` | 2,330 | 16 |
| `backend/app` | 1,045 | 7 |
| `spike` + `scripts` | 4,333 | 8 |

The targets in each phase are estimates to check against, not promises.

## Phases

| Phase | What | Spec | Mod | Live check |
|---|---|---|---|---|
| S0 | Safety net: a golden replay test | none (tests only) | no | no |
| S1 | One local process | 0006 | no | yes |
| S2 | The protocol in one place | 0007 | yes | yes |
| S3 | Commands say the state they want | 0008 | yes | yes |
| S4 | One way to run each action | 0009 | yes | yes |
| S5 | Research code apart | none | no | no |

Order: S0 to S5 in that order. S1 → S2 → S3 → S4 each build on the last,
and S2 to S4 all touch `Commands.lua`.

**Spec 0003 is closed** (mod 0.8.17) with what's confirmed in game; the
rigs it moved out (sprayer, plow, baler, cover, Attach, the rig shapes)
each get their own spec after the S phases, on the new command path. The
S phases keep what 0003 confirmed: the cards and their buttons (lower,
fold, turn on, tip, tip side, pipe, detach), the All row, the other keys,
and an ok that means the tools moved (revision 2) or the trailer tipped
(revision 3). The mowers and trailers are part of the S2 to S4 button
rounds.

### S0: Safety net

Before moving anything, pin down what the dashboard receives today.

- A test that runs `fixtures/solek_v1.ndjson` through the client and
  backend in one process (as `--local --replay` does) and records every
  message a viewer gets: the snapshot, updates, `client_status`,
  `map_assets`, and the acks for a fixed list of commands. Saved as
  `fixtures/golden_viewer.ndjson`.
- S1 and S2 must reproduce it, apart from the fields they remove on
  purpose (pairing, tokens), which the test lists.

Done when: the golden test passes on today's code.

Done (2026-10-31): `tests/test_golden.py` runs the real
`companion_client.run()` with `--local --replay`, feeding one envelope at a
time (so nothing is coalesced and the order is fixed) and answering the
command files as a fake mod. Beyond the plan it also pins a second viewer's
snapshot, a superseded `cruise.set`, an ack sent again after a rotation
(nobody gets it), a same-session hello (an update) and a new session (a
snapshot), and that an ack reaches only the viewer that asked. The golden
file is 3,128 lines; the test takes about 2 s.

### S1: One local process (spec 0006)

The client and backend become one app that tails the file, keeps the
latest state, writes commands, serves `web/` and one WebSocket, and
serves the map overview from its own cache.

- **New package** `companion/` (replacing `client/` and `backend/`):
  - `tail.py`: today's `transport/file_tail.py` and `replay.py`.
  - `state.py`: latest envelope per topic, snapshot on a new session
    (today's `state_store.py`).
  - `commands.py`: today's `CommandWriter`, called directly instead of
    through the relay.
  - `server.py`: FastAPI with the static dashboard, `/ws` for viewers and
    `GET /api/map/overview.png` (and the 2048 px copy) straight from the
    cache.
  - `map_assets.py`: locate and convert the overview, unchanged; no
    upload, digest or token.
  - `paths.py`, `main.py` (the command line: `--replay`, `--record`,
    `--port`, `--profile-dir`, `--loop`, `--speed`, `--no-map-sync`).
- **Goes:** `client/relay.py` (`Outbox`, `WebSocketRelay`),
  `backend/app/sessions.py` (`SessionRegistry`), pairing codes, the
  client/viewer hello roles, `assets.py`'s token PUT, the `map_assets`
  hash message (the viewer reloads the image when `hello.mapId` changes).
- **Viewer protocol** stays as it is: `snapshot`, `update`,
  `command_ack`, `protocol_error`. `client_status` becomes the game's
  status: whether the stream file is live.
- **Web:** `connection.js` drops `?pair=` and `?backend=` and connects to
  its own origin.
- **Launch configs** and `README.md` change to `python -m companion ...`.
- **Ground rules:** "Local or hosted" becomes "Local first; hosted later
  as an add-on" in PLAN.md.

Tests: the golden test from S0, today's client and backend tests moved
and trimmed (relay and pairing tests go), `web/test.html` green.

Built (2026-10-31, spec 0006): `companion/` is 1,876 lines (from 3,375).
It keeps `map_assets {mapId, hash}` and the same map URLs, served from
the cache, and `client_status` is always connected; so the golden file
passed unchanged. Live check open.

Live check: Solek and Kinlaig (the DLC map's overview), every screen
fills, a light and a tool button work, a reload and a rotation.

Target: `client` + `backend/app` from about 3,400 lines to about 1,800.

### S2: The protocol in one place (spec 0007)

- **Topics:** the server checks the envelope only (`v`, `seq`, `t`,
  `topic`, `data` is an object), in plain Python. The per-topic Pydantic
  models go; so does the `pydantic` dependency if nothing else needs it.
  `web/src/types.js` is the one description of every topic's fields,
  and the dashboard keeps ignoring what it doesn't know.
- **Commands:** the mod's `Commands.ACTIONS` is keyed by the dashboard's
  action name (`lights.toggle`), and checks values and ranges itself. The
  server passes `action` and `value` through after a shape check (action
  matches `^[a-zA-Z.]{1,40}$`, value a number or absent), and the mod
  refuses anything else with an ack, as it already does.
  `COMMAND_ACTIONS`, `COMMAND_VALUES`, `COMMAND_VALUE_OPTIONAL` and the
  client's `ACTIONS` map go.
- **Matching versions:** the command file's `action` changes meaning, so
  the server reads `hello.modVersion` and refuses commands (ack: "update
  the mod") below the first mod that speaks the new names.

Tests: `mod/tests/run.lua` for the new keys and range checks; the server
tests for pass-through and the shape check; the golden test.

Live check: every button on the Vehicle, Harvester and Loader pages once.

Target: `protocol.py` (about 500 lines) to under 80.

### S3: Commands say the state they want (spec 0008)

The dashboard sends the state it wants instead of "toggle":
`lights.set {value: 0..n}`, `beacon.set`, `hazard.set`, `engine.set`,
`cruise.set` (already), `ai.set`, and per tool `tool.lower`, `tool.fold`,
`tool.turnOn`, `tool.pipe`, each with the tool's id and
0 or 1. The mod reads the current state (from what the `cab` topic
already reports), presses the game's key only when it differs, and answers
ok with `"already": true` when nothing needed doing.

- Real one-shot actions stay as they are: select next / previous, tip
  side, rotate plow, bale counter reset, the tool's other keys, attach,
  detach.
- **What goes:** in the client, the slot freeing by `commands.next`,
  superseding with its own acks and `IN_GAME_TIMEOUT_S`. A set command
  that gets no answer is simply sent again (latest value wins per action
  and tool). In the web, any guessing at the next state of a toggle.
- **Needs first:** a verified reading for each state it compares. The
  T6 live check (cruise, PTO, fill levels) is still open, so S3 lists
  each reading as verified or not, and an action whose reading isn't
  verified stays a toggle until it is.

Tests: `run.lua` for "already", for pressing once, and for each
reading; the client's resend; the golden test with set commands.

Live check: each set command twice in a row (the second answers
"already"), and Cruise − / + held.

### S4: One way to run each action (spec 0009)

- **Evidence first:** the mod logs which path ran ("via KEY" or "via
  setter"). From the `livewatch.py` logs of the live checks so far, and
  one run through every button on a few rigs, list the actions that ever
  ran "via setter" (this is also spec 0003's last log check, moved here
  at its close).
- **Then:** drop `fallback` setters for every action that always ran its
  key. Keep `direct` setters where the game has no key (the cruise set
  speed, select and detach by id). An action that did need its setter
  keeps it, noted in the spec and NEXT.md as a workaround.
- **Split by part:** `VehicleState.lua` and `collectors/Vehicles.lua`
  (about 900 lines each) split into motor, lights, fill and tools, with
  no change in what they send (`run.lua` pins it).

Target: `Commands.lua` (1,382 lines) to about 900.

Live check: the same button round as S2.

### S5: Research code apart

- `spike/`, `fixtures/convert_spike.py`, `fixtures/extract_spike_report.py`
  and `fixtures/spike_*` move to `research/`, with a README that points
  at DONE.md for what they proved.
- `scripts/rig_check.py` and `scripts/allrow_check.py` stay in
  `scripts/` with `livewatch.py`: the rig specs that follow spec 0003
  need them after the S phases.
- The census fixture and `mod/tests/spike_rigs.lua` stay where they are:
  `run.lua`'s capability tests read them.

## Hosted later

When the hosted relay comes back, it's a separate small service plus a
`--relay <url>` option on the local app that forwards the same viewer
messages up and commands down, with pairing and tokens living only there.
The review's F3 and F4 ([NEXT.md](NEXT.md)) belong to that work. Nothing
local depends on it.

## Decisions

- 2026-10-31: the theme engine stays; it's not part of this plan.
- 2026-10-31: spec 0003 is closed with what's confirmed; its open rigs
  become their own specs after the S phases.
- 2026-10-31: the new package is `companion/`; S1 keeps `map_assets
  {mapId, hash}` and today's map URLs, served from the cache (spec 0006).
