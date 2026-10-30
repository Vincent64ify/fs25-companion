-- run.lua
-- Offline tests for the mod's pure parts: the JSON encoder, the heading
-- maths, the transport (writes and rotation), the scheduler (isolation of
-- failing collectors, resend after rotation), the collectors and the
-- command reader against a stubbed game API.
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
load("src/VehicleState.lua")
load("src/Commands.lua")

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

-- %c follows the C locale: under a UTF-8 one (macOS) it caught 0x96, the
-- second byte of Ö, and split the character (code review F5)
test("json escaping keeps every byte above 0x1f, in any locale", function()
    local high = {}
    for b = 0x20, 0xff do
        if b ~= 0x22 and b ~= 0x5c then high[#high + 1] = string.char(b) end
    end
    high = table.concat(high)
    local old = os.setlocale and os.setlocale(nil, "ctype")
    for _, locale in ipairs({ "C", "en_US.UTF-8", "C.UTF-8", ".UTF8" }) do
        if os.setlocale == nil or os.setlocale(locale, "ctype") ~= nil then
            eq(Json.encode("PÖTTINGER"), '"PÖTTINGER"', locale)
            eq(Json.encode("日本 🚜"), '"日本 🚜"', locale)
            eq(Json.encode(high), '"' .. high .. '"', locale)
            eq(Json.encode("\0\31\b\f\n\r\t"), '"\\u0000\\u001f\\b\\f\\n\\r\\t"', locale)
        end
    end
    if old ~= nil then os.setlocale(old, "ctype") end
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

test("vehicles: T6 values from spec fields, missing ones left out", function()
    load("src/collectors/Vehicles.lua")
    getWorldTranslation = function() return 0, 0, 0 end
    localDirectionToWorld = function() return 0, 0, -1 end
    FillType = { UNKNOWN = 0, DIESEL = 1, DEF = 2 }
    g_fillTypeManager = nil
    g_storeManager, g_brandManager = nil, nil
    local trailer = {
        id = 2, typeName = "trailer",
        -- an empty unit, a hidden one and one without capacity
        spec_fillUnit = { fillUnits = {
            { capacity = 500, fillLevel = 0, fillType = 0 },
            { capacity = 100, fillLevel = 50, fillType = 9, showOnHud = false },
            { capacity = 0, fillLevel = 0 },
        } },
        -- turned on, but no PTO
        spec_powerConsumer = { ptoRpm = 0 },
        getIsTurnedOn = function() return true end,
    }
    local tractor = {
        id = 1, rootNode = 1, typeName = "tractor",
        spec_motorized = { lastFuelUsage = -0.01 },
        spec_drivable = { cruiseControl = { state = 2, speed = 22.25, maxSpeed = 50 } },
        -- a drawbar: upper and lower alpha alike
        spec_attacherJoints = { attacherJoints = { { moveAlpha = 0, upperAlpha = 0, lowerAlpha = 0 } } },
        getAttachedImplements = function() return { { object = trailer, jointDescIndex = 1 } } end,
        getIsAIActive = function() return true end,
        spec_aiJobVehicle = { job = { getTitle = function() return "" end } },
    }
    g_localPlayer = { getCurrentVehicle = function() return tractor end }
    g_currentMission = { vehicleSystem = { vehicles = { tractor } } }
    local v = Companion.Collectors.Vehicles.collect({}).vehicles[1]
    eq(v.fuelUsage, 0, "usage from lastFuelUsage, never negative")
    eq(v.def, nil, "no DEF unit")
    eq(v.cruise.state, "full", "cruise from the spec")
    eq(v.cruise.speed, 22.3)
    eq(v.fills, nil, "no fill units")
    eq(v.pto, nil, "no implement with a PTO")
    eq(v.ai, nil, "a job without a title or helper")
    local impl = v.implements[1]
    eq(impl.hitch, nil, "a drawbar has no hitch position")
    eq(impl.pto, nil, "no PTO")
    eq(#impl.fills, 1, "only the empty unit")
    eq(impl.fills[1].capacity, 500)
    eq(impl.fills[1].level, 0)
    eq(impl.fills[1].fillType, nil, "empty: no fill type")
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

local function stubField(id, extra)
    local f = extra or {}
    f.getId = function() return id end
    f.posX, f.posZ, f.areaHa = f.posX or id * 10, f.posZ or -id * 10, f.areaHa or 3.53614
    return f
end

test("field outlines: nodes first, polygon fallback, sent once", function()
    load("src/collectors/FieldOutlines.lua")
    local outlines = Companion.Collectors.FieldOutlines
    local nodes = { [101] = { 10.04, 50, 20 }, [102] = { 30, 50, 20 }, [103] = { 30, 50, 40.06 } }
    getWorldTranslation = function(node)
        local p = nodes[node]
        if p == nil then
            error("no node " .. tostring(node))
        end
        return p[1], p[2], p[3]
    end
    g_fieldManager = nil
    outlines.reset()
    eq(outlines.collect({}), nil, "no field manager yet")
    g_fieldManager = { fields = {} }
    eq(outlines.collect({}), nil, "no fields yet")
    g_fieldManager = { fields = {
        stubField(2, { polygonPoints = { 101, 102, 103 } }),
        -- a node that raises: falls back to the density map polygon
        stubField(1, { polygonPoints = { 101, 999, 103 },
            densityMapPolygon = { pointsX = { 0, 5, 5 }, pointsZ = { 0, 0, 5 } } }),
        stubField(3, { densityMapPolygon = { pointsX = { 0, 1 }, pointsZ = { 0, 1 } } }), -- too few
        { posX = 1 }, -- no id
    } }
    local list = outlines.collect({}).fields
    eq(#list, 2)
    eq(list[1].id, 1, "sorted by id")
    eq(Json.encode(list[1].points), "[0,0,5,0,5,5]")
    eq(list[2].id, 2)
    eq(Json.encode(list[2].points), "[10,20,30,20,30,40.1]")
    eq(outlines.collect({}), nil, "sent once")
    outlines.reset()
    assert(outlines.collect({}) ~= nil, "sent again after reset (new map)")
end)

test("fields: state per field, invalid state left out", function()
    load("src/collectors/Fields.lua")
    g_fieldManager = { fields = {
        stubField(5, { farmland = { id = 7 }, fieldState = {
            isValid = true, fruitTypeIndex = 1, growthState = 4, groundType = 7,
            sprayLevel = 1, sprayType = 1, limeLevel = 0, plowLevel = 1, rollerLevel = 0,
            stubbleShredLevel = 0, weedState = 2, stoneLevel = 1, ownerFarmId = 15,
        } }),
        stubField(2, { fieldState = { isValid = false, fruitTypeIndex = 3 } }),
    } }
    local list = Companion.Collectors.Fields.collect({}).fields
    eq(#list, 2)
    eq(list[1].id, 2)
    eq(list[1].fruitTypeIndex, nil, "invalid state not sent")
    eq(list[1].areaHa, 3.54)
    local f = list[2]
    eq(f.farmlandId, 7)
    eq(f.x, 50)
    eq(f.z, -50)
    eq(f.fruitTypeIndex, 1)
    eq(f.growthState, 4)
    eq(f.limeLevel, 0)
    eq(f.weedState, 2)
    eq(f.ownerFarmId, nil, "owner comes from the farmlands topic")
end)

test("crop types: PDA colours, growth stages, ground types, levels", function()
    load("src/collectors/CropTypes.lua")
    local crops = Companion.Collectors.CropTypes
    FieldGroundType = { NONE = 0, PLOWED = 4, CULTIVATED = 2, getName = function() end, lower = 1 }
    g_fieldManager = { limeLevelMaxValue = 3, plowLevelMaxValue = 1, sprayLevelMaxValue = 2 }
    g_fruitTypeManager = { fruitTypes = {
        [2] = { index = 2, name = "BARLEY", defaultMapColor = { r = 0.5, g = 0.4, b = 0.1, a = 1 },
            numGrowthStates = 7, minHarvestingGrowthState = 7, maxHarvestingGrowthState = 7,
            witheredState = 8, cutState = 9, regrows = false },
        [1] = { index = 1, name = "WHEAT", fillType = { title = "Wheat" },
            defaultMapColor = { 0.47931, 0.3613, 0.0103, 1 }, colorBlindMapColor = { 1, 1, 0, 1 },
            numGrowthStates = 8, minHarvestingGrowthState = 8, maxHarvestingGrowthState = 8,
            witheredState = 9, cutState = 10, minPreparingGrowthState = -1,
            growthStateToName = { [1] = "invisible", [8] = "harvestReady" }, shownOnMap = true },
        [3] = { name = "BROKEN" }, -- no index: left out
    } }
    crops.reset()
    local data = crops.collect({})
    eq(#data.fruits, 2)
    local wheat = data.fruits[1]
    eq(wheat.index, 1)
    eq(wheat.title, "Wheat")
    eq(Json.encode(wheat.color), "[0.4793,0.3613,0.0103]")
    eq(Json.encode(wheat.colorBlindColor), "[1,1,0]")
    eq(wheat.minHarvest, 8)
    eq(wheat.withered, 9)
    eq(wheat.cut, 10)
    eq(wheat.minPrepare, -1)
    eq(wheat.stateNames["8"], "harvestReady")
    eq(wheat.shownOnMap, true)
    eq(Json.encode(data.fruits[2].color), "[0.5,0.4,0.1]", "r/g/b keys")
    eq(data.fruits[2].stateNames, nil)
    eq(data.groundTypes.PLOWED, 4)
    eq(data.groundTypes.getName, nil, "functions skipped")
    eq(data.groundTypes.lower, nil, "constants only")
    eq(data.levels.lime, 3)
    eq(data.levels.spray, 2)
    eq(crops.collect({}), nil, "sent once")
    FieldGroundType = nil
    crops.reset()
    eq(crops.collect({}).groundTypes, nil, "no FieldGroundType")
end)

-- Vehicle state, cab and commands ------------------------------------------

test("vehicle state: lights from the mask and turn state, old names as a fallback", function()
    local VehicleState = Companion.VehicleState
    Lights = nil
    local l = VehicleState.lights({ spec_lights = { lightsTypesMask = 1 + 8, beaconLightsActive = true, turnLightState = 3 } })
    eq(l.on, true, "on")
    eq(l.high, true, "high beam bit")
    eq(l.beacon, true, "beacon")
    eq(l.hazard, true, "hazard")
    eq(l.left, false, "left")
    l = VehicleState.lights({ spec_lights = { lightsTypesMask = 0, turnLightState = 1 } })
    eq(l.on, false, "off")
    eq(l.high, false)
    eq(l.left, true, "left turn")
    eq(l.beacon, false)
    Lights = { TURNLIGHT_LEFT = 5 }
    eq(VehicleState.lights({ spec_lights = { turnLightState = 5 } }).left, true, "the game's constants win")
    Lights = nil
    l = VehicleState.lights({ spec_lights = { isLightOn = true, beaconOn = true, hazardOn = true } })
    eq(l.on, true, "old names")
    eq(l.beacon, true)
    eq(l.hazard, true)
    eq(VehicleState.lights({}), nil, "no lights")
    eq(l.stage, nil, "no light states: no stage")
    -- light stages: the step when the game keeps it, else matched by mask
    local states = { { 0 }, { 0, 1 }, { lightTypes = { 0, 1, 2 } } }
    l = VehicleState.lights({ spec_lights = { lightStates = states, currentLightState = 2, lightsTypesMask = 3 } })
    eq(l.stage, 2, "stage from currentLightState")
    eq(l.stages, 3)
    l = VehicleState.lights({ spec_lights = { lightStates = states, lightsTypesMask = 1 + 2 + 4 + 8 } })
    eq(l.stage, 3, "stage from the mask, the high beam left out")
    eq(VehicleState.lights({ spec_lights = { lightStates = states, lightsTypesMask = 8 } }).stage, 0,
        "only the high beam: stage 0")
    l = VehicleState.lights({ spec_lights = { lightStates = states, lightsTypesMask = 1 + 16 } })
    eq(l.stage, 1, "a light outside the stages (reverse) is left out of the match")
    eq(l.on, true)
    -- reversing with the lights off (live, C1): the reverse light is in
    -- the mask, but no stage is on
    l = VehicleState.lights({ spec_lights = { lightStates = states, currentLightState = 0, lightsTypesMask = 32 } })
    eq(l.on, false, "reverse light only, by the step: off")
    eq(l.stage, 0)
    l = VehicleState.lights({ spec_lights = { lightStates = states, lightsTypesMask = 32 } })
    eq(l.on, false, "reverse light only, by the mask: off")
    eq(l.stage, 0)
    l = VehicleState.lights({ spec_lights = { lightStates = { { 0 }, { 0, 2 } }, lightsTypesMask = 4 } })
    eq(l.stage, nil, "a mix no stage has: unknown")
    eq(l.on, true, "but a stage's light is on")
    eq(VehicleState.lights({ spec_lights = { lightsTypesMask = 32 } }).on, true,
        "no stages known: any light counts, as before")
    eq(VehicleState.engineOn({}), nil, "no engine")
    eq(VehicleState.engineOn({ spec_motorized = {}, getIsMotorStarted = function() return true end }), true)
end)

local function cabVehicle()
    local implement = {
        lowered = true,
        getIsLowered = function(self) return self.lowered end,
        getIsTurnedOn = function() return false end,
    }
    local vehicle = {
        id = 7,
        spec_lights = { lightsTypesMask = 0 },
        spec_motorized = {},
        getIsMotorStarted = function() return true end,
        getCruiseControlState = function() return 0 end,
        getCruiseControlSpeed = function() return 12 end,
        getAttachedImplements = function() return { { object = implement } } end,
    }
    return vehicle, implement
end

test("cab: the controlled vehicle's switches, sent only on change", function()
    load("src/collectors/Cab.lua")
    local Cab = Companion.Collectors.Cab
    Cab.reset()
    local vehicle, implement = cabVehicle()
    local player = { vehicle = nil }
    player.getCurrentVehicle = function(self) return self.vehicle end
    g_localPlayer = player
    local cab = Cab.collect({})
    eq(cab.inVehicle, false, "on foot")
    eq(Cab.collect({}), nil, "unchanged: nothing sent")
    player.vehicle = vehicle
    cab = Cab.collect({})
    eq(cab.inVehicle, true)
    eq(cab.vehicleId, 7)
    eq(cab.engineOn, true)
    eq(cab.lights.on, false)
    eq(cab.cruise.state, "off")
    eq(cab.cruise.speed, 12)
    eq(cab.implements[1].lowered, true)
    eq(Cab.collect({}), nil, "unchanged")
    vehicle.spec_lights.lightsTypesMask = 1
    eq(Cab.collect({}).lights.on, true, "lights on: sent")
    implement.lowered = false
    eq(Cab.collect({}).implements[1].lowered, false, "implement raised: sent")
    eq(Cab.collect({}), nil)
end)

-- the game's file functions over plain Lua io, and a writer for command
-- files as the client writes them (into <dir><n>.xml)
local function commandStubs(dir)
    fileExists = function(path)
        local f = io.open(path, "r")
        if f ~= nil then
            f:close()
            return true
        end
        return false
    end
    deleteFile = function(path) os.remove(path) end
    createFolder = function() end
    XMLFile = {
        loads = 0,
        load = function(_, path)
            XMLFile.loads = XMLFile.loads + 1
            local f = io.open(path, "r")
            if f == nil then
                return nil
            end
            local text = f:read("*a")
            f:close()
            return {
                getString = function(_, key)
                    local attr = key:match("#(.+)$")
                    return text:match(attr .. '="([^"]*)"')
                end,
                delete = function() end,
            }
        end,
    }
    return function(id, session, action, ref, value)
        local f = assert(io.open(string.format("%s%d.xml", dir, id), "w"))
        f:write(string.format('<command session="%s" id="%d" action="%s" ref="%s"%s/>',
            session, id, action, ref or ("r" .. id),
            value ~= nil and string.format(' value="%.3f"', value) or ""))
        f:close()
    end
end

test("commands: next file in order, session and allow-list checked, input event first", function()
    if TMP_DIR == nil then
        print("skip commands test (no TMP_DIR)")
        return
    end
    -- a file name prefix stands in for the cmd/ folder
    local dir = TMP_DIR .. "/cmdunit_"
    local write = commandStubs(dir)
    local logged = {}
    local commands = Companion.Commands.new(dir, "S1", function(m) logged[#logged + 1] = m end)
    eq(commands:info().next, 1)
    eq(commands:poll(), nil, "no file: nothing")
    eq(XMLFile.loads, 0, "nothing read without a file")

    local vehicle = { spec_lights = { lightsTypesMask = 0 } }
    vehicle.setLightsTypesMask = function(self, mask) self.spec_lights.lightsTypesMask = mask end
    local player = { vehicle = nil }
    player.getCurrentVehicle = function(self) return self.vehicle end
    g_localPlayer = player
    g_inputBinding = nil

    -- a file left from an earlier session is removed, and 1 stays next
    write(1, "OLD", "TOGGLE_LIGHTS")
    eq(commands:poll(), nil, "stale session: no ack")
    eq(fileExists(dir .. "1.xml"), false, "stale file deleted")
    eq(commands:info().next, 1, "still waiting for this session's 1")

    write(1, "S1", "TOGGLE_LIGHTS", "abc")
    local ack = commands:poll()
    eq(ack.id, 1)
    eq(ack.ref, "abc")
    eq(ack.ok, false, "on foot")
    eq(ack.reason, "not in a vehicle")
    eq(commands:info().next, 2)
    eq(commands:poll(), nil, "1 is done: waits for 2")

    write(2, "S1", "TOGGLE_ENGINE_EVERYTHING")
    ack = commands:poll()
    eq(ack.ok, false)
    eq(ack.reason, "action not allowed")

    -- in a vehicle with no active input event: the setter
    player.vehicle = vehicle
    write(3, "S1", "TOGGLE_LIGHTS")
    ack = commands:poll()
    eq(ack.ok, true, "fallback ran")
    eq(ack.reason, nil)
    eq(vehicle.spec_lights.lightsTypesMask, 1, "lights on")

    -- the input event's callback, as a key press calls it
    local calls = {}
    local action = { name = "TOGGLE_LIGHTS" }
    g_inputBinding = {
        nameActions = { TOGGLE_LIGHTS = action },
        actionEvents = { [action] = {
            { isActive = false, callback = function() calls[#calls + 1] = "inactive" end },
            { isActive = true, targetObject = vehicle, callbackState = 4,
              callback = function(target, name, value, state, analog)
                  calls[#calls + 1] = { target = target, name = name, value = value, state = state, analog = analog }
              end },
        } },
    }
    write(4, "S1", "TOGGLE_LIGHTS")
    ack = commands:poll()
    eq(ack.ok, true)
    eq(#calls, 1, "only the active event")
    eq(calls[1].target, vehicle)
    eq(calls[1].name, "TOGGLE_LIGHTS")
    eq(calls[1].value, 1)
    eq(calls[1].state, 4)
    eq(calls[1].analog, false)
    eq(vehicle.spec_lights.lightsTypesMask, 1, "no fallback when the event ran")

    -- the action and its fallback both fail: reported, and the queue goes on
    g_inputBinding.actionEvents[action] = { { isActive = true, callback = function() error("boom") end } }
    vehicle.setLightsTypesMask = function() error("boom") end
    write(5, "S1", "TOGGLE_LIGHTS")
    ack = commands:poll()
    eq(ack.ok, false)
    eq(ack.reason, "failed in game")
    eq(#logged, 3, "the setter and the input path logged once each, then the failure")
    eq(logged[3]:find("failed", 1, true) ~= nil, true)
    eq(commands:info().next, 6)
    g_inputBinding = nil
end)

-- Controls C2: every action, the selected implement, the cab's new state ----

-- an input binding where the given input actions have one active event
-- each; calls[name] collects the values they were called with
local function bindInputs(names, target)
    local calls, nameActions, actionEvents = {}, {}, {}
    for _, name in ipairs(names) do
        local action = { name = name }
        nameActions[name] = action
        actionEvents[action] = { {
            isActive = true, targetObject = target,
            callback = function(_, actionName, value)
                calls[actionName] = calls[actionName] or {}
                table.insert(calls[actionName], value)
            end,
        } }
    end
    g_inputBinding = { nameActions = nameActions, actionEvents = actionEvents }
    return calls
end

local function c2Tractor()
    local implement = {
        typeName = "cultivator",
        lowered = false, on = false, unfolded = false, foldDirection = 1,
        getFullName = function() return "Rubin 12" end,
        getIsLowered = function(self) return self.lowered end,
        getIsTurnedOn = function(self) return self.on end,
        getIsUnfolded = function(self) return self.unfolded end,
        getToggledFoldDirection = function(self) return self.foldDirection end,
        setFoldState = function(self, direction) self.foldedTo = direction end,
        setIsTurnedOn = function(self, on) self.on = on end,
        spec_foldable = { foldingParts = { { animationName = "fold" } } },
        spec_turnOnVehicle = {},
        playing = false,
        getIsAnimationPlaying = function(self, name) return name == "fold" and self.playing end,
    }
    local vehicle = {
        id = 3,
        spec_lights = { lightsTypesMask = 1, beaconLightsActive = false, turnLightState = 0 },
        spec_motorized = {},
        spec_drivable = { cruiseControl = { state = 0, speed = 12, maxSpeed = 40, speedReverse = 9 } },
        started = true,
        getIsMotorStarted = function(self) return self.started end,
        stopMotor = function(self) self.started = false end,
        startMotor = function(self) self.started = true end,
        getCruiseControlState = function(self) return self.spec_drivable.cruiseControl.state end,
        setCruiseControlState = function(self, s) self.spec_drivable.cruiseControl.state = s end,
        setCruiseControlMaxSpeed = function(self, speed, reverse)
            self.spec_drivable.cruiseControl.speed = speed
            self.reverseSet = reverse
        end,
        setLightsTypesMask = function(self, m) self.spec_lights.lightsTypesMask = m end,
        setBeaconLightsVisibility = function(self, on) self.spec_lights.beaconLightsActive = on end,
        setTurnLightState = function(self, s) self.spec_lights.turnLightState = s end,
        getIsAIActive = function() return false end,
        attached = { { object = implement } },
        getAttachedImplements = function(self) return self.attached end,
        getSelectedVehicle = function(self) return self.attached[1] and self.attached[1].object or self end,
        handleLowerImplementEvent = function(_, object) object.lowered = not object.lowered end,
        detachImplementByObject = function(self, object)
            if self.attached[1] and self.attached[1].object == object then
                self.attached = {}
            end
        end,
    }
    implement.getAttacherVehicle = function() return vehicle end
    local player = { vehicle = vehicle }
    player.getCurrentVehicle = function(self) return self.vehicle end
    g_localPlayer = player
    Lights = nil
    return vehicle, implement, player
end

local function c2Commands()
    local dir = TMP_DIR .. "/c2cmd_"
    local write = commandStubs(dir)
    local logged = {}
    local commands = Companion.Commands.new(dir, "S2", function(m) logged[#logged + 1] = m end)
    local n = 0
    local function run(action)
        n = n + 1
        write(n, "S2", action)
        return commands:poll()
    end
    return run, logged
end

test("commands C2: each action runs its input event, as the key does", function()
    if TMP_DIR == nil then
        print("skip commands C2 test (no TMP_DIR)")
        return
    end
    local vehicle = c2Tractor()
    local run = c2Commands()
    -- Attach: something in reach (specs/0003)
    vehicle.spec_attacherJoints = { attachableInfo = { attachable = {} } }
    local expected = {
        TOGGLE_HIGH_BEAM_LIGHT = "TOGGLE_HIGH_BEAM_LIGHT",
        TOGGLE_BEACON_LIGHTS = "TOGGLE_BEACON_LIGHTS",
        TOGGLE_TURNLIGHT_HAZARD = "TOGGLE_TURNLIGHT_HAZARD",
        TOGGLE_TURNLIGHT_LEFT = "TOGGLE_TURNLIGHT_LEFT",
        TOGGLE_TURNLIGHT_RIGHT = "TOGGLE_TURNLIGHT_RIGHT",
        TOGGLE_MOTOR_STATE = "TOGGLE_MOTOR_STATE",
        TOGGLE_CRUISE_CONTROL = "TOGGLE_CRUISE_CONTROL",
        TOGGLE_AI = "TOGGLE_AI",
        LOWER_IMPLEMENT = "LOWER_IMPLEMENT",
        FOLD_IMPLEMENT = "IMPLEMENT_EXTRA2",
        TURN_ON_IMPLEMENT = "IMPLEMENT_EXTRA",
        HITCH = "ATTACH",
    }
    local names = {}
    for _, input in pairs(expected) do
        names[#names + 1] = input
    end
    names[#names + 1] = "DETACH"
    local calls = bindInputs(names, vehicle)
    for action, input in pairs(expected) do
        local ack = run(action)
        eq(ack.ok, true, action)
        eq(ack.via, input, action .. " via")
        eq(calls[input] ~= nil and calls[input][1], 1, action .. " input value")
    end
    eq(calls.DETACH, nil, "Hitch is the attach key (Q), never DETACH")
    -- nothing attached: still the attach key
    vehicle.attached = {}
    eq(run("HITCH").via, "ATTACH", "nothing attached: ATTACH")
    g_inputBinding = nil
end)

test("commands C2: setters when no key event is active, single cruise steps", function()
    if TMP_DIR == nil then
        return
    end
    local vehicle, implement, player = c2Tractor()
    local run, logged = c2Commands()
    g_inputBinding = nil
    local function setter(action)
        local ack = run(action)
        eq(ack.ok, true, action .. " ok (" .. tostring(ack.reason) .. ")")
        eq(ack.via, "setter", action .. " via")
    end
    setter("TOGGLE_HIGH_BEAM_LIGHT")
    eq(vehicle.spec_lights.lightsTypesMask, 9, "high beam bit set, front lights kept")
    setter("TOGGLE_BEACON_LIGHTS")
    eq(vehicle.spec_lights.beaconLightsActive, true)
    setter("TOGGLE_TURNLIGHT_LEFT")
    eq(vehicle.spec_lights.turnLightState, 1)
    setter("TOGGLE_TURNLIGHT_HAZARD")
    eq(vehicle.spec_lights.turnLightState, 3, "left to hazard")
    setter("TOGGLE_TURNLIGHT_HAZARD")
    eq(vehicle.spec_lights.turnLightState, 0, "hazard off")
    setter("TOGGLE_MOTOR_STATE")
    eq(vehicle.started, false, "engine stopped")
    setter("TOGGLE_CRUISE_CONTROL")
    eq(vehicle.spec_drivable.cruiseControl.state, 1, "cruise on")
    setter("CRUISE_SPEED_UP")
    eq(vehicle.spec_drivable.cruiseControl.speed, 13, "one km/h up")
    eq(vehicle.reverseSet, 9, "the reverse speed kept")
    setter("CRUISE_SPEED_DOWN")
    setter("CRUISE_SPEED_DOWN")
    eq(vehicle.spec_drivable.cruiseControl.speed, 11, "two down")
    -- in reverse: still the one set speed, the game's reverse value untouched
    vehicle.movingDirection = -1
    setter("CRUISE_SPEED_UP")
    eq(vehicle.spec_drivable.cruiseControl.speed, 12, "the main speed, also in reverse")
    eq(vehicle.reverseSet, 9, "the reverse value passed through")
    vehicle.movingDirection = 1
    vehicle.spec_drivable.cruiseControl.speed = 40
    setter("CRUISE_SPEED_UP")
    eq(vehicle.spec_drivable.cruiseControl.speed, 40, "not past the top speed")
    setter("LOWER_IMPLEMENT")
    eq(implement.lowered, true)
    setter("FOLD_IMPLEMENT")
    eq(implement.foldedTo, 1, "folds the way the game says")
    setter("TURN_ON_IMPLEMENT")
    eq(implement.on, true)
    local ack = run("TOGGLE_AI")
    eq(ack.ok, false, "AI: only through its key")
    eq(ack.reason, "not available now")
    -- Attach only attaches, and only while the game has something in reach
    -- (specs/0003): no key, no detach fallback
    ack = run("HITCH")
    eq(ack.ok, false, "nothing to attach in reach")
    eq(ack.reason, "nothing in reach")
    eq(#vehicle.attached, 1, "Attach never detaches")
    vehicle.attached = {}
    ack = run("FOLD_IMPLEMENT")
    eq(ack.reason, "can't fold", "no implement, and the vehicle doesn't fold")
    vehicle.spec_foldable = {}
    vehicle.getToggledFoldDirection = function() return -1 end
    vehicle.setFoldState = function(self, direction) self.foldedTo = direction end
    setter("FOLD_IMPLEMENT")
    eq(vehicle.foldedTo, -1, "no implement: the vehicle folds itself (a combine)")
    vehicle.spec_foldable, vehicle.getToggledFoldDirection, vehicle.setFoldState = nil, nil, nil
    eq(run("LOWER_IMPLEMENT").reason, "no implement", "implement actions need one")
    -- the cruise step goes through the axis when there's no setter
    vehicle.setCruiseControlMaxSpeed = nil
    local calls = bindInputs({ "AXIS_CRUISE_CONTROL" }, vehicle)
    ack = run("CRUISE_SPEED_DOWN")
    eq(ack.via, "AXIS_CRUISE_CONTROL")
    eq(calls.AXIS_CRUISE_CONTROL[1], -1, "the axis, down")
    g_inputBinding = nil
    -- each path is logged once
    local seen = {}
    for _, line in ipairs(logged) do
        assert(not seen[line], "logged twice: " .. line)
        seen[line] = true
    end
    assert(seen["command CRUISE_SPEED_UP via setter"], "the path is logged")
    player.vehicle = nil
    eq(run("TOGGLE_MOTOR_STATE").reason, "not in a vehicle")
end)

test("vehicle state C2: motor state, driving direction, both cruise speeds", function()
    local VS = Companion.VehicleState
    MotorState = { OFF = 1, STARTING = 2, ON = 3, IGNITION = 4 }
    local v = { spec_motorized = {}, motorState = 2 }
    v.getMotorState = function(self) return self.motorState end
    eq(VS.engineState(v), "starting")
    v.motorState = 3
    eq(VS.engineState(v), "on")
    v.motorState = 4
    eq(VS.engineState(v), "off", "ignition only: off")
    MotorState = nil
    eq(VS.engineState({ spec_motorized = {}, getIsMotorStarted = function() return true end }), "on",
        "no motor states: on / off")
    eq(VS.engineState({}), nil, "no engine")
    eq(VS.reversing({ getMotor = function() return { currentDirection = -1 } end }), true, "the motor's direction")
    eq(VS.reversing({ getGearInfoToDisplay = function() return "R" end }), true, "a reverse gear")
    eq(VS.reversing({ getGearInfoToDisplay = function() return "-2" end }), true)
    eq(VS.reversing({ getGearInfoToDisplay = function() return "3" end, movingDirection = 1 }), false)
    local c = VS.cruise({ spec_drivable = { cruiseControl = { state = 1, speed = 15, speedReverse = 8, maxSpeed = 40 } },
        movingDirection = -1 })
    eq(c.speed, 15, "the one set speed")
    eq(c.maxSpeed, 40)
    eq(c.speedReverse, nil, "no reverse speed on the dashboard")
    eq(c.reverse, nil)
    -- the reverse cruise check goes to the log once per vehicle, first time in reverse
    VS.resetDiagnostics()
    local logged = {}
    local log = function(m) logged[#logged + 1] = m end
    local v = { id = 4, typeName = "tractor", movingDirection = 1,
        spec_drivable = { cruiseControl = { speed = 3, speedReverse = 33, maxSpeedReverse = 33 } },
        getMotor = function() return { maxBackwardSpeed = 9.2, getMaximumBackwardSpeed = function() return 9.2 end } end }
    eq(VS.dumpReverseCruise(v, log), false, "forward: nothing")
    v.movingDirection = -1
    eq(VS.dumpReverseCruise(v, log), true, "the first time in reverse")
    eq(VS.dumpReverseCruise(v, log), false, "once per vehicle")
    eq(#logged, 1)
    assert(logged[1]:find("speedReverse=33", 1, true), logged[1])
    assert(logged[1]:find("motor:getMaximumBackwardSpeed=9.2", 1, true), logged[1])
    assert(logged[1]:find("maxBackwardSpeed=9.2", 1, true), logged[1])
end)

test("commands C2: an absolute cruise speed, clamped, for the current direction", function()
    if TMP_DIR == nil then
        return
    end
    local vehicle = c2Tractor()
    g_inputBinding = nil
    local dir = TMP_DIR .. "/c2set_"
    commandStubs(dir)
    local commands = Companion.Commands.new(dir, "S3", function() end)
    local n = 0
    local function set(value)
        n = n + 1
        local f = assert(io.open(string.format("%s%d.xml", dir, n), "w"))
        f:write(string.format('<command session="S3" id="%d" action="CRUISE_SET_SPEED" ref="r%d"%s/>',
            n, n, value and (' value="' .. value .. '"') or ""))
        f:close()
        return commands:poll()
    end
    local cc = vehicle.spec_drivable.cruiseControl
    local ack = set("23.500")
    eq(ack.ok, true)
    eq(ack.via, "setter")
    eq(cc.speed, 23.5, "the forward speed set")
    eq(vehicle.reverseSet, 9, "the reverse one kept")
    set("99")
    eq(cc.speed, 40, "clamped to the top speed")
    set("0.2")
    eq(cc.speed, 1, "at least 1")
    vehicle.movingDirection = -1
    set("12")
    eq(cc.speed, 12, "in reverse: still the main set speed")
    eq(vehicle.reverseSet, 9, "the reverse value passed through")
    ack = set(nil)
    eq(ack.ok, false, "no value")
    eq(ack.reason, "no speed")
end)

-- Controls C3: the rig, the implement keys' tools, selecting and detaching -

-- the selection spike's rig: a tractor with a front loader, a bucket on
-- the loader and a cultivator at the rear, in the game's order
local function c3Rig()
    local vehicle, cultivator = c2Tractor()
    cultivator.id = 9
    local bucket = { id = 6, typeName = "shovelLeveler", getFullName = function() return "Albutt Bucket" end }
    local loader = {
        id = 5, typeName = "attachableFrontloader", rootNode = "loaderNode",
        getFullName = function() return "Quicke Q6M" end,
        attached = { { object = bucket, jointDescIndex = 1 } },
        getAttachedImplements = function(self) return self.attached end,
        spec_attacherJoints = { attacherJoints = { { jointTransform = "bucketJoint" } } },
        detachImplementByObject = function(self, object)
            if self.attached[1] and self.attached[1].object == object then
                self.attached = {}
            end
        end,
    }
    bucket.getAttacherVehicle = function() return loader end
    loader.getAttacherVehicle = function() return vehicle end
    vehicle.rootNode = "tractorNode"
    vehicle.getFullName = function() return "JCB Fastrac" end
    vehicle.spec_attacherJoints = { attacherJoints = {
        [5] = { jointTransform = "rearJoint" }, [6] = { jointTransform = "frontJoint" } } }
    vehicle.attached = { { object = loader, jointDescIndex = 6 }, { object = cultivator, jointDescIndex = 5 } }
    local z = { frontJoint = 0.69, bucketJoint = 2.90, rearJoint = -2.95 }
    localToLocal = function(node) return 0, 0, z[node] end
    vehicle.selectableObjects = { { vehicle = vehicle }, { vehicle = loader }, { vehicle = bucket },
        { vehicle = cultivator } }
    vehicle.selection = 4
    vehicle.getSelectedVehicle = function(self) return self.selectableObjects[self.selection].vehicle end
    vehicle.setSelectedObject = function(self, object)
        for i, o in ipairs(self.selectableObjects) do
            if o == object then
                self.selection = i
            end
        end
    end
    return vehicle, loader, bucket, cultivator
end

test("cab C3: the rig in order, front or rear, selected, and the keys' tools", function()
    load("src/collectors/Cab.lua")
    local Cab = Companion.Collectors.Cab
    Cab.reset()
    local vehicle, loader = c3Rig()
    bindInputs({ "LOWER_IMPLEMENT" }, loader)
    local actions = g_inputBinding.actionEvents
    -- fold stays with the cultivator whatever is selected, as in the spike
    local fold = { name = "IMPLEMENT_EXTRA2" }
    g_inputBinding.nameActions.IMPLEMENT_EXTRA2 = fold
    actions[fold] = { { isActive = true, targetObject = vehicle.attached[2].object, callback = function() end } }
    local cab = Cab.collect({})
    local rig = cab.rig
    eq(#rig, 4, "tractor, loader, bucket, cultivator")
    eq(rig[1].name, "JCB Fastrac")
    eq(rig[1].depth, 0)
    eq(rig[1].id, 3)
    eq(rig[2].name, "Quicke Q6M")
    eq(rig[2].side, "front", "loader: z 0.69")
    eq(rig[2].parent, 3)
    eq(rig[3].name, "Albutt Bucket")
    eq(rig[3].side, "front", "the bucket takes the loader's side")
    eq(rig[3].parent, 5)
    eq(rig[3].depth, 2)
    eq(rig[4].side, "rear", "cultivator: z -2.95")
    eq(rig[4].selected, true)
    eq(rig[4].selectable, true)
    eq(rig[4].foldable, true, "tools carry their implement state")
    eq(rig[2].selected, false)
    eq(cab.keys.lower, 5, "lower acts on the loader")
    eq(cab.keys.fold, 9, "fold stays with the cultivator")
    eq(cab.keys.turnOn, nil, "no turn-on event")
    -- an inactive event acts on nothing
    actions[g_inputBinding.nameActions.LOWER_IMPLEMENT][1].isActive = false
    eq(Cab.collect({}).keys.lower, nil, "inactive: no tool")
    g_inputBinding = nil
    localToLocal = nil
end)

test("commands C3: select a tool by id, next and previous, detach a chosen one", function()
    if TMP_DIR == nil then
        return
    end
    local vehicle, loader, bucket = c3Rig()
    local dir = TMP_DIR .. "/c3cmd_"
    local write = commandStubs(dir)
    local commands = Companion.Commands.new(dir, "S3", function() end)
    local n = 0
    local function run(action, value)
        n = n + 1
        write(n, "S3", action, nil, value)
        return commands:poll()
    end
    local ack = run("SELECT_IMPLEMENT", 5)
    eq(ack.ok, true, "select the loader")
    eq(ack.via, "setter")
    eq(vehicle.selection, 2)
    eq(run("SELECT_IMPLEMENT", 6).ok, true, "the bucket on its own")
    eq(vehicle.selection, 3)
    ack = run("SELECT_IMPLEMENT", 42)
    eq(ack.ok, false)
    eq(ack.reason, "not selectable")
    -- G's events missing: one step in the game's order, round the end
    eq(run("SELECT_NEXT_IMPLEMENT").ok, true)
    eq(vehicle.selection, 4)
    eq(run("SELECT_NEXT_IMPLEMENT").ok, true)
    eq(vehicle.selection, 1, "round the end")
    eq(run("SELECT_PREVIOUS_IMPLEMENT").ok, true)
    eq(vehicle.selection, 4)
    -- with G's event: the key runs
    local calls = bindInputs({ "SWITCH_IMPLEMENT", "SWITCH_IMPLEMENT_BACK" }, vehicle)
    eq(run("SELECT_NEXT_IMPLEMENT").via, "SWITCH_IMPLEMENT")
    eq(run("SELECT_PREVIOUS_IMPLEMENT").via, "SWITCH_IMPLEMENT_BACK")
    eq(#calls.SWITCH_IMPLEMENT, 1)
    g_inputBinding = nil
    -- detach the bucket from the loader, whatever is selected
    bucket.isDetachAllowed = function() return false, "lower it first" end
    ack = run("DETACH_IMPLEMENT", 6)
    eq(ack.ok, false)
    eq(ack.reason, "lower it first", "the game's reason (specs/0003)")
    bucket.isDetachAllowed = function() return true end
    eq(run("DETACH_IMPLEMENT", 6).ok, true, "detached")
    eq(#loader.attached, 0)
    eq(run("DETACH_IMPLEMENT", 6).reason, "not attached")
end)

-- Implement screen: pipe, discharge, cover, speed limit, width, crop --------

-- a combine with a cutter on the front and a trailer behind
local function harvestRig()
    local cutter = {
        id = 21, typeName = "cutter",
        getFullName = function() return "Cutter 9" end,
        getSpeedLimit = function() return 10 end,
        getAIWorkAreaWidth = function() return 9.04 end,
    }
    local trailer = {
        id = 22, typeName = "trailer",
        getFullName = function() return "Tipper" end,
        getSpeedLimit = function() return math.huge end,
        spec_workArea = { workAreas = {} },
        spec_dischargeable = { currentDischargeState = 0 },
        getDischargeState = function(self) return self.spec_dischargeable.currentDischargeState end,
        spec_trailer = { tipState = 0 },
        spec_cover = { hasCovers = true, state = 0, covers = { {}, {} } },
        setCoverState = function(self, s) self.spec_cover.state = s end,
        getIsNextCoverStateAllowed = function() return true end,
    }
    local combine = {
        id = 20, typeName = "combineDrivable", rootNode = 1,
        spec_motorized = {},
        spec_turnOnVehicle = {},
        on = true,
        getIsTurnedOn = function(self) return self.on end,
        getFullName = function() return "Big Combine" end,
        spec_pipe = { hasMovablePipe = true, currentState = 1, targetState = 1, numStates = 2 },
        getIsPipeStateChangeAllowed = function() return true end,
        setPipeState = function(self, s)
            self.spec_pipe.targetState = s
            self.spec_pipe.currentState = 0
        end,
        spec_dischargeable = { currentDischargeState = 0 },
        spec_combine = { lastValidInputFruitType = 3 },
        getSpeedLimit = function(_, onlyIfWorking) return onlyIfWorking and 10 or math.huge end,
        attached = { { object = cutter }, { object = trailer } },
        getAttachedImplements = function(self) return self.attached end,
        getIsAIActive = function() return false end,
        combo = 0,
        startAttacherJointCombo = function(self) self.combo = self.combo + 1 end,
    }
    cutter.getAttacherVehicle = function() return combine end
    trailer.getAttacherVehicle = function() return combine end
    g_localPlayer = { getCurrentVehicle = function() return combine end }
    return combine, cutter, trailer
end

test("implement screen: pipe, discharge, trailer, cover and the new keys in the cab", function()
    load("src/collectors/Cab.lua")
    local Cab = Companion.Collectors.Cab
    Cab.reset()
    local combine, cutter, trailer = harvestRig()
    bindInputs({ "TOGGLE_PIPE", "TOGGLE_TIPSTATE_GROUND", "LOWER_ALL_IMPLEMENTS" }, combine)
    local cover = { name = "TOGGLE_COVER" }
    g_inputBinding.nameActions.TOGGLE_COVER = cover
    g_inputBinding.actionEvents[cover] = { { isActive = true, targetObject = trailer, callback = function() end } }
    local cab = Cab.collect({})
    local head = cab.rig[1]
    eq(head.name, "Big Combine")
    eq(head.turnedOn, true, "a combine threshes: its turn on")
    eq(head.canTurnOn, true)
    eq(head.pipe.out, false, "pipe in")
    eq(head.pipe.moving, false)
    eq(head.discharging, false)
    eq(head.trailer, nil)
    eq(head.foldable, nil, "doesn't fold")
    combine.spec_foldable = { foldingParts = { {} } }
    combine.getIsUnfolded = function() return false end
    local folds = Cab.collect({}).rig[1]
    eq(folds.foldable, true, "a combine folds itself")
    eq(folds.unfolded, false)
    eq(cab.rig[2].pipe, nil, "the cutter has no pipe")
    local t = cab.rig[3]
    eq(t.trailer, true)
    eq(t.discharging, false)
    eq(t.cover.open, false)
    eq(cab.keys.pipe, 20)
    eq(cab.keys.unload, 20, "no TOGGLE_TIPSTATE: the ground key's tool")
    eq(cab.keys.cover, 22)
    eq(cab.keys.lowerAll, 20)
    combine:setPipeState(2)
    trailer.spec_dischargeable.currentDischargeState = 2
    trailer.spec_cover.state = 1
    cab = Cab.collect({})
    eq(cab.rig[1].pipe.out, true, "going out")
    eq(cab.rig[1].pipe.moving, true)
    eq(cab.rig[3].discharging, true, "tipping to the ground")
    eq(cab.rig[3].cover.open, true)
    g_inputBinding = nil
end)

test("implement screen: speed limit, working width and crop in the vehicles topic", function()
    load("src/collectors/Vehicles.lua")
    getWorldTranslation = function() return 0, 0, 0 end
    localDirectionToWorld = function() return 0, 0, -1 end
    FillType = { UNKNOWN = 0 }
    g_storeManager, g_brandManager, g_fillTypeManager = nil, nil, nil
    g_fruitTypeManager = { getFillTypeByFruitTypeIndex = function(_, i)
        return i == 3 and { name = "WHEAT", title = "Wheat" } or nil
    end }
    local combine = harvestRig()
    g_currentMission = { vehicleSystem = { vehicles = { combine } } }
    local v = Companion.Collectors.Vehicles.collect({}).vehicles[1]
    eq(v.crop.name, "wheat")
    eq(v.crop.title, "Wheat")
    eq(v.speedLimit, 10, "the rig's limit while working")
    local cutter, trailer = v.implements[1], v.implements[2]
    eq(cutter.speedLimit, 10)
    eq(cutter.workWidth, 9, "the AI work area's width, rounded")
    eq(trailer.speedLimit, nil, "no limit")
    eq(trailer.workWidth, nil, "no work areas")
    combine.spec_combine.lastValidInputFruitType = 0
    eq(Companion.Collectors.Vehicles.collect({}).vehicles[1].crop, nil, "nothing harvested yet")
    g_fruitTypeManager = nil
end)

test("harvester screen: straw, its key, worked area and Precision Farming's yield", function()
    load("src/collectors/Cab.lua")
    local Cab = Companion.Collectors.Cab
    Cab.reset()
    local combine = harvestRig()
    combine.spec_combine.swath = { isAvailable = true }
    combine.spec_combine.chopper = { isAvailable = true }
    combine.spec_combine.isSwathActive = false
    combine.setIsSwathActive = function(self, on) self.spec_combine.isSwathActive = on end
    bindInputs({ "TOGGLE_CHOPPER" }, combine)
    local cab = Cab.collect({})
    eq(cab.rig[1].straw.swath, false, "chopping")
    eq(cab.rig[2].straw, nil, "the cutter has no straw")
    eq(cab.keys.straw, 20)
    g_inputBinding = nil
    combine.spec_combine.chopper.isAvailable = false
    eq(Cab.collect({}).rig[1].straw, nil, "no choice: no straw")
    combine.spec_combine.chopper.isAvailable = true

    load("src/collectors/Vehicles.lua")
    getWorldTranslation = function() return 0, 0, 0 end
    localDirectionToWorld = function() return 0, 0, -1 end
    FillType = { UNKNOWN = 0 }
    g_storeManager, g_brandManager, g_fillTypeManager, g_fruitTypeManager = nil, nil, nil, nil
    combine.spec_combine.workedHectars = 12.345
    combine.spec_combine.workedHectarsInitial = 10
    g_currentMission = { vehicleSystem = { vehicles = { combine } } }
    local v = Companion.Collectors.Vehicles.collect({}).vehicles[1]
    eq(v.hectares.run, 2.35, "this run")
    eq(v.hectares.total, 12.35)
    eq(v.yield, nil, "no Precision Farming")
    combine["spec_FS25_precisionFarming.extendedCombine"] =
        { lastYieldWeight = 7.94, lastYieldPercentage = 79, lastYieldPotential = 100 }
    v = Companion.Collectors.Vehicles.collect({}).vehicles[1]
    eq(v.yield.tPerHa, 7.9)
    eq(v.yield.pct, 79)
    eq(v.yield.potential, 100)
    eq(v.implements[1].hectares, nil, "only the controlled vehicle")
end)

test("trailer fill limit: maxReached and the litres a unit stops at", function()
    load("src/collectors/Vehicles.lua")
    getWorldTranslation = function() return 0, 0, 0 end
    localDirectionToWorld = function() return 0, 0, -1 end
    FillType = { UNKNOWN = 0 }
    g_storeManager, g_brandManager = nil, nil
    g_fillTypeManager = { getFillTypeByIndex = function(_, i)
        return ({ [5] = { name = "SEEDS", title = "Seeds", massPerLiter = 0.0005 },
                  [7] = { name = "FERTILIZER", title = "Solid Fertilizer", massPerLiter = 0.001 } })[i]
    end }
    local seeder = {
        id = 1, rootNode = 1, maxComponentMass = 9, reached = false, available = 0.2,
        getMaxComponentMassReached = function(self) return self.reached end,
        getAvailableComponentMass = function(self) return self.available end,
        spec_fillUnit = { fillUnits = {
            { capacity = 1400, fillLevel = 1000, fillType = 5 },
            { capacity = 1400, fillLevel = 1063, fillType = 7 },
            { capacity = 1400, fillLevel = 100, fillType = 7, ignoreFillLimit = true },
            { capacity = 1400, fillLevel = 0, fillType = 0 },
        } },
    }
    g_currentMission = { vehicleSystem = { vehicles = { seeder } }, missionInfo = { trailerFillLimit = true } }
    g_localPlayer = { getCurrentVehicle = function() return seeder end }
    local fills = function() return Companion.Collectors.Vehicles.collect({}).vehicles[1].fills end
    local f = fills()
    eq(f[1].limit, nil, "1000 L + 0.2 t of seeds reaches the capacity: no limit")
    eq(f[2].limit, 1263, "1063 L + 0.2 t of fertilizer")
    eq(f[2].maxReached, nil)
    eq(f[3].limit, nil, "ignores the fill limit")
    eq(f[4].limit, nil, "empty: no fill type to weigh")
    seeder.available = 0.1
    eq(fills()[1].limit, 1200, "1000 L + 0.1 t of seeds")
    seeder.reached, seeder.available = true, 0
    f = fills()
    eq(f[2].maxReached, true)
    eq(f[2].limit, 1063, "stops where it is")
    eq(f[3].maxReached, nil, "ignores the fill limit")
    g_currentMission.missionInfo.trailerFillLimit = false
    f = fills()
    eq(f[2].maxReached, nil, "setting off")
    eq(f[2].limit, nil, "setting off")
    seeder.maxComponentMass = math.huge
    g_currentMission.missionInfo.trailerFillLimit = true
    eq(fills()[2].maxReached, nil, "no maximum mass")
    g_fillTypeManager, g_localPlayer = nil, nil
end)

test("harvester screen: fills carry massPerLiter when the fill type has one", function()
    load("src/collectors/Vehicles.lua")
    getWorldTranslation = function() return 0, 0, 0 end
    localDirectionToWorld = function() return 0, 0, -1 end
    FillType = { UNKNOWN = 0 }
    g_storeManager, g_brandManager = nil, nil
    g_fillTypeManager = { getFillTypeByIndex = function(_, i)
        return ({ [6] = { name = "WHEAT", title = "Wheat", massPerLiter = 0.00078 },
                  [8] = { name = "WATER", title = "Water" } })[i]
    end }
    local combine = { id = 1, rootNode = 1, spec_fillUnit = { fillUnits = {
        { capacity = 9300, fillLevel = 6700, fillType = 6 },
        { capacity = 500, fillLevel = 100, fillType = 8 },
        { capacity = 500, fillLevel = 0, fillType = 0 },
    } } }
    g_currentMission = { vehicleSystem = { vehicles = { combine } }, missionInfo = {} }
    g_localPlayer = { getCurrentVehicle = function() return combine end }
    local f = Companion.Collectors.Vehicles.collect({}).vehicles[1].fills
    eq(f[1].massPerLiter, 0.00078, "wheat")
    eq(f[2].massPerLiter, nil, "a fill type without one")
    eq(f[3].massPerLiter, nil, "empty: no fill type")
    g_fillTypeManager, g_localPlayer = nil, nil
end)

-- Vehicle screen (specs/0002): couplings, what's on the loader, the target --

test("vehicle screen: rig entries carry the joint's type name, none for the vehicle", function()
    load("src/collectors/Cab.lua")
    local Cab = Companion.Collectors.Cab
    Cab.reset()
    local vehicle, loader = c3Rig()
    AttacherJoints = { jointTypeNameToInt = { implement = 1, trailer = 2, attachableFrontloader = 9, frontloader = 10 } }
    vehicle.spec_attacherJoints.attacherJoints[6].jointType = 9
    vehicle.spec_attacherJoints.attacherJoints[5].jointType = 1
    loader.spec_attacherJoints.attacherJoints[1].jointType = 10
    local rig = Cab.collect({}).rig
    eq(rig[1].joint, nil, "the vehicle")
    eq(rig[2].joint, "attachableFrontloader", "the loader on the tractor")
    eq(rig[3].joint, "frontloader", "the bucket on the loader")
    eq(rig[4].joint, "implement", "the cultivator")
    -- a type no name was registered for, and no registry at all
    vehicle.spec_attacherJoints.attacherJoints[5].jointType = 77
    eq(Cab.collect({}).rig[4].joint, nil, "unknown type")
    AttacherJoints = nil
    vehicle.spec_attacherJoints.attacherJoints[5].jointType = 1
    eq(Cab.collect({}).rig[2].joint, nil, "no registry")
    localToLocal = nil
end)

-- a tractor at the origin with a front loader and pallet forks on it, and
-- the vehicles around it; positions by node (x, z)
local function loaderYard()
    load("src/collectors/Vehicles.lua")
    Companion.Collectors.Vehicles.reset()
    local at = {}
    getWorldTranslation = function(node) local p = at[node] or { 0, 0 }; return p[1], 0, p[2] end
    localDirectionToWorld = function() return 0, 0, -1 end
    FillType = { UNKNOWN = 0 }
    g_storeManager, g_brandManager = nil, nil
    g_fillTypeManager = { getFillTypeByIndex = function(_, i)
        return ({ [3] = { name = "POTATO", title = "Potatoes", massPerLiter = 0.00067 },
                  [4] = { name = "SEEDS", title = "Seeds", massPerLiter = 0.0005 } })[i]
    end }
    local function fillUnits(list)
        return { fillUnits = list }
    end
    -- a vehicle with fill units that accept the listed fill types
    local function tank(id, x, z, farm, accepts, units, extra)
        local v = { id = id, rootNode = 100 + id, typeName = "trailer",
            spec_fillUnit = fillUnits(units),
            getOwnerFarmId = function() return farm end,
            getFillUnitAllowsFillType = function(_, unit, ft) return accepts[unit] ~= nil and accepts[unit][ft] == true end,
            getFullName = function() return "Tank " .. id end }
        for k, val in pairs(extra or {}) do
            v[k] = val
        end
        at[v.rootNode] = { x, z }
        return v
    end
    local pallet = tank(30, 0, 3, 1, { { [4] = true } }, { { capacity = 1000, fillLevel = 800, fillType = 4 } },
        { isPallet = true, typeName = "pallet", getFullName = function() return "Seed pallet" end })
    local forks = { id = 6, rootNode = 106, typeName = "dynamicMountAttacherImplement",
        getFullName = function() return "Pallet Fork" end,
        spec_dynamicMountAttacher = { dynamicMountedObjects = {} } }
    at[106] = { 0, 3 }
    local loader = { id = 5, rootNode = 105, typeName = "attachableFrontloader",
        getFullName = function() return "Quicke Q6M" end,
        getAttachedImplements = function() return { { object = forks, jointDescIndex = 1 } } end }
    at[105] = { 0, 2 }
    local tractor = { id = 1, rootNode = 101, typeName = "tractor",
        getOwnerFarmId = function() return 1 end,
        getAttachedImplements = function() return { { object = loader, jointDescIndex = 1 } } end }
    forks.getRootVehicle = function() return tractor end
    loader.getRootVehicle = function() return tractor end
    tractor.getRootVehicle = function() return tractor end
    local trailer = tank(10, 0, 9, 1, { { [3] = true, [4] = true } },
        { { capacity = 22000, fillLevel = 14200, fillType = 3 } })
    trailer.getFillUnitFreeCapacity = function(self, unit) return 22000 - self.spec_fillUnit.fillUnits[unit].fillLevel end
    local others = tank(11, 0, 5, 2, { { [4] = true } }, { { capacity = 5000, fillLevel = 0, fillType = 0 } })
    local refuser = tank(12, 0, 6, 1, { { [9] = true } }, { { capacity = 5000, fillLevel = 0, fillType = 0 } })
    local far = tank(13, 0, 30, 1, { { [4] = true } }, { { capacity = 5000, fillLevel = 0, fillType = 0 } })
    local seeder = tank(14, 0, 12, 1, { { [9] = true }, { [4] = true } },
        { { capacity = 3000, fillLevel = 0, fillType = 0 }, { capacity = 5000, fillLevel = 2900, fillType = 4 } },
        { typeName = "sowingMachine" })
    g_localPlayer = { getCurrentVehicle = function() return tractor end }
    g_currentMission = { vehicleSystem = { vehicles = { tractor, loader, forks, pallet, trailer, others, refuser,
        far, seeder } }, missionInfo = {} }
    return { tractor = tractor, forks = forks, pallet = pallet, trailer = trailer, seeder = seeder, at = at }
end

local function controlledEntry()
    local data = Companion.Collectors.Vehicles.collect({})
    for _, v in ipairs(data.vehicles) do
        if v.id == data.controlledId then
            return v
        end
    end
end

test("vehicle screen: carried lists mounted pallets and bigbags with fills, absent with nothing mounted", function()
    local yard = loaderYard()
    eq(controlledEntry().carried, nil, "nothing on the forks")
    yard.forks.spec_dynamicMountAttacher.dynamicMountedObjects[yard.pallet] = yard.pallet
    local carried = controlledEntry().carried
    eq(#carried, 1)
    eq(carried[1].id, 30)
    eq(carried[1].name, "Seed pallet")
    eq(carried[1].pallet, true)
    eq(carried[1].bigBag, false)
    eq(carried[1].fills[1].fillType, "seeds")
    eq(carried[1].fills[1].level, 800)
    eq(carried[1].fills[1].massPerLiter, 0.0005)
    -- a bigbag hangs on the forks too: listed after, by id
    local bag = { id = 31, typeName = "bigBag", spec_bigBag = {}, rootNode = 131,
        getFullName = function() return "Seed bigbag" end,
        spec_fillUnit = { fillUnits = { { capacity = 1000, fillLevel = 1000, fillType = 4 } } } }
    yard.forks.spec_dynamicMountAttacher.dynamicMountedObjects[bag] = bag
    carried = controlledEntry().carried
    eq(#carried, 2)
    eq(carried[2].id, 31)
    eq(carried[2].bigBag, true)
    eq(carried[2].pallet, false)
    g_fillTypeManager, g_localPlayer = nil, nil
end)

test("vehicle screen: target is the nearest farm vehicle within 15 m that takes the fill type", function()
    local yard = loaderYard()
    eq(controlledEntry().target, nil, "nothing carried, nothing picked before")
    yard.forks.spec_dynamicMountAttacher.dynamicMountedObjects[yard.pallet] = yard.pallet
    local t = controlledEntry().target
    -- the pallet (on the forks) and 11 (another farm's, 4 m nearer) and 12
    -- (refuses seeds) are left out; 10 at 9 m from the tractor (the
    -- vehicle, not the forks: spec 0002) wins over 14
    eq(t.id, 10, "the trailer")
    eq(t.name, "Tank 10")
    eq(t.distance, 9)
    eq(t.fillType, "seeds")
    eq(#t.fills, 1, "the accepting unit only")
    eq(t.fills[1].level, 14200)
    eq(t.fills[1].capacity, 22000)
    eq(t.fills[1].free, 7800, "the game's free capacity")
    eq(t.stale, nil)
    -- the trailer drives off: the seeder at 12 m, its second unit
    yard.at[110] = { 0, 60 }
    t = controlledEntry().target
    eq(t.id, 14)
    eq(t.fills[1].unit, 2, "the unit that takes seeds")
    eq(t.fills[1].level, 2900)
    -- out of range: the last target stays, stale, with its distance
    yard.at[114] = { 0, 88 }
    t = controlledEntry().target
    eq(t.id, 14)
    eq(t.stale, true)
    eq(t.distance, 88)
    -- the forks are empty: the last fill type still picks the target
    yard.forks.spec_dynamicMountAttacher.dynamicMountedObjects = {}
    yard.at[114] = { 0, 12 }
    t = controlledEntry().target
    eq(t.id, 14, "the seeder again, for the last carried seeds")
    eq(t.stale, nil)
    eq(t.fillType, "seeds")
    -- in the own rig: never a target
    yard.tractor.getAttachedImplements = function()
        return { { object = yard.seeder, jointDescIndex = 2 } }
    end
    yard.seeder.getRootVehicle = function() return yard.tractor end
    eq(controlledEntry().target, nil, "no loader in the rig: no target")
    g_fillTypeManager, g_localPlayer = nil, nil
end)

test("vehicle screen: a bigbag on a lifter is carried and picks the target, no bucket or forks", function()
    local yard = loaderYard()
    -- the spike's Quicke BIG BAG LIFTER: no shovel, no dynamic mount; the
    -- bag hangs on it by its own joint, as an attached implement
    local bag = { id = 31, typeName = "bigBag", spec_bigBag = {}, isPallet = true, rootNode = 131,
        getFullName = function() return "Lizard Seeds" end,
        spec_fillUnit = { fillUnits = { { capacity = 1000, fillLevel = 1000, fillType = 4 } } } }
    local lifter = { id = 16, typeName = "implement", rootNode = 116,
        getFullName = function() return "Quicke BIG BAG LIFTER" end,
        getAttachedImplements = function() return { { object = bag, jointDescIndex = 1 } } end }
    local loader = yard.tractor.getAttachedImplements()[1].object
    loader.getAttachedImplements = function() return { { object = lifter, jointDescIndex = 1 } } end
    for _, o in ipairs({ bag, lifter }) do
        o.getRootVehicle = function() return yard.tractor end
    end
    local v = controlledEntry()
    eq(#v.carried, 1)
    eq(v.carried[1].id, 31)
    eq(v.carried[1].bigBag, true)
    eq(v.target.id, 10, "the trailer takes seeds, 9 m from the tractor")
    eq(v.target.distance, 9)
    g_fillTypeManager, g_localPlayer = nil, nil
end)

test("vehicle screen: a bucket's load picks the target, under the weight limit", function()
    local yard = loaderYard()
    -- a bucket on the loader in place of the forks
    local bucket = { id = 7, rootNode = 107, typeName = "shovel", spec_shovel = {},
        getFullName = function() return "Albutt Bucket" end,
        spec_fillUnit = { fillUnits = { { capacity = 2000, fillLevel = 1640, fillType = 3 } } } }
    yard.at[107] = { 0, 3 }
    local loader = yard.tractor.getAttachedImplements()[1].object
    loader.getAttachedImplements = function() return { { object = bucket, jointDescIndex = 1 } } end
    bucket.getRootVehicle = function() return yard.tractor end
    g_currentMission.missionInfo.trailerFillLimit = true
    yard.trailer.maxComponentMass = 15
    yard.trailer.getMaxComponentMassReached = function() return false end
    yard.trailer.getAvailableComponentMass = function() return 5.2 end
    local v = controlledEntry()
    eq(v.carried, nil, "a bucket carries no objects")
    local t = v.target
    eq(t.id, 10, "the trailer takes potatoes")
    eq(t.fillType, "potato")
    eq(t.massLimit.max, 15)
    near(t.massLimit.mass, 9.8, "max - available")
    eq(t.massLimit.reached, false)
    g_fillTypeManager, g_localPlayer = nil, nil
end)

test("vehicle screen: the engine's temperature only, the game has no warning level", function()
    load("src/collectors/Vehicles.lua")
    getWorldTranslation = function() return 0, 0, 0 end
    localDirectionToWorld = function() return 0, 0, -1 end
    FillType = { UNKNOWN = 0 }
    -- the spike's table (Merlo and L90H alike), and a field that isn't there
    local tractor = { id = 1, rootNode = 1, spec_motorized = { motorTemperature = { value = 104, valueMin = 20,
        valueMax = 120, warningTemperature = 95 } } }
    g_localPlayer = { getCurrentVehicle = function() return tractor end }
    g_currentMission = { vehicleSystem = { vehicles = { tractor } }, missionInfo = {} }
    local v = Companion.Collectors.Vehicles.collect({}).vehicles[1]
    eq(v.motorTemp, 104)
    eq(v.temperatureWarning, nil, "never sent")
    g_localPlayer = nil
end)

test("commands, implement screen: lower all, pipe, unload, cover as their keys, else setters", function()
    if TMP_DIR == nil then
        return
    end
    local combine, _, trailer = harvestRig()
    local dir = TMP_DIR .. "/impcmd_"
    local write = commandStubs(dir)
    local commands = Companion.Commands.new(dir, "S4", function() end)
    local n = 0
    local function run(action)
        n = n + 1
        write(n, "S4", action)
        return commands:poll()
    end
    -- no key events: the setters
    g_inputBinding = nil
    local ack = run("LOWER_ALL_IMPLEMENTS")
    eq(ack.ok, true)
    eq(ack.via, "setter")
    eq(combine.combo, 1, "the attacher joint combo, as Ctrl+V")
    eq(run("TOGGLE_PIPE").ok, true)
    eq(combine.spec_pipe.targetState, 2, "pipe out")
    combine.spec_pipe.currentState = 2
    eq(run("TOGGLE_PIPE").ok, true)
    eq(combine.spec_pipe.targetState, 1, "pipe in, round the end")
    eq(run("TOGGLE_COVER").ok, true)
    eq(trailer.spec_cover.state, 1)
    trailer.spec_cover.state = 2
    eq(run("TOGGLE_COVER").ok, true)
    eq(trailer.spec_cover.state, 0, "closed after the last cover")
    ack = run("TOGGLE_DISCHARGE")
    eq(ack.ok, false, "unloading needs the key")
    -- with the keys: I first, Ctrl+I when only that one is live
    local calls = bindInputs({ "TOGGLE_TIPSTATE_GROUND", "TOGGLE_PIPE", "TOGGLE_COVER", "LOWER_ALL_IMPLEMENTS" }, trailer)
    eq(run("TOGGLE_DISCHARGE").via, "TOGGLE_TIPSTATE_GROUND")
    eq(run("TOGGLE_PIPE").via, "TOGGLE_PIPE")
    eq(run("TOGGLE_COVER").via, "TOGGLE_COVER")
    -- lower all is each tool's own Lower now (live, 0.8.10), never the
    -- game's Lower all key; with no Lower key here, the game's combo
    eq(run("LOWER_ALL_IMPLEMENTS").via, "setter")
    eq(#(calls.LOWER_ALL_IMPLEMENTS or {}), 0, "the game's Lower all key isn't pressed")
    eq(#calls.TOGGLE_TIPSTATE_GROUND, 1)
    g_inputBinding = nil
end)

test("cab C2: the selected implement, its fold, AI and hitch", function()
    load("src/collectors/Cab.lua")
    local Cab = Companion.Collectors.Cab
    Cab.reset()
    local vehicle, implement = c2Tractor()
    local cab = Cab.collect({})
    eq(cab.aiActive, false)
    eq(cab.hitched, true)
    eq(cab.implement.name, "Rubin 12", "the selected implement")
    eq(cab.implement.foldable, true)
    eq(cab.implement.unfolded, false)
    eq(cab.implement.foldMoving, false)
    eq(cab.implement.canTurnOn, true)
    eq(cab.implement.canLower, true)
    implement.playing = true
    eq(Cab.collect({}).implement.foldMoving, true, "fold running: sent")
    implement.playing = false
    implement.unfolded = true
    cab = Cab.collect({})
    eq(cab.implement.foldMoving, false, "fold done")
    eq(cab.implement.unfolded, true)
    -- no animation API: the fold's time between the ends
    implement.getIsAnimationPlaying = nil
    implement.spec_foldable.foldAnimTime = 0.5
    eq(Cab.collect({}).implement.foldMoving, true, "moving by the fold's time")
    -- the tractor itself selected: the implement controls show the first
    -- attached implement; only the rig's selection changes
    vehicle.getSelectedVehicle = function(self) return self end
    cab = Cab.collect({})
    eq(cab.implement.name, "Rubin 12", "the first attached implement")
    eq(cab.rig[1].selected, true, "the tractor selected in the rig")
    eq(cab.rig[2].selected, false)
    eq(Cab.collect({}), nil, "nothing changed")
    vehicle.attached = {}
    cab = Cab.collect({})
    eq(cab.hitched, false)
    eq(cab.implement, nil, "nothing attached")
    eq(Companion.VehicleState.implement({ spec_foldable = { foldingParts = {} } }).foldable, false,
        "a foldable spec without parts doesn't fold")
end)

-- Whole mod against a stubbed game -----------------------------------------
-- Loads every file in modDesc order and runs a few frames. Needs TMP_DIR
-- with an existing FS25_Companion/ folder (createFolder is a game function).

local function stubGame()
    local implement = {
        id = 10, typeName = "plow", configFileName = "data/plow.xml",
        getFullName = function() return "Plow 3000" end,
        getIsLowered = function() return true end,
        getIsTurnedOn = function() return false end,
        getDamageAmount = function() return 0.25 end,
        spec_powerConsumer = { ptoRpm = 540 },
        getDoConsumePtoPower = function() return true end,
        getFillUnits = function() return { { capacity = 1000, fillLevel = 250, fillType = 5 } } end,
    }
    local vehicle = {
        id = 7, rootNode = 55, typeName = "tractor", configFileName = "data/t7.xml",
        getFullName = function() return "Big Tractor" end,
        getOwnerFarmId = function() return 1 end,
        getIsAIActive = function() return false end,
        getLastSpeed = function() return 5 end,
        getOperatingTime = function() return 7200000 end,
        getDamageAmount = function() return 0.1 end,
        getConsumerFillUnitIndex = function(_, fillType) return ({ [1] = 2, [2] = 3 })[fillType] end,
        getFillUnitFillLevel = function(_, unit) return ({ 4000.44, 150.55, 40 })[unit] end,
        getFillUnitCapacity = function(_, unit) return ({ 8000, 300, 50 })[unit] end,
        getFillUnitFillType = function(_, unit) return ({ 6, 1, 2 })[unit] end,
        -- the cargo unit, then diesel and DEF (consumers: not fill levels)
        getFillUnits = function() return { {}, {}, {} } end,
        getCruiseControlState = function() return 1 end,
        getCruiseControlSpeed = function() return 15 end,
        getCruiseControlMaxSpeed = function() return 40 end,
        getAttacherJointByJointDescIndex = function(_, i)
            return i == 2 and { moveAlpha = 0.65, upperAlpha = 0.2, lowerAlpha = 0.8 } or nil
        end,
        getTotalMass = function() return 9.5 end,
        getIsMotorStarted = function() return true end,
        getGearInfoToDisplay = function() return "3", "B", true, false end,
        getMotor = function()
            return {
                getLastRealMotorRpm = function() return 1500.4 end,
                getMinRpm = function() return 800 end,
                getMaxRpm = function() return 2200 end,
                getGear = function() return 4 end,
            }
        end,
        getAttachedImplements = function() return { { object = implement, jointDescIndex = 2 } } end,
        spec_motorized = {
            engineStarted = false, isMotorStarted = false, motorTemperature = { value = 80 }, lastFuelUsageDisplay = 12.34,
        },
        spec_lights = { isLightOn = true },
        spec_wearable = {},
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
    local worker = {
        id = 11, rootNode = 88, typeName = "combine",
        getFullName = function() return "Combine" end,
        getOwnerFarmId = function() return 1 end,
        getIsAIActive = function() return true end,
        getJob = function()
            return {
                getTitle = function() return "Field work" end,
                getDescription = function() return "Field 1" end,
            }
        end,
        getCurrentHelper = function() return { name = "HELPER01", title = "Anna" } end,
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
    FillType = { UNKNOWN = 0, DIESEL = 1, DEF = 2, ELECTRICCHARGE = 3, METHANE = 4 }
    g_fillTypeManager = {
        getFillTypeByIndex = function(_, i)
            return ({ [5] = { name = "SEEDS", title = "Seeds" }, [6] = { name = "WHEAT", title = "Wheat" } })[i]
        end,
    }
    g_gameSettings = {
        values = { useMiles = true, useFahrenheit = false, moneyUnit = 3 },
        getValue = function(self, id) return self.values[id] end,
    }
    g_localPlayer = player
    g_storeManager = {
        items = {
            ["data/t7.xml"] = { brandIndex = 3, categoryName = "TRACTORSM" },
            ["data/plow.xml"] = { brandIndex = 1, categoryName = "PLOWS" },
        },
        getItemByXMLFilename = function(self, file) return self.items[file] end,
        getCategoryByName = function(_, name) return name == "TRACTORSM" and { title = "Tractors M" } or nil end,
    }
    g_brandManager = {
        getBrandByIndex = function(_, i) return ({ { name = "NONE", title = "None" }, nil, { name = "NEWHOLLAND", title = "New Holland" } })[i] end,
    }
    g_farmlandManager = {
        farmlands = { { id = 1, farmId = 1, price = 1000, areaInHa = 2 } },
        getFarmlandIdAtWorldPosition = function(_, x) return x < 0 and 1 or 255 end,
    }
    g_fieldManager = {
        sprayLevelMaxValue = 2,
        fields = { {
            getId = function() return 1 end, posX = -50, posZ = 20, areaHa = 2.5,
            farmland = { id = 1 }, polygonPoints = { 501, 502, 503 },
            fieldState = { isValid = true, fruitTypeIndex = 1, growthState = 3, groundType = 6 },
        } },
    }
    g_fruitTypeManager = { fruitTypes = { { index = 1, name = "WHEAT",
        defaultMapColor = { 0.5, 0.4, 0.1, 1 }, numGrowthStates = 8 } } }
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
        vehicleSystem = { vehicles = { parked, vehicle, hitched, worker } },
        environment = {
            currentDay = 3, dayTime = (13 * 60 + 30) * 60000, currentSeason = 1, currentPeriod = 6,
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

-- Vehicle page's cards (specs/0003): capabilities, aimed and All commands -----

load("tests/spike_rigs.lua")
local SPIKE = MOD_ROOT .. "tests/fixtures/spike0003/"
local function spikeDump(name)
    return SpikeRigs.decode(SpikeRigs.readFile(SPIKE .. name .. ".json"))
end
local function joined(list)
    local out = {}
    for _, x in ipairs(list or {}) do
        out[#out + 1] = type(x) == "table" and x.text or x
    end
    return table.concat(out, ",")
end
local function shortSpec(name)
    return name:match("([^%.]+)$") or name
end
-- the sides the dumps don't record: the front mower and the front weight
local SIDES = { [994] = "front", [1044] = "front" }

test("capabilities: every census type, from its parts and what they hold; an unknown part adds nothing", function()
    g_inputBinding = nil
    local VS = Companion.VehicleState
    local census = spikeDump("census")
    local names = {}
    for name in pairs(census.types) do
        names[#names + 1] = name
    end
    table.sort(names)
    eq(#names, census.count, "every type")
    local full, empty, present = {}, {}, {}
    local function add(counts, can)
        for _, c in ipairs(can) do
            counts[c] = (counts[c] or 0) + 1
        end
    end
    for _, name in ipairs(names) do
        local specs = census.types[name]
        local depth, seen = 0, {}
        for _, s in ipairs(specs) do
            if not seen[shortSpec(s)] then
                seen[shortSpec(s)] = true
                present[shortSpec(s)] = (present[shortSpec(s)] or 0) + 1
            end
            if shortSpec(s) == "attachable" then
                depth = 1
            end
        end
        local function caps(list, isFull)
            local o = SpikeRigs.censusObject(list, isFull)
            return VS.capabilities(o, VS.extras(o, {}), depth)
        end
        local f = caps(specs, true)
        add(full, f.can)
        add(empty, caps(specs, false).can)
        local more = { "FS25_madeUp.laserLeveller", "hoseReel" }
        for _, s in ipairs(specs) do
            more[#more + 1] = s
        end
        eq(joined(caps(more, true).can), joined(f.can), name .. ": an unknown part adds nothing")
        -- each capability comes with its state
        for _, c in ipairs(f.can) do
            local state = ({ lower = f.lowered, turnOn = f.turnedOn, tipSide = f.tipSide, cover = f.cover,
                pipe = f.pipe, rotate = f.plow, bales = f.bales, fold = f.foldMoving, tip = true, detach = true })[c]
            assert(state ~= nil, name .. ": " .. c .. " without its state")
        end
    end
    -- with each part holding something: one capability per part, as the
    -- spike counted them; a sprayer's Dischargeable isn't tipping
    for cap, spec in pairs({ fold = "foldable", turnOn = "turnOnVehicle", cover = "cover", pipe = "pipe",
        rotate = "plow", detach = "attachable", lower = "attachable", tip = "trailer", tipSide = "trailer",
        bales = "baleCounter" }) do
        eq(full[cap], present[spec], cap .. " with full parts")
    end
    eq(full.fold, census.perCapability.fold, "fold, as the spike's census")
    eq(full.tip, 24, "tip: trailers only, not every Dischargeable (75)")
    -- with every part empty: only Detach, and the bale counter (it holds no part)
    for cap in pairs(full) do
        eq(empty[cap], (cap == "detach" or cap == "bales") and full[cap] or nil, cap .. " with empty parts")
    end
end)

test("capabilities: spike 0.0.4's rigs give each member its buttons, can't-now reasons and the selected one's keys", function()
    local VS = Companion.VehicleState
    local expect = {
        mowers = { [992] = "", [994] = "lower,fold,turnOn,detach", [996] = "lower,fold,turnOn,detach" },
        trailers = { [998] = "", [1003] = "tip,tipSide,detach", [1004] = "tip,tipSide,detach" },
        sprayer = { [1033] = "", [1031] = "fold,turnOn,detach" },
        plow = { [1035] = "", [1037] = "lower,fold,rotate,detach" },
        baler = { [1035] = "", [1041] = "turnOn,bales,detach" },
        weight = { [1035] = "", [1044] = "lower,detach" },
        truck = { [1053] = "fold", [1051] = "lower,tip,tipSide,detach" },
        attach = { [514] = "" },
    }
    local rigs = {}
    for name, members in pairs(expect) do
        local root = SpikeRigs.rig(spikeDump(name), SIDES)
        local byId = {}
        for _, e in ipairs(VS.rig(root)) do
            byId[e.id] = e
        end
        rigs[name] = byId
        for id, can in pairs(members) do
            eq(joined(byId[id].can), can, name .. " " .. id)
        end
    end
    local mowers = rigs.mowers
    eq(mowers[994].canNow.fold, false, "the front mower can't fold while lowered")
    eq(mowers[994].whyNot.fold, "Folding is not allowed while the tool is lowered.")
    eq(mowers[996].canNow.detach, false)
    eq(mowers[996].whyNot.detach, "You first need to fold up the tool (mower)!")
    eq(mowers[996].canNow.fold, nil, "the rear one may fold")
    eq(mowers[994].side, "front")
    eq(mowers[996].canLower, true, "it lowers through its fold (live, 0.8.7)")
    eq(mowers[996].canNow.lower, nil, "lowered: raising is allowed")
    eq(rigs.truck[1051].canNow.detach, false, "the container: no reason given")
    eq(rigs.truck[1051].whyNot, nil)
    local t = rigs.trailers[1004].tipSide
    eq(t.index .. "/" .. t.count .. " " .. tostring(t.name), "3/4 Left", "the selected trailer's side, from its key's label")
    t = rigs.trailers[1003].tipSide
    eq(t.index .. "/" .. t.count .. " " .. tostring(t.name), "2/4 nil", "not selected: no label")
    eq(rigs.truck[1051].tipSide.name, "Back")
    eq(rigs.plow[1037].plow.rotated, false)
    eq(rigs.baler[1041].bales.count, 0)
    eq(rigs.trailers[1004].discharging, false)
    eq(rigs.mowers[996].lowered, true)
    -- the selected one's other keys, each once, by input action
    eq(joined(rigs.plow[1037].extraKeys), "Allow create fields")
    eq(joined(rigs.baler[1041].extraKeys), "Turn on automatic drop,Lower pickup", "the pickup lowers by its own key")
    eq(joined(rigs.sprayer[1031].extraKeys), "Dump,Dump on ground,Unload", "a sprayer's dump isn't tipping")
    eq(rigs.mowers[996].extraKeys, nil, "all covered")
    eq(rigs.mowers[994].extraKeys, nil, "not selected")
    eq(rigs.attach[514].extraKeys, nil, "the tractor's own: Detach and Attach aren't")
    -- live (0.8.7): folded, getCanBeTurnedOn is false and Turn on went,
    -- while its key came back as an other key ("Turn on mower"). Folded,
    -- Turn on stays, unavailable; the turn on key is never an other key
    local root, byId = SpikeRigs.rig(spikeDump("mowers"), SIDES)
    byId[996]:setFoldState(1)
    byId[996].getTurnedOnNotAllowedWarning = function() return "First unfold the tool" end
    local rear
    for _, e in ipairs(VS.rig(root)) do
        if e.id == 996 then
            rear = e
        end
    end
    eq(rear.unfolded, false)
    eq(joined(rear.can), "lower,fold,turnOn,detach", "folded: Turn on stays")
    eq(rear.canNow.turnOn, false)
    eq(rear.whyNot.turnOn, "First unfold the tool", "the game's warning")
    eq(rear.extraKeys, nil, "its turn on key isn't an other key")
    -- the engine off: no Turn on (nothing to say why), and still no key
    byId[996]:setFoldState(-1)
    byId[996].engineOff = true
    for _, e in ipairs(VS.rig(root)) do
        if e.id == 996 then
            rear = e
        end
    end
    eq(joined(rear.can), "lower,fold,detach", "engine off")
    eq(rear.extraKeys, nil, "its turn on key isn't an other key")
    -- live (0.8.8): the engine off, the fold keys only got the game's
    -- warning, while getIsFoldAllowed said yes
    byId[996].engineOff = nil
    root.engineOff = true
    for _, e in ipairs(VS.rig(root)) do
        if e.id == 996 then
            rear = e
        end
    end
    eq(rear.canNow.fold, false, "no power: no folding")
    eq(rear.whyNot.fold, "Please start the engine first")
    -- live (0.8.9): nor lowering, nor raising (Vincent)
    eq(rear.lowered, true, "the XT 390 is lowered (the dump)")
    eq(rear.canNow.lower, false, "no power: no raising")
    eq(rear.whyNot.lower, "Please start the engine first")
    g_inputBinding = nil
    localToLocal = nil
end)

test("cab: attachable follows the game's attach prompt", function()
    load("src/collectors/Cab.lua")
    local Cab = Companion.Collectors.Cab
    Cab.reset()
    SpikeRigs.rig(spikeDump("attach"))
    eq(Cab.collect({}).attachable, true, "something in reach")
    Cab.reset()
    SpikeRigs.rig(spikeDump("mowers"), SIDES)
    eq(Cab.collect({}).attachable, nil, "nothing in reach: absent")
    -- no attachableInfo: the attach key's label
    local root = SpikeRigs.rig(spikeDump("attach"))
    root.spec_attacherJoints.attachableInfo = nil
    eq(Companion.VehicleState.attachable(root), true, "the ATTACH key says Attach")
    root = SpikeRigs.rig(spikeDump("mowers"), SIDES)
    root.spec_attacherJoints.attachableInfo = nil
    eq(Companion.VehicleState.attachable(root), false, "its label is empty")
    g_inputBinding = nil
    localToLocal = nil
end)

-- a command queue on a spike rig: each poll is a game frame
local function spikeCommands(name)
    local root, byId = SpikeRigs.rig(spikeDump(name), SIDES)
    local dir = TMP_DIR .. "/c0003" .. name .. "_"
    local write = commandStubs(dir)
    local commands = Companion.Commands.new(dir, "S7", function() end)
    local n = 0
    local function frame()
        SpikeRigs.frame(root)
        return commands:poll()
    end
    -- the ack and how many frames it took
    local function run(action, value)
        n = n + 1
        write(n, "S7", action, nil, value)
        for i = 1, 60 do
            local ack = frame()
            if ack ~= nil then
                return ack, i
            end
        end
        error(action .. ": no ack")
    end
    local function pressed()
        local out = {}
        for _, p in ipairs(g_inputBinding.pressed) do
            out[#out + 1] = p.id .. ":" .. p.action
        end
        g_inputBinding.pressed = {}
        return table.concat(out, ",")
    end
    return run, root, byId, pressed
end

test("commands, aimed: a tool's id selects it, presses its key, puts the selection back; the game's reason", function()
    if TMP_DIR == nil then
        return
    end
    local run, root, byId, pressed = spikeCommands("mowers")
    eq(root:getSelectedVehicle().id, 996, "the rear mower is selected")
    local ack, frames = run("TURN_ON_IMPLEMENT", 994)
    eq(ack.ok, true, "turn on the front mower")
    eq(ack.via, "IMPLEMENT_EXTRA")
    eq(pressed(), "994:IMPLEMENT_EXTRA", "its key, on it alone")
    eq(frames, 2, "selected, then its key a frame later")
    eq(root:getSelectedVehicle().id, 996, "the selection put back")
    -- the selected one's key is live: pressed at once
    ack, frames = run("FOLD_IMPLEMENT", 996)
    eq(ack.ok, true)
    eq(frames, 1, "no selecting")
    eq(pressed(), "996:IMPLEMENT_EXTRA2")
    -- the game refuses: its words, nothing pressed, nothing selected
    ack = run("FOLD_IMPLEMENT", 994)
    eq(ack.ok, false)
    eq(ack.reason, "Folding is not allowed while the tool is lowered.")
    eq(pressed(), "")
    ack = run("DETACH_IMPLEMENT", 996)
    eq(ack.reason, "You first need to fold up the tool (mower)!")
    -- what it can't do at all, and an id not in the rig
    eq(run("ROTATE_PLOW", 994).reason, "can't rotate")
    eq(run("LOWER_IMPLEMENT", 4242).reason, "not attached")
    -- lower: the tractor's key acts on the selected mower (attacher joints)
    table.insert(root.dump.keys.attacherJoints, { action = "LOWER_IMPLEMENT", active = true, text = "Lower mower" })
    SpikeRigs.registerKeys(root)
    ack, frames = run("LOWER_IMPLEMENT", 994)
    eq(ack.via, "LOWER_IMPLEMENT", "the tractor's key, not the setter")
    eq(frames, 2)
    eq(pressed(), "992:LOWER_IMPLEMENT")
    eq(root:getSelectedVehicle().id, 996, "put back")
    table.remove(root.dump.keys.attacherJoints)
    SpikeRigs.registerKeys(root)
    -- the key never comes: the setter, and the selection still put back
    Companion.Commands.KEY_WAIT_FRAMES = 3
    root.keysDue = false
    local frame = SpikeRigs.frame
    SpikeRigs.frame = function() end
    ack, frames = run("TURN_ON_IMPLEMENT", 994)
    SpikeRigs.frame = frame
    Companion.Commands.KEY_WAIT_FRAMES = 30
    eq(ack.ok, true, "setter")
    eq(ack.via, "setter")
    eq(frames, 4, "selected, waited three frames")
    eq(byId[994].on, true, "turned on by its setter")
    eq(pressed(), "")
    eq(root:getSelectedVehicle().id, 996, "put back")
    -- without an id: as before, the key the game has live
    ack = run("FOLD_IMPLEMENT")
    eq(ack.via, "IMPLEMENT_EXTRA2")
    eq(pressed(), "996:IMPLEMENT_EXTRA2")
    -- the selected tool's other keys, by number
    run, root, byId, pressed = spikeCommands("plow")
    ack = run("PRESS_TOOL_KEY", 1)
    eq(ack.via, "IMPLEMENT_EXTRA3", "Allow create fields")
    eq(pressed(), "1037:IMPLEMENT_EXTRA3")
    eq(run("PRESS_TOOL_KEY", 2).reason, "no such key")
    ack = run("ROTATE_PLOW")
    eq(ack.via, "IMPLEMENT_EXTRA", "rotate: the selected plow")
    eq(pressed(), "1037:IMPLEMENT_EXTRA")
    run, root, byId, pressed = spikeCommands("trailers")
    ack = run("TOGGLE_TIPSIDE", 1003)
    eq(ack.via, "TOGGLE_TIPSIDE")
    eq(pressed(), "1003:TOGGLE_TIPSIDE")
    eq(root:getSelectedVehicle().id, 1004)
    g_inputBinding = nil
    localToLocal = nil
end)

test("commands, all: fold all raises what's lowered first, then the game's key; else setters; tip all in driving order", function()
    if TMP_DIR == nil then
        return
    end
    local run, root, byId, pressed = spikeCommands("mowers")
    local function unfolded()
        return tostring(byId[994]:getIsUnfolded()) .. tostring(byId[996]:getIsUnfolded())
    end
    -- the game's keys as seen live (0.8.7): the tractor's Lower acts on the
    -- selected tool, a few frames later; fold all folds every tool the game
    -- lets fold, unfolds every one while one is folded
    table.insert(root.dump.keys.attacherJoints, { action = "LOWER_IMPLEMENT", active = true, text = "Lower mower" })
    SpikeRigs.registerKeys(root)
    local moving = {}
    root.onKey = function(name)
        if name == "LOWER_IMPLEMENT" then
            moving[#moving + 1] = { tool = root:getSelectedVehicle(), due = 3 }
        end
    end
    local function foldAllKey(name)
        if name ~= "FOLD_ALL_IMPLEMENTS" then
            return
        end
        local unfold = not (byId[994]:getIsUnfolded() and byId[996]:getIsUnfolded())
        for _, id in ipairs({ 994, 996 }) do
            local m = byId[id]
            if m:getIsUnfolded() ~= unfold and (unfold or m:getIsFoldAllowed() ~= false) then
                m:setFoldState(m:getToggledFoldDirection())
            end
        end
    end
    byId[994].onKey, byId[996].onKey = foldAllKey, foldAllKey
    local frame = SpikeRigs.frame
    SpikeRigs.frame = function(r)
        for i = #moving, 1, -1 do
            local m = moving[i]
            m.due = m.due - 1
            if m.due == 0 then
                m.tool.lowered = not m.tool.lowered
                table.remove(moving, i)
            end
        end
        frame(r)
    end
    -- live (0.8.7): the front mower lowered, the game's key once folded the
    -- rear one alone ("Folding is not allowed while the tool is lowered.").
    -- Now the front one is raised first, by its Lower, and the key waits
    -- until the game lets it fold
    eq(byId[994].lowered, true, "the front mower is lowered (the dump)")
    local ack = run("FOLD_ALL_IMPLEMENTS")
    eq(ack.ok, true)
    eq(ack.via, "FOLD_ALL_IMPLEMENTS", "the game's key")
    eq(pressed(), "992:LOWER_IMPLEMENT,994:FOLD_ALL_IMPLEMENTS", "raised, then fold all")
    eq(byId[994].lowered, false)
    eq(unfolded(), "falsefalse", "both folded")
    eq(root:getSelectedVehicle().id, 996, "the selection put back")
    -- both folded: nothing to raise, the key at once
    ack = run("FOLD_ALL_IMPLEMENTS")
    eq(pressed(), "996:FOLD_ALL_IMPLEMENTS")
    eq(unfolded(), "truetrue", "both unfolded")
    -- live (0.8.10): the game's Lower all key, pressed by the mod, did
    -- nothing every other time while the keyboard's always worked. Now
    -- each tool's Lower toward one state, as Tip all: lower every one
    -- while one is raised, else raise them all; the selection put back
    byId[994].lowered, byId[996].lowered = false, false
    ack = run("LOWER_ALL_IMPLEMENTS")
    for _ = 1, 4 do
        SpikeRigs.frame(root)
    end
    eq(ack.ok, true)
    eq(ack.via, "LOWER_IMPLEMENT", "each tool's Lower, not the game's Lower all")
    eq(pressed(), "992:LOWER_IMPLEMENT,992:LOWER_IMPLEMENT")
    eq(tostring(byId[994].lowered) .. tostring(byId[996].lowered), "truetrue", "both lowered")
    eq(root:getSelectedVehicle().id, 996, "the selection put back")
    byId[994].lowered = false
    run("LOWER_ALL_IMPLEMENTS")
    for _ = 1, 4 do
        SpikeRigs.frame(root)
    end
    eq(pressed(), "992:LOWER_IMPLEMENT", "one raised: only it is lowered")
    eq(tostring(byId[994].lowered) .. tostring(byId[996].lowered), "truetrue")
    run("LOWER_ALL_IMPLEMENTS")
    for _ = 1, 4 do
        SpikeRigs.frame(root)
    end
    eq(tostring(byId[994].lowered) .. tostring(byId[996].lowered), "falsefalse", "all lowered: all raised")
    pressed()
    -- the raise never takes: fold all is still pressed, after a while
    Companion.Commands.SETTLE_FRAMES = 5
    byId[994].lowered = true
    root.onKey = nil
    ack = run("FOLD_ALL_IMPLEMENTS")
    Companion.Commands.SETTLE_FRAMES = 120
    eq(pressed(), "992:LOWER_IMPLEMENT,994:FOLD_ALL_IMPLEMENTS")
    eq(unfolded(), "truefalse", "the rear one folded; the front one the game wouldn't")
    byId[994].lowered = false
    SpikeRigs.frame = frame
    table.remove(root.dump.keys.attacherJoints)
    SpikeRigs.registerKeys(root)
    -- no event: every mower's setter, unfolding while one is folded
    SpikeRigs.unregister(byId[996])
    Companion.Commands.KEY_WAIT_FRAMES = 3
    ack = run("FOLD_ALL_IMPLEMENTS")
    Companion.Commands.KEY_WAIT_FRAMES = 30
    eq(ack.via, "setter")
    eq(unfolded(), "truetrue", "both unfolded")
    Companion.Commands.KEY_WAIT_FRAMES = 3
    run("FOLD_ALL_IMPLEMENTS")
    Companion.Commands.KEY_WAIT_FRAMES = 30
    eq(unfolded(), "falsefalse", "both folded")
    byId[994].onKey, byId[996].onKey = nil, nil
    pressed()
    -- folded, neither may turn on: the setter leaves them
    eq(run("TURN_ON_ALL_IMPLEMENTS").ok, false, "folded: nothing turns on")
    eq(tostring(byId[994].on) .. tostring(byId[996].on), "falsefalse")
    Companion.Commands.KEY_WAIT_FRAMES = 3
    run("FOLD_ALL_IMPLEMENTS")
    Companion.Commands.KEY_WAIT_FRAMES = 30
    byId[996].on = true
    eq(run("TURN_ON_ALL_IMPLEMENTS").via, "setter")
    eq(tostring(byId[994].on) .. tostring(byId[996].on), "truetrue", "the one that was off turned on")
    run("TURN_ON_ALL_IMPLEMENTS")
    eq(tostring(byId[994].on) .. tostring(byId[996].on), "falsefalse", "all on: all off")
    eq(run("COVER_ALL", 1).ok, true, "nothing has a cover: nothing to do")
    eq(pressed(), "")
    -- the engine off: the game's warning, nothing pressed (live, 0.8.8)
    root.engineOff = true
    ack = run("FOLD_ALL_IMPLEMENTS")
    eq(ack.ok, false)
    eq(ack.reason, "Please start the engine first")
    eq(run("FOLD_IMPLEMENT", 994).reason, "Please start the engine first")
    eq(run("LOWER_IMPLEMENT", 994).reason, "Please start the engine first", "live (0.8.9): lowering too")
    eq(run("LOWER_ALL_IMPLEMENTS").reason, "Please start the engine first")
    eq(pressed(), "")
    root.engineOff = nil

    run, root, byId, pressed = spikeCommands("trailers")
    ack = run("TIP_ALL", 1)
    eq(ack.ok, true)
    eq(pressed(), "1004:TOGGLE_TIPSTATE,1003:TOGGLE_TIPSTATE", "the last trailer first, as they're driven")
    eq(root:getSelectedVehicle().id, 1004, "the selection put back")
    byId[1004].spec_dischargeable.currentDischargeState = 1
    run("TIP_ALL", 1)
    eq(pressed(), "1003:TOGGLE_TIPSTATE", "the one already tipping is skipped")
    run("TIP_ALL", 0)
    eq(pressed(), "1004:TOGGLE_TIPSTATE", "stop: only the one tipping")
    g_inputBinding = nil
    localToLocal = nil
end)

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
    load("src/collectors/CropTypes.lua")
    load("src/collectors/FieldOutlines.lua")
    load("src/collectors/Fields.lua")
    load("src/collectors/Cab.lua")
    load("src/Companion.lua")
    local mod = getListener()
    assert(mod ~= nil, "registered as a mod event listener")

    local writeCommand = commandStubs(TMP_DIR .. "/FS25_Companion/cmd/")
    vehicle.spec_lights = { lightsTypesMask = 0 }
    vehicle.setLightsTypesMask = function(self, mask) self.spec_lights.lightsTypesMask = mask end

    mod:loadMap("map")
    mod:update(16)
    player.currentVehicle = vehicle
    -- long enough for the farmland grid (64 slices)
    for _ = 1, 80 do
        mod:update(16)
    end
    -- a dashboard command: its ack, then the new cab, in the same frame
    local session = readFile(TMP_DIR .. "/FS25_Companion/stream.ndjson"):match('"sessionId":"([^"]+)"')
    local before = #lines(readFile(TMP_DIR .. "/FS25_Companion/stream.ndjson"))
    writeCommand(1, session, "TOGGLE_LIGHTS", "b7")
    mod:update(16)
    local frame = lines(readFile(TMP_DIR .. "/FS25_Companion/stream.ndjson"))
    assert(frame[before + 1]:find('"topic":"command_ack"', 1, true), "ack first: " .. tostring(frame[before + 1]))
    assert(frame[before + 1]:find('"data":{"action":"TOGGLE_LIGHTS","id":1,"ok":true,"ref":"b7","via":"setter"}', 1, true),
        frame[before + 1])
    assert(frame[before + 2]:find('"topic":"cab"', 1, true), "then the cab: " .. tostring(frame[before + 2]))
    assert(frame[before + 2]:find('"on":true', 1, true), "lights on in the cab")
    mod:update(16)
    local after = lines(readFile(TMP_DIR .. "/FS25_Companion/stream.ndjson"))
    for i = #frame + 1, #after do
        assert(not after[i]:find('"topic":"cab"', 1, true), "an unchanged cab isn't sent again")
    end
    mod:deleteMap()

    local ls = lines(readFile(TMP_DIR .. "/FS25_Companion/stream.ndjson"))
    assert(#ls > 5, "expected several lines, got " .. #ls)
    assert(ls[1]:find('"topic":"hello"', 1, true), "hello first: " .. ls[1])
    assert(ls[1]:find('"mapId":"FS25_Test.TestMap"', 1, true), ls[1])
    assert(ls[1]:find('"mapExtensionScaleFactor":0.5', 1, true), ls[1])
    assert(ls[1]:find('"gameDir":"C:/Games/FS25/"', 1, true), ls[1])
    assert(ls[1]:find('"commands":{"dir":"' .. TMP_DIR .. '/FS25_Companion/cmd/","next":1}', 1, true), ls[1])
    local text = table.concat(ls, "\n")
    -- on foot: heading from the facing direction (east)
    assert(text:find('"heading":90,"inVehicle":false', 1, true), "on-foot player pose")
    -- in the vehicle: the vehicle's pose and forward vector (north)
    assert(text:find('"heading":0,"inVehicle":true,"vehicleId":7', 1, true), "in-vehicle player pose")
    assert(text:find('"controlledId":7', 1, true), "controlled vehicle")
    assert(text:find('"name":"Plow 3000"', 1, true), "implements")
    assert(text:find('"brand":"New Holland","category":"TRACTORSM","categoryTitle":"Tractors M"', 1, true),
        "brand and shop category")
    assert(text:find('"category":"PLOWS","depth":1', 1, true), "implement's category, no title")
    assert(not text:find('"brand":"None"', 1, true), "no brand for NONE")
    assert(text:find('"typeName":"plow"', 1, true), "implement's type")
    assert(text:find('"operatingHours":2', 1, true), "hours")
    assert(text:find('"gear":"3","gearAutomatic":false,"gearGroup":"B"', 1, true), "gear as the speedometer shows it")
    assert(text:find('"fuel":150.6,"fuelCapacity":300,"fuelType":"diesel"', 1, true), "fuel from the fill unit")
    assert(text:find('"wear":0.1', 1, true), "wear from getDamageAmount")
    assert(text:find('"engineOn":true', 1, true), "engine from getIsMotorStarted, not the spec's fields")
    assert(text:find('"month":8', 1, true), "period 6 is August")
    -- T6
    assert(text:find('"def":40,"defCapacity":50', 1, true), "DEF from its consumer unit")
    assert(text:find('"fuelUsage":12.3', 1, true), "fuel usage")
    assert(text:find('"cruise":{"maxSpeed":40,"speed":15,"state":"on"}', 1, true), "cruise control")
    assert(text:find('"fills":[{"capacity":8000,"fillTitle":"Wheat","fillType":"wheat","level":4000.4,"unit":1}]',
        1, true), "the vehicle's own fill unit, no fuel or DEF")
    assert(text:find('"fills":[{"capacity":1000,"fillTitle":"Seeds","fillType":"seeds","level":250,"unit":1}]',
        1, true), "the implement's fill unit")
    assert(text:find('"hitch":0.75', 1, true), "hitch position")
    assert(text:find('"pto":true', 1, true), "PTO")
    assert(text:find('"ai":{"description":"Field 1","helper":"Anna","job":"Field work"}', 1, true), "AI job")
    assert(text:find('"units":{"currency":"£","fahrenheit":false,"miles":true}', 1, true), "unit settings")
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
    assert(text:find('"topic":"crop_types"', 1, true), "crop types")
    assert(text:find('"fields":[{"id":1,"points":[10,-20,10,-20,10,-20]}]', 1, true), "field outlines")
    assert(text:find('"fields":[{"areaHa":2.5,"farmlandId":1,"fruitTypeIndex":1,"groundType":6,'
        .. '"growthState":3,"id":1,"x":-50,"z":20}]', 1, true), "field state")
    local once = { crop_types = 0, field_outlines = 0 }
    for _, line in ipairs(ls) do
        for topic in pairs(once) do
            if line:find('"topic":"' .. topic .. '"', 1, true) then
                once[topic] = once[topic] + 1
            end
        end
    end
    eq(once.crop_types, 1, "crop types sent once")
    eq(once.field_outlines, 1, "field outlines sent once")
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
