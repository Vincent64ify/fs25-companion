-- collectors/vehicles/Fill.lua
-- A vehicle's own fill units for the `vehicles` topic: levels, fill types
-- and the Trailer Fill Limit (FS22 script names, guarded; see Vehicles.lua).

Companion = Companion or {}

local Api = Companion.Api
local Geo = Companion.Geo

-- the parts of the vehicles collector, shared between its files in
-- collectors/vehicles/ and Vehicles.lua (specs/0009); not a collector
local Parts = Companion.VehicleParts or {}
Companion.VehicleParts = Parts

-- every fill type a motor consumes: their units are fuel, not cargo
local CONSUMED_TYPES = { "DIESEL", "ELECTRICCHARGE", "METHANE", "DEF", "AIR" }
local MAX_FILL_UNITS = 8

local function consumerUnits(vehicle)
    local units = {}
    local fillTypes = FillType
    if type(fillTypes) == "table" and vehicle.spec_motorized ~= nil then
        for _, name in ipairs(CONSUMED_TYPES) do
            local unit = fillTypes[name] ~= nil and Api.tryCall(vehicle, "getConsumerFillUnitIndex", fillTypes[name]) or nil
            if unit ~= nil and unit ~= false then
                units[unit] = true
            end
        end
    end
    return units
end

-- fill type index -> {name, title}; types don't change. Cleared per map.
local fillTypeInfos = {}

local function fillTypeInfo(index)
    local info = fillTypeInfos[index]
    if info == nil then
        info = {}
        local fillType = Api.tryCall(g_fillTypeManager, "getFillTypeByIndex", index)
        if type(fillType) == "table" then
            if type(fillType.name) == "string" then
                info.name = fillType.name
            end
            if type(fillType.title) == "string" then
                info.title = fillType.title
            end
            if type(fillType.massPerLiter) == "number" and fillType.massPerLiter > 0 then
                info.massPerLiter = fillType.massPerLiter
            end
        end
        fillTypeInfos[index] = info
    end
    return info
end

-- the game's Trailer Fill Limit (FillUnit.lua): with the setting on, a
-- vehicle stops taking load at its maximum mass, every unit at once, and its
-- HUD shows MAX. {reached, available (t)}; nil when the setting is off or the
-- vehicle has no maximum.
local function massLimit(vehicle)
    local info = g_currentMission ~= nil and g_currentMission.missionInfo or nil
    if type(info) ~= "table" or not info.trailerFillLimit then
        return nil
    end
    local max = vehicle.maxComponentMass
    if type(max) ~= "number" or max == math.huge then
        return nil
    end
    local reached = Api.tryCall(vehicle, "getMaxComponentMassReached")
    local available = Api.tryCall(vehicle, "getAvailableComponentMass")
    if type(reached) ~= "boolean" or type(available) ~= "number" then
        return nil
    end
    return { reached = reached, available = available }
end

-- the vehicle's own fill units (a trailer's load, a sprayer's tank, a
-- combine's grain tank), in unit order, without the motor's fuel, DEF and
-- air and without units the game hides from its HUD. An empty unit has no
-- fill type (UNKNOWN). Under the Trailer Fill Limit a unit gets maxReached
-- (the HUD's MAX) and limit, the litres it stops at when that is below its
-- capacity; a filled unit, massPerLiter when its fill type has one. Nil when
-- there is none.
local function fillLevels(vehicle)
    local spec = vehicle.spec_fillUnit
    local units = Api.tryCall(vehicle, "getFillUnits")
    if type(units) ~= "table" then
        units = spec ~= nil and spec.fillUnits or nil
    end
    if type(units) ~= "table" then
        return nil
    end
    local skip = consumerUnits(vehicle)
    local mass = massLimit(vehicle)
    local unknown = type(FillType) == "table" and FillType.UNKNOWN or nil
    local out = {}
    for index, unit in ipairs(units) do
        if #out >= MAX_FILL_UNITS then
            break
        end
        local capacity = Api.tryCall(vehicle, "getFillUnitCapacity", index)
        if type(capacity) ~= "number" then
            capacity = type(unit) == "table" and unit.capacity or nil
        end
        if not skip[index] and type(unit) == "table" and unit.showOnHud ~= false
            and type(capacity) == "number" and capacity > 0 then
            local level = Api.tryCall(vehicle, "getFillUnitFillLevel", index)
            if type(level) ~= "number" then
                level = unit.fillLevel
            end
            local fillType = Api.tryCall(vehicle, "getFillUnitFillType", index)
            if type(fillType) ~= "number" then
                fillType = unit.fillType
            end
            local entry = {
                unit = index,
                level = Geo.round(math.max(0, level or 0), 1),
                capacity = Geo.round(capacity, 1),
            }
            if type(fillType) == "number" and fillType ~= unknown and (level or 0) > 0 then
                local info = fillTypeInfo(fillType)
                entry.fillType = info.name and info.name:lower() or nil
                entry.fillTitle = info.title
                -- t per litre, as FillTypeManager has it (the yield estimate)
                entry.massPerLiter = info.massPerLiter
            end
            if mass ~= nil and not unit.ignoreFillLimit then
                local stop
                if mass.reached then
                    entry.maxReached = true
                    stop = level or 0
                elseif entry.fillType ~= nil and fillTypeInfo(fillType).massPerLiter ~= nil then
                    stop = (level or 0) + mass.available / fillTypeInfo(fillType).massPerLiter
                end
                if stop ~= nil and stop < capacity - 0.5 then
                    entry.limit = Geo.round(math.max(0, stop), 1)
                end
            end
            out[#out + 1] = entry
        end
    end
    if #out == 0 then
        return nil
    end
    return out
end

-- what reset() clears per map
function Parts.resetFill()
    fillTypeInfos = {}
end

Parts.fillLevels = fillLevels
Parts.fillTypeInfo = fillTypeInfo
Parts.massLimit = massLimit
