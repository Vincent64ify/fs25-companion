-- CropTypes.lua
-- What the dashboard needs to colour fields like the PDA, once per map:
-- every crop with its own PDA map colours and growth stages, the ground
-- type names and the soil levels' maximum values.
--
-- Fruit type fields verified in Phase 0 (g_fruitTypeManager.fruitTypes[i]):
-- index, name, defaultMapColor, colorBlindMapColor, numGrowthStates,
-- min/maxHarvestingGrowthState, witheredState, cutState, growthStateToName.
-- The field manager's limeLevelMaxValue, plowLevelMaxValue and
-- sprayLevelMaxValue too. FieldGroundType and fillType.title are guarded.
--
-- data: {fruits = [{index, name, title, color, colorBlindColor,
--   numGrowthStates, minHarvest, maxHarvest, withered, cut, minPrepare,
--   maxPrepare, regrows, shownOnMap, stateNames}],
--   groundTypes = {NAME = value}, levels = {lime, plow, spray}}
--   colours are [r, g, b] as the game stores them (0..1)

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

local sent = false

local function rgb(c)
    if type(c) ~= "table" then
        return nil
    end
    local r, g, b = c[1], c[2], c[3]
    if r == nil then
        r, g, b = c.r, c.g, c.b
    end
    if type(r) ~= "number" or type(g) ~= "number" or type(b) ~= "number" then
        return nil
    end
    return { Geo.round(r, 4), Geo.round(g, 4), Geo.round(b, 4) }
end

local function num(v)
    return type(v) == "number" and v or nil
end

-- growthStateToName as {"1" = "green small", ...}; nil when empty
local function stateNames(t)
    if type(t) ~= "table" then
        return nil
    end
    local out, any = {}, false
    for k, v in pairs(t) do
        if type(k) == "number" and type(v) == "string" then
            out[tostring(k)] = v
            any = true
        end
    end
    return any and out or nil
end

local function fruitEntry(ft)
    if type(ft.index) ~= "number" then
        return nil
    end
    local fillType = ft.fillType
    local title = type(fillType) == "table" and fillType.title or nil
    return {
        index = ft.index,
        name = type(ft.name) == "string" and ft.name or nil,
        title = type(title) == "string" and title or nil,
        color = rgb(ft.defaultMapColor),
        colorBlindColor = rgb(ft.colorBlindMapColor),
        numGrowthStates = num(ft.numGrowthStates),
        minHarvest = num(ft.minHarvestingGrowthState),
        maxHarvest = num(ft.maxHarvestingGrowthState),
        withered = num(ft.witheredState),
        cut = num(ft.cutState),
        minPrepare = num(ft.minPreparingGrowthState),
        maxPrepare = num(ft.maxPreparingGrowthState),
        regrows = ft.regrows == true,
        shownOnMap = ft.shownOnMap ~= false,
        stateNames = stateNames(ft.growthStateToName),
    }
end

-- FieldGroundType.NAME = value, if it's a plain table of constants
local function groundTypes()
    local out, any = {}, false
    if type(FieldGroundType) == "table" then
        for k, v in pairs(FieldGroundType) do
            if type(k) == "string" and type(v) == "number" and k:upper() == k then
                out[k] = v
                any = true
            end
        end
    end
    return any and out or nil
end

local function indexLess(a, b)
    return a.index < b.index
end

Companion.Collectors.CropTypes = {
    topic = "crop_types",
    interval = 1000,
    resend = true,
    reset = function()
        sent = false
    end,
    collect = function(ctx)
        if sent or g_fruitTypeManager == nil then
            return nil
        end
        local fruits = {}
        for _, ft in ipairs(Api.listOf(g_fruitTypeManager.fruitTypes)) do
            local entry = fruitEntry(ft)
            if entry ~= nil then
                fruits[#fruits + 1] = entry
            end
        end
        if #fruits == 0 then
            return nil
        end
        table.sort(fruits, indexLess)
        local fm = g_fieldManager or {}
        sent = true
        return {
            fruits = fruits,
            groundTypes = groundTypes(),
            levels = {
                lime = num(fm.limeLevelMaxValue),
                plow = num(fm.plowLevelMaxValue),
                spray = num(fm.sprayLevelMaxValue),
            },
        }
    end,
}
