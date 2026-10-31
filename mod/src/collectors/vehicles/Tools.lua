-- collectors/vehicles/Tools.lua
-- The controlled vehicle's implements for the `vehicles` topic: each one's
-- state, PTO, hitch and fills, and the Implement and Harvester screens'
-- speed limit, working width, crop, worked area and yield (guarded).

Companion = Companion or {}

local Api = Companion.Api
local Geo = Companion.Geo

-- the parts of the vehicles collector, shared between its files in
-- collectors/vehicles/ and Vehicles.lua (specs/0009); not a collector
local Parts = Companion.VehicleParts or {}
Companion.VehicleParts = Parts

local MAX_IMPLEMENT_DEPTH = 6

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
            local info = Parts.storeInfo(object)
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
                fills = Parts.fillLevels(object),
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

Parts.collectImplements = collectImplements
Parts.anyPto = anyPto
Parts.cropOf = cropOf
Parts.speedLimitOf = speedLimitOf
Parts.hectaresOf = hectaresOf
Parts.yieldOf = yieldOf
