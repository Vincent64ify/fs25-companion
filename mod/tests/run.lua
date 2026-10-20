-- run.lua
-- Offline tests for the mod's pure parts: the JSON encoder, the heading
-- maths, the transport (writes and rotation), the scheduler (isolation of
-- failing collectors, resend after rotation) and the collectors against a
-- stubbed game API.
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

test("scheduler resets collectors and resends the last data after a rotation", function()
    local tr = fakeTransport()
    local s = Scheduler.new(tr, function() end)
    local resets = 0
    local sentOnce = false
    s:add({ topic = "hello", interval = nil, collect = function() return { hi = 1 } end })
    s:add({ topic = "once", interval = 0, resend = true,
        reset = function() resets = resets + 1 end,
        collect = function()
            if sentOnce then
                return nil
            end
            sentOnce = true
            return { big = true }
        end })
    s:add({ topic = "often", interval = 0, collect = function() return { n = 1 } end })
    eq(resets, 1, "reset when added")
    local ctx = { time = 1 }
    s:update(16, ctx)
    s:update(16, ctx)
    eq(#tr.sent, 3, "once + 2x often")
    tr.sent = {}
    s:resend(ctx)
    eq(#tr.sent, 2, "hello and the resend topic only")
    eq(tr.sent[1].topic, "hello")
    eq(tr.sent[2].topic, "once")
    eq(tr.sent[2].data.big, true)
end)

-- Collectors against a stubbed game ---------------------------------------

test("farmland grid samples cell centres in slices and run-length encodes", function()
    load("src/collectors/FarmlandGrid.lua")
    local grid = Companion.Collectors.FarmlandGrid
    local calls = 0
    g_currentMission = { terrainSize = 2048 }
    g_farmlandManager = {
        -- west half farmland 3, east half none (255); one lookup raises
        getFarmlandIdAtWorldPosition = function(_, x, z)
            calls = calls + 1
            if calls == 5000 then
                error("transient")
            end
            if x < 0 then
                return 3
            end
            return 255
        end,
    }
    grid.reset()
    local frames, data = 0, nil
    while data == nil and frames < 200 do
        frames = frames + 1
        local ok, result = pcall(grid.collect, {})
        if ok then
            data = result
        end
    end
    assert(data ~= nil, "grid finished")
    eq(data.cell, 4)
    eq(data.cols, 512)
    eq(data.rows, 512)
    eq(data.originX, -1024)
    eq(data.originZ, -1024)
    eq(frames, 65, "64 slices of 4096 cells plus the frame that raised")
    eq(calls, 512 * 512 + 1, "every cell once, the raising one twice")
    -- every row: 256 cells of farmland 3, then 256 of none
    eq(#data.runs, 512 * 2 * 2)
    eq(data.runs[1], 3)
    eq(data.runs[2], 256)
    eq(data.runs[3], 0, "255 becomes 0")
    eq(data.runs[4], 256)
    local cells = 0
    for i = 2, #data.runs, 2 do
        cells = cells + data.runs[i]
    end
    eq(cells, 512 * 512)
    eq(grid.collect({}), nil, "sent once")
    grid.reset()
    g_currentMission = { terrainSize = 8192 }
    local big = nil
    for _ = 1, 100 do
        big = grid.collect({}) or big
    end
    assert(big ~= nil, "large map grid finished")
    eq(big.cell, 16, "at most 512 cells a side")
end)

test("hotspots: PDA points only, named, sorted", function()
    load("src/collectors/Hotspots.lua")
    local function hotspot(category, name, x, z, extra)
        local h = extra or {}
        h.worldX, h.worldZ, h.ownerFarmId = x, z, h.ownerFarmId or 0
        h.getCategory = function() return category end
        if name ~= nil then
            h.getName = function() return name end
        end
        return h
    end
    g_currentMission = { hud = { ingameMap = { hotspots = {
        hotspot(9, "Mill", 173.0, 971.49),
        hotspot(1, nil, 0, 0, { name = "12" }),               -- field: skipped
        hotspot(5, nil, 1, 1),                                -- vehicle: skipped
        hotspot(12, "Vehicle Shop", -64, 277),
        hotspot(11, "Biogas", 586.5, 1011, { ownerFarmId = 15,
            getIsVisible = function() return false end }),
        hotspot(13, nil, 5, 5, { name = "Farm house" }),       -- name field fallback
        hotspot(9, "Bakery", -12, 3),
        { getCategory = function() error("broken") end },     -- dropped, not fatal
    } } } }
    local list = Companion.Collectors.Hotspots.collect({}).hotspots
    eq(#list, 5)
    eq(list[1].name, "Bakery", "sorted by category, then x")
    eq(list[2].name, "Mill")
    eq(list[2].z, 971.5)
    eq(list[3].category, 11)
    eq(list[3].visible, false)
    eq(list[3].farmId, 15)
    eq(list[4].name, "Vehicle Shop")
    eq(list[4].visible, true)
    eq(list[5].name, "Farm house")
end)

test("farmlands: owner, price and area per farmland", function()
    load("src/collectors/Farmlands.lua")
    g_farmlandManager = { farmlands = {
        [7] = { id = 7, farmId = 1, price = 98137.2, areaInHa = 1.5098, xWorldPos = -876.02,
            zWorldPos = -941.5, name = "7", showOnFarmlandsScreen = true },
        [2] = { id = 2, farmId = 0, price = 259148.5, areaInHa = 3.9869, xWorldPos = 1, zWorldPos = 2 },
        [3] = { id = 3, price = 1, showOnFarmlandsScreen = false },
    } }
    local list = Companion.Collectors.Farmlands.collect({}).farmlands
    eq(#list, 3)
    eq(list[1].id, 2, "sorted by id")
    eq(list[1].farmId, 0)
    eq(list[1].price, 259149)
    eq(list[1].listed, true)
    eq(list[2].farmId, 0, "missing farmId = unowned")
    eq(list[2].listed, false)
    eq(list[3].farmId, 1)
    eq(list[3].areaHa, 1.51)
    eq(list[3].x, -876)
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
    local parked = {
        id = 9, rootNode = 66, typeName = "trailer", propertyState = 2,
        getFullName = function() return "Farmtech EDK 650" end,
        getOwnerFarmId = function() return 1 end,
        getIsAIActive = function() return false end,
        getAttacherVehicle = function() return nil end,
    }
    local hitched = {
        id = 8, rootNode = 77, typeName = "shovel",
        getFullName = function() return "Bucket" end,
        getOwnerFarmId = function() return 1 end,
        getAttacherVehicle = function() return vehicle end,
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
    g_farmlandManager = {
        farmlands = { { id = 1, farmId = 1, price = 1000, areaInHa = 2 } },
        getFarmlandIdAtWorldPosition = function(_, x) return x < 0 and 1 or 255 end,
    }
    g_farmManager = { getFarms = function() return { { farmId = 1, money = 123456.7 } } end }
    g_currentMission = {
        terrainSize = 2048,
        missionInfo = { map = {
            id = "FS25_Test.TestMap", title = "Test Map", baseDirectory = "C:/mods/FS25_Test/",
            mapXMLFilename = "map/map.xml", isModMap = true,
        } },
        hud = { ingameMap = {
            worldSizeX = 2048, mapExtensionScaleFactor = 0.5, mapExtensionOffsetX = 0.25,
            hotspots = { {
                worldX = 829.35, worldZ = -407.95, ownerFarmId = 0,
                getCategory = function() return 9 end,
                getName = function() return "Carrefour" end,
            } },
        } },
        vehicleSystem = { vehicles = { parked, vehicle, hitched } },
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

test("whole mod streams every topic", function()
    if TMP_DIR == nil then
        print("skip whole-mod test (no TMP_DIR)")
        return
    end
    local player, vehicle, getListener = stubGame()
    load("src/collectors/Hello.lua")
    load("src/collectors/Env.lua")
    load("src/collectors/Player.lua")
    load("src/collectors/Vehicles.lua")
    load("src/collectors/Hotspots.lua")
    load("src/collectors/Farmlands.lua")
    load("src/collectors/FarmlandGrid.lua")
    load("src/Companion.lua")
    local mod = getListener()
    assert(mod ~= nil, "registered as a mod event listener")

    mod:loadMap("map")
    mod:update(16)
    player.currentVehicle = vehicle
    -- long enough for the farmland grid (64 slices)
    for _ = 1, 80 do
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
    -- every vehicle, detail only for the controlled one
    assert(text:find('"id":9,"isAI":false,"motorized":false,"name":"Farmtech EDK 650"', 1, true),
        "parked trailer")
    assert(text:find('"attached":true,"farmId":1,"heading":0,"id":8', 1, true), "hitched bucket")
    assert(text:find('"name":"Carrefour"', 1, true), "hotspots")
    assert(text:find('"topic":"farmlands"', 1, true), "farmlands")
    local gridLines = 0
    for _, line in ipairs(ls) do
        if line:find('"topic":"farmland_grid"', 1, true) then
            gridLines = gridLines + 1
            assert(line:find('"runs":[1,256,0,256,1,256', 1, true), "grid runs: " .. line:sub(1, 120))
        end
    end
    eq(gridLines, 1, "grid sent once")
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
