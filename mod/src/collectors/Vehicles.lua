-- Vehicles.lua
-- Every vehicle on the map, twice per second (vehicleSystem.vehicles,
-- Phase 0): pose, name, owner, AI state, whether it has an engine and
-- whether it hangs on another vehicle. The vehicle the player controls also
-- gets the dashboard detail (motor, fuel, lights, implements).
--
-- The spec field names come from the old telemetry mod (which read them
-- through the pipe) and are guarded.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

local MAX_IMPLEMENT_DEPTH = 6

-- vehicle id -> full name; names don't change, and there may be many
-- vehicles. Cleared per map by reset().
local names = {}

local function vehicleName(vehicle)
    local name = names[vehicle.id]
    if name == nil then
        name = Api.tryCall(vehicle, "getFullName") or false
        names[vehicle.id] = name
    end
    return name or nil
end

local function speedKmh(vehicle, motorized)
    local speed = Api.tryCall(vehicle, "getLastSpeed")
    if speed == nil then
        return nil
    end
    return Geo.round(math.max(0, speed * (motorized.speedDisplayScale or 3.6)), 1)
end

local function collectImplements(vehicle, depth, out)
    local attached = Api.tryCall(vehicle, "getAttachedImplements")
    if type(attached) ~= "table" then
        return
    end
    for _, implement in pairs(attached) do
        local object = type(implement) == "table" and implement.object or nil
        if object ~= nil then
            out[#out + 1] = {
                name = Api.tryCall(object, "getFullName") or object.typeName,
                depth = depth,
                lowered = Api.tryCall(object, "getIsLowered", true) == true,
                turnedOn = Api.tryCall(object, "getIsTurnedOn") == true,
                wear = Geo.round(Api.tryCall(object, "getDamageAmount"), 3),
            }
            if depth < MAX_IMPLEMENT_DEPTH then
                collectImplements(object, depth + 1, out)
            end
        end
    end
end

-- FS25 keeps fuel in the fill unit the motor consumes from; the first fuel
-- type with a consumer wins (diesel, then electric charge, then methane)
local FUEL_TYPES = { "DIESEL", "ELECTRICCHARGE", "METHANE" }

local function fuelDetail(vehicle, motorized, entry)
    local fillTypes = FillType
    if type(fillTypes) == "table" then
        for _, name in ipairs(FUEL_TYPES) do
            local fillType = fillTypes[name]
            local unit = fillType ~= nil and Api.tryCall(vehicle, "getConsumerFillUnitIndex", fillType)
            if unit ~= nil and unit ~= false then
                entry.fuel = Geo.round(Api.tryCall(vehicle, "getFillUnitFillLevel", unit), 1)
                entry.fuelCapacity = Geo.round(Api.tryCall(vehicle, "getFillUnitCapacity", unit), 1)
                entry.fuelType = name:lower()
                return
            end
        end
    end
    -- the old telemetry mod's fields (nil in FS25 so far)
    if type(motorized.fuelLevel) == "table" then
        entry.fuel = Geo.round(motorized.fuelLevel.value, 1)
    end
    entry.fuelCapacity = Geo.round(motorized.maxFuelLevel, 1)
end

-- damage (0..1), as the implements report it; spec_wearable.wear was nil
local function wearOf(vehicle)
    local damage = Api.tryCall(vehicle, "getDamageAmount")
    if type(damage) ~= "number" then
        local wearable = vehicle.spec_wearable
        damage = wearable ~= nil and (wearable.damage or wearable.wear) or nil
    end
    return Geo.round(damage, 3)
end

-- operating time in ms (getOperationTime() returned nothing)
local function operatingHours(vehicle)
    local ms = Api.tryCall(vehicle, "getOperatingTime")
    if type(ms) ~= "number" then
        ms = vehicle.operatingTime
    end
    if type(ms) ~= "number" and vehicle.spec_motorized ~= nil then
        ms = vehicle.spec_motorized.operatingTime
    end
    if type(ms) ~= "number" then
        return nil
    end
    return Geo.round(ms / 3600000, 1)
end

local function motorDetail(vehicle, entry)
    local motorized = vehicle.spec_motorized
    if motorized == nil then
        return
    end
    entry.engineOn = motorized.engineStarted == true
    fuelDetail(vehicle, motorized, entry)
    if motorized.motorTemperature ~= nil then
        entry.motorTemp = Geo.round(motorized.motorTemperature.value, 1)
    end
    local motor = Api.tryCall(vehicle, "getMotor")
    if motor ~= nil then
        entry.rpm = Geo.round(Api.tryCall(motor, "getLastRealMotorRpm"), 0)
        entry.rpmMin = Geo.round(Api.tryCall(motor, "getMinRpm"), 0)
        entry.rpmMax = Geo.round(Api.tryCall(motor, "getMaxRpm"), 0)
        entry.gear = Api.tryCall(motor, "getGear")
    end
end

local function lights(vehicle)
    local spec = vehicle.spec_lights
    if spec == nil then
        return nil
    end
    return {
        on = spec.isLightOn == true,
        high = spec.isLightHighOn == true,
        left = spec.leftTurnSignalOn == true,
        right = spec.rightTurnSignalOn == true,
        hazard = spec.hazardOn == true,
        beacon = spec.beaconOn == true,
    }
end

local function vehicleEntry(vehicle, detailed)
    local entry = Geo.nodePose(vehicle.rootNode)
    if entry == nil then
        return nil
    end
    entry.id = vehicle.id
    entry.typeName = vehicle.typeName
    entry.name = vehicleName(vehicle)
    entry.farmId = Api.tryCall(vehicle, "getOwnerFarmId")
    entry.isAI = Api.tryCall(vehicle, "getIsAIActive") == true
    entry.propertyState = vehicle.propertyState
    local motorized = vehicle.spec_motorized
    entry.motorized = motorized ~= nil
    if motorized ~= nil then
        entry.speed = speedKmh(vehicle, motorized)
    end
    -- an implement or trailer hitched to something: the PDA draws only
    -- the vehicle pulling it
    entry.attached = Api.tryCall(vehicle, "getAttacherVehicle") ~= nil
    if detailed then
        motorDetail(vehicle, entry)
        entry.lights = lights(vehicle)
        entry.wear = wearOf(vehicle)
        entry.operatingHours = operatingHours(vehicle)
        entry.mass = Geo.round(Api.tryCall(vehicle, "getTotalMass", false), 2)
        local implements = {}
        collectImplements(vehicle, 1, implements)
        entry.implements = implements
    end
    return entry
end

local function idLess(a, b)
    local ta, tb = type(a.id), type(b.id)
    if ta ~= tb then
        return ta < tb
    end
    return a.id < b.id
end

Companion.Collectors.Vehicles = {
    topic = "vehicles",
    interval = 500,
    reset = function()
        names = {}
    end,
    collect = function(ctx)
        local data = { vehicles = {} }
        local controlled = Api.controlledVehicle()
        local system = g_currentMission.vehicleSystem
        local all = Api.listOf(system ~= nil and system.vehicles or nil)
        local listed = false
        for _, vehicle in ipairs(all) do
            if vehicle.isDeleted ~= true and vehicle.id ~= nil then
                local entry = vehicleEntry(vehicle, vehicle == controlled)
                if entry ~= nil then
                    data.vehicles[#data.vehicles + 1] = entry
                    if vehicle == controlled then
                        data.controlledId = entry.id
                        listed = true
                    end
                end
            end
        end
        if controlled ~= nil and not listed then
            local entry = vehicleEntry(controlled, true)
            if entry ~= nil then
                data.vehicles[#data.vehicles + 1] = entry
                data.controlledId = entry.id
            end
        end
        table.sort(data.vehicles, idLess)
        return data
    end,
}
