# Local bridge client

Reads the telemetry the in-game mod writes to the `\\.\pipe\fssimx` named
pipe and relays it as JSON over a WebSocket to the relay backend.

## How it works

- `pipe_server.py` creates the pipe with `kernel32.CreateNamedPipeW`
  (byte mode, inbound — verified against the real game; the game's
  `io.open()` reads/writes through it fine and message mode broke on
  large frames). The game connects, writes, and re-connects every
  ~18 s (RefreshRate updates). Reads are a plain blocking `ReadFile` on
  the pipe thread — replicating `pipe_probe.py` 1:1 — and the instance
  is recreated only on a disconnect; the game reconnects instantly.
  (An earlier no-data-deadline design with a threaded read pinned a
  zombie read IRP on each timed teardown: the game's open then failed
  for ~15 s and no bytes ever arrived — proved by the 2026-10-19 probe,
  which streamed 1286 frames while that client got zero.)
- **The pipe instance must exist continuously, and the client must run
  before the game.** If the game's `io.open()` finds no pipe at all, the
  engine creates its own `fssimx` pipe object that we can't read, and the
  engine's pipe subsystem stays wedged for that name until the game is
  restarted. A stable instance forces the game to connect to it as a
  client instead (see `pipe_probe.py`).
- `protocol.py` parses the `HEADER<...<BODY<...<` wire format into dicts
  (stream-based, re-syncs on HEADER tokens).
- `relay.py` connects to the backend via `endpoint_url(backend, pairing)`
  (`<backend>/ws?pair=<code>`) and forwards the latest frame at a fixed
  rate (default 5 Hz).

## Run

```bash
pip install -r requirements.txt
python companion_client.py --backend ws://127.0.0.1:8123
```

The pairing code is printed on startup (or pass `--pairing 123456`).

## Build a portable .exe

```bash
pip install pyinstaller
pyinstaller --onefile --name FSCompanion companion_client.py
```

(No tray icon yet — that's on the roadmap; for now run it in a terminal or
via a shortcut.)

## Tests

```bash
pip install pytest
python -m pytest tests/
```

## Notes

- Windows only (named pipes). A UDP transport that skips the local client
  entirely is on the roadmap (the GIANTS engine ships luasocket).
- The client never sends personal data beyond what the mod exports; it
  only talks to your own relay.
