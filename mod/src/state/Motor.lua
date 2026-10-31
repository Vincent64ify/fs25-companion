-- state/Motor.lua
-- The engine, the driving direction, cruise control and the AI worker, read
-- the same way for the `vehicles` and `cab` topics. All guarded.

Companion = Companion or {}

local Api = Companion.Api
local Geo = Companion.Geo

-- the one VehicleState table, filled by the files in state/ (specs/0009)
local VehicleState = Companion.VehicleState or {}
Companion.VehicleState = VehicleState

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

-- the motor's state: "off", "starting" or "on" (getMotorState against the
-- MotorState constants, FS22 names; else on / off from engineOn). Starting
-- takes a few seconds in game (seen live in C2), nil without an engine.
function VehicleState.engineState(vehicle)
    if vehicle.spec_motorized == nil then
        return nil
    end
    local state = Api.tryCall(vehicle, "getMotorState")
    local states = type(MotorState) == "table" and MotorState or nil
    if type(state) == "number" and states ~= nil then
        if state == states.STARTING then
            return "starting"
        elseif state == states.ON then
            return "on"
        elseif state == states.OFF or state == states.IGNITION then
            return "off"
        end
    end
    return VehicleState.engineOn(vehicle) and "on" or "off"
end

-- whether the vehicle drives in reverse: the motor's direction, else the
-- gear's name ("R", "-1"), else the way it moves
function VehicleState.reversing(vehicle)
    local motor = Api.tryCall(vehicle, "getMotor")
    if type(motor) == "table" and type(motor.currentDirection) == "number" and motor.currentDirection ~= 0 then
        return motor.currentDirection < 0
    end
    local gear = Api.tryCall(vehicle, "getGearInfoToDisplay")
    if type(gear) == "string" and gear ~= "" then
        local first = gear:sub(1, 1)
        if first == "R" or first == "-" then
            return true
        end
    end
    return type(vehicle.movingDirection) == "number" and vehicle.movingDirection < 0
end

-- Drivable.CRUISECONTROL_STATE_*: OFF 0, ACTIVE 1, FULL 2 (full throttle,
-- no set speed)
local CRUISE_STATES = { [0] = "off", [1] = "on", [2] = "full" }

-- cruise control: its state and its set speed (km/h), with the highest
-- one. Only the main set speed: see Commands.lua on reverse.
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

-- Diagnostics: what the HUD's cruise number shows while reversing (live,
-- C2: an unrelated value, even with cruise control off). Once per vehicle,
-- the first time it reverses, the cruise control's fields and the motor's
-- speed limits go to log.txt, never to the dashboard.
local dumped = {}

local function scalars(t)
    local parts = {}
    if type(t) ~= "table" then
        return "(none)"
    end
    for k, v in pairs(t) do
        local tv = type(v)
        if type(k) == "string" and (tv == "number" or tv == "boolean" or tv == "string") then
            parts[#parts + 1] = k .. "=" .. tostring(v)
        end
    end
    table.sort(parts)
    return table.concat(parts, " ")
end

function VehicleState.resetDiagnostics()
    dumped = {}
end

function VehicleState.dumpReverseCruise(vehicle, log)
    if vehicle == nil or vehicle.id == nil or dumped[vehicle.id] then
        return false
    end
    if not VehicleState.reversing(vehicle) then
        return false
    end
    dumped[vehicle.id] = true
    local spec = vehicle.spec_drivable
    local motor = Api.tryCall(vehicle, "getMotor")
    local values = {}
    for _, name in ipairs({ "getMaximumForwardSpeed", "getMaximumBackwardSpeed", "getSpeedLimit" }) do
        values[#values + 1] = "motor:" .. name .. "=" .. tostring(Api.tryCall(motor, name))
    end
    for _, name in ipairs({ "getSpeedLimit", "getCruiseControlSpeed", "getCruiseControlMaxSpeed",
        "getCruiseControlDisplayInfo" }) do
        values[#values + 1] = "vehicle:" .. name .. "=" .. tostring(Api.tryCall(vehicle, name))
    end
    log(string.format("reverse cruise check, %s: cruiseControl {%s}; motor {%s}; %s",
        tostring(Api.tryCall(vehicle, "getFullName") or vehicle.typeName),
        scalars(spec ~= nil and spec.cruiseControl or nil), scalars(motor), table.concat(values, " ")))
    return true
end

-- whether an AI worker drives the vehicle
function VehicleState.aiActive(vehicle)
    return Api.tryCall(vehicle, "getIsAIActive") == true
end
