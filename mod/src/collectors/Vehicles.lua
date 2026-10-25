-- Vehicles.lua
-- Every vehicle on the map, twice per second (vehicleSystem.vehicles,
-- Phase 0): pose, name, owner, AI state (and the worker's job), whether it
-- has an engine and whether it hangs on another vehicle. The vehicle the
-- player controls also gets the dashboard detail (motor, fuel and its use,
-- DEF, cruise control, lights, fill levels, PTO, implements with their
-- hitch position, and its brand and shop category for the Vehicle screen's
-- card; for the Implement screen each implement's working speed limit,
-- working width and a combine's crop).
--
-- The spec field names come from the old telemetry mod (which read them
-- through the pipe) and from the FS22 script docs (T6: fuel use, DEF,
-- cruise, fill units, PTO, hitch, AI job); all are guarded, and the T6
-- ones are not verified in FS25 yet.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo
local VehicleState = Companion.VehicleState

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

-- vehicle id -> brand and shop category, from the store item its config
-- file belongs to (unverified, guarded). Cleared per map by reset().
local storeInfos = {}

local function storeInfo(vehicle)
    local key = vehicle.id or vehicle
    local info = storeInfos[key]
    if info ~= nil then
        return info
    end
    info = {}
    local store = g_storeManager
    local item = type(vehicle.configFileName) == "string"
        and Api.tryCall(store, "getItemByXMLFilename", vehicle.configFileName) or nil
    if type(item) == "table" then
        local brand = item.brandIndex ~= nil and Api.tryCall(g_brandManager, "getBrandByIndex", item.brandIndex) or nil
        if type(brand) == "table" and type(brand.title) == "string" and brand.name ~= "NONE" then
            info.brand = brand.title
        end
        if type(item.categoryName) == "string" then
            info.category = item.categoryName
            local category = Api.tryCall(store, "getCategoryByName", item.categoryName)
            if type(category) == "table" and type(category.title) == "string" then
                info.categoryTitle = category.title
            end
        end
    end
    storeInfos[key] = info
    return info
end

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
-- capacity. Nil when there is none.
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

-- whether the implement's PTO turns: true or false for one with a PTO
-- (PowerConsumer with a PTO rpm), nil for one without
local function ptoOf(object)
    local consumer = object.spec_powerConsumer
    if consumer == nil or type(consumer.ptoRpm) ~= "number" or consumer.ptoRpm <= 0 then
        return nil
    end
    local on = Api.tryCall(object, "getDoConsumePtoPower")
    if type(on) ~= "boolean" then
        on = Api.tryCall(object, "getIsTurnedOn") == true
    end
    return on
end

-- where the hitch holding the implement is, 0 (raised) to 1 (lowered): the
-- attacher joint's moveAlpha between its upper and lower alpha. Nil for a
-- joint that doesn't move (a trailer's drawbar).
local function hitchOf(vehicle, implement)
    local index = implement.jointDescIndex
    if index == nil then
        index = Api.tryCall(vehicle, "getAttacherJointIndexFromObject", implement.object)
    end
    local joint = index ~= nil and Api.tryCall(vehicle, "getAttacherJointByJointDescIndex", index) or nil
    if type(joint) ~= "table" then
        local spec = vehicle.spec_attacherJoints
        joint = index ~= nil and spec ~= nil and type(spec.attacherJoints) == "table" and spec.attacherJoints[index] or nil
    end
    if type(joint) ~= "table" then
        return nil
    end
    local alpha, upper, lower = joint.moveAlpha, joint.upperAlpha, joint.lowerAlpha
    if type(alpha) ~= "number" or type(upper) ~= "number" or type(lower) ~= "number"
        or math.abs(lower - upper) < 1e-6 then
        return nil
    end
    return Geo.round(math.max(0, math.min(1, (alpha - upper) / (lower - upper))), 2)
end

-- Implement screen: the working speed limit, the working width and a
-- combine's crop. Names from the game's own scripts (the SDK's
-- gameSource.zip: Vehicle, WorkArea, Combine); guarded.

-- the speed limit, km/h, of the object and what hangs on it (the game's
-- getSpeedLimit, with wear's reduction); onlyIfWorking: only while one of
-- them works. Nil without one.
local function speedLimitOf(object, onlyIfWorking)
    local limit = Api.tryCall(object, "getSpeedLimit", onlyIfWorking)
    if type(limit) ~= "number" or limit ~= limit or limit <= 0 or limit >= 1000 then
        return nil
    end
    return Geo.round(limit, 1)
end

-- the working width, metres: the AI's work area width, else the widest
-- work area. Nil for a tool without work areas (a trailer).
local function workWidthOf(object)
    local width = Api.tryCall(object, "getAIWorkAreaWidth")
    if type(width) ~= "number" or width <= 0 then
        width = nil
        local spec = object.spec_workArea
        if type(spec) == "table" and type(spec.workAreas) == "table" then
            for _, area in pairs(spec.workAreas) do
                if type(area) == "table" and type(area.workWidth) == "number" and area.workWidth > (width or 0) then
                    width = area.workWidth
                end
            end
        end
    end
    return width ~= nil and Geo.round(width, 1) or nil
end

-- a combine's crop: the last fruit it took in, as its fill type
-- ({name = "wheat", title = "Wheat"}); nil before it has harvested
local function cropOf(object)
    local spec = object.spec_combine
    local fruit = type(spec) == "table" and spec.lastValidInputFruitType or nil
    local unknown = type(FruitType) == "table" and FruitType.UNKNOWN or 0
    if type(fruit) ~= "number" or fruit == unknown then
        return nil
    end
    local fillType = Api.tryCall(g_fruitTypeManager, "getFillTypeByFruitTypeIndex", fruit)
    if type(fillType) ~= "table" or type(fillType.name) ~= "string" then
        return nil
    end
    return { name = fillType.name:lower(), title = fillType.title }
end

-- a combine's worked area (Combine.lua): this run (since it was entered or
-- loaded) and in total, ha; nil without a combine
local function hectaresOf(object)
    local spec = object.spec_combine
    if type(spec) ~= "table" or type(spec.workedHectars) ~= "number" then
        return nil
    end
    local initial = type(spec.workedHectarsInitial) == "number" and spec.workedHectarsInitial or 0
    return { run = Geo.round(math.max(0, spec.workedHectars - initial), 2), total = Geo.round(spec.workedHectars, 2) }
end

-- Precision Farming's yield, as its combine HUD shows it (ExtendedCombine:
-- lastYieldWeight t/ha, lastYieldPercentage and lastYieldPotential %). Its
-- spec table is named after the mod ("spec_<mod>.extendedCombine"), so the
-- key is found once and kept. Nil without Precision Farming.
local yieldKey
local function yieldOf(object)
    if object.spec_combine == nil then
        return nil
    end
    if yieldKey == nil then
        for key, value in pairs(object) do
            if type(key) == "string" and key:find("^spec_") and key:lower():find("extendedcombine$")
                and type(value) == "table" then
                yieldKey = key
                break
            end
        end
    end
    local spec = yieldKey ~= nil and object[yieldKey] or nil
    if type(spec) ~= "table" or type(spec.lastYieldWeight) ~= "number" then
        return nil
    end
    return {
        tPerHa = Geo.round(spec.lastYieldWeight, 1),
        pct = type(spec.lastYieldPercentage) == "number" and spec.lastYieldPercentage or nil,
        potential = type(spec.lastYieldPotential) == "number" and spec.lastYieldPotential or nil,
    }
end

local function collectImplements(vehicle, depth, out)
    local attached = Api.tryCall(vehicle, "getAttachedImplements")
    if type(attached) ~= "table" then
        return
    end
    for _, implement in pairs(attached) do
        local object = type(implement) == "table" and implement.object or nil
        if object ~= nil then
            local info = storeInfo(object)
            out[#out + 1] = {
                -- the cab's rig and the select / detach commands use it (C3)
                id = object.id,
                name = Api.tryCall(object, "getFullName") or object.typeName,
                typeName = object.typeName,
                brand = info.brand,
                category = info.category,
                categoryTitle = info.categoryTitle,
                depth = depth,
                lowered = Api.tryCall(object, "getIsLowered", true) == true,
                turnedOn = Api.tryCall(object, "getIsTurnedOn") == true,
                wear = Geo.round(Api.tryCall(object, "getDamageAmount"), 3),
                pto = ptoOf(object),
                hitch = hitchOf(vehicle, implement),
                fills = fillLevels(object),
                -- the Implement screen
                speedLimit = speedLimitOf(object),
                workWidth = workWidthOf(object),
                crop = cropOf(object),
            }
            if depth < MAX_IMPLEMENT_DEPTH then
                collectImplements(object, depth + 1, out)
            end
        end
    end
end

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
    entry.def = Geo.round(Api.tryCall(vehicle, "getFillUnitFillLevel", unit), 1)
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

-- whether a PTO turns: nil when no implement has one
local function anyPto(implements)
    local pto = nil
    for _, implement in ipairs(implements) do
        if implement.pto ~= nil then
            pto = pto == true or implement.pto
        end
    end
    return pto
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
    if entry.isAI then
        entry.ai = aiOf(vehicle)
    end
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
        entry.cruise = VehicleState.cruise(vehicle)
        entry.lights = VehicleState.lights(vehicle)
        entry.wear = wearOf(vehicle)
        entry.operatingHours = operatingHours(vehicle)
        entry.mass = Geo.round(Api.tryCall(vehicle, "getTotalMass", false), 2)
        local info = storeInfo(vehicle)
        entry.brand = info.brand
        entry.category = info.category
        entry.categoryTitle = info.categoryTitle
        local implements = {}
        collectImplements(vehicle, 1, implements)
        entry.implements = implements
        entry.pto = anyPto(implements)
        entry.fills = fillLevels(vehicle)
        -- the Implement screen: a combine's crop, and the rig's speed
        -- limit while something works
        entry.crop = cropOf(vehicle)
        entry.speedLimit = speedLimitOf(vehicle, true)
        -- the Harvester screen: worked area and Precision Farming's yield
        entry.hectares = hectaresOf(vehicle)
        entry.yield = yieldOf(vehicle)
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
        storeInfos = {}
        fillTypeInfos = {}
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
