import json
from pathlib import Path

import pytest

from backend.app.protocol import (ProtocolVersionError, ValidationError,
                                  parse_envelope)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
V1_FIXTURES = sorted(p for p in FIXTURES.glob("*.ndjson") if not p.name.startswith("spike_"))


def env(topic, data, v=1, seq=1):
    return {"v": v, "seq": seq, "t": 1000, "topic": topic, "data": data}


@pytest.mark.parametrize("path", V1_FIXTURES, ids=lambda p: p.name)
def test_every_fixture_line_validates(path):
    topics = set()
    with path.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            envelope = parse_envelope(json.loads(line))
            assert envelope["seq"] == n, "seq is contiguous from 1"
            topics.add(envelope["topic"])
    assert {"hello", "player", "vehicles", "env"} <= topics


def test_fixtures_exist():
    assert V1_FIXTURES, "at least one v1 fixture"


def test_unknown_fields_and_topics_pass_through():
    raw = env("player", {"x": 1, "z": 2, "heading": 90, "newField": [1, 2]})
    assert parse_envelope(raw) is raw
    # a topic from a future collector: only the envelope is checked
    assert parse_envelope(env("hotspots", {"items": []}))["topic"] == "hotspots"


def test_version_mismatch():
    with pytest.raises(ProtocolVersionError) as e:
        parse_envelope(env("player", {"x": 1, "z": 2}, v=2))
    assert "v2" in str(e.value)


@pytest.mark.parametrize("raw", [
    None,
    {"v": 1, "seq": 1, "t": 0, "topic": "player"},                     # no data
    env("player", {"z": 2}),                                            # no x
    env("player", {"x": 1, "z": 2, "heading": 360}),                    # heading out of range
    env("Bad Topic", {}),
    env("hello", {"protocolVersion": 1}),                               # no sessionId
    env("vehicles", {"vehicles": [{"x": 1, "z": 2}]}),                  # vehicle without id
    {**env("env", {}), "extra": 1},                                     # unknown envelope key
])
def test_invalid_envelopes(raw):
    with pytest.raises(ValidationError):
        parse_envelope(raw)


def test_lua_encodes_empty_implements_as_array():
    data = {"vehicles": [{"id": 7, "x": 0, "z": 0, "implements": []}], "controlledId": 7}
    parse_envelope(env("vehicles", data))
