-- collectors/vehicles/Loader.lua
-- The Vehicle screen's loader for the `vehicles` topic: what's on its forks
-- and hooks, and the vehicle nearby that takes the load (specs/0002).

Companion = Companion or {}

local Api = Companion.Api
local Geo = Companion.Geo
local VehicleState = Companion.VehicleState

-- the parts of the vehicles collector, shared between its files in
-- collectors/vehicles/ and Vehicles.lua (specs/0009); not a collector
local Parts = Companion.VehicleParts or {}
Companion.VehicleParts = Parts

-- Vehicle screen (specs/0002) ----------------------------------------------
-- What's on the loader and the vehicle it goes into. Unverified names (the
-- spec's spike): spec_dynamicMountAttacher.dynamicMountedObjects (keyed by
-- the mounted objects), isPallet, spec_bigBag, spec_shovel,
-- getFillUnitAllowsFillType and getFillUnitFreeCapacity; all guarded.

-- a target is this close to the loader's tool, metres
local TARGET_RANGE = 15

-- the last fill type carried (kept while the loader is empty) and the last
-- target picked (kept, stale, out of range). Cleared per map by reset().
local lastFillType = nil
local lastTarget = nil

local function isPalletOrBag(object)
    return object.isPallet == true or object.spec_bigBag ~= nil
end

local function byId(a, b)
    return (tonumber(a.id) or 0) < (tonumber(b.id) or 0)
end

-- the vehicle and everything attached to it
local function rigMembers(vehicle)
    local list = { vehicle }
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        list[#list + 1] = node.object
    end
    return list
end

-- the objects on a member's forks or hook
local function mountedOn(member)
    local spec = member.spec_dynamicMountAttacher
    local list = {}
    if type(spec) == "table" and type(spec.dynamicMountedObjects) == "table" then
        for k, v in pairs(spec.dynamicMountedObjects) do
            local object = type(k) == "table" and k or (type(v) == "table" and v or nil)
            if object ~= nil and object.isDeleted ~= true then
                list[#list + 1] = object
            end
        end
    end
    return list
end

-- pallets and bigbags on the rig's forks and hooks, and any hanging in the
-- rig itself (a lifter's hook), by id
local function carriedObjects(members)
    local list, seen = {}, {}
    local function add(object)
        if not seen[object] then
            seen[object] = true
            list[#list + 1] = object
        end
    end
    for i, member in ipairs(members) do
        if i > 1 and isPalletOrBag(member) then
            add(member)
        end
        for _, object in ipairs(mountedOn(member)) do
            add(object)
        end
    end
    table.sort(list, byId)
    return list
end

local function carriedEntry(object)
    return {
        id = object.id,
        name = Parts.vehicleName(object) or object.typeName,
        pallet = object.isPallet == true,
        bigBag = object.spec_bigBag ~= nil,
        fills = Parts.fillLevels(object),
    }
end

-- the loader's tool, the deepest first: a bucket (Shovel) or forks and
-- hooks (DynamicMountAttacher); nil without one
local function loaderTool(members)
    for i = #members, 1, -1 do
        local m = members[i]
        if (m.spec_shovel ~= nil or m.spec_dynamicMountAttacher ~= nil) and not isPalletOrBag(m) then
            return m
        end
    end
    return nil
end

local function fillUnitsOf(object)
    local units = Api.tryCall(object, "getFillUnits")
    if type(units) ~= "table" and type(object.spec_fillUnit) == "table" then
        units = object.spec_fillUnit.fillUnits
    end
    return type(units) == "table" and units or {}
end

-- the fill type index of the first unit with something in it, or nil
local function loadedFillType(object)
    local unknown = type(FillType) == "table" and FillType.UNKNOWN or nil
    for index, unit in ipairs(fillUnitsOf(object)) do
        local level = Api.tryCall(object, "getFillUnitFillLevel", index)
        if type(level) ~= "number" then
            level = type(unit) == "table" and unit.fillLevel or 0
        end
        local fillType = Api.tryCall(object, "getFillUnitFillType", index)
        if type(fillType) ~= "number" and type(unit) == "table" then
            fillType = unit.fillType
        end
        if (level or 0) > 0 and type(fillType) == "number" and fillType ~= unknown then
            return fillType
        end
    end
    return nil
end

-- the first fill unit that takes the fill type, or nil
local function acceptingUnit(object, fillType)
    for index in ipairs(fillUnitsOf(object)) do
        if Api.tryCall(object, "getFillUnitAllowsFillType", index, fillType) == true then
            return index
        end
    end
    return nil
end

-- metres between two vehicles on the ground, nil when one has no position
local function distanceBetween(a, b)
    if getWorldTranslation == nil or a.rootNode == nil or b.rootNode == nil then
        return nil
    end
    local okA, ax, _, az = pcall(getWorldTranslation, a.rootNode)
    local okB, bx, _, bz = pcall(getWorldTranslation, b.rootNode)
    if not okA or not okB or type(ax) ~= "number" or type(bx) ~= "number" then
        return nil
    end
    return math.sqrt((ax - bx) ^ 2 + (az - bz) ^ 2)
end

-- a target's weight under the Trailer Fill Limit: {max, mass, reached} in t
local function targetMass(object)
    local mass = Parts.massLimit(object)
    if mass == nil then
        return nil
    end
    return {
        max = Geo.round(object.maxComponentMass, 2),
        mass = Geo.round(object.maxComponentMass - mass.available, 2),
        reached = mass.reached,
    }
end

local function targetEntry(object, distance, unit, fillType, farmId, stale)
    local info = Parts.storeInfo(object)
    local fill = nil
    for _, f in ipairs(Parts.fillLevels(object) or {}) do
        if f.unit == unit then
            fill = f
        end
    end
    if fill ~= nil then
        local free = Api.tryCall(object, "getFillUnitFreeCapacity", unit, fillType, farmId)
        if type(free) == "number" then
            fill.free = Geo.round(math.max(0, free), 1)
        end
    end
    local name = Parts.fillTypeInfo(fillType).name
    return {
        id = object.id,
        name = Parts.vehicleName(object) or object.typeName,
        brand = info.brand,
        category = info.category,
        categoryTitle = info.categoryTitle,
        distance = Geo.round(distance, 1),
        fillType = name and name:lower() or nil,
        fills = fill ~= nil and { fill } or nil,
        massLimit = targetMass(object),
        stale = stale or nil,
    }
end

-- the nearest of the farm's vehicles within range of the vehicle you
-- drive (its own position: simple, spec 0002) that takes the fill type,
-- not in the rig, not a pallet or bigbag; else the last one picked,
-- stale, wherever it is now
local function targetOf(vehicle, members, carried, fillType, all)
    local own = {}
    for _, m in ipairs(members) do
        own[m] = true
    end
    for _, c in ipairs(carried) do
        own[c] = true
    end
    local root = VehicleState.rootOf(vehicle)
    local farmId = Api.tryCall(vehicle, "getOwnerFarmId")
    local function eligible(object)
        return object.isDeleted ~= true and not own[object] and not isPalletOrBag(object)
            and VehicleState.rootOf(object) ~= root
    end
    local best, bestDistance, bestUnit = nil, nil, nil
    for _, object in ipairs(all) do
        if eligible(object) and Api.tryCall(object, "getOwnerFarmId") == farmId then
            local d = distanceBetween(vehicle, object)
            if d ~= nil and d <= TARGET_RANGE and (bestDistance == nil or d < bestDistance) then
                local unit = acceptingUnit(object, fillType)
                if unit ~= nil then
                    best, bestDistance, bestUnit = object, d, unit
                end
            end
        end
    end
    if best ~= nil then
        lastTarget = best
        return targetEntry(best, bestDistance, bestUnit, fillType, farmId, false)
    end
    if lastTarget ~= nil and eligible(lastTarget) then
        local unit = acceptingUnit(lastTarget, fillType)
        local d = distanceBetween(vehicle, lastTarget)
        if unit ~= nil and d ~= nil then
            return targetEntry(lastTarget, d, unit, fillType, farmId, true)
        end
    end
    return nil
end

-- carried and target on the controlled vehicle's entry; the target only
-- with a loader's tool in the rig
local function loaderDetail(vehicle, entry, all)
    local members = rigMembers(vehicle)
    local carried = carriedObjects(members)
    if #carried > 0 then
        entry.carried = {}
        for _, object in ipairs(carried) do
            entry.carried[#entry.carried + 1] = carriedEntry(object)
        end
    end
    -- a target with a bucket or forks, or with something carried (a bag on
    -- a bigbag lifter, which has neither)
    local tool = loaderTool(members)
    if tool == nil and #carried == 0 then
        return
    end
    local fillType = nil
    for _, object in ipairs(carried) do
        fillType = fillType or loadedFillType(object)
    end
    if tool ~= nil then
        fillType = fillType or loadedFillType(tool)
    end
    if fillType ~= nil then
        lastFillType = fillType
    end
    fillType = fillType or lastFillType
    if fillType ~= nil then
        entry.target = targetOf(vehicle, members, carried, fillType, all)
    end
end

-- what reset() clears per map
function Parts.resetLoader()
    lastFillType = nil
    lastTarget = nil
end

Parts.loaderDetail = loaderDetail
