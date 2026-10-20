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

-- the vehicle the local player sits in, or nil
function Api.controlledVehicle()
    local player = g_localPlayer
    if player == nil then
        return nil
    end
    return Api.tryCall(player, "getCurrentVehicle")
end
