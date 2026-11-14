-- Contracts.lua
-- The game's contracts (missions), every 2 s (specs/0018-contracts.md):
-- the ones on offer and your farm's own, with what the dashboard needs to
-- work out net, time and money per hour. Other farms' and dismissed ones
-- are left out.
--
-- Read-only. Nothing is written into a mission and no call that changes
-- the game's state is made: never getCompletion() (it drives the field's
-- completion modifier; mission.completion is the value the game keeps) and
-- never tryToResolveSellingStation(). The one thing loaded is a shop
-- item's specs (its working width and speed), as the shop does when it
-- lists the item: once per item, two items a tick at most.
--
-- The names are from the game's own scripts (gameSource.zip:
-- dataS/scripts/missions/*.lua) and, for harvest and baling contracts,
-- from FS25_BetterContracts; none is verified in game yet, so each read is
-- guarded and a mission whose reads throw is skipped.
--
-- data: {limit, factors = {field, harvest, bale}, items = [{id, type,
--   title, npc, location, status, mine, leased, finishState, x, z, fieldId,
--   areaHa, fruitTypeIndex, fillType, fillTitle, reward, vehicleCosts,
--   reimbursement, stealingCost, minutesLeft, completion, expectedLiters,
--   depositedLiters, sellPoint = {name, x, z, price}, vehicles = [{name,
--   brand, category, categoryTitle, workingWidth, speedLimit}]}],
--   tools = [{id, name, brand, category, categoryTitle, workingWidth,
--   speedLimit}]}

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

-- shop files whose specs may be loaded in one tick
local SPEC_LOADS_PER_TICK = 2

-- shop xml filename -> {name, brand, category, categoryTitle, workingWidth,
-- speedLimit, done}; done once its specs were read. Cleared per map.
local shop = {}
local specBudget = 0

-- the widest width a shop item lists: its own, else its configurations'
local function shopWidth(specs)
    local own = specs.workingWidth
    if type(own) == "table" and type(own.width) == "number" then
        return own.width
    end
    local widest = nil
    if type(specs.workingWidthConfig) == "table" then
        for _, configs in pairs(specs.workingWidthConfig) do
            if type(configs) == "table" then
                for _, config in pairs(configs) do
                    if type(config) == "table" and type(config.width) == "number"
                        and (widest == nil or config.width > widest) then
                        widest = config.width
                    end
                end
            end
        end
    end
    return widest
end

-- a shop item by its xml file: brand and category as Vehicles.lua reads
-- them (verified there for a vehicle's configFileName), the working width
-- (m) and working speed limit (km/h) from its specs
local function shopInfo(filename)
    if type(filename) ~= "string" then
        return nil
    end
    local info = shop[filename]
    if info ~= nil and info.done then
        return info
    end
    local item = Api.tryCall(g_storeManager, "getItemByXMLFilename", filename)
    if type(item) ~= "table" then
        return nil
    end
    if info == nil then
        info = {}
        if type(item.name) == "string" then
            info.name = item.name
        end
        local brand = item.brandIndex ~= nil and Api.tryCall(g_brandManager, "getBrandByIndex", item.brandIndex) or nil
        if type(brand) == "table" and type(brand.title) == "string" and brand.name ~= "NONE" then
            info.brand = brand.title
        end
        if type(item.categoryName) == "string" then
            info.category = item.categoryName
            local category = Api.tryCall(g_storeManager, "getCategoryByName", item.categoryName)
            if type(category) == "table" and type(category.title) == "string" then
                info.categoryTitle = category.title
            end
        end
        shop[filename] = info
    end
    if item.specs == nil and specBudget > 0 then
        specBudget = specBudget - 1
        Api.loadShopSpecs(item)
        -- read or not, this file isn't tried again
        info.done = true
    end
    if type(item.specs) == "table" then
        info.workingWidth = Geo.round(shopWidth(item.specs), 2)
        if type(item.specs.speedLimit) == "number" then
            info.speedLimit = Geo.round(item.specs.speedLimit, 1)
        end
        info.done = true
    end
    return info
end

local function leaseVehicles(mission)
    local list = mission.vehiclesToLoad
    if type(list) ~= "table" or #list == 0 then
        return nil
    end
    local out = {}
    for _, vehicle in ipairs(list) do
        local info = type(vehicle) == "table" and shopInfo(vehicle.filename) or nil
        if info ~= nil then
            out[#out + 1] = {
                name = info.name, brand = info.brand, category = info.category,
                categoryTitle = info.categoryTitle, workingWidth = info.workingWidth, speedLimit = info.speedLimit,
            }
        end
    end
    return out
end

-- where a harvest or baling contract is delivered, and what it pays there
local function sellPoint(mission, fillTypeIndex)
    local station = mission.sellingStation
    if type(station) ~= "table" then
        return nil
    end
    local out = { name = Api.tryCall(station, "getName") }
    if type(out.name) ~= "string" then
        out.name = nil
    end
    if type(station.rootNode) == "number" and station.rootNode ~= 0 and getWorldTranslation ~= nil then
        local ok, x, _, z = pcall(getWorldTranslation, station.rootNode)
        if ok and type(x) == "number" and type(z) == "number" then
            out.x = Geo.round(x, 1)
            out.z = Geo.round(z, 1)
        end
    end
    if fillTypeIndex ~= nil then
        local price = Api.tryCall(station, "getEffectiveFillTypePrice", fillTypeIndex)
        if type(price) == "number" and price > 0 then
            out.price = Geo.round(price, 4)
        end
    end
    return next(out) ~= nil and out or nil
end

-- a number rounded, or nil; 0 is a value here (nothing delivered yet)
local function rounded(value, decimals)
    if type(value) ~= "number" or value ~= value then
        return nil
    end
    return Geo.round(value, decimals or 0)
end

-- One mission as the dashboard's entry, or nil for one that isn't shown.
-- Runs under pcall: a mission of a kind we don't know may throw.
local function missionEntry(mission, farmId)
    local status = Api.missionStatus(mission)
    if status == nil then
        return nil
    end
    local mine = status ~= "offer"
    if mine and mission.farmId ~= farmId then
        return nil
    end
    local field = type(mission.field) == "table" and mission.field or nil
    local id = mission:getUniqueId()
    if type(id) ~= "string" or id == "" then
        return nil
    end
    local missionType = mission.type
    local entry = {
        id = id,
        type = type(missionType) == "table" and type(missionType.name) == "string" and missionType.name or nil,
        status = status,
    }
    local title = Api.tryCall(mission, "getTitle")
    entry.title = type(title) == "string" and title or nil
    local npc = Api.tryCall(mission, "getNPC")
    if type(npc) == "table" and type(npc.title) == "string" then
        entry.npc = npc.title
    end
    local location = Api.tryCall(mission, "getLocation")
    if type(location) == "string" and location ~= "" then
        entry.location = location
    end
    if mine then
        entry.mine = true
        -- the lease price is the same either way: only this says you took it
        entry.leased = mission.spawnedVehicles == true
    end
    if status == "finished" then
        entry.finishState = Api.missionFinishState(mission)
    end

    -- where the game puts its marker; the base class answers 0, 0
    local x, z = Api.tryCallAll(mission, "getWorldPosition")
    if type(x) == "number" and type(z) == "number" and not (x == 0 and z == 0) then
        entry.x = Geo.round(x, 1)
        entry.z = Geo.round(z, 1)
    end
    if field ~= nil then
        entry.fieldId = Api.fieldId(field)
        local area = Api.tryCall(field, "getAreaHa")
        entry.areaHa = Geo.round(type(area) == "number" and area or field.areaHa, 2)
        local state = field.fieldState
        local fruit = mission.fruitTypeIndex
        if type(fruit) ~= "number" and type(state) == "table" then
            fruit = state.fruitTypeIndex
        end
        if type(fruit) == "number" and fruit > 0 then
            entry.fruitTypeIndex = fruit
        end
    end

    local fillTypeIndex = type(mission.fillTypeIndex) == "number" and mission.fillTypeIndex or nil
    if fillTypeIndex ~= nil then
        local fillType = Api.tryCall(g_fillTypeManager, "getFillTypeByIndex", fillTypeIndex)
        if type(fillType) == "table" then
            entry.fillType = type(fillType.name) == "string" and fillType.name or nil
            entry.fillTitle = type(fillType.title) == "string" and fillType.title or nil
        end
    end

    -- the base class answers 0: no reward known, not a contract for nothing
    local reward = rounded(Api.tryCall(mission, "getReward"))
    if reward ~= nil and reward > 0 then
        entry.reward = reward
    end
    entry.vehicles = leaseVehicles(mission)
    if entry.vehicles ~= nil then
        entry.vehicleCosts = rounded(Api.tryCall(mission, "getVehicleCosts"))
    end
    if status == "finished" then
        entry.reimbursement = rounded(Api.tryCall(mission, "getReimbursement"))
        entry.stealingCost = rounded(mission.stealingCost)
    end
    entry.minutesLeft = rounded(Api.tryCall(mission, "getMinutesLeft"))
    if status == "running" or status == "finished" then
        entry.completion = rounded(mission.completion, 4)
    end
    entry.expectedLiters = rounded(mission.expectedLiters)
    if mine then
        entry.depositedLiters = rounded(mission.depositedLiters)
    end
    entry.sellPoint = sellPoint(mission, fillTypeIndex)
    return entry
end

-- your farm's own tools with a working width, for the work time with your
-- own machines; a contract's leased ones carry your farm id too
local function ownTools(farmId)
    local out = {}
    local system = g_currentMission ~= nil and g_currentMission.vehicleSystem or nil
    local leased = type(VehiclePropertyState) == "table" and VehiclePropertyState.MISSION or nil
    for _, vehicle in ipairs(Api.listOf(system ~= nil and system.vehicles or nil)) do
        if vehicle.isDeleted ~= true and vehicle.id ~= nil
            and (leased == nil or vehicle.propertyState ~= leased)
            and Api.tryCall(vehicle, "getOwnerFarmId") == farmId then
            local info = shopInfo(vehicle.configFileName)
            if info ~= nil and info.workingWidth ~= nil then
                out[#out + 1] = {
                    id = vehicle.id, name = info.name, brand = info.brand, category = info.category,
                    categoryTitle = info.categoryTitle, workingWidth = info.workingWidth, speedLimit = info.speedLimit,
                }
            end
        end
    end
    table.sort(out, function(a, b)
        local ta, tb = type(a.id), type(b.id)
        if ta ~= tb then
            return ta < tb
        end
        return a.id < b.id
    end)
    return out
end

local function idLess(a, b)
    return a.id < b.id
end

Companion.Collectors.Contracts = {
    topic = "contracts",
    interval = 2000,
    reset = function()
        shop = {}
    end,
    collect = function(ctx)
        local missions = Api.missions()
        if missions == nil then
            return nil
        end
        specBudget = SPEC_LOADS_PER_TICK
        local farmId = g_localPlayer ~= nil and g_localPlayer.farmId or nil
        local items = {}
        for _, mission in ipairs(missions) do
            local ok, entry = pcall(missionEntry, mission, farmId)
            if ok and entry ~= nil then
                items[#items + 1] = entry
            end
        end
        table.sort(items, idLess)
        return {
            limit = Api.missionLimit(),
            factors = Api.missionFactors(),
            items = items,
            tools = ownTools(farmId),
        }
    end,
}
