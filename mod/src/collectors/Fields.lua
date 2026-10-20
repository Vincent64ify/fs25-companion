-- Fields.lua
-- Every field's crop and soil state, every 15 s, for the dashboard's PDA
-- colour modes (crop, growth, fertilizer, lime, plowing, weeds) and the
-- field info panel. The outlines come once per map from field_outlines
-- (FieldOutlines.lua), the crop colours from crop_types (CropTypes.lua).
--
-- The state is the game's own field.fieldState (names verified in
-- Phase 0), which the field manager keeps up to date for the PDA.
--
-- data: {fields = [{id, farmlandId, x, z, areaHa, fruitTypeIndex,
--   growthState, groundType, sprayLevel, sprayType, limeLevel, plowLevel,
--   rollerLevel, stubbleShredLevel, weedState, stoneLevel}]}
--   fruitTypeIndex 0 = no crop.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

local STATE_KEYS = {
    "fruitTypeIndex", "growthState", "groundType", "sprayLevel", "sprayType",
    "limeLevel", "plowLevel", "rollerLevel", "stubbleShredLevel", "weedState", "stoneLevel",
}

local function fieldEntry(field)
    local id = Api.fieldId(field)
    if id == nil then
        return nil
    end
    local entry = {
        id = id,
        x = Geo.round(field.posX, 1),
        z = Geo.round(field.posZ, 1),
        areaHa = Geo.round(field.areaHa, 2),
    }
    local farmland = field.farmland
    if type(farmland) == "table" and type(farmland.id) == "number" then
        entry.farmlandId = farmland.id
    end
    local state = field.fieldState
    if type(state) == "table" and state.isValid ~= false then
        for _, key in ipairs(STATE_KEYS) do
            if type(state[key]) == "number" then
                entry[key] = state[key]
            end
        end
    end
    return entry
end

local function idLess(a, b)
    return a.id < b.id
end

Companion.Collectors.Fields = {
    topic = "fields",
    interval = 15000,
    collect = function(ctx)
        if g_fieldManager == nil then
            return nil
        end
        local out = {}
        for _, field in ipairs(Api.listOf(g_fieldManager.fields)) do
            local entry = fieldEntry(field)
            if entry ~= nil then
                out[#out + 1] = entry
            end
        end
        if #out == 0 then
            return nil
        end
        table.sort(out, idLess)
        return { fields = out }
    end,
}
