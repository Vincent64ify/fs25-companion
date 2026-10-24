-- Cab.lua
-- What the dashboard's controls show, for the vehicle the player controls:
-- lights, engine, cruise control and each implement's lowered / on state.
-- Read every frame and sent only when something changed, so a tap on the
-- dashboard (the command's ack goes out the same frame, see Commands.lua)
-- and a key pressed in game both show at once. The 500 ms `vehicles`
-- topic keeps everything else.
--
--     {"inVehicle":true,"vehicleId":7,"engineOn":true,
--      "lights":{"on":true,"high":false,"beacon":false,"hazard":false,"left":false,"right":false,
--                "stage":1,"stages":3},
--      "cruise":{"state":"on","speed":15},
--      "implements":[{"lowered":true,"turnedOn":false}]}
--
-- On foot: {"inVehicle":false}.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local VehicleState = Companion.VehicleState

local MAX_IMPLEMENT_DEPTH = 6

-- the JSON of the last cab sent; nothing is sent while it stays the same
local last = nil

-- depth first, in the same order as the vehicles topic's implements
local function implementStates(vehicle, depth, out)
    local attached = Api.tryCall(vehicle, "getAttachedImplements")
    if type(attached) ~= "table" then
        return
    end
    for _, implement in pairs(attached) do
        local object = type(implement) == "table" and implement.object or nil
        if object ~= nil then
            out[#out + 1] = {
                lowered = Api.tryCall(object, "getIsLowered", true) == true,
                turnedOn = Api.tryCall(object, "getIsTurnedOn") == true,
            }
            if depth < MAX_IMPLEMENT_DEPTH then
                implementStates(object, depth + 1, out)
            end
        end
    end
end

local function cabOf(vehicle)
    if vehicle == nil then
        return { inVehicle = false }
    end
    local cab = {
        inVehicle = true,
        vehicleId = vehicle.id,
        engineOn = VehicleState.engineOn(vehicle),
        lights = VehicleState.lights(vehicle),
        implements = {},
    }
    local cruise = VehicleState.cruise(vehicle)
    if cruise ~= nil then
        cab.cruise = { state = cruise.state, speed = cruise.speed }
    end
    implementStates(vehicle, 1, cab.implements)
    return cab
end

Companion.Collectors.Cab = {
    topic = "cab",
    -- every frame: it costs a few field reads, and sends only on change
    interval = 0,
    resend = true,
    reset = function()
        last = nil
    end,
    collect = function(ctx)
        local cab = cabOf(Api.controlledVehicle())
        local json = Companion.Json.encode(cab)
        if json == last then
            return nil
        end
        last = json
        return cab
    end,
}
