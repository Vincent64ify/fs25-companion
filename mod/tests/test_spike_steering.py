"""Spike 0.0.15 (spec 0020's probe): csParts dumps each rig member's Steering
Assist parts, read only. Offline, on a stub rig: a tractor in Steering
Assist mode with a course and the steering key registered, and a cultivator
with neither part."""

from pathlib import Path

import pytest

lupa = pytest.importorskip("lupa")

SPIKE = Path(__file__).resolve().parents[2] / "research" / "spike" / "FS25_CompanionSpike" / "CompanionSpike.lua"

STUB = r"""
g_time = 1000
local function newVehicle(id, name)
    local v = { id = id, typeName = name }
    function v:getName() return name end
    function v:getRootVehicle() return tractor end
    function v:getAttachedImplements() return self.attached or {} end
    return v
end
-- AIModeSelection.lua: the MODE values (blanked in the archive: any value)
AIModeSelection = { MODE = { WORKER = 1, STEERING_ASSIST = 2 } }
InputAction = { TOGGLE_AI_STEERING = "TOGGLE_AI_STEERING" }
FieldCourse = {}
FieldCourse.__index = FieldCourse
tractor = newVehicle(1, "tractor")
cultivator = newVehicle(2, "cultivator")
tractor.attached = { { object = cultivator, jointDescIndex = 1 } }
tractor.spec_aiModeSelection = { currentMode = 2 }
tractor.spec_aiAutomaticSteering = {
    steeringEnabled = false,
    steeringFieldCourse = setmetatable({ numSegments = 12 }, FieldCourse),
    actionEvents = { TOGGLE_AI_STEERING = { actionEventId = 77 } },
}
function tractor:getSelectedVehicle() return cultivator end
function tractor:getIsMotorStarted() return true end
-- a getter the probe must never call (spec 0020: reads only)
function tractor:getIsAIAutomaticSteeringAllowed() error("called getIsAIAutomaticSteeringAllowed") end
g_localPlayer = { getCurrentVehicle = function() return tractor end }
g_inputBinding = { events = { [77] = { isActive = true, contextDisplayText = "Activate lane", displayIsVisible = true } } }
"""


@pytest.fixture
def lua():
    rt = lupa.LuaRuntime()
    rt.execute(STUB)
    rt.execute(SPIKE.read_text(encoding="utf-8"))
    rt.execute("_G.FieldCourse = FieldCourse")
    return rt


def rig(lua):
    parts = lua.eval("CompanionSpike._probeParts(tractor)")["rig"]
    return {parts[i]["label"]["typeName"]: parts[i] for i in range(1, 3)}


def test_steering_reads_the_mode_course_and_key(lua):
    s = rig(lua)["tractor"]["steering"]
    assert s["hasModeSelection"] is True and s["hasAutomaticSteering"] is True
    assert s["currentMode"] == 2
    assert s["currentModeName"] == "STEERING_ASSIST"
    assert dict(s["modes"]) == {"WORKER": 1, "STEERING_ASSIST": 2}
    assert s["steeringEnabled"] is False
    assert s["hasCourse"] is True
    assert s["course"]["course.numSegments"] == 12
    assert s["automaticSteering"]["automaticSteering.steeringEnabled"] is False
    key = s["steeringKey"]
    assert key["registered"] is True and key["found"] is True and key["id"] == 77
    assert key["active"] is True and key["text"] == "Activate lane"


def test_steering_with_no_course_and_an_inactive_key(lua):
    lua.execute("""
        tractor.spec_aiAutomaticSteering.steeringFieldCourse = nil
        g_inputBinding.events[77].isActive = false
    """)
    s = rig(lua)["tractor"]["steering"]
    assert s["hasCourse"] is False and s["course"] is None
    assert s["steeringKey"]["active"] is False


def test_steering_key_not_registered(lua):
    lua.execute("tractor.spec_aiAutomaticSteering.actionEvents = {}")
    key = rig(lua)["tractor"]["steering"]["steeringKey"]
    assert key["registered"] is False and key["found"] is None


def test_no_steering_parts_no_steering(lua):
    assert rig(lua)["cultivator"]["steering"] is None


def test_a_read_that_raises_leaves_the_rest(lua):
    lua.execute("""
        tractor.spec_aiModeSelection = setmetatable({}, { __index = function(_, k)
            if k == "currentMode" then error("boom") end
        end })
    """)
    t = rig(lua)["tractor"]
    assert "boom" in t["steering"]["error"]
    assert t["label"]["typeName"] == "tractor"
