import json

from fastapi.testclient import TestClient

from backend.app.main import create_app


def env(topic, data, seq=1, v=1):
    return {"v": v, "seq": seq, "t": 0, "topic": topic, "data": data}


def hello(session_id="s1"):
    return env("hello", {"protocolVersion": 1, "sessionId": session_id, "mapId": "m"})


def send_env(ws, envelope):
    ws.send_text(json.dumps({"type": "envelope", "envelope": envelope}))


def recv(ws):
    return json.loads(ws.receive_text())


def test_viewer_gets_snapshot_then_updates():
    client = TestClient(create_app())
    with client.websocket_connect("/ws?pair=abc") as game, \
            client.websocket_connect("/ws?pair=abc") as first:
        first.send_text(json.dumps({"type": "hello", "role": "viewer"}))
        assert recv(first)["type"] == "snapshot"
        assert recv(first)["type"] == "client_status"
        game.send_text(json.dumps({"type": "hello", "role": "client"}))
        assert recv(first) == {"type": "client_status", "connected": True}
        send_env(game, hello())
        send_env(game, env("player", {"x": "bad"}, seq=2))  # dropped
        send_env(game, env("player", {"x": 1, "z": 2}, seq=3))
        assert recv(first)["envelope"]["topic"] == "hello"
        # the invalid envelope never reaches viewers
        assert recv(first)["envelope"]["data"] == {"x": 1, "z": 2}

        # pairing codes are case-insensitive
        with client.websocket_connect("/ws?pair=ABC") as viewer:
            viewer.send_text(json.dumps({"type": "hello", "role": "viewer"}))
            snap = recv(viewer)
            assert snap["type"] == "snapshot"
            assert set(snap["topics"]) == {"hello", "player"}
            assert snap["topics"]["player"]["data"] == {"x": 1, "z": 2}
            assert recv(viewer) == {"type": "client_status", "connected": True}

            send_env(game, env("player", {"x": 5, "z": 6}, seq=4))
            update = recv(viewer)
            assert update["type"] == "update"
            assert update["envelope"]["data"]["x"] == 5

            # a new game session replaces the viewer's state
            send_env(game, hello("s2"))
            snap = recv(viewer)
            assert snap["type"] == "snapshot"
            assert set(snap["topics"]) == {"hello"}


def test_protocol_mismatch_is_reported_to_viewers():
    client = TestClient(create_app())
    with client.websocket_connect("/ws?pair=x") as viewer:
        viewer.send_text(json.dumps({"type": "hello", "role": "viewer"}))
        assert recv(viewer)["type"] == "snapshot"
        assert recv(viewer) == {"type": "client_status", "connected": False}
        with client.websocket_connect("/ws?pair=x") as game:
            game.send_text(json.dumps({"type": "hello", "role": "client"}))
            assert recv(viewer) == {"type": "client_status", "connected": True}
            send_env(game, env("player", {"x": 1, "z": 2}, v=99))
            msg = recv(viewer)
            assert msg["type"] == "protocol_error"
            assert "v99" in msg["message"]
        assert recv(viewer) == {"type": "client_status", "connected": False}


def test_missing_pairing_code_is_rejected():
    client = TestClient(create_app())
    try:
        with client.websocket_connect("/ws") as ws:
            ws.receive_text()
    except Exception:
        return
    raise AssertionError("expected the socket to be closed")


def test_api_info_advertises_local_pairing():
    assert TestClient(create_app()).get("/api/info").json()["localPairing"] is None
    info = TestClient(create_app(local_pairing="LOCAL")).get("/api/info").json()
    assert info["localPairing"] == "LOCAL"
    assert info["protocolVersion"] == 1


def test_dashboard_is_served():
    r = TestClient(create_app()).get("/")
    assert r.status_code == 200
    assert "FS25 Companion" in r.text


def viewer_hello(ws):
    ws.send_text(json.dumps({"type": "hello", "role": "viewer"}))
    msg = recv(ws)
    while msg["type"] != "client_status":
        msg = recv(ws)
    return msg


def command(ws, cid, action="lights.toggle"):
    ws.send_text(json.dumps({"type": "command", "id": cid, "action": action}))


def ack_env(ref, ok=True, reason=None, seq=9):
    data = {"id": 1, "ref": ref, "action": "TOGGLE_LIGHTS", "ok": ok}
    if reason:
        data["reason"] = reason
    return env("command_ack", data, seq=seq)


def test_command_goes_to_the_client_and_the_ack_to_its_viewer():
    client = TestClient(create_app())
    with client.websocket_connect("/ws?pair=cmd") as game, \
            client.websocket_connect("/ws?pair=cmd") as tablet, \
            client.websocket_connect("/ws?pair=cmd") as monitor:
        game.send_text(json.dumps({"type": "hello", "role": "client"}))
        assert recv(game)["type"] == "welcome"
        assert viewer_hello(tablet)["connected"] is True
        assert viewer_hello(monitor)["connected"] is True
        send_env(game, hello())
        assert recv(tablet)["envelope"]["topic"] == "hello"
        assert recv(monitor)["envelope"]["topic"] == "hello"

        # both viewers use the same id: the backend's ref tells them apart
        command(tablet, "c1")
        first = recv(game)
        command(monitor, "c1")
        second = recv(game)
        assert first == {"type": "command", "ref": first["ref"], "action": "lights.toggle"}
        assert first["ref"] != second["ref"]

        # the mod answers the monitor's first, then the cab topic follows
        send_env(game, ack_env(second["ref"], ok=False, reason="not in a vehicle"))
        send_env(game, env("cab", {"inVehicle": True, "vehicleId": 7,
                                   "lights": {"on": True}, "implements": []}, seq=10))
        send_env(game, ack_env(first["ref"], seq=11))
        assert recv(monitor) == {"type": "command_ack", "id": "c1", "ok": False,
                                 "reason": "not in a vehicle"}
        assert recv(monitor)["envelope"]["topic"] == "cab"
        assert recv(tablet)["envelope"]["topic"] == "cab"
        assert recv(tablet) == {"type": "command_ack", "id": "c1", "ok": True, "reason": None}

        # an ack is an event: not in a later snapshot; the cab is
        with client.websocket_connect("/ws?pair=cmd") as late:
            late.send_text(json.dumps({"type": "hello", "role": "viewer"}))
            assert set(recv(late)["topics"]) == {"hello", "cab"}

        # an ack nobody waits for (answered already) goes nowhere
        send_env(game, ack_env(first["ref"], seq=12))
        send_env(game, env("player", {"x": 1, "z": 2}, seq=13))
        assert recv(tablet)["envelope"]["topic"] == "player"


def test_commands_outside_the_allow_list_never_reach_the_client():
    client = TestClient(create_app())
    with client.websocket_connect("/ws?pair=deny") as game, \
            client.websocket_connect("/ws?pair=deny") as viewer:
        game.send_text(json.dumps({"type": "hello", "role": "client"}))
        assert recv(game)["type"] == "welcome"
        viewer_hello(viewer)
        command(viewer, "x1", action="engine.explode")
        assert recv(viewer) == {"type": "command_ack", "id": "x1", "ok": False,
                                "reason": "action not allowed"}
        command(viewer, {"not": "a string"})  # no id to answer: ignored
        command(viewer, "x2")
        # the only thing the client got is the allowed command
        assert recv(game)["action"] == "lights.toggle"


def test_command_without_a_game_client_is_refused():
    client = TestClient(create_app())
    with client.websocket_connect("/ws?pair=alone") as viewer:
        assert viewer_hello(viewer)["connected"] is False
        command(viewer, "a1")
        assert recv(viewer) == {"type": "command_ack", "id": "a1", "ok": False,
                                "reason": "game client not connected"}


def test_client_cannot_send_commands_and_pending_ones_fail_when_it_leaves():
    client = TestClient(create_app())
    with client.websocket_connect("/ws?pair=gone") as viewer:
        viewer_hello(viewer)
        with client.websocket_connect("/ws?pair=gone") as game:
            game.send_text(json.dumps({"type": "hello", "role": "client"}))
            assert recv(game)["type"] == "welcome"
            assert recv(viewer) == {"type": "client_status", "connected": True}
            # a client sending a command is ignored, not relayed anywhere
            game.send_text(json.dumps({"type": "command", "id": "z", "action": "lights.toggle"}))
            command(viewer, "p1")
            assert recv(game)["type"] == "command"
        assert recv(viewer) == {"type": "client_status", "connected": False}
        assert recv(viewer) == {"type": "command_ack", "id": "p1", "ok": False,
                                "reason": "game client disconnected"}
