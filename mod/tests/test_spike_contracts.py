"""Spike 0.0.10 (spec 0019's probe): csMissions dumps the game's contracts
and the names the spec leans on; csAccept, csCancel and csHandIn call the
game's own MissionManager functions and record what changed. Offline, on a
stub manager written after the SDK's MissionManager.lua and
AbstractMission.lua."""

import json
from pathlib import Path

import pytest

lupa = pytest.importorskip("lupa")

SPIKE = Path(__file__).resolve().parents[2] / "research" / "spike" / "FS25_CompanionSpike" / "CompanionSpike.lua"

OUT = {}

STUB = r"""
g_time = 1000
MissionStatus = { CREATED = 1, PREPARING = 2, RUNNING = 3, FINISHED = 4, DISMISSED = 5 }
MissionFinishState = { SUCCESS = 1, FAILED = 2, TIMED_OUT = 3, CANCELED = 4 }
MissionStartState = { OK = 1, LIMIT_REACHED = 2, PENDING_MISSION = 3 }
MissionManager = { MAX_MISSIONS_PER_FARM = 3 }
farm = { money = 50000 }
g_farmManager = { getFarmById = function(self, id) return farm end }
g_localPlayer = { farmId = 1 }
server = true
g_currentMission = { getIsServer = function() return server end }
calls = {}
local function newMission(id, status, farmId, lease)
    local m = { uniqueId = id, status = status, farmId = farmId, type = { name = "plowMission" },
        vehiclesToLoad = lease and { {}, {} } or nil, vehicles = {}, reimbursement = 0, room = true }
    function m:getUniqueId() return self.uniqueId end
    function m:getTitle() return "Plough" end
    function m:getLocation() return "Field 12" end
    function m:getReward() return 9000 end
    function m:getVehicleCosts() return self.vehiclesToLoad ~= nil and 1400 or 0 end
    function m:getReimbursement() return self.reimbursement end
    function m:hasLeasableVehicles() return self.vehiclesToLoad ~= nil end
    function m:isSpawnSpaceAvailable() calls[#calls + 1] = "space " .. id; return self.room end
    function m:getCompletion() error("the spike must never call getCompletion") end
    function m:getTotalReward()
        return (self.finishState == MissionFinishState.SUCCESS and 9000 or 0)
            - (self.spawnedVehicles and 1400 or 0) + self.reimbursement
    end
    return m
end
offer = newMission("mission00aa11", MissionStatus.CREATED, nil, true)
plain = newMission("mission00bb22", MissionStatus.CREATED, nil, false)
running = newMission("mission00cc33", MissionStatus.RUNNING, 1, true)
running.spawnedVehicles = true
done = newMission("mission00dd44", MissionStatus.FINISHED, 1, false)
done.finishState = MissionFinishState.SUCCESS
theirs = newMission("mission00ee55", MissionStatus.RUNNING, 2, false)
g_missionManager = { missions = { offer, plain, running, done, theirs } }
function g_missionManager:getMissions() return self.missions end
function g_missionManager:hasFarmReachedMissionLimit(farmId) return false end
function g_missionManager:startMission(m, farmId, lease)
    calls[#calls + 1] = "start " .. m.uniqueId .. " " .. tostring(farmId) .. " " .. tostring(lease)
    m.farmId, m.status, m.spawnedVehicles = farmId, MissionStatus.PREPARING, lease
    return MissionStartState.OK
end
function g_missionManager:cancelMission(m)
    calls[#calls + 1] = "cancel " .. m.uniqueId
    m.status, m.finishState = MissionStatus.FINISHED, MissionFinishState.CANCELED
    return true
end
function g_missionManager:dismissMission(m)
    calls[#calls + 1] = "dismiss " .. m.uniqueId
    farm.money = farm.money + m:getTotalReward()
    m.status = MissionStatus.DISMISSED
    for i, other in ipairs(self.missions) do
        if other == m then table.remove(self.missions, i) break end
    end
    return true
end
g_gui = { currentGuiName = "", dialogs = {} }
function g_gui:getIsGuiVisible() return false end
function g_gui:getIsDialogVisible() return false end
"""


@pytest.fixture
def lua(tmp_path):
    rt = lupa.LuaRuntime()
    rt.execute(STUB)
    rt.execute(SPIKE.read_text(encoding="utf-8"))
    rt.globals().CompanionSpike._ctx.dir = str(tmp_path).replace("\\", "/") + "/"
    OUT["dir"] = tmp_path
    return rt


def run_out(lua, ms=7000):
    """The frames of one recording: the call on the first, then readings."""
    for _ in range(ms // 500 + 1):
        lua.execute("g_time = g_time + 500; CompanionSpike:update(500)")
    assert lua.eval("CompanionSpike._ctx.missionRun") is None


def read(lua, name):
    return json.loads((OUT["dir"] / name).read_text(encoding="utf-8"))["contract"]


def test_missions_lists_contracts_and_names(lua):
    msg = lua.eval('CompanionSpike:consoleMissions("")')
    assert "5 contract(s), 2 on offer, 2 yours" in msg and "server true" in msg
    out = json.loads((OUT["dir"] / "missions.json").read_text(encoding="utf-8"))["contracts"]
    assert out["globals"]["manager"]["startMission"] == "function"
    assert out["globals"]["enums"]["MissionStartState"]["OK"] == 1
    assert out["globals"]["named"]["MissionStartEvent"] == "nil"
    assert out["globals"]["limit"] == 3 and out["globals"]["money"] == 50000
    first = out["missions"][0]
    assert first["uniqueId"] == "mission00aa11" and first["status"] == "CREATED"
    assert first["hasLeasableVehicles"] is True and first["vehicleCosts"] == 1400
    assert out["missions"][3]["totalReward"] == 9000
    # reading the list never looks for room at the shop
    assert list(lua.globals().calls.values()) == []


def test_accept_with_lease_calls_the_games_function(lua):
    assert "accepting mission00aa11 (lease)" in lua.eval('CompanionSpike:consoleAccept("1", "lease")')
    assert "already recording" in lua.eval('CompanionSpike:consoleCancel("3")')
    run_out(lua)
    assert list(lua.globals().calls.values()) == ["space mission00aa11", "start mission00aa11 1 true"]
    out = read(lua, "accept-00aa11-lease.json")
    assert out["result"] == {"ok": True, "returned": 1, "value": 1, "name": "OK"}
    assert out["spawnSpace"] is True and out["before"]["facts"]["status"] == "CREATED"
    assert {"key": "status", "from": "CREATED", "to": "PREPARING"}.items() <= out["changes"][0].items() or any(
        c["key"] == "status" and c["to"] == "PREPARING" for c in out["changes"])
    assert out["after"]["facts"]["farmId"] == 1


def test_accept_own_by_a_piece_of_the_id(lua):
    assert "(own)" in lua.eval('CompanionSpike:consoleAccept("bb22", "own")')
    run_out(lua)
    assert list(lua.globals().calls.values()) == ["start mission00bb22 1 false"]
    assert (OUT["dir"] / "accept-00bb22-own.json").exists()


def test_accept_refuses_before_it_calls(lua):
    assert "csAccept N lease" in lua.eval('CompanionSpike:consoleAccept("1", "")')
    assert "no lease vehicles" in lua.eval('CompanionSpike:consoleAccept("2", "lease")')
    assert "already taken" in lua.eval('CompanionSpike:consoleAccept("3", "own")')
    assert "no contract matches" in lua.eval('CompanionSpike:consoleAccept("zz99", "own")')
    assert "5 contracts match" in lua.eval('CompanionSpike:consoleAccept("mission00", "own")')
    lua.execute("offer.room = false")
    assert "no room at the shop" in lua.eval('CompanionSpike:consoleAccept("1", "lease")')
    lua.execute("server = false")
    assert "host only" in lua.eval('CompanionSpike:consoleAccept("2", "own")')
    assert not any(str(c).startswith("start") for c in lua.globals().calls.values())


def test_cancel_then_hand_in_books_the_money(lua):
    assert "not finished" in lua.eval('CompanionSpike:consoleHandIn("3")')
    assert "not your farm" in lua.eval('CompanionSpike:consoleCancel("5")')
    assert "not your farm" in lua.eval('CompanionSpike:consoleCancel("1")')
    assert "already finished" in lua.eval('CompanionSpike:consoleCancel("4")')
    assert "cancelling mission00cc33" in lua.eval('CompanionSpike:consoleCancel("3")')
    run_out(lua)
    out = read(lua, "cancel-00cc33.json")
    assert out["result"]["value"] is True and out["after"]["facts"]["finishState"] == "CANCELED"
    assert "the game says -1400" in lua.eval('CompanionSpike:consoleHandIn("cc33")')
    run_out(lua)
    out = read(lua, "handin-00cc33.json")
    assert out["moneyChange"] == -1400 and out["after"]["inList"] is False
    assert any(c["key"] == "money" and c["to"] == 48600 for c in out["changes"])
    assert list(lua.globals().calls.values())[-1] == "dismiss mission00cc33"


def test_a_game_error_is_recorded_not_thrown(lua):
    lua.execute('function g_missionManager:dismissMission(m) error("server-only function") end')
    lua.eval('CompanionSpike:consoleHandIn("4")')
    run_out(lua)
    out = read(lua, "handin-00dd44.json")
    assert out["result"]["ok"] is False and "server-only" in out["result"]["error"]
    assert out["after"]["inList"] is True and out["moneyChange"] == 0


def test_enums_that_hide_their_keys_still_guard(lua):
    """The game's enums may answer enum.KEY without listing it to pairs():
    the guards compare the raw value by the key's name, as mod/src/Api.lua
    does."""
    lua.execute("""
        local function hidden(t) return setmetatable({}, { __index = t }) end
        MissionStatus, MissionFinishState, MissionStartState =
            hidden(MissionStatus), hidden(MissionFinishState), hidden(MissionStartState)
    """)
    assert "not finished" in lua.eval('CompanionSpike:consoleHandIn("3")')
    assert "already finished" in lua.eval('CompanionSpike:consoleCancel("4")')
    assert "already taken" in lua.eval('CompanionSpike:consoleAccept("3", "own")')
    lua.eval('CompanionSpike:consoleMissions("hidden")')
    out = json.loads((OUT["dir"] / "missions-hidden.json").read_text(encoding="utf-8"))["contracts"]
    assert out["missions"][3]["status"] == "FINISHED" and out["globals"]["enums"]["MissionStartState"]["OK"] == 1
    lua.eval('CompanionSpike:consoleHandIn("4")')
    run_out(lua)
    out = read(lua, "handin-00dd44.json")
    assert out["moneyChange"] == 9000 and out["after"]["facts"]["deleted"] is True
