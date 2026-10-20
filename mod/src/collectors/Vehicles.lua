-- Vehicles.lua
-- Vehicles, twice per second. Phase 1 sends only the vehicle the player
-- controls, with the dashboard detail (motor, fuel, lights, implements);
-- Phase 3 adds every vehicle on the map to the same list.
--
-- The spec field names come from the old telemetry mod (which read them
-- through the pipe) and are guarded.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

local MAX_IMPLEMENT_DEPTH = 6

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

local function motorDetail(vehicle, entry)
    local motorized = vehicle.spec_motorized
    if motorized == nil then
        return
    end
    entry.engineOn = motorized.engineStarted == true
    if motorized.fuelLevel ~= nil then
        entry.fuel = Geo.round(motorized.fuelLevel.value, 1)
    end
    entry.fuelCapacity = Geo.round(motorized.maxFuelLevel, 1)
    if motorized.motorTemperature ~= nil then
        entry.motorTemp = Geo.round(motorized.motorTemperature.value, 1)
    end
    local speed = Api.tryCall(vehicle, "getLastSpeed")
    if speed ~= nil then
        entry.speed = Geo.round(math.max(0, speed * (motorized.speedDisplayScale or 3.6)), 1)
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
    entry.name = Api.tryCall(vehicle, "getFullName")
    entry.farmId = Api.tryCall(vehicle, "getOwnerFarmId")
    entry.isAI = Api.tryCall(vehicle, "getIsAIActive") == true
    if detailed then
        motorDetail(vehicle, entry)
        entry.lights = lights(vehicle)
        if vehicle.spec_wearable ~= nil then
            entry.wear = Geo.round(vehicle.spec_wearable.wear, 3)
        end
        local operatingSeconds = Api.tryCall(vehicle, "getOperationTime")
        if operatingSeconds ~= nil then
            -- seconds, as the old mod's maths assumed
            entry.operatingHours = Geo.round(operatingSeconds / 3600, 1)
        end
        entry.mass = Geo.round(Api.tryCall(vehicle, "getTotalMass", false), 2)
        local implements = {}
        collectImplements(vehicle, 1, implements)
        entry.implements = implements
    end
    return entry
end

Companion.Collectors.Vehicles = {
    topic = "vehicles",
    interval = 500,
    collect = function(ctx)
        local data = { vehicles = {} }
        local vehicle = Api.controlledVehicle()
        if vehicle ~= nil then
            local entry = vehicleEntry(vehicle, true)
            if entry ~= nil then
                data.vehicles[1] = entry
                data.controlledId = entry.id
            end
        end
        return data
    end,
}
