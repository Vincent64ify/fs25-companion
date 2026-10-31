from companion.state import StateStore


def env(topic, data, seq=1):
    return {"v": 1, "seq": seq, "t": 0, "topic": topic, "data": data}


def hello(session_id):
    return env("hello", {"protocolVersion": 1, "sessionId": session_id})


def test_latest_wins_per_topic():
    s = StateStore()
    s.apply(hello("a"))
    s.apply(env("player", {"x": 1, "z": 1}, seq=2))
    s.apply(env("player", {"x": 2, "z": 2}, seq=3))
    s.apply(env("env", {"day": 1}, seq=4))
    snap = s.snapshot()
    assert set(snap) == {"hello", "player", "env"}
    assert snap["player"]["data"]["x"] == 2


def test_snapshot_is_a_copy():
    s = StateStore()
    s.apply(hello("a"))
    snap = s.snapshot()
    snap.clear()
    assert len(s) == 1


def test_new_session_drops_old_state():
    s = StateStore()
    assert s.apply(hello("a")) is False, "the first session is not a reset"
    s.apply(env("player", {"x": 1, "z": 1}))
    assert s.apply(hello("b")) is True
    assert set(s.snapshot()) == {"hello"}
    assert s.session_id == "b"


def test_same_session_hello_keeps_state():
    # the mod re-sends hello after rotating the stream file
    s = StateStore()
    s.apply(hello("a"))
    s.apply(env("player", {"x": 1, "z": 1}))
    assert s.apply(hello("a")) is False
    assert set(s.snapshot()) == {"hello", "player"}


def test_data_before_hello_is_dropped_by_the_first_hello():
    # a client that starts mid-file may forward stale lines before a hello
    s = StateStore()
    s.apply(env("player", {"x": 1, "z": 1}))
    assert s.apply(hello("a")) is True
    assert set(s.snapshot()) == {"hello"}
