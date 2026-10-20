-- Hotspots.lua
-- The PDA's points of interest, every 10 s: sell points, loading stations,
-- productions, shops, animal pens, missions, tours and the rest. They come
-- from the list the PDA itself draws (hud.ingameMap.hotspots, Phase 0), so
-- the dashboard matches the PDA on any map without per-map tables.
--
-- Fields, vehicles, the player and AI workers have hotspots too. Their own
-- topics cover them, so they're left out here.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

-- MapHotspot.CATEGORY_* values verified in Phase 0: FIELD 1, STEERABLE 5,
-- COMBINE 6, TRAILER 7, TOOL 8, AI 14, PLAYER/MAP_UTILITY 15
local SKIPPED_CATEGORIES = {
    [1] = true, [5] = true, [6] = true, [7] = true, [8] = true, [14] = true, [15] = true,
}

local function hotspotName(h)
    local name = Api.tryCall(h, "getName")
    if type(name) ~= "string" or name == "" then
        name = h.name
    end
    if type(name) == "string" and name ~= "" then
        return name
    end
    return nil
end

local function hotspotEntry(h)
    local category = Api.tryCall(h, "getCategory")
    if type(category) ~= "number" or SKIPPED_CATEGORIES[category] then
        return nil
    end
    local x, z = h.worldX, h.worldZ
    if type(x) ~= "number" or type(z) ~= "number" then
        x, z = Api.tryCallAll(h, "getWorldPosition")
        if type(x) ~= "number" or type(z) ~= "number" then
            return nil
        end
    end
    local visible = Api.tryCall(h, "getIsVisible")
    if visible == nil then
        visible = h.isVisible
    end
    return {
        category = category,
        name = hotspotName(h),
        x = Geo.round(x, 1),
        z = Geo.round(z, 1),
        farmId = h.ownerFarmId,
        -- false for placeables nobody has bought yet (owned by farm 15)
        visible = visible ~= false,
    }
end

local function entryLess(a, b)
    if a.category ~= b.category then
        return a.category < b.category
    end
    if a.x ~= b.x then
        return a.x < b.x
    end
    return a.z < b.z
end

Companion.Collectors.Hotspots = {
    topic = "hotspots",
    interval = 10000,
    collect = function(ctx)
        local hud = g_currentMission.hud
        local ingameMap = hud ~= nil and hud.ingameMap or nil
        if ingameMap == nil then
            return nil
        end
        local out = {}
        for _, h in ipairs(Api.listOf(ingameMap.hotspots)) do
            local entry = hotspotEntry(h)
            if entry ~= nil then
                out[#out + 1] = entry
            end
        end
        -- a stable order, so an unchanged list encodes the same
        table.sort(out, entryLess)
        return { hotspots = out }
    end,
}
