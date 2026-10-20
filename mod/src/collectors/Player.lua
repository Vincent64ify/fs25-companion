-- Player.lua
-- Where the local player is, 10 times per second.
-- In a vehicle the pose is the vehicle's (the player node is parked
-- elsewhere). On foot, the player's root node never rotates, so the
-- heading comes from getCurrentFacingDirection() (Phase 0).

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

Companion.Collectors.Player = {
    topic = "player",
    interval = 100,
    collect = function(ctx)
        local player = g_localPlayer
        if player == nil then
            return nil
        end

        local data
        local vehicle = Api.controlledVehicle()
        if vehicle ~= nil then
            data = Geo.nodePose(vehicle.rootNode)
        end
        if data ~= nil then
            data.inVehicle = true
            data.vehicleId = vehicle.id
        else
            local x, y, z = player:getPosition()
            if x == nil then
                return nil
            end
            local dx, dz = player:getCurrentFacingDirection()
            data = {
                x = Geo.round(x, 2),
                y = Geo.round(y, 2),
                z = Geo.round(z, 2),
                heading = Geo.roundHeading(Geo.headingFromDirection(dx, dz)),
                inVehicle = false,
            }
        end
        data.farmId = player.farmId
        return data
    end,
}
