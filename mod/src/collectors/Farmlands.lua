-- Farmlands.lua
-- Every farmland with its owner and price, every 10 s, so buying or selling
-- land shows up quickly. The outlines come once per map from the
-- farmland_grid topic (FarmlandGrid.lua). Field names verified in Phase 0.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

local function idLess(a, b)
    return a.id < b.id
end

Companion.Collectors.Farmlands = {
    topic = "farmlands",
    interval = 10000,
    collect = function(ctx)
        local manager = g_farmlandManager
        if manager == nil then
            return nil
        end
        local out = {}
        for _, f in ipairs(Api.listOf(manager.farmlands)) do
            if type(f.id) == "number" then
                out[#out + 1] = {
                    id = f.id,
                    -- 0 = nobody owns it
                    farmId = type(f.farmId) == "number" and f.farmId or 0,
                    price = Geo.round(f.price, 0),
                    areaHa = Geo.round(f.areaInHa, 2),
                    x = Geo.round(f.xWorldPos, 1),
                    z = Geo.round(f.zWorldPos, 1),
                    name = type(f.name) == "string" and f.name or nil,
                    -- false for land the farmlands screen doesn't offer
                    listed = f.showOnFarmlandsScreen ~= false,
                }
            end
        end
        table.sort(out, idLess)
        return { farmlands = out }
    end,
}
