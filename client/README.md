# Local bridge client

Reads the telemetry the in-game mod writes to the `\\.\pipe\fssimx` named
pipe and relays it as JSON over a WebSocket to the relay backend.

## How it works

- `pipe_server.py` creates the pipe *server* (via `kernel32.CreateFileW`
  with `FILE_FLAG_FIRST_PIPE_INSTANCE`). The game connects to it, writes,
  and re-connects every ~1.6 s — the loop handles that.
- `protocol.py` parses the `HEADER<...<BODY<...<` wire format into dicts.
- `relay.py` connects to the backend with the pairing code and forwards
  the latest frame at a fixed rate (default 5 Hz).

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
