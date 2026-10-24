-- Commands.lua
-- Runs the dashboard's commands (docs/PLAN.md, Controls). The client writes
-- one file per command, numbered from 1 per game session:
--
--     modSettings/FS25_Companion/cmd/<n>.xml
--     <command session="<sessionId>" id="<n>" action="TOGGLE_LIGHTS" ref="<backend ref>"/>
--
-- (a temp file, read back once, then renamed, so it appears whole). Every
-- frame the mod checks whether the next number exists (fileExists costs
-- about 0.1 ms, C0). When it does, it reads it with XMLFile.load, checks the
-- session and the allow-list, runs the action, and answers with a
-- `command_ack` envelope:
--
--     {"id":<n>,"ref":"<backend ref>","action":"TOGGLE_LIGHTS","ok":true}
--     {"id":<n>,"ref":"...","ok":false,"reason":"not in a vehicle"}
--
-- The caller sends the `cab` topic in the same frame, so the new state
-- reaches the dashboard with the ack. The client deletes the file once it
-- sees the ack.
--
-- Never io.open(path, "r") here: FS25 opens the file for writing, which
-- empties it (C0).
--
-- Actions run through the input action's own event callbacks, as a key
-- press would (rebinds, mod actions and multiplayer events just work);
-- g_inputBinding.actionEvents is keyed by the action object
-- (nameActions[name]), verified in C0. An action with no active event
-- falls back to the vehicle's own setter where one is known.

Companion = Companion or {}

local Api = Companion.Api

local Commands = {}
Commands.__index = Commands
Companion.Commands = Commands

-- lights: off <-> the front lights (light type 0)
local function toggleLights(vehicle)
    local spec = vehicle.spec_lights
    if spec == nil or type(vehicle.setLightsTypesMask) ~= "function" then
        return false, "no lights"
    end
    local mask = type(spec.lightsTypesMask) == "number" and spec.lightsTypesMask or 0
    vehicle:setLightsTypesMask(mask ~= 0 and 0 or 1)
    return true
end

-- The input actions a command may run; anything else is refused. The
-- backend and the client keep their own lists (by dashboard action name).
Commands.ACTIONS = {
    TOGGLE_LIGHTS = { needsVehicle = true, fallback = toggleLights },
}

local ATTRIBUTES = { "session", "id", "action", "ref" }

function Commands.new(dir, sessionId, log)
    local self = setmetatable({}, Commands)
    self.dir = dir
    self.sessionId = sessionId
    self.log = log or print
    self.nextId = 1
    self.failing = false
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
-- isMouse, deviceCategory, binding)
local function runInputAction(name)
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
            local ok = pcall(event.callback, event.targetObject, name, 1, event.callbackState,
                false, false, nil, nil)
            if ok then
                called = called + 1
            end
        end
    end
    return called
end

local function run(actionName)
    local spec = Commands.ACTIONS[actionName]
    if spec == nil then
        return false, "action not allowed"
    end
    local vehicle = Api.controlledVehicle()
    if spec.needsVehicle and vehicle == nil then
        return false, "not in a vehicle"
    end
    if runInputAction(actionName) > 0 then
        return true
    end
    if spec.fallback ~= nil and vehicle ~= nil then
        return spec.fallback(vehicle)
    end
    return false, "not available now"
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
    local ran, reason
    ok, ran, reason = pcall(run, cmd.action)
    if not ok then
        if not self.failing then
            self.log(string.format("command %s failed: %s", tostring(cmd.action), tostring(ran)))
            self.failing = true
        end
        ran, reason = false, "failed in game"
    end
    return {
        id = id,
        ref = cmd.ref,
        action = cmd.action,
        ok = ran == true,
        reason = ran ~= true and (reason or "failed") or nil,
    }
end
