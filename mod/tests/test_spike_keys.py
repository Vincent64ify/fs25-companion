"""Spike 0.0.5 (spec 0003's All row): csKeys lists every handler of a key,
csTrace logs each call and still runs it, then puts the originals back.
Offline, on a stub game with two handlers for Lower all."""

from pathlib import Path

import pytest

lupa = pytest.importorskip("lupa")

SPIKE = Path(__file__).resolve().parents[2] / "spike" / "FS25_CompanionSpike" / "CompanionSpike.lua"

STUB = r"""
g_time = 1000
calls = {}
local function newVehicle(id, name)
    local v = { id = id, typeName = name, lowered = false }
    function v:getName() return name end
    function v:getIsLowered() return self.lowered end
    function v:getRootVehicle() return tractor end
    function v:getAttachedImplements() return self.attached or {} end
    return v
end
tractor = newVehicle(1, "T7.300")
mower = newVehicle(2, "XT 390")
tractor.attached = { { object = mower, jointDescIndex = 1 } }
function tractor:getSelectedVehicle() return mower end
AttacherJoints = {}
function AttacherJoints.actionEventLowerAllImplements(self, name, value)
    calls[#calls + 1] = "tractor " .. name .. " " .. tostring(value)
    mower.lowered = not mower.lowered
end
Attachable = {}
function Attachable.actionEventLowerImplement(self, name, value)
    calls[#calls + 1] = "mower " .. name .. " " .. tostring(value)
    self.lowered = not self.lowered
end
local lowerAll = {}
g_inputBinding = {
    nameActions = { LOWER_ALL_IMPLEMENTS = lowerAll },
    actionEvents = { [lowerAll] = {
        { id = 11, callback = AttacherJoints.actionEventLowerAllImplements, targetObject = tractor, isActive = true,
          triggerDown = true, displayPriority = 1 },
        { id = 12, callback = Attachable.actionEventLowerImplement, targetObject = mower, isActive = true,
          triggerDown = true },
    } },
    events = {},
}
for _, e in ipairs(g_inputBinding.actionEvents[lowerAll]) do g_inputBinding.events[e.id] = e end
g_localPlayer = { getCurrentVehicle = function() return tractor end }
-- Companion's runInputAction: every active handler
function pressAll(name)
    local events = g_inputBinding.actionEvents[g_inputBinding.nameActions[name]]
    for _, e in pairs(events) do
        if e.isActive ~= false then e.callback(e.targetObject, name, 1, e.callbackState, false, false, nil, nil) end
    end
end
"""


@pytest.fixture
def lua():
    rt = lupa.LuaRuntime()
    rt.execute(STUB)
    rt.execute(SPIKE.read_text(encoding="utf-8"))
    return rt


def test_keys_lists_every_handler_with_its_owner(lua):
    keys = lua.eval("CompanionSpike._probeKeys()")
    lower = keys["actions"]["LOWER_ALL_IMPLEMENTS"]
    assert lower["count"] == 2
    got = sorted((e["callback"], e["target"]["name"], e["modCalls"], e["sameAsEventsById"])
                 for e in lower["events"].values())
    assert got == [("Attachable.actionEventLowerImplement", "XT 390", True, True),
                   ("AttacherJoints.actionEventLowerAllImplements", "T7.300", True, True)]
    first = [e for e in lower["events"].values() if e["target"]["name"] == "T7.300"][0]
    assert first["fields"]["triggerDown"] is True and first["fields"]["displayPriority"] == 1
    assert keys["actions"]["FOLD_ALL_IMPLEMENTS"]["count"] == 0
    assert [s["name"] for s in keys["rig"].values()] == ["T7.300", "XT 390"]


def test_trace_logs_each_call_still_runs_it_and_restores(lua):
    lua.execute("""
        tr = CompanionSpike._newTrace()
        CompanionSpike._traceWrap(tr)
        pressAll("LOWER_ALL_IMPLEMENTS")
        for _ = 1, 30 do CompanionSpike._traceFrame(tr) end
    """)
    # both ran: the mower toggled twice, back where it was
    assert list(lua.eval("calls").values()) == ["tractor LOWER_ALL_IMPLEMENTS 1", "mower LOWER_ALL_IMPLEMENTS 1"]
    assert lua.eval("mower.lowered") is False
    tr = lua.eval("tr")
    calls = list(tr["calls"].values())
    assert [c["callback"] for c in calls] == ["AttacherJoints.actionEventLowerAllImplements",
                                              "Attachable.actionEventLowerImplement"]
    assert calls[0]["before"][2]["lowered"] is False and calls[1]["before"][2]["lowered"] is True
    assert calls[0]["inputValue"] == 1 and calls[0]["args"] == 8
    assert calls[0]["stack"] is not None
    assert tr["after"][1]["states"][2]["lowered"] is False, "30 frames on: back where it started"

    # the game registers the events again: the next frame wraps the new one
    lua.execute("""
        local lowerAll = g_inputBinding.nameActions.LOWER_ALL_IMPLEMENTS
        g_inputBinding.actionEvents[lowerAll][3] = { id = 13, isActive = true, targetObject = mower,
            callback = Attachable.actionEventLowerImplement }
        CompanionSpike._traceFrame(tr)
    """)
    assert tr["wrappedCount"] == 3
    assert lua.eval("CompanionSpike._traceUnwrap(tr)") == 3
    assert lua.eval("g_inputBinding.actionEvents[g_inputBinding.nameActions.LOWER_ALL_IMPLEMENTS][1].callback "
                    "== AttacherJoints.actionEventLowerAllImplements")
    lua.execute('pressAll("LOWER_ALL_IMPLEMENTS")')
    assert len(list(tr["calls"].values())) == 2, "unwrapped: no more calls logged"


def test_cspress_presses_on_the_next_frame_as_the_mod_does(lua):
    assert "one of" in lua.eval('CompanionSpike:consolePress("EXPLODE")')
    lua.execute("""
        CompanionSpike:consoleTrace()
        msg = CompanionSpike:consolePress("")
    """)
    assert "LOWER_ALL_IMPLEMENTS" in lua.eval("msg")
    assert list(lua.eval("calls").values()) == [], "not from the console: on the next frame"
    lua.execute("CompanionSpike:update(16)")
    assert len(list(lua.eval("calls").values())) == 2, "every active handler, as runInputAction"
    # the trace marks the press, with the mod's 8 arguments
    calls = list(lua.eval("CompanionSpike._ctx.trace.calls").values())
    assert [(c["pressedBy"], c["args"]) for c in calls] == [("csPress", 8), ("csPress", 8)]
    lua.execute("CompanionSpike:update(16)")
    assert len(list(lua.eval("calls").values())) == 2, "once only"
    assert "2 calls" in lua.eval("CompanionSpike:consoleTrace()")


def test_trace_records_each_argument(lua):
    lua.execute("""
        tr = CompanionSpike._newTrace()
        CompanionSpike._traceWrap(tr)
        local e = g_inputBinding.actionEvents[g_inputBinding.nameActions.LOWER_ALL_IMPLEMENTS][1]
        e.callback(e.targetObject, "LOWER_ALL_IMPLEMENTS", 1, nil, false, false, 3, "binding", "ninth")
        CompanionSpike._traceUnwrap(tr)
    """)
    call = lua.eval("tr.calls[1]")
    assert call["args"] == 9
    assert list(call["argTypes"].values()) == ["boolean", "boolean", "number", "string", "string"]
    assert call["argValues"][5] == "ninth"
    assert call["pressedBy"] is None


def test_a_failing_log_never_stops_the_handler(lua):
    lua.execute("""
        tr = CompanionSpike._newTrace()
        CompanionSpike._traceWrap(tr)
        local real = g_time
        g_time = setmetatable({}, { __index = function() error("boom") end })
        tractor.getIsLowered = function() error("broken getter") end
        local e = g_inputBinding.actionEvents[g_inputBinding.nameActions.LOWER_ALL_IMPLEMENTS][1]
        e.callback(e.targetObject, "LOWER_ALL_IMPLEMENTS", 1)
        g_time = real
        CompanionSpike._traceUnwrap(tr)
    """)
    assert list(lua.eval("calls").values()) == ["tractor LOWER_ALL_IMPLEMENTS 1"], "the handler still ran"
