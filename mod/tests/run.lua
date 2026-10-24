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
