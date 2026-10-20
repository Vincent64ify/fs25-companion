-- Companion.lua
-- FS25 Companion mod: bootstrap. Loaded last (see modDesc.xml).
--
-- Streams game state to <profile>/modSettings/FS25_Companion/stream.ndjson,
-- one JSON envelope per line, one topic per collector. The companion client
-- tails that file. Nothing here blocks the game or depends on start order:
-- if the file can't be opened, the mod logs once and stays idle.

Companion = Companion or {}

Companion.VERSION = "0.3.0"
Companion.DIR_NAME = "FS25_Companion"
Companion.STREAM_FILE = "stream.ndjson"

local state = {
    transport = nil,
    scheduler = nil,
    ctx = nil,
    helloSent = false,
    clock = 0,
}

local function log(msg)
    print("[FS25_Companion] " .. msg)
end

local function profileDir()
    if getUserProfileAppPath ~= nil then
        local ok, path = pcall(getUserProfileAppPath)
        if ok then
            return path
        end
    end
    return nil
end

local function streamDir()
    local base = g_modSettingsDirectory
    if base == nil then
        local profile = profileDir()
        if profile == nil then
            return nil
        end
        base = profile .. "modSettings/"
    end
    local last = base:sub(-1)
    if last ~= "/" and last ~= "\\" then
        base = base .. "/"
    end
    local dir = base .. Companion.DIR_NAME .. "/"
    if createFolder ~= nil then
        pcall(createFolder, base)
        pcall(createFolder, dir)
    end
    return dir
end

local function detectPlatform(profile)
    if profile ~= nil and profile:find("Library/Application Support", 1, true) then
        return "macos"
    end
    return "windows"
end

local function newSessionId()
    local stamp = ""
    if getDate ~= nil then
        local ok, d = pcall(getDate, "%Y%m%d-%H%M%S")
        if ok and type(d) == "string" then
            stamp = d .. "-"
        end
    end
    return stamp .. tostring(math.random(100000, 999999))
end

function Companion:loadMap(name)
    local dir = streamDir()
    if dir == nil then
        log("no modSettings directory, streaming disabled")
        return
    end

    local transport = Companion.Transport.new(dir .. Companion.STREAM_FILE)
    local ok, err = transport:open()
    if not ok then
        log("cannot open " .. dir .. Companion.STREAM_FILE .. ": " .. tostring(err))
        return
    end

    local scheduler = Companion.Scheduler.new(transport, log)
    local collectors = Companion.Collectors
    scheduler:add(collectors.Hello)
    scheduler:add(collectors.Env)
    scheduler:add(collectors.Player)
    scheduler:add(collectors.Vehicles)
    scheduler:add(collectors.Hotspots)
    scheduler:add(collectors.Farmlands)
    scheduler:add(collectors.FarmlandGrid)

    local profile = profileDir()
    state.transport = transport
    state.scheduler = scheduler
    state.helloSent = false
    state.clock = 0
    state.ctx = {
        modVersion = Companion.VERSION,
        sessionId = newSessionId(),
        platform = detectPlatform(profile),
        profileDir = profile,
        time = 0,
    }
    log(string.format("streaming to %s%s (session %s)",
        dir, Companion.STREAM_FILE, state.ctx.sessionId))
end

function Companion:deleteMap()
    if state.transport ~= nil then
        state.transport:close()
    end
    state.transport = nil
    state.scheduler = nil
    state.ctx = nil
end

function Companion:update(dt)
    local transport, scheduler, ctx = state.transport, state.scheduler, state.ctx
    if transport == nil or not transport:isOpen() then
        return
    end

    state.clock = state.clock + dt
    ctx.time = type(g_time) == "number" and math.floor(g_time) or math.floor(state.clock)

    -- hello on the first update, when the HUD and the player exist
    if not state.helloSent then
        scheduler:emit("hello", ctx)
        state.helloSent = true
    end
    scheduler:update(dt, ctx)

    local ok, rotated = pcall(transport.flush, transport)
    if not ok then
        log("write failed, streaming stopped: " .. tostring(rotated))
        transport:close()
        return
    end
    if rotated then
        scheduler:resend(ctx)
        pcall(transport.flush, transport)
    end
end

if addModEventListener ~= nil then
    addModEventListener(Companion)
end
