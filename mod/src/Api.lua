-- Api.lua
-- Guarded access to game objects for the collectors. Names that Phase 0
-- verified are called directly in the collectors; anything unverified goes
-- through these helpers so a wrong guess yields nil instead of an error.

Companion = Companion or {}

local Api = {}
Companion.Api = Api

local unpackValues = table.unpack or unpack

-- obj:name(...) or nil when the method is missing or raises. Returns only
-- the first result; use tryCallAll for multiple results.
function Api.tryCall(obj, name, ...)
    if type(obj) ~= "table" or type(obj[name]) ~= "function" then
        return nil
    end
    local ok, result = pcall(obj[name], obj, ...)
    if not ok then
        return nil
    end
    return result
end

function Api.tryCallAll(obj, name, ...)
    if type(obj) ~= "table" or type(obj[name]) ~= "function" then
        return nil
    end
    local r = { pcall(obj[name], obj, ...) }
    if not r[1] then
        return nil
    end
    return unpackValues(r, 2)
end

-- fn(...) for a plain function in a table (Utils.*: no self), or nil
local function tryStatic(t, name, ...)
    if type(t) ~= "table" or type(t[name]) ~= "function" then
        return nil
    end
    local ok, result = pcall(t[name], ...)
    if not ok then
        return nil
    end
    return result
end

-- specs/0017: the game speed the player set (×), or nil. missionInfo's
-- timeScale (FS22's script docs; unverified), else the effective one the
-- game's own Lua uses (BaleManager, VehicleSystem: gameSource.zip)
function Api.timeScale()
    local mission = g_currentMission
    if type(mission) ~= "table" then
        return nil
    end
    local info = mission.missionInfo
    local value = type(info) == "table" and info.timeScale or nil
    if type(value) ~= "number" then
        value = Api.tryCall(mission, "getEffectiveTimeScale")
    end
    if type(value) ~= "number" or value ~= value or value <= 0 then
        return nil
    end
    return value
end

-- every step the game's 7 and 8 go through, slowest first, each once, or
-- nil: Utils.getNumTimeScales and getTimeScaleFromIndex (declared in
-- gameSource.zip's Utils.lua, their bodies not there; unverified). The
-- index is read from 1, else from 0.
function Api.timeScaleSteps()
    local n = tryStatic(Utils, "getNumTimeScales")
    if type(n) ~= "number" or n < 1 or n > 64 then
        return nil
    end
    for _, first in ipairs({ 1, 0 }) do
        local list, seen, whole = {}, {}, true
        for i = first, first + n - 1 do
            local v = tryStatic(Utils, "getTimeScaleFromIndex", i)
            if type(v) ~= "number" or v ~= v or v <= 0 then
                whole = false
                break
            end
            if not seen[v] then
                seen[v] = true
                list[#list + 1] = v
            end
        end
        if whole then
            table.sort(list)
            return list
        end
    end
    return nil
end

-- the vehicle the local player sits in, or nil
function Api.controlledVehicle()
    local player = g_localPlayer
    if player == nil then
        return nil
    end
    return Api.tryCall(player, "getCurrentVehicle")
end

-- Game collections may be arrays, id-keyed maps or sets keyed by the object
-- itself (Phase 0); normalise to an array of the object tables.
function Api.listOf(t)
    local list = {}
    if type(t) ~= "table" then
        return list
    end
    for k, v in pairs(t) do
        if type(v) == "table" then
            list[#list + 1] = v
        elseif type(k) == "table" then
            list[#list + 1] = k
        end
    end
    return list
end

-- a field's number, as the PDA shows it (getId() verified in Phase 0)
function Api.fieldId(field)
    local id = Api.tryCall(field, "getId")
    if type(id) ~= "number" then
        id = field.fieldId or field.id
    end
    return type(id) == "number" and id or nil
end

-- specs/0018, contracts. Every name below is from the game's own scripts
-- (gameSource.zip: dataS/scripts/missions/) or FS25_BetterContracts, none
-- verified in game yet.

-- the game's own table of missions, not copied, or nil: MissionManager's
-- getMissions(), else its missions table
function Api.missionTable()
    local manager = g_missionManager
    if type(manager) ~= "table" then
        return nil
    end
    local list = Api.tryCall(manager, "getMissions")
    if type(list) ~= "table" then
        list = manager.missions
    end
    return type(list) == "table" and list or nil
end

-- every mission the game holds, as an array, or nil
function Api.missions()
    local list = Api.missionTable()
    return list ~= nil and Api.listOf(list) or nil
end

-- the game's enums are blanked in gameSource.zip: compared at run time
local MISSION_STATUS = { CREATED = "offer", PREPARING = "preparing", RUNNING = "running", FINISHED = "finished" }
local MISSION_FINISH = { SUCCESS = "success", FAILED = "failed", TIMED_OUT = "timedOut", CANCELED = "canceled" }

local function enumName(enum, value, names)
    if type(enum) ~= "table" or value == nil then
        return nil
    end
    for key, name in pairs(names) do
        if enum[key] ~= nil and enum[key] == value then
            return name
        end
    end
    return nil
end

-- "offer", "preparing", "running" or "finished"; nil for a dismissed one
-- and when the game's MissionStatus isn't there
function Api.missionStatus(mission)
    return enumName(MissionStatus, mission.status, MISSION_STATUS)
end

-- "success", "failed", "timedOut" or "canceled", or nil
function Api.missionFinishState(mission)
    return enumName(MissionFinishState, mission.finishState, MISSION_FINISH)
end

-- where a contract's leased machines appear: the shop's first spawn place
-- (AbstractMission:spawnVehicles loads them at mission.storeSpawnPlaces;
-- a place's startX and startZ after PlacementUtil, unverified). x, z or nil.
function Api.storeSpawnPoint()
    local places = g_currentMission ~= nil and g_currentMission.storeSpawnPlaces or nil
    local place = type(places) == "table" and places[1] or nil
    if type(place) ~= "table" or type(place.startX) ~= "number" or type(place.startZ) ~= "number" then
        return nil
    end
    return place.startX, place.startZ
end

-- how many contracts one farm may hold, or nil
function Api.missionLimit()
    local limit = type(MissionManager) == "table" and MissionManager.MAX_MISSIONS_PER_FARM or nil
    return type(limit) == "number" and limit > 0 and limit or nil
end

local function factorOf(class, key)
    local value = type(class) == "table" and class[key] or nil
    return type(value) == "number" and value > 0 and value <= 1 and value or nil
end

-- the share that counts as done: of a field worked (AbstractMission), of a
-- harvest's expected litres delivered (HarvestMission), of a baling
-- contract's (BaleMission; the last two from BetterContracts). nil when
-- none is there.
function Api.missionFactors()
    local out = {
        field = factorOf(AbstractMission, "SUCCESS_FACTOR"),
        harvest = factorOf(HarvestMission, "SUCCESS_FACTOR"),
        bale = factorOf(BaleMission, "FILL_SUCCESS_FACTOR"),
    }
    return next(out) ~= nil and out or nil
end

-- specs/0019, a contract's three actions: the game's own MissionManager
-- functions (gameSource.zip: MissionManager.lua, server only), run in the
-- spike of 2026-11-16 but not by the mod yet, hence the guards. Nothing
-- here is called before the game is known to have it.

-- whether the contract commands can run here at all: the mission manager
-- and its statuses (without them nothing can be told apart)
function Api.hasMissions()
    return type(g_missionManager) == "table" and type(MissionStatus) == "table"
end

-- whether this game is the server (single player or hosting): the three
-- functions assert it. No getIsServer: not the server.
function Api.isServer()
    return Api.tryCall(g_currentMission, "getIsServer") == true
end

-- the mission with this unique id that the game still lists (offer,
-- preparing, running or finished), or nil. getMissionByUniqueId (a function
-- in the game, spike 2026-11-16; never called there) only when its answer
-- carries the id, else the list the contracts topic reads.
function Api.missionById(id)
    local found = Api.tryCall(g_missionManager, "getMissionByUniqueId", id)
    if type(found) ~= "table" or Api.tryCall(found, "getUniqueId") ~= id then
        found = nil
        for _, mission in ipairs(Api.missions() or {}) do
            if Api.tryCall(mission, "getUniqueId") == id then
                found = mission
                break
            end
        end
    end
    if found == nil or Api.missionStatus(found) == nil then
        return nil
    end
    return found
end

-- whether the game's list was read and no mission in it has this id (a
-- hand-in's check); false when the list can't be read
function Api.missionGone(id)
    if Api.missions() == nil then
        return false
    end
    return Api.missionById(id) == nil
end

-- whether the mission manager has this function
function Api.hasMissionCall(name)
    return type(g_missionManager) == "table" and type(g_missionManager[name]) == "function"
end

-- g_missionManager:<name>(...): true and its first answer, or false when
-- it raised
local function missionCall(name, ...)
    local manager = g_missionManager
    local ok, result = pcall(manager[name], manager, ...)
    return ok, result
end

-- MissionStartState's names (the table isn't in gameSource.zip; the spike
-- read OK 1 ... NO_PERMISSION 8) and what the ack says for each refusal
local START_REFUSALS = {
    LIMIT_REACHED = "limit reached", PENDING_MISSION = "another one is preparing",
    NOT_AVAILABLE_ANYMORE = "not available any more", CANNOT_BE_STARTED_NOW = "can't be started now",
    ALREADY_STARTED = "already started", NO_ACCESS = "no access", NO_PERMISSION = "no permission",
}

-- whether a start's answer can be read: the game's MissionStartState
function Api.hasStartStates()
    return type(MissionStartState) == "table" and MissionStartState.OK ~= nil
end

-- startMission(mission, farmId, spawnVehicles): true, or false and why.
-- Only MissionStartState.OK is a start; any other answer, none included, is
-- a refusal, by its name where the table has one.
function Api.startMission(mission, farmId, lease)
    local ok, state = missionCall("startMission", mission, farmId, lease == true)
    if not ok then
        return false, "failed in game"
    end
    if state ~= nil and state == MissionStartState.OK then
        return true
    end
    for key, words in pairs(START_REFUSALS) do
        if state ~= nil and MissionStartState[key] == state then
            return false, words
        end
    end
    return false, "refused"
end

-- cancelMission(mission) (it calls mission:finish(CANCELED)) or
-- dismissMission(mission) (it books getTotalReward(), then deletes the
-- mission): true, or false and why
function Api.endMission(name, mission)
    local ok, answer = missionCall(name, mission)
    if not ok then
        return false, "failed in game"
    end
    if answer == false then
        return false, "refused"
    end
    return true
end

-- whether the shop has room for a contract's leased machines:
-- mission:isSpawnSpaceAvailable() (AbstractMission.lua; it marks the
-- places while it looks and unmarks them before it returns). Only false
-- says no; a missing or failing call leaves it to startMission.
function Api.spawnSpaceAvailable(mission)
    return Api.tryCall(mission, "isSpawnSpaceAvailable") ~= false
end

-- a shop item's specs (item.specs: workingWidth, speedLimit ...), loaded
-- from its xml as the shop does when it lists the item
-- (StoreItemUtil.loadSpecsFromXML); the game clears them at start
function Api.loadShopSpecs(item)
    if type(StoreItemUtil) ~= "table" or type(StoreItemUtil.loadSpecsFromXML) ~= "function" then
        return
    end
    pcall(StoreItemUtil.loadSpecsFromXML, item)
end

-- a node's x in another node's frame (the engine's localToLocal), or nil;
-- for the work areas' spans (specs/0013 revision 3, unverified there)
function Api.localX(node, toNode)
    if localToLocal == nil or node == nil or toNode == nil then
        return nil
    end
    local ok, x = pcall(localToLocal, node, toNode, 0, 0, 0)
    if not ok or type(x) ~= "number" or x ~= x then
        return nil
    end
    return x
end
