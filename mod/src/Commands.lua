-- Commands.lua
-- Runs the dashboard's commands (docs/PLAN.md, Controls). The client writes
-- one file per command, numbered from 1 per game session:
--
--     modSettings/FS25_Companion/cmd/<n>.xml
--     <command session="<sessionId>" id="<n>" action="TOGGLE_LIGHTS" ref="<backend ref>"/>
--     <command ... action="CRUISE_SET_SPEED" ref="..." value="23.000"/>   (km/h)
--
-- (a temp file, read back once, then renamed, so it appears whole). Every
-- frame the mod checks whether the next number exists (fileExists costs
-- about 0.1 ms, C0). When it does, it reads it with XMLFile.load, checks the
-- session and the allow-list, runs the action, and answers with a
-- `command_ack` envelope:
--
--     {"id":<n>,"ref":"<backend ref>","action":"TOGGLE_LIGHTS","ok":true,"via":"TOGGLE_LIGHTS"}
--     {"id":<n>,"ref":"...","ok":false,"reason":"not in a vehicle"}
--
-- `via` says what ran: the input action's name, or "setter". The caller
-- sends the `cab` topic in the same frame, so the new state reaches the
-- dashboard with the ack. The client deletes the file once it sees the ack.
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

local function toggleFold(_, implement)
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

-- detach the selected implement, when the attach key has no event;
-- attaching needs the key (the game finds what's in range)
local function detach(_, implement)
    if implement == nil then
        return false, "nothing in range"
    end
    local attacher = Api.tryCall(implement, "getAttacherVehicle")
    if type(attacher) ~= "table" or type(attacher.detachImplementByObject) ~= "function" then
        return false, "can't detach"
    end
    attacher:detachImplementByObject(implement)
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
    local allowed = Api.tryCallAll(object, "isDetachAllowed")
    if allowed == false then
        return false, "can't detach now"
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

-- the first pipe: out to its next state, else in
local function togglePipe(vehicle)
    for _, object in ipairs(rigObjects(vehicle)) do
        local spec = object.spec_pipe
        if type(spec) == "table" and spec.hasMovablePipe == true and type(object.setPipeState) == "function"
            and type(spec.targetState) == "number" and type(spec.numStates) == "number" then
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
    end
    return false, "no pipe"
end

-- the first cover: on to its next state (0 closed)
local function toggleCover(vehicle)
    for _, object in ipairs(rigObjects(vehicle)) do
        local spec = object.spec_cover
        if type(spec) == "table" and spec.hasCovers == true and type(object.setCoverState) == "function"
            and type(spec.state) == "number" and type(spec.covers) == "table" then
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
    end
    return false, "no cover"
end

-- Actions ------------------------------------------------------------------
-- The actions a command may run; anything else is refused. The backend
-- and the client keep their own lists (by dashboard action name).
--   inputs     input actions tried in order, the first with an active
--              event wins; or function(vehicle, implement) -> list
--   value      the input value passed to the callbacks (default 1)
--   direct     a setter tried before the inputs (exact single steps)
--   fallback   a setter tried when no input event ran
--   implement  needs a selected implement
Commands.ACTIONS = {
    TOGGLE_LIGHTS = { inputs = { "TOGGLE_LIGHTS" }, fallback = toggleLights },
    TOGGLE_HIGH_BEAM_LIGHT = { inputs = { "TOGGLE_HIGH_BEAM_LIGHT" }, fallback = toggleHighBeam },
    TOGGLE_BEACON_LIGHTS = { inputs = { "TOGGLE_BEACON_LIGHTS" }, fallback = toggleBeacon },
    TOGGLE_TURNLIGHT_HAZARD = { inputs = { "TOGGLE_TURNLIGHT_HAZARD" },
        fallback = turnLight("TURNLIGHT_HAZARD", 3) },
    TOGGLE_TURNLIGHT_LEFT = { inputs = { "TOGGLE_TURNLIGHT_LEFT" }, fallback = turnLight("TURNLIGHT_LEFT", 1) },
    TOGGLE_TURNLIGHT_RIGHT = { inputs = { "TOGGLE_TURNLIGHT_RIGHT" }, fallback = turnLight("TURNLIGHT_RIGHT", 2) },
    TOGGLE_MOTOR_STATE = { inputs = { "TOGGLE_MOTOR_STATE" }, fallback = toggleEngine },
    TOGGLE_CRUISE_CONTROL = { inputs = { "TOGGLE_CRUISE_CONTROL" }, fallback = toggleCruise },
    CRUISE_SPEED_DOWN = { direct = cruiseStep(-1), inputs = { "AXIS_CRUISE_CONTROL" }, value = -1 },
    CRUISE_SPEED_UP = { direct = cruiseStep(1), inputs = { "AXIS_CRUISE_CONTROL" }, value = 1 },
    -- an absolute set speed: the dashboard's −/+ while held
    CRUISE_SET_SPEED = { direct = cruiseSet },
    TOGGLE_AI = { inputs = { "TOGGLE_AI" } },
    LOWER_IMPLEMENT = { implement = true, inputs = { "LOWER_IMPLEMENT" }, fallback = toggleLower },
    FOLD_IMPLEMENT = { implement = true, inputs = { "IMPLEMENT_EXTRA2" }, fallback = toggleFold },
    TURN_ON_IMPLEMENT = { implement = true, inputs = { "IMPLEMENT_EXTRA" }, fallback = toggleTurnOn },
    -- the Hitch button is the attach key (Q): the game attaches what's in
    -- range or detaches the selected implement, whatever is selected. (C2's
    -- first try ran DETACH for an attached implement, which isn't what Q
    -- does.)
    HITCH = { inputs = { "ATTACH" }, fallback = detach },
    -- C3: the value is the tool's id (the cab's rig)
    SELECT_IMPLEMENT = { direct = selectTarget },
    -- G and its other way
    SELECT_NEXT_IMPLEMENT = { inputs = { "SWITCH_IMPLEMENT" }, fallback = selectStep(1) },
    SELECT_PREVIOUS_IMPLEMENT = { inputs = { "SWITCH_IMPLEMENT_BACK" }, fallback = selectStep(-1) },
    DETACH_IMPLEMENT = { direct = detachTarget },
    -- the Implement screen: Ctrl+V, O, I (else Ctrl+I, to the ground) and N
    LOWER_ALL_IMPLEMENTS = { inputs = { "LOWER_ALL_IMPLEMENTS" }, fallback = lowerAll },
    TOGGLE_PIPE = { inputs = { "TOGGLE_PIPE" }, fallback = togglePipe },
    TOGGLE_DISCHARGE = { inputs = { "TOGGLE_TIPSTATE", "TOGGLE_TIPSTATE_GROUND" } },
    TOGGLE_COVER = { inputs = { "TOGGLE_COVER" }, fallback = toggleCover },
}

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

-- for hello: where the client writes and which number the mod reads next
-- (a client that starts mid-session continues from there)
function Commands:info()
    return { dir = self.dir, next = self.nextId }
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
-- isMouse, deviceCategory, binding). Returns how many ran.
local function runInputAction(name, value)
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
        if type(event) == "table" and type(event.callback) == "function" and event.isActive ~= false then
            local ok = pcall(event.callback, event.targetObject, name, value or 1, event.callbackState,
                false, false, nil, nil)
            if ok then
                called = called + 1
            end
        end
    end
    return called
end

-- returns ok, reason, via; value: the command's number, if it has one
local function run(actionName, value)
    local spec = Commands.ACTIONS[actionName]
    if spec == nil then
        return false, "action not allowed"
    end
    local vehicle = Api.controlledVehicle()
    if vehicle == nil then
        return false, "not in a vehicle"
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

-- Called every frame. Returns the ack for a command run this frame, or nil.
-- Reads at most one command per frame.
function Commands:poll()
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
        -- command <id>, which the client will still write
        if deleteFile ~= nil then
            pcall(deleteFile, path)
        end
        if exists(path) then
            self.nextId = id + 1
        end
        return nil
    end
    self.nextId = id + 1
    local ran, reason, via
    ok, ran, reason, via = pcall(run, cmd.action, tonumber(cmd.value))
    if not ok then
        if not self.failing then
            self.log(string.format("command %s failed: %s", tostring(cmd.action), tostring(ran)))
            self.failing = true
        end
        ran, reason, via = false, "failed in game", nil
    end
    if via ~= nil then
        local key = tostring(cmd.action) .. " via " .. via
        if not self.logged[key] then
            self.logged[key] = true
            self.log("command " .. key)
        end
    end
    return {
        id = id,
        ref = cmd.ref,
        action = cmd.action,
        ok = ran == true,
        reason = ran ~= true and (reason or "failed") or nil,
        via = via,
    }
end
