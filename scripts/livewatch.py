#!/usr/bin/env python3
"""Watch a live game for a live check: the mod's log lines and what changes.

    python scripts/livewatch.py                # from now on
    python scripts/livewatch.py --from-start   # this session's files from the top

Tails log.txt and the mod's stream.ndjson and prints, one line each:

* log    the mod's own lines ([FS25_Companion]), errors and Lua call stacks;
* ack    every command_ack in full;
* cab    what changed in the cab message (rig, tools, keys), field by field;
* in     the vehicle and its tools when you get in.

Both files start over when the game restarts or the stream rotates; the
watcher notices and reads the new file from its top. Ctrl+C stops it.
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "client"))
import paths  # noqa: E402

LOG_MARKS = ("[FS25_Companion]", "Error:", "Error (", "LUA call stack")


class Tail:
    """Lines added to a file since the last read; starts over when it shrinks."""

    def __init__(self, path: Path, from_start: bool):
        self.path = path
        self.pos = 0
        if not from_start and path.exists():
            self.pos = path.stat().st_size
        self.buf = b""

    def lines(self):
        try:
            size = self.path.stat().st_size
        except OSError:
            return []
        if size < self.pos:
            self.pos, self.buf = 0, b""
            emit("--", f"{self.path.name} started over")
        if size == self.pos:
            return []
        with open(self.path, "rb") as f:
            f.seek(self.pos)
            data = f.read()
        self.pos += len(data)
        self.buf += data
        *done, self.buf = self.buf.split(b"\n")
        return [line.decode("utf-8", "replace").rstrip("\r") for line in done]


def emit(kind: str, text: str) -> None:
    print(f"{time.strftime('%H:%M:%S')} {kind:4} {text}", flush=True)


def flatten(value, prefix: str = "", out: Optional[Dict[str, object]] = None) -> Dict[str, object]:
    """Path -> leaf value; list items that have a name are keyed by it."""
    out = {} if out is None else out
    if isinstance(value, dict):
        for k, v in value.items():
            flatten(v, f"{prefix}.{k}" if prefix else k, out)
    elif isinstance(value, list) and value:
        for i, v in enumerate(value):
            key = str(i)
            if isinstance(v, dict) and v.get("name"):
                key = str(v["name"])
            elif isinstance(v, dict) and v.get("action"):
                key = str(v["action"])
            flatten(v, f"{prefix}[{key}]", out)
    else:
        out[prefix] = value
    return out


class LogWatch:
    def __init__(self):
        self.in_stack = False

    def line(self, line: str) -> None:
        text = line[11:] if line[:4].isdigit() else line
        # the stack's frames follow its header, indented
        if self.in_stack and line[24:25] in (" ", "\t") and line.strip():
            emit("log", text)
            return
        self.in_stack = "LUA call stack" in line
        if any(m in line for m in LOG_MARKS) and "(performance)" not in line:
            emit("log", text)


class StreamWatch:
    UNSEEN = object()

    def __init__(self):
        self.cab: Dict[str, object] = {}
        self.vehicle = self.UNSEEN

    def line(self, line: str) -> None:
        try:
            msg = json.loads(line)
        except ValueError:
            return
        topic, data = msg.get("topic"), msg.get("data") or {}
        if topic == "hello":
            emit("--", f"hello: session {data.get('sessionId', '?')}, map {data.get('mapTitle', '?')}")
            self.cab, self.vehicle = {}, self.UNSEEN
        elif topic == "command_ack":
            emit("ack", json.dumps(data, ensure_ascii=False))
        elif topic == "cab":
            self.on_cab(data)

    def on_cab(self, data: dict) -> None:
        flat = flatten(data)
        vehicle = data.get("vehicleId")
        if vehicle != self.vehicle:
            self.vehicle = vehicle
            if data.get("inVehicle"):
                names = [str(m.get("name")) for m in data.get("rig") or [] if isinstance(m, dict)]
                emit("in", f"vehicle {vehicle}: {' | '.join(names) or '(no rig)'}")
            else:
                emit("in", "on foot")
            self.cab = flat
            return
        for path in sorted(set(flat) | set(self.cab)):
            old, new = self.cab.get(path, "-"), flat.get(path, "-")
            if old != new:
                emit("cab", f"{path}: {json.dumps(old, ensure_ascii=False)} -> {json.dumps(new, ensure_ascii=False)}")
        self.cab = flat


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--from-start", action="store_true", help="read both files from their top")
    p.add_argument("--profile-dir", type=Path, default=None,
                   help="FS25 profile folder (default: found automatically)")
    p.add_argument("--interval", type=float, default=0.25, help="seconds between reads")
    args = p.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    profile = args.profile_dir or paths.find_profile_dir()
    if profile is None:
        sys.exit("FS25 profile folder not found; pass --profile-dir")
    log, stream = profile / "log.txt", profile / paths.STREAM_RELATIVE
    emit("--", f"watching {log} and {stream}")
    tails = [(Tail(log, args.from_start), LogWatch()), (Tail(stream, args.from_start), StreamWatch())]
    try:
        while True:
            for tail, watch in tails:
                for line in tail.lines():
                    watch.line(line)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
