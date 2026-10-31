-- Vehicles.lua
-- Every vehicle on the map, twice per second (vehicleSystem.vehicles,
-- Phase 0): pose, name, owner, AI state (and the worker's job), whether it
-- has an engine and whether it hangs on another vehicle. The vehicle the
-- player controls also gets the dashboard detail (motor, fuel and its use,
-- DEF, cruise control, lights, fill levels, PTO, implements with their
-- hitch position, and its brand and shop category for the Vehicle screen's
-- card; for the Implement screen each implement's working speed limit,
-- working width and a combine's crop; for the Vehicle screen the pallets
-- and bigbags on its forks and hooks, the vehicle nearby that takes the
-- load).
--
-- The spec field names come from the old telemetry mod (which read them
-- through the pipe) and from the FS22 script docs (T6: fuel use, DEF,
-- cruise, fill units, PTO, hitch, AI job); all are guarded, and the T6
-- ones are not verified in FS25 yet.
--
-- Split by part (specs/0009): collectors/vehicles/ Fill, Motor, Tools and
-- Loader, loaded before this file, share their pieces through
-- Companion.VehicleParts.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo
local VehicleState = Companion.VehicleState
local Parts = Companion.VehicleParts or {}
Companion.VehicleParts = Parts

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

Parts.vehicleName = vehicleName
Parts.storeInfo = storeInfo

local function vehicleEntry(vehicle, detailed, all)
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
        entry.ai = Parts.aiOf(vehicle)
    end
    entry.propertyState = vehicle.propertyState
    local motorized = vehicle.spec_motorized
    entry.motorized = motorized ~= nil
    if motorized ~= nil then
        entry.speed = Parts.speedKmh(vehicle, motorized)
    end
    -- an implement or trailer hitched to something: the PDA draws only
    -- the vehicle pulling it
    entry.attached = Api.tryCall(vehicle, "getAttacherVehicle") ~= nil
    if detailed then
        Parts.motorDetail(vehicle, entry)
        entry.cruise = VehicleState.cruise(vehicle)
        entry.lights = VehicleState.lights(vehicle)
        entry.wear = Parts.wearOf(vehicle)
        entry.operatingHours = Parts.operatingHours(vehicle)
        entry.mass = Geo.round(Api.tryCall(vehicle, "getTotalMass", false), 2)
        local info = storeInfo(vehicle)
        entry.brand = info.brand
        entry.category = info.category
        entry.categoryTitle = info.categoryTitle
        local implements = {}
        Parts.collectImplements(vehicle, 1, implements)
        entry.implements = implements
        entry.pto = Parts.anyPto(implements)
        entry.fills = Parts.fillLevels(vehicle)
        -- the Implement screen: a combine's crop, and the rig's speed
        -- limit while something works
        entry.crop = Parts.cropOf(vehicle)
        entry.speedLimit = Parts.speedLimitOf(vehicle, true)
        -- the Harvester screen: worked area and Precision Farming's yield
        entry.hectares = Parts.hectaresOf(vehicle)
        entry.yield = Parts.yieldOf(vehicle)
        -- the Vehicle screen: what's on the loader, where it goes
        Parts.loaderDetail(vehicle, entry, all or {})
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
        Parts.resetFill()
        Parts.resetLoader()
    end,
    collect = function(ctx)
        local data = { vehicles = {} }
        local controlled = Api.controlledVehicle()
        local system = g_currentMission.vehicleSystem
        local all = Api.listOf(system ~= nil and system.vehicles or nil)
        local listed = false
        for _, vehicle in ipairs(all) do
            if vehicle.isDeleted ~= true and vehicle.id ~= nil then
                local entry = vehicleEntry(vehicle, vehicle == controlled, all)
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
            local entry = vehicleEntry(controlled, true, all)
            if entry ~= nil then
                data.vehicles[#data.vehicles + 1] = entry
                data.controlledId = entry.id
            end
        end
        table.sort(data.vehicles, idLess)
        return data
    end,
}
