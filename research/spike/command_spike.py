#!/usr/bin/env python3
"""Drive the command spike (spike C0 in docs/PLAN.md, "Controls").

The FS25_CommandSpike mod checks modSettings/FS25_CommandSpike/cmd/ every
frame for the next command file, runs it, and reports to results.ndjson.
This script writes those files and times the round trip: from writing a
command to seeing the mod's ack, and the changed vehicle state ("cab").

    python spike/command_spike.py install            # zip the mod into FS25's mods/
    python spike/command_spike.py ping -n 50         # channel only, no game action
    python spike/command_spike.py reread -n 10       # is a rewritten file read fresh?
    python spike/command_spike.py send TOGGLE_BEACON_LIGHTS
    python spike/command_spike.py send BEACON --mode direct
    python spike/command_spike.py bench TOGGLE_BEACON_LIGHTS -n 20
    python spike/command_spike.py watch              # print what the mod reports

Every run appends its summary to modSettings/FS25_CommandSpike/driver.ndjson,
next to the mod's results.ndjson: those two files are the spike's result.
"""

import argparse
import json
import os
import statistics
import sys
import time
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "client"))
import paths  # noqa: E402

MOD_NAME = "FS25_CommandSpike"
MOD_SRC = Path(__file__).resolve().parent / MOD_NAME
ICON = Path(__file__).resolve().parent / "FS25_CompanionSpike" / "icon.png"
POLL_S = 0.002


class Spike:
    def __init__(self, profile: Path):
        self.dir = profile / "modSettings" / MOD_NAME
        self.cmd_dir = self.dir / "cmd"
        self.results = self.dir / "results.ndjson"
        self.offset = 0
        self.partial = ""

    # -- reading what the mod reports ------------------------------------

    def read_all(self) -> List[Dict[str, Any]]:
        if not self.results.exists():
            return []
        out = []
        for line in self.results.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        return out

    def seek_end(self) -> None:
        self.offset = self.results.stat().st_size if self.results.exists() else 0
        self.partial = ""

    def new_lines(self) -> List[Dict[str, Any]]:
        try:
            size = self.results.stat().st_size
        except FileNotFoundError:
            return []
        if size < self.offset:
            # the mod reopened the file: a new game session
            self.offset, self.partial = 0, ""
        if size == self.offset:
            return []
        with open(self.results, "rb") as f:
            f.seek(self.offset)
            data = f.read()
        self.offset += len(data)
        text = self.partial + data.decode("utf-8", errors="replace")
        lines = text.split("\n")
        self.partial = lines.pop()
        out = []
        for line in lines:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        return out

    def session(self):
        """The mod's current session and the next command id it expects."""
        lines = self.read_all()
        hello_at = None
        for i, line in enumerate(lines):
            if line.get("kind") == "hello":
                hello_at = i
        if hello_at is None:
            sys.exit(f"no hello in {self.results}: is the mod enabled and a savegame loaded?")
        session = lines[hello_at]["session"]
        next_id = 1
        for line in lines[hello_at:]:
            if line.get("kind") == "ack" and isinstance(line.get("id"), int):
                next_id = max(next_id, line["id"] + 1)
            if line.get("kind") == "stats" and isinstance(line.get("nextId"), int):
                next_id = max(next_id, line["nextId"])
        return session, next_id

    # -- writing commands --------------------------------------------------

    prescan = False

    def write_atomic(self, path: Path, text: str) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        if self.prescan:
            # read the new file back before handing it over: if the mod's
            # first open is slow because Windows scans new files, this moves
            # that wait into the client, off the game's frame
            tmp.read_bytes()
        os.replace(tmp, path)

    def write_command(self, session: str, cid: int, action: str, mode: str = "input",
                      value: Optional[str] = None) -> Path:
        self.cmd_dir.mkdir(parents=True, exist_ok=True)
        attrs = f'session="{session}" id="{cid}" action="{action}" mode="{mode}"'
        if value is not None:
            attrs += f' value="{value}"'
        path = self.cmd_dir / f"{cid:06d}.xml"
        self.write_atomic(path, f'<?xml version="1.0" encoding="utf-8"?>\n<command {attrs}/>\n')
        return path

    def run(self, session: str, cid: int, action: str, mode: str = "input",
            value: Optional[str] = None, timeout: float = 3.0,
            cab_wait: float = 1.0) -> Dict[str, Any]:
        """Write one command and wait for its ack and the next cab change."""
        self.new_lines()  # drop what came before
        t0 = time.perf_counter()
        path = self.write_command(session, cid, action, mode, value)
        ack = None
        ack_ms = cab_ms = None
        cab = None
        deadline = t0 + timeout
        while time.perf_counter() < deadline:
            for line in self.new_lines():
                now_ms = (time.perf_counter() - t0) * 1000
                if line.get("kind") == "ack" and line.get("id") == cid:
                    ack, ack_ms = line, now_ms
                    deadline = min(deadline, time.perf_counter() + cab_wait)
                elif line.get("kind") == "cab" and cab is None \
                        and str(line.get("cause", "")).startswith("command"):
                    cab, cab_ms = line, now_ms
                elif line.get("kind") == "cab" and cab is None and ack is not None:
                    # a change a frame or more after the ack (game events, animations)
                    cab, cab_ms = line, now_ms
            if ack is not None and cab is not None:
                break
            time.sleep(POLL_S)
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass
        return {"id": cid, "action": action, "mode": mode, "ackMs": rnd(ack_ms),
                "cabMs": rnd(cab_ms), "ack": ack, "cab": cab}


def rnd(x: Optional[float]) -> Optional[float]:
    return None if x is None else round(x, 1)


def summary(values: List[float]) -> Dict[str, Any]:
    if not values:
        return {"n": 0}
    s = sorted(values)
    return {
        "n": len(s),
        "min": rnd(s[0]),
        "median": rnd(statistics.median(s)),
        "p95": rnd(s[min(len(s) - 1, int(round(0.95 * (len(s) - 1))))]),
        "max": rnd(s[-1]),
    }


def record(spike: Spike, entry: Dict[str, Any]) -> None:
    entry = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "platform": sys.platform, **entry}
    spike.dir.mkdir(parents=True, exist_ok=True)
    with open(spike.dir / "driver.ndjson", "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def show(result: Dict[str, Any]) -> None:
    ack = result["ack"]
    if ack is None:
        print(f"#{result['id']} {result['action']}: no ack within the timeout")
        return
    status = "ok" if ack.get("ok") else f"FAILED ({ack.get('reason')})"
    print(f"#{result['id']} {result['action']} [{result['mode']}] {status}: "
          f"ack {result['ackMs']} ms, cab {result['cabMs']} ms, "
          f"read {ack.get('readMs')} ms via {ack.get('reader')}, run {ack.get('runMs')} ms, "
          f"delete {ack.get('delete')}")
    if result["cab"] is not None:
        print(f"    changed: {json.dumps(result['cab'].get('changed'))}")
    if ack.get("readTimes"):
        print(f"    readers: {json.dumps(ack['readTimes'])}")
    if ack.get("detail"):
        print(f"    detail: {json.dumps(ack['detail'])}")


# -- commands ------------------------------------------------------------------

def cmd_install(args, spike: Spike, profile: Path) -> None:
    dest = profile / "mods" / f"{MOD_NAME}.zip"
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(MOD_SRC.iterdir()):
            if f.is_file():
                z.write(f, f.name)
        if not (MOD_SRC / "icon.png").exists() and ICON.exists():
            z.write(ICON, "icon.png")
    print(f"installed {dest}\nRestart FS25, enable '{MOD_NAME}' in the savegame's mods, load it.")


def cmd_send(args, spike: Spike, profile: Path) -> None:
    session, cid = spike.session()
    result = spike.run(session, cid, args.action, args.mode, args.value)
    show(result)
    record(spike, {"run": "send", "result": result})


def cmd_bench(args, spike: Spike, profile: Path) -> None:
    session, cid = spike.session()
    acks, cabs, results = [], [], []
    for i in range(args.n):
        r = spike.run(session, cid + i, args.action, args.mode, args.value)
        show(r)
        results.append(r)
        if r["ackMs"] is not None:
            acks.append(r["ackMs"])
        if r["cabMs"] is not None:
            cabs.append(r["cabMs"])
        time.sleep(args.gap)
    per_reader: Dict[str, List[float]] = {}
    for r in results:
        for name, t in ((r["ack"] or {}).get("readTimes") or {}).items():
            if "err" not in t:
                per_reader.setdefault(name, []).append(t["ms"])
    out = {"run": "bench", "action": args.action, "mode": args.mode, "prescan": spike.prescan,
           "ack": summary(acks), "cab": summary(cabs),
           "readMs": {name: summary(v) for name, v in per_reader.items()},
           "failed": sum(1 for r in results if not (r["ack"] or {}).get("ok"))}
    print(json.dumps(out, indent=2))
    record(spike, out)


def cmd_ping(args, spike: Spike, profile: Path) -> None:
    args.action, args.mode, args.value = "PING", "input", None
    cmd_bench(args, spike, profile)


def cmd_reread(args, spike: Spike, profile: Path) -> None:
    session, cid = spike.session()
    probe = spike.dir / "probe.xml"
    good = 0
    rows = []
    for i in range(args.n):
        value = f"v{int(time.time() * 1000)}-{i}"
        # rewrite the same file in place (not a rename), as the worst case
        probe.write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<command id="0" value="{value}"/>\n',
                         encoding="utf-8")
        r = spike.run(session, cid + i, "REREAD", cab_wait=0)
        seen = ((r["ack"] or {}).get("detail") or {}).get("probeValue")
        fresh = seen == value
        good += fresh
        rows.append({"wrote": value, "read": seen, "fresh": fresh, "ackMs": r["ackMs"]})
        print(f"wrote {value}, mod read {seen}: {'fresh' if fresh else 'STALE'}")
        time.sleep(args.gap)
    out = {"run": "reread", "fresh": good, "n": args.n, "rows": rows}
    print(f"{good}/{args.n} read fresh")
    record(spike, out)


def cmd_watch(args, spike: Spike, profile: Path) -> None:
    if not args.all:
        spike.seek_end()
    print(f"watching {spike.results} (Ctrl+C to stop)")
    try:
        while True:
            for line in spike.new_lines():
                print(json.dumps(line))
            time.sleep(0.02)
    except KeyboardInterrupt:
        pass


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--profile-dir", type=Path, default=None,
                   help="FS25 profile folder (default: found automatically)")
    p.add_argument("--prescan", action="store_true",
                   help="read each command file back before the mod sees it")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("install", help="zip the spike mod into FS25's mods folder")

    s = sub.add_parser("send", help="send one command")
    s.add_argument("action", help="input action name (TOGGLE_BEACON_LIGHTS) or direct action (BEACON)")
    s.add_argument("--mode", choices=["input", "direct"], default="input")
    s.add_argument("--value", default=None)

    b = sub.add_parser("bench", help="send one action n times and time it")
    b.add_argument("action")
    b.add_argument("--mode", choices=["input", "direct"], default="input")
    b.add_argument("--value", default=None)
    b.add_argument("-n", type=int, default=20)
    b.add_argument("--gap", type=float, default=0.5, help="seconds between commands")

    g = sub.add_parser("ping", help="time the channel alone (no game action)")
    g.add_argument("-n", type=int, default=50)
    g.add_argument("--gap", type=float, default=0.1)

    r = sub.add_parser("reread", help="check that a rewritten file is read fresh")
    r.add_argument("-n", type=int, default=10)
    r.add_argument("--gap", type=float, default=0.2)

    w = sub.add_parser("watch", help="print what the mod reports")
    w.add_argument("--all", action="store_true", help="from the start of the file")

    args = p.parse_args()
    profile = args.profile_dir or paths.find_profile_dir()
    if profile is None:
        sys.exit("FS25 profile folder not found; pass --profile-dir")
    spike = Spike(Path(profile))
    spike.prescan = args.prescan
    {"install": cmd_install, "send": cmd_send, "bench": cmd_bench, "ping": cmd_ping,
     "reread": cmd_reread, "watch": cmd_watch}[args.command](args, spike, Path(profile))


if __name__ == "__main__":
    main()
