# Companion

Runs next to the game. It tails the mod's stream file, keeps the latest
state, writes the dashboard's commands where the mod reads them, and
serves the dashboard and its WebSocket. One process, pure Python, the same
on Windows and macOS ([spec 0006](../specs/0006-one-local-process.md)).

## Run

From the repository root:

```bash
pip install -r companion/requirements.txt

# open http://localhost:8123, or the LAN address it prints
python -m companion

# no game: replay a recording (any OS)
python -m companion --replay fixtures/solek_v1.ndjson --loop
```

Options: `--profile-dir` or `--stream` to skip the profile folder search,
`--record FILE` to save what the game sends, `--speed` and `--loop` for
replay, `--port` (8123), `--no-map-sync`, `-v`.

Converted map images are cached in `%LOCALAPPDATA%\FS25Companion` (Windows)
or `~/Library/Caches/FS25Companion` (macOS).

## How it works

```
main.py        the command line: wires the tailer, the hub and the server
tail.py        polls the stream file (or replays a recording)
server.py      the Hub (viewers, latest state, commands waiting for an
               answer) and the FastAPI app: web/, /ws, the map images
state.py       latest envelope per topic; a new sessionId resets it
protocol.py    the envelope check and a command's shape (plain Python)
commands.py    writes the dashboard's commands to cmd/<n>.xml
map_assets.py  finds and converts the map's overview image
paths.py       finds the FS25 profile folder and the cache folder
```

- `paths.py` finds the FS25 profile folder. On Windows it asks Windows for
  the Documents folder (`SHGetKnownFolderPath`, which follows OneDrive). On
  macOS it checks `~/Library/Application Support` and the App Store
  container.
- `tail.py` polls the file every 50 ms (10 ms for 2 s after a command). It
  keeps an offset, buffers partial lines, and starts again from 0 when the
  file is new (the mod rotated it). Lines that aren't JSON envelopes are
  dropped. Each poll's lines go to the hub together.
- `protocol.py` checks the envelope only; what a topic's data holds is
  described once, in `web/src/types.js` (specs/0007). A command is checked
  for its shape; the mod's `Commands.ACTIONS` is the one list of actions
  and their values. `commands.py` writes the dashboard's action name, its
  value and its tool as they are, every command as it comes (each says the
  state it wants, specs/0008), and answers "update the mod" while the
  mod's hello lacks `commands.actions: 3` (a mod before 0.10.0).
- `server.py`: the hub checks each envelope (`protocol.py`) and sends
  one read out as the latest envelope per topic, `hello` first, then the
  command acks in order: the cab state an ack's command changed is on the
  dashboard when its answer comes. A viewer gets a `snapshot` on connect
  and on a new game session, then one `update` per envelope. The viewer
  protocol is in the module's docstring.
- `map_assets.py`: when the mod's `hello` names a new map, it finds the map
  XML from `hello.mapDir` / `mapXmlFilename` (and `gameDir` for base-game
  `$data/` paths; reads inside zipped mods too), falling back to a lookup by
  map id in `mods/`. It converts the PDA overview image to PNG plus a
  2048 px copy and writes `meta.json` with the world rectangle the image
  covers (from `hello.ingameMap`), in the cache under `<mapId>/<hash>/`.
  The server serves them at `/api/maps/<mapId>/<hash>/<name>` and tells
  the viewers (`map_assets`). Debug one map with
  `python -m companion.map_assets --map-id FS25_Solek.SampleModMap`.

## Tests

```bash
python -m pytest companion/tests tests
```

`tests/test_golden.py` pins every message a viewer gets from the Solek
replay ([fixtures/golden_viewer.ndjson](../fixtures/golden_viewer.ndjson)).
