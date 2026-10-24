-- CommandSpike.lua
-- FS25 Companion: command channel spike C0 (development only, remove after use)
--
-- Answers the questions in docs/PLAN.md "Controls" before C1 is built:
--   * can the mod notice a file the client writes, every frame, and how much
--     does that cost (fileExists on a missing file)
--   * can it read that file (loadXMLFile or XMLFile.load),
--     fresh every time (no cache), and how fast
--   * can it run a game action by its input action name through
--     g_inputBinding, the same callback a key press triggers, or only
--     through the vehicle's own setters ("direct" mode)
--   * can it delete the file afterwards (deleteFile)
--   * how long a command takes from the client writing it to the client
--     seeing the ack and the changed vehicle state (spike/command_spike.py)
--
-- Files, in <profile>/modSettings/FS25_CommandSpike/:
--   cmd/<n>.xml      commands, written by spike/command_spike.py:
--                    <command session="..." id="n" action="TOGGLE_BEACON_LIGHTS" mode="input"/>
--   probe.xml        rewritten by the driver to test re-reading (action REREAD)
--   results.ndjson   everything the mod reports, one JSON object per line:
--                    hello, ack, cab (sent the frame the vehicle state changes),
--                    stats (every 10 s), bench, inputDump
--
-- Console commands: csBench (timing of the file calls), csInput (dump the
-- input actions active right now, run it in a tractor).
--
-- Every probe runs under pcall: a failure is reported, never the game.

CommandSpike = {}
local CS = CommandSpike

local SPIKE_VERSION = "0.1.2"
local DIR_NAME = "FS25_CommandSpike"
local STATS_INTERVAL_MS = 10000

local st = {
    dir = nil,
    out = nil,
    session = nil,
    nextId = 1,
    frame = 0,
    statsTimer = 0,
    -- per-frame fileExists cost
    checks = 0,
    checkTotal = 0,
    checkMax = 0,
    lastCab = nil,
    buffer = {},
}

local function log(msg)
    print("[CommandSpike] " .. msg)
end

---------------------------------------------------------------------------
-- JSON (small encoder, as mod/src/Json.lua)
---------------------------------------------------------------------------

local ESCAPES = {
    ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
    ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

local encode

local function encodeString(s)
    return '"' .. s:gsub('[%c"\\]', function(c)
        return ESCAPES[c] or string.format("\\u%04x", c:byte())
    end) .. '"'
end

local function isArray(t)
    local n = 0
    for _ in pairs(t) do
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then
            return false
        end
    end
    return true
end

encode = function(v, depth)
    depth = depth or 0
    local tv = type(v)
    if tv == "nil" then
        return "null"
    elseif tv == "boolean" then
        return v and "true" or "false"
    elseif tv == "number" then
        if v ~= v or v == math.huge or v == -math.huge then
            return "null"
        end
        if v == math.floor(v) and math.abs(v) < 1e15 then
            return string.format("%d", v)
        end
        return string.format("%.6g", v)
    elseif tv == "string" then
        return encodeString(v)
    elseif tv == "table" then
        if depth > 6 then
            return '"<deep>"'
        end
        local parts = {}
        if isArray(v) then
            for i = 1, #v do
                parts[#parts + 1] = encode(v[i], depth + 1)
            end
            return "[" .. table.concat(parts, ",") .. "]"
        end
        local keys = {}
        for k in pairs(v) do
            keys[#keys + 1] = tostring(k)
        end
        table.sort(keys)
        for _, k in ipairs(keys) do
            local val = v[k]
            if val == nil then
                val = v[tonumber(k)]
            end
            parts[#parts + 1] = encodeString(k) .. ":" .. encode(val, depth + 1)
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    return encodeString("<" .. tv .. ">")
end

local function emit(kind, data)
    data = data or {}
    data.kind = kind
    data.frame = st.frame
    st.buffer[#st.buffer + 1] = encode(data) .. "\n"
end

local function flush()
    if st.out == nil or #st.buffer == 0 then
        return
    end
    local text = table.concat(st.buffer)
    st.buffer = {}
    local ok, err = pcall(function()
        st.out:write(text)
        st.out:flush()
    end)
    if not ok then
        log("write failed: " .. tostring(err))
    end
end

---------------------------------------------------------------------------
-- Clock: milliseconds with sub-ms precision when the engine gives it
---------------------------------------------------------------------------

local clockName = nil

local function nowMs()
    if getTimeSec ~= nil then
        local ok, t = pcall(getTimeSec)
        if ok and type(t) == "number" then
            clockName = "getTimeSec"
            return t * 1000
        end
    end
    if netGetTime ~= nil then
        local ok, t = pcall(netGetTime)
        if ok and type(t) == "number" then
            clockName = "netGetTime"
            return t
        end
    end
    clockName = "g_time"
    return type(g_time) == "number" and g_time or 0
end

local function round3(x)
    if type(x) ~= "number" then
        return x
    end
    return math.floor(x * 1000 + 0.5) / 1000
end

---------------------------------------------------------------------------
-- Paths
---------------------------------------------------------------------------

local function spikeDir()
    local base = g_modSettingsDirectory
    if base == nil and getUserProfileAppPath ~= nil then
        local ok, p = pcall(getUserProfileAppPath)
        if ok and p ~= nil then
            base = p .. "modSettings/"
        end
    end
    if base == nil then
        return nil
    end
    local last = base:sub(-1)
    if last ~= "/" and last ~= "\\" then
        base = base .. "/"
    end
    local dir = base .. DIR_NAME .. "/"
    if createFolder ~= nil then
        pcall(createFolder, base)
        pcall(createFolder, dir)
        pcall(createFolder, dir .. "cmd/")
    end
    return dir
end

local function cmdPath(id)
    return string.format("%scmd/%06d.xml", st.dir, id)
end

local function exists(path)
    if fileExists == nil then
        return false
    end
    local ok, r = pcall(fileExists, path)
    return ok and r == true
end

---------------------------------------------------------------------------
-- Reading a command file: every way we know, the first that works wins.
-- Returns a table of attributes and the name of the reader used.
---------------------------------------------------------------------------

local ATTRS = { "session", "id", "action", "mode", "value", "t" }

local readers = {}

readers[#readers + 1] = { name = "loadXMLFile", read = function(path)
    if loadXMLFile == nil or getXMLString == nil then
        return nil, "missing"
    end
    local h = loadXMLFile("csCommand", path)
    if h == nil or h == 0 then
        return nil, "load returned " .. tostring(h)
    end
    local out = {}
    for _, a in ipairs(ATTRS) do
        out[a] = getXMLString(h, "command#" .. a)
    end
    if delete ~= nil then
        delete(h)
    end
    return out
end }

readers[#readers + 1] = { name = "XMLFile.load", read = function(path)
    if XMLFile == nil or XMLFile.load == nil then
        return nil, "missing"
    end
    local xml = XMLFile.load("csCommand", path)
    if xml == nil then
        return nil, "load returned nil"
    end
    local out = {}
    for _, a in ipairs(ATTRS) do
        out[a] = xml:getString("command#" .. a)
    end
    xml:delete()
    return out
end }

-- No io.open reader: C0 0.1.1 showed that io.open(path, "r") warns "only
-- write mode ('w') is allowed" and opens the file for writing, which empties
-- it. Never open a file the mod doesn't own with io.open.

-- Every command is read by every reader that works, in a rotating order so
-- no reader always pays for the first open of a new file; the timings go
-- into the ack (readTimes) and the first good result is used. In C0 on
-- Windows loadXMLFile took 3-20 ms per command while XMLFile.load, run
-- second on the same file, took 0.06 ms: this settles which one C1 uses.
local reader = nil  -- the last reader that worked, for REREAD and csBench
local rotation = 0

local function readCommand(path)
    rotation = rotation + 1
    local times = {}
    local best, bestName, bestMs = nil, nil, nil
    local n = #readers
    for i = 0, n - 1 do
        local r = readers[((rotation + i) % n) + 1]
        local t0 = nowMs()
        local ok, out, err = pcall(r.read, path)
        local ms = round3(nowMs() - t0)
        if ok and out ~= nil and out.id ~= nil then
            times[r.name] = { ms = ms, order = i + 1 }
            if best == nil then
                best, bestName, bestMs, reader = out, r.name, ms, r
            end
        else
            times[r.name] = { ms = ms, order = i + 1, err = tostring(ok and err or out) }
        end
    end
    if best == nil then
        return nil, "no reader works", 0, times
    end
    return best, bestName, bestMs, times
end

---------------------------------------------------------------------------
-- The controlled vehicle and its control state ("cab")
---------------------------------------------------------------------------

local function controlledVehicle()
    local p = g_localPlayer
    if p == nil then
        return nil
    end
    local ok, v = pcall(function()
        return p:getCurrentVehicle()
    end)
    if ok then
        return v
    end
    return nil
end

local function tryCall(obj, name, ...)
    if obj == nil then
        return nil
    end
    local f = obj[name]
    if type(f) ~= "function" then
        return nil
    end
    local ok, r = pcall(f, obj, ...)
    if ok then
        return r
    end
    return nil
end

-- every scalar field of a spec: whatever changes when a light goes on shows
-- up here, without guessing field names
local function scalars(t)
    if type(t) ~= "table" then
        return nil
    end
    local out = {}
    for k, v in pairs(t) do
        local tv = type(v)
        if type(k) == "string" and (tv == "boolean" or tv == "number" or tv == "string") then
            out[k] = v
        end
    end
    return out
end

local function cabState(vehicle)
    if vehicle == nil then
        return { vehicle = false }
    end
    local drivable = vehicle.spec_drivable
    return {
        vehicle = vehicle.id,
        lights = scalars(vehicle.spec_lights),
        motorStarted = tryCall(vehicle, "getIsMotorStarted"),
        cruise = tryCall(vehicle, "getCruiseControlState"),
        cruiseSpeed = drivable ~= nil and drivable.cruiseControl ~= nil
            and drivable.cruiseControl.speed or nil,
        turnedOn = tryCall(vehicle, "getIsTurnedOn"),
        lowered = tryCall(vehicle, "getIsLowered"),
    }
end

-- what changed between two cab states (shallow, plus the lights fields)
local function cabDiff(a, b)
    if a == nil then
        return { all = true }
    end
    local diff = {}
    local n = 0
    for k, v in pairs(b) do
        if k == "lights" then
            local la, lb = a.lights or {}, v or {}
            for lk, lv in pairs(lb) do
                if la[lk] ~= lv then
                    diff["lights." .. lk] = lv
                    n = n + 1
                end
            end
        elseif a[k] ~= v then
            diff[k] = v
            n = n + 1
        end
    end
    for k, v in pairs(a) do
        if b[k] == nil and v ~= nil and k ~= "lights" then
            diff[k] = "<nil>"
            n = n + 1
        end
    end
    if n == 0 then
        return nil
    end
    return diff
end

local function checkCab(cause)
    local cab = cabState(controlledVehicle())
    local diff = cabDiff(st.lastCab, cab)
    if diff ~= nil then
        emit("cab", { cause = cause, changed = diff })
        st.lastCab = cab
        return true
    end
    return false
end

---------------------------------------------------------------------------
-- Running an action
---------------------------------------------------------------------------

-- "input": find the action events registered for this input action and call
-- their callbacks, as a key press would. The table layout of g_inputBinding
-- isn't verified, so try the likely ones and report what was found.
local function eventsFor(actionName)
    local ib = g_inputBinding
    if ib == nil then
        return nil, "no g_inputBinding"
    end
    local found = {}
    local function add(list, where)
        if type(list) ~= "table" then
            return
        end
        -- a single event, or a list / map of events
        if type(list.callback) == "function" then
            found[#found + 1] = { e = list, where = where }
            return
        end
        for _, e in pairs(list) do
            if type(e) == "table" and type(e.callback) == "function" then
                found[#found + 1] = { e = e, where = where }
            end
        end
    end
    local action = ib.nameActions ~= nil and ib.nameActions[actionName] or nil
    if type(ib.actionEvents) == "table" then
        add(ib.actionEvents[actionName], "actionEvents[name]")
        if action ~= nil then
            add(ib.actionEvents[action], "actionEvents[action]")
        end
    end
    if type(ib.eventsByActionName) == "table" then
        add(ib.eventsByActionName[actionName], "eventsByActionName")
    end
    if #found == 0 and type(ib.actionEvents) == "table" then
        -- last resort: scan everything for events whose action name matches
        for _, list in pairs(ib.actionEvents) do
            if type(list) == "table" then
                for _, e in pairs(list) do
                    if type(e) == "table" and type(e.callback) == "function" then
                        local name = e.actionName
                            or (type(e.action) == "table" and e.action.name) or nil
                        if name == actionName then
                            found[#found + 1] = { e = e, where = "scan" }
                        end
                    end
                end
            end
        end
    end
    return found
end

local function runInput(actionName, value)
    local found, err = eventsFor(actionName)
    if found == nil then
        return false, err
    end
    if #found == 0 then
        return false, "no action event for " .. actionName
    end
    local called, errors, info = 0, {}, {}
    for _, f in ipairs(found) do
        local e = f.e
        info[#info + 1] = {
            where = f.where,
            isActive = e.isActive,
            triggerDown = e.triggerDown,
            triggerUp = e.triggerUp,
            triggerAlways = e.triggerAlways,
        }
        if e.isActive ~= false then
            -- the signature of action event callbacks in GIANTS scripts:
            -- (self, actionName, inputValue, callbackState, isAnalog, isMouse,
            --  deviceCategory, binding)
            local ok, cerr = pcall(e.callback, e.targetObject, actionName, value or 1,
                e.callbackState, false, false, nil, nil)
            if ok then
                called = called + 1
            else
                errors[#errors + 1] = tostring(cerr)
            end
        end
    end
    if called == 0 then
        return false, "no active event called", { events = info, errors = errors }
    end
    return true, nil, { events = info, called = called, errors = errors }
end

-- "direct": the vehicle's own setters, for comparison and as the fallback
local direct = {}

direct.BEACON = function(v)
    local spec = v.spec_lights
    local on = spec ~= nil and (spec.beaconLightsActive or spec.beaconOn) or false
    local r = tryCall(v, "setBeaconLightsVisibility", not on)
    return true, { was = on, ret = r }
end

direct.LIGHTS = function(v)
    local spec = v.spec_lights
    local mask = spec ~= nil and spec.lightsTypesMask or 0
    local new = (mask == 0) and 1 or 0
    local r = tryCall(v, "setLightsTypesMask", new)
    return true, { was = mask, new = new, ret = r }
end

direct.HAZARD = function(v)
    local spec = v.spec_lights
    local state = spec ~= nil and spec.turnLightState or 0
    local hazard = Lights ~= nil and Lights.TURNLIGHT_HAZARD or 3
    local off = Lights ~= nil and Lights.TURNLIGHT_OFF or 0
    local new = (state == hazard) and off or hazard
    local r = tryCall(v, "setTurnLightState", new)
    return true, { was = state, new = new, ret = r }
end

direct.ENGINE = function(v)
    local on = tryCall(v, "getIsMotorStarted")
    if on then
        tryCall(v, "stopMotor")
    else
        tryCall(v, "startMotor")
    end
    return true, { was = on }
end

direct.CRUISE = function(v)
    local state = tryCall(v, "getCruiseControlState") or 0
    local active = Drivable ~= nil and Drivable.CRUISECONTROL_STATE_ACTIVE or 1
    local off = Drivable ~= nil and Drivable.CRUISECONTROL_STATE_OFF or 0
    local new = (state == off) and active or off
    tryCall(v, "setCruiseControlState", new)
    return true, { was = state, new = new }
end

local function runCommand(cmd)
    local action = cmd.action
    if action == "REREAD" then
        -- the driver rewrote probe.xml with a new value: read it back
        local out, name, ms = nil, nil, 0
        if reader ~= nil then
            local t0 = nowMs()
            local ok, r = pcall(reader.read, st.dir .. "probe.xml")
            ms = round3(nowMs() - t0)
            out = ok and r or nil
            name = reader.name
        end
        return out ~= nil, out == nil and "probe not read" or nil,
            { probeValue = out ~= nil and out.value or nil, reader = name, ms = ms }
    end
    if action == "PING" then
        return true, nil, nil
    end
    local vehicle = controlledVehicle()
    if cmd.mode == "direct" then
        local fn = direct[action]
        if fn == nil then
            return false, "no direct action " .. tostring(action)
        end
        if vehicle == nil then
            return false, "not in a vehicle"
        end
        local ok, r, extra = pcall(fn, vehicle)
        if not ok then
            return false, tostring(r)
        end
        return r, nil, extra
    end
    return runInput(action, tonumber(cmd.value))
end

---------------------------------------------------------------------------
-- The per-frame command check
---------------------------------------------------------------------------

local function tryDelete(path)
    if deleteFile == nil then
        return "missing"
    end
    local ok, err = pcall(deleteFile, path)
    if not ok then
        return "error: " .. tostring(err)
    end
    return exists(path) and "still there" or "deleted"
end

local deleteResult = nil

local function pollCommands()
    local path = cmdPath(st.nextId)
    local t0 = nowMs()
    local found = exists(path)
    local checkMs = nowMs() - t0
    st.checks = st.checks + 1
    st.checkTotal = st.checkTotal + checkMs
    if checkMs > st.checkMax then
        st.checkMax = checkMs
    end
    if not found then
        return
    end

    local id = st.nextId
    st.nextId = st.nextId + 1
    local cmd, readerName, readMs, readTimes = readCommand(path)
    if cmd == nil then
        emit("ack", { id = id, ok = false, reason = readerName, readMs = round3(readMs),
            readTimes = readTimes })
        return
    end
    if cmd.session ~= st.session then
        emit("ack", { id = id, ok = false, reason = "stale session " .. tostring(cmd.session),
            reader = readerName })
        if deleteResult == nil then
            deleteResult = tryDelete(path)
        end
        return
    end

    local t1 = nowMs()
    local ok, ran, reason, extra = pcall(runCommand, cmd)
    local runMs = nowMs() - t1
    if not ok then
        ran, reason = false, tostring(ran)
    end
    -- the state the same frame, before the ack goes out
    local changed = checkCab("command " .. id)
    local del = nil
    if deleteResult == nil then
        deleteResult = tryDelete(path)
        del = deleteResult
    elseif deleteResult == "deleted" then
        del = tryDelete(path)
    end
    emit("ack", {
        id = id,
        action = cmd.action,
        mode = cmd.mode or "input",
        ok = ran == true,
        reason = reason,
        detail = extra,
        reader = readerName,
        readMs = round3(readMs),
        readTimes = readTimes,
        runMs = round3(runMs),
        checkMs = round3(checkMs),
        cabChangedSameFrame = changed,
        delete = del,
    })
end

---------------------------------------------------------------------------
-- Console commands
---------------------------------------------------------------------------

function CS:consoleBench()
    if st.dir == nil then
        return "not running"
    end
    local missing = st.dir .. "cmd/does-not-exist.xml"
    local n = 1000
    local t0 = nowMs()
    for _ = 1, n do
        exists(missing)
    end
    local existsMs = (nowMs() - t0) / n
    local readMs = {}
    if exists(st.dir .. "probe.xml") then
        local m = 100
        for _, r in ipairs(readers) do
            t0 = nowMs()
            for _ = 1, m do
                pcall(r.read, st.dir .. "probe.xml")
            end
            readMs[r.name] = round3((nowMs() - t0) / m)
        end
    end
    emit("bench", { fileExistsMs = round3(existsMs), readMs = readMs, clock = clockName })
    flush()
    local parts = {}
    for name, ms in pairs(readMs) do
        parts[#parts + 1] = string.format("%s %.3f ms", name, ms)
    end
    return string.format("fileExists %.4f ms; %s", existsMs, table.concat(parts, ", "))
end

function CS:consoleInput()
    local ib = g_inputBinding
    if ib == nil then
        return "no g_inputBinding"
    end
    local fields = {}
    for k, v in pairs(ib) do
        fields[tostring(k)] = type(v)
    end
    -- action names with at least one active event right now
    local active = {}
    if type(ib.actionEvents) == "table" then
        for key, list in pairs(ib.actionEvents) do
            if type(list) == "table" then
                for _, e in pairs(list) do
                    if type(e) == "table" and type(e.callback) == "function" then
                        local name = type(key) == "string" and key
                            or e.actionName
                            or (type(key) == "table" and key.name)
                            or tostring(key)
                        active[#active + 1] = {
                            action = name,
                            isActive = e.isActive,
                            fields = scalars(e),
                        }
                    end
                end
            end
        end
    end
    local inputActions = {}
    if InputAction ~= nil then
        for k in pairs(InputAction) do
            inputActions[#inputActions + 1] = tostring(k)
        end
        table.sort(inputActions)
    end
    emit("inputDump", {
        inputBindingFields = fields,
        events = active,
        inputActionCount = #inputActions,
        inputActions = inputActions,
        vehicle = controlledVehicle() ~= nil and controlledVehicle().id or false,
    })
    flush()
    return string.format("%d events, %d input actions dumped", #active, #inputActions)
end

---------------------------------------------------------------------------
-- Mod events
---------------------------------------------------------------------------

function CS:loadMap()
    st.dir = spikeDir()
    if st.dir == nil then
        log("no modSettings directory, spike disabled")
        return
    end
    local f, err = io.open(st.dir .. "results.ndjson", "w")
    if f == nil then
        log("cannot open results.ndjson: " .. tostring(err))
        st.dir = nil
        return
    end
    st.out = f
    st.session = tostring(math.random(100000, 999999))
    st.nextId = 1
    st.frame = 0
    nowMs()
    emit("hello", {
        version = SPIKE_VERSION,
        session = st.session,
        dir = st.dir,
        clock = clockName,
        api = {
            fileExists = type(fileExists),
            loadXMLFile = type(loadXMLFile),
            XMLFile = type(XMLFile),
            deleteFile = type(deleteFile),
            getFiles = type(getFiles),
            ioLines = type(io.lines),
            ioRead = type(io.read),
            g_inputBinding = type(g_inputBinding),
            InputAction = type(InputAction),
        },
    })
    flush()
    if addConsoleCommand ~= nil then
        addConsoleCommand("csBench", "Command spike: time fileExists and the file read", "consoleBench", CS)
        addConsoleCommand("csInput", "Command spike: dump the active input actions", "consoleInput", CS)
    end
    log("ready, session " .. st.session .. ", commands in " .. st.dir .. "cmd/")
end

function CS:deleteMap()
    if removeConsoleCommand ~= nil then
        pcall(removeConsoleCommand, "csBench")
        pcall(removeConsoleCommand, "csInput")
    end
    flush()
    if st.out ~= nil then
        pcall(st.out.close, st.out)
    end
    st.out = nil
    st.dir = nil
end

function CS:update(dt)
    if st.out == nil then
        return
    end
    st.frame = st.frame + 1
    local ok, err = pcall(pollCommands)
    if not ok then
        emit("error", { where = "poll", err = tostring(err) })
    end
    ok, err = pcall(checkCab, "frame")
    if not ok then
        emit("error", { where = "cab", err = tostring(err) })
    end
    st.statsTimer = st.statsTimer + dt
    if st.statsTimer >= STATS_INTERVAL_MS then
        emit("stats", {
            frames = st.checks,
            fileExistsAvgMs = st.checks > 0 and round3(st.checkTotal / st.checks) or nil,
            fileExistsMaxMs = round3(st.checkMax),
            dtMs = round3(dt),
            nextId = st.nextId,
        })
        st.statsTimer = 0
        st.checks, st.checkTotal, st.checkMax = 0, 0, 0
    end
    flush()
end

function CS:draw()
    if renderText == nil or st.out == nil then
        return
    end
    renderText(0.01, 0.60, 0.013, string.format("[CommandSpike] session %s, next command %d",
        tostring(st.session), st.nextId))
end

if addModEventListener ~= nil then
    addModEventListener(CommandSpike)
end
