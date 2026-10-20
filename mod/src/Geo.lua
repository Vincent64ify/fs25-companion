-- Geo.lua
-- One heading convention for every topic: degrees, 0 = north (-Z),
-- clockwise (east = +X). Verified in Phase 0: atan2(dx, -dz) on a node's
-- forward vector matches the travel direction (0.3 deg median error).

Companion = Companion or {}

local Geo = {}
Companion.Geo = Geo

local atan2 = math.atan2 or math.atan

function Geo.headingFromDirection(dx, dz)
    if dx == nil or dz == nil or (dx == 0 and dz == 0) then
        return nil
    end
    return (math.deg(atan2(dx, -dz)) + 360) % 360
end

function Geo.round(v, decimals)
    if type(v) ~= "number" or v ~= v then
        return nil
    end
    local m = 10 ^ (decimals or 2)
    return math.floor(v * m + 0.5) / m
end

-- heading rounded to 0.1 deg, kept in [0, 360) (359.96 must not become 360)
function Geo.roundHeading(heading)
    local r = Geo.round(heading, 1)
    if r ~= nil and r >= 360 then
        r = r - 360
    end
    return r
end

-- x, y, z and heading of a scene graph node (vehicle root node).
-- Returns nil when the node is gone.
function Geo.nodePose(node)
    if type(node) ~= "number" or node == 0 then
        return nil
    end
    local x, y, z = getWorldTranslation(node)
    if x == nil then
        return nil
    end
    local dx, _, dz = localDirectionToWorld(node, 0, 0, 1)
    return {
        x = Geo.round(x, 2),
        y = Geo.round(y, 2),
        z = Geo.round(z, 2),
        heading = Geo.roundHeading(Geo.headingFromDirection(dx, dz)),
    }
end
