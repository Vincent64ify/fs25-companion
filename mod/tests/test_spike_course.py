"""Spike 0.0.16 (spec 0021's probe): csCourse dumps the Steering Assist
course, read only. The course class (SteeringFieldCourse) is not in the
SDK's archive and the save keeps only its boundary, settings and
workedLines, so the probe finds the lanes by shape. Offline, on a stub: a
course wrapping a generated course with five segments that point back at
the course and at each other, a vehicle inside, methods that fail if
called, and an __index that fails if touched."""

from pathlib import Path

import pytest

lupa = pytest.importorskip("lupa")

SPIKE = Path(__file__).resolve().parents[2] / "research" / "spike" / "FS25_CompanionSpike" / "CompanionSpike.lua"

STUB = r"""
g_time = 1000
calls = {}
local function boom(name) return function() calls[#calls + 1] = name; error("called " .. name) end end
tractor = { id = 1, typeName = "tractor", rootNode = 5, spec_motorized = {} }
function tractor:getName() return "tractor" end
function tractor:getRootVehicle() return tractor end
function tractor:getAttachedImplements() return {} end
function getWorldTranslation(node) return 10, 0, 20 end

-- the course class: its methods fail if the probe ever calls one
SteeringFieldCourse = { getIsPointInsideBoundary = boom("getIsPointInsideBoundary"),
    getSteeringTarget = boom("getSteeringTarget"), saveToXML = boom("saveToXML"), draw = boom("draw") }
SteeringFieldCourse.__index = SteeringFieldCourse
FieldCourse = { getSegments = boom("getSegments") }
FieldCourse.__index = FieldCourse
-- segments: any read through __index (a missing field) fails
FieldCourseSegment = {}
FieldCourseSegment.__index = function(_, k) calls[#calls + 1] = "index " .. tostring(k); error("__index " .. tostring(k)) end

course = setmetatable({ currentSegmentIndex = 3, currentSegmentIsLeft = true, segmentStatesDirty = false,
    vehicle = tractor }, SteeringFieldCourse)
local inner = setmetatable({ segments = {}, field = { boundary = { 0, 0, 100, 0, 100, 50, 0, 50 } } }, FieldCourse)
course.fieldCourse = inner
for i = 1, 5 do
    inner.segments[i] = setmetatable({ index = i, isHeadland = i <= 2, isWorked = i == 1,
        points = { i, 0, i, 50 }, course = course }, FieldCourseSegment)
end
for i = 1, 4 do rawset(inner.segments[i], "next", inner.segments[i + 1]) end
-- live (2026-11-23): the done flags, one boolean per segment
course.segmentStates = { false, false, false, false, false, false, false, false, false, true }
-- a sparse table: an array test that reads t[2] would hit __index
course.sparse = setmetatable({ [1] = "a", [3] = "c" }, FieldCourseSegment)

tractor.spec_aiAutomaticSteering = { steeringEnabled = true, lastIsOnField = true,
    fieldCourseDetectionInProgress = false, steeringFieldCourse = course, lastActiveSteeringFieldCourse = course }
g_localPlayer = { getCurrentVehicle = function() return tractor end }
"""


@pytest.fixture
def lua():
    rt = lupa.LuaRuntime()
    rt.execute(STUB)
    rt.execute(SPIKE.read_text(encoding="utf-8"))
    return rt


def probe(lua):
    return lua.eval("CompanionSpike._probeCourse(tractor)")


def plain(v):
    """lupa tables to Python, arrays as lists"""
    if lupa.lua_type(v) != "table":
        return v
    keys = list(v.keys())
    if keys and all(isinstance(k, int) for k in keys) and sorted(keys) == list(range(1, len(keys) + 1)):
        return [plain(v[k]) for k in sorted(keys)]
    return {k: plain(v[k]) for k in keys}


def test_finds_the_course_and_its_state(lua):
    out = plain(probe(lua))
    assert out["found"] is True
    c = out["courses"]["steeringFieldCourse"]
    assert c["class"] == "SteeringFieldCourse"
    assert out["sameAsLastActive"] is True
    assert out["steering"]["steeringEnabled"] is True and out["steering"]["lastIsOnField"] is True
    assert c["plain"]["currentSegmentIndex"] == 3 and c["plain"]["currentSegmentIsLeft"] is True
    assert out["vehiclePosition"] == [10, 0, 20]


def test_the_shape_names_every_key_and_class(lua):
    shape = plain(probe(lua))["courses"]["steeringFieldCourse"]["shape"]
    assert shape["class"] == "SteeringFieldCourse"
    fc = shape["fields"]["fieldCourse"]
    assert fc["class"] == "FieldCourse"
    segs = fc["fields"]["segments"]
    assert segs["n"] == 5 and segs["itemClass"] == "FieldCourseSegment"
    assert shape["fields"]["vehicle"]["vehicle"] is True


def test_every_segment_is_dumped_with_refs_for_cycles(lua):
    lists = plain(probe(lua))["courses"]["steeringFieldCourse"]["lists"]
    segs = lists["fieldCourse.segments"]
    assert segs["n"] == 5 and segs["class"] == "FieldCourseSegment"
    items = segs["items"]
    assert [s["index"] for s in items] == [1, 2, 3, 4, 5]
    assert items[0]["isWorked"] is True and items[1]["isWorked"] is False
    assert items[0]["points"] == [1, 0, 1, 50]
    assert items[0]["course"] == "<ref course>"
    assert items[0]["next"] == "<ref fieldCourse.segments[2]>"
    # the boundary is a list of numbers, not of tables
    assert "fieldCourse.field.boundary" not in lists


def test_methods_listed_never_called(lua):
    out = plain(probe(lua))
    c = out["courses"]["steeringFieldCourse"]
    assert "getIsPointInsideBoundary" in c["methods"] and "draw" in c["methods"]
    assert "getSegments" in c["shape"]["fields"]["fieldCourse"]["methods"]
    assert lua.eval("#calls") == 0
    assert "error" not in out


def test_encode_size_and_time_recorded(lua):
    enc = plain(probe(lua))["courses"]["steeringFieldCourse"]["encode"]
    assert enc["bytes"] > 100
    assert "seconds" in enc


def test_budget_truncates(lua):
    lua.execute("CompanionSpike._courseLimits.nodes = 20")
    lists = plain(probe(lua))["courses"]["steeringFieldCourse"]
    assert lists["truncated"] is True


def test_no_course(lua):
    lua.execute("""
        tractor.spec_aiAutomaticSteering.steeringFieldCourse = nil
        tractor.spec_aiAutomaticSteering.lastActiveSteeringFieldCourse = nil
    """)
    out = plain(probe(lua))
    assert out["found"] is True and not out.get("courses")
    assert out.get("sameAsLastActive") is None


def test_no_steering_part(lua):
    lua.execute("tractor.spec_aiAutomaticSteering = nil")
    assert plain(probe(lua))["found"] is False


def test_console_names_the_file(lua):
    lua.execute("""
        written = nil
        CompanionSpike._writeJson = function(name, out) written = name; return true end
    """)
    msg = lua.eval('CompanionSpike:consoleCourse("lane 1!")')
    assert lua.eval("written") == "course-lane1.json"
    assert "course-lane1.json" in msg and "5 segment" in msg


def test_a_list_of_plain_values_is_shown_whole(lua):
    """live, lane 10's done flag was the 10th of 14 and the shape showed 6"""
    shape = plain(probe(lua))["courses"]["steeringFieldCourse"]["shape"]
    states = shape["fields"]["segmentStates"]
    assert states["n"] == 10 and states["itemType"] == "boolean"
    assert states["sample"] == [False] * 9 + [True]
