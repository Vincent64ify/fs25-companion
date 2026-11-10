"""A viewer that stops reading never holds up the others (code review of
2026-10-30, F4): each viewer has its own bounded queue and sender, a viewer
that falls behind gets the latest state instead of the backlog, and one
whose send stays stuck past the deadline is dropped."""

import asyncio
import json

from companion import server
from companion.server import Hub


def env(topic, data, seq=1):
    return {"v": 1, "seq": seq, "t": 0, "topic": topic, "data": data}


def hello(session_id="s1"):
    return env("hello", {"protocolVersion": 1, "sessionId": session_id, "mapId": "m"})


class FakeSocket:
    """Stands in for a viewer's WebSocket. ``stuck``: send_text never
    returns until ``release`` is set (a tablet that stopped taking data
    with its connection still open)."""

    def __init__(self, stuck=False):
        self.got = []
        self.stuck = stuck
        self.release = asyncio.Event()
        self.incoming: asyncio.Queue = asyncio.Queue()
        self.closed = False

    async def accept(self):
        pass

    async def send_text(self, text):
        if self.stuck:
            await self.release.wait()
        self.got.append(json.loads(text))

    async def receive_text(self):
        # a viewer that sends nothing: waits until the server stops reading
        return await self.incoming.get()

    async def close(self, code=1000):
        self.closed = True

    def types(self):
        return [m["type"] for m in self.got]


async def settle():
    for _ in range(20):
        await asyncio.sleep(0)


def players(n, start=2):
    return [env("player", {"x": i, "z": 0}, seq=start + i) for i in range(n)]


def test_a_stuck_viewer_does_not_hold_up_the_others(monkeypatch):
    monkeypatch.setattr(server, "SEND_DEADLINE_S", 0.2)

    async def run():
        hub = Hub()
        good, stuck = FakeSocket(), FakeSocket(stuck=True)
        tasks = [asyncio.create_task(hub.serve_viewer(ws)) for ws in (good, stuck)]
        await settle()
        for envelope in (hello(), *players(5)):
            await hub.publish([envelope])
        await settle()
        # the good viewer has everything at once, the stuck one is still on its first send
        assert good.types() == ["snapshot", "client_status"] + ["update"] * 6
        assert good.got[-1]["envelope"]["data"]["x"] == 4
        assert stuck.got == []
        # past the deadline the stuck viewer is dropped and its socket closed
        await asyncio.wait_for(tasks[1], 2)
        assert stuck.closed and len(hub.viewers) == 1
        await hub.publish(players(1, start=50))
        await settle()
        assert good.got[-1]["envelope"]["seq"] == 50
        good.incoming.put_nowait(None)  # not a command: ignored
        tasks[0].cancel()

    asyncio.run(run())


def test_a_viewer_that_falls_behind_gets_the_latest_state_and_its_answers(monkeypatch):
    monkeypatch.setattr(server, "SEND_DEADLINE_S", 5)
    monkeypatch.setattr(server, "MAX_QUEUED", 8)

    class Writer:
        def submit(self, ref, *args, **kwargs):
            self.ref = ref

    async def run():
        hub = Hub()
        hub.writer = Writer()
        slow = FakeSocket(stuck=True)
        task = asyncio.create_task(hub.serve_viewer(slow))
        await settle()
        await hub.publish([hello()])
        slow.incoming.put_nowait(json.dumps({"type": "command", "id": "c1", "action": "lights.toggle"}))
        await settle()
        ack = env("command_ack", {"id": 1, "ref": hub.writer.ref, "action": "TOGGLE_LIGHTS", "ok": True}, seq=3)
        await hub.publish([ack])
        for i in range(40):
            await hub.publish(players(1, start=10 + i))
        viewer = next(iter(hub.viewers))
        # the queue never grows past its bound
        assert len(viewer.queue) <= server.MAX_QUEUED
        slow.release.set()
        await settle()
        # the first, stuck send went out; then the latest state replaces the
        # backlog, with the answer it was holding after it
        types = slow.types()
        assert types[0] == "snapshot"
        resync = types.index("snapshot", 1)
        assert types[resync:resync + 3] == ["snapshot", "client_status", "protocol_error"]
        assert slow.got[resync]["topics"]["player"]["seq"] >= 10
        acks = [m for m in slow.got if m["type"] == "command_ack"]
        assert acks == [{"type": "command_ack", "id": "c1", "ok": True, "reason": None}]
        assert slow.got[-1]["envelope"]["seq"] == 49
        assert len(slow.got) < 20
        task.cancel()

    asyncio.run(run())
