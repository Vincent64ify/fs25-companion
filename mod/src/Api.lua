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

-- specs/0020: Steering Assist. AIModeSelection.MODE is blanked in the
-- archive too (WORKER 1, STEERING_ASSIST 2 at run time, spike 0.0.15):
-- compared by name. Unverified until spec 0020's live check.
local AI_MODE = { WORKER = "worker", STEERING_ASSIST = "steeringAssist" }

-- "worker" or "steeringAssist" (AIModeSelection.lua's currentMode); nil
-- without the part, the enum, or for a mode neither name has
function Api.aiMode(vehicle)
    local spec = type(vehicle) == "table" and vehicle.spec_aiModeSelection or nil
    if type(spec) ~= "table" then
        return nil
    end
    return enumName(type(AIModeSelection) == "table" and AIModeSelection.MODE or nil, spec.currentMode, AI_MODE)
end

-- the steering part (AIAutomaticSteering.lua: steeringEnabled, and
-- steeringFieldCourse while the game has a course for the field), or nil
function Api.automaticSteering(vehicle)
    local spec = type(vehicle) == "table" and vehicle.spec_aiAutomaticSteering or nil
    return type(spec) == "table" and spec or nil
end

-- specs/0021: the Steering Assist course, plain fields only (its class,
-- SteeringFieldCourse, is not in the SDK's archive; spike 0.0.16 and 0.0.17
-- read these on Solek, mod/tests/fixtures/spike0021/). Unverified until
-- spec 0021's live check.

-- the course the game built for this vehicle's field, or nil
function Api.steeringCourse(vehicle)
    local spec = Api.automaticSteering(vehicle)
    local course = spec ~= nil and spec.steeringFieldCourse or nil
    return type(course) == "table" and course or nil
end

-- the game's own "on a field the farm may work" (lastIsOnField, updated
-- only in Steering Assist mode for the local player's vehicle,
-- AIAutomaticSteering.lua:440-441); nil without the part
function Api.steeringOnField(vehicle)
    local spec = Api.automaticSteering(vehicle)
    if spec == nil then
        return nil
    end
    return spec.lastIsOnField == true
end

-- the course's segments in the game's order: fieldCourse.segments (the
-- course's own segments is the same table)
function Api.courseSegments(course)
    local inner = type(course.fieldCourse) == "table" and course.fieldCourse or nil
    local segments = inner ~= nil and inner.segments or course.segments
    return type(segments) == "table" and segments or nil
end

-- one boolean per segment, the save's workedLines
function Api.courseStates(course)
    return type(course.segmentStates) == "table" and course.segmentStates or nil
end

-- the field's outline, {x, z} pairs: courseField.boundaryPositions (the
-- course's rootBoundaryLine is the same table). specs/0022: the builder's
-- raw course holds courseField itself (spike 0.0.18)
function Api.courseBoundary(course)
    local inner = type(course.fieldCourse) == "table" and course.fieldCourse or course
    local field = type(inner.courseField) == "table" and inner.courseField or nil
    local boundary = field ~= nil and field.boundaryPositions or course.rootBoundaryLine
    return type(boundary) == "table" and boundary or nil
end

-- the working width the course was built for (AIAutomaticSteering.lua:470
-- reads it there too)
function Api.courseWidth(course)
    local settings = course.fieldCourseSettings
    local width = type(settings) == "table" and settings.implementWidth or nil
    return type(width) == "number" and width or nil
end

-- the segment under you: its index and side, or nil with none (the game's
-- own test for "no lane": currentSegment nil, AIAutomaticSteering.lua:787)
function Api.courseCurrent(course)
    if course.currentSegment == nil or type(course.currentSegmentIndex) ~= "number" then
        return nil
    end
    return course.currentSegmentIndex, course.currentSegmentIsLeft == true
end

-- a segment's lane number (offsetLineIndex) or headland round
-- (headlandIndex), and its polyline as {x, z} pairs
function Api.segmentParts(segment)
    local headland = segment.isHeadlandSegment == true
    return {
        id = segment.segmentId,
        lane = not headland and segment.offsetLineIndex or nil,
        round = headland and segment.headlandIndex or nil,
        positions = segment.positions,
    }
end

-- specs/0022: Steering Assist's settings ------------------------------------
-- The game's AI Settings dialog, as spikes 0.0.18 to 0.0.21 saw it: the
-- course settings (spec_aiModeSelection.fieldCourseSettings, the selected
-- mode's), the dialog's own settings (userSettings, AIUserSettings, not in
-- the SDK's archive: one list of entries per mode, settings[MODE], each
-- with value, defaultValue, min, max and setting.identifier), what the
-- dialog's OK calls (AIModeSelection.lua:249, 324-333) and holding H's two
-- calls (231-243). Every call here is guarded: nil or false and why, never
-- a raise.

-- AIModeSelection.MODE's value for "worker" or "steeringAssist", or nil
function Api.aiModeValue(name)
    local modes = type(AIModeSelection) == "table" and AIModeSelection.MODE or nil
    if type(modes) ~= "table" then
        return nil
    end
    for key, n in pairs(AI_MODE) do
        if n == name then
            return modes[key]
        end
    end
    return nil
end

function Api.modeSelection(vehicle)
    local spec = type(vehicle) == "table" and vehicle.spec_aiModeSelection or nil
    return type(spec) == "table" and spec or nil
end

-- a mode's entries (its rows in the dialog), or nil
function Api.userEntries(vehicle, modeName)
    local spec = Api.modeSelection(vehicle)
    local us = spec ~= nil and spec.userSettings or nil
    local lists = type(us) == "table" and us.settings or nil
    local mode = Api.aiModeValue(modeName)
    local list = type(lists) == "table" and mode ~= nil and lists[mode] or nil
    return type(list) == "table" and list or nil
end

-- the entry with this identifier ("implementWidth", "showLines"), or nil
function Api.entryOf(list, identifier)
    if type(list) ~= "table" then
        return nil
    end
    for _, e in ipairs(list) do
        local s = type(e) == "table" and e.setting or nil
        if type(s) == "table" and s.identifier == identifier then
            return e
        end
    end
    return nil
end

-- the direction's choices in degrees: Automatic (-57.2958, -1 rad) first,
-- then 0 to 175 in 5s (setting.textMapping, spike 0.0.19)
function Api.directionChoices(entry)
    local s = type(entry) == "table" and entry.setting or nil
    local m = type(s) == "table" and s.textMapping or nil
    return type(m) == "table" and m or nil
end

-- the game settings Steering Assist reads, every vehicle's (spike 0.0.18):
-- their id and value; nil without them
local GAME_SETTINGS = { lines = "STEERING_ASSIST_LINES", cruise = "STEERING_ASSIST_CRUISE_CONTROL" }

function Api.gameSetting(name)
    local ids = type(GameSettings) == "table" and GameSettings.SETTING or nil
    local id = type(ids) == "table" and ids[GAME_SETTINGS[name]] or nil
    if id == nil or type(g_gameSettings) ~= "table" then
        return id, nil
    end
    -- a plain field (not `a and b or nil`: Off is false)
    return id, g_gameSettings[id]
end

-- set one, as the game's own lines key does (AIAutomaticSteering.lua:923)
function Api.setGameSetting(name, value)
    local id = Api.gameSetting(name)
    if id == nil or type(g_gameSettings) ~= "table" or type(g_gameSettings.setValue) ~= "function" then
        return false, "no such game setting"
    end
    local ok, err = pcall(g_gameSettings.setValue, g_gameSettings, id, value, true)
    if not ok then
        return false, tostring(err)
    end
    return true
end

-- whether a tool here allows Steering Assist (the game's own guard,
-- AIAutomaticSteering.lua:629-645: getImplementAllowAutomaticSteering on
-- the rig, plain reads); nil without it
function Api.canAssist(vehicle)
    local allowed = Api.tryCall(vehicle, "getIsAutomaticSteeringAllowed")
    if type(allowed) ~= "boolean" then
        return nil
    end
    return allowed
end

-- After a hitch the game keeps neither settings until H is held: make them
-- as holding H does (FieldCourseSettings.generate for the rig, then
-- AIUserSettings.new from them; spike 0.0.21). true, or false and why.
function Api.ensureUserSettings(vehicle)
    local spec = Api.modeSelection(vehicle)
    if spec == nil then
        return false, "no Steering Assist"
    end
    if spec.fieldCourseSettings == nil then
        local root = Api.tryCall(vehicle, "getRootVehicle") or vehicle
        local generate = type(FieldCourseSettings) == "table" and FieldCourseSettings.generate or nil
        if type(generate) ~= "function" then
            return false, "no settings"
        end
        local ok, settings = pcall(generate, root)
        if not ok or type(settings) ~= "table" then
            return false, "no settings"
        end
        spec.fieldCourseSettings = settings
        if spec.userSettings ~= nil then
            local us = spec.userSettings
            if not pcall(us.reinitialize, us, settings, true) then
                return false, "no settings"
            end
        end
    end
    if spec.userSettings == nil then
        local new = type(AIUserSettings) == "table" and AIUserSettings.new or nil
        if type(new) ~= "function" then
            return false, "no settings"
        end
        local ok, us = pcall(new, spec.fieldCourseSettings)
        if not ok or type(us) ~= "table" then
            return false, "no settings"
        end
        spec.userSettings = us
    end
    return true
end

-- a copy of the course settings (the game's clone(), as its dialog takes)
function Api.cloneCourseSettings(vehicle)
    local spec = Api.modeSelection(vehicle)
    local settings = spec ~= nil and spec.fieldCourseSettings or nil
    if type(settings) ~= "table" then
        return nil
    end
    local clone = Api.tryCall(settings, "clone")
    return type(clone) == "table" and clone or nil
end

-- the dialog's OK: a clone with the mode's entries applied onto it
-- (userSettings:apply), committed with aiModeSettingsChanged, which stores
-- it, tells the game, sets the mode and has the course built again.
-- true, or false and why
function Api.commitUserSettings(vehicle, modeName)
    local spec = Api.modeSelection(vehicle)
    local us = spec ~= nil and spec.userSettings or nil
    local mode = Api.aiModeValue(modeName)
    if type(us) ~= "table" or mode == nil or type(vehicle.aiModeSettingsChanged) ~= "function" then
        return false, "no settings"
    end
    local clone = Api.cloneCourseSettings(vehicle)
    if clone == nil then
        return false, "no settings"
    end
    if not pcall(us.apply, us, clone, mode) then
        return false, "the game refused the settings"
    end
    if not pcall(vehicle.aiModeSettingsChanged, vehicle, mode, clone) then
        return false, "the game refused the settings"
    end
    return true
end

-- the game's course builder (g_fieldCourseManager), or nil
function Api.courseBuilder()
    local m = g_fieldCourseManager
    if type(m) ~= "table" or type(m.generateFieldCourseAtWorldPos) ~= "function" then
        return nil
    end
    return m
end

-- a point on a terrain detail pixel, as the game rounds it
local function onPixel(builder, x, z)
    local rx, rz = Api.tryCallAll(builder, "roundToTerrainDetailPixel", x, z)
    if type(rx) == "number" and type(rz) == "number" then
        return rx, rz
    end
    return x, z
end

-- where the game asks for its course (AIAutomaticSteering.lua:442-450):
-- the vehicle's front, else its back plus a metre; nil without the
-- engine's functions
function Api.coursePosition(vehicle, builder)
    local node, size = vehicle.rootNode, vehicle.size
    if node == nil or type(localToWorld) ~= "function" then
        return nil
    end
    local len = type(size) == "table" and size.length or 0
    local off = type(size) == "table" and size.lengthOffset or 0
    local ok, x, _, z = pcall(localToWorld, node, 0, 0, len * 0.5 + off)
    if not ok or type(x) ~= "number" or type(z) ~= "number" then
        return nil
    end
    x, z = onPixel(builder, x, z)
    local mission = g_currentMission
    local detail = type(mission) == "table" and mission.terrainDetailId or nil
    if detail ~= nil and type(getDensityAtWorldPos) == "function" then
        local dok, density = pcall(getDensityAtWorldPos, detail, x, 0, z)
        if dok and density == 0 then
            local bx, bz
            ok, bx, _, bz = pcall(localToWorld, node, 0, 0, -len * 0.5 + off + 1)
            if ok and type(bx) == "number" and type(bz) == "number" then
                x, z = onPixel(builder, bx, bz)
            end
        end
    end
    return x, z
end

-- ask it for a course with these settings; callback(course or nil) later
-- (spike 0.0.18: 150 to 340 ms, one at a time, queued). true, or false
function Api.buildCourse(builder, x, z, settings, callback)
    return pcall(builder.generateFieldCourseAtWorldPos, builder, x, z, settings, function(_, course)
        callback(course)
    end) == true
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

-- the litres a harvest contract expects, or nil: mission.expectedLiters,
-- which the game sets when the contract starts; every harvest offer says
-- 0, and then mission:getMaxCutLiters() works it out, as
-- FS25_BetterContracts does. Spike 0.0.14 (2026-11-17): on an offer it
-- leaves the completion state as it was. 0 both ways is none. Never
-- getFieldCompletion(), getCompletion(), or a sum on a contract not
-- finished: those freeze the game once the contract starts (GAME-API.md).
function Api.expectedLiters(mission)
    local expected = mission.expectedLiters
    if type(expected) ~= "number" then
        return nil
    end
    if expected > 0 then
        return expected
    end
    local cut = Api.tryCall(mission, "getMaxCutLiters")
    return type(cut) == "number" and cut > 0 and cut or nil
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
-- harvest's expected litres delivered (HarvestMission, after
-- BetterContracts; with it installed, its own value, which the game then
-- uses too). nil when none is there. No baling factor: the base game has
-- none (BaleMission.FILL_SUCCESS_FACTOR is BetterContracts' own) and a
-- baling contract has no litres (spike, 2026-11-17).
function Api.missionFactors()
    local out = {
        field = factorOf(AbstractMission, "SUCCESS_FACTOR"),
        harvest = factorOf(HarvestMission, "SUCCESS_FACTOR"),
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
