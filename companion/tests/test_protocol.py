import json
from pathlib import Path

import pytest

from companion.protocol import (EVENT_TOPICS, InvalidEnvelope, ProtocolVersionError, command_refusal,
                                parse_envelope)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
# golden_*: what viewers received (tests/test_golden.py), not envelopes
V1_FIXTURES = sorted(p for p in FIXTURES.glob("*.ndjson")
                     if not p.name.startswith(("spike_", "golden_")))


def env(topic, data, v=1, seq=1):
    return {"v": v, "seq": seq, "t": 1000, "topic": topic, "data": data}


@pytest.mark.parametrize("path", V1_FIXTURES, ids=lambda p: p.name)
def test_every_fixture_line_is_an_envelope(path):
    topics = set()
    with path.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            envelope = parse_envelope(json.loads(line))
            assert envelope["seq"] == n, "seq is contiguous from 1"
            topics.add(envelope["topic"])
    assert {"hello", "player", "vehicles", "env", "hotspots", "farmlands",
            "farmland_grid", "crop_types", "field_outlines", "fields"} <= topics


def test_fixtures_exist():
    assert V1_FIXTURES, "at least one v1 fixture"


def test_data_passes_through_unchecked():
    raw = env("player", {"x": 1, "z": 2, "heading": 90, "newField": [1, 2]})
    assert parse_envelope(raw) is raw
    # what's inside data is the dashboard's business (web/src/types.js)
    assert parse_envelope(env("player", {"x": "anything"}))["data"] == {"x": "anything"}
    # a topic from a future collector
    assert parse_envelope(env("prices", {"items": []}))["topic"] == "prices"
    assert "command_ack" in EVENT_TOPICS


def test_version_mismatch():
    with pytest.raises(ProtocolVersionError) as e:
        parse_envelope(env("player", {"x": 1, "z": 2}, v=2))
    assert "v2" in str(e.value)


@pytest.mark.parametrize("raw", [
    None,
    [],
    {"v": 1, "seq": 1, "t": 0, "topic": "player"},                     # no data
    env("player", []),                                                  # data not an object
    env("Bad Topic", {}),
    env("x" * 33, {}),                                                  # topic too long
    env(7, {}),
    {**env("env", {}), "extra": 1},                                     # unknown envelope key
    {**env("env", {}), "seq": -1},
    {**env("env", {}), "seq": 1.5},
    {**env("env", {}), "seq": True},
    {**env("env", {}), "t": "now"},
    {**env("env", {}), "v": "1"},
])
def test_invalid_envelopes(raw):
    with pytest.raises(InvalidEnvelope):
        parse_envelope(raw)


def test_commands_are_checked_for_shape_only():
    # any well-formed action: the mod knows which it runs (specs/0007)
    for action, value in (("lights.toggle", None), ("cruise.set", 23.5), ("implement.key", 3),
                          ("someday.newButton", None), ("cruise.set", 999)):
        assert command_refusal(action, value) is None, action
    for action in (None, 3, [], {}, True, "", "x" * 41, "lights toggle", "lights.toggle!", "TOGGLE_LIGHTS_1"):
        assert command_refusal(action, None) == "action not allowed", action
    for value in ("fast", True, [], {}, float("nan"), float("inf")):
        assert command_refusal("cruise.set", value) == "value not allowed", value
