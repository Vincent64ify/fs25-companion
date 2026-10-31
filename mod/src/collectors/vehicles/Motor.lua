-- collectors/vehicles/Motor.lua
-- The controlled vehicle's motor for the `vehicles` topic: speed, fuel and
-- its use, DEF, temperature, rpm and gear, wear, hours, and the AI
-- worker's job (guarded; see Vehicles.lua).

Companion = Companion or {}

local Api = Companion.Api
local Geo = Companion.Geo
local VehicleState = Companion.VehicleState

-- the parts of the vehicles collector, shared between its files in
-- collectors/vehicles/ and Vehicles.lua (specs/0009); not a collector
local Parts = Companion.VehicleParts or {}
Companion.VehicleParts = Parts

local function speedKmh(vehicle, motorized)
    local speed = Api.tryCall(vehicle, "getLastSpeed")
    if speed == nil then
        return nil
    end
    return Geo.round(math.max(0, speed * (motorized.speedDisplayScale or 3.6)), 1)
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

-- the gear as the game's speedometer shows it: the vehicle's
-- getGearInfoToDisplay() gives the gear's name ("2", "N", "-1" in reverse),
-- its group ("B") and whether it's automatic (verified live, Volvo L90H,
-- 2026-10-23; getGear() gave nothing). The motor's own and getGear() stay
-- as fallbacks.
local function gearDetail(vehicle, motor, entry)
    local name, group, _, automatic = Api.tryCallAll(vehicle, "getGearInfoToDisplay")
    if name == nil then
        name, group, _, automatic = Api.tryCallAll(motor, "getGearInfoToDisplay")
    end
    if name == nil then
        name = Api.tryCall(motor, "getGear")
    end
    if type(name) == "number" or (type(name) == "string" and name ~= "") then
        entry.gear = name
    end
    if type(group) == "string" and group ~= "" then
        entry.gearGroup = group
    end
    if type(automatic) == "boolean" then
        entry.gearAutomatic = automatic
    end
end

-- DEF (AdBlue) from its consumer fill unit, for engines that use it
local function defDetail(vehicle, entry)
    local fillType = type(FillType) == "table" and FillType.DEF or nil
    local unit = fillType ~= nil and Api.tryCall(vehicle, "getConsumerFillUnitIndex", fillType) or nil
    if unit == nil or unit == false then
        return
    end
    -- to 0.01 L: the Vehicle screen's DEF range comes from how fast it drops
    entry.def = Geo.round(Api.tryCall(vehicle, "getFillUnitFillLevel", unit), 2)
    entry.defCapacity = Geo.round(Api.tryCall(vehicle, "getFillUnitCapacity", unit), 1)
end

-- litres (or kWh) per hour, as the game's HUD shows it: the smoothed
-- display value, else the last frame's
local function fuelUsage(motorized)
    local usage = motorized.lastFuelUsageDisplay
    if type(usage) ~= "number" then
        usage = motorized.lastFuelUsage
    end
    if type(usage) ~= "number" then
        return nil
    end
    return Geo.round(math.max(0, usage), 1)
end

local function motorDetail(vehicle, entry)
    local motorized = vehicle.spec_motorized
    if motorized == nil then
        return
    end
    entry.engineOn = VehicleState.engineOn(vehicle)
    fuelDetail(vehicle, motorized, entry)
    entry.fuelUsage = fuelUsage(motorized)
    defDetail(vehicle, entry)
    if motorized.motorTemperature ~= nil then
        -- no warning level beside it in the game (spec 0002's spike): the
        -- dashboard's Engine hot goes by 100 °C
        entry.motorTemp = Geo.round(motorized.motorTemperature.value, 1)
    end
    local motor = Api.tryCall(vehicle, "getMotor")
    if motor ~= nil then
        entry.rpm = Geo.round(Api.tryCall(motor, "getLastRealMotorRpm"), 0)
        entry.rpmMin = Geo.round(Api.tryCall(motor, "getMinRpm"), 0)
        entry.rpmMax = Geo.round(Api.tryCall(motor, "getMaxRpm"), 0)
        gearDetail(vehicle, motor, entry)
    end
end

local function textOf(obj, ...)
    for _, name in ipairs({ ... }) do
        local value = Api.tryCall(obj, name)
        if type(value) == "string" and value ~= "" then
            return value
        end
    end
    return nil
end

-- the AI worker's job ("Field work") and helper name, for a vehicle a
-- worker drives
local function aiOf(vehicle)
    local out = {}
    local job = Api.tryCall(vehicle, "getJob")
    if type(job) ~= "table" then
        local spec = vehicle.spec_aiJobVehicle
        job = spec ~= nil and spec.job or nil
    end
    if type(job) == "table" then
        out.job = textOf(job, "getTitle")
        out.description = textOf(job, "getDescription")
    end
    local helper = Api.tryCall(vehicle, "getCurrentHelper")
    if type(helper) == "table" then
        out.helper = (type(helper.title) == "string" and helper.title)
            or (type(helper.name) == "string" and helper.name) or nil
    end
    return next(out) ~= nil and out or nil
end

Parts.speedKmh = speedKmh
Parts.motorDetail = motorDetail
Parts.wearOf = wearOf
Parts.operatingHours = operatingHours
Parts.aiOf = aiOf
