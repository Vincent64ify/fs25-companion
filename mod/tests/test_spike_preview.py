"""Spike 0.0.18 (spec 0022's probe): csPreview asks the game's course
builder for a course with a clone of the vehicle's settings and never gives
it to the vehicle; csSettings dumps both Steering Assist parts, read only.
Offline, on a stub: a manager that answers at once, later, with nil, never
or twice, a vehicle whose own course and flags must stay as they are, and
methods that fail if the spike calls one it shouldn't."""

from pathlib import Path

import pytest

lupa = pytest.importorskip("lupa")

SPIKE = Path(__file__).resolve().parents[2] / "research" / "spike" / "FS25_CompanionSpike" / "CompanionSpike.lua"

STUB = r"""
g_time = 1000
g_server = {}
calls = {}
local function boom(name) return function() calls[#calls + 1] = name; error("called " .. name) end end
AIModeSelection = { MODE = { WORKER = 1, STEERING_ASSIST = 2 } }
GameSettings = { SETTING = { STEERING_ASSIST_LINES = "steeringAssistLines",
    STEERING_ASSIST_CRUISE_CONTROL = "steeringAssistCruiseControl" } }
g_gameSettings = { steeringAssistLines = true, values = { steeringAssistCruiseControl = false } }
g_currentMission = { terrainDetailId = 7 }
function localToWorld(node, x, y, z) return 100 + z, 0, 200 end
function getDensityAtWorldPos(id, x, y, z) return 1 end
function getWorldTranslation(node) return 10, 0, 20 end

FieldCourseSettings = {}
FieldCourseSettings.__index = FieldCourseSettings
function FieldCourseSettings:clone()
    calls[#calls + 1] = "clone"
    local c = setmetatable({}, FieldCourseSettings)
    for k, v in pairs(self) do c[k] = v end
    return c
end
FieldCourseSettings.isIdentical = boom("isIdentical")
settings = setmetatable({ implementWidth = 6, numHeadlands = 1, workDirection = -1, sideOffset = 0 }, FieldCourseSettings)

local function seg(dx) return { positions = { { 0 + dx, 0 }, { 0 + dx, 100 } }, isHeadlandSegment = false } end
SteeringFieldCourse = { new = boom("SteeringFieldCourse.new"), draw = boom("draw") }
SteeringFieldCourse.__index = SteeringFieldCourse
own = setmetatable({ currentSegmentIndex = 2, segmentStates = { false, true },
    fieldCourse = { segments = { seg(0), seg(6) } } }, SteeringFieldCourse)

answer = "sync"   -- sync, later, nil, never, twice
pending = {}
g_fieldCourseManager = { busy = false }
function g_fieldCourseManager:roundToTerrainDetailPixel(x, z) return math.floor(x), math.floor(z) end
function g_fieldCourseManager:generateFieldCourseAtWorldPos(x, z, s, callback)
    calls[#calls + 1] = "generate " .. x .. " " .. z .. " " .. tostring(s.workDirection)
    local dx = s.workDirection == -1 and 0 or 1
    local course = { segments = { seg(dx), seg(6 + dx) }, fieldCourseSettings = s }
    if answer == "sync" then callback(nil, course)
    elseif answer == "nil" then callback(nil, nil)
    elseif answer == "twice" then callback(nil, course); callback(nil, course)
    elseif answer == "later" then pending[#pending + 1] = function() callback(nil, course) end
    end
end

aut = { steeringEnabled = false, lastIsOnField = true, fieldCourseDetectionInProgress = false,
    forceFieldCourseUpdate = false, steeringFieldCourse = own, lastActiveSteeringFieldCourse = own }
sel = { currentMode = 2, fieldCourseSettings = settings,
    userSettings = { modes = { [1] = { workDirection = 0.5 }, [2] = { workDirection = 1.2, deep = { deeper = { x = 1 } } } } } }
tractor = { id = 1, typeName = "tractor", rootNode = 5, size = { length = 6, lengthOffset = 0 },
    spec_aiAutomaticSteering = aut, spec_aiModeSelection = sel,
    spec_vehicleSettings = { settings = { { index = 1, gameSettingId = "steeringAssistCruiseControl", state = true,
        isBool = true, callback = function() end } } } }
function tractor:getName() return "tractor" end
function tractor:getRootVehicle() return tractor end
function tractor:getAttachedImplements() return {} end
g_localPlayer = { getCurrentVehicle = function() return tractor end }

written = {}
"""


@pytest.fixture
def lua():
    rt = lupa.LuaRuntime()
    rt.execute(STUB)
    rt.execute(SPIKE.read_text(encoding="utf-8"))
    rt.execute("CompanionSpike._writeJson = function(name, out) written[name] = out; return true end")
    return rt


def plain(v):
    """lupa tables to Python, arrays as lists"""
    if lupa.lua_type(v) != "table":
        return v
    keys = list(v.keys())
    if keys and all(isinstance(k, int) for k in keys) and sorted(keys) == list(range(1, len(keys) + 1)):
        return [plain(v[k]) for k in sorted(keys)]
    return {k: plain(v[k]) for k in keys}


def frames(lua, n, ms=100):
    for _ in range(n):
        lua.execute(f"g_time = g_time + {ms}; CompanionSpike._previewUpdate()")


def preview(lua, *args):
    quoted = ", ".join(f'"{a}"' for a in args)
    return lua.eval(f"CompanionSpike:consolePreview({quoted})")


def result(lua, name):
    out = lua.eval(f'written["preview-{name}.json"]')
    return plain(out)["preview"] if out is not None else None


def calls(lua):
    return plain(lua.eval("calls")) or []


def test_nothing_is_called_from_the_console(lua):
    msg = preview(lua, "control")
    assert "next frame" in msg and "settings unchanged" in msg
    assert calls(lua) == []


def test_the_console_says_what_it_understood(lua):
    assert "direction 45 deg, two at once" in preview(lua, "a", "45", "two")
    lua.execute("CompanionSpike._ctx.preview = nil")
    assert "direction Auto, waits for the game's build" in preview(lua, "b", "auto", "wait")


def test_control_run_rebuilds_the_same_course(lua):
    preview(lua, "control")
    frames(lua, 40)
    out = result(lua, "control")
    assert out["why"] == "answered"
    assert out["position"] == {"x": 103, "z": 200, "where": "front", "length": 6, "lengthOffset": 0}
    b = out["builds"][0]
    assert b["answers"] == 1 and b["sameAsGame"] is False and b.get("workDirection") is None
    a = out["answers"][0]
    assert a["sync"] is True and a["isNil"] is False and a["ms"] == 0
    assert a["compare"] == {"segments": 2, "ownSegments": 2, "samePoints": 2, "maxApart": 0}
    assert "segments" in a["course"]["lists"]
    # an empty Lua table comes back as {}
    assert not a["heldBy"]
    assert not out["snapshots"]["after"]["managerTablesChanged"]
    assert not out["snapshots"]["after"]["steeringTablesChanged"]
    assert calls(lua) == ["clone", "generate 103 200 -1"]


def test_the_vehicle_keeps_its_course_settings_and_flags(lua):
    preview(lua, "dir", "45")
    frames(lua, 40)
    out = result(lua, "dir")
    for when in ("armed", "before", "answered", "after"):
        s = out["snapshots"][when]
        assert s["course"]["same"] is True and s["course"]["lastSame"] is True
        assert s["sameSettings"] is True and s["settings"]["workDirection"] == -1
        assert s["flags"]["fieldCourseDetectionInProgress"] is False
        assert s["flags"]["forceFieldCourseUpdate"] is False
    assert lua.eval("aut.steeringFieldCourse == own and settings.workDirection == -1")
    b = out["builds"][0]
    assert b["deg"] == 45 and abs(b["cloneBefore"]["workDirection"] - 0.785398) < 1e-5
    assert out["answers"][0]["compare"]["samePoints"] == 0
    assert "SteeringFieldCourse.new" not in calls(lua) and "isIdentical" not in calls(lua)


def test_auto_sets_minus_one(lua):
    lua.execute("settings.workDirection = 0.3")
    preview(lua, "auto", "auto")
    frames(lua, 40)
    assert result(lua, "auto")["builds"][0]["workDirection"] == -1
    assert "generate 103 200 -1" in calls(lua)


def test_an_answer_later_is_timed(lua):
    lua.execute('answer = "later"')
    preview(lua, "later", "10")
    frames(lua, 5)
    assert result(lua, "later") is None
    lua.execute("pending[1]()")
    frames(lua, 40)
    out = result(lua, "later")
    a = out["answers"][0]
    assert a["sync"] is False and a["ms"] == 400 and out["builds"][0]["answers"] == 1


def test_a_nil_course_is_recorded(lua):
    lua.execute('answer = "nil"')
    preview(lua, "none", "10")
    frames(lua, 40)
    out = result(lua, "none")
    assert out["why"] == "answered" and out["answers"][0]["isNil"] is True
    assert "course" not in out["answers"][0]


def test_never_answering_times_out_and_still_writes(lua):
    lua.execute('answer = "never"')
    preview(lua, "never", "10")
    frames(lua, 310)
    out = result(lua, "never")
    assert out["why"] == "timed out" and out["builds"][0]["answers"] == 0
    assert "after" in out["snapshots"]
    assert lua.eval("CompanionSpike._ctx.preview") is None


def test_an_answer_twice_is_counted(lua):
    lua.execute('answer = "twice"')
    preview(lua, "twice", "10")
    frames(lua, 40)
    assert result(lua, "twice")["builds"][0]["answers"] == 2


def test_two_builds_at_once(lua):
    lua.execute('answer = "later"')
    preview(lua, "two", "10", "two")
    frames(lua, 2)
    lua.execute("pending[2](); pending[1]()")
    frames(lua, 40)
    out = result(lua, "two")
    assert [b["deg"] for b in out["builds"]] == [10, 40]
    assert [a["build"] for a in out["answers"]] == [2, 1]
    assert all(b["answers"] == 1 for b in out["builds"])


def test_a_build_that_throws_is_recorded(lua):
    lua.execute("function g_fieldCourseManager:generateFieldCourseAtWorldPos() error('inside the manager') end")
    preview(lua, "throw", "10")
    frames(lua, 35)
    out = result(lua, "throw")
    assert "inside the manager" in out["builds"][0]["error"]
    assert out["why"] == "every build failed"


def test_a_course_the_builder_keeps_shows(lua):
    """the game draws its lines from the manager's active course: a preview
    kept there, or swapped into the steering part, must show"""
    lua.execute("""
        g_fieldCourseManager.active = {}
        local generate = g_fieldCourseManager.generateFieldCourseAtWorldPos
        function g_fieldCourseManager:generateFieldCourseAtWorldPos(x, z, s, callback)
            generate(self, x, z, s, function(_, course)
                self.active = course
                aut.lastActiveSteeringFieldCourse = course
                callback(nil, course)
            end)
        end
    """)
    preview(lua, "leak", "10")
    frames(lua, 40)
    out = result(lua, "leak")
    assert sorted(out["answers"][0]["heldBy"]) == ["automaticSteering.lastActiveSteeringFieldCourse", "manager.active"]
    after = out["snapshots"]["after"]
    assert after["managerTablesChanged"] == ["active"]
    assert after["steeringTablesChanged"] == ["lastActiveSteeringFieldCourse"]
    assert after["course"]["lastSame"] is False


def test_the_back_of_the_vehicle_off_the_field_at_the_front(lua):
    lua.execute("function getDensityAtWorldPos(id, x, y, z) return x > 102 and 0 or 1 end")
    preview(lua, "back")
    frames(lua, 40)
    assert result(lua, "back")["position"]["where"] == "back"
    assert result(lua, "back")["position"]["x"] == 98


def test_wait_fires_when_the_game_builds_not_when_it_drops(lua):
    lua.execute('answer = "later"')
    assert "armed" in preview(lua, "during", "20", "wait")
    frames(lua, 3)
    assert calls(lua) == []
    lua.execute("aut.steeringFieldCourse = nil")
    frames(lua, 3)
    assert calls(lua) == []
    lua.execute("aut.fieldCourseDetectionInProgress = true")
    frames(lua, 1)
    c = calls(lua)
    assert c[0] == "clone" and c[1].startswith("generate 103 200 0.349065850398") and len(c) == 2
    lua.execute("pending[1]()")
    frames(lua, 40)
    out = result(lua, "during")
    assert out["gameBuilding"] is True
    assert out["snapshots"]["dropped"]["course"]["present"] is False
    assert out["snapshots"]["before"]["flags"]["fieldCourseDetectionInProgress"] is True


def test_wait_gives_up(lua):
    preview(lua, "idle", "20", "wait")
    frames(lua, 1210)
    assert result(lua, "idle")["why"] == "the game never built a course"
    assert calls(lua) == []


@pytest.mark.parametrize("setup, args, words", [
    ("sel.currentMode = 1", ("x",), "not in Steering Assist mode"),
    ("aut.lastIsOnField = false", ("x",), "not on a field"),
    ("aut.fieldCourseDetectionInProgress = true", ("x",), "building its own course"),
    ("aut.fieldCourseDetectionPendingData = {}", ("x",), "building its own course"),
    ("aut.steeringEnabled = true", ("x",), "steering is on"),
    ("", ("x", "10", "steering"), "steering is off"),
    ("sel.fieldCourseSettings = nil", ("x",), "hold H once"),
    ("", ("x", "two"), "two needs a direction"),
    ("g_server = nil", ("x",), "host only"),
    ("g_fieldCourseManager = nil", ("x",), "no g_fieldCourseManager"),
    ("tractor.spec_aiAutomaticSteering = nil", ("x",), "no Steering Assist part"),
])
def test_refusals_call_nothing(lua, setup, args, words):
    lua.execute(setup)
    msg = preview(lua, *args)
    assert "refused" in msg and words in msg
    frames(lua, 5)
    assert calls(lua) == []
    assert lua.eval("CompanionSpike._ctx.preview") is None


def test_the_steering_run_is_allowed_with_its_word(lua):
    lua.execute("aut.steeringEnabled = true")
    preview(lua, "steer", "10", "steering")
    frames(lua, 40)
    out = result(lua, "steer")
    assert out["why"] == "answered" and out["snapshots"]["after"]["flags"]["steeringEnabled"] is True


def test_one_run_at_a_time(lua):
    lua.execute('answer = "never"')
    preview(lua, "a", "10")
    assert "still running" in preview(lua, "b", "10")


def test_settings_dump_goes_deeper_and_leaves_the_course_out(lua):
    msg = lua.eval('CompanionSpike:consoleSettings("auto 1")')
    assert "settings-auto1.json" in msg
    out = plain(lua.eval('written["settings-auto1.json"]'))["settings"]
    assert out["found"] is True and out["modes"] == {"WORKER": 1, "STEERING_ASSIST": 2}
    ms = out["modeSelection"]
    assert ms["currentMode"] == 2 and ms["fieldCourseSettings"]["workDirection"] == -1
    assert ms["userSettings"]["modes"][1]["workDirection"] == 1.2
    assert ms["userSettings"]["modes"][1]["deep"] == "<table 1>"
    assert out["modeSelectionClasses"]["fieldCourseSettings"]["class"] == "FieldCourseSettings"
    # one table under both names here: either name is the ref
    assert out["automaticSteering"]["steeringFieldCourse"].startswith("<ref course ")
    assert out["vehicleSettings"] == [{"index": 1, "gameSettingId": "steeringAssistCruiseControl",
                                       "state": True, "isBool": True}]
    gs = out["gameSettings"]
    assert gs["STEERING_ASSIST_LINES"] == {"id": "steeringAssistLines", "raw": True}
    assert gs["STEERING_ASSIST_CRUISE_CONTROL"]["in values"] is False
    assert calls(lua) == []
