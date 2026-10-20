-- run.lua
-- Offline tests for the mod's pure parts: the JSON encoder, the heading
-- maths, the transport (writes and rotation) and the scheduler (isolation
-- of failing collectors). The game API is stubbed.
--
-- Runs under plain Lua 5.1+ from the repository root (set TMP_DIR to keep
-- scratch files out of the system temp folder):
--     lua mod/tests/run.lua
-- or through pytest (mod/tests/test_lua.py, needs `pip install lupa`).

local MOD_ROOT = MOD_ROOT or "mod/"

local function load(rel)
    dofile(MOD_ROOT .. rel)
end

Companion = nil
load("src/Json.lua")
load("src/Geo.lua")
load("src/Api.lua")
load("src/Transport.lua")
load("src/Scheduler.lua")

local Json, Geo, Transport, Scheduler =
    Companion.Json, Companion.Geo, Companion.Transport, Companion.Scheduler

local tests, failures = {}, {}

local function test(name, fn)
    tests[#tests + 1] = { name = name, fn = fn }
end

local function eq(actual, expected, label)
    if actual ~= expected then
        error(string.format("%s: expected %s, got %s",
            label or "value", tostring(expected), tostring(actual)), 2)
    end
end

local function near(actual, expected, label)
    if actual == nil or math.abs(actual - expected) > 1e-6 then
        error(string.format("%s: expected %s, got %s",
            label or "value", tostring(expected), tostring(actual)), 2)
    end
end

local tmpCount = 0
local function tmpPath()
    if TMP_DIR == nil then
        return os.tmpname()
    end
    tmpCount = tmpCount + 1
    return TMP_DIR .. "/stream_" .. tmpCount .. ".ndjson"
end

local function readFile(path)
    local f = assert(io.open(path, "r"))
    local text = f:read("*a")
    f:close()
    return text
end

local function lines(text)
    local out = {}
    for line in text:gmatch("[^\n]+") do
        out[#out + 1] = line
    end
    return out
end

-- Json ---------------------------------------------------------------------

test("json scalars", function()
    eq(Json.encode(nil), "null")
    eq(Json.encode(true), "true")
    eq(Json.encode(false), "false")
    eq(Json.encode(42), "42")
    eq(Json.encode(-3), "-3")
    eq(Json.encode(1.5), "1.5")
    eq(Json.encode(0 / 0), "null", "NaN")
    eq(Json.encode(math.huge), "null", "inf")
    eq(Json.encode(-math.huge), "null", "-inf")
end)

test("json string escaping", function()
    eq(Json.encode('a"b\\c'), '"a\\"b\\\\c"')
    eq(Json.encode("line\nnext\ttab"), '"line\\nnext\\ttab"')
    eq(Json.encode("\1"), '"\\u0001"')
    eq(Json.encode("Solek é"), '"Solek é"', "utf-8 passes through")
end)

test("json arrays and objects", function()
    eq(Json.encode({}), "[]")
    eq(Json.encode({ 1, 2, 3 }), "[1,2,3]")
    eq(Json.encode({ b = 1, a = { x = true } }), '{"a":{"x":true},"b":1}')
    eq(Json.encode({ [1] = "a", [3] = "c" }), '{"1":"a","3":"c"}', "sparse")
    eq(Json.encode({ ["2"] = 5 }), '{"2":5}', "string number keys")
    eq(Json.encode({ f = function() end }), '{"f":null}')
end)

-- Geo ----------------------------------------------------------------------

test("heading convention: 0 = north (-Z), clockwise", function()
    near(Geo.headingFromDirection(0, -1), 0, "north")
    near(Geo.headingFromDirection(1, 0), 90, "east")
    near(Geo.headingFromDirection(0, 1), 180, "south")
    near(Geo.headingFromDirection(-1, 0), 270, "west")
    near(Geo.headingFromDirection(1, -1), 45, "north-east")
    eq(Geo.headingFromDirection(0, 0), nil, "no direction")
    eq(Geo.roundHeading(359.96), 0, "rounding wraps to 0")
    eq(Geo.roundHeading(359.94), 359.9)
end)

test("node pose uses the forward vector", function()
    getWorldTranslation = function() return 10.123, 50, -20.456 end
    localDirectionToWorld = function() return 0.84871709346771, 0, -0.52825945615768 end
    local pose = Geo.nodePose(1234)
    eq(pose.x, 10.12)
    eq(pose.z, -20.46)
    -- value recorded in Phase 0 (fixture seq 37): hdg 58.1
    eq(pose.heading, 58.1)
    eq(Geo.nodePose(0), nil, "no node")
    eq(Geo.nodePose(nil), nil, "nil node")
end)

-- Transport ----------------------------------------------------------------

test("transport writes one envelope per line with a contiguous seq", function()
    local path = tmpPath()
    local t = Transport.new(path)
    assert(t:open())
    t:send("player", 1000, { x = 1 })
    t:send("env", 1001, { day = 3 })
    eq(t:flush(), false, "no rotation")
    t:close()
    local ls = lines(readFile(path))
    eq(#ls, 2)
    eq(ls[1], '{"data":{"x":1},"seq":1,"t":1000,"topic":"player","v":1}')
    eq(ls[2], '{"data":{"day":3},"seq":2,"t":1001,"topic":"env","v":1}')
    os.remove(path)
end)

test("transport rotates by truncating and keeps counting seq", function()
    local path = tmpPath()
    local t = Transport.new(path, 100)
    assert(t:open())
    t:send("player", 1, { pad = string.rep("x", 80) })
    eq(t:flush(), true, "rotated")
    eq(t.rotations, 1)
    eq(readFile(path), "", "file truncated")
    t:send("hello", 2, { sessionId = "s" })
    eq(t:flush(), false)
    t:close()
    local ls = lines(readFile(path))
    eq(#ls, 1)
    assert(ls[1]:find('"seq":2', 1, true), "seq continues after rotation")
    os.remove(path)
end)

test("transport open fails cleanly", function()
    local t = Transport.new("/nonexistent-dir/x/stream.ndjson")
    local ok = t:open()
    eq(ok, false)
    eq(t:isOpen(), false)
    t:send("player", 1, {})
    eq(t:flush(), false, "flush without a file is a no-op")
end)

-- Scheduler ----------------------------------------------------------------

local function fakeTransport()
    return {
        sent = {},
        send = function(self, topic, t, data)
            self.sent[#self.sent + 1] = { topic = topic, t = t, data = data }
        end,
    }
end

test("scheduler runs each collector at its interval", function()
    local tr = fakeTransport()
    local s = Scheduler.new(tr, function() end)
    local n = 0
    s:add({ topic = "fast", interval = 100, collect = function() n = n + 1; return { n = n } end })
    s:add({ topic = "slow", interval = 1000, collect = function() return {} end })
    local ctx = { time = 0 }
    for _ = 1, 20 do
        s:update(50, ctx) -- 1 s total
    end
    local counts = {}
    for _, m in ipairs(tr.sent) do
        counts[m.topic] = (counts[m.topic] or 0) + 1
    end
    eq(counts.fast, 11, "fast topic at 10 Hz, plus the first update")
    eq(counts.slow, 2, "slow topic on the first update and at 1 s")
end)

test("scheduler isolates a failing collector and logs once", function()
    local tr = fakeTransport()
    local logs = {}
    local s = Scheduler.new(tr, function(msg) logs[#logs + 1] = msg end)
    local broken = true
    s:add({ topic = "bad", interval = 100, collect = function()
        if broken then
            error("attempt to index nil")
        end
        return { ok = true }
    end })
    s:add({ topic = "good", interval = 100, collect = function() return { ok = true } end })
    local ctx = { time = 0 }
    for _ = 1, 5 do
        s:update(100, ctx)
    end
    eq(#tr.sent, 5, "good topic kept going")
    eq(#logs, 1, "failure logged once")
    assert(logs[1]:find("topic bad failed", 1, true), logs[1])
    broken = false
    s:update(100, ctx)
    eq(#logs, 2)
    assert(logs[2]:find("recovered", 1, true), logs[2])
end)

test("scheduler skips nil data and emits on demand", function()
    local tr = fakeTransport()
    local s = Scheduler.new(tr, function() end)
    s:add({ topic = "hello", interval = nil, collect = function() return { hi = 1 } end })
    s:add({ topic = "notyet", interval = 100, collect = function() return nil end })
    local ctx = { time = 7 }
    s:update(500, ctx)
    eq(#tr.sent, 0, "hello is never scheduled; nil data is not sent")
    s:emit("hello", ctx)
    eq(#tr.sent, 1)
    eq(tr.sent[1].topic, "hello")
    eq(tr.sent[1].t, 7)
end)

-- Whole mod against a stubbed game -----------------------------------------
-- Loads every file in modDesc order and runs a few frames. Needs TMP_DIR
-- with an existing FS25_Companion/ folder (createFolder is a game function).

local function stubGame()
    local implement = {
        typeName = "plow",
        getFullName = function() return "Plow 3000" end,
        getIsLowered = function() return true end,
        getIsTurnedOn = function() return false end,
        getDamageAmount = function() return 0.25 end,
    }
    local vehicle = {
        id = 7, rootNode = 55, typeName = "tractor",
        getFullName = function() return "Big Tractor" end,
        getOwnerFarmId = function() return 1 end,
        getIsAIActive = function() return false end,
        getLastSpeed = function() return 5 end,
        getOperationTime = function() return 7200 end,
        getTotalMass = function() return 9.5 end,
        getMotor = function()
            return {
                getLastRealMotorRpm = function() return 1500.4 end,
                getMinRpm = function() return 800 end,
                getMaxRpm = function() return 2200 end,
                getGear = function() return 4 end,
            }
        end,
        getAttachedImplements = function() return { { object = implement } } end,
        spec_motorized = {
            engineStarted = true, fuelLevel = { value = 150.55 }, maxFuelLevel = 300,
            motorTemperature = { value = 80 },
        },
        spec_lights = { isLightOn = true },
        spec_wearable = { wear = 0.1 },
    }
    local player = {
        farmId = 1, nickname = "Farmer",
        currentVehicle = nil,
        getPosition = function() return 100, 40, -200 end,
        getCurrentFacingDirection = function() return 1, 0 end,
    }
    player.getCurrentVehicle = function(self) return self.currentVehicle end

    g_modSettingsDirectory = TMP_DIR .. "/"
    getUserProfileAppPath = function() return TMP_DIR .. "/" end
    createFolder = function() end
    getWorldTranslation = function() return 10, 50, -20 end
    localDirectionToWorld = function() return 0, 0, -1 end
    g_time = 5000
    getAppBasePath = function() return "C:/Games/FS25/" end
    g_localPlayer = player
    g_farmManager = { getFarms = function() return { { farmId = 1, money = 123456.7 } } end }
    g_currentMission = {
        terrainSize = 2048,
        missionInfo = { map = {
            id = "FS25_Test.TestMap", title = "Test Map", baseDirectory = "C:/mods/FS25_Test/",
            mapXMLFilename = "map/map.xml", isModMap = true,
        } },
        hud = { ingameMap = { worldSizeX = 2048, mapExtensionScaleFactor = 0.5, mapExtensionOffsetX = 0.25 } },
        environment = {
            currentDay = 3, dayTime = (13 * 60 + 30) * 60000, currentSeason = 1,
            getDayAndDayTime = function(_, time, day) return day, time end,
            weather = {
                getCurrentMinMaxTemperatures = function() return 12, 21.04 end,
                getCurrentTemperatureTrend = function() return 1 end,
                getWeatherTypeAtTime = function() error("unknown in FS25") end,
            },
        },
    }
    local listener
    addModEventListener = function(l) listener = l end
    return player, vehicle, function() return listener end
end

test("whole mod streams hello, env, player and vehicles", function()
    if TMP_DIR == nil then
        print("skip whole-mod test (no TMP_DIR)")
        return
    end
    local player, vehicle, getListener = stubGame()
    load("src/collectors/Hello.lua")
    load("src/collectors/Env.lua")
    load("src/collectors/Player.lua")
    load("src/collectors/Vehicles.lua")
    load("src/Companion.lua")
    local mod = getListener()
    assert(mod ~= nil, "registered as a mod event listener")

    mod:loadMap("map")
    mod:update(16)
    player.currentVehicle = vehicle
    for _ = 1, 40 do
        mod:update(16)
    end
    mod:deleteMap()

    local ls = lines(readFile(TMP_DIR .. "/FS25_Companion/stream.ndjson"))
    assert(#ls > 5, "expected several lines, got " .. #ls)
    assert(ls[1]:find('"topic":"hello"', 1, true), "hello first: " .. ls[1])
    assert(ls[1]:find('"mapId":"FS25_Test.TestMap"', 1, true), ls[1])
    assert(ls[1]:find('"mapExtensionScaleFactor":0.5', 1, true), ls[1])
    assert(ls[1]:find('"gameDir":"C:/Games/FS25/"', 1, true), ls[1])
    local text = table.concat(ls, "\n")
    -- on foot: heading from the facing direction (east)
    assert(text:find('"heading":90,"inVehicle":false', 1, true), "on-foot player pose")
    -- in the vehicle: the vehicle's pose and forward vector (north)
    assert(text:find('"heading":0,"inVehicle":true,"vehicleId":7', 1, true), "in-vehicle player pose")
    assert(text:find('"controlledId":7', 1, true), "controlled vehicle")
    assert(text:find('"name":"Plow 3000"', 1, true), "implements")
    assert(text:find('"operatingHours":2', 1, true), "hours")
    -- a broken weather call drops only that value
    assert(text:find('"tempMax":21', 1, true), "env survives a failing weather call")
    assert(text:find('"money":{"1":123457}', 1, true), "money per farm")
    for i, line in ipairs(ls) do
        assert(line:find('"seq":' .. i .. ',', 1, true), "contiguous seq at line " .. i)
    end
end)

-- runner -------------------------------------------------------------------

for _, t in ipairs(tests) do
    local ok, err = pcall(t.fn)
    if ok then
        print("ok   " .. t.name)
    else
        print("FAIL " .. t.name .. ": " .. tostring(err))
        failures[#failures + 1] = t.name .. ": " .. tostring(err)
    end
end
print(string.format("%d tests, %d failed", #tests, #failures))
if #failures > 0 then
    error(#failures .. " Lua test(s) failed:\n" .. table.concat(failures, "\n"), 0)
end
