"""Spike 0.0.9 (spec 0012's probe): csParts dumps what each tool's parts say
about its buttons, csRate presses a key and records Precision Farming's
sprayer part. Offline, on a stub rig: a tractor that is always on, a front
weight turned on by its tractor, and a sprayer with Precision Farming."""

from pathlib import Path

import pytest

lupa = pytest.importorskip("lupa")

SPIKE = Path(__file__).resolve().parents[2] / "research" / "spike" / "FS25_CompanionSpike" / "CompanionSpike.lua"

STUB = r"""
g_time = 1000
local function newVehicle(id, name, turnOn)
    local v = { id = id, typeName = name, spec_turnOnVehicle = turnOn }
    function v:getName() return name end
    function v:getRootVehicle() return tractor end
    function v:getAttachedImplements() return self.attached or {} end
    function v:getIsPowered() return engineOn, not engineOn and "Please start the engine first!" or nil end
    -- TurnOnVehicle (gameSource.zip)
    function v:getCanToggleTurnedOn()
        return not self.spec_turnOnVehicle.isAlwaysTurnedOn and not self.spec_turnOnVehicle.turnedOnByAttacherVehicle
    end
    function v:getCanBeTurnedOn() return not self.spec_turnOnVehicle.isAlwaysTurnedOn and engineOn end
    function v:getIsTurnedOn() return false end
    return v
end
engineOn = false
tractor = newVehicle(1, "tractor", { isAlwaysTurnedOn = true })
weight = newVehicle(2, "weight", { turnedOnByAttacherVehicle = true })
sprayer = newVehicle(3, "sprayer", { isAlwaysTurnedOn = false })
function weight:getActiveInputAttacherJoint() return { allowsLowering = true, jointType = 4 } end
sprayer.spec_fillUnit = { unloading = { { node = 7 } }, unloadingFillUnitsRunning = false, unloadActionEventId = 31 }
sprayer.spec_sprayer = { doubledAmountIsActive = false, toggleDoubledAmountInputBinding = 12 }
sprayer.spec_variableWorkWidth = { hasSections = true, isActive = false }
sprayer["spec_FS25_precisionFarming.extendedSprayer"] = { sprayAmountAutoMode = true,
    rate = { index = 3, value = 120.5 } }
function sprayer:getSprayAmountRate() return 120.5 end
function sprayer:getActiveSprayType() return { name = "HERBICIDE", supportsVariableWorkWidth = false } end
tractor.attached = { { object = weight, jointDescIndex = 1 }, { object = sprayer, jointDescIndex = 2 } }
function tractor:getSelectedVehicle() return weight end
function tractor:getIsMotorStarted() return engineOn end
g_localPlayer = { getCurrentVehicle = function() return tractor end }
-- Precision Farming's rate key: a step up per press
local rateKey = {}
g_inputBinding = {
    nameActions = { PRECISIONFARMING_SPRAY_AMOUNT = rateKey },
    actionEvents = { [rateKey] = {
        { id = 41, isActive = true, targetObject = sprayer, callback = function(self, name, value)
            local r = self["spec_FS25_precisionFarming.extendedSprayer"].rate
            r.index = r.index + value
        end },
    } },
    events = {},
}
"""


@pytest.fixture
def lua():
    rt = lupa.LuaRuntime()
    rt.execute(STUB)
    rt.execute(SPIKE.read_text(encoding="utf-8"))
    return rt


def test_parts_say_which_tool_turns_on(lua):
    """getCanToggleTurnedOn and the settings behind it, for every rig
    member, the engine off (spec 0012: Turn on's has-signal)."""
    parts = lua.eval("CompanionSpike._probeParts(tractor)")
    rig = {parts["rig"][i]["label"]["typeName"]: parts["rig"][i] for i in range(1, 4)}
    assert parts["engineOn"] is False
    assert parts["selected"]["typeName"] == "weight"
    assert rig["tractor"]["turnOn"]["canToggle"] is False
    assert rig["tractor"]["turnOn"]["fields"]["turnOn.isAlwaysTurnedOn"] is True
    assert rig["weight"]["turnOn"]["canToggle"] is False
    assert rig["weight"]["turnOn"]["fields"]["turnOn.turnedOnByAttacherVehicle"] is True
    assert rig["weight"]["inputJoint"]["allowsLowering"] is True
    assert rig["sprayer"]["turnOn"]["canToggle"] is True
    assert rig["sprayer"]["turnOn"]["canBeTurnedOn"] is False
    assert list(rig["sprayer"]["powered"].values()) == [False, "Please start the engine first!"]
    assert [rig[n]["depth"] for n in ("tractor", "weight", "sprayer")] == [0, 1, 1]


def test_parts_dump_the_sprayers_buttons_and_precision_farming(lua):
    rig = lua.eval("CompanionSpike._probeParts(tractor)")["rig"]
    sprayer = rig[3]
    assert sprayer["fillUnit"]["unloadingPlaces"] == 1
    assert sprayer["fillUnit"]["unloadKey"] is True
    assert sprayer["sprayer"]["fields"]["sprayer.doubledAmountIsActive"] is False
    assert sprayer["sprayer"]["activeSprayType"]["sprayType.supportsVariableWorkWidth"] is False
    assert sprayer["width"]["fields"]["width.isActive"] is False
    pf = sprayer["precisionFarming"]["spec_FS25_precisionFarming.extendedSprayer"]
    assert pf["spec_FS25_precisionFarming.extendedSprayer.rate.value"] == 120.5
    assert "getSprayAmountRate" in list(sprayer["rateMethods"].values())
    assert rig[1]["precisionFarming"] is None


def test_rate_presses_on_the_pf_sprayer_and_records_the_change(lua):
    """csRate finds the sprayer with Precision Farming (the weight is
    selected), presses the key next frame and records what changed."""
    msg = lua.eval("CompanionSpike:consoleRate()")
    assert "PRECISIONFARMING_SPRAY_AMOUNT" in msg and "value 1" in msg
    run = lua.eval("CompanionSpike._ctx.rate")
    assert run["o"]["typeName"] == "sprayer"
    path = "spec_FS25_precisionFarming.extendedSprayer.rate.index"
    assert run["before"][path] == 3
    lua.execute("""
        local ctx = CompanionSpike._ctx
        local run = ctx.rate
        run.start = g_time
        run.called = 0
        -- the press as the update loop does it, then two frames
        for _, e in pairs(g_inputBinding.actionEvents[g_inputBinding.nameActions[run.key]]) do
            e.callback(e.targetObject, run.key, run.value)
        end
        CompanionSpike._rateFrame(run)
        g_time = g_time + 3000
        done = CompanionSpike._rateFrame(run)
    """)
    changes = lua.eval("CompanionSpike._ctx.rate.changes")
    assert [(c["path"], c["from"], c["to"]) for c in changes.values()] == [(path, 3, 4)]
    assert lua.eval("done") is True
    assert "already recording" in lua.eval("CompanionSpike:consoleRate()")


def test_rate_without_precision_farming_says_so(lua):
    lua.execute('sprayer["spec_FS25_precisionFarming.extendedSprayer"] = nil')
    assert lua.eval("CompanionSpike:consoleRate()") == "no Precision Farming sprayer part in this rig"
