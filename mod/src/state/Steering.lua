-- state/Steering.lua
-- Steering Assist (specs/0020): the vehicle's AI mode, whether the game
-- steers, and whether it would take the steering key now. A plain reader,
-- no cache, no game calls: the fields of AIModeSelection.lua and
-- AIAutomaticSteering.lua (names through Api.lua, unverified until the
-- live check), read as spike 0.0.15 saw them (mod/tests/fixtures/spike0020/).

Companion = Companion or {}

local Api = Companion.Api

local VehicleState = Companion.VehicleState or {}
Companion.VehicleState = VehicleState

-- the game's own steering key (Activate lane / Deactivate lane): its event
-- is active only with a course and a lane under you
VehicleState.STEERING_KEY = "TOGGLE_AI_STEERING"

-- {mode = "worker"|"steeringAssist", state = "off"|"ready"|"steering",
-- canSteer}; nil without either part or with a mode neither name has. A
-- truck may carry both parts (spike 0.0.15): the mode decides, not the
-- vehicle. canSteer is the steering key's event (VehicleState.liveKey),
-- false with none registered.
function VehicleState.steering(vehicle)
    local spec = Api.automaticSteering(vehicle)
    if spec == nil then
        return nil
    end
    local mode = Api.aiMode(vehicle)
    if mode == nil then
        return nil
    end
    local state = "off"
    if spec.steeringEnabled == true then
        state = "steering"
    elseif spec.steeringFieldCourse ~= nil then
        state = "ready"
    end
    local key = VehicleState.liveKey(vehicle, VehicleState.STEERING_KEY)
    return { mode = mode, state = state, canSteer = key ~= nil and key.active == true }
end

-- whether the game steers now; nil without the part
function VehicleState.steeringEnabled(vehicle)
    local spec = Api.automaticSteering(vehicle)
    if spec == nil then
        return nil
    end
    return spec.steeringEnabled == true
end
