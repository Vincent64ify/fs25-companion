import json
import time

import pytest
from fastapi.testclient import TestClient

from companion.commands import ack_envelope
from companion.server import Hub, create_app, in_order


def env(topic, data, seq=1, v=1):
    return {"v": v, "seq": seq, "t": 0, "topic": topic, "data": data}


def hello(session_id="s1"):
    return env("hello", {"protocolVersion": 1, "sessionId": session_id, "mapId": "m"})


def recv(ws):
    return json.loads(ws.receive_text())


def ack_env(ref, ok=True, reason=None, seq=9, **extra):
    data = {"id": 1, "ref": ref, "action": "TOGGLE_LIGHTS", "ok": ok, **extra}
    if reason:
        data["reason"] = reason
    return env("command_ack", data, seq=seq)


class Writer:
    """Stands in for commands.CommandWriter: keeps what it was handed."""

    def __init__(self, hub):
        self.hub = hub
        self.got = []
        self.answer = None

    def submit(self, ref, action, value=None):
        self.got.append((ref, action, value))
        if self.answer is not None:
            self.hub.put_ack(ack_envelope(ref, self.answer))


# viewers connect() opened, closed before the app stops
OPEN = []


@pytest.fixture
def setup(tmp_path):
    hub = Hub()
    hub.writer = Writer(hub)
    with TestClient(create_app(hub, tmp_path / "maps")) as client:
        def publish(*envelopes):
            client.portal.call(hub.publish, list(envelopes))
        try:
            yield client, hub, publish
        finally:
            while OPEN:
                OPEN.pop().__exit__(None, None, None)


def connect(client):
    """A viewer, past its snapshot and client_status."""
    session = client.websocket_connect("/ws")
    ws = session.__enter__()
    OPEN.append(session)
    assert recv(ws)["type"] == "snapshot"
    assert recv(ws) == {"type": "client_status", "connected": True}
    return ws


def command(ws, cid, action="lights.toggle", **extra):
    ws.send_text(json.dumps({"type": "command", "id": cid, "action": action, **extra}))


def handed(hub, n):
    """The writer's n-th command's ref, once the server has handed it over."""
    for _ in range(200):
        if len(hub.writer.got) >= n:
            return hub.writer.got[n - 1][0]
        time.sleep(0.01)
    raise AssertionError(f"the writer never got command {n}")


def test_viewer_gets_snapshot_then_updates(setup):
    client, _, publish = setup
    first = connect(client)
    publish(hello())
    publish(env("player", {"x": "bad"}, seq=2), env("player", {"x": 1, "z": 2}, seq=3))
    assert recv(first)["envelope"]["topic"] == "hello"
    # the invalid envelope never reaches viewers
    assert recv(first)["envelope"]["data"] == {"x": 1, "z": 2}

    with client.websocket_connect("/ws") as late:
        snap = recv(late)
        assert snap["type"] == "snapshot"
        assert set(snap["topics"]) == {"hello", "player"}
        assert recv(late) == {"type": "client_status", "connected": True}

        publish(env("player", {"x": 5, "z": 6}, seq=4))
        assert recv(late)["envelope"]["data"]["x"] == 5

        # a new game session replaces the viewer's state
        publish(hello("s2"))
        snap = recv(late)
        assert snap["type"] == "snapshot"
        assert set(snap["topics"]) == {"hello"}


def test_one_read_goes_out_latest_per_topic_then_the_acks(setup):
    client, hub, publish = setup
    viewer = connect(client)
    publish(hello())
    recv(viewer)
    command(viewer, "c1")
    ref = handed(hub, 1)
    cab = env("cab", {"inVehicle": True, "vehicleId": 7, "lights": {"on": True}, "implements": []}, seq=4)
    # as the mod writes them in one frame: the ack, then the cab topic
    publish(env("player", {"x": 1, "z": 2}, seq=2), ack_env(ref, seq=3), cab,
            env("player", {"x": 3, "z": 4}, seq=5))
    assert recv(viewer)["envelope"]["seq"] == 5
    assert recv(viewer)["envelope"]["topic"] == "cab"
    assert recv(viewer) == {"type": "command_ack", "id": "c1", "ok": True, "reason": None}


def test_in_order_drops_what_a_new_sessions_hello_follows():
    old = env("player", {"x": 1, "z": 2}, seq=7)
    new = hello("s2")
    assert in_order([old, new], "s1") == [new]
    # the same session's hello keeps the state and goes first
    same = hello("s1")
    assert in_order([old, same], "s1") == [same, old]


def test_command_goes_to_the_writer_and_the_ack_to_its_viewer(setup):
    client, hub, publish = setup
    tablet, monitor = connect(client), connect(client)
    # both viewers use the same id: the server's ref tells them apart
    command(tablet, "c1")
    command(monitor, "c1")
    publish(hello())
    recv(tablet), recv(monitor)
    handed(hub, 2)
    (first, action, value), (second, _, _) = hub.writer.got
    assert (action, value) == ("lights.toggle", None)
    assert first != second

    publish(ack_env(second, ok=False, reason="not in a vehicle"))
    publish(ack_env(first, seq=11))
    assert recv(monitor) == {"type": "command_ack", "id": "c1", "ok": False, "reason": "not in a vehicle"}
    assert recv(tablet) == {"type": "command_ack", "id": "c1", "ok": True, "reason": None}

    # an ack is an event: not in a later snapshot
    with client.websocket_connect("/ws") as late:
        assert set(recv(late)["topics"]) == {"hello"}

    # an ack nobody waits for (answered already) goes nowhere
    publish(ack_env(first, seq=12))
    publish(env("player", {"x": 1, "z": 2}, seq=13))
    assert recv(tablet)["envelope"]["topic"] == "player"
    assert recv(monitor)["envelope"]["topic"] == "player"


def test_the_writers_own_ack_reaches_the_viewer(setup):
    client, hub, _ = setup
    viewer = connect(client)
    hub.writer.answer = "no game (replay)"
    command(viewer, "r1")
    assert recv(viewer) == {"type": "command_ack", "id": "r1", "ok": False, "reason": "no game (replay)"}


def test_checked_and_via_reach_the_viewer(setup):
    """specs/0003: via (the key's input action, or "setter"), and revision 2's
    checked and unmoved; an ack without them carries none."""
    client, hub, publish = setup
    viewer = connect(client)
    command(viewer, "f1", action="implement.foldAll")
    unmoved = [{"id": 994, "name": "Samasz KDF 341 S", "why": "Nothing moved"}]
    publish(ack_env(handed(hub, 1), ok=False, reason="Samasz KDF 341 S: Nothing moved",
                    checked=True, unmoved=unmoved, via="IMPLEMENT_EXTRA2"))
    assert recv(viewer) == {"type": "command_ack", "id": "f1", "ok": False,
                            "reason": "Samasz KDF 341 S: Nothing moved", "via": "IMPLEMENT_EXTRA2",
                            "checked": True, "unmoved": unmoved}
    command(viewer, "l1")
    publish(ack_env(handed(hub, 2), seq=6))
    assert recv(viewer) == {"type": "command_ack", "id": "l1", "ok": True, "reason": None}


def test_commands_outside_the_allow_list_never_reach_the_writer(setup):
    client, hub, _ = setup
    viewer = connect(client)
    command(viewer, "x1", action="engine.explode")
    assert recv(viewer) == {"type": "command_ack", "id": "x1", "ok": False, "reason": "action not allowed"}
    command(viewer, {"not": "a string"})  # no id to answer: ignored
    # an action that isn't a string is refused, and the socket lives on
    for bad in ([], {}, None, True, 3):
        command(viewer, "x-bad", action=bad)
        assert recv(viewer)["reason"] == "action not allowed"
    viewer.send_text(json.dumps({"type": "hello", "role": "viewer"}))  # ignored
    viewer.send_text("not json")
    command(viewer, "x2")
    # the ack of x2 shows the socket read everything before it
    hub.writer.answer = "no game (replay)"
    command(viewer, "x3")
    assert recv(viewer)["id"] == "x3"
    assert [a for _, a, _ in hub.writer.got] == ["lights.toggle", "lights.toggle"]


def test_values_are_checked(setup):
    client, hub, _ = setup
    viewer = connect(client)
    command(viewer, "s1", action="cruise.set", value=23.5)
    for bad in (None, "fast", True, 0, 999):
        command(viewer, "b", action="cruise.set", value=bad)
        assert recv(viewer)["reason"] == "value not allowed"
    # a value on an action that takes none
    command(viewer, "c", action="lights.toggle", value=3)
    assert recv(viewer)["reason"] == "value not allowed"
    assert [(a, v) for _, a, v in hub.writer.got] == [("cruise.set", 23.5)]


def test_protocol_mismatch_is_reported_and_cleared(setup):
    client, _, publish = setup
    viewer = connect(client)
    publish(env("player", {"x": 1, "z": 2}, v=99))
    msg = recv(viewer)
    assert msg["type"] == "protocol_error" and "v99" in msg["message"]
    # a viewer that connects now hears of it too
    with client.websocket_connect("/ws") as late:
        assert [recv(late)["type"] for _ in range(3)] == ["snapshot", "client_status", "protocol_error"]
    # a good envelope clears it, once, before its update
    publish(hello(), env("player", {"x": 1, "z": 2}, seq=2))
    assert recv(viewer) == {"type": "protocol_error", "message": None}
    assert recv(viewer)["envelope"]["topic"] == "hello"
    assert recv(viewer)["envelope"]["topic"] == "player"


MAP = "FS25_Test.TestMap"
HASH = "0123456789abcdef0123"


def test_map_files_come_from_the_cache(setup, tmp_path):
    client, hub, _ = setup
    folder = tmp_path / "maps" / MAP / HASH
    folder.mkdir(parents=True)
    (folder / "meta.json").write_text('{"a": 1}', encoding="utf-8")
    (folder / "overview.png").write_bytes(b"png")
    r = client.get(f"/api/maps/{MAP}/{HASH}/meta.json")
    assert r.status_code == 200 and r.json() == {"a": 1}
    assert "immutable" in r.headers["cache-control"]
    assert client.head(f"/api/maps/{MAP}/{HASH}/overview.png").status_code == 200
    for path in (f"{MAP}/{HASH}/overview_2048.png", f"{MAP}/{HASH}/map.xml",
                 f"{MAP}/0000000000000000/meta.json", f"..%2Fx/{HASH}/meta.json"):
        assert client.get(f"/api/maps/{path}").status_code == 404
    # nothing is uploaded any more
    assert client.put(f"/api/maps/{MAP}/{HASH}/meta.json", content=b"{}").status_code == 405


def test_map_assets_reach_viewers_live_and_on_connect(setup):
    client, hub, _ = setup
    viewer = connect(client)
    client.portal.call(hub.announce_map, MAP, HASH)
    assert recv(viewer) == {"type": "map_assets", "mapId": MAP, "hash": HASH}
    with client.websocket_connect("/ws") as late:
        assert recv(late)["type"] == "snapshot"
        assert recv(late) == {"type": "map_assets", "mapId": MAP, "hash": HASH}
        assert recv(late)["type"] == "client_status"


def test_dashboard_files_are_served_and_revalidated(setup):
    client, _, _ = setup
    r = client.get("/")
    assert r.status_code == 200 and "FS25 Companion" in r.text
    assert r.headers["cache-control"] == "no-cache"
    # a browser must never run new and stale dashboard modules together
    r = client.get("/src/main.js")
    assert r.headers["cache-control"] == "no-cache"
    assert client.get("/src/main.js", headers={"If-None-Match": r.headers["etag"]}).status_code == 304
    # no pairing, no relay
    assert client.get("/api/info").status_code == 404
