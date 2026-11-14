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
