-- CompanionSpike.lua
-- FS25 Companion — Phase 0 API spike (development only, remove after use)
--
-- Answers the open questions of the rework plan by looking at the live
-- game instead of guessing API names:
--   * file I/O: can we create/write/append/seek a file under modSettings
--     (this replaces the Windows-only named pipe)
--   * map: mapId, terrain size, where the PDA overview image lives
--   * PDA hotspots: where the list lives, classes, categories, positions
--   * fields / farmlands: object structure, polygon API, position lookup
--   * vehicles / player: lists, nodes, owner farm, heading from the
--     forward vector (compared with the PDA readout on screen)
--
-- Output (in <profile>/modSettings/FS25_CompanionSpike/):
--   report.json    one structured dump, written ~5 s after the map loads
--                  and again on the console command `csDump`
--   stream.ndjson  pose samples at 5 Hz (the first protocol fixture)
--   io_test.txt    scratch file of the file I/O test
--
-- Everything runs under pcall: a failing probe is recorded in the report
-- and never affects the game.

CompanionSpike = {}
local CS = CompanionSpike

local SPIKE_VERSION = "0.0.8"
local MOD_DIR = g_currentModDirectory or ""

local LIMITS = {
    depth = 2,          -- default describe depth
    keys = 60,          -- max keys per described table
    items = 6,          -- max array items per described table
    str = 200,          -- max string length
    methodDepth = 8,    -- metatable __index levels walked for method names
    getters = 120,      -- max getters probed per object
    hotspots = 400,     -- max hotspots in the compact list
    fields = 400,       -- max fields in the compact list
}

local DUMP_DELAY_MS = 5000
local STREAM_INTERVAL_MS = 200
local STREAM_MAX_LINES = 3000   -- ~10 min at 5 Hz

local ctx = {
    dir = nil,
    elapsed = 0,
    dumped = false,
    stream = nil,
    streamTimer = 0,
    seq = 0,
    lastPose = nil,
    status = "waiting for map",
    log = {},
}

local atan2 = math.atan2 or math.atan

local function log(fmt, ...)
    local msg = string.format(fmt, ...)
    print("[CompanionSpike] " .. msg)
    ctx.log[#ctx.log + 1] = msg
end

local function pack(...)
    return { n = select("#", ...), ... }
end

---------------------------------------------------------------------------
-- JSON encoder (prototype of mod/src/Json.lua)
---------------------------------------------------------------------------

local Json = {}

local ESCAPES = {
    ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
    ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

local function escapeString(s)
    return '"' .. s:gsub('[%c"\\]', function(c)
        return ESCAPES[c] or string.format("\\u%04x", c:byte())
    end) .. '"'
end

local function keyLess(a, b)
    local ta, tb = type(a), type(b)
    if ta ~= tb then
        return ta < tb
    end
    if ta == "number" or ta == "string" then
        return a < b
    end
    return tostring(a) < tostring(b)
end

local function sortedKeys(t)
    local keys = {}
    for k in pairs(t) do
        keys[#keys + 1] = k
    end
    table.sort(keys, keyLess)
    return keys
end

local function isArray(t)
    local n = 0
    for k in pairs(t) do
        if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then
            return false
        end
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then
            return false
        end
    end
    return true
end

local function encodeValue(v, buf)
    local tv = type(v)
    if tv == "nil" then
        buf[#buf + 1] = "null"
    elseif tv == "boolean" then
        buf[#buf + 1] = v and "true" or "false"
    elseif tv == "number" then
        if v ~= v or v == math.huge or v == -math.huge then
            buf[#buf + 1] = "null"
        elseif v % 1 == 0 and v > -1e15 and v < 1e15 then
            buf[#buf + 1] = string.format("%d", v)
        else
            buf[#buf + 1] = string.format("%.14g", v)
        end
    elseif tv == "string" then
        buf[#buf + 1] = escapeString(v)
    elseif tv == "table" then
        if isArray(v) then
            buf[#buf + 1] = "["
            for i = 1, #v do
                if i > 1 then
                    buf[#buf + 1] = ","
                end
                encodeValue(v[i], buf)
            end
            buf[#buf + 1] = "]"
        else
            buf[#buf + 1] = "{"
            local first = true
            for _, k in ipairs(sortedKeys(v)) do
                if not first then
                    buf[#buf + 1] = ","
                end
                first = false
                buf[#buf + 1] = escapeString(tostring(k))
                buf[#buf + 1] = ":"
                encodeValue(v[k], buf)
            end
            buf[#buf + 1] = "}"
        end
    else
        buf[#buf + 1] = escapeString("<" .. tv .. ">")
    end
end

function Json.encode(v)
    local buf = {}
    encodeValue(v, buf)
    return table.concat(buf)
end

---------------------------------------------------------------------------
-- Introspection helpers
---------------------------------------------------------------------------

local globalNames = nil

-- reverse map table -> global name, so instances can be labelled with
-- their class (GIANTS classes are globals used as metatable __index)
local function buildGlobalNames()
    globalNames = {}
    for k, v in pairs(_G) do
        if type(k) == "string" and type(v) == "table" then
            local prev = globalNames[v]
            if prev == nil or #k < #prev then
                globalNames[v] = k
            end
        end
    end
end

local function classNameOf(t)
    if type(t) ~= "table" then
        return nil
    end
    if globalNames == nil then
        buildGlobalNames()
    end
    local mt = getmetatable(t)
    if type(mt) ~= "table" then
        return nil
    end
    if globalNames[mt] ~= nil then
        return globalNames[mt]
    end
    local idx = rawget(mt, "__index")
    if type(idx) == "table" then
        return globalNames[idx]
    end
    return nil
end

local function countKeys(t)
    local n = 0
    for _ in pairs(t) do
        n = n + 1
    end
    return n
end

local describe
describe = function(v, depth, seen, maxKeys)
    local tv = type(v)
    if tv == "string" then
        if #v > LIMITS.str then
            return v:sub(1, LIMITS.str) .. "..."
        end
        return v
    elseif tv == "number" or tv == "boolean" or tv == "nil" then
        return v
    elseif tv ~= "table" then
        return "<" .. tv .. ">"
    end

    seen = seen or {}
    local cls = classNameOf(v)
    if seen[v] then
        return "<cycle " .. (cls or "table") .. ">"
    end
    if depth <= 0 then
        return "<" .. (cls or "table") .. " n=" .. countKeys(v) .. ">"
    end

    seen[v] = true
    local out = {}
    if cls ~= nil then
        out._class = cls
    end
    local keys = sortedKeys(v)
    local n = #keys
    if n > 0 and isArray(v) then
        out._n = n
        local items = {}
        for i = 1, math.min(n, LIMITS.items) do
            items[i] = describe(v[i], depth - 1, seen)
        end
        out._items = items
    else
        local limit = maxKeys or LIMITS.keys
        local emitted = 0
        for _, k in ipairs(keys) do
            if emitted >= limit then
                out._truncated = n - emitted
                break
            end
            local value = describe(v[k], depth - 1, seen)
            if value ~= nil then
                out[tostring(k)] = value
            end
            emitted = emitted + 1
        end
    end
    seen[v] = nil
    return out
end

-- function names reachable from an object: its own fields plus the
-- __index chain of its metatables (the GIANTS Class() hierarchy)
local function methodsOf(t)
    local names, seenName = {}, {}
    local function collect(tbl)
        for k, val in pairs(tbl) do
            if type(k) == "string" and type(val) == "function" and not seenName[k] then
                seenName[k] = true
                names[#names + 1] = k
            end
        end
    end
    if type(t) ~= "table" then
        return names
    end
    collect(t)
    local mt = getmetatable(t)
    local level = 0
    while type(mt) == "table" and level < LIMITS.methodDepth do
        local idx = rawget(mt, "__index")
        if type(idx) ~= "table" then
            break
        end
        collect(idx)
        mt = getmetatable(idx)
        level = level + 1
    end
    table.sort(names)
    return names
end

local GETTER_PREFIXES = { "get", "is", "has" }

local function isGetterName(name)
    for _, p in ipairs(GETTER_PREFIXES) do
        if name:sub(1, #p) == p and name:sub(#p + 1, #p + 1):match("%u") then
            return true
        end
    end
    return false
end

-- call every argument-less looking getter; each call is printed to the
-- log first, so if the engine ever crashes the last line names the culprit
local function probeGetters(obj, label)
    local results = {}
    if type(obj) ~= "table" then
        return results
    end
    local count = 0
    for _, name in ipairs(methodsOf(obj)) do
        if count >= LIMITS.getters then
            results._truncated = true
            break
        end
        if isGetterName(name) then
            count = count + 1
            print(string.format("[CompanionSpike] probing %s:%s()", label, name))
            local r = pack(pcall(obj[name], obj))
            if r[1] then
                local values = {}
                for i = 2, r.n do
                    local d = describe(r[i], 1)
                    if d == nil then
                        d = "<nil>"
                    end
                    values[#values + 1] = d
                end
                results[name] = values
            else
                results[name] = { error = tostring(r[2]):sub(1, 160) }
            end
        end
    end
    return results
end

-- inspect = describe + methods + getter results
local function inspect(obj, label, depth, withGetters, maxKeys)
    if obj == nil then
        return "<nil>"
    end
    local out = {
        fields = describe(obj, depth or 1, nil, maxKeys or 200),
        methods = methodsOf(obj),
    }
    if withGetters then
        out.getters = probeGetters(obj, label)
    end
    return out
end

local function tryCall(obj, name, ...)
    if type(obj) ~= "table" or type(obj[name]) ~= "function" then
        return nil
    end
    local r = pack(pcall(obj[name], obj, ...))
    if not r[1] then
        return nil
    end
    return r
end

local function firstListOf(t)
    -- hotspot/field/vehicle collections may be arrays, id-keyed maps or
    -- sets keyed by the object itself; normalise to an array of objects
    local list = {}
    if type(t) ~= "table" then
        return list
    end
    for k, v in pairs(t) do
        if type(v) == "table" then
            list[#list + 1] = v
        elseif type(k) == "table" then
            list[#list + 1] = k
        end
    end
    return list
end

local function nowSec()
    if getTimeSec ~= nil then
        local ok, t = pcall(getTimeSec)
        if ok and type(t) == "number" then
            return t
        end
    end
    return nil
end

---------------------------------------------------------------------------
-- File I/O (the replacement for the named pipe)
---------------------------------------------------------------------------

local function settingsDir()
    local base = g_modSettingsDirectory
    if base == nil and getUserProfileAppPath ~= nil then
        base = getUserProfileAppPath() .. "modSettings/"
    end
    if base == nil then
        return nil
    end
    local last = base:sub(-1)
    if last ~= "/" and last ~= "\\" then
        base = base .. "/"
    end
    local dir = base .. "FS25_CompanionSpike/"
    if createFolder ~= nil then
        pcall(createFolder, base)
        pcall(createFolder, dir)
    end
    return dir
end

local function probeFileIO(dir)
    local res = { dir = dir }
    if io == nil or io.open == nil then
        res.error = "io.open not available"
        return res
    end
    local path = dir .. "io_test.txt"

    local f, err = io.open(path, "w")
    res.openWrite = f ~= nil
    res.openWriteError = err
    if f == nil then
        return res
    end
    f:write("line1\n")
    f:flush()
    local okSeek, size = pcall(f.seek, f, "end")
    res.seekAfterWrite = okSeek and size or ("error: " .. tostring(size))
    f:close()

    local fa, errA = io.open(path, "a")
    res.openAppend = fa ~= nil
    res.openAppendError = errA
    if fa ~= nil then
        fa:write("line2\n")
        fa:close()
    end

    local fr, errR = io.open(path, "r")
    res.openRead = fr ~= nil
    res.openReadError = errR
    if fr ~= nil then
        local content = fr:read("*a")
        fr:close()
        res.readBack = content
        res.appendWorks = content == "line1\nline2\n"
    end

    -- truncate on reopen with "w" (how the transport will rotate)
    local fw = io.open(path, "w")
    if fw ~= nil then
        fw:write("x\n")
        fw:close()
        local fr2 = io.open(path, "r")
        if fr2 ~= nil then
            res.truncateWorks = fr2:read("*a") == "x\n"
            fr2:close()
        end
    end

    -- write throughput: 200 lines of ~300 bytes with a flush each
    local fb = io.open(dir .. "io_bench.txt", "w")
    if fb ~= nil then
        local line = string.rep("x", 300) .. "\n"
        local t0 = nowSec()
        for _ = 1, 200 do
            fb:write(line)
            fb:flush()
        end
        local t1 = nowSec()
        fb:close()
        if t0 ~= nil and t1 ~= nil then
            res.bench200FlushedLinesMs = (t1 - t0) * 1000
        end
    end
    return res
end

---------------------------------------------------------------------------
-- Probes
---------------------------------------------------------------------------

local GLOBALS_OF_INTEREST = {
    "io", "os", "debug", "coroutine", "jit",
    "getUserProfileAppPath", "g_modSettingsDirectory", "createFolder",
    "fileExists", "getFileIsReadable", "deleteFile",
    "getTimeSec", "netGetTime", "g_time",
    "getWorldTranslation", "getWorldRotation", "localDirectionToWorld",
    "renderText", "addConsoleCommand",
    "Platform", "GS_PLATFORM_PC", "GS_IS_CONSOLE_VERSION",
    "g_currentMission", "g_localPlayer", "g_fieldManager", "g_farmlandManager",
    "g_fruitTypeManager", "g_fillTypeManager", "g_missionManager",
    "g_mapManager", "g_currentModName", "g_currentModDirectory",
    "MapHotspot", "PlaceableHotspot", "VehicleHotspot", "PlayerHotspot",
    "FieldHotspot", "FarmlandHotspot", "Field", "FieldState", "Farmland",
    "IngameMap", "IngameMapElement",
}

local function probeGlobals()
    local res = {}
    for _, name in ipairs(GLOBALS_OF_INTEREST) do
        local v = _G[name]
        local entry = type(v)
        if type(v) == "string" or type(v) == "number" or type(v) == "boolean" then
            entry = entry .. ": " .. tostring(v)
        end
        res[name] = entry
    end
    res._luaVersion = _VERSION
    res._modDir = MOD_DIR
    if getUserProfileAppPath ~= nil then
        local ok, p = pcall(getUserProfileAppPath)
        res._userProfileAppPath = ok and p or ("error: " .. tostring(p))
    end
    if Platform ~= nil then
        res._platform = describe(Platform, 1)
    end
    return res
end

local function probeMission()
    local m = g_currentMission
    local res = {
        missionKeys = describe(m, 1, nil, 600),
        missionInfo = describe(m.missionInfo, 2, nil, 200),
        terrainSize = m.terrainSize,
    }
    if m.missionInfo ~= nil and m.missionInfo.map ~= nil then
        res.missionInfoMap = describe(m.missionInfo.map, 2, nil, 200)
    end
    res.environment = describe(m.environment, 1, nil, 200)
    return res
end

local function hotspotInfo(h)
    local info = { class = classNameOf(h) }
    local r = tryCall(h, "getWorldPosition")
    if r ~= nil then
        info.pos = { r[2], r[3], r[4] }
    end
    r = tryCall(h, "getName")
    if r ~= nil then
        info.name = r[2]
    end
    r = tryCall(h, "getCategory")
    if r ~= nil then
        info.category = r[2]
    end
    r = tryCall(h, "getIsVisible")
    if r ~= nil then
        info.visible = r[2]
    end
    info.ownerFarmId = h.ownerFarmId
    return info
end

local function probeHotspots()
    local m = g_currentMission
    local res = { candidates = {} }
    local ingameMap = m.hud and m.hud.ingameMap
    local candidates = {
        ["hud.ingameMap.hotspots"] = ingameMap and ingameMap.hotspots,
        ["hud.ingameMap.hotspotsSorted"] = ingameMap and ingameMap.hotspotsSorted,
        ["mission.mapHotspots"] = m.mapHotspots,
        ["mission.hotspots"] = m.hotspots,
    }
    local chosen, chosenName = nil, nil
    for name, t in pairs(candidates) do
        local list = firstListOf(t)
        res.candidates[name] = type(t) == "table" and #list or type(t)
        if #list > 0 and (chosen == nil or #list > #chosen) then
            chosen, chosenName = list, name
        end
    end
    res.ingameMap = inspect(ingameMap, "ingameMap", 1, true)
    res.mapHotspotClass = describe(MapHotspot, 1, nil, 200)
    if chosen == nil then
        res.error = "no hotspot list found"
        return res
    end
    res.source = chosenName
    res.count = #chosen

    local byClass, histogram, compact = {}, {}, {}
    for i, h in ipairs(chosen) do
        local info = hotspotInfo(h)
        local cls = info.class or "?"
        local key = cls .. "/" .. tostring(info.category)
        histogram[key] = (histogram[key] or 0) + 1
        if byClass[cls] == nil then
            byClass[cls] = inspect(h, "hotspot:" .. cls, 1, true)
        end
        if i <= LIMITS.hotspots then
            compact[#compact + 1] = info
        end
    end
    res.histogram = histogram
    res.sampleByClass = byClass
    res.list = compact
    return res
end

local function probeFields()
    local fm = g_fieldManager
    if fm == nil then
        return { error = "g_fieldManager is nil" }
    end
    local res = { manager = inspect(fm, "fieldManager", 1, false) }
    local fields = fm.fields
    if fields == nil then
        local r = tryCall(fm, "getFields")
        fields = r and r[2]
    end
    local list = firstListOf(fields)
    res.count = #list
    if #list == 0 then
        return res
    end
    res.firstField = inspect(list[1], "field", 2, true)
    local compact = {}
    for i, f in ipairs(list) do
        if i > LIMITS.fields then
            break
        end
        local entry = {
            fieldId = f.fieldId, id = f.id, name = f.name,
            posX = f.posX, posZ = f.posZ,
            farmlandId = type(f.farmland) == "table" and f.farmland.id or nil,
        }
        local r = tryCall(f, "getId")
        if r ~= nil then
            entry.getId = r[2]
        end
        r = tryCall(f, "getCenterOfFieldWorldPosition")
        if r ~= nil then
            entry.center = { r[2], r[3] }
        end
        compact[#compact + 1] = entry
    end
    res.list = compact
    return res
end

local function probeFarmlands()
    local fm = g_farmlandManager
    if fm == nil then
        return { error = "g_farmlandManager is nil" }
    end
    local res = { manager = inspect(fm, "farmlandManager", 1, false) }
    local list = firstListOf(fm.farmlands)
    res.count = #list
    if #list > 0 then
        res.firstFarmland = inspect(list[1], "farmland", 2, true)
    end

    -- grid sampling cost: the plan derives farmland outlines this way
    if fm.getFarmlandIdAtWorldPosition ~= nil then
        local size = g_currentMission.terrainSize or 2048
        local cells = 100
        local step = size / cells
        local histogram = {}
        local t0 = nowSec()
        local ok, err = pcall(function()
            for i = 0, cells - 1 do
                for j = 0, cells - 1 do
                    local x = -size / 2 + (i + 0.5) * step
                    local z = -size / 2 + (j + 0.5) * step
                    local id = fm:getFarmlandIdAtWorldPosition(x, z)
                    local key = tostring(id)
                    histogram[key] = (histogram[key] or 0) + 1
                end
            end
        end)
        local t1 = nowSec()
        res.sample10k = {
            ok = ok, error = not ok and tostring(err) or nil,
            ms = (t0 ~= nil and t1 ~= nil) and (t1 - t0) * 1000 or nil,
            distinctIds = countKeys(histogram),
            histogram = histogram,
        }
    end
    return res
end

local function getControlledVehicle()
    local player = g_localPlayer
    if player ~= nil then
        local r = tryCall(player, "getCurrentVehicle")
        if r ~= nil and r[2] ~= nil then
            return r[2]
        end
    end
    local m = g_currentMission
    return m and m.controlledVehicle
end

local function nodePosition(node)
    if type(node) ~= "number" or node == 0 then
        return nil
    end
    local ok, x, y, z = pcall(getWorldTranslation, node)
    if not ok then
        return nil
    end
    return { x, y, z }
end

local function vehicleInfo(v)
    local info = {
        class = classNameOf(v), typeName = v.typeName, id = v.id,
        uniqueId = v.uniqueId, propertyState = v.propertyState,
        rootNode = v.rootNode, pos = nodePosition(v.rootNode),
    }
    local r = tryCall(v, "getFullName")
    if r ~= nil then
        info.name = r[2]
    end
    r = tryCall(v, "getOwnerFarmId")
    if r ~= nil then
        info.ownerFarmId = r[2]
    end
    r = tryCall(v, "getIsAIActive")
    if r ~= nil then
        info.isAIActive = r[2]
    end
    local specs = {}
    for k in pairs(v) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" then
            specs[#specs + 1] = k
        end
    end
    table.sort(specs)
    info.specs = specs
    return info
end

-- Vehicle screen (specs/0002): couplings, what hangs on forks and hooks,
-- the vehicles nearby that would take the load, the engine's temperature
-- warning. Read-only, all guarded.

-- joint type number -> the name it was registered with
local function jointTypeNames()
    local names = {}
    local aj = AttacherJoints
    if type(aj) == "table" and type(aj.jointTypeNameToInt) == "table" then
        for name, n in pairs(aj.jointTypeNameToInt) do
            names[n] = name
        end
    end
    return names
end

local function firstOf(obj, name, ...)
    local r = tryCall(obj, name, ...)
    return r ~= nil and r[2] or nil
end

local function fillsOf(obj)
    local out = {}
    local units = firstOf(obj, "getFillUnits")
    if type(units) ~= "table" and type(obj.spec_fillUnit) == "table" then
        units = obj.spec_fillUnit.fillUnits
    end
    if type(units) ~= "table" then
        return nil
    end
    for i, unit in ipairs(units) do
        local ft = firstOf(obj, "getFillUnitFillType", i)
        local fillType = ft ~= nil and g_fillTypeManager ~= nil
            and firstOf(g_fillTypeManager, "getFillTypeByIndex", ft) or nil
        -- 0.0.3: whether the game's HUD shows the unit (the mod skips it
        -- when false); kept as a boolean, false included
        local showOnHud = nil
        if type(unit) == "table" and type(unit.showOnHud) == "boolean" then
            showOnHud = unit.showOnHud
        end
        out[#out + 1] = {
            unit = i, fillType = ft, name = type(fillType) == "table" and fillType.name or nil,
            level = firstOf(obj, "getFillUnitFillLevel", i), capacity = firstOf(obj, "getFillUnitCapacity", i),
            showOnHud = showOnHud,
        }
    end
    return out
end

-- 0.0.3: what holds an object, if the game records it: spec_mountable's
-- fields (a table that is a vehicle shown by its id and name) and the
-- mount getters FS22's Mountable had
local function mountInfo(o)
    local spec = o.spec_mountable
    if type(spec) ~= "table" then
        return nil
    end
    local out = { fields = {}, getters = {} }
    for k, v in pairs(spec) do
        if type(k) == "string" then
            if type(v) == "table" and v.id ~= nil and v.typeName ~= nil then
                local name = firstOf(v, "getFullName")
                out.fields[k] = { vehicleId = v.id, typeName = v.typeName, name = name }
            elseif type(v) == "table" then
                out.fields[k] = describe(v, 1, nil, 30)
            elseif type(v) ~= "function" then
                out.fields[k] = v
            end
        end
    end
    for _, name in ipairs({ "getDynamicMountObject", "getMountObject", "getDynamicMountType",
        "getIsDynamicallyMounted", "getIsMounted", "getMountableObject" }) do
        local r = firstOf(o, name)
        if type(r) == "table" and r.id ~= nil then
            out.getters[name] = { vehicleId = r.id, typeName = r.typeName }
        elseif r ~= nil then
            out.getters[name] = type(r) == "table" and describe(r, 1, nil, 30) or r
        end
    end
    return out
end

local function objectInfo(o)
    local info = vehicleInfo(o)
    info.isPallet = o.isPallet
    info.fills = fillsOf(o)
    info.spec_bigBag = describe(o.spec_bigBag, 1, nil, 60)
    info.mountable = mountInfo(o)
    return info
end

local function vehicleScreenProbe(v)
    local res = { jointTypes = {}, rig = {}, mounted = {}, nearby = {} }
    local names = jointTypeNames()
    for n, name in pairs(names) do
        res.jointTypes[tostring(n)] = name
    end
    -- the rig: each member's joint, its type number and name
    local members = { v }
    local function walk(parent, depth)
        local attached = firstOf(parent, "getAttachedImplements")
        if type(attached) ~= "table" or depth > 6 then
            return
        end
        for _, entry in pairs(attached) do
            local o = type(entry) == "table" and entry.object or nil
            if type(o) == "table" then
                local joints = parent.spec_attacherJoints and parent.spec_attacherJoints.attacherJoints or nil
                local joint = type(joints) == "table" and joints[entry.jointDescIndex] or nil
                local jt = type(joint) == "table" and joint.jointType or nil
                local info = vehicleInfo(o)
                info.parent = parent.id
                info.jointDescIndex = entry.jointDescIndex
                info.jointType = jt
                info.jointTypeName = jt ~= nil and names[jt] or nil
                info.joint = describe(joint, 1, nil, 60)
                info.fills = fillsOf(o)
                info.spec_shovel = describe(o.spec_shovel, 1, nil, 60)
                info.spec_dynamicMountAttacher = describe(o.spec_dynamicMountAttacher, 2, nil, 60)
                info.spec_bigBag = describe(o.spec_bigBag, 1, nil, 60)
                res.rig[#res.rig + 1] = info
                members[#members + 1] = o
                walk(o, depth + 1)
            end
        end
    end
    walk(v, 1)
    -- what's on forks and hooks
    local carriedType = nil
    for _, m in ipairs(members) do
        local spec = m.spec_dynamicMountAttacher
        if type(spec) == "table" and type(spec.dynamicMountedObjects) == "table" then
            for k, val in pairs(spec.dynamicMountedObjects) do
                local o = type(k) == "table" and k or (type(val) == "table" and val or nil)
                if o ~= nil then
                    local info = objectInfo(o)
                    info.on = m.id
                    res.mounted[#res.mounted + 1] = info
                    for _, f in ipairs(info.fills or {}) do
                        if (f.level or 0) > 0 then
                            carriedType = carriedType or f.fillType
                        end
                    end
                end
            end
        end
        for _, f in ipairs(m ~= v and fillsOf(m) or {}) do
            if (f.level or 0) > 0 then
                carriedType = carriedType or f.fillType
            end
        end
    end
    res.carriedType = carriedType
    -- the 5 nearest other vehicles: their fill units and what they accept
    local x, _, z = 0, 0, 0
    local p = nodePosition(members[#members].rootNode)
    if p ~= nil then
        x, z = p[1], p[3]
    end
    local all = {}
    local list = g_currentMission.vehicleSystem ~= nil and firstListOf(g_currentMission.vehicleSystem.vehicles) or {}
    for _, o in ipairs(list) do
        local q = nodePosition(o.rootNode)
        if q ~= nil and o ~= v then
            all[#all + 1] = { o = o, d = math.sqrt((q[1] - x) ^ 2 + (q[3] - z) ^ 2) }
        end
    end
    table.sort(all, function(a, b) return a.d < b.d end)
    for i = 1, math.min(5, #all) do
        local o = all[i].o
        local info = objectInfo(o)
        info.distance = all[i].d
        info.root = (firstOf(o, "getRootVehicle") or o).id
        info.maxComponentMass = o.maxComponentMass
        info.getAvailableComponentMass = firstOf(o, "getAvailableComponentMass")
        if carriedType ~= nil then
            for _, f in ipairs(info.fills or {}) do
                f.allows = firstOf(o, "getFillUnitAllowsFillType", f.unit, carriedType)
                f.free = firstOf(o, "getFillUnitFreeCapacity", f.unit, carriedType, firstOf(v, "getOwnerFarmId"))
            end
        end
        res.nearby[#res.nearby + 1] = info
    end
    -- the engine's temperature, and any warning level beside it
    local mz = v.spec_motorized
    res.motorTemperature = describe(mz ~= nil and mz.motorTemperature or nil, 1, nil, 60)
    res.motorFan = describe(mz ~= nil and mz.motorFan or nil, 1, nil, 60)
    -- work lights: front and rear apart, or one switch
    res.spec_lights = describe(v.spec_lights, 1, nil, 120)
    return res
end

-- 0.0.4, a card per tool (specs/0003): what each tool can do, read from
-- the game's own parts; a census of every vehicle type the game loaded;
-- the keys and the "can't now" reasons. Read-only, all guarded; the
-- selection test (csSelect) is the one probe that changes something, and
-- it puts the selection back.

-- the capability rule (specs/0003): a capability for each of these
-- specializations. A mod's spec may carry its mod's prefix
-- ("FS25_x.plow"), so the last part counts.
local CAPABILITY_ORDER = { "lower", "fold", "turnOn", "tip", "tipSide", "cover", "pipe", "rotate", "width", "detach" }
local CAPABILITY_SPECS = {
    lower = { "attachable" }, fold = { "foldable" }, turnOn = { "turnonvehicle" },
    tip = { "trailer", "dischargeable" }, tipSide = { "trailer" }, cover = { "cover" },
    pipe = { "pipe" }, rotate = { "plow" }, width = { "variableworkwidth" },
    detach = { "attachable" },
}

local function shortSpecName(name)
    name = tostring(name)
    if name:sub(1, 5) == "spec_" then
        name = name:sub(6)
    end
    return (name:match("([^%.]+)$") or name):lower()
end

local function capabilitiesOf(specNames)
    local have = {}
    for _, n in ipairs(specNames) do
        have[shortSpecName(n)] = true
    end
    local can = {}
    for _, cap in ipairs(CAPABILITY_ORDER) do
        for _, s in ipairs(CAPABILITY_SPECS[cap]) do
            if have[s] then
                can[#can + 1] = cap
                break
            end
        end
    end
    return can
end

-- every vehicle type: g_vehicleTypeManager.types (else getTypes()), each
-- with specializationNames (else the keys of specializationsByName)
local function probeCensus()
    local res = { count = 0, types = {}, perCapability = {}, specCounts = {} }
    local mgr = g_vehicleTypeManager
    if type(mgr) ~= "table" then
        res.error = "no g_vehicleTypeManager"
        return res
    end
    res.manager = describe(mgr, 1, nil, 40)
    local types, source = mgr.types, "types"
    if type(types) ~= "table" then
        types, source = firstOf(mgr, "getTypes"), "getTypes()"
    end
    if type(types) ~= "table" then
        res.error = "no types table"
        return res
    end
    res.source = source
    local first = nil
    for key, t in pairs(types) do
        if type(t) == "table" then
            first = first or t
            local name = type(t.name) == "string" and t.name or tostring(key)
            local specNames = {}
            if type(t.specializationNames) == "table" then
                for _, n in ipairs(t.specializationNames) do
                    specNames[#specNames + 1] = tostring(n)
                end
            elseif type(t.specializationsByName) == "table" then
                for n in pairs(t.specializationsByName) do
                    specNames[#specNames + 1] = tostring(n)
                end
            end
            table.sort(specNames)
            local can = capabilitiesOf(specNames)
            res.types[name] = { specs = specNames, can = can }
            res.count = res.count + 1
            for _, c in ipairs(can) do
                res.perCapability[c] = (res.perCapability[c] or 0) + 1
            end
            for _, n in ipairs(specNames) do
                local s = shortSpecName(n)
                res.specCounts[s] = (res.specCounts[s] or 0) + 1
            end
        end
    end
    res.firstType = describe(first, 1, nil, 40)
    return res
end

local function twoOf(obj, name, ...)
    local r = tryCall(obj, name, ...)
    if r == nil then
        return nil
    end
    return { r[2], r[3] }
end

-- the methods a card's buttons may need, found by name rather than guessed
local TOOL_METHOD_PATTERNS = { "TipSide", "Rotat", "WorkWidth", "Section", "Bale", "Wrap", "Fold", "TurnedOn",
    "TurnOn", "Cover", "Attach", "Detach", "Lower", "Discharge", "Pipe" }

local function toolMethods(o)
    local out = {}
    for _, name in ipairs(methodsOf(o)) do
        for _, p in ipairs(TOOL_METHOD_PATTERNS) do
            if name:find(p, 1, true) then
                out[#out + 1] = name
                break
            end
        end
    end
    return out
end

-- each spec's registered action events (the keys the tool answers to),
-- with the input binding's active state and text where it has them
local function actionEventsOf(o)
    local out = {}
    local ib = g_inputBinding
    local events = type(ib) == "table" and (ib.events or ib.actionEvents) or nil
    for k, spec in pairs(o) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and type(spec) == "table"
            and type(spec.actionEvents) == "table" then
            local list = {}
            for action, ev in pairs(spec.actionEvents) do
                local entry = { action = tostring(action) }
                if type(ev) == "table" then
                    entry.id = ev.actionEventId
                    local e = type(events) == "table" and ev.actionEventId ~= nil and events[ev.actionEventId] or nil
                    if type(e) == "table" then
                        entry.active = e.isActive
                        entry.text = e.contextDisplayText
                    end
                end
                list[#list + 1] = entry
            end
            if #list > 0 then
                out[k] = list
            end
        end
    end
    return out
end

local INPUT_PATTERNS = { "FOLD", "TURN_ON", "TIP", "ROTAT", "WIDTH", "SECTION", "ATTACH", "LOWER", "IMPLEMENT_EXTRA",
    "COVER", "PIPE", "DISCHARGE", "BALE", "WRAP" }

-- the input actions the game has that spec 0003's buttons may press
local function inputActionNames()
    local out = {}
    if type(InputAction) ~= "table" then
        return out
    end
    for name in pairs(InputAction) do
        if type(name) == "string" then
            for _, p in ipairs(INPUT_PATTERNS) do
                if name:find(p, 1, true) then
                    out[#out + 1] = name
                    break
                end
            end
        end
    end
    table.sort(out)
    return out
end

-- one rig member: its parts, the rule's capabilities, the states and the
-- game's own "can't now" answers, and the parts spec 0003 isn't sure of
local function toolInfo(o)
    local info = vehicleInfo(o)
    info.can = capabilitiesOf(info.specs)
    info.methods = toolMethods(o)
    info.actionEvents = actionEventsOf(o)
    info.fills = fillsOf(o)
    info.workWidth = firstOf(o, "getAIWorkAreaWidth")
    info.speedLimit = firstOf(o, "getSpeedLimit")
    info.lower = { allows = firstOf(o, "getAllowsLowering"), lowered = firstOf(o, "getIsLowered", false) }
    local fold = o.spec_foldable
    if type(fold) == "table" then
        local dir = firstOf(o, "getToggledFoldDirection")
        info.fold = {
            parts = type(fold.foldingParts) == "table" and countKeys(fold.foldingParts) or nil,
            toggledDirection = dir, moveDirection = fold.foldMoveDirection, middle = fold.foldMiddleAnimTime,
            animTime = firstOf(o, "getFoldAnimTime"), allowed = twoOf(o, "getIsFoldAllowed", dir or 1, false),
        }
    end
    if type(o.spec_turnOnVehicle) == "table" then
        info.turnOn = {
            canBeTurnedOn = firstOf(o, "getCanBeTurnedOn"), isTurnedOn = firstOf(o, "getIsTurnedOn"),
            allowed = twoOf(o, "getIsTurnedOnAllowed", true), warning = firstOf(o, "getTurnedOnNotAllowedWarning"),
        }
    end
    info.detach = twoOf(o, "isDetachAllowed")
    info.dischargeState = firstOf(o, "getDischargeState")
    info.spec_trailer = describe(o.spec_trailer, 2, nil, 60)
    info.spec_dischargeable = describe(o.spec_dischargeable, 1, nil, 60)
    info.spec_cover = describe(o.spec_cover, 1, nil, 40)
    info.spec_plow = describe(o.spec_plow, 2, nil, 60)
    info.spec_variableWorkWidth = describe(o.spec_variableWorkWidth, 2, nil, 80)
    info.spec_baler = describe(o.spec_baler, 1, nil, 120)
    info.spec_baleWrapper = describe(o.spec_baleWrapper, 1, nil, 80)
    local aj = o.spec_attacherJoints
    info.attachableInfo = describe(type(aj) == "table" and aj.attachableInfo or nil, 2, nil, 40)
    return info
end

-- the controlled vehicle's whole rig, the vehicle first, then what hangs
-- on it, depth first
local function rigMembers(root)
    local members = { { o = root, depth = 0 } }
    local function walk(parent, depth)
        local attached = firstOf(parent, "getAttachedImplements")
        if type(attached) ~= "table" or depth > 6 then
            return
        end
        for _, entry in pairs(attached) do
            local o = type(entry) == "table" and entry.object or nil
            if type(o) == "table" then
                members[#members + 1] = { o = o, depth = depth, parent = parent.id, jointDescIndex = entry.jointDescIndex }
                walk(o, depth + 1)
            end
        end
    end
    walk(root, 1)
    return members
end

local function toolsProbe(v)
    local root = firstOf(v, "getRootVehicle") or v
    local res = { members = {}, selectable = {} }
    for _, m in ipairs(rigMembers(root)) do
        local info = toolInfo(m.o)
        info.depth, info.parent, info.jointDescIndex = m.depth, m.parent, m.jointDescIndex
        res.members[#res.members + 1] = info
    end
    local sel = firstOf(root, "getSelectedVehicle")
    res.selectedId = type(sel) == "table" and sel.id or nil
    for _, so in ipairs(type(root.selectableObjects) == "table" and root.selectableObjects or {}) do
        local veh = type(so) == "table" and so.vehicle or nil
        res.selectable[#res.selectable + 1] = {
            vehicleId = type(veh) == "table" and veh.id or nil, index = type(so) == "table" and so.index or nil,
            subSelections = type(so) == "table" and type(so.subSelections) == "table" and #so.subSelections or nil,
        }
    end
    res.missionAttachableInfo = describe(g_currentMission ~= nil and g_currentMission.attachableInfo or nil, 1, nil, 40)
    res.inputActions = inputActionNames()
    return res
end

-- csSelect: select each selectable member in turn, one every 400 ms (the
-- game registers a tool's keys on the frames after it's selected), note
-- what's selected and which keys are live, then put the selection back
local SELECT_STEP_MS = 400

local function selectStep(run)
    local root = run.root
    if run.i > 0 then
        local so = run.list[run.i]
        local now = firstOf(root, "getSelectedVehicle")
        local target = type(so) == "table" and so.vehicle or nil
        run.out.steps[#run.out.steps + 1] = {
            target = type(target) == "table" and target.id or nil, ok = run.ok, error = run.err,
            selected = type(now) == "table" and now.id or nil,
            actionEvents = type(target) == "table" and actionEventsOf(target) or nil,
        }
    end
    run.i = run.i + 1
    if run.i > #run.list then
        if run.before ~= nil then
            pcall(root.setSelectedObject, root, run.before)
        end
        local after = firstOf(root, "getSelectedVehicle")
        run.out.after = type(after) == "table" and after.id or nil
        run.out.restored = run.out.after == run.out.before
        return true
    end
    local ok, err = pcall(root.setSelectedObject, root, run.list[run.i])
    run.ok, run.err = ok, (not ok) and tostring(err) or nil
    return false
end

---------------------------------------------------------------------------
-- Key handlers (spike 0.0.5, spec 0003's All row)
---------------------------------------------------------------------------

-- csKeys: every handler the game registered for the All row's keys and the
-- one-tool keys, who owns it and what it calls. csTrace: log each call to
-- them (the keyboard's and the mod's), with the tools' states before and
-- 30 frames after. The trace only wraps the callbacks; they still run.
local KEY_ACTIONS = { "LOWER_ALL_IMPLEMENTS", "FOLD_ALL_IMPLEMENTS", "TURN_ON_ALL_IMPLEMENTS",
    "LOWER_IMPLEMENT", "FOLD_IMPLEMENT", "TURN_ON_IMPLEMENT",
    -- 0.0.8: the tip keys; the game shows I ("Dump") only over a trigger that
    -- takes the load, else Ctrl+I ("Unload here"), both isActive (spec 0003)
    "TOGGLE_TIPSTATE", "TOGGLE_TIPSTATE_GROUND" }
local TRACE_MAX_CALLS = 300
local TRACE_AFTER_FRAMES = 30

local functionNames = nil

-- function -> "Class.method", from the global tables (the GIANTS classes)
local function functionName(fn)
    if type(fn) ~= "function" then
        return nil
    end
    if functionNames == nil then
        functionNames = {}
        for gk, gv in pairs(_G) do
            if type(gk) == "string" and type(gv) == "table" then
                pcall(function()
                    for k, v in pairs(gv) do
                        if type(v) == "function" and type(k) == "string" and functionNames[v] == nil then
                            functionNames[v] = gk .. "." .. k
                        end
                    end
                end)
            end
        end
    end
    return functionNames[fn] or tostring(fn)
end

local function objectLabel(o)
    if type(o) ~= "table" then
        return o == nil and nil or ("<" .. type(o) .. ">")
    end
    local label = { class = classNameOf(o), id = o.id, typeName = o.typeName }
    label.name = firstOf(o, "getFullName") or firstOf(o, "getName")
    if type(o.configFileName) == "string" then
        label.config = o.configFileName:match("[^/\\]+$")
    end
    return label
end

-- the plain fields of an event, and the names of its table fields
local function eventFields(e)
    local plain, tables = {}, {}
    for k, v in pairs(e) do
        local tv = type(v)
        if tv == "string" or tv == "number" or tv == "boolean" then
            plain[tostring(k)] = v
        elseif tv == "table" then
            tables[#tables + 1] = tostring(k)
        end
    end
    table.sort(tables)
    return plain, tables
end

local function eventsFor(name)
    local ib = g_inputBinding
    if type(ib) ~= "table" or type(ib.nameActions) ~= "table" or type(ib.actionEvents) ~= "table" then
        return nil
    end
    local action = ib.nameActions[name]
    return action ~= nil and ib.actionEvents[action] or nil
end

-- the first value, false kept (firstOf turns false into nil)
local function valueOf(obj, name, ...)
    local r = tryCall(obj, name, ...)
    if r == nil then
        return nil
    end
    return r[2]
end

-- the rig's states: what each button acts on
-- 0.0.8: a trailer's discharge, to learn what tells a trigger in reach from
-- the ground: Dischargeable's spec and its current node, plain fields, and
-- the FS22 getters' answers (unverified names, each tried)
local function dischargeOf(o)
    local spec = o.spec_dischargeable
    if type(spec) ~= "table" then
        return nil
    end
    local node = spec.currentDischargeNode
    local specPlain, specTables = eventFields(spec)
    local out = { spec = specPlain, specTables = specTables,
        tipState = type(o.spec_trailer) == "table" and o.spec_trailer.tipState or nil }
    if type(node) == "table" then
        local plain, tables = eventFields(node)
        out.node, out.nodeTables = plain, tables
        out.dischargeObject = node.dischargeObject ~= nil and tostring(node.dischargeObject) or nil
        out.dischargeHit = node.dischargeHit
        out.dischargeFailedReason = node.dischargeFailedReason
        out.canDischargeToObject = valueOf(o, "getCanDischargeToObject", node)
        out.canDischargeToGround = valueOf(o, "getCanDischargeToGround", node)
        out.canDischargeAtPosition = valueOf(o, "getCanDischargeAtPosition", node)
        out.canToggleDischargeToObject = valueOf(o, "getCanToggleDischargeToObject")
        out.canToggleDischargeToGround = valueOf(o, "getCanToggleDischargeToGround")
        out.dischargeState = valueOf(o, "getDischargeState")
    end
    return out
end

local function rigStates()
    local v = getControlledVehicle()
    if v == nil then
        return nil
    end
    local root = firstOf(v, "getRootVehicle") or v
    local sel = firstOf(root, "getSelectedVehicle")
    local out = {}
    for _, m in ipairs(rigMembers(root)) do
        local o = m.o
        out[#out + 1] = {
            id = o.id, name = firstOf(o, "getName"), selected = sel == o or nil,
            lowered = valueOf(o, "getIsLowered", false),
            foldAnimTime = valueOf(o, "getFoldAnimTime"),
            foldMoveDirection = type(o.spec_foldable) == "table" and o.spec_foldable.foldMoveDirection or nil,
            turnedOn = valueOf(o, "getIsTurnedOn"),
            motorStarted = valueOf(o, "getIsMotorStarted"),
            discharge = dischargeOf(o),
        }
    end
    return out
end

local function probeKeys()
    local ib = g_inputBinding
    local res = { actions = {}, rig = rigStates(), binding = {} }
    if type(ib) == "table" then
        for k, v in pairs(ib) do
            if type(k) == "string" then
                local tv = type(v)
                res.binding[k] = (tv == "table" or tv == "function") and ("<" .. tv .. ">") or v
            end
        end
    end
    for _, name in ipairs(KEY_ACTIONS) do
        local events = eventsFor(name)
        local list = {}
        if type(events) == "table" then
            for key, e in pairs(events) do
                if type(e) == "table" then
                    local plain, tables = eventFields(e)
                    list[#list + 1] = {
                        key = tostring(key), callback = functionName(e.callback), target = objectLabel(e.targetObject),
                        isActive = e.isActive,
                        -- what Companion's runInputAction calls: every one of these
                        modCalls = type(e.callback) == "function" and e.isActive ~= false,
                        sameAsEventsById = type(ib.events) == "table" and e.id ~= nil and ib.events[e.id] == e or nil,
                        callbackState = describe(e.callbackState, 1),
                        fields = plain, tableFields = tables,
                    }
                end
            end
        end
        res.actions[name] = { known = events ~= nil, count = #list, events = list }
    end
    return res
end

local function shortStack()
    if debug == nil or debug.traceback == nil then
        return nil
    end
    local lines = {}
    for line in tostring(debug.traceback("", 3)):gmatch("[^\n]+") do
        if not line:find("stack traceback", 1, true) and #lines < 8 then
            lines[#lines + 1] = line:gsub("^%s+", "")
        end
    end
    return lines
end

-- wrap any of the keys' callbacks not wrapped yet; runs every frame while
-- tracing, since the game registers a tool's events again on a selection
local function traceWrap(tr)
    for _, name in ipairs(KEY_ACTIONS) do
        local events = eventsFor(name)
        if type(events) == "table" then
            for key, e in pairs(events) do
                if type(e) == "table" and type(e.callback) == "function" and e.callback ~= tr.wrappers[e] then
                    local original = e.callback
                    local label = { action = name, key = tostring(key), callback = functionName(original),
                        target = objectLabel(e.targetObject) }
                    local function record(a)
                        -- every argument from the 5th on (the keyboard's 9th: what is it?)
                        local values, types = {}, {}
                        for i = 5, math.max(a.n, 5) do
                            values[#values + 1] = describe(a[i], 0)
                            types[#types + 1] = type(a[i])
                        end
                        tr.calls[#tr.calls + 1] = {
                            t = g_time, frame = tr.frame, action = label.action, key = label.key,
                            callback = label.callback, target = label.target,
                            inputValue = a[3], args = a.n, callbackState = describe(a[4], 0),
                            argValues = values, argTypes = types, pressedBy = tr.pressing,
                            stack = shortStack(), before = rigStates(),
                        }
                        tr.afterAt = tr.frame + TRACE_AFTER_FRAMES
                    end
                    -- the logging can never stop the game's handler from running
                    local wrapper = function(...)
                        if #tr.calls < TRACE_MAX_CALLS then
                            pcall(record, pack(...))
                        end
                        return original(...)
                    end
                    tr.originals[e], tr.wrappers[e] = original, wrapper
                    e.callback = wrapper
                    tr.wrappedCount = tr.wrappedCount + 1
                end
            end
        end
    end
end

-- put back every original callback still in place
local function traceUnwrap(tr)
    local restored = 0
    for e, wrapper in pairs(tr.wrappers) do
        if e.callback == wrapper then
            e.callback = tr.originals[e]
            restored = restored + 1
        end
    end
    tr.wrappers, tr.originals = {}, {}
    return restored
end

local function traceFrame(tr)
    tr.frame = tr.frame + 1
    traceWrap(tr)
    if tr.afterAt ~= nil and tr.frame >= tr.afterAt then
        tr.afterAt = nil
        tr.after[#tr.after + 1] = { t = g_time, frame = tr.frame, states = rigStates() }
    end
end

local function newTrace()
    return {
        frame = 0, calls = {}, after = {}, wrappedCount = 0,
        wrappers = setmetatable({}, { __mode = "k" }), originals = setmetatable({}, { __mode = "k" }),
    }
end

-- csPress: press a key the way Companion's runInputAction does (mod
-- 0.8.13): every active handler, from update(), with 8 arguments
local function pressLikeTheMod(name)
    local events = eventsFor(name)
    local called = 0
    if type(events) == "table" then
        for _, e in pairs(events) do
            if type(e) == "table" and type(e.callback) == "function" and e.isActive ~= false then
                if pcall(e.callback, e.targetObject, name, 1, e.callbackState, false, false, nil, nil) then
                    called = called + 1
                end
            end
        end
    end
    return called
end

local function writeJson(name, out)
    local dir = ctx.dir or settingsDir()
    ctx.dir = dir
    if dir == nil then
        return false
    end
    out.spikeVersion, out.gameTimeMs = SPIKE_VERSION, g_time
    local ok, text = pcall(Json.encode, out)
    if not ok then
        log("%s encode failed: %s", name, tostring(text))
        return false
    end
    local f = io.open(dir .. name, "w")
    if f == nil then
        return false
    end
    f:write(text)
    f:close()
    log("%s written: %s%s (%d bytes)", name:match("^[^.]+"), dir, name, #text)
    return true
end

-- csKeys NAME writes keys-NAME.json (0.0.8: one file per place)
local function writeKeys(out, name)
    local file = name ~= nil and name ~= "" and ("keys-" .. tostring(name):gsub("[^%w_-]", "") .. ".json") or "keys.json"
    return writeJson(file, out), file
end

---------------------------------------------------------------------------
-- Lower all's timing (spike 0.0.7, spec 0003 revision 2)
---------------------------------------------------------------------------

-- csCombo: live (2026-10-30) the game's Lower all lowered the T7.300's
-- rear mower 2.0 s after the front one, every time. Where does that come
-- from: the tractor's attacher joint combo (FS22's names, unverified)?
-- It writes what the tractor's attacher joints hold (every field named
-- combo, each joint's plain fields, the tractor's Combo methods), then
-- presses Lower all as the mod does and records every change in those
-- and in the tools' states, frame by frame, for COMBO_MS.
local COMBO_MS = 8000
local COMBO_MAX_CHANGES = 3000

local function round3(v)
    if type(v) == "number" and v % 1 ~= 0 then
        return math.floor(v * 1000 + 0.5) / 1000
    end
    return v
end

-- path -> plain value, for every plain field down to `depth`
local function flatten(t, prefix, depth, out, seen)
    seen = seen or {}
    if type(t) ~= "table" or depth < 0 or seen[t] then
        return out
    end
    seen[t] = true
    for k, v in pairs(t) do
        local path = prefix .. "." .. tostring(k)
        local tv = type(v)
        if tv == "number" or tv == "boolean" or tv == "string" then
            out[path] = round3(v)
        elseif tv == "table" and classNameOf(v) == nil then
            flatten(v, path, depth - 1, out, seen)
        end
    end
    return out
end

-- what the combo probe follows: the attacher joints' combo fields and
-- each joint's plain fields, and the tools' states
local function comboState(root)
    local out = {}
    local spec = root.spec_attacherJoints
    if type(spec) == "table" then
        for k, v in pairs(spec) do
            if type(k) == "string" and k:lower():find("combo", 1, true) then
                if type(v) == "table" then
                    flatten(v, k, 3, out)
                else
                    out[k] = round3(v)
                end
            end
        end
        for i, joint in ipairs(type(spec.attacherJoints) == "table" and spec.attacherJoints or {}) do
            flatten(joint, "attacherJoints." .. i, 0, out)
        end
    end
    for _, s in ipairs(rigStates() or {}) do
        for k, v in pairs(s) do
            out["tool." .. tostring(s.name) .. "." .. k] = round3(v)
        end
    end
    return out
end

local function probeCombo(root)
    local spec = root.spec_attacherJoints
    local res = { tractor = objectLabel(root), methods = {}, fields = {}, state = comboState(root) }
    for _, m in ipairs(methodsOf(root)) do
        if m:lower():find("combo", 1, true) then
            res.methods[#res.methods + 1] = m
        end
    end
    table.sort(res.methods)
    if type(spec) == "table" then
        for k, v in pairs(spec) do
            res.fields[tostring(k)] = type(v)
        end
    end
    return res
end

local function comboFrame(run)
    local now = comboState(run.root)
    for path, v in pairs(now) do
        if run.last[path] ~= v and #run.changes < COMBO_MAX_CHANGES then
            run.changes[#run.changes + 1] = { t = g_time, ms = g_time - run.start, path = path, from = run.last[path], to = v }
        end
    end
    for path, v in pairs(run.last) do
        if now[path] == nil and #run.changes < COMBO_MAX_CHANGES then
            run.changes[#run.changes + 1] = { t = g_time, ms = g_time - run.start, path = path, from = v }
        end
    end
    run.last = now
    return g_time - run.start >= COMBO_MS
end

local function vehicleDetail(v)
    local function first(name, ...)
        local r = tryCall(v, name, ...)
        return r ~= nil and r[2] or nil
    end
    local res = {
        getDamageAmount = first("getDamageAmount"),
        getWearTotalAmount = first("getWearTotalAmount"),
        getOperatingTime = first("getOperatingTime"),
        getOperationTime = first("getOperationTime"),
        operatingTime = v.operatingTime,
        consumers = {},
    }
    if type(FillType) == "table" then
        for _, name in ipairs({ "DIESEL", "DEF", "ELECTRICCHARGE", "METHANE" }) do
            local unit = FillType[name] ~= nil and first("getConsumerFillUnitIndex", FillType[name]) or nil
            if unit ~= nil then
                res.consumers[name] = {
                    unit = unit,
                    level = first("getFillUnitFillLevel", unit),
                    capacity = first("getFillUnitCapacity", unit),
                }
            end
        end
    end
    res.spec_motorized = describe(v.spec_motorized, 1, nil, 200)
    res.spec_wearable = describe(v.spec_wearable, 1, nil, 100)
    res.spec_fillUnit = describe(v.spec_fillUnit, 2, nil, 100)
    -- Themes T6 candidates: cruise control, hitches, PTO, AI job
    res.getCruiseControlState = first("getCruiseControlState")
    res.getCruiseControlSpeed = first("getCruiseControlSpeed")
    res.spec_drivable = describe(v.spec_drivable, 2, nil, 100)
    res.spec_attacherJoints = describe(v.spec_attacherJoints, 2, nil, 100)
    res.spec_powerConsumer = describe(v.spec_powerConsumer, 1, nil, 100)
    res.spec_aiJobVehicle = describe(v.spec_aiJobVehicle, 2, nil, 100)
    res.vehicleScreen = vehicleScreenProbe(v)
    res.tools = toolsProbe(v)
    return res
end

local function probeVehicles()
    local m = g_currentMission
    local res = {}
    local source, list = nil, {}
    if m.vehicleSystem ~= nil then
        res.vehicleSystem = inspect(m.vehicleSystem, "vehicleSystem", 1, false)
        list = firstListOf(m.vehicleSystem.vehicles)
        source = "vehicleSystem.vehicles"
    end
    if #list == 0 and m.vehicles ~= nil then
        list = firstListOf(m.vehicles)
        source = "mission.vehicles"
    end
    res.source = source
    res.count = #list
    local compact = {}
    for i, v in ipairs(list) do
        if i > 40 then
            break
        end
        compact[#compact + 1] = vehicleInfo(v)
    end
    res.list = compact
    if #list > 0 then
        -- no getter probing on vehicles: hundreds of spec getters, many
        -- need arguments
        res.firstVehicleFields = describe(list[1], 1, nil, 300)
    end
    local controlled = getControlledVehicle()
    if controlled ~= nil then
        res.controlled = vehicleInfo(controlled)
        res.controlledDetail = vehicleDetail(controlled)
    end
    return res
end

local function probePlayer()
    local m = g_currentMission
    return {
        localPlayer = inspect(g_localPlayer, "localPlayer", 1, true),
        missionPlayer = describe(m.player, 1, nil, 200),
        playerSystem = describe(m.playerSystem, 1, nil, 200),
    }
end

local function probeTypes()
    return {
        fruitTypeManager = describe(g_fruitTypeManager, 1, nil, 100),
        firstFruitType = g_fruitTypeManager ~= nil
            and describe((g_fruitTypeManager.fruitTypes or {})[1], 1, nil, 120) or nil,
        fillTypeManager = describe(g_fillTypeManager, 1, nil, 100),
    }
end

---------------------------------------------------------------------------
-- Report
---------------------------------------------------------------------------

local function section(report, name, fn)
    local handler = function(e)
        if debug ~= nil and debug.traceback ~= nil then
            return debug.traceback(tostring(e), 2)
        end
        return tostring(e)
    end
    local ok, res = xpcall(fn, handler)
    if ok then
        report[name] = res
    else
        report[name] = { error = tostring(res) }
        log("section %s failed: %s", name, tostring(res))
    end
end

function CS.writeReport()
    globalNames = nil   -- rebuild: classes may be registered late
    local dir = ctx.dir or settingsDir()
    ctx.dir = dir
    local report = {
        spikeVersion = SPIKE_VERSION,
        gameTimeMs = g_time,
    }
    section(report, "globals", probeGlobals)
    if dir ~= nil then
        section(report, "fileIO", function() return probeFileIO(dir) end)
    end
    section(report, "mission", probeMission)
    section(report, "hotspots", probeHotspots)
    section(report, "fields", probeFields)
    section(report, "farmlands", probeFarmlands)
    section(report, "vehicles", probeVehicles)
    section(report, "player", probePlayer)
    section(report, "types", probeTypes)
    section(report, "census", probeCensus)
    report.selectTest = ctx.selectTest
    report.log = ctx.log

    if dir == nil then
        log("no modSettings directory — cannot write report")
        return false
    end
    local okEnc, text = pcall(Json.encode, report)
    if not okEnc then
        log("report encode failed: %s", tostring(text))
        return false
    end
    local f, err = io.open(dir .. "report.json", "w")
    if f == nil then
        log("cannot write report: %s", tostring(err))
        return false
    end
    f:write(text)
    f:close()
    log("report written: %sreport.json (%d bytes)", dir, #text)
    return true
end

---------------------------------------------------------------------------
-- Pose stream (heading check + first protocol fixture)
---------------------------------------------------------------------------

local function poseOfNode(node)
    local p = nodePosition(node)
    if p == nil then
        return nil
    end
    local pose = { x = p[1], y = p[2], z = p[3] }
    local okDir, dx, _, dz = pcall(localDirectionToWorld, node, 0, 0, 1)
    if okDir and dx ~= nil then
        pose.dx = dx
        pose.dz = dz
        -- candidate convention: 0 = north (-Z), clockwise (east = +X)
        pose.hdg = (math.deg(atan2(dx, -dz)) + 360) % 360
    end
    local okRot, _, ry = pcall(getWorldRotation, node)
    if okRot and ry ~= nil then
        pose.yawDeg = math.deg(ry)
    end
    return pose
end

local function samplePose()
    local data = {}
    local vehicle = getControlledVehicle()
    if vehicle ~= nil then
        data.vehicle = poseOfNode(vehicle.rootNode)
        data.vehicleName = vehicle.typeName
    end
    local player = g_localPlayer
    if player ~= nil then
        data.player = poseOfNode(player.rootNode)
        local r = tryCall(player, "getPosition")
        if r ~= nil then
            data.playerGetPosition = { r[2], r[3], r[4] }
        end
    end
    return data
end

local function writeStreamLine()
    if ctx.stream == nil then
        return
    end
    if ctx.seq >= STREAM_MAX_LINES then
        ctx.stream:close()
        ctx.stream = nil
        log("pose stream complete (%d lines)", ctx.seq)
        return
    end
    local data = samplePose()
    ctx.lastPose = data
    ctx.seq = ctx.seq + 1
    local line = Json.encode({
        v = 0, seq = ctx.seq, t = g_time, topic = "spike_pose", data = data,
    })
    ctx.stream:write(line, "\n")
    ctx.stream:flush()
end

---------------------------------------------------------------------------
-- Mod event listener
---------------------------------------------------------------------------

function CompanionSpike:loadMap(name)
    ctx.elapsed = 0
    ctx.dumped = false
    ctx.seq = 0
    ctx.status = "map loaded, report in 5 s"
    if addConsoleCommand ~= nil then
        addConsoleCommand("csDump", "Write the FS25 Companion spike report again",
            "consoleDump", CompanionSpike)
        addConsoleCommand("csSelect", "Select each tool of the rig in turn, then put the selection back",
            "consoleSelect", CompanionSpike)
        addConsoleCommand("csKeys", "Write the All row's and the tip keys' handlers to keys.json (csKeys NAME: keys-NAME.json)",
            "consoleKeys", CompanionSpike)
        addConsoleCommand("csTrace", "Start, or stop and write, a trace of the All row's key handlers",
            "consoleTrace", CompanionSpike)
        addConsoleCommand("csPress", "Press a key as FS25 Companion does (default LOWER_ALL_IMPLEMENTS)",
            "consolePress", CompanionSpike)
        addConsoleCommand("csCombo", "Press Lower all and record the attacher joint combo to combo.json",
            "consoleCombo", CompanionSpike)
    end
end

function CompanionSpike:deleteMap()
    if ctx.stream ~= nil then
        ctx.stream:close()
        ctx.stream = nil
    end
    if removeConsoleCommand ~= nil then
        removeConsoleCommand("csDump")
        removeConsoleCommand("csSelect")
        removeConsoleCommand("csKeys")
        removeConsoleCommand("csTrace")
        removeConsoleCommand("csPress")
        removeConsoleCommand("csCombo")
    end
    ctx.selectRun = nil
    ctx.pressNext = nil
    ctx.combo = nil
    if ctx.trace ~= nil then
        pcall(traceUnwrap, ctx.trace)
        ctx.trace = nil
    end
end

function CompanionSpike:consoleKeys(name)
    local ok, res = pcall(probeKeys)
    if not ok then
        log("keys probe failed: %s", tostring(res))
        return "keys probe failed, see log"
    end
    local parts = {}
    for _, name in ipairs(KEY_ACTIONS) do
        parts[#parts + 1] = name .. "=" .. tostring(res.actions[name].count)
    end
    local written, file = writeKeys({ keys = res }, name)
    return file .. (written and " written: " or " FAILED: ") .. table.concat(parts, " ")
end

function CompanionSpike:consolePress(name)
    name = (name == nil or name == "") and "LOWER_ALL_IMPLEMENTS" or tostring(name):upper()
    local known = false
    for _, k in ipairs(KEY_ACTIONS) do
        known = known or k == name
    end
    if not known then
        return "csPress takes one of: " .. table.concat(KEY_ACTIONS, ", ")
    end
    ctx.pressNext = name
    return "pressing " .. name .. " as the mod does, next frame"
end

function CompanionSpike:consoleCombo()
    if ctx.combo ~= nil then
        return "already recording"
    end
    local v = getControlledVehicle()
    if v == nil then
        return "get in a vehicle first"
    end
    local root = firstOf(v, "getRootVehicle") or v
    local ok, res = pcall(probeCombo, root)
    if not ok then
        return "combo probe failed: " .. tostring(res)
    end
    -- pressed on the next frame, recorded from the frame before
    ctx.combo = { root = root, probe = res, last = res.state, changes = {}, start = g_time, pressAt = nil }
    ctx.status = "recording Lower all's combo"
    local fields = 0
    for k in pairs(res.state) do
        if not k:find("^tool%.") then
            fields = fields + 1
        end
    end
    return string.format("pressing Lower all and recording %d s; %d joint field(s), methods: %s", COMBO_MS / 1000,
        fields, table.concat(res.methods, ", "))
end

function CompanionSpike:consoleTrace()
    local tr = ctx.trace
    if tr == nil then
        ctx.trace = newTrace()
        local ok, err = pcall(traceWrap, ctx.trace)
        if not ok then
            ctx.trace = nil
            return "trace failed: " .. tostring(err)
        end
        ctx.status = "tracing the All row's keys (csTrace again to stop)"
        return string.format("tracing: %d handlers wrapped; press the keys, then csTrace again", ctx.trace.wrappedCount)
    end
    ctx.trace = nil
    local okUn, restored = pcall(traceUnwrap, tr)
    local okKeys, keys = pcall(probeKeys)
    local out = {
        trace = { frames = tr.frame, calls = tr.calls, after = tr.after, wrapped = tr.wrappedCount,
            restored = okUn and restored or tostring(restored) },
        keys = okKeys and keys or { error = tostring(keys) },
    }
    ctx.status = "trace written to keys.json"
    return string.format("%s: %d calls, %d handlers restored", writeKeys(out) and "keys.json written" or "keys.json FAILED",
        #tr.calls, okUn and restored or -1)
end

function CompanionSpike:consoleDump()
    local ok = CS.writeReport()
    return ok and ("report written to " .. tostring(ctx.dir)) or "report failed, see log"
end

function CompanionSpike:consoleSelect()
    local v = getControlledVehicle()
    if v == nil then
        return "get in a vehicle first"
    end
    local root = firstOf(v, "getRootVehicle") or v
    if type(root.setSelectedObject) ~= "function" or type(root.selectableObjects) ~= "table" then
        return "this vehicle has no selection"
    end
    local list = {}
    for _, so in ipairs(root.selectableObjects) do
        list[#list + 1] = so
    end
    local before = firstOf(root, "getSelectedVehicle")
    ctx.selectTest = nil
    ctx.selectRun = {
        root = root, list = list, i = 0, timer = 0, before = firstOf(root, "getSelectedObject"),
        out = { before = type(before) == "table" and before.id or nil, steps = {} },
    }
    ctx.status = "selection test running"
    return string.format("selecting %d objects, one every %d ms; the report follows", #list, SELECT_STEP_MS)
end

function CompanionSpike:update(dt)
    ctx.elapsed = ctx.elapsed + dt
    local combo = ctx.combo
    if combo ~= nil then
        local ok, done = pcall(function()
            if combo.pressAt == nil then
                combo.start = g_time
                combo.pressAt = g_time
                combo.called = pressLikeTheMod("LOWER_ALL_IMPLEMENTS")
            end
            return comboFrame(combo)
        end)
        if not ok or done then
            ctx.combo = nil
            local out = { combo = { probe = combo.probe, pressedAt = combo.pressAt, handlersCalled = combo.called,
                changes = combo.changes, error = not ok and tostring(done) or nil } }
            ctx.status = writeJson("combo.json", out) and "combo written to combo.json" or "combo: write FAILED"
            log("csCombo: %d change(s) recorded", #combo.changes)
        end
    end
    if ctx.pressNext ~= nil then
        local name = ctx.pressNext
        ctx.pressNext = nil
        if ctx.trace ~= nil then
            ctx.trace.pressing = "csPress"
        end
        local ok, called = pcall(pressLikeTheMod, name)
        if ctx.trace ~= nil then
            ctx.trace.pressing = nil
        end
        log("csPress %s: %s handler(s) called", name, ok and tostring(called) or ("failed: " .. tostring(called)))
    end
    if ctx.trace ~= nil then
        local ok, err = pcall(traceFrame, ctx.trace)
        if not ok then
            log("trace stopped: %s", tostring(err))
            pcall(traceUnwrap, ctx.trace)
            ctx.trace = nil
        end
    end
    local run = ctx.selectRun
    if run ~= nil then
        run.timer = run.timer + dt
        if run.i == 0 or run.timer >= SELECT_STEP_MS then
            run.timer = 0
            local ok, done = pcall(selectStep, run)
            if not ok or done then
                ctx.selectRun = nil
                ctx.selectTest = ok and run.out or { error = tostring(done) }
                local written = CS.writeReport()
                ctx.status = written and "selection test written to report.json" or "selection test: report FAILED"
            end
        end
    end
    if not ctx.dumped and ctx.elapsed >= DUMP_DELAY_MS then
        ctx.dumped = true
        local ok = CS.writeReport()
        ctx.status = ok and ("report written to " .. tostring(ctx.dir)) or "report FAILED (see log)"
        if ctx.dir ~= nil then
            ctx.stream = io.open(ctx.dir .. "stream.ndjson", "w")
            if ctx.stream == nil then
                log("cannot open stream.ndjson")
            end
        end
    end
    if ctx.stream ~= nil then
        ctx.streamTimer = ctx.streamTimer + dt
        if ctx.streamTimer >= STREAM_INTERVAL_MS then
            ctx.streamTimer = 0
            local ok, err = pcall(writeStreamLine)
            if not ok then
                log("stream write failed: %s", tostring(err))
                pcall(ctx.stream.close, ctx.stream)
                ctx.stream = nil
            end
        end
    end
end

local function fmtPose(label, p)
    if p == nil then
        return label .. ": -"
    end
    return string.format("%s: x=%.1f z=%.1f hdg=%.1f yaw=%.1f",
        label, p.x or 0, p.z or 0, p.hdg or -1, p.yawDeg or -1)
end

function CompanionSpike:draw()
    if renderText == nil then
        return
    end
    local lines = { "[CompanionSpike] " .. ctx.status }
    if ctx.lastPose ~= nil then
        lines[#lines + 1] = fmtPose("vehicle", ctx.lastPose.vehicle)
        lines[#lines + 1] = fmtPose("player", ctx.lastPose.player)
        lines[#lines + 1] = string.format("stream lines: %d", ctx.seq)
    end
    for i, text in ipairs(lines) do
        renderText(0.01, 0.62 - i * 0.018, 0.013, text)
    end
end

-- exposed for offline tests (lupa / plain Lua)
CS._Json = Json
CS._describe = describe
CS._capabilitiesOf = capabilitiesOf
CS._probeCensus = probeCensus
CS._toolsProbe = toolsProbe
CS._selectStep = selectStep
CS._probeKeys = probeKeys
CS._ctx = ctx
CS._probeCombo, CS._comboState = probeCombo, comboState
CS._traceWrap, CS._traceUnwrap, CS._traceFrame, CS._newTrace = traceWrap, traceUnwrap, traceFrame, newTrace

if addModEventListener ~= nil then
    addModEventListener(CompanionSpike)
end
