"""Golden replay test (docs/SIMPLIFY.md, S0): what a viewer receives.

Runs `python -m companion --replay fixtures/solek_v1.ndjson` in this
process, as it is, with two changes:
the replay feeds one envelope at a time and waits until the viewer has it
(so nothing is coalesced and the order is fixed), and the commands go to a
temp cmd/ folder where a fake mod answers them. Every message the viewers
get is saved in fixtures/golden_viewer.ndjson:

    {"step": "..."}                   what the test did next
    {"to": "A", "msg": {...}}         a message viewer A (or B) received

An envelope that is exactly a fixture line is written {"fixtureLine": n}
(1-based) instead of in full.

    python -m pytest tests/test_golden.py                  check
    GOLDEN_UPDATE=1 python -m pytest tests/test_golden.py  rewrite the file

The S phases must reproduce it. A field or message a phase removes on
purpose goes in REMOVED_ON_PURPOSE, with the phase, and is left out of both
sides of the comparison.
"""

import asyncio
import json
import os
import socket
import struct
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from companion import main as companion_main
from companion.commands import CommandWriter
from companion.tail import parse_line

websockets = pytest.importorskip("websockets")

REPO = Path(__file__).resolve().parents[1]

FIXTURE = REPO / "fixtures" / "solek_v1.ndjson"
GOLDEN = REPO / "fixtures" / "golden_viewer.ndjson"
TIMEOUT_S = 10

# message type -> the phase that removes it (and why); each field a phase
# removes as "<type>.<field>". Empty while nothing has been removed yet.
REMOVED_ON_PURPOSE = {}


class Finished(Exception):
    """The driver is done: ends companion.main.run()."""


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def dds(width, height, rgba=(200, 100, 50, 255)):
    """An uncompressed 32-bit DDS: the same bytes every run, so the map's
    hash is too."""
    pixel_format = struct.pack("<II4sI4I", 32, 0x41, b"\0\0\0\0", 32,
                               0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000)
    header = struct.pack("<7I44x", 124, 0x100F, height, width, width * 4, 0, 0)
    header += pixel_format + struct.pack("<5I", 0x1000, 0, 0, 0, 0)
    r, g, b, a = rgba
    return b"DDS " + header + bytes([b, g, r, a]) * (width * height)


def fake_profile(root: Path) -> Path:
    """A profile whose mods/ holds the fixture's map (FS25_Solek.SampleModMap)."""
    mod = root / "profile" / "mods" / "FS25_Solek"
    (mod / "map").mkdir(parents=True)
    (mod / "modDesc.xml").write_text(
        '<modDesc><maps><map id="SampleModMap" configFilename="map/map.xml" /></maps></modDesc>',
        encoding="utf-8")
    (mod / "map" / "map.xml").write_text(
        '<map width="2048" height="2048" imageFilename="map/overview.png" />', encoding="utf-8")
    (mod / "map" / "overview.dds").write_bytes(dds(16, 16))
    return root / "profile"


def get(url, as_json=True):
    """GET from the backend (in a thread: the loop serves it)."""
    with urllib.request.urlopen(url, timeout=5) as r:
        return json.load(r) if as_json else r.read()


def canonical(envelope) -> str:
    return json.dumps(envelope, sort_keys=True, separators=(",", ":"))


class Driver:
    """Stands in for tail.replay: feeds the fixture and the steps below
    to the companion's sink, and records what the viewers get."""

    def __init__(self, port: int, cmd_dir: Path, envelopes):
        self.base = f"http://127.0.0.1:{port}"
        self.ws_url = f"ws://127.0.0.1:{port}/ws"
        self.cmd_dir = cmd_dir
        self.envelopes = envelopes
        self.lines = {canonical(e): n for n, e in enumerate(envelopes, 1)}
        self.viewers = {}
        self.put = None
        self.out = []

    # recording

    def ref(self, envelope):
        n = self.lines.get(canonical(envelope))
        return {"fixtureLine": n} if n is not None else envelope

    def record(self, name, msg):
        msg = dict(msg)
        if isinstance(msg.get("envelope"), dict):
            msg["envelope"] = self.ref(msg["envelope"])
        if isinstance(msg.get("topics"), dict):
            msg["topics"] = {k: self.ref(v) for k, v in sorted(msg["topics"].items())}
        self.out.append({"to": name, "msg": msg})
        return msg

    def step(self, what):
        self.out.append({"step": what})

    async def expect(self, name, *preds):
        """Record viewer `name`'s messages until each pred has matched one."""
        left = list(preds)
        while left:
            raw = await asyncio.wait_for(self.viewers[name].recv(), TIMEOUT_S)
            msg = json.loads(raw)
            self.record(name, msg)
            left = [p for p in left if not p(msg)]

    # what to wait for

    @staticmethod
    def carries(envelope):
        def pred(msg):
            if msg.get("type") == "update":
                return msg["envelope"] == envelope
            if msg.get("type") == "snapshot":
                return msg["topics"].get(envelope["topic"]) == envelope
            return False
        return pred

    @staticmethod
    def of_type(kind, **fields):
        return lambda msg: msg.get("type") == kind and all(msg.get(k) == v for k, v in fields.items())

    # the fake mod

    async def command_file(self, cid: int):
        path = self.cmd_dir / f"{cid}.xml"
        for _ in range(TIMEOUT_S * 100):
            if path.is_file():
                return ET.parse(path).getroot().attrib
            await asyncio.sleep(0.01)
        raise AssertionError(f"command file {cid}.xml never came")

    def ack(self, attrib, ok=True, **extra):
        """The command_ack the mod sends for a command file."""
        data = {"id": int(attrib["id"]), "ref": attrib["ref"], "action": attrib["action"], "ok": ok}
        if ok:
            data["via"] = attrib["action"]
        data.update(extra)
        return {"v": 1, "seq": 900000 + int(attrib["id"]), "t": 0, "topic": "command_ack", "data": data}

    async def send(self, name, cmd):
        await self.viewers[name].send(json.dumps({"type": "command", **cmd}))

    # the run

    async def connect(self, name):
        """Connect a viewer, waiting for the server to be up."""
        for _ in range(TIMEOUT_S * 20):
            try:
                self.viewers[name] = await websockets.connect(self.ws_url)
                return
            except OSError:
                await asyncio.sleep(0.05)
        raise AssertionError("the server never came up")

    async def feed(self, envelope, *names, also=()):
        await self.put([envelope])
        for name in names or ("A",):
            await self.expect(name, self.carries(envelope), *also)

    async def run(self, put):
        self.put = put
        self.step("viewer A connects")
        await self.connect("A")
        await self.expect("A", self.of_type("snapshot"), self.of_type("client_status"))

        self.step("replay fixtures/solek_v1.ndjson, one envelope at a time")
        for envelope in self.envelopes:
            # the first hello also brings the map's overview
            also = (self.of_type("map_assets"),) if envelope["topic"] == "hello" else ()
            await self.feed(envelope, also=also)
        await self.check_map_served()

        self.step("viewer B connects")
        await self.connect("B")
        await self.expect("B", self.of_type("snapshot"), self.of_type("map_assets"),
                          self.of_type("client_status"))

        self.step("A: an action the backend doesn't know")
        await self.send("A", {"id": "c1", "action": "nope.toggle"})
        await self.expect("A", self.of_type("command_ack", id="c1"))

        self.step("A: a value out of range")
        await self.send("A", {"id": "c2", "action": "cruise.set", "value": 999})
        await self.expect("A", self.of_type("command_ack", id="c2"))

        self.step("A: lights.toggle, the mod runs it")
        await self.send("A", {"id": "c3", "action": "lights.toggle"})
        await self.feed_ack(await self.command_file(1), "c3")

        self.step("A: implement.lower 7, the mod checks the tools and one didn't move")
        await self.send("A", {"id": "c4", "action": "implement.lower", "value": 7})
        await self.feed_ack(await self.command_file(2), "c4", checked=True,
                            unmoved=[{"id": 7, "name": "Plough", "why": "did not lower"}])

        self.step("A: engine.toggle, the mod refuses")
        await self.send("A", {"id": "c5", "action": "engine.toggle"})
        await self.feed_ack(await self.command_file(3), "c5", ok=False, reason="not in a vehicle")

        self.step("A: cruise.set 20, 21, 22 while the first is in the game")
        await self.send("A", {"id": "c6", "action": "cruise.set", "value": 20})
        first = await self.command_file(4)
        await self.send("A", {"id": "c7", "action": "cruise.set", "value": 21})
        await self.send("A", {"id": "c8", "action": "cruise.set", "value": 22})
        await self.expect("A", self.of_type("command_ack", id="c7"))
        self.step("the mod answers 20; 22 goes in")
        await self.feed_ack(first, "c6")
        last = await self.command_file(5)
        self.out.append({"step": "command file 5", "value": last.get("value")})
        await self.feed_ack(last, "c8")

        self.step("the mod sends the last ack again (after a rotation): nobody gets it")
        await self.put([self.ack(last)])
        await self.feed(self.marker(1), "A", "B")

        self.step("the same session's hello again (a rotation)")
        await self.feed(self.envelopes[0], "A", "B")

        self.step("a new game session")
        hello = json.loads(json.dumps(self.envelopes[0]))
        hello["seq"] = 1
        hello["data"]["sessionId"] = "fixture-solek-2"
        await self.feed(hello, "A", "B")

        self.step("B: lights.toggle with A's old id; only B gets the answer")
        await self.send("B", {"id": "c3", "action": "lights.toggle"})
        attrib = await self.command_file(1)
        self.out.append({"step": "command file 1", "session": attrib.get("session")})
        await self.put([self.ack(attrib)])
        await self.expect("B", self.of_type("command_ack", id="c3"))
        await self.feed(self.marker(2), "A", "B")

        for ws in self.viewers.values():
            await ws.close()
        raise Finished()

    async def feed_ack(self, attrib, viewer_id, ok=True, **extra):
        await self.put([self.ack(attrib, ok, **extra)])
        await self.expect("A", self.of_type("command_ack", id=viewer_id))

    def marker(self, n):
        """A player envelope after which nothing else should have come."""
        return {"v": 1, "seq": 800000 + n, "t": 0, "topic": "player",
                "data": {"x": float(n), "z": 0.0, "marker": n}}

    async def check_map_served(self):
        last = next(m["msg"] for m in reversed(self.out) if m.get("msg", {}).get("type") == "map_assets")
        url = f"{self.base}/api/maps/{last['mapId']}/{last['hash']}/overview.png"
        assert (await asyncio.to_thread(get, url, False))[:8] == b"\x89PNG\r\n\x1a\n"


def drop_removed(lines):
    """Both sides without what REMOVED_ON_PURPOSE lists."""
    kept = []
    for line in lines:
        msg = line.get("msg")
        if msg is not None:
            kind = msg.get("type")
            if kind in REMOVED_ON_PURPOSE:
                continue
            msg = {k: v for k, v in msg.items() if f"{kind}.{k}" not in REMOVED_ON_PURPOSE}
            line = {**line, "msg": msg}
        kept.append(line)
    return kept


def test_viewer_messages_match_the_golden_file(tmp_path, monkeypatch):
    pytest.importorskip("PIL")
    pytest.importorskip("uvicorn")
    with open(FIXTURE, encoding="utf-8") as f:
        envelopes = [e for e in map(parse_line, f) if e is not None]
    port = free_port()
    cmd_dir = tmp_path / "cmd"
    driver = Driver(port, cmd_dir, envelopes)

    async def replay(path, put, speed=1.0, loop=False):
        await driver.run(put)

    monkeypatch.setattr(companion_main, "replay", replay)
    monkeypatch.setattr(companion_main.paths, "cache_dir", lambda: tmp_path / "cache")
    # a replay has no game, so no cmd/ folder: give it one the fake mod reads
    monkeypatch.setattr(companion_main, "CommandWriter",
                        lambda _cmd_dir, put: CommandWriter(cmd_dir, put))
    args = companion_main.parse_args([
        "--port", str(port), "--replay", str(FIXTURE),
        "--profile-dir", str(fake_profile(tmp_path))])
    with pytest.raises(Finished):
        asyncio.run(companion_main.run(args))

    if os.environ.get("GOLDEN_UPDATE"):
        with open(GOLDEN, "w", encoding="utf-8", newline="\n") as f:
            for line in driver.out:
                f.write(json.dumps(line, separators=(",", ":")) + "\n")
        pytest.skip(f"wrote {GOLDEN.name} ({len(driver.out)} lines)")

    with open(GOLDEN, encoding="utf-8") as f:
        golden = drop_removed([json.loads(line) for line in f])
    actual = drop_removed(driver.out)
    for n, (want, got) in enumerate(zip(golden, actual), 1):
        assert got == want, f"{GOLDEN.name} line {n} differs"
    assert len(actual) == len(golden), f"{len(actual)} lines, the golden file has {len(golden)}"
