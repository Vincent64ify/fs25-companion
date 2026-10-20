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
    assert {"hello", "player", "vehicles", "env", "hotspots", "farmlands",
            "farmland_grid", "crop_types", "field_outlines", "fields"} <= topics


def test_fixtures_exist():
    assert V1_FIXTURES, "at least one v1 fixture"


def test_unknown_fields_and_topics_pass_through():
    raw = env("player", {"x": 1, "z": 2, "heading": 90, "newField": [1, 2]})
    assert parse_envelope(raw) is raw
    # a topic from a future collector: only the envelope is checked
    assert parse_envelope(env("prices", {"items": []}))["topic"] == "prices"


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
    env("hotspots", {"hotspots": [{"x": 1, "z": 2}]}),                  # hotspot without category
    env("farmlands", {"farmlands": [{"farmId": 1}]}),                   # farmland without id
    env("farmland_grid", {"cell": 4, "cols": 2, "rows": 2, "originX": 0,
                          "originZ": 0, "runs": [1, 3]}),               # runs miss a cell
    env("farmland_grid", {"cell": 4, "cols": 2, "rows": 2, "originX": 0,
                          "originZ": 0, "runs": [1, 4, 2]}),            # odd runs
    env("field_outlines", {"fields": [{"id": 1, "points": [0, 0, 1, 1]}]}),  # two points
    env("field_outlines", {"fields": [{"id": 1, "points": [0, 0, 1, 1, 2]}]}),  # odd points
    env("fields", {"fields": [{"fruitTypeIndex": 1}]}),                 # field without id
    env("crop_types", {"fruits": [{"index": 1, "color": [1, 0]}]}),     # colour without blue
])
def test_invalid_envelopes(raw):
    with pytest.raises(ValidationError):
        parse_envelope(raw)


def test_lua_encodes_empty_implements_as_array():
    data = {"vehicles": [{"id": 7, "x": 0, "z": 0, "implements": []}], "controlledId": 7}
    parse_envelope(env("vehicles", data))


def test_pda_topics():
    parse_envelope(env("hotspots", {"hotspots": [
        {"category": 9, "name": "Mill", "x": 173, "z": 971.5, "farmId": 0, "visible": True}]}))
    parse_envelope(env("farmlands", {"farmlands": [
        {"id": 1, "farmId": 0, "price": 98137, "areaHa": 1.51, "x": -876, "z": -941.5,
         "name": "1", "listed": True}]}))
    parse_envelope(env("farmland_grid", {"cell": 4, "cols": 2, "rows": 2, "originX": -4,
                                         "originZ": -4, "runs": [0, 1, 3, 3]}))
    parse_envelope(env("vehicles", {"vehicles": [
        {"id": 302, "x": 0, "z": 0, "motorized": False, "attached": True, "propertyState": 2}]}))


def test_field_topics():
    parse_envelope(env("field_outlines", {"fields": [
        {"id": 1, "points": [0, 0, 5, 0, 5, 5.5]}]}))
    parse_envelope(env("fields", {"fields": [
        {"id": 1, "farmlandId": 2, "x": -915.8, "z": -741.2, "areaHa": 3.54, "fruitTypeIndex": 31,
         "growthState": 8, "groundType": 13, "sprayLevel": 2, "limeLevel": 1, "plowLevel": 1,
         "weedState": 3, "stoneLevel": 0}]}))
    parse_envelope(env("crop_types", {
        "fruits": [{"index": 1, "name": "WHEAT", "title": "Wheat", "color": [0.48, 0.36, 0.01],
                    "numGrowthStates": 8, "minHarvest": 8, "maxHarvest": 8, "withered": 9,
                    "cut": 10, "stateNames": {"1": "invisible"}}],
        "groundTypes": {"PLOWED": 4}, "levels": {"lime": 3, "plow": 1, "spray": 2}}))
    # Lua writes an empty table as []: no fields yet
    parse_envelope(env("fields", {"fields": []}))
