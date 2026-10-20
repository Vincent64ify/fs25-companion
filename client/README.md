# Companion client

Runs next to the game. It tails the mod's stream file and forwards each
envelope to the backend over a WebSocket. Pure Python, the same on Windows
and macOS.

## Run

```bash
pip install -r client/requirements.txt -r backend/requirements.txt

# one program: the client starts the backend too. Open http://localhost:8123
python client/companion_client.py --local

# no game: replay a recording (any OS)
python client/companion_client.py --local --replay fixtures/solek_v1.ndjson --loop

# hosted relay: open <relay>/?pair=<code>
python client/companion_client.py --backend wss://relay.example.com
```

Options: `--profile-dir` or `--stream` to skip the profile folder search,
`--record FILE` to save what the game sends, `--speed` and `--loop` for
replay, `--port` for `--local`, `--no-map-sync`, `-v`.

## How it works

- `paths.py` finds the FS25 profile folder. On Windows it asks Windows for
  the Documents folder (`SHGetKnownFolderPath`, which follows OneDrive). On
  macOS it checks `~/Library/Application Support` and the App Store
  container.
- `transport/file_tail.py` polls the file every 50 ms. It keeps an offset,
  buffers partial lines, and starts again from 0 when the file shrinks (the
  mod rotated it). Lines that aren't JSON envelopes are dropped.
- `transport/replay.py` plays a recording back with its original timing.
- `relay.py` keeps the latest envelope per topic. A backlog or a slow link
  skips intermediate values instead of queueing them. `hello` always goes
  first, and everything is sent again after a reconnect.
- `map_sync.py`: when the mod's `hello` names a map that `web/maps/` doesn't
  have yet, it imports that map's overview image. This uses the prototype's
  importer, which looks for base-game maps in the default Steam folders
  (Phase 2 replaces it).

## Tests

```bash
python -m pytest client/tests
```
