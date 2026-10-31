-- Commands.lua
-- Runs the dashboard's commands (docs/PLAN.md, Controls). The companion
-- writes one file per command, numbered from 1 per game session, with the
-- dashboard's action name (specs/0007; hello says so: commands.actions 2):
--
--     modSettings/FS25_Companion/cmd/<n>.xml
--     <command session="<sessionId>" id="<n>" action="lights.toggle" ref="<companion ref>"/>
--     <command ... action="cruise.set" ref="..." value="23.000"/>   (km/h)
--
-- (a temp file, read back once, then renamed, so it appears whole). Every
-- frame the mod checks whether the next number exists (fileExists costs
-- about 0.1 ms, C0). When it does, it reads it with XMLFile.load, checks the
-- session, the action and its value (Commands.ACTIONS, the one list), runs
-- the action, and answers with a `command_ack` envelope:
--
--     {"id":<n>,"ref":"<companion ref>","action":"lights.toggle","ok":true,"via":"TOGGLE_LIGHTS"}
--     {"id":<n>,"ref":"...","ok":false,"reason":"not in a vehicle"}
--
-- `via` says what ran: the input action's name, or "setter". The caller
-- sends the `cab` topic in the same frame, so the new state reaches the
-- dashboard with the ack. The companion deletes the file once it sees the ack.
--
-- Never io.open(path, "r") here: FS25 opens the file for writing, which
-- empties it (C0).
--
-- Actions run through the input action's own event callbacks, as a key
-- press would (rebinds, mod actions and multiplayer events just work);
-- g_inputBinding.actionEvents is keyed by the action object
-- (nameActions[name]), verified in C0. The implement keys' events belong
-- to the selected implement, so they act on it as the keys do. An action
-- with no active event falls back to the specialization's own setter
-- (FS22 names, guarded). Which one ran is logged once per action.
--
-- Input action names, from the game's inputBinding.xml (C2): fold is
-- IMPLEMENT_EXTRA2 and turn on IMPLEMENT_EXTRA (there is no
-- IMPLEMENT_FOLD), cruise speed is the axis AXIS_CRUISE_CONTROL.

Companion = Companion or {}

local Api = Companion.Api
local VehicleState = Companion.VehicleState

local Commands = {}
Commands.__index = Commands
Companion.Commands = Commands

-- Setters ------------------------------------------------------------------
-- Each returns true, or false and the reason. `implement` is the selected
-- implement for actions that need one.

local function hasBit(mask, bit)
    return math.floor(mask / bit) % 2 == 1
end

local function lightsMask(vehicle)
    local spec = vehicle.spec_lights
    if spec == nil or type(vehicle.setLightsTypesMask) ~= "function" then
        return nil
    end
    return type(spec.lightsTypesMask) == "number" and spec.lightsTypesMask or 0
end

-- lights: off <-> the front lights (light type 0)
local function toggleLights(vehicle)
    local mask = lightsMask(vehicle)
    if mask == nil then
        return false, "no lights"
    end
    vehicle:setLightsTypesMask(mask ~= 0 and 0 or 1)
    return true
end

-- the high beam: light type 3
local function toggleHighBeam(vehicle)
    local mask = lightsMask(vehicle)
    if mask == nil then
        return false, "no lights"
    end
    vehicle:setLightsTypesMask(hasBit(mask, 8) and mask - 8 or mask + 8)
    return true
end

local function toggleBeacon(vehicle)
    local spec = vehicle.spec_lights
    if spec == nil or type(vehicle.setBeaconLightsVisibility) ~= "function" then
        return false, "no beacon"
    end
    vehicle:setBeaconLightsVisibility(not (spec.beaconLightsActive == true))
    return true
end

-- Lights.TURNLIGHT_*: OFF 0, LEFT 1, RIGHT 2, HAZARD 3
local function turnLight(name, default)
    return function(vehicle)
        local spec = vehicle.spec_lights
        if spec == nil or type(vehicle.setTurnLightState) ~= "function" then
            return false, "no turn lights"
        end
        local constants = type(Lights) == "table" and Lights or {}
        local state = type(constants[name]) == "number" and constants[name] or default
        local off = type(constants.TURNLIGHT_OFF) == "number" and constants.TURNLIGHT_OFF or 0
        vehicle:setTurnLightState(spec.turnLightState == state and off or state)
        return true
    end
end

local function toggleEngine(vehicle)
    local on = VehicleState.engineOn(vehicle)
    if on == nil then
        return false, "no engine"
    end
    local method = on and "stopMotor" or "startMotor"
    if type(vehicle[method]) ~= "function" then
        return false, "no engine"
    end
    vehicle[method](vehicle)
    return true
end

local function toggleCruise(vehicle)
    local cruise = VehicleState.cruise(vehicle)
    if cruise == nil or type(vehicle.setCruiseControlState) ~= "function" then
        return false, "no cruise control"
    end
    vehicle:setCruiseControlState(cruise.state == "off" and 1 or 0)
    return true
end

-- The cruise control's one set speed: the one the game holds when cruise
-- control is on. (C2's first try kept a second one for reverse; live, the
-- L90H has none, the Fastrac and the Valtra T195 Active use the main one
-- in reverse, and speedReverse read the same as maxSpeedReverse. The
-- reverse value passes through untouched.)

-- the set speed, km/h (the dashboard's held −/+), clamped to the vehicle's
-- limits
local function cruiseSet(vehicle, _, value)
    local spec = vehicle.spec_drivable
    local cruise = spec ~= nil and spec.cruiseControl or nil
    if type(cruise) ~= "table" or type(vehicle.setCruiseControlMaxSpeed) ~= "function" then
        return false, "no cruise control"
    end
    if type(value) ~= "number" or value ~= value then
        return false, "no speed"
    end
    local max = type(cruise.maxSpeed) == "number" and cruise.maxSpeed or math.huge
    vehicle:setCruiseControlMaxSpeed(math.max(1, math.min(max, value)), cruise.speedReverse)
    return true
end

local function stepped(speed, step, max)
    max = type(max) == "number" and max or math.huge
    return math.max(1, math.min(max, math.floor(speed + 0.5) + step))
end

-- the set speed one step (1 km/h) down or up
local function cruiseStep(step)
    return function(vehicle)
        local spec = vehicle.spec_drivable
        local cruise = spec ~= nil and spec.cruiseControl or nil
        if type(cruise) ~= "table" or type(vehicle.setCruiseControlMaxSpeed) ~= "function" then
            return false, "no cruise control"
        end
        local speed = Api.tryCall(vehicle, "getCruiseControlSpeed")
        if type(speed) ~= "number" then
            speed = cruise.speed
        end
        if type(speed) ~= "number" then
            return false, "no cruise speed"
        end
        vehicle:setCruiseControlMaxSpeed(stepped(speed, step, cruise.maxSpeed), cruise.speedReverse)
        return true
    end
end

-- the selected implement, else the vehicle itself (a combine folds too)
local function toggleFold(vehicle, implement)
    if implement == nil or implement.spec_foldable == nil then
        implement = vehicle
    end
    if type(implement.setFoldState) ~= "function" then
        return false, "can't fold"
    end
    local direction = Api.tryCall(implement, "getToggledFoldDirection")
    if type(direction) ~= "number" then
        return false, "can't fold"
    end
    implement:setFoldState(direction, false)
    return true
end

local function toggleTurnOn(_, implement)
    if implement.spec_turnOnVehicle == nil or type(implement.setIsTurnedOn) ~= "function" then
        return false, "can't turn on"
    end
    implement:setIsTurnedOn(not (Api.tryCall(implement, "getIsTurnedOn") == true))
    return true
end

local function toggleLower(_, implement)
    local attacher = Api.tryCall(implement, "getAttacherVehicle")
    if type(attacher) ~= "table" or type(attacher.handleLowerImplementEvent) ~= "function" then
        return false, "can't lower"
    end
    attacher:handleLowerImplementEvent(implement)
    return true
end

-- Selection (C3) -----------------------------------------------------------
-- The dashboard picks a tool and the game selects it, as G would after
-- enough presses (PLAN.md C3, verified in the selection spike).

-- select the tool (or the tractor) with this id
local function selectTarget(vehicle, _, id)
    local root = VehicleState.rootOf(vehicle)
    if type(root.setSelectedObject) ~= "function" then
        return false, "can't select"
    end
    for _, entry in ipairs(VehicleState.selectables(root)) do
        if entry.vehicle.id == id then
            root:setSelectedObject(entry.object)
            return true
        end
    end
    return false, "not selectable"
end

-- the next (1) or previous (-1) one in the game's order, when G's own
-- action has no event
local function selectStep(step)
    return function(vehicle)
        local root = VehicleState.rootOf(vehicle)
        local list = VehicleState.selectables(root)
        if #list < 2 or type(root.setSelectedObject) ~= "function" then
            return false, "nothing to select"
        end
        local selected = Api.tryCall(root, "getSelectedVehicle")
        local at = 1
        for i, entry in ipairs(list) do
            if entry.vehicle == selected then
                at = i
            end
        end
        root:setSelectedObject(list[(at - 1 + step) % #list + 1].object)
        return true
    end
end

-- detach the tool with this id from what it hangs on
local function detachTarget(vehicle, _, id)
    local object = VehicleState.attachedById(vehicle, id)
    if object == nil then
        return false, "not attached"
    end
    local allowed, why = Api.tryCallAll(object, "isDetachAllowed")
    if allowed == false then
        return false, type(why) == "string" and why or "can't detach now"
    end
    local attacher = Api.tryCall(object, "getAttacherVehicle")
    if type(attacher) ~= "table" or type(attacher.detachImplementByObject) ~= "function" then
        return false, "can't detach"
    end
    attacher:detachImplementByObject(object)
    return true
end

-- Implement screen ---------------------------------------------------------
-- Setters for when the key has no live event, as the game's own key
-- handlers do it (the SDK's gameSource.zip: AttacherJoints, Pipe, Cover).

-- the vehicle and everything on it, the vehicle first
local function rigObjects(vehicle)
    local list = { vehicle }
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        list[#list + 1] = node.object
    end
    return list
end

-- lower or raise every tool together, as Ctrl+V does
local function lowerAll(vehicle)
    local root = VehicleState.rootOf(vehicle)
    if type(root.startAttacherJointCombo) ~= "function" then
        return false, "can't lower all"
    end
    root:startAttacherJointCombo(true)
    return true
end

-- a pipe: out to its next state, else in; nil when it has none
local function pipeOne(object)
    local spec = object.spec_pipe
    if type(spec) ~= "table" or spec.hasMovablePipe ~= true or type(object.setPipeState) ~= "function"
        or type(spec.targetState) ~= "number" or type(spec.numStates) ~= "number" then
        return nil
    end
    local nextState = spec.targetState + 1
    if nextState > spec.numStates then
        nextState = 1
    end
    if Api.tryCall(object, "getIsPipeStateChangeAllowed", nextState) == true then
        object:setPipeState(nextState)
        return true
    elseif nextState ~= 1 and Api.tryCall(object, "getIsPipeStateChangeAllowed", 1) == true then
        object:setPipeState(1)
        return true
    end
    return false, "can't move the pipe now"
end

-- the first pipe in the rig
local function togglePipe(vehicle)
    for _, object in ipairs(rigObjects(vehicle)) do
        local done, reason = pipeOne(object)
        if done ~= nil then
            return done, reason
        end
    end
    return false, "no pipe"
end

-- a combine's straw: swath or chopper, where the crop has a windrow
local function toggleStraw(vehicle)
    for _, object in ipairs(rigObjects(vehicle)) do
        local spec = object.spec_combine
        if type(spec) == "table" and type(object.setIsSwathActive) == "function" then
            if type(spec.swath) ~= "table" or not spec.swath.isAvailable
                or type(spec.chopper) ~= "table" or not spec.chopper.isAvailable then
                return false, "no straw choice"
            end
            object:setIsSwathActive(not spec.isSwathActive)
            return true
        end
    end
    return false, "no combine"
end

-- a cover: on to its next state (0 closed); nil when it has none
local function coverOne(object)
    local spec = object.spec_cover
    if type(spec) ~= "table" or spec.hasCovers ~= true or type(object.setCoverState) ~= "function"
        or type(spec.state) ~= "number" or type(spec.covers) ~= "table" then
        return nil
    end
    local nextState = spec.state + 1
    if nextState > #spec.covers then
        nextState = 0
    end
    if Api.tryCall(object, "getIsNextCoverStateAllowed", nextState) == false then
        return false, "can't move the cover now"
    end
    object:setCoverState(nextState)
    return true
end

-- the first cover in the rig
local function toggleCover(vehicle)
    for _, object in ipairs(rigObjects(vehicle)) do
        local done, reason = coverOne(object)
        if done ~= nil then
            return done, reason
        end
    end
    return false, "no cover"
end

-- Vehicle page's cards (specs/0003) -----------------------------------------
-- A command with a tool's id does what a player does: it selects that tool,
-- presses the action's key and puts the selection back, so every game rule
-- applies. The game registers a tool's keys only on the frames after it is
-- selected (spike 0.0.4), so this runs over a few frames as a job; a key
-- the tool already has live is pressed at once. A key that never comes
-- falls back to the specialization's setter, where there is one.

-- frames to wait for the selected tool's key
Commands.KEY_WAIT_FRAMES = 30

-- the rig member with this id and its depth: the vehicle, or something attached
local function memberById(vehicle, id)
    if vehicle.id == id then
        return vehicle, 0
    end
    return VehicleState.attachedById(vehicle, id), 1
end

-- what a member can do, and whether now (VehicleState.capabilities)
local function capsOf(object, depth)
    return VehicleState.capabilities(object, VehicleState.extras(object, {}), depth)
end

local function hasCap(e, cap)
    for _, c in ipairs(e.can or {}) do
        if c == cap then
            return true
        end
    end
    return false
end

-- the rig in driving order: rear tools (farthest first), the vehicle,
-- front tools, each {object, depth}
local function drivingOrder(vehicle)
    local rear, front = {}, {}
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        local list = node.side == "front" and front or rear
        list[#list + 1] = { object = node.object, depth = node.depth }
    end
    local out = {}
    for i = #rear, 1, -1 do
        out[#out + 1] = rear[i]
    end
    out[#out + 1] = { object = vehicle, depth = 0 }
    for _, m in ipairs(front) do
        out[#out + 1] = m
    end
    return out
end

-- the next tip side, as the game's key steps it (Trailer:setPreferedTipSide,
-- FS22's name, unverified)
local function nextTipSide(_, object)
    local spec = object.spec_trailer
    if type(spec) ~= "table" or type(object.setPreferedTipSide) ~= "function" or type(spec.tipSideCount) ~= "number" then
        return false, "can't change the tip side"
    end
    object:setPreferedTipSide((spec.preferedTipSideIndex or 1) % spec.tipSideCount + 1)
    return true
end

-- turn the plow over (Plow:setRotationMax, FS22's name, unverified)
local function rotatePlow(_, object)
    local spec = object.spec_plow
    if type(spec) ~= "table" or type(object.setRotationMax) ~= "function" then
        return false, "can't rotate"
    end
    object:setRotationMax(not spec.rotationMax)
    return true
end

-- each one-tool action: the capability it needs, its keys, its setter
-- (lower: the key is the tool's own, or the one it hangs on acts on it
-- while it's selected, as the game's attacher joints do)
local AIMED = {
    LOWER_IMPLEMENT = { cap = "lower", inputs = { "LOWER_IMPLEMENT" }, fallback = toggleLower, attacherKey = true },
    FOLD_IMPLEMENT = { cap = "fold", inputs = { "IMPLEMENT_EXTRA2" }, fallback = toggleFold },
    TURN_ON_IMPLEMENT = { cap = "turnOn", inputs = { "IMPLEMENT_EXTRA" }, fallback = toggleTurnOn },
    TOGGLE_DISCHARGE = { cap = "tip", inputs = { "TOGGLE_TIPSTATE", "TOGGLE_TIPSTATE_GROUND" } },
    TOGGLE_COVER = { cap = "cover", inputs = { "TOGGLE_COVER" }, fallback = function(_, o) return coverOne(o) end },
    TOGGLE_PIPE = { cap = "pipe", inputs = { "TOGGLE_PIPE" }, fallback = function(_, o) return pipeOne(o) end },
    TOGGLE_TIPSIDE = { cap = "tipSide", inputs = { "TOGGLE_TIPSIDE" }, fallback = nextTipSide },
    ROTATE_PLOW = { cap = "rotate", inputs = { "IMPLEMENT_EXTRA" }, fallback = rotatePlow },
    RESET_BALE_COUNTER = { cap = "bales", inputs = { "BALE_COUNTER_RESET" } },
}

-- the first of these inputs with an active event on this object, one the
-- game shows first: a trailer's two tip keys are both active, and the game
-- shows one at a time, hiding the other (displayIsVisible false; spike
-- 0.0.8), which then does nothing (specs/0003 revision 3)
local function liveInputFor(object, inputs)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return nil
    end
    for _, shownOnly in ipairs({ true, false }) do
        for _, name in ipairs(inputs) do
            local action = binding.nameActions[name]
            local events = action ~= nil and binding.actionEvents[action] or nil
            if type(events) == "table" then
                for _, event in pairs(events) do
                    if type(event) == "table" and event.isActive ~= false and event.targetObject == object
                        and type(event.callback) == "function"
                        and not (shownOnly and event.displayIsVisible == false) then
                        return name
                    end
                end
            end
        end
    end
    return nil
end

local function nameOf(object)
    return Api.tryCall(object, "getFullName") or object.typeName or "tool"
end

-- one step of a job: this action on this tool, or why not (the game's own
-- words where it has them)
local function stepFor(object, depth, aim)
    local e = capsOf(object, depth)
    if not hasCap(e, aim.cap) then
        return nil, "can't " .. aim.cap
    end
    if e.canNow ~= nil and e.canNow[aim.cap] == false then
        return nil, e.whyNot ~= nil and e.whyNot[aim.cap] or "not allowed now"
    end
    return { object = object, aim = aim }
end

-- a job over these steps; the game's selection now is put back after
local function newJob(vehicle, steps, refused)
    local root = VehicleState.rootOf(vehicle)
    local selected = Api.tryCall(root, "getSelectedVehicle")
    local restore = nil
    for _, entry in ipairs(VehicleState.selectables(root)) do
        if entry.vehicle == selected then
            restore = entry.object
        end
    end
    return { vehicle = vehicle, root = root, steps = steps, i = 1, phase = "start", frames = 0,
        restore = restore, changed = false, refused = refused or {}, done = 0 }
end

-- presses an input action's events (defined with the actions below)
local runInputAction

-- Checked answers (specs/0003 revision 2) ------------------------------------
-- A fold, lower or turn on answers ok only once each tool started moving
-- the way the button asked, read every frame for up to CHECK_MS of game
-- time after the last press; else it names what didn't move, with the
-- game's words where it has them. Starting to move is enough: a fold
-- takes seconds, and the cab topic shows the rest.
Commands.CHECK_MS = 1000
-- the longest a check waits in all, whatever the game is still doing
Commands.CHECK_CAP_MS = 8000
-- the most frames the check waits while game time stands still (a paused game)
Commands.CHECK_MAX_FRAMES = 240

-- the tractor's attacher joint combo is still running: the game's Lower
-- all works through its joints one after another, the last when it ends,
-- `duration` after the press (2000 ms on the T7.300 and the Valtra S 286;
-- spike 0.0.7). Fields seen live in spike 0.0.7.
local function comboRunning(root)
    local spec = type(root) == "table" and root.spec_attacherJoints or nil
    local combos = type(spec) == "table" and spec.attacherJointCombos or nil
    return type(combos) == "table" and combos.isRunning == true
end

local CHECKED = { lower = true, fold = true, turnOn = true, tip = true }

-- what the check reads of a tool; the fold's time and direction seen live
-- (spikes 0.0.5, 0.0.6: the time grows while folding, foldMoveDirection 1
-- folding, -1 unfolding, 0 still)
local function readings(object)
    local fold = object.spec_foldable
    return {
        lowered = Api.tryCall(object, "getIsLowered", true) == true,
        on = Api.tryCall(object, "getIsTurnedOn") == true,
        unfolded = Api.tryCall(object, "getIsUnfolded"),
        foldTime = Api.tryCall(object, "getFoldAnimTime") or (type(fold) == "table" and fold.foldAnimTime or nil),
        foldDirection = type(fold) == "table" and fold.foldMoveDirection or nil,
        -- revision 3: Tip, as the cab reads it
        discharging = VehicleState.extras(object, {}).discharging,
    }
end

-- the fold moves toward folded (sign 1) or unfolded (-1)
local function foldMoves(before, now, sign)
    if now.foldDirection == sign then
        return true
    end
    return type(before.foldTime) == "number" and type(now.foldTime) == "number"
        and (now.foldTime - before.foldTime) * sign > 0.001
end

local function moved(t, now)
    if t.kind == "fold" then
        if type(now.unfolded) == "boolean" and now.unfolded == not t.want then
            return true
        end
        return foldMoves(t.before, now, t.want and 1 or -1)
    elseif t.kind == "lower" then
        if now.lowered == t.want then
            return true
        end
        -- through its fold: lowering unfolds toward working, raising folds
        -- up, and getIsLowered stays true while it rises (spike 0.0.6)
        return VehicleState.foldLowers(t.object) and foldMoves(t.before, now, t.want and -1 or 1)
    elseif t.kind == "tip" then
        return now.discharging == t.want
    end
    return now.on == t.want
end

-- what to check on a tool: kind (lower, fold, turnOn), want (lowered,
-- folded, on), its readings now
local function checkOf(object, depth, kind, want)
    return { object = object, depth = depth, kind = kind, want = want, before = readings(object) }
end

-- the asked state of a tool's one button, from the state its label shows
local function wantOf(e, kind)
    if kind == "lower" then
        return e.lowered ~= true
    elseif kind == "fold" then
        return e.unfolded ~= false
    elseif kind == "tip" then
        return e.discharging ~= true
    end
    return e.turnedOn ~= true
end

-- whether a key has a live event on any object
local function hasLive(name)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return false
    end
    local action = binding.nameActions[name]
    local events = action ~= nil and binding.actionEvents[action] or nil
    for _, event in pairs(type(events) == "table" and events or {}) do
        if type(event) == "table" and event.isActive ~= false and type(event.callback) == "function" then
            return true
        end
    end
    return false
end

-- a one-tool command: its job, or why not; fold, lower and turn on checked
local function aimed(vehicle, aim, id)
    local object, depth = memberById(vehicle, id)
    if object == nil then
        return nil, "not attached"
    end
    local step, reason = stepFor(object, depth, aim)
    if step == nil then
        return nil, reason
    end
    local job = newJob(vehicle, { step })
    if CHECKED[aim.cap] then
        job.check = { checkOf(object, depth, aim.cap, wantOf(capsOf(object, depth), aim.cap)) }
    end
    return job
end

-- Tip all and Uncover all: the one-tool command on each that has the
-- capability and isn't there yet (value 1: tipping, open; 0: stopped,
-- closed), in driving order; Tip all checked (revision 3)
local function eachTool(aim, isThere)
    return function(vehicle, value)
        local want = value ~= 0
        local steps, refused, check = {}, {}, {}
        for _, m in ipairs(drivingOrder(vehicle)) do
            local e = capsOf(m.object, m.depth)
            if hasCap(e, aim.cap) and isThere(e) ~= want then
                local step, reason = stepFor(m.object, m.depth, aim)
                if step ~= nil then
                    steps[#steps + 1] = step
                    check[#check + 1] = checkOf(m.object, m.depth, aim.cap, want)
                else
                    refused[#refused + 1] = nameOf(m.object) .. ": " .. reason
                end
            end
        end
        local job = newJob(vehicle, steps, refused)
        if CHECKED[aim.cap] and #check > 0 then
            job.check = check
        end
        return job
    end
end

-- Fold all and Turn on all, when the game's key has no event: as the
-- game's key, fold every tool while one is unfolded (spike 0.0.5), else
-- unfold them; turn every one on, or off once they all are
local function foldAll(vehicle)
    local tools, unfold = {}, true
    for _, m in ipairs(drivingOrder(vehicle)) do
        local e = capsOf(m.object, m.depth)
        if hasCap(e, "fold") and type(m.object.setFoldState) == "function" then
            tools[#tools + 1] = { object = m.object, unfolded = e.unfolded == true }
            unfold = unfold and e.unfolded ~= true
        end
    end
    if #tools == 0 then
        return false, "nothing folds"
    end
    for _, t in ipairs(tools) do
        local direction = Api.tryCall(t.object, "getToggledFoldDirection")
        if t.unfolded ~= unfold and type(direction) == "number" then
            t.object:setFoldState(direction, false)
        end
    end
    return true
end

local function turnOnAll(vehicle)
    local tools, on = {}, false
    for _, m in ipairs(drivingOrder(vehicle)) do
        local e = capsOf(m.object, m.depth)
        -- not one the game won't turn on now (folded)
        if hasCap(e, "turnOn") and type(m.object.setIsTurnedOn) == "function"
            and not (e.canNow ~= nil and e.canNow.turnOn == false) then
            tools[#tools + 1] = { object = m.object, on = e.turnedOn == true }
            on = on or e.turnedOn ~= true
        end
    end
    if #tools == 0 then
        return false, "nothing turns on"
    end
    for _, t in ipairs(tools) do
        if t.on ~= on then
            t.object:setIsTurnedOn(on)
        end
    end
    return true
end

-- a step that presses one of the game's all-tools keys, else a setter
local function allKeyStep(name, setter)
    return { run = function(job)
        if runInputAction(name) > 0 then
            return name
        end
        if setter ~= nil then
            local done, why = setter(job.vehicle)
            if done then
                return "setter"
            end
            return nil, why
        end
        return nil, "not available now"
    end }
end

-- Lower all: the game's own key once (specs/0003 revision 2; spikes 0.0.5
-- and 0.0.6: the mod's press acts as Ctrl+V), lowering every tool while
-- one is raised, else raising them all, checked. With no live key, each
-- tool's Lower toward that state, in driving order, the selection put
-- back; no tool's Lower could act: the game's combo. Nil when no tool has
-- Lower (a combine's header): the key, else its combo, unchecked.
local function lowerAllJob(vehicle)
    local tools, lower = {}, false
    for _, m in ipairs(drivingOrder(vehicle)) do
        local e = capsOf(m.object, m.depth)
        if hasCap(e, "lower") then
            tools[#tools + 1] = { object = m.object, depth = m.depth, lowered = e.lowered == true }
            lower = lower or e.lowered ~= true
        end
    end
    if #tools == 0 then
        return nil
    end
    local check = {}
    for _, t in ipairs(tools) do
        if t.lowered ~= lower then
            check[#check + 1] = checkOf(t.object, t.depth, "lower", lower)
        end
    end
    if hasLive("LOWER_ALL_IMPLEMENTS") then
        local job = newJob(vehicle, { allKeyStep("LOWER_ALL_IMPLEMENTS") })
        job.check = check
        return job
    end
    local steps, refused, checked = {}, {}, {}
    for _, t in ipairs(tools) do
        if t.lowered ~= lower then
            local step, reason = stepFor(t.object, t.depth, AIMED.LOWER_IMPLEMENT)
            if step ~= nil then
                steps[#steps + 1] = step
                checked[#checked + 1] = checkOf(t.object, t.depth, "lower", lower)
            else
                refused[#refused + 1] = nameOf(t.object) .. ": " .. reason
            end
        end
    end
    local job = newJob(vehicle, steps, refused)
    job.check = checked
    job.lastResort = function(v) return lowerAll(v) end
    return job
end

-- Turn on all: the game's key once, else every tool's setter; turning
-- every one on while one is off, else all off; checked. Nil with no tool
-- that turns on (the key, unchecked, as before).
local function turnOnAllJob(vehicle)
    local tools, on = {}, false
    for _, m in ipairs(drivingOrder(vehicle)) do
        local e = capsOf(m.object, m.depth)
        if hasCap(e, "turnOn") then
            tools[#tools + 1] = { object = m.object, depth = m.depth, on = e.turnedOn == true }
            on = on or e.turnedOn ~= true
        end
    end
    if #tools == 0 then
        return nil
    end
    local job = newJob(vehicle, { allKeyStep("TURN_ON_ALL_IMPLEMENTS", turnOnAll) })
    job.check = {}
    for _, t in ipairs(tools) do
        if t.on ~= on then
            job.check[#job.check + 1] = checkOf(t.object, t.depth, "turnOn", on)
        end
    end
    return job
end

-- Fold all: the game's own key, once. Live (0.8.7) it folds every tool, but
-- not one lowered on its joint ("Folding is not allowed while the tool is
-- lowered."); one that lowers through its fold it raises itself. So, when
-- folding, those are raised first (each one's Lower, as its card does) and
-- the key waits until the game lets them fold (at most SETTLE_FRAMES).
-- Pressed on the last one raised (it's selected then), else the selected
-- tool if it folds, else the first; no key: every tool's setter.
local FOLD_ALL = { cap = "fold", inputs = { "FOLD_ALL_IMPLEMENTS" }, fallback = function(vehicle) return foldAll(vehicle) end }

local function foldAllJob(vehicle)
    local selected = Api.tryCall(VehicleState.rootOf(vehicle), "getSelectedVehicle")
    local tools, folding, at = {}, false, nil
    for _, m in ipairs(drivingOrder(vehicle)) do
        local e = capsOf(m.object, m.depth)
        if hasCap(e, "fold") then
            tools[#tools + 1] = { object = m.object, depth = m.depth, e = e }
            -- the game's key folds while one is unfolded (spike 0.0.5)
            folding = folding or e.unfolded == true
            if m.object == selected or at == nil then
                at = m.object
            end
        end
    end
    if #tools == 0 then
        return newJob(vehicle, {}, { "nothing folds" })
    end
    local steps, raised, blocked = {}, {}, {}
    for _, t in ipairs(tools) do
        local e = t.e
        if folding and e.lowered == true and hasCap(e, "lower") and e.canNow ~= nil and e.canNow.fold == false
            and e.canNow.lower ~= false and not VehicleState.foldLowers(t.object) then
            steps[#steps + 1] = { object = t.object, aim = AIMED.LOWER_IMPLEMENT, quiet = true }
            raised[#raised + 1] = t
            at = t.object
        elseif e.canNow ~= nil and e.canNow.fold == false then
            blocked[#blocked + 1] = e.whyNot ~= nil and e.whyNot.fold or "not allowed now"
        end
    end
    -- none the game lets fold (the engine off): its words, nothing pressed
    if #blocked == #tools then
        return newJob(vehicle, {}, { blocked[1] })
    end
    steps[#steps + 1] = { object = at, aim = FOLD_ALL, ready = function()
        for _, t in ipairs(raised) do
            local e = capsOf(t.object, t.depth)
            if e.canNow ~= nil and e.canNow.fold == false then
                return false
            end
        end
        return true
    end }
    local job = newJob(vehicle, steps)
    job.check = {}
    for _, t in ipairs(tools) do
        if (folding and t.e.unfolded == true) or (not folding and t.e.unfolded == false) then
            job.check[#job.check + 1] = checkOf(t.object, t.depth, "fold", folding)
        end
    end
    return job
end

-- the selected tool's other key (VehicleState.extraKeys), by its number in
-- that list; returns the input action to press on it
local function selectedKey(vehicle, index)
    local root = VehicleState.rootOf(vehicle)
    local selected = Api.tryCall(root, "getSelectedVehicle")
    if type(selected) ~= "table" then
        return nil, "nothing selected"
    end
    local depth = selected == vehicle and 0 or 1
    local keys = VehicleState.extraKeys(selected, capsOf(selected, depth).can)
    local key = type(index) == "number" and keys[index] or nil
    if key == nil then
        return nil, "no such key"
    end
    return selected, key.action
end

-- Attach: only while the game has something in reach (its prompt is up)
local function attachInReach(vehicle)
    if VehicleState.attachable(vehicle) then
        return true
    end
    return false, "nothing in reach"
end

-- Lower all needs power: with the engine off lowering only got the game's
-- "Please start the engine first" (live, 0.8.9); one answer for all
local function powered(vehicle)
    local can, why = VehicleState.powered(VehicleState.rootOf(vehicle))
    if can == false then
        return false, why or "not allowed now"
    end
    return true
end

-- Actions ------------------------------------------------------------------
-- The actions a command may run, by the dashboard's name (specs/0007): the
-- one list. Anything else is refused, and so is a value that doesn't fit.
--   inputs     input actions tried in order, the first with an active
--              event wins; or function(vehicle, implement) -> list
--   value      the input value passed to the callbacks (default 1)
--   direct     a setter tried before the inputs (exact single steps)
--   fallback   a setter tried when no input event ran
--   implement  needs a selected implement
--   when       function(vehicle) -> ok, reason: refused unless ok
--   aim        with a tool's id (specs/0003): select it, press the key, put
--              the selection back (AIMED); aimOnly: the selected tool's id
--              when the command has none
--   job        function(vehicle, value) -> a job over several tools
--   key        the selected tool's other key, by its number in extraKeys
--   values     { min, max }: the command's number and its range; without
--              it the command carries none
--   optional   the number may be left out (a tool's id: the key's own tool)
local TOOL_ID = { 0, 2 ^ 31 }

Commands.ACTIONS = {
    ["lights.toggle"] = { inputs = { "TOGGLE_LIGHTS" }, fallback = toggleLights },
    ["highBeam.toggle"] = { inputs = { "TOGGLE_HIGH_BEAM_LIGHT" }, fallback = toggleHighBeam },
    ["beacon.toggle"] = { inputs = { "TOGGLE_BEACON_LIGHTS" }, fallback = toggleBeacon },
    ["hazard.toggle"] = { inputs = { "TOGGLE_TURNLIGHT_HAZARD" }, fallback = turnLight("TURNLIGHT_HAZARD", 3) },
    ["turnLeft.toggle"] = { inputs = { "TOGGLE_TURNLIGHT_LEFT" }, fallback = turnLight("TURNLIGHT_LEFT", 1) },
    ["turnRight.toggle"] = { inputs = { "TOGGLE_TURNLIGHT_RIGHT" }, fallback = turnLight("TURNLIGHT_RIGHT", 2) },
    ["engine.toggle"] = { inputs = { "TOGGLE_MOTOR_STATE" }, fallback = toggleEngine },
    ["cruise.toggle"] = { inputs = { "TOGGLE_CRUISE_CONTROL" }, fallback = toggleCruise },
    ["cruise.down"] = { direct = cruiseStep(-1), inputs = { "AXIS_CRUISE_CONTROL" }, value = -1 },
    ["cruise.up"] = { direct = cruiseStep(1), inputs = { "AXIS_CRUISE_CONTROL" }, value = 1 },
    -- an absolute set speed in km/h: the dashboard's −/+ while held
    ["cruise.set"] = { direct = cruiseSet, values = { 1, 250 } },
    ["ai.toggle"] = { inputs = { "TOGGLE_AI" } },
    -- without an id: the tool the key acts on, as in C2
    ["implement.lower"] = { implement = true, inputs = { "LOWER_IMPLEMENT" }, fallback = toggleLower,
        aim = AIMED.LOWER_IMPLEMENT, values = TOOL_ID, optional = true },
    ["implement.fold"] = { inputs = { "IMPLEMENT_EXTRA2" }, fallback = toggleFold, aim = AIMED.FOLD_IMPLEMENT,
        values = TOOL_ID, optional = true },
    ["implement.turnOn"] = { implement = true, inputs = { "IMPLEMENT_EXTRA" }, fallback = toggleTurnOn,
        aim = AIMED.TURN_ON_IMPLEMENT, values = TOOL_ID, optional = true },
    -- Attach (specs/0003): the attach key (Q), only while the game has
    -- something in reach; detaching is each card's Detach. (C2's first try
    -- ran DETACH for an attached implement, which isn't what Q does.)
    ["hitch.toggle"] = { when = attachInReach, inputs = { "ATTACH" } },
    -- C3: the value is the tool's id (the cab's rig)
    ["implement.select"] = { direct = selectTarget, values = TOOL_ID },
    -- G and its other way
    ["implement.next"] = { inputs = { "SWITCH_IMPLEMENT" }, fallback = selectStep(1) },
    ["implement.previous"] = { inputs = { "SWITCH_IMPLEMENT_BACK" }, fallback = selectStep(-1) },
    ["implement.detach"] = { direct = detachTarget, values = TOOL_ID },
    -- the Implement screen: Ctrl+V, O, I (else Ctrl+I, to the ground) and N
    ["implement.lowerAll"] = { when = powered, job = lowerAllJob, inputs = { "LOWER_ALL_IMPLEMENTS" },
        fallback = lowerAll },
    ["implement.pipe"] = { inputs = { "TOGGLE_PIPE" }, fallback = togglePipe, aim = AIMED.TOGGLE_PIPE,
        values = TOOL_ID, optional = true },
    ["implement.unload"] = { inputs = { "TOGGLE_TIPSTATE", "TOGGLE_TIPSTATE_GROUND" }, aim = AIMED.TOGGLE_DISCHARGE,
        values = TOOL_ID, optional = true },
    ["implement.cover"] = { inputs = { "TOGGLE_COVER" }, fallback = toggleCover, aim = AIMED.TOGGLE_COVER,
        values = TOOL_ID, optional = true },
    -- the Vehicle page's cards (specs/0003): one tool's tip side, a plow's
    -- rotate, the bale counter's reset; the selected tool's other keys
    ["implement.tipSide"] = { aim = AIMED.TOGGLE_TIPSIDE, aimOnly = true, values = TOOL_ID, optional = true },
    ["implement.rotate"] = { aim = AIMED.ROTATE_PLOW, aimOnly = true, values = TOOL_ID, optional = true },
    ["implement.baleReset"] = { aim = AIMED.RESET_BALE_COUNTER, aimOnly = true, values = TOOL_ID, optional = true },
    ["implement.key"] = { key = true, values = { 1, 64 } },
    -- the All row: the game's own keys, else every tool's setter (fold all
    -- raises what's lowered first); tip and cover all act on each in turn
    -- (value 1: tip, open; 0: stop, close)
    ["implement.foldAll"] = { job = foldAllJob },
    ["implement.turnOnAll"] = { job = turnOnAllJob, inputs = { "TURN_ON_ALL_IMPLEMENTS" }, fallback = turnOnAll },
    ["implement.tipAll"] = { job = eachTool(AIMED.TOGGLE_DISCHARGE, function(e) return e.discharging == true end),
        values = { 0, 1 } },
    ["implement.coverAll"] = { job = eachTool(AIMED.TOGGLE_COVER, function(e) return e.cover ~= nil and e.cover.open == true end),
        values = { 0, 1 } },
    -- the Harvester screen: straw swath or chopper (the game's TOGGLE_CHOPPER)
    ["implement.straw"] = { inputs = { "TOGGLE_CHOPPER" }, fallback = toggleStraw },
}

-- whether the command's number fits its action
local function valueFits(spec, value)
    if spec.values == nil then
        return value == nil
    end
    if value == nil then
        return spec.optional == true
    end
    -- value ~= value: NaN
    return value == value and value >= spec.values[1] and value <= spec.values[2]
end

local ATTRIBUTES = { "session", "id", "action", "ref", "value" }

function Commands.new(dir, sessionId, log)
    local self = setmetatable({}, Commands)
    self.dir = dir
    self.sessionId = sessionId
    self.log = log or print
    self.nextId = 1
    self.failing = false
    -- "<action> via <what>" already logged
    self.logged = {}
    if createFolder ~= nil then
        pcall(createFolder, dir)
    end
    return self
end

-- for hello: where the companion writes, which number the mod reads next
-- (a companion that starts mid-session continues from there), and that the
-- files name the dashboard's actions (actions 2, specs/0007)
function Commands:info()
    return { dir = self.dir, next = self.nextId, actions = 2 }
end

function Commands:path(id)
    return string.format("%s%d.xml", self.dir, id)
end

local function exists(path)
    if fileExists == nil then
        return false
    end
    local ok, found = pcall(fileExists, path)
    return ok and found == true
end

local function readCommand(path)
    if XMLFile == nil or XMLFile.load == nil then
        return nil, "no XMLFile"
    end
    local xml = XMLFile.load("companionCommand", path)
    if xml == nil then
        return nil, "unreadable command file"
    end
    local out = {}
    for _, name in ipairs(ATTRIBUTES) do
        out[name] = xml:getString("command#" .. name)
    end
    xml:delete()
    return out
end

-- the active action events' callbacks, called as a key press would:
-- callback(target, actionName, inputValue, callbackState, isAnalog,
-- isMouse, deviceCategory, binding); with target, only that object's.
-- Returns how many ran.
function runInputAction(name, value, target)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return 0
    end
    local action = binding.nameActions[name]
    local events = action ~= nil and binding.actionEvents[action] or nil
    if type(events) ~= "table" then
        return 0
    end
    local called = 0
    for _, event in pairs(events) do
        if type(event) == "table" and type(event.callback) == "function" and event.isActive ~= false
            and (target == nil or event.targetObject == target) then
            local ok = pcall(event.callback, event.targetObject, name, value or 1, event.callbackState,
                false, false, nil, nil)
            if ok then
                called = called + 1
            end
        end
    end
    return called
end

-- returns ok, reason, via, or a job (specs/0003) as the fourth; value: the
-- command's number, if it has one
local function run(actionName, value)
    local spec = Commands.ACTIONS[actionName]
    if spec == nil then
        return false, "action not allowed"
    end
    if not valueFits(spec, value) then
        return false, "value not allowed"
    end
    local vehicle = Api.controlledVehicle()
    if vehicle == nil then
        return false, "not in a vehicle"
    end
    if spec.when ~= nil then
        local ok, why = spec.when(vehicle)
        if not ok then
            return false, why
        end
    end
    if spec.aim ~= nil and (value ~= nil or spec.aimOnly) then
        if value == nil then
            local selected = Api.tryCall(VehicleState.rootOf(vehicle), "getSelectedVehicle")
            value = type(selected) == "table" and selected.id or nil
        end
        local job, why = aimed(vehicle, spec.aim, value)
        if job == nil then
            return false, why
        end
        return nil, nil, nil, job
    end
    -- a job, unless it has none for this rig (then as below)
    local job = spec.job ~= nil and spec.job(vehicle, value) or nil
    if job ~= nil then
        return nil, nil, nil, job
    end
    if spec.key then
        local object, action = selectedKey(vehicle, value)
        if object == nil then
            return false, action
        end
        if runInputAction(action, 1, object) > 0 then
            return true, nil, action
        end
        return false, "not available now"
    end
    local implement = VehicleState.selectedImplement(vehicle)
    if spec.implement and implement == nil then
        return false, "no implement"
    end
    local reason
    if spec.direct ~= nil then
        local done
        done, reason = spec.direct(vehicle, implement, value)
        if done then
            return true, nil, "setter"
        end
    end
    local inputs = spec.inputs
    if type(inputs) == "function" then
        inputs = inputs(vehicle, implement)
    end
    for _, name in ipairs(inputs or {}) do
        if runInputAction(name, spec.value) > 0 then
            return true, nil, name
        end
    end
    if spec.fallback ~= nil then
        local done
        done, reason = spec.fallback(vehicle, implement)
        if done then
            return true, nil, "setter"
        end
    end
    return false, reason or "not available now"
end

-- the selectable entry for this object, to select it
local function selectableFor(root, object)
    for _, entry in ipairs(VehicleState.selectables(root)) do
        if entry.vehicle == object then
            return entry.object
        end
    end
    return nil
end

-- the step's key on its own tool, if the tool has it live, else (lower)
-- the key of what it hangs on while the tool is selected: its name
local function press(step, root)
    local targets = { step.object }
    if step.aim.attacherKey and Api.tryCall(root, "getSelectedVehicle") == step.object then
        targets[#targets + 1] = Api.tryCall(step.object, "getAttacherVehicle")
    end
    for _, target in ipairs(targets) do
        local name = type(target) == "table" and liveInputFor(target, step.aim.inputs) or nil
        if name ~= nil and runInputAction(name, 1, target) > 0 then
            return name
        end
    end
    return nil
end

-- frames a step with `ready` waits for it before its key (fold all, for
-- what it raised first: lowering takes about a second)
Commands.SETTLE_FRAMES = 120

-- a step's key or setter acted: the ack names it, unless the step only
-- prepares the next (`quiet`: fold all's raising)
local function acted(job, step, via)
    job.done = job.done + 1
    if job.via == nil or (job.viaQuiet and not step.quiet) then
        job.via, job.viaQuiet = via, step.quiet == true
    end
end

-- a step that can't press its key: the setter, else refused
local function giveUp(job, step, why)
    if step.aim.fallback ~= nil then
        local done, reason = step.aim.fallback(job.vehicle, step.object)
        if done then
            acted(job, step, "setter")
            return
        end
        why = reason or why
    end
    job.refused[#job.refused + 1] = #job.steps > 1 and (nameOf(step.object) .. ": " .. why) or why
end

-- one frame of a job: press the keys that are live, select the next tool
-- and wait for its key; at the end put the selection back. Returns the
-- ack's fields once done.
-- the check's frame: true while a tool may still start moving. The 1 s
-- counts from the press, or from the end of the tractor's combo while it
-- runs; at most CHECK_CAP_MS in all, or CHECK_MAX_FRAMES while game time
-- stands still
local function checking(job)
    local now = type(g_time) == "number" and g_time or nil
    if job.checkFrames == nil then
        job.checkStart, job.checkFrom, job.checkFrames, job.stalled = now, now, 0, 0
    end
    job.checkFrames = job.checkFrames + 1
    if now == nil or now == job.lastNow then
        job.stalled = job.stalled + 1
    end
    job.lastNow = now
    local waiting = false
    for _, t in ipairs(job.check) do
        if not t.moved then
            t.moved = moved(t, readings(t.object))
            waiting = waiting or not t.moved
        end
    end
    if not waiting then
        return false
    end
    if comboRunning(job.root) then
        job.checkFrom = now
    end
    local timeUp = (now ~= nil and job.checkFrom ~= nil and now - job.checkFrom >= Commands.CHECK_MS)
        or (now ~= nil and job.checkStart ~= nil and now - job.checkStart >= Commands.CHECK_CAP_MS)
        or job.stalled > Commands.CHECK_MAX_FRAMES
    return not timeUp
end

-- the tools that didn't move, each with the game's words where it has
-- them, and the reason the ack gives for them
local function unmovedOf(job)
    local out, reasons = {}, {}
    for _, t in ipairs(job.check) do
        if not t.moved then
            local e = capsOf(t.object, t.depth)
            local why = e.whyNot ~= nil and e.whyNot[t.kind] or "Nothing moved"
            out[#out + 1] = { id = t.object.id, name = nameOf(t.object), why = why }
            reasons[#reasons + 1] = #job.check > 1 and (nameOf(t.object) .. ": " .. why) or why
        end
    end
    return out, reasons
end

local function stepJob(job)
    while true do
        local step = job.steps[job.i]
        if step == nil then
            if job.changed and job.restore ~= nil and not job.restored then
                job.root:setSelectedObject(job.restore)
                job.restored = true
            end
            -- none acted (no key, no setter): the job's last resort
            if job.done == 0 and #job.steps > 0 and job.lastResort ~= nil and job.lastResort(job.vehicle) then
                job.done, job.via, job.refused = 1, "setter", {}
            end
            -- something was pressed: wait until the tools moved, or the time is up
            if job.check ~= nil and job.done > 0 and checking(job) then
                return nil
            end
            local refused, unmoved = job.refused, nil
            if job.check ~= nil then
                local reasons
                unmoved, reasons = unmovedOf(job)
                if job.done > 0 then
                    refused = {}
                    for _, r in ipairs(job.refused) do
                        refused[#refused + 1] = r
                    end
                    for _, r in ipairs(reasons) do
                        refused[#refused + 1] = r
                    end
                else
                    unmoved = {}
                end
            end
            return {
                ok = (job.done > 0 or (#job.steps == 0 and #job.refused == 0)) and (unmoved == nil or #unmoved == 0),
                reason = #refused > 0 and table.concat(refused, "; ") or nil,
                via = job.via,
                checked = job.check ~= nil or nil,
                unmoved = unmoved,
            }
        end
        if step.ready ~= nil and not step.ready() and (step.waited or 0) < Commands.SETTLE_FRAMES then
            step.waited = (step.waited or 0) + 1
            return nil
        end
        -- a step that runs by itself (an all-tools key), else the tool's key
        local name = step.run == nil and press(step, job.root) or nil
        if step.run ~= nil then
            local via, why = step.run(job)
            if via ~= nil then
                acted(job, step, via)
            else
                job.refused[#job.refused + 1] = why or "not available now"
            end
            job.i = job.i + 1
        elseif name ~= nil then
            acted(job, step, name)
            job.i, job.phase = job.i + 1, "start"
        elseif job.phase == "start" then
            local entry = selectableFor(job.root, step.object)
            if entry ~= nil and type(job.root.setSelectedObject) == "function" then
                job.root:setSelectedObject(entry)
                job.changed = true
                job.phase, job.frames = "wait", 0
                return nil
            end
            giveUp(job, step, "not available now")
            job.i = job.i + 1
        else
            job.frames = job.frames + 1
            if job.frames < Commands.KEY_WAIT_FRAMES then
                return nil
            end
            giveUp(job, step, "not available now")
            job.i, job.phase = job.i + 1, "start"
        end
    end
end

-- logs "<action> via <what>" the first time
function Commands:logVia(action, via)
    if via ~= nil then
        local key = tostring(action) .. " via " .. via
        if not self.logged[key] then
            self.logged[key] = true
            self.log("command " .. key)
        end
    end
end

-- the running job's frame: its ack once it's done
function Commands:step()
    local job = self.job
    local ok, result = pcall(stepJob, job)
    if not ok then
        self.job = nil
        if not self.failing then
            self.log(string.format("command %s failed: %s", tostring(job.ack.action), tostring(result)))
            self.failing = true
        end
        return { id = job.ack.id, ref = job.ack.ref, action = job.ack.action, ok = false, reason = "failed in game" }
    end
    if result == nil then
        return nil
    end
    self.job = nil
    self:logVia(job.ack.action, result.via)
    return { id = job.ack.id, ref = job.ack.ref, action = job.ack.action, ok = result.ok,
        reason = not result.ok and (result.reason or "failed") or result.reason, via = result.via,
        checked = result.checked, unmoved = result.unmoved }
end

-- Called every frame. Returns the ack for a command run this frame, or nil.
-- Reads at most one command per frame, and none while a job runs.
function Commands:poll()
    if self.job ~= nil then
        return self:step()
    end
    local path = self:path(self.nextId)
    if not exists(path) then
        return nil
    end
    local id = self.nextId
    local ok, cmd, err = pcall(readCommand, path)
    if not ok or cmd == nil then
        -- a bad file must not stop the queue
        self.nextId = id + 1
        return { id = id, ok = false, reason = tostring(err or cmd) }
    end
    if cmd.session ~= self.sessionId then
        -- left over from an earlier game session: not this session's
        -- command <id>, which the companion will still write
        if deleteFile ~= nil then
            pcall(deleteFile, path)
        end
        if exists(path) then
            self.nextId = id + 1
        end
        return nil
    end
    self.nextId = id + 1
    local ran, reason, via, job
    ok, ran, reason, via, job = pcall(run, cmd.action, tonumber(cmd.value))
    if ok and job ~= nil then
        job.ack = { id = id, ref = cmd.ref, action = cmd.action }
        self.job = job
        return self:step()
    end
    if not ok then
        if not self.failing then
            self.log(string.format("command %s failed: %s", tostring(cmd.action), tostring(ran)))
            self.failing = true
        end
        ran, reason, via = false, "failed in game", nil
    end
    self:logVia(cmd.action, via)
    return {
        id = id,
        ref = cmd.ref,
        action = cmd.action,
        ok = ran == true,
        reason = ran ~= true and (reason or "failed") or nil,
        via = via,
    }
end
