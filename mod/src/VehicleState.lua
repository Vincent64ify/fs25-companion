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
--
-- The mask also holds lights no key stage turns on: reversing lit the
-- reverse lights in the live test, and the Lights control read "on" with
-- the stage at 0. So with stages, "on" means a stage is on (or, when only
-- the mask is readable, one of the stages' own lights).

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

-- the bits of mask that are also in only
local function maskAnd(mask, only)
    local out, bit = 0, 1
    while bit <= mask and bit <= only do
        if hasBit(mask, bit) and hasBit(only, bit) then
            out = out + bit
        end
        bit = bit * 2
    end
    return out
end

local function withoutHighBeam(mask)
    return hasBit(mask, HIGH_BEAM_BIT) and mask - HIGH_BEAM_BIT or mask
end

-- stage (0 = off), the number of stages and whether a stage's lights are
-- on; all nil when the vehicle has no list of light states
local function lightStages(spec, mask)
    local states = spec.lightStates
    if type(states) ~= "table" or #states == 0 then
        return nil, nil, nil
    end
    local stages = #states
    local current = spec.currentLightState
    if type(current) == "number" and current >= 0 and current <= stages
        and current == math.floor(current) then
        return current, stages, current > 0
    end
    if type(mask) ~= "number" then
        return nil, stages, nil
    end
    local masks, union = {}, 0
    for i = 1, stages do
        local types = stateTypes(states[i])
        -- the high beam is a separate key: leave it out
        masks[i] = types ~= nil and withoutHighBeam(maskOf(types)) or -1
        if masks[i] > 0 then
            union = union + masks[i] - maskAnd(union, masks[i])
        end
    end
    -- only the stages' own lights: not reverse, brake or work lights
    local base = maskAnd(mask, union)
    if base == 0 then
        return 0, stages, false
    end
    for i = 1, stages do
        if masks[i] == base then
            return i, stages, true
        end
    end
    return nil, stages, true
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
    local stagesOn
    out.stage, out.stages, stagesOn = lightStages(spec, mask)
    if stagesOn ~= nil then
        out.on = stagesOn
    end
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

-- Implements ---------------------------------------------------------------
-- The implement the game's implement keys act on (lower, fold, turn on):
-- the selected one, else the first one attached. These names follow the
-- FS22 specs (selection, Foldable, TurnOnVehicle, Attachable) and are not
-- verified in FS25 yet; all guarded.

function VehicleState.selectedImplement(vehicle)
    local selected = Api.tryCall(vehicle, "getSelectedVehicle")
    if type(selected) == "table" and selected ~= vehicle then
        return selected
    end
    local implement = Api.tryCall(vehicle, "getSelectedImplement")
    if type(implement) == "table" and type(implement.object) == "table" and implement.object ~= vehicle then
        return implement.object
    end
    local attached = Api.tryCall(vehicle, "getAttachedImplements")
    if type(attached) == "table" then
        for _, entry in pairs(attached) do
            if type(entry) == "table" and type(entry.object) == "table" then
                return entry.object
            end
        end
    end
    return nil
end

-- whether a fold animation runs right now
local function foldMoving(object, spec)
    local parts = spec.foldingParts
    local asked = false
    if type(parts) == "table" then
        for _, part in pairs(parts) do
            if type(part) == "table" and part.animationName ~= nil then
                local playing = Api.tryCall(object, "getIsAnimationPlaying", part.animationName)
                if playing == true then
                    return true
                end
                asked = asked or playing == false
            end
        end
    end
    if asked then
        return false
    end
    -- no animation API: between the two ends counts as moving
    local t = spec.foldAnimTime
    return type(t) == "number" and t > 0.001 and t < 0.999
end

-- what the implement controls show for one implement
function VehicleState.implement(object)
    local out = {
        name = Api.tryCall(object, "getFullName") or object.typeName,
        lowered = Api.tryCall(object, "getIsLowered", true) == true,
        turnedOn = Api.tryCall(object, "getIsTurnedOn") == true,
        canTurnOn = object.spec_turnOnVehicle ~= nil,
    }
    local allows = Api.tryCall(object, "getAllowsLowering")
    out.canLower = allows ~= false
    local foldable = object.spec_foldable
    if foldable ~= nil and (type(foldable.foldingParts) ~= "table" or next(foldable.foldingParts) ~= nil) then
        out.foldable = true
        local unfolded = Api.tryCall(object, "getIsUnfolded")
        if type(unfolded) == "boolean" then
            out.unfolded = unfolded
        end
        out.foldMoving = foldMoving(object, foldable)
    else
        out.foldable = false
    end
    return out
end

-- Rig (Controls C3) ---------------------------------------------------------
-- The tractor and everything attached, and which tool each implement key
-- acts on. Verified live with the selection spike (mod 0.6.4, PLAN.md C3):
-- root:setSelectedObject(entry of root.selectableObjects) selects one tool
-- directly; a joint's z in its vehicle's frame says front (>= 0) or rear;
-- some keys stay with a tool that isn't selected (fold stayed on the
-- cultivator with the loader selected), as the game intends.

local function rootOf(vehicle)
    local root = Api.tryCall(vehicle, "getRootVehicle")
    return type(root) == "table" and root or vehicle
end
VehicleState.rootOf = rootOf

-- the vehicle behind a selectable object (object.vehicle) or the object
local function vehicleOf(object)
    if type(object) == "table" and type(object.vehicle) == "table" then
        return object.vehicle
    end
    return object
end

-- the root's selectable objects in the game's order (what G cycles)
function VehicleState.selectables(root)
    local list = {}
    if type(root) == "table" and type(root.selectableObjects) == "table" then
        for _, object in ipairs(root.selectableObjects) do
            if type(object) == "table" then
                list[#list + 1] = { object = object, vehicle = vehicleOf(object) }
            end
        end
    end
    return list
end

-- "front" or "rear" from the attacher joint, nil when unknown
local function sideOf(parent, jointIndex)
    local spec = parent.spec_attacherJoints
    local joints = type(spec) == "table" and spec.attacherJoints or nil
    local joint = type(joints) == "table" and jointIndex ~= nil and joints[jointIndex] or nil
    if type(joint) ~= "table" or joint.jointTransform == nil or parent.rootNode == nil
        or localToLocal == nil then
        return nil
    end
    local ok, _, _, z = pcall(localToLocal, joint.jointTransform, parent.rootNode, 0, 0, 0)
    if not ok or type(z) ~= "number" then
        return nil
    end
    return z >= 0 and "front" or "rear"
end

local MAX_RIG_DEPTH = 6

-- every attached object, depth first: {object, parent, depth, side}; a
-- tool on a tool (a loader's bucket) takes its parent's side
function VehicleState.attachedTree(vehicle)
    local out = {}
    local function walk(parent, depth, parentSide)
        local attached = Api.tryCall(parent, "getAttachedImplements")
        if type(attached) ~= "table" then
            return
        end
        for _, entry in pairs(attached) do
            local object = type(entry) == "table" and entry.object or nil
            if type(object) == "table" then
                local side = parentSide or sideOf(parent, entry.jointDescIndex)
                out[#out + 1] = { object = object, parent = parent, depth = depth, side = side }
                if depth < MAX_RIG_DEPTH then
                    walk(object, depth + 1, side)
                end
            end
        end
    end
    walk(vehicle, 1, nil)
    return out
end

-- the object whose live event an input action would run now (the first
-- active one), or nil
function VehicleState.keyTarget(name)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return nil
    end
    local action = binding.nameActions[name]
    local events = action ~= nil and binding.actionEvents[action] or nil
    if type(events) ~= "table" then
        return nil
    end
    for _, event in pairs(events) do
        if type(event) == "table" and event.isActive ~= false and type(event.targetObject) == "table" then
            return event.targetObject
        end
    end
    return nil
end

-- the implement keys, by the cab's name for them
VehicleState.KEYS = { lower = "LOWER_IMPLEMENT", fold = "IMPLEMENT_EXTRA2", turnOn = "IMPLEMENT_EXTRA" }

-- the cab's rig: the controlled vehicle first, then what's attached, each
-- with its id, parent's id, depth, side, whether the game can select it
-- and has it selected; the tools also carry their implement state
function VehicleState.rig(vehicle)
    local root = rootOf(vehicle)
    local selectable = {}
    for _, entry in ipairs(VehicleState.selectables(root)) do
        selectable[entry.vehicle] = true
    end
    local selected = Api.tryCall(root, "getSelectedVehicle")
    local function mark(e, object)
        e.id = object.id
        e.selectable = selectable[object] == true
        e.selected = selected == object
        return e
    end
    local rig = { mark({ name = Api.tryCall(vehicle, "getFullName") or vehicle.typeName, depth = 0 }, vehicle) }
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        local e = mark(VehicleState.implement(node.object), node.object)
        e.parent = node.parent.id
        e.depth = node.depth
        e.side = node.side
        rig[#rig + 1] = e
    end
    return rig
end

-- which object's id each implement key acts on right now
function VehicleState.keys()
    local out = {}
    for key, input in pairs(VehicleState.KEYS) do
        local target = VehicleState.keyTarget(input)
        if target ~= nil then
            out[key] = target.id
        end
    end
    return out
end

-- the attached object with this id, or nil
function VehicleState.attachedById(vehicle, id)
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        if node.object.id == id then
            return node.object
        end
    end
    return nil
end

-- whether an AI worker drives the vehicle
function VehicleState.aiActive(vehicle)
    return Api.tryCall(vehicle, "getIsAIActive") == true
end
