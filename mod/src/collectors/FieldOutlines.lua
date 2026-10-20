-- FieldOutlines.lua
-- Every field's outline, once per map. Fields don't change shape during a
-- game, so the outlines are sent once (and again after a file rotation);
-- their crop and state come every 15 s from the fields topic (Fields.lua).
--
-- Phase 0 found two ready-made outlines on each field: polygonPoints (the
-- map's polygon point nodes) and densityMapPolygon.pointsX/pointsZ. The
-- nodes come first, since getWorldTranslation is world meters for sure.
--
-- data: {fields = [{id, points = [x1, z1, x2, z2, ...]}]}

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

local sent = false

local function fromNodes(nodes)
    local points = {}
    for _, node in ipairs(nodes) do
        if type(node) ~= "number" or node == 0 then
            return nil
        end
        local x, _, z = getWorldTranslation(node)
        if type(x) ~= "number" or type(z) ~= "number" then
            return nil
        end
        points[#points + 1] = Geo.round(x, 1)
        points[#points + 1] = Geo.round(z, 1)
    end
    return points
end

local function fromPolygon(polygon)
    local xs, zs = polygon.pointsX, polygon.pointsZ
    if type(xs) ~= "table" or type(zs) ~= "table" or #xs ~= #zs then
        return nil
    end
    local points = {}
    for i = 1, #xs do
        if type(xs[i]) ~= "number" or type(zs[i]) ~= "number" then
            return nil
        end
        points[#points + 1] = Geo.round(xs[i], 1)
        points[#points + 1] = Geo.round(zs[i], 1)
    end
    return points
end

local function outline(field)
    local points
    if type(field.polygonPoints) == "table" and getWorldTranslation ~= nil then
        local ok, result = pcall(fromNodes, field.polygonPoints)
        points = ok and result or nil
    end
    if (points == nil or #points < 6) and type(field.densityMapPolygon) == "table" then
        points = fromPolygon(field.densityMapPolygon)
    end
    if points == nil or #points < 6 then
        return nil
    end
    return points
end

local function idLess(a, b)
    return a.id < b.id
end

Companion.Collectors.FieldOutlines = {
    topic = "field_outlines",
    -- retried every second until the fields exist
    interval = 1000,
    resend = true,
    reset = function()
        sent = false
    end,
    collect = function(ctx)
        if sent or g_fieldManager == nil then
            return nil
        end
        local out = {}
        for _, field in ipairs(Api.listOf(g_fieldManager.fields)) do
            local id = Api.fieldId(field)
            local points = id ~= nil and outline(field) or nil
            if points ~= nil then
                out[#out + 1] = { id = id, points = points }
            end
        end
        if #out == 0 then
            return nil
        end
        table.sort(out, idLess)
        sent = true
        return { fields = out }
    end,
}
