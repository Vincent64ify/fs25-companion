-- VehicleState.lua
-- What the cab's switches show, read the same way for the `vehicles` topic
-- (every 500 ms) and the `cab` topic (every frame, on change): lights,
-- engine and cruise control. All guarded.
--
-- Lights: C0 saw `beaconLightsActive` flip with the beacon in FS25. The
-- other light fields follow the FS22 Lights spec (lightsTypesMask,
-- turnLightState) with the old telemetry mod's names as a fallback; they
-- are still to confirm live.
--
-- Light stages: the light key (TOGGLE_LIGHTS) steps through the vehicle's
-- own list of light states, then back to off (seen live in C1: three
-- stages on a tractor). In the FS22 spec that list is `lightStates` (each
-- entry the light types it turns on) and the step is `currentLightState`
-- (0 = off). Where the step isn't readable, the stage is the entry whose
-- light types match the mask.

Companion = Companion or {}

local Api = Companion.Api
local Geo = Companion.Geo

local VehicleState = {}
Companion.VehicleState = VehicleState

-- Lights.TURNLIGHT_*: OFF 0, LEFT 1, RIGHT 2, HAZARD 3
local function turnLightConstant(name, default)
    if type(Lights) == "table" and type(Lights[name]) == "number" then
        return Lights[name]
    end
    return default
end

-- the high beam is light type 3 in the FS22 Lights spec
local HIGH_BEAM_BIT = 8

local function hasBit(mask, bit)
    return math.floor(mask / bit) % 2 == 1
end

-- the light types of one lightStates entry: a list of type numbers, or a
-- table holding one as lightTypes
local function stateTypes(entry)
    if type(entry) ~= "table" then
        return nil
    end
    if type(entry.lightTypes) == "table" then
        return entry.lightTypes
    end
    return entry
end

local function maskOf(types)
    local mask = 0
    for _, t in pairs(types) do
        if type(t) == "number" and t >= 0 and not hasBit(mask, 2 ^ t) then
            mask = mask + 2 ^ t
        end
    end
    return mask
end

-- stage (0 = off) and the number of stages, or nil when the vehicle has
-- no list of light states
local function lightStages(spec, mask)
    local states = spec.lightStates
    if type(states) ~= "table" or #states == 0 then
        return nil, nil
    end
    local stages = #states
    local current = spec.currentLightState
    if type(current) == "number" and current >= 0 and current <= stages
        and current == math.floor(current) then
        return current, stages
    end
    if type(mask) ~= "number" then
        return nil, stages
    end
    -- the high beam is a separate key: leave it out of the match
    local base = hasBit(mask, HIGH_BEAM_BIT) and mask - HIGH_BEAM_BIT or mask
    if base == 0 then
        return 0, stages
    end
    for i = 1, stages do
        local types = stateTypes(states[i])
        if types ~= nil then
            local m = maskOf(types)
            if (hasBit(m, HIGH_BEAM_BIT) and m - HIGH_BEAM_BIT or m) == base then
                return i, stages
            end
        end
    end
    return nil, stages
end

-- the light switches, nil for a vehicle without lights
function VehicleState.lights(vehicle)
    local spec = vehicle.spec_lights
    if spec == nil then
        return nil
    end
    local mask = spec.lightsTypesMask
    local out = {}
    if type(mask) == "number" then
        out.on = mask ~= 0
        out.high = hasBit(mask, HIGH_BEAM_BIT)
    else
        out.on = spec.isLightOn == true
        out.high = spec.isLightHighOn == true
    end
    out.stage, out.stages = lightStages(spec, mask)
    local beacon = spec.beaconLightsActive
    if type(beacon) ~= "boolean" then
        beacon = spec.beaconOn == true
    end
    out.beacon = beacon
    local turn = spec.turnLightState
    if type(turn) == "number" then
        out.left = turn == turnLightConstant("TURNLIGHT_LEFT", 1)
        out.right = turn == turnLightConstant("TURNLIGHT_RIGHT", 2)
        out.hazard = turn == turnLightConstant("TURNLIGHT_HAZARD", 3)
    else
        out.left = spec.leftTurnSignalOn == true
        out.right = spec.rightTurnSignalOn == true
        out.hazard = spec.hazardOn == true
    end
    return out
end

-- whether the engine runs: getIsMotorStarted(), else the spec's field.
-- spec_motorized.engineStarted (the first guess) is nil in FS25, so the
-- engine always read as off in the live test. Nil without an engine.
function VehicleState.engineOn(vehicle)
    local motorized = vehicle.spec_motorized
    if motorized == nil then
        return nil
    end
    local started = Api.tryCall(vehicle, "getIsMotorStarted")
    if type(started) == "boolean" then
        return started
    end
    if type(motorized.isMotorStarted) == "boolean" then
        return motorized.isMotorStarted
    end
    return motorized.engineStarted == true
end

-- Drivable.CRUISECONTROL_STATE_*: OFF 0, ACTIVE 1, FULL 2 (full throttle,
-- no set speed)
local CRUISE_STATES = { [0] = "off", [1] = "on", [2] = "full" }

-- cruise control: its state and the set speed (km/h)
function VehicleState.cruise(vehicle)
    local spec = vehicle.spec_drivable
    local cruise = spec ~= nil and spec.cruiseControl or nil
    local state = Api.tryCall(vehicle, "getCruiseControlState")
    if type(state) ~= "number" and type(cruise) == "table" then
        state = cruise.state
    end
    if CRUISE_STATES[state] == nil then
        return nil
    end
    local speed = Api.tryCall(vehicle, "getCruiseControlSpeed")
    if type(speed) ~= "number" and type(cruise) == "table" then
        speed = cruise.speed
    end
    local maxSpeed = Api.tryCall(vehicle, "getCruiseControlMaxSpeed")
    if type(maxSpeed) ~= "number" and type(cruise) == "table" then
        maxSpeed = cruise.maxSpeed
    end
    return {
        state = CRUISE_STATES[state],
        speed = Geo.round(speed, 1),
        maxSpeed = Geo.round(maxSpeed, 1),
    }
end
