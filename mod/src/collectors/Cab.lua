-- Cab.lua
-- What the dashboard's controls show, for the vehicle the player controls:
-- lights, engine, cruise control, the AI worker, each implement's lowered /
-- on state, and the selected implement (the one the implement keys act
-- on): lowered, folded and whether its fold is moving, turned on.
-- Read every frame and sent only when something changed, so a tap on the
-- dashboard (the command's ack goes out the same frame, see Commands.lua)
-- and a key pressed in game both show at once. The 500 ms `vehicles`
-- topic keeps everything else.
--
--     {"inVehicle":true,"vehicleId":7,"engineOn":true,
--      "lights":{"on":true,"high":false,"beacon":false,"hazard":false,"left":false,"right":false,
--                "stage":1,"stages":3},
--      "engineState":"on",
--      "cruise":{"state":"on","speed":15,"maxSpeed":40},"aiActive":false,"hitched":true,
--      "implement":{"name":"Lemken Rubin 12","lowered":true,"canLower":true,"turnedOn":false,
--                   "canTurnOn":false,"foldable":true,"unfolded":true,"foldMoving":false},
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
        engineState = VehicleState.engineState(vehicle),
        lights = VehicleState.lights(vehicle),
        aiActive = VehicleState.aiActive(vehicle),
        implements = {},
    }
    local cruise = VehicleState.cruise(vehicle)
    if cruise ~= nil then
        cab.cruise = { state = cruise.state, speed = cruise.speed, maxSpeed = cruise.maxSpeed }
    end
    implementStates(vehicle, 1, cab.implements)
    cab.hitched = #cab.implements > 0
    local selected = VehicleState.selectedImplement(vehicle)
    if selected ~= nil then
        cab.implement = VehicleState.implement(selected)
    end
    return cab
end

Companion.Collectors.Cab = {
    topic = "cab",
    -- every frame: it costs a few field reads, and sends only on change
    interval = 0,
    resend = true,
    reset = function()
        last = nil
        VehicleState.resetDiagnostics()
    end,
    collect = function(ctx)
        local vehicle = Api.controlledVehicle()
        -- to log.txt only, once per vehicle (see VehicleState)
        pcall(VehicleState.dumpReverseCruise, vehicle, function(msg) print("[FS25_Companion] " .. msg) end)
        local cab = cabOf(vehicle)
        local json = Companion.Json.encode(cab)
        if json == last then
            return nil
        end
        last = json
        return cab
    end,
}
