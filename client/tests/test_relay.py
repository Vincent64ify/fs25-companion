import asyncio
from pathlib import Path

from relay import Outbox, endpoint_url
from transport.replay import replay

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "solek_v1.ndjson"


def env(topic, data=None, seq=1):
    return {"v": 1, "seq": seq, "t": 0, "topic": topic, "data": data or {}}


def hello(session="s1"):
    return env("hello", {"sessionId": session})


def take(outbox):
    return asyncio.run(asyncio.wait_for(outbox.take(), 1))


def test_endpoint_url():
    assert endpoint_url("ws://127.0.0.1:8123", "123456") == "ws://127.0.0.1:8123/ws?pair=123456"
    assert endpoint_url("ws://127.0.0.1:8123/", "123456") == "ws://127.0.0.1:8123/ws?pair=123456"
    assert endpoint_url("ws://h/ws", "123456") == "ws://h/ws?pair=123456"
    assert endpoint_url("ws://h/ws?pair=999", "123456") == "ws://h/ws?pair=999"


def test_latest_wins_per_topic():
    box = Outbox()
    box.put(hello())
    for seq in range(2, 10):
        box.put(env("player", {"x": seq}, seq))
    box.put(env("env", {}, 10))
    batch = take(box)
    assert [e["topic"] for e in batch] == ["hello", "player", "env"]
    assert batch[1]["data"]["x"] == 9


def test_hello_goes_first():
    box = Outbox()
    box.put(hello())
    take(box)
    box.put(env("player"))
    box.put(hello())  # re-sent after a rotation
    assert [e["topic"] for e in take(box)] == ["hello", "player"]


def test_new_session_drops_pending_state():
    box = Outbox()
    box.put(hello("a"))
    box.put(env("player"))
    box.put(hello("b"))
    assert [e["topic"] for e in take(box)] == ["hello"]


def test_resend_latest_after_reconnect():
    box = Outbox()
    box.put(hello())
    box.put(env("player", {"x": 1}))
    take(box)
    box.resend_latest()
    batch = take(box)
    assert [e["topic"] for e in batch] == ["hello", "player"]


def test_replay_feeds_the_fixture_in_order():
    got = []
    asyncio.run(replay(FIXTURE, got.append, speed=1e9))
    assert got[0]["topic"] == "hello"
    assert [e["seq"] for e in got] == list(range(1, len(got) + 1))
