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
