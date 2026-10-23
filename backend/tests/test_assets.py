import json

import pytest
from fastapi.testclient import TestClient

from backend.app import assets
from backend.app.main import create_app

MAP = "FS25_Test.TestMap"
HASH = "0123456789abcdef0123"
URL = f"/api/maps/{MAP}/{HASH}"


def recv(ws):
    return json.loads(ws.receive_text())


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(assets_dir=tmp_path))


def game_hello(game):
    """Say hello as the game client; returns its upload token."""
    game.send_text(json.dumps({"type": "hello", "role": "client"}))
    welcome = recv(game)
    assert welcome["type"] == "welcome"
    return welcome["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_upload_needs_a_connected_clients_token(client):
    assert client.put(f"{URL}/overview.png", content=b"png").status_code == 401
    assert client.put(f"{URL}/overview.png", content=b"png",
                      headers=auth("made-up")).status_code == 401

    with client.websocket_connect("/ws?pair=abc") as game:
        token = game_hello(game)
        r = client.put(f"{URL}/overview.png", content=b"png", headers=auth(token))
        assert r.status_code == 201
    # the token dies with the connection
    assert client.put(f"{URL}/overview_2048.png", content=b"png",
                      headers=auth(token)).status_code == 401


def test_get_and_head(client):
    with client.websocket_connect("/ws?pair=abc") as game:
        token = game_hello(game)
        client.put(f"{URL}/meta.json", content=b'{"a": 1}', headers=auth(token))
        # content-addressed: a second upload changes nothing
        r = client.put(f"{URL}/meta.json", content=b'{"a": 2}', headers=auth(token))
        assert r.status_code == 200 and r.json() == {"stored": False}
    r = client.get(f"{URL}/meta.json")
    assert r.status_code == 200
    assert r.json() == {"a": 1}
    assert "immutable" in r.headers["cache-control"]
    assert client.head(f"{URL}/meta.json").status_code == 200
    assert client.head(f"{URL}/overview.png").status_code == 404


@pytest.mark.parametrize("path", [
    f"/api/maps/{MAP}/{HASH}/evil.html",       # unknown file name
    f"/api/maps/{MAP}/NOTAHASH/overview.png",  # bad hash
    f"/api/maps/.hidden/{HASH}/overview.png",  # bad map id
    f"/api/maps/a%2F..%2Fb/{HASH}/overview.png",
])
def test_rejects_bad_paths(client, path, tmp_path):
    with client.websocket_connect("/ws?pair=abc") as game:
        token = game_hello(game)
        # 404 from the asset route, or 405 when the path never reaches it
        assert client.put(path, content=b"x", headers=auth(token)).status_code in (404, 405)
        assert client.get(path).status_code == 404
    assert not any(p.is_file() for p in tmp_path.rglob("*"))


def test_size_limit_and_meta_must_be_json(client, monkeypatch):
    monkeypatch.setattr(assets, "MAX_ASSET_BYTES", 10)
    with client.websocket_connect("/ws?pair=abc") as game:
        token = game_hello(game)
        assert client.put(f"{URL}/overview.png", content=b"x" * 11,
                          headers=auth(token)).status_code == 413
        assert client.put(f"{URL}/meta.json", content=b"not json",
                          headers=auth(token)).status_code == 400
    assert client.get(f"{URL}/overview.png").status_code == 404
    assert client.get(f"{URL}/meta.json").status_code == 404


def test_map_assets_reach_viewers(client):
    with client.websocket_connect("/ws?pair=abc") as game:
        game_hello(game)
        with client.websocket_connect("/ws?pair=abc") as viewer:
            viewer.send_text(json.dumps({"type": "hello", "role": "viewer"}))
            assert recv(viewer)["type"] == "snapshot"
            assert recv(viewer)["type"] == "client_status"
            game.send_text(json.dumps({"type": "map_assets", "mapId": "../x", "hash": HASH}))
            game.send_text(json.dumps({"type": "map_assets", "mapId": MAP, "hash": HASH}))
            # the invalid one is dropped
            assert recv(viewer) == {"type": "map_assets", "mapId": MAP, "hash": HASH}

        # a viewer that joins later gets it on connect
        with client.websocket_connect("/ws?pair=abc") as late:
            late.send_text(json.dumps({"type": "hello", "role": "viewer"}))
            assert recv(late)["type"] == "snapshot"
            assert recv(late) == {"type": "map_assets", "mapId": MAP, "hash": HASH}


def test_dashboard_files_are_revalidated(client):
    # a browser must never run new and stale dashboard modules together
    r = client.get("/src/main.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"
    again = client.get("/src/main.js", headers={"If-None-Match": r.headers["etag"]})
    assert again.status_code == 304
    assert client.get("/").headers["cache-control"] == "no-cache"
