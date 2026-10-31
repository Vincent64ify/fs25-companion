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
    out.foldable = VehicleState.fold(object, out)
    return out
end

-- an object that folds (a tool, or a combine itself): sets unfolded and
-- foldMoving on out and returns true; false when it doesn't fold
function VehicleState.fold(object, out)
    local foldable = object.spec_foldable
    if foldable == nil or (type(foldable.foldingParts) == "table" and next(foldable.foldingParts) == nil) then
        return false
    end
    local unfolded = Api.tryCall(object, "getIsUnfolded")
    if type(unfolded) == "boolean" then
        out.unfolded = unfolded
    end
    out.foldMoving = foldMoving(object, foldable)
    return true
end

-- Implement screen (2026-10-24) ----------------------------------------------
-- What its buttons and tiles show beyond lower, fold and turn on: a pipe
-- (combines), whether it discharges (a trailer tipping, a combine
-- unloading), a cover, and whether it's a trailer. Names from the game's
-- own scripts (the SDK's gameSource.zip: Pipe, Dischargeable, Trailer,
-- Cover); still guarded.

-- Dischargeable.DISCHARGE_STATE_OFF
local DISCHARGE_OFF = 0

function VehicleState.extras(object, out)
    local pipe = object.spec_pipe
    if type(pipe) == "table" and pipe.hasMovablePipe == true and type(pipe.targetState) == "number" then
        -- state 1 is in, the others out; currentState is 0 while it moves
        out.pipe = { out = pipe.targetState > 1, moving = pipe.currentState ~= pipe.targetState }
    end
    if type(object.spec_dischargeable) == "table" then
        local state = Api.tryCall(object, "getDischargeState")
        if type(state) ~= "number" then
            state = object.spec_dischargeable.currentDischargeState
        end
        if type(state) == "number" then
            out.discharging = state ~= DISCHARGE_OFF
        end
    end
    if object.spec_trailer ~= nil then
        out.trailer = true
    end
    local cover = object.spec_cover
    if type(cover) == "table" and cover.hasCovers == true and type(cover.state) == "number" then
        -- 0 closed, else the open cover's index
        out.cover = { open = cover.state ~= 0 }
    end
    -- a combine that can lay its straw in a swath or chop it (Combine.lua:
    -- TOGGLE_CHOPPER is offered only when both are available)
    local combine = object.spec_combine
    if type(combine) == "table" and type(combine.swath) == "table" and type(combine.chopper) == "table"
        and combine.swath.isAvailable == true and combine.chopper.isAvailable == true then
        out.straw = { swath = combine.isSwathActive == true }
    end
    return out
end

-- Capabilities (specs/0003) -------------------------------------------------
-- What each rig member can do, read from the game's own parts, so a tool
-- the dashboard has never seen gets a button for each thing it does. A part
-- being there isn't enough: spike 0.0.4's census found Foldable on 178 of
-- 196 vehicle types, and trailers, weights and balers with Foldable but no
-- folding part, Cover with no cover. So each needs what the part holds.
-- Names seen in spike 0.0.4 (the spec's Data contract) unless marked.

VehicleState.CAPABILITIES = { "lower", "fold", "turnOn", "tip", "tipSide", "cover", "pipe", "rotate", "bales", "detach" }

-- the game's own "can't now": a boolean and its warning text
local function allowed(object, name, ...)
    if type(object) ~= "table" or type(object[name]) ~= "function" then
        return nil
    end
    local ok, can, why = pcall(object[name], object, ...)
    if not ok or type(can) ~= "boolean" then
        return nil
    end
    return can, type(why) == "string" and why or nil
end

-- whether it has power for its keys, and the game's words when it hasn't:
-- with the engine off, folding, lowering and raising only got "Please start
-- the engine first" (live, 0.8.8 and 0.8.9). getIsPowered (Motorized's; a
-- tool asks its vehicle) is unverified
function VehicleState.powered(object)
    return allowed(object, "getIsPowered")
end

-- a tool that lowers through its own fold: Foldable's middle position
-- (foldMiddleAnimTime, seen in spike 0.0.4 on the rear Samasz XT 390; live
-- in 0.8.7 its joint said it doesn't lower while the game offered Lower)
function VehicleState.foldLowers(object)
    local spec = object.spec_foldable
    return type(spec) == "table" and type(spec.foldMiddleAnimTime) == "number"
end

-- the attacher joint lowers it: the input joint's allowsLowering
-- (unverified), else getAllowsLowering as today, which also says "not now"
-- (a mower folded for transport: false, while it still lowers); or its fold
local function lowers(object, out)
    if VehicleState.foldLowers(object) then
        return true
    end
    local joint = Api.tryCall(object, "getActiveInputAttacherJoint")
    if type(joint) == "table" and type(joint.allowsLowering) == "boolean" then
        return joint.allowsLowering
    end
    return Api.tryCall(object, "getAllowsLowering") ~= false or out.lowered == true
end

-- a trailer's tip side: its index, how many, its name when the game's
-- tipSides entry has one (unverified), else from the tip side key's label
-- ("Tip side (Back)"), which the game shows while the trailer is selected
local function tipSideOf(object, spec)
    local index = type(spec.preferedTipSideIndex) == "number" and spec.preferedTipSideIndex or 1
    local out = { index = index, count = spec.tipSideCount }
    local side = type(spec.tipSides) == "table" and spec.tipSides[index] or nil
    if type(side) == "table" and type(side.name) == "string" and side.name ~= "" then
        out.name = side.name
    else
        local key = VehicleState.liveKey(object, "TOGGLE_TIPSIDE")
        out.name = key ~= nil and key.text ~= nil and key.text:match("%((.+)%)") or nil
    end
    return out
end

-- where a trailer's Tip goes (specs/0003 revision 3): "object" while the
-- game shows I (TOGGLE_TIPSTATE, over something that takes the load),
-- "ground" while it shows Ctrl+I (TOGGLE_TIPSTATE_GROUND, "Unload here");
-- both are active, one shown (spike 0.0.8). Not selected, its keys aren't
-- registered: Dischargeable's getCanDischargeToObject on its current node
-- (true only over the sale point that took the load, spike 0.0.8)
local function tipToOf(object)
    local into = VehicleState.liveKey(object, "TOGGLE_TIPSTATE")
    if into ~= nil and into.shown == true then
        return "object"
    end
    local ground = VehicleState.liveKey(object, "TOGGLE_TIPSTATE_GROUND")
    if ground ~= nil and ground.shown == true then
        return "ground"
    end
    local spec = object.spec_dischargeable
    local node = type(spec) == "table" and spec.currentDischargeNode or nil
    if type(node) == "table" then
        local can = Api.tryCall(object, "getCanDischargeToObject", node)
        if type(can) == "boolean" then
            return can and "object" or "ground"
        end
    end
    return nil
end

-- sets out.can (the capabilities in CAPABILITIES' order), the state each
-- goes with (lowered, unfolded, turnedOn, discharging, tipSide, cover,
-- pipe, plow, bales), and out.canNow[cap] = false with out.whyNot[cap] (the
-- game's own words) for what the game refuses now. depth 0: the vehicle.
function VehicleState.capabilities(object, out, depth)
    local has, canNow, whyNot = {}, {}, {}
    local function refuse(cap, can, why)
        if can == false then
            canNow[cap] = false
            whyNot[cap] = why
        end
    end
    if depth > 0 then
        out.lowered = Api.tryCall(object, "getIsLowered", true) == true
        if lowers(object, out) then
            has.lower = true
            -- it says whether it may lower: raising stays allowed. Through
            -- the fold, getAllowsLowering is always false: Foldable's own
            -- getIsFoldMiddleAllowed (unverified) says
            if not out.lowered then
                refuse("lower", allowed(object, VehicleState.foldLowers(object) and "getIsFoldMiddleAllowed"
                    or "getAllowsLowering"))
            end
            -- either way, it needs power
            if canNow.lower == nil then
                refuse("lower", VehicleState.powered(object))
            end
        end
        has.detach = true
        refuse("detach", allowed(object, "isDetachAllowed"))
    end
    if VehicleState.fold(object, out) then
        has.fold = true
        refuse("fold", allowed(object, "getIsFoldAllowed", Api.tryCall(object, "getToggledFoldDirection") or 1, false))
        -- it needs power too, while getIsFoldAllowed says yes (live, 0.8.8)
        if canNow.fold == nil then
            refuse("fold", VehicleState.powered(object))
        end
    end
    -- getCanBeTurnedOn is also false while folded or with the engine off
    -- (live, 0.8.7); folded, Turn on stays, unavailable, with the game's
    -- warning (Foldable's, unverified)
    local canTurnOn = object.spec_turnOnVehicle ~= nil and Api.tryCall(object, "getCanBeTurnedOn")
    if canTurnOn == false and out.unfolded == false then
        has.turnOn = true
        out.turnedOn = Api.tryCall(object, "getIsTurnedOn") == true
        local why = Api.tryCall(object, "getTurnedOnNotAllowedWarning")
        refuse("turnOn", false, type(why) == "string" and why or nil)
    elseif object.spec_turnOnVehicle ~= nil and canTurnOn ~= false then
        has.turnOn = true
        out.turnedOn = Api.tryCall(object, "getIsTurnedOn") == true
        -- getIsTurnedOnAllowed isn't in FS25; what these answer is unverified
        if Api.tryCall(object, "getCanToggleTurnedOn") == false then
            local why = Api.tryCall(object, "getTurnedOnNotAllowedWarning")
            refuse("turnOn", false, type(why) == "string" and why or nil)
        end
    end
    local trailer = object.spec_trailer
    if type(trailer) == "table" and type(trailer.tipSideCount) == "number" and trailer.tipSideCount >= 1 then
        has.tip = true
        out.tipTo = tipToOf(object)
        if trailer.tipSideCount >= 2 then
            has.tipSide = true
            out.tipSide = tipSideOf(object, trailer)
        end
    end
    has.cover = out.cover ~= nil
    has.pipe = out.pipe ~= nil
    local plow = object.spec_plow
    if type(plow) == "table" and type(plow.rotationPart) == "table" and plow.rotationPart.turnAnimation ~= nil then
        has.rotate = true
        out.plow = { rotated = plow.rotationMax == true }
        if Api.tryCall(object, "getIsPlowRotationAllowed") == false then
            refuse("rotate", false)
        end
    end
    -- the game's own bale count (BaleCounter.lua; its fields are unverified)
    local counter = object.spec_baleCounter
    if type(counter) == "table" then
        has.bales = true
        out.bales = { count = type(counter.sessionCounter) == "number" and counter.sessionCounter or nil,
            total = type(counter.lifetimeCounter) == "number" and counter.lifetimeCounter or nil }
    end
    out.can = {}
    for _, cap in ipairs(VehicleState.CAPABILITIES) do
        if has[cap] then
            out.can[#out.can + 1] = cap
        end
    end
    if next(canNow) ~= nil then
        out.canNow, out.whyNot = canNow, next(whyNot) ~= nil and whyNot or nil
    end
    return out
end

-- The selected tool's keys (specs/0003): each spec's actionEvents, keyed by
-- input action, and the input binding's events[id] with isActive and the
-- game's own label (contextDisplayText). The game registers a tool's keys
-- only while it is selected (spike 0.0.4).

-- an object's registered key for this input action: {action, text, active}
function VehicleState.liveKey(object, action)
    local events = type(g_inputBinding) == "table" and g_inputBinding.events or nil
    if type(events) ~= "table" then
        return nil
    end
    for k, spec in pairs(object) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and type(spec) == "table"
            and type(spec.actionEvents) == "table" then
            local ev = spec.actionEvents[action]
            local e = type(ev) == "table" and ev.actionEventId ~= nil and events[ev.actionEventId] or nil
            if type(e) == "table" then
                return { action = action, text = e.contextDisplayText, active = e.isActive ~= false, spec = k,
                    -- false while the game hides it (spike 0.0.8)
                    shown = e.displayIsVisible }
            end
        end
    end
    return nil
end

-- the input actions a capability's button presses, by the spec that
-- registers them where one action does different things (IMPLEMENT_EXTRA:
-- turn on, a plow's rotate). The all-tools keys, Attach and Detach are the
-- All row's, the column's and every card's; the vehicle's attacher joints'
-- keys (Lower plow, Detach tool) act on its tools, which have their cards.
local KEY_CAPS = {
    LOWER_IMPLEMENT = "lower", IMPLEMENT_EXTRA2 = "fold", TOGGLE_TIPSIDE = "tipSide",
    TOGGLE_TIPSTATE = "tip", TOGGLE_TIPSTATE_GROUND = "tip", TOGGLE_COVER = "cover", TOGGLE_PIPE = "pipe",
    DETACH = "detach", BALE_COUNTER_RESET = "bales",
    IMPLEMENT_EXTRA = { spec_turnOnVehicle = "turnOn", spec_plow = "rotate" },
}
local NOT_A_TOOL_KEY = { FOLD_ALL_IMPLEMENTS = true, TURN_ON_ALL_IMPLEMENTS = true, LOWER_ALL_IMPLEMENTS = true,
    ATTACH = true, DETACH = true }

-- the selected tool's live keys that no capability in `can` covers, each
-- once, by input action: {action, text} ("Allow create fields", "Turn on
-- automatic drop", a modded tool's own). The turn on key never is: Turn on
-- comes and goes with the fold and the engine (live, 0.8.7: "Turn on
-- mower" on a folded mower, which only got the game's warning)
function VehicleState.extraKeys(object, can)
    local events = type(g_inputBinding) == "table" and g_inputBinding.events or nil
    if type(events) ~= "table" then
        return {}
    end
    local covered = {}
    for _, cap in ipairs(can or {}) do
        covered[cap] = true
    end
    local seen, out = {}, {}
    for k, spec in pairs(object) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and k ~= "spec_attacherJoints" and type(spec) == "table"
            and type(spec.actionEvents) == "table" then
            for action, ev in pairs(spec.actionEvents) do
                local e = type(ev) == "table" and ev.actionEventId ~= nil and events[ev.actionEventId] or nil
                local cap = KEY_CAPS[action]
                if type(cap) == "table" then
                    cap = cap[k]
                end
                if type(action) == "string" and type(e) == "table" and e.isActive ~= false
                    and type(e.contextDisplayText) == "string" and e.contextDisplayText ~= ""
                    and not NOT_A_TOOL_KEY[action] and not (cap ~= nil and (covered[cap] or cap == "turnOn"))
                    and not seen[action] then
                    seen[action] = true
                    out[#out + 1] = { action = action, text = e.contextDisplayText }
                end
            end
        end
    end
    table.sort(out, function(a, b) return a.action < b.action end)
    return out
end

-- whether the game has something in reach to attach (its Attach prompt is
-- up): the vehicle's attachableInfo.attachable, else the attach key's label
function VehicleState.attachable(vehicle)
    for _, v in ipairs({ vehicle, VehicleState.rootOf(vehicle) }) do
        local spec = v.spec_attacherJoints
        if type(spec) == "table" and type(spec.attachableInfo) == "table" then
            if spec.attachableInfo.attachable ~= nil then
                return true
            end
            return false
        end
    end
    local key = VehicleState.liveKey(vehicle, "ATTACH")
    return key ~= nil and key.active and type(key.text) == "string" and key.text ~= ""
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

-- the parent's attacher joint at this index, or nil
local function jointAt(parent, jointIndex)
    local spec = parent.spec_attacherJoints
    local joints = type(spec) == "table" and spec.attacherJoints or nil
    local joint = type(joints) == "table" and jointIndex ~= nil and joints[jointIndex] or nil
    return type(joint) == "table" and joint or nil
end

-- "front" or "rear" from the attacher joint, nil when unknown
local function sideOf(parent, jointIndex)
    local joint = jointAt(parent, jointIndex)
    if joint == nil or joint.jointTransform == nil or parent.rootNode == nil
        or localToLocal == nil then
        return nil
    end
    local ok, _, _, z = pcall(localToLocal, joint.jointTransform, parent.rootNode, 0, 0, 0)
    if not ok or type(z) ~= "number" then
        return nil
    end
    return z >= 0 and "front" or "rear"
end

-- Vehicle screen (specs/0002): the coupling's name, the attacher joint's
-- type as the game registered it ("implement", "trailer", "frontloader"):
-- its jointType number, looked up backwards in
-- AttacherJoints.jointTypeNameToInt. Unverified (the spec's spike).
local jointNames, jointNamesOf = {}, nil

local function jointTypeName(parent, jointIndex)
    local registry = type(AttacherJoints) == "table" and AttacherJoints.jointTypeNameToInt or nil
    if type(registry) ~= "table" then
        return nil
    end
    if registry ~= jointNamesOf then
        jointNames, jointNamesOf = {}, registry
        for name, n in pairs(registry) do
            if type(name) == "string" then
                jointNames[n] = name
            end
        end
    end
    local joint = jointAt(parent, jointIndex)
    return joint ~= nil and joint.jointType ~= nil and jointNames[joint.jointType] or nil
end

local MAX_RIG_DEPTH = 6

-- every attached object, depth first: {object, parent, depth, side, joint};
-- a tool on a tool (a loader's bucket) takes its parent's side
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
                out[#out + 1] = { object = object, parent = parent, depth = depth, side = side,
                    joint = jointTypeName(parent, entry.jointDescIndex) }
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
-- active one), or nil; names: one input action, or a list tried in order
function VehicleState.keyTarget(names)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return nil
    end
    for _, name in ipairs(type(names) == "table" and names or { names }) do
        local action = binding.nameActions[name]
        local events = action ~= nil and binding.actionEvents[action] or nil
        if type(events) == "table" then
            for _, event in pairs(events) do
                if type(event) == "table" and event.isActive ~= false and type(event.targetObject) == "table" then
                    return event.targetObject
                end
            end
        end
    end
    return nil
end

-- the implement keys, by the cab's name for them. The Implement screen's:
-- the pipe (O), unloading or tipping (I, else Ctrl+I to the ground, the
-- one the game has live), the cover (N) and lower all (Ctrl+V).
VehicleState.KEYS = {
    lower = "LOWER_IMPLEMENT", fold = "IMPLEMENT_EXTRA2", turnOn = "IMPLEMENT_EXTRA",
    pipe = "TOGGLE_PIPE", unload = { "TOGGLE_TIPSTATE", "TOGGLE_TIPSTATE_GROUND" }, cover = "TOGGLE_COVER",
    lowerAll = "LOWER_ALL_IMPLEMENTS", straw = "TOGGLE_CHOPPER",
}

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
    local head = { name = Api.tryCall(vehicle, "getFullName") or vehicle.typeName, depth = 0 }
    -- a combine works itself: threshing is its turn on
    if vehicle.spec_turnOnVehicle ~= nil then
        head.turnedOn = Api.tryCall(vehicle, "getIsTurnedOn") == true
        head.canTurnOn = true
    end
    -- a combine folds itself too (its ladder, tank extensions): F unfolds it
    if VehicleState.fold(vehicle, head) then
        head.foldable = true
    end
    local rig = { mark(VehicleState.capabilities(vehicle, VehicleState.extras(vehicle, head), 0), vehicle) }
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        local e = mark(VehicleState.extras(node.object, VehicleState.implement(node.object)), node.object)
        VehicleState.capabilities(node.object, e, node.depth)
        -- a joint that lowers it: a mower folded for transport still lowers
        for _, cap in ipairs(e.can) do
            if cap == "lower" then
                e.canLower = true
            end
        end
        e.parent = node.parent.id
        e.depth = node.depth
        e.side = node.side
        e.joint = node.joint
        rig[#rig + 1] = e
    end
    -- the selected one's other keys (specs/0003)
    for i, e in ipairs(rig) do
        if e.selected then
            local object = i == 1 and vehicle or VehicleState.attachedById(vehicle, e.id)
            local keys = object ~= nil and VehicleState.extraKeys(object, e.can) or {}
            if #keys > 0 then
                e.extraKeys = keys
            end
        end
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
