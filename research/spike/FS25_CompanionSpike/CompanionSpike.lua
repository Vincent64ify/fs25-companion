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

local SPIKE_VERSION = "0.0.18"
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
                        entry.shown = e.displayIsVisible
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
local function pressLikeTheMod(name, value)
    local events = eventsFor(name)
    local called = 0
    if type(events) == "table" then
        for _, e in pairs(events) do
            if type(e) == "table" and type(e.callback) == "function" and e.isActive ~= false then
                if pcall(e.callback, e.targetObject, name, value or 1, e.callbackState, false, false, nil, nil) then
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

---------------------------------------------------------------------------
-- Card buttons (spike 0.0.9, spec 0012)
---------------------------------------------------------------------------

-- csParts: for each rig member, what spec 0012 reads to know a tool's
-- buttons (rule 1: its parts and their load-time settings) and what fades
-- them now (rule 2), by the names in the game's own scripts
-- (gameSource.zip: TurnOnVehicle, FillUnit, Plow, Baler, BaleCounter,
-- Sprayer, VariableWorkWidth, Foldable). csRate: Precision Farming's
-- sprayer part, whose script isn't readable: its fields, then one press of
-- a key as the mod does, every change recorded for RATE_MS.
local RATE_MS = 3000
local RATE_MAX_CHANGES = 2000
local RATE_KEY = "PRECISIONFARMING_SPRAY_AMOUNT"

-- the specs whose name contains `part` (a mod's spec carries its mod's
-- prefix: "spec_FS25_precisionFarming.extendedSprayer"), sorted by name
local function specsLike(o, part)
    local names = {}
    for k, v in pairs(o) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and type(v) == "table"
            and k:lower():find(part:lower(), 1, true) then
            names[#names + 1] = k
        end
    end
    table.sort(names)
    return names
end

-- the methods whose names say rate, amount or Precision Farming
local RATE_PATTERNS = { "Rate", "Amount", "SprayType", "Nitrogen", "PrecisionFarming", "Doubled" }

local function rateMethods(o)
    local out = {}
    for _, name in ipairs(methodsOf(o)) do
        for _, p in ipairs(RATE_PATTERNS) do
            if name:find(p, 1, true) then
                out[#out + 1] = name
                break
            end
        end
    end
    return out
end

-- a getter's first answer, false included (firstOf turns false into nil)
local function answerOf(obj, name, ...)
    local r = tryCall(obj, name, ...)
    if r == nil then
        return nil
    end
    return r[2]
end

-- 0.0.15 (spec 0020): Steering Assist, read only, no calls. The mode part
-- (AIModeSelection.lua) and the steering part (AIAutomaticSteering.lua):
-- their plain fields, the course's class and plain fields, the MODE names,
-- and the steering key's event, walked as VehicleState.liveKey walks it
local STEERING_KEY = "TOGGLE_AI_STEERING"

local function steeringOf(o)
    local sel, aut = o.spec_aiModeSelection, o.spec_aiAutomaticSteering
    if type(sel) ~= "table" and type(aut) ~= "table" then
        return nil
    end
    local out = { hasModeSelection = type(sel) == "table", hasAutomaticSteering = type(aut) == "table" }
    local modes = type(AIModeSelection) == "table" and AIModeSelection.MODE or nil
    if type(modes) == "table" then
        out.modes = {}
        for k, v in pairs(modes) do
            out.modes[tostring(k)] = (type(v) == "number" or type(v) == "string" or type(v) == "boolean") and v
                or "<" .. type(v) .. ">"
        end
    end
    if type(sel) == "table" then
        out.modeSelection = flatten(sel, "modeSelection", 1, {})
        local mode = sel.currentMode
        out.currentMode = (type(mode) == "table" and "<table>") or mode
        if type(modes) == "table" then
            for k, v in pairs(modes) do
                if v == mode then
                    out.currentModeName = tostring(k)
                end
            end
        end
    end
    if type(aut) == "table" then
        out.automaticSteering = flatten(aut, "automaticSteering", 0, {})
        out.steeringEnabled = aut.steeringEnabled
        local course = aut.steeringFieldCourse
        out.hasCourse = course ~= nil
        if type(course) == "table" then
            out.courseClass = classNameOf(course)
            out.course = flatten(course, "course", 0, {})
        end
        local events = type(g_inputBinding) == "table" and g_inputBinding.events or nil
        local key = InputAction ~= nil and InputAction[STEERING_KEY] or STEERING_KEY
        local ev = type(aut.actionEvents) == "table" and aut.actionEvents[key] or nil
        out.steeringKey = { registered = type(ev) == "table", id = type(ev) == "table" and ev.actionEventId or nil }
        local e = type(ev) == "table" and ev.actionEventId ~= nil and type(events) == "table"
            and events[ev.actionEventId] or nil
        if type(e) == "table" then
            out.steeringKey.found = true
            out.steeringKey.active = e.isActive
            out.steeringKey.text = e.contextDisplayText
            out.steeringKey.shown = e.displayIsVisible
        end
    end
    return out
end

-- one rig member: each part spec 0012 reads, its plain fields, and the
-- getters that answer "has it" and "can it now"
local function partsOf(o)
    local out = { label = objectLabel(o), specs = {} }
    for k, v in pairs(o) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and type(v) == "table" then
            out.specs[#out.specs + 1] = k
        end
    end
    table.sort(out.specs)
    out.powered = twoOf(o, "getIsPowered")
    local joint = firstOf(o, "getActiveInputAttacherJoint") or firstOf(o, "getInputAttacherJoint")
    if type(joint) == "table" then
        out.inputJoint = { allowsLowering = joint.allowsLowering, canBeTurnedOn = joint.canBeTurnedOn,
            jointType = joint.jointType }
    end
    if type(o.spec_turnOnVehicle) == "table" then
        out.turnOn = { fields = flatten(o.spec_turnOnVehicle, "turnOn", 0, {}),
            canToggle = answerOf(o, "getCanToggleTurnedOn"), canBeTurnedOn = answerOf(o, "getCanBeTurnedOn"),
            isTurnedOn = answerOf(o, "getIsTurnedOn"), warning = firstOf(o, "getTurnedOnNotAllowedWarning") }
    end
    local fold = o.spec_foldable
    if type(fold) == "table" then
        out.fold = { parts = type(fold.foldingParts) == "table" and #fold.foldingParts or nil,
            fields = flatten(fold, "fold", 0, {}), unfolded = answerOf(o, "getIsUnfolded"),
            allowed = twoOf(o, "getIsFoldAllowed", firstOf(o, "getToggledFoldDirection") or 1, false) }
    end
    local fill = o.spec_fillUnit
    if type(fill) == "table" then
        out.fillUnit = { unloadingPlaces = type(fill.unloading) == "table" and #fill.unloading or nil,
            unloading = type(fill.unloading) == "table" and flatten(fill.unloading, "unloading", 1, {}) or nil,
            running = fill.unloadingFillUnitsRunning, unloadKey = fill.unloadActionEventId ~= nil,
            fills = fillsOf(o) }
    end
    local plow = o.spec_plow
    if type(plow) == "table" then
        out.plow = { fields = flatten(plow, "plow", 0, {}), forceLimitToField = answerOf(o, "getPlowForceLimitToField"),
            limitToField = answerOf(o, "getPlowLimitToField"),
            rotates = type(plow.rotationPart) == "table" and plow.rotationPart.turnAnimation ~= nil,
            rotationAllowed = answerOf(o, "getIsPlowRotationAllowed"),
            createFieldsPermission = answerOf(g_currentMission, "getHasPlayerPermission", "createFields",
                firstOf(o, "getOwnerConnection")) }
    end
    if type(o.spec_baler) == "table" then
        out.baler = { fields = flatten(o.spec_baler, "baler", 0, {}) }
    end
    if type(o.spec_baleCounter) == "table" then
        out.baleCounter = { fields = flatten(o.spec_baleCounter, "baleCounter", 0, {}) }
    end
    if type(o.spec_sprayer) == "table" then
        local sprayType = firstOf(o, "getActiveSprayType")
        out.sprayer = { fields = flatten(o.spec_sprayer, "sprayer", 0, {}),
            activeSprayType = type(sprayType) == "table" and flatten(sprayType, "sprayType", 0, {}) or nil }
    end
    if type(o.spec_variableWorkWidth) == "table" then
        out.width = { fields = flatten(o.spec_variableWorkWidth, "width", 0, {}) }
    end
    local pf = specsLike(o, "precisionFarming")
    if #pf > 0 then
        out.precisionFarming = {}
        for _, k in ipairs(pf) do
            out.precisionFarming[k] = flatten(o[k], k, k:find("Sprayer", 1, true) and 2 or 0, {})
        end
        out.rateMethods = rateMethods(o)
    end
    out.keys = actionEventsOf(o)
    local okSteer, steering = pcall(steeringOf, o)
    out.steering = okSteer and steering or (not okSteer and { error = tostring(steering) } or nil)
    return out
end

local function probeParts(v)
    local root = firstOf(v, "getRootVehicle") or v
    local out = { selected = objectLabel(firstOf(root, "getSelectedVehicle")),
        engineOn = answerOf(root, "getIsMotorStarted"), rig = {} }
    for i, m in ipairs(rigMembers(root)) do
        local ok, res = pcall(partsOf, m.o)
        res = ok and res or { error = tostring(res), label = objectLabel(m.o) }
        res.depth, res.parent = m.depth, m.parent
        out.rig[i] = res
    end
    return out
end

-- the sprayer csRate follows: the selected one with a Precision Farming
-- part, else the first rig member with one
local function rateTarget(v)
    local root = firstOf(v, "getRootVehicle") or v
    local selected = firstOf(root, "getSelectedVehicle")
    if type(selected) == "table" and #specsLike(selected, "extendedSprayer") > 0 then
        return selected
    end
    for _, m in ipairs(rigMembers(root)) do
        if #specsLike(m.o, "extendedSprayer") > 0 then
            return m.o
        end
    end
    return nil
end

-- what csRate follows: every Precision Farming part's fields two levels
-- down, the sprayer part's plain fields, the fills
local function rateState(o)
    local out = {}
    for _, k in ipairs(specsLike(o, "precisionFarming")) do
        flatten(o[k], k, 2, out)
    end
    if type(o.spec_sprayer) == "table" then
        flatten(o.spec_sprayer, "sprayer", 0, out)
    end
    for _, f in ipairs(fillsOf(o) or {}) do
        out["fill." .. f.unit .. ".level"] = round3(f.level)
    end
    return out
end

local function rateFrame(run)
    local now = rateState(run.o)
    for path, v in pairs(now) do
        if run.last[path] ~= v and #run.changes < RATE_MAX_CHANGES then
            run.changes[#run.changes + 1] = { ms = g_time - run.start, path = path, from = run.last[path], to = v }
        end
    end
    for path, v in pairs(run.last) do
        if now[path] == nil and #run.changes < RATE_MAX_CHANGES then
            run.changes[#run.changes + 1] = { ms = g_time - run.start, path = path, from = v }
        end
    end
    run.last = now
    return g_time - run.start >= RATE_MS
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
-- Contracts (0.0.10, spec 0019): accept, cancel and hand in through the
-- game's own MissionManager functions (dataS/scripts/missions in the SDK's
-- gameSource.zip). csMissions only reads. csAccept, csCancel and csHandIn
-- CHANGE THE SAVE (a hand-in books money): run them on a copy.
---------------------------------------------------------------------------

local MISSION_MS = 6000
local MISSION_COMMANDS = { "csMissions", "csAccept", "csCancel", "csHandIn", "csMaxCut" }
-- looked up by name: the manager's functions, and what the menu's buttons
-- may send (remembered from FS22, not in the SDK's zip)
local MISSION_MANAGER_FNS = { "getMissions", "getMissionByUniqueId", "startMission", "cancelMission", "dismissMission",
    "hasFarmReachedMissionLimit", "getIsMissionRunningOnFarmland" }
local MISSION_GLOBALS = { "MissionStartEvent", "MissionCancelEvent", "MissionDismissEvent", "MissionStartedEvent",
    "MissionFinishedEvent", "MissionDeleteEvent", "InGameMenuContractsFrame" }
local MISSION_ENUMS = { "MissionStartState", "MissionStatus", "MissionFinishState" }
-- 0.0.11 (spec 0018, NEXT.md): the mission classes' constants and
-- functions: what a baling contract counts and its factor, and whether
-- HarvestMission has getMaxCutLiters (listed, never called)
local MISSION_CLASSES = { "AbstractMission", "AbstractFieldMission", "HarvestMission", "BaleMission",
    "BaleWrapMission" }

-- a global by name. Never loadstring: the game refuses it for mods and
-- logs an Error (seen 2026-11-16); _G[name] reaches the game's globals
local function globalByName(name)
    return _G[name]
end

-- obj:name(...) under pcall: the first answer, or nil and why
local function callOn(obj, name, ...)
    if type(obj) ~= "table" or type(obj[name]) ~= "function" then
        return nil, "no " .. name
    end
    local r = pack(pcall(obj[name], obj, ...))
    if not r[1] then
        return nil, tostring(r[2])
    end
    return r[2]
end

local MISSION_ENUM_KEYS = {
    MissionStatus = { "CREATED", "PREPARING", "RUNNING", "FINISHED", "DISMISSED" },
    MissionFinishState = { "SUCCESS", "FAILED", "TIMED_OUT", "CANCELED" },
    MissionStartState = { "OK", "NO_ACCESS", "LIMIT_REACHED", "ALREADY_STARTED", "PENDING_MISSION",
        "NOT_AVAILABLE_ANYMORE", "CANNOT_BE_STARTED_NOW" },
}

-- enum[key] == value, by the key's name: mod/src/Api.lua's way (the game's
-- enums may not list their keys to pairs)
local function enumIs(enumName_, key, value)
    local enum = globalByName(enumName_)
    if type(enum) ~= "table" or value == nil then
        return false
    end
    local ok, v = pcall(function() return enum[key] end)
    return ok and v ~= nil and v == value
end

local function enumName(enumName_, value)
    for _, key in ipairs(MISSION_ENUM_KEYS[enumName_] or {}) do
        if enumIs(enumName_, key, value) then
            return key
        end
    end
    local enum = globalByName(enumName_)
    if type(enum) == "table" then
        for k, v in pairs(enum) do
            if v == value and type(k) == "string" then
                return k
            end
        end
    end
    return value ~= nil and tostring(value) or nil
end

local function functionNamesOf(t)
    local names = {}
    if type(t) == "table" then
        for k, v in pairs(t) do
            if type(k) == "string" and type(v) == "function" then
                names[#names + 1] = k
            end
        end
        table.sort(names)
    end
    return names
end

local function plainFieldsOf(t)
    local out = {}
    if type(t) == "table" then
        for k, v in pairs(t) do
            local tv = type(v)
            if type(k) == "string" and (tv == "number" or tv == "string" or tv == "boolean") then
                out[k] = v
            end
        end
    end
    return out
end

local function missionFarmId()
    local player = g_localPlayer
    if type(player) == "table" and type(player.farmId) == "number" then
        return player.farmId
    end
    return (callOn(g_currentMission, "getFarmId"))
end

local function farmMoney(farmId)
    local farm = callOn(g_farmManager, "getFarmById", farmId)
    if type(farm) ~= "table" then
        return nil
    end
    return type(farm.money) == "number" and farm.money or (callOn(farm, "getBalance"))
end

local function missionsNow()
    local list = callOn(g_missionManager, "getMissions")
    if type(list) ~= "table" and type(g_missionManager) == "table" then
        list = g_missionManager.missions
    end
    return type(list) == "table" and list or {}
end

local function missionId(m)
    return (callOn(m, "getUniqueId")) or (type(m) == "table" and m.uniqueId or nil)
end

local function countOf(t)
    return type(t) == "table" and #t or nil
end

-- whether a contract is finished: only then are its sums asked for.
-- 0.0.13: getTotalReward() and getReimbursement() on an offer work out
-- its completion, which on a harvest offer sets isFieldCompletionInitialized
-- with no completion modifier (then throws, hidden by callOn); once that
-- contract starts, the game's update fails every frame
-- (AbstractFieldMission.lua:493, ipairs on nil) and the game stops. Three
-- freezes on 2026-11-17, each after csMissions on offers.
local function isFinished(m)
    return enumIs("MissionStatus", "FINISHED", m.status)
end

-- what the game holds for one contract. Only reads: never getCompletion
-- (it drives the field's completion) nor isSpawnSpaceAvailable (it marks
-- shop places while it looks); the sums only on a finished one
local function missionFacts(m)
    if type(m) ~= "table" then
        return nil
    end
    -- before any call: what the game holds, untouched by this probe
    local fields = plainFieldsOf(m)
    local finished = isFinished(m)
    return {
        uniqueId = missionId(m),
        class = classNameOf(m),
        type = type(m.type) == "table" and m.type.name or nil,
        title = (callOn(m, "getTitle")),
        location = (callOn(m, "getLocation")),
        status = enumName("MissionStatus", m.status), statusRaw = m.status,
        finishState = enumName("MissionFinishState", m.finishState), finishStateRaw = m.finishState,
        farmId = m.farmId, activeMissionId = m.activeMissionId,
        reward = (callOn(m, "getReward")), vehicleCosts = (callOn(m, "getVehicleCosts")),
        totalReward = finished and (callOn(m, "getTotalReward")) or nil,
        reimbursement = finished and (callOn(m, "getReimbursement")) or nil,
        stealingCost = m.stealingCost,
        hasLeasableVehicles = (callOn(m, "hasLeasableVehicles")),
        vehiclesToLoad = countOf(m.vehiclesToLoad), vehicles = countOf(m.vehicles),
        spawnedVehicles = m.spawnedVehicles, failedToLoadVehicles = m.failedToLoadVehicles,
        completion = m.completion, minutesLeft = (callOn(m, "getMinutesLeft")),
        -- 0.0.11: every plain field it holds (litres, bales, fill type ...),
        -- read first. 0.0.12: never getMaxCutLiters nor getFieldCompletion
        fields = fields,
    }
end

-- whether the game shows a menu or a dialog now
local function guiFacts()
    local gui = g_gui
    if type(gui) ~= "table" then
        return { missing = true }
    end
    return {
        currentGuiName = type(gui.currentGuiName) == "string" and gui.currentGuiName or nil,
        guiVisible = (callOn(gui, "getIsGuiVisible")),
        dialogVisible = (callOn(gui, "getIsDialogVisible")),
        dialogs = countOf(gui.dialogs),
        paused = type(g_currentMission) == "table" and g_currentMission.paused or nil,
    }
end

-- the names spec 0019 leans on: there or not, and what they hold
local function missionGlobals()
    local farmId = missionFarmId()
    local out = {
        isServer = (callOn(g_currentMission, "getIsServer")), isClient = (callOn(g_currentMission, "getIsClient")),
        hasServer = g_server ~= nil, hasClient = g_client ~= nil,
        farmId = farmId, money = farmMoney(farmId),
        limit = type(MissionManager) == "table" and MissionManager.MAX_MISSIONS_PER_FARM or nil,
        limitReached = (callOn(g_missionManager, "hasFarmReachedMissionLimit", farmId)),
        manager = {}, enums = {}, named = {}, missionNames = {}, classes = {},
    }
    for _, name in ipairs(MISSION_CLASSES) do
        local cls = globalByName(name)
        out.classes[name] = type(cls) == "table"
            and { constants = plainFieldsOf(cls), functions = functionNamesOf(cls) } or type(cls)
    end
    for _, name in ipairs(MISSION_MANAGER_FNS) do
        out.manager[name] = type(g_missionManager) == "table" and type(g_missionManager[name]) or "no g_missionManager"
    end
    for _, name in ipairs(MISSION_ENUMS) do
        local enum = globalByName(name)
        if type(enum) == "table" then
            local fields = plainFieldsOf(enum)
            for _, key in ipairs(MISSION_ENUM_KEYS[name] or {}) do
                local ok, v = pcall(function() return enum[key] end)
                if ok and fields[key] == nil and (type(v) == "number" or type(v) == "string") then
                    fields[key] = v
                end
            end
            out.enums[name] = fields
        else
            out.enums[name] = type(enum)
        end
    end
    for _, name in ipairs(MISSION_GLOBALS) do
        local t = globalByName(name)
        out.named[name] = type(t) == "table" and functionNamesOf(t) or type(t)
    end
    -- every global the mod can list with Mission or Contract in its name
    for k, v in pairs(_G) do
        if type(k) == "string" and (k:find("Mission", 1, true) or k:find("Contract", 1, true)) then
            out.missionNames[#out.missionNames + 1] = k .. ":" .. type(v)
        end
    end
    table.sort(out.missionNames)
    return out
end

local function probeMissions()
    local out = { globals = missionGlobals(), gui = guiFacts(), missions = {} }
    for i, m in ipairs(missionsNow()) do
        local ok, facts = pcall(missionFacts, m)
        facts = ok and facts or { error = tostring(facts) }
        facts.index = i
        out.missions[i] = facts
    end
    return out
end

-- a contract by its place in csMissions' list, or by a piece of its id
local function pickMission(arg)
    local list = missionsNow()
    local n = tonumber(arg)
    if n ~= nil and n == math.floor(n) and list[n] ~= nil and #tostring(arg) <= 3 then
        return list[n]
    end
    local found, count = nil, 0
    arg = tostring(arg or "")
    if arg == "" then
        return nil, "give the contract's number from csMissions, or a piece of its id"
    end
    for _, m in ipairs(list) do
        local id = missionId(m)
        if type(id) == "string" and (id == arg or id:find(arg, 1, true) ~= nil) then
            found, count = m, count + 1
        end
    end
    if count == 1 then
        return found
    end
    return nil, count == 0 and ("no contract matches " .. arg) or (count .. " contracts match " .. arg)
end

-- one flat reading a frame: what a contract command may change
local function missionFrameState(run)
    local m = run.mission
    local inList = false
    for _, other in ipairs(missionsNow()) do
        if other == m or (run.id ~= nil and missionId(other) == run.id) then
            inList = true
        end
    end
    local gui = guiFacts()
    local s = {
        inList = inList,
        status = enumName("MissionStatus", m.status), finishState = enumName("MissionFinishState", m.finishState),
        farmId = m.farmId, activeMissionId = m.activeMissionId,
        spawnedVehicles = m.spawnedVehicles, vehicles = countOf(m.vehicles),
        failedToLoadVehicles = m.failedToLoadVehicles,
        totalReward = inList and isFinished(m) and (callOn(m, "getTotalReward")) or nil,
        reimbursement = inList and isFinished(m) and (callOn(m, "getReimbursement")) or nil,
        money = farmMoney(run.farmId),
        limitReached = (callOn(g_missionManager, "hasFarmReachedMissionLimit", run.farmId)),
        guiName = gui.currentGuiName, guiVisible = gui.guiVisible, dialogVisible = gui.dialogVisible,
        dialogs = gui.dialogs,
    }
    return s
end

local MISSION_FRAME_KEYS = { "inList", "status", "finishState", "farmId", "activeMissionId", "spawnedVehicles", "vehicles",
    "failedToLoadVehicles", "totalReward", "reimbursement", "money", "limitReached", "guiName", "guiVisible",
    "dialogVisible", "dialogs" }

-- the game's function, called as the mod will call it; its answers kept
local function missionAct(run)
    local mgr = g_missionManager
    local r
    if run.verb == "accept" then
        r = pack(pcall(mgr.startMission, mgr, run.mission, run.farmId, run.lease))
    elseif run.verb == "cancel" then
        r = pack(pcall(mgr.cancelMission, mgr, run.mission))
    else
        r = pack(pcall(mgr.dismissMission, mgr, run.mission))
    end
    local res = { ok = r[1], returned = r.n - 1 }
    if not r[1] then
        res.error = tostring(r[2])
    else
        local v = r[2]
        res.value = (type(v) == "table" or type(v) == "function") and type(v) or v
        if run.verb == "accept" then
            res.name = enumName("MissionStartState", v)
        end
    end
    return res
end

-- true when the recording is over
local function missionFrame(run)
    local now = missionFrameState(run)
    for _, k in ipairs(MISSION_FRAME_KEYS) do
        if now[k] ~= run.last[k] then
            run.changes[#run.changes + 1] = { ms = g_time - run.start, key = k, from = run.last[k], to = now[k] }
        end
    end
    run.last = now
    return g_time - run.start >= MISSION_MS
end

local function missionFile(run)
    local id = tostring(run.id or "unknown")
    local tail = id:sub(-6):gsub("[^%w]", "")
    return run.verb .. "-" .. tail .. (run.verb == "accept" and (run.lease and "-lease" or "-own") or "") .. ".json"
end

-- start a recording for one contract, or say why not
local function missionStart(verb, arg, lease)
    if ctx.missionRun ~= nil then
        return nil, "already recording"
    end
    if type(g_missionManager) ~= "table" then
        return nil, "no g_missionManager"
    end
    local fn = ({ accept = "startMission", cancel = "cancelMission", handin = "dismissMission" })[verb]
    if type(g_missionManager[fn]) ~= "function" then
        return nil, "the game has no MissionManager:" .. fn
    end
    if callOn(g_currentMission, "getIsServer") ~= true then
        return nil, "this game is not the server: host only"
    end
    local m, why = pickMission(arg)
    if m == nil then
        return nil, why
    end
    local farmId = missionFarmId()
    local run = { verb = verb, mission = m, id = missionId(m), farmId = farmId, lease = lease == true, changes = {} }
    local facts = missionFacts(m)
    local status = facts.status
    local finished = enumIs("MissionStatus", "FINISHED", m.status)
    if verb == "accept" then
        if m.farmId ~= nil or not enumIs("MissionStatus", "CREATED", m.status) then
            return nil, "that contract is already taken (" .. tostring(status) .. ")"
        end
        if run.lease then
            if callOn(m, "hasLeasableVehicles") ~= true then
                return nil, "that contract has no lease vehicles: csAccept N own"
            end
            -- the one call that marks shop places while it looks (and unmarks them)
            local space, err = callOn(m, "isSpawnSpaceAvailable")
            run.spawnSpace, run.spawnSpaceError = space, err
            if space == false then
                return nil, "no room at the shop for the leased machines: nothing started"
            end
        end
    elseif m.farmId ~= farmId then
        return nil, "that contract is not your farm's"
    elseif verb == "handin" and not finished then
        return nil, "that contract is not finished (" .. tostring(status) .. "): nothing handed in"
    elseif verb == "cancel" and finished then
        return nil, "that contract is already finished"
    end
    run.before = { facts = facts, gui = guiFacts(), money = farmMoney(farmId), globals = missionGlobals() }
    ctx.missionRun = run
    return run
end

local function missionFinish(run, err)
    local inList = nil
    if run.last ~= nil then
        inList = run.last.inList
    end
    local okF, facts
    if inList == false then
        okF, facts = true, plainFieldsOf(run.mission)
        facts.deleted = true
    else
        okF, facts = pcall(missionFacts, run.mission)
    end
    local out = { contract = {
        verb = run.verb, id = run.id, lease = run.verb == "accept" and run.lease or nil, farmId = run.farmId,
        spawnSpace = run.spawnSpace, spawnSpaceError = run.spawnSpaceError,
        before = run.before, result = run.result, changes = run.changes,
        after = { facts = okF and facts or { error = tostring(facts) }, gui = guiFacts(), money = farmMoney(run.farmId),
            inList = inList },
        moneyChange = (run.before.money ~= nil and farmMoney(run.farmId) ~= nil)
            and (farmMoney(run.farmId) - run.before.money) or nil,
        error = err,
    } }
    local file = missionFile(run)
    ctx.status = writeJson(file, out) and (run.verb .. " written to " .. file) or (run.verb .. ": write FAILED")
    log("contract %s %s: %s, %d change(s)", run.verb, tostring(run.id),
        run.result ~= nil and (run.result.ok and ("returned " .. tostring(run.result.name or run.result.value))
            or ("ERROR " .. tostring(run.result.error))) or "not called", #run.changes)
end

-- one frame of a contract recording: the call on the first, then readings
local function missionUpdate()
    local run = ctx.missionRun
    if run == nil then
        return
    end
    local ok, done = pcall(function()
        if run.start == nil then
            run.start = g_time
            run.last = missionFrameState(run)
            run.before.frame = run.last
            run.result = missionAct(run)
        end
        return missionFrame(run)
    end)
    if not ok or done then
        ctx.missionRun = nil
        missionFinish(run, not ok and tostring(done) or nil)
    end
end

function CompanionSpike:consoleMissions(name)
    local ok, res = pcall(probeMissions)
    if not ok then
        log("missions probe failed: %s", tostring(res))
        return "missions probe failed, see log"
    end
    local offers, mine = 0, 0
    for _, f in ipairs(res.missions) do
        if f.farmId == res.globals.farmId and f.farmId ~= nil then
            mine = mine + 1
        elseif f.farmId == nil then
            offers = offers + 1
        end
        print(string.format("[CompanionSpike] %2d  %-9s %-22s %-14s %-9s %s%s", f.index, tostring(f.status),
            tostring(f.type), tostring(f.location), f.hasLeasableVehicles == true and "lease" or "no lease",
            tostring(f.uniqueId),
            f.farmId ~= nil and ("  farm " .. tostring(f.farmId)) or ""))
    end
    local file = name ~= nil and name ~= "" and ("missions-" .. tostring(name):gsub("[^%w_-]", "") .. ".json")
        or "missions.json"
    local written = writeJson(file, { contracts = res })
    ctx.status = written and ("missions written to " .. file) or "missions: write FAILED"
    return string.format("%s: %d contract(s), %d on offer, %d yours; server %s; startMission %s", ctx.status,
        #res.missions, offers, mine, tostring(res.globals.isServer), tostring(res.globals.manager.startMission))
end

function CompanionSpike:consoleAccept(arg, how)
    how = tostring(how or ""):lower()
    if how ~= "lease" and how ~= "own" then
        return "csAccept N lease, or csAccept N own (N from csMissions). It changes the save."
    end
    local run, why = missionStart("accept", arg, how == "lease")
    if run == nil then
        return "csAccept: " .. tostring(why)
    end
    ctx.status = "accepting " .. tostring(run.id)
    return string.format("accepting %s (%s) next frame, recording %d s", tostring(run.id), how, MISSION_MS / 1000)
end

function CompanionSpike:consoleCancel(arg)
    local run, why = missionStart("cancel", arg)
    if run == nil then
        return "csCancel: " .. tostring(why)
    end
    ctx.status = "cancelling " .. tostring(run.id)
    return string.format("cancelling %s next frame, recording %d s", tostring(run.id), MISSION_MS / 1000)
end

function CompanionSpike:consoleHandIn(arg)
    local run, why = missionStart("handin", arg)
    if run == nil then
        return "csHandIn: " .. tostring(why)
    end
    ctx.status = "handing in " .. tostring(run.id)
    return string.format("handing in %s next frame (the game says %s), recording %d s", tostring(run.id),
        tostring(run.before.facts.totalReward), MISSION_MS / 1000)
end

-- 0.0.14 (spec 0018): does getMaxCutLiters() start a harvest offer's
-- field completion (the state that froze the game once the contract
-- started, 2026-11-17)? One call on one offer, its completion state read
-- before and after. Changed: don't take that contract; quit without saving.
local COMPLETION_KEYS = { "isFieldCompletionInitialized", "currentPartitionCompletionIndex", "completionPartitions",
    "completionModifier", "fieldPercentageDone", "expectedLiters" }

local function completionState(m)
    local out = {}
    for _, key in ipairs(COMPLETION_KEYS) do
        local v = m[key]
        if key == "completionPartitions" or key == "completionModifier" then
            out[key] = type(v)
        else
            out[key] = v
        end
    end
    return out
end

function CompanionSpike:consoleMaxCut(arg)
    local m, why = pickMission(arg)
    if m == nil then
        return "csMaxCut: " .. tostring(why)
    end
    if not enumIs("MissionStatus", "CREATED", m.status) then
        return "csMaxCut: only an offer (this one isn't): nothing called"
    end
    if type(m.getMaxCutLiters) ~= "function" then
        return "csMaxCut: not a harvest contract (no getMaxCutLiters): nothing called"
    end
    if m.isFieldCompletionInitialized == true then
        return "csMaxCut: its completion already started (something else called it): nothing called, "
            .. "try another offer after loading the save again"
    end
    local id = missionId(m)
    local before = completionState(m)
    local ok, value = pcall(m.getMaxCutLiters, m)
    local after = completionState(m)
    local changed = false
    for _, key in ipairs(COMPLETION_KEYS) do
        if before[key] ~= after[key] then
            changed = true
        end
    end
    local out = {
        uniqueId = id, type = type(m.type) == "table" and m.type.name or nil,
        location = (callOn(m, "getLocation")),
        ok = ok, value = ok and value or nil, error = not ok and tostring(value) or nil,
        before = before, after = after, changed = changed,
    }
    local file = "maxcut-" .. tostring(id):gsub("[^%w_-]", "") .. ".json"
    local written = writeJson(file, { maxCut = out })
    ctx.status = string.format("csMaxCut %s: %s", tostring(id), changed and "CHANGED" or "unchanged")
    log("csMaxCut %s: ok %s, value %s, changed %s", tostring(id), tostring(ok), tostring(value), tostring(changed))
    return string.format("csMaxCut %s: %s litres (%s); completion state %s; %s", tostring(id),
        ok and tostring(value) or "no answer", ok and "ok" or tostring(value),
        changed and "CHANGED: don't take this contract, quit without saving" or "unchanged",
        written and ("written to " .. file) or "write FAILED")
end

---------------------------------------------------------------------------
-- The Steering Assist course (spike 0.0.16, spec 0021)
---------------------------------------------------------------------------

-- csCourse NAME writes course-NAME.json. SteeringFieldCourse is not in the
-- SDK's archive, and the save keeps only the field's boundary, the course
-- settings and workedLines (AIAutomaticSteering.lua:64-65, Vincent's Solek
-- save), so the lanes are found by shape: every key with its type and
-- class, and every list of tables with each item's plain fields. Raw reads
-- only (pairs, rawget): no method is called and no __index runs (getters
-- are not reads: spike 0.0.10's freeze).
local COURSE_LIMITS = {
    shapeDepth = 4,     -- levels the shape walks
    shapeKeys = 80,     -- keys shown per table in the shape
    shapeNodes = 3000,  -- tables the shape describes in all
    sample = 2000,      -- values shown of a list of plain values (segmentStates: all of them)
    listDepth = 3,      -- levels searched for lists of tables
    items = 3000,       -- items dumped per list
    plainDepth = 3,     -- levels dumped inside each item
    nodes = 400000,     -- values dumped in all, then truncated
}

-- the array part 1..n, read raw (a hole never reaches __index)
local function rawLen(t)
    local n = 0
    while rawget(t, n + 1) ~= nil do
        n = n + 1
    end
    return n
end

local function looksLikeVehicle(t)
    if rawget(t, "rootNode") ~= nil and rawget(t, "typeName") ~= nil then
        return true
    end
    for k in pairs(t) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" then
            return true
        end
    end
    return false
end

local function scalarOf(v)
    local tv = type(v)
    if tv == "number" or tv == "boolean" then
        return v
    elseif tv == "string" then
        return #v > LIMITS.str and (v:sub(1, LIMITS.str) .. "...") or v
    end
    return nil
end

local function clockSec()
    return nowSec() or (os ~= nil and os.clock ~= nil and os.clock()) or nil
end

local function childPath(path, k)
    if type(k) == "number" then
        return path .. "[" .. tostring(k) .. "]"
    end
    return path == "" and tostring(k) or (path .. "." .. tostring(k))
end

-- every key, its type and class, down to shapeDepth; a table seen before
-- is a ref to where it was first seen
local function shapeOf(t, depth, seen, path, budget)
    budget.n = budget.n + 1
    seen[t] = seen[t] or path
    local out = { class = classNameOf(t), n = rawLen(t), keys = 0 }
    if looksLikeVehicle(t) then
        out.vehicle, out.id = true, scalarOf(rawget(t, "id"))
        return out
    end
    if out.class ~= nil then
        out.methods = methodsOf(t)
    end
    local keys = {}
    for k in pairs(t) do
        out.keys = out.keys + 1
        if type(k) ~= "number" or k > out.n then
            keys[#keys + 1] = k
        end
    end
    table.sort(keys, keyLess)
    out.fields = {}
    for i, k in ipairs(keys) do
        if i > COURSE_LIMITS.shapeKeys then
            out.moreKeys = #keys - COURSE_LIMITS.shapeKeys
            break
        end
        local v, name = rawget(t, k), tostring(k)
        local tv = type(v)
        if tv == "table" then
            if seen[v] ~= nil then
                out.fields[name] = { ref = seen[v] }
            elseif depth <= 0 or budget.n >= COURSE_LIMITS.shapeNodes then
                out.fields[name] = { class = classNameOf(v), n = rawLen(v), keys = countKeys(v) }
            else
                out.fields[name] = shapeOf(v, depth - 1, seen, childPath(path, k), budget)
            end
        elseif tv == "function" then
            out.fields[name] = "<function>"
        else
            local s = scalarOf(v)
            if s == nil then
                out.fields[name] = "<" .. tv .. ">"
            else
                out.fields[name] = s
            end
        end
    end
    if out.n > 0 then
        local first = rawget(t, 1)
        out.itemType = type(first)
        if type(first) == "table" then
            out.itemClass = classNameOf(first)
            if seen[first] == nil and depth > 0 and budget.n < COURSE_LIMITS.shapeNodes then
                out.first = shapeOf(first, depth - 1, seen, path .. "[1]", budget)
            end
        else
            out.sample = {}
            for i = 1, math.min(out.n, COURSE_LIMITS.sample) do
                out.sample[i] = scalarOf(rawget(t, i))
            end
        end
    end
    return out
end

-- every table holding a list of tables (the segments, whatever they're
-- called), down to listDepth; a list's items aren't searched further
local function findLists(t, depth, path, seen, found)
    seen[t] = true
    for k, v in pairs(t) do
        if type(v) == "table" and not seen[v] and not looksLikeVehicle(v) then
            local p = childPath(path, k)
            local n = rawLen(v)
            if n > 0 and type(rawget(v, 1)) == "table" then
                seen[v] = true
                found[#found + 1] = { path = p, t = v, n = n }
            elseif depth > 0 then
                findLists(v, depth - 1, p, seen, found)
            end
        end
    end
    return found
end

local plainOf

-- a table's fields: plain values as they are, tables down to `depth`,
-- tables already placed as refs, vehicles by id, functions left out
local function plainBody(t, depth, refs, budget, path)
    local out = {}
    for k, v in pairs(t) do
        if type(v) ~= "function" then
            if budget.n >= COURSE_LIMITS.nodes then
                budget.truncated = true
                break
            end
            budget.n = budget.n + 1
            out[type(k) == "number" and k or tostring(k)] = plainOf(v, depth - 1, refs, budget, childPath(path, k))
        end
    end
    return out
end

plainOf = function(v, depth, refs, budget, path)
    local tv = type(v)
    if tv ~= "table" then
        local s = scalarOf(v)
        if s == nil then
            return "<" .. tv .. ">"
        end
        return s
    end
    if refs[v] ~= nil then
        return "<ref " .. refs[v] .. ">"
    end
    if looksLikeVehicle(v) then
        return "<vehicle " .. tostring(rawget(v, "id")) .. ">"
    end
    if depth < 0 then
        return "<table " .. tostring(classNameOf(v) or countKeys(v)) .. ">"
    end
    refs[v] = path
    return plainBody(v, depth, refs, budget, path)
end

local function courseDump(c)
    local out = { class = classNameOf(c), methods = methodsOf(c), plain = {}, lists = {} }
    for k, v in pairs(c) do
        local s = scalarOf(v)
        if s ~= nil and type(k) == "string" then
            out.plain[k] = s
        end
    end
    out.shape = shapeOf(c, COURSE_LIMITS.shapeDepth, {}, "course", { n = 0 })
    local found = findLists(c, COURSE_LIMITS.listDepth, "", { [c] = true }, {})
    table.sort(found, function(a, b) return a.path < b.path end)
    -- every list and item gets its place first, so links between items are refs
    local refs = { [c] = "course" }
    for _, l in ipairs(found) do
        refs[l.t] = l.path
        for i = 1, l.n do
            local item = rawget(l.t, i)
            if type(item) == "table" and refs[item] == nil then
                refs[item] = l.path .. "[" .. i .. "]"
            end
        end
    end
    local budget = { n = 0 }
    for _, l in ipairs(found) do
        local first = rawget(l.t, 1)
        local list = { n = l.n, class = classNameOf(first), methods = methodsOf(first), items = {} }
        for i = 1, math.min(l.n, COURSE_LIMITS.items) do
            local item = rawget(l.t, i)
            if type(item) == "table" then
                list.items[i] = plainBody(item, COURSE_LIMITS.plainDepth, refs, budget, l.path .. "[" .. i .. "]")
            else
                list.items[i] = plainOf(item, 0, refs, budget, "")
            end
        end
        list.moreItems = l.n > COURSE_LIMITS.items and (l.n - COURSE_LIMITS.items) or nil
        out.lists[l.path] = list
    end
    out.truncated = budget.truncated
    out.values = budget.n
    -- what the lists weigh as JSON, and how long encoding them takes here
    local t0 = clockSec()
    local ok, text = pcall(Json.encode, out.lists)
    local t1 = clockSec()
    out.encode = { bytes = ok and #text or nil, seconds = (t0 ~= nil and t1 ~= nil) and (t1 - t0) or nil,
        clock = getTimeSec ~= nil and "getTimeSec" or "os.clock", error = not ok and tostring(text) or nil }
    return out
end

local function probeCourse(v)
    local root = firstOf(v, "getRootVehicle") or v
    local holder = nil
    for _, m in ipairs(rigMembers(root)) do
        if type(rawget(m.o, "spec_aiAutomaticSteering")) == "table" then
            holder = m.o
            break
        end
    end
    if holder == nil then
        return { found = false, vehicle = objectLabel(root) }
    end
    local spec = rawget(holder, "spec_aiAutomaticSteering")
    local out = { found = true, vehicle = objectLabel(holder), courses = {},
        vehiclePosition = nodePosition(rawget(holder, "rootNode")),
        steering = {
            steeringEnabled = rawget(spec, "steeringEnabled"),
            lastIsOnField = rawget(spec, "lastIsOnField"),
            fieldCourseDetectionInProgress = rawget(spec, "fieldCourseDetectionInProgress"),
            steeringLockedMovingDirection = rawget(spec, "steeringLockedMovingDirection"),
        } }
    local sel = rawget(holder, "spec_aiModeSelection")
    out.steering.currentMode = type(sel) == "table" and scalarOf(rawget(sel, "currentMode")) or nil
    local cur, last = rawget(spec, "steeringFieldCourse"), rawget(spec, "lastActiveSteeringFieldCourse")
    if cur ~= nil or last ~= nil then
        out.sameAsLastActive = cur == last
    end
    if type(cur) == "table" then
        out.courses.steeringFieldCourse = courseDump(cur)
    end
    if type(last) == "table" and last ~= cur then
        out.courses.lastActiveSteeringFieldCourse = courseDump(last)
    end
    return out
end

function CompanionSpike:consoleCourse(name)
    local v = getControlledVehicle()
    if v == nil then
        return "get in a vehicle first"
    end
    local ok, res = pcall(probeCourse, v)
    if not ok then
        return "course probe failed: " .. tostring(res)
    end
    local file = name ~= nil and name ~= "" and ("course-" .. tostring(name):gsub("[^%w_-]", "") .. ".json")
        or "course.json"
    local written = CS._writeJson(file, { course = res })
    ctx.status = written and ("course written to " .. file) or "course: write FAILED"
    if not res.found then
        return ctx.status .. ": no Steering Assist part in this rig"
    end
    local c = res.courses.steeringFieldCourse
    if c == nil then
        return ctx.status .. ": no course now" .. (res.courses.lastActiveSteeringFieldCourse ~= nil and " (a last active one)" or "")
    end
    local biggest = nil
    for path, l in pairs(c.lists) do
        if biggest == nil or l.n > biggest.n then
            biggest = { path = path, n = l.n }
        end
    end
    return string.format("%s: %s segment(s) in %s; on %s (%s); %s bytes in %s s%s", ctx.status,
        biggest and tostring(biggest.n) or "0", biggest and biggest.path or "-", tostring(c.plain.currentSegmentIndex),
        c.plain.currentSegmentIsLeft and "left" or "right", tostring(c.encode.bytes), tostring(c.encode.seconds),
        c.truncated and ", TRUNCATED" or "")
end

---------------------------------------------------------------------------
-- csPreview and csSettings (spike 0.0.18, spec 0022)
---------------------------------------------------------------------------
-- csPreview NAME [DEG|auto] [two] [wait] [steering] asks the game's course
-- builder, g_fieldCourseManager:generateFieldCourseAtWorldPos, for a course
-- built with a clone of the vehicle's course settings, and never gives it
-- to the vehicle (AIAutomaticSteering.lua:738-776 builds the same way, then
-- sets it with SteeringFieldCourse.new, which the spike never calls). The
-- builder is the one new call. Two more are the game's own, made where it
-- makes them: fieldCourseSettings:clone() (every time H opens the dialog,
-- AIModeSelection.lua:247) and roundToTerrainDetailPixel (every frame in
-- Steering Assist mode, AIAutomaticSteering.lua:443). The call is made from
-- update, a frame after the console; the callback only stores what it got;
-- everything is read and written on later frames. The game's own flags
-- (fieldCourseDetectionInProgress, forceFieldCourseUpdate) are never written.
--
--   DEG       the clone's workDirection in degrees (auto: -1, the game's
--             Auto); none: the clone unchanged, the control run
--   two       a second build in the same frame at DEG + 30
--   wait      armed: fires on the frame the game starts its own build
--             (fieldCourseDetectionInProgress), e.g. after OK in the dialog
--   steering  allowed while steering (refused otherwise)
local PREVIEW = {
    settleMs = 3000,    -- read again this long after the last answer
    timeoutMs = 30000,  -- write anyway if a build never answers
    armMs = 120000,     -- wait: give up if the game never builds
    secondDeg = 30,     -- two: the second build's direction, DEG + this
}

local function steeringHolder(v)
    local root = firstOf(v, "getRootVehicle") or v
    for _, m in ipairs(rigMembers(root)) do
        if type(rawget(m.o, "spec_aiAutomaticSteering")) == "table" then
            return m.o
        end
    end
    return nil
end

-- a table's top level: plain values as they are, tables by class and size
local function shallowOf(t)
    if type(t) ~= "table" then
        return nil
    end
    local out = {}
    for k, v in pairs(t) do
        local tv = type(v)
        if tv == "table" then
            out[tostring(k)] = { class = classNameOf(v), n = rawLen(v), keys = countKeys(v) }
        elseif tv ~= "function" then
            out[tostring(k)] = scalarOf(v) or ("<" .. tv .. ">")
        end
    end
    return out
end

local function valuesOf(t)
    if type(t) ~= "table" then
        return nil
    end
    local out = {}
    for i = 1, rawLen(t) do
        out[i] = scalarOf(rawget(t, i))
    end
    return out
end

-- the keys of t's table fields whose table isn't the one first read (or
-- that came or went); plain values show in shallowOf
local function tablesChanged(t, first)
    if type(t) ~= "table" or type(first) ~= "table" then
        return nil
    end
    local out = {}
    for k, v in pairs(t) do
        if type(v) == "table" and not rawequal(v, first[k]) then
            out[#out + 1] = tostring(k)
        end
    end
    for k in pairs(first) do
        if type(rawget(t, k)) ~= "table" then
            out[#out + 1] = tostring(k)
        end
    end
    table.sort(out)
    return out
end

local function tableFields(t)
    local out = {}
    if type(t) == "table" then
        for k, v in pairs(t) do
            if type(v) == "table" then
                out[k] = v
            end
        end
    end
    return out
end

-- where a table sits among t's fields, and one level into them
local function placesOf(target, t, label)
    local out = {}
    if type(t) ~= "table" then
        return out
    end
    for k, v in pairs(t) do
        if rawequal(v, target) then
            out[#out + 1] = label .. "." .. tostring(k)
        elseif type(v) == "table" then
            for k2, v2 in pairs(v) do
                if rawequal(v2, target) then
                    out[#out + 1] = label .. "." .. tostring(k) .. "." .. tostring(k2)
                end
            end
        end
    end
    return out
end

local function steeringModeValue()
    local modes = type(AIModeSelection) == "table" and rawget(AIModeSelection, "MODE") or nil
    return type(modes) == "table" and rawget(modes, "STEERING_ASSIST") or nil
end

-- the game's own course, its flags, its settings and the manager, read raw;
-- the course and settings tables compared by identity with the first read
local function previewSnapshot(run)
    local aut, sel = run.aut, run.sel
    local course = rawget(aut, "steeringFieldCourse")
    local last = rawget(aut, "lastActiveSteeringFieldCourse")
    local settings = rawget(sel, "fieldCourseSettings")
    local s = {
        at = g_time,
        flags = {
            steeringEnabled = rawget(aut, "steeringEnabled"),
            lastIsOnField = rawget(aut, "lastIsOnField"),
            fieldCourseDetectionInProgress = rawget(aut, "fieldCourseDetectionInProgress"),
            pendingData = rawget(aut, "fieldCourseDetectionPendingData") ~= nil,
            forceFieldCourseUpdate = rawget(aut, "forceFieldCourseUpdate"),
            resetCourseTimer = scalarOf(rawget(aut, "resetCourseTimer")),
        },
        currentMode = scalarOf(rawget(sel, "currentMode")),
        course = {
            present = course ~= nil,
            same = rawequal(course, run.course0),
            lastPresent = last ~= nil,
            lastSame = rawequal(last, run.last0),
        },
        settings = plainFieldsOf(settings),
        sameSettings = rawequal(settings, run.settings0),
        manager = shallowOf(g_fieldCourseManager),
        managerTablesChanged = tablesChanged(g_fieldCourseManager, run.mgr0),
        steeringTablesChanged = tablesChanged(aut, run.aut0),
    }
    if type(course) == "table" then
        s.course.currentSegmentIndex = scalarOf(rawget(course, "currentSegmentIndex"))
        s.course.segmentStates = valuesOf(rawget(course, "segmentStates"))
    end
    return s
end

-- the segments list of a raw course or of a SteeringFieldCourse around one
local function segmentsOf(c)
    if type(c) ~= "table" then
        return nil
    end
    local inner = rawget(c, "fieldCourse")
    local segs = type(inner) == "table" and rawget(inner, "segments") or rawget(c, "segments")
    return type(segs) == "table" and segs or nil
end

-- segment by segment, how far apart two courses' points are
local function compareCourses(a, b)
    local sa, sb = segmentsOf(a), segmentsOf(b)
    local out = { segments = sa and rawLen(sa) or nil, ownSegments = sb and rawLen(sb) or nil }
    if sa == nil or sb == nil then
        return out
    end
    out.samePoints, out.maxApart = 0, 0
    for i = 1, math.min(rawLen(sa), rawLen(sb)) do
        local pa, pb = rawget(rawget(sa, i), "positions"), rawget(rawget(sb, i), "positions")
        if type(pa) == "table" and type(pb) == "table" and rawLen(pa) == rawLen(pb) then
            local apart = 0
            for j = 1, rawLen(pa) do
                local p, q = rawget(pa, j), rawget(pb, j)
                if type(p) == "table" and type(q) == "table" and type(rawget(p, 1)) == "number"
                    and type(rawget(q, 1)) == "number" then
                    apart = math.max(apart, math.abs(rawget(p, 1) - rawget(q, 1)), math.abs(rawget(p, 2) - rawget(q, 2)))
                end
            end
            if apart < 0.01 then
                out.samePoints = out.samePoints + 1
            end
            out.maxApart = math.max(out.maxApart, apart)
        end
    end
    return out
end

-- where the game asks for its course: the vehicle's front, else its back
-- plus a metre, on a terrain detail pixel (AIAutomaticSteering.lua:442-450)
local function previewPosition(holder, mgr)
    local node, size = rawget(holder, "rootNode"), rawget(holder, "size")
    local len = type(size) == "table" and rawget(size, "length") or 0
    local off = type(size) == "table" and rawget(size, "lengthOffset") or 0
    local x, _, z = localToWorld(node, 0, 0, len * 0.5 + off)
    x, z = mgr:roundToTerrainDetailPixel(x, z)
    local mission = g_currentMission
    local detail = type(mission) == "table" and rawget(mission, "terrainDetailId") or nil
    local where = "front"
    if detail ~= nil and getDensityAtWorldPos ~= nil and getDensityAtWorldPos(detail, x, 0, z) == 0 then
        x, _, z = localToWorld(node, 0, 0, -len * 0.5 + off + 1)
        x, z = mgr:roundToTerrainDetailPixel(x, z)
        where = "back"
    end
    return x, z, where, len, off
end

local function parsePreviewArgs(...)
    local args = { flags = {} }
    for i = 1, select("#", ...) do
        local s = tostring(select(i, ...) or ""):lower()
        if s == "two" or s == "wait" or s == "steering" then
            args.flags[s] = true
        elseif s == "auto" then
            args.auto = true
        elseif tonumber(s) ~= nil then
            args.deg = tonumber(s)
        end
    end
    return args
end

-- refused before anything is called: nil and why
local function previewStart(v, name, a, b, c, d)
    if ctx.preview ~= nil then
        return nil, "a preview is still running"
    end
    local args = parsePreviewArgs(a, b, c, d)
    if args.flags.two and args.deg == nil then
        return nil, "two needs a direction: csPreview NAME DEG two"
    end
    local mgr = g_fieldCourseManager
    if type(mgr) ~= "table" or type(mgr.generateFieldCourseAtWorldPos) ~= "function"
        or type(mgr.roundToTerrainDetailPixel) ~= "function" then
        return nil, "the game has no g_fieldCourseManager:generateFieldCourseAtWorldPos"
    end
    if g_server == nil then
        return nil, "not the server: host only"
    end
    local holder = steeringHolder(v)
    if holder == nil then
        return nil, "no Steering Assist part in this rig"
    end
    local aut, sel = rawget(holder, "spec_aiAutomaticSteering"), rawget(holder, "spec_aiModeSelection")
    if type(sel) ~= "table" then
        return nil, "no AI mode part on " .. tostring(objectLabel(holder))
    end
    local mode = steeringModeValue()
    if mode == nil or rawget(sel, "currentMode") ~= mode then
        return nil, "not in Steering Assist mode"
    end
    if rawget(aut, "lastIsOnField") ~= true then
        return nil, "not on a field you may work"
    end
    if not args.flags.wait and (rawget(aut, "fieldCourseDetectionInProgress") == true
        or rawget(aut, "fieldCourseDetectionPendingData") ~= nil) then
        return nil, "the game is building its own course: wait for it"
    end
    local steering = rawget(aut, "steeringEnabled") == true
    if steering and not args.flags.steering then
        return nil, "steering is on (csPreview NAME DEG steering for that run)"
    end
    if args.flags.steering and not steering then
        return nil, "steering is off: turn it on for the steering run"
    end
    local settings = rawget(sel, "fieldCourseSettings")
    if type(settings) ~= "table" or type(settings.clone) ~= "function" then
        return nil, "no course settings yet: hold H once"
    end
    if (args.deg ~= nil or args.auto) and type(rawget(settings, "workDirection")) ~= "number" then
        return nil, "the settings have no workDirection"
    end
    local run = {
        name = name, args = args, holder = holder, aut = aut, sel = sel, mgr = mgr,
        course0 = rawget(aut, "steeringFieldCourse"), last0 = rawget(aut, "lastActiveSteeringFieldCourse"),
        settings0 = settings, armedAt = g_time, frames = 0, builds = {}, answers = {}, snapshots = {},
        mgr0 = tableFields(mgr), aut0 = tableFields(aut),
    }
    run.snapshots.armed = previewSnapshot(run)
    ctx.preview = run
    return run
end

local function previewFire(run)
    run.firedAt, run.firedFrame = g_time, run.frames
    run.snapshots.before = previewSnapshot(run)
    local x, z, where, len, off = previewPosition(run.holder, run.mgr)
    run.position = { x = x, z = z, where = where, length = len, lengthOffset = off }
    local count = run.args.flags.two and 2 or 1
    for i = 1, count do
        local clone = run.settings0:clone()
        local b = { build = i, clone = clone, sameAsGame = rawequal(clone, run.settings0) }
        if run.args.auto then
            b.workDirection = -1
        elseif run.args.deg ~= nil then
            b.deg = run.args.deg + (i - 1) * PREVIEW.secondDeg
            b.workDirection = math.rad(b.deg)
        end
        if b.workDirection ~= nil then
            clone.workDirection = b.workDirection
        end
        b.cloneBefore = plainFieldsOf(clone)
        run.builds[i] = b
        local callback = function(_, course)
            run.answers[#run.answers + 1] = { build = i, course = course, at = g_time, frame = run.frames,
                sync = run.calling == i, isNil = course == nil }
        end
        run.calling = i
        local t0 = clockSec()
        local ok, err = pcall(run.mgr.generateFieldCourseAtWorldPos, run.mgr, x, z, clone, callback)
        local t1 = clockSec()
        run.calling = nil
        b.callSeconds = (t0 ~= nil and t1 ~= nil) and (t1 - t0) or nil
        b.error = not ok and tostring(err) or nil
    end
end

-- per build: when it answered, how often, and what came back
local function previewResult(run, why)
    local out = {
        name = run.name, why = why, args = { deg = run.args.deg, auto = run.args.auto, flags = run.args.flags },
        vehicle = objectLabel(run.holder), position = run.position, armedAt = run.armedAt, firedAt = run.firedAt,
        frames = run.frames, snapshots = run.snapshots, builds = {}, answers = {}, gameBuilding = run.gameBuilding,
    }
    for i, b in ipairs(run.builds) do
        out.builds[i] = { build = b.build, deg = b.deg, workDirection = b.workDirection, sameAsGame = b.sameAsGame,
            cloneBefore = b.cloneBefore, cloneAfter = plainFieldsOf(b.clone), callSeconds = b.callSeconds,
            error = b.error, answers = 0 }
    end
    local own = rawget(run.aut, "steeringFieldCourse")
    for i, a in ipairs(run.answers) do
        local b = out.builds[a.build]
        if b ~= nil then
            b.answers = b.answers + 1
        end
        local ans = { build = a.build, at = a.at, frame = a.frame, sync = a.sync, isNil = a.isNil,
            ms = run.firedAt ~= nil and (a.at - run.firedAt) or nil }
        if type(a.course) == "table" then
            ans.sameAsOwn = rawequal(a.course, own)
            ans.sameAsOwnInner = type(own) == "table" and rawequal(a.course, rawget(own, "fieldCourse")) or false
            ans.compare = compareCourses(a.course, own)
            -- kept anywhere it shouldn't be: the builder, the steering parts
            ans.heldBy = placesOf(a.course, run.mgr, "manager")
            for _, p in ipairs(placesOf(a.course, run.aut, "automaticSteering")) do
                ans.heldBy[#ans.heldBy + 1] = p
            end
            for _, p in ipairs(placesOf(a.course, run.sel, "modeSelection")) do
                ans.heldBy[#ans.heldBy + 1] = p
            end
            local ok, dump = pcall(courseDump, a.course)
            ans.course = ok and dump or { error = tostring(dump) }
        elseif a.course ~= nil then
            ans.courseType = type(a.course)
        end
        out.answers[i] = ans
    end
    return out
end

local function previewFinish(run, why, err)
    ctx.preview = nil
    local ok, out = pcall(previewResult, run, why)
    if not ok then
        out = { name = run.name, why = why, error = "result failed: " .. tostring(out) }
    end
    out.error = out.error or err
    local file = "preview-" .. (tostring(run.name or ""):gsub("[^%w_-]", "")) .. ".json"
    if file == "preview-.json" then
        file = "preview.json"
    end
    local written = CS._writeJson(file, { preview = out })
    local answered = 0
    for _, b in ipairs(out.builds or {}) do
        if b.answers > 0 then
            answered = answered + 1
        end
    end
    ctx.status = string.format("preview %s: %s, %d of %d build(s) answered%s", written and ("written to " .. file)
        or "write FAILED", tostring(why), answered, #(out.builds or {}), err and (", ERROR " .. tostring(err)) or "")
    log("csPreview: %s", ctx.status)
end

local function previewFrame(run)
    run.frames = run.frames + 1
    if run.firedAt == nil then
        if run.args.flags.wait then
            -- after OK the game drops its course (onAIModeSettingsChanged), then
            -- builds a new one on a later frame
            local aut = run.aut
            local course = rawget(aut, "steeringFieldCourse")
            if rawget(aut, "fieldCourseDetectionInProgress") == true then
                run.gameBuilding = true
                previewFire(run)
            elseif course == nil and run.snapshots.dropped == nil then
                run.snapshots.dropped = previewSnapshot(run)
            elseif course ~= nil and not rawequal(course, run.course0) then
                -- the game built its course without a frame in between
                run.snapshots.gameBuiltFirst = previewSnapshot(run)
                run.gameBuilding = false
                previewFire(run)
            elseif g_time - run.armedAt > PREVIEW.armMs then
                return "the game never built a course"
            end
        else
            previewFire(run)
        end
        return nil
    end
    local n = #run.answers
    if n > 0 and run.snapshots.answered == nil then
        run.snapshots.answered = previewSnapshot(run)
    end
    if n ~= run.seenAnswers then
        run.seenAnswers, run.lastAnswerAt = n, g_time
    end
    local all = true
    for i = 1, #run.builds do
        local got = run.builds[i].error ~= nil
        for _, a in ipairs(run.answers) do
            got = got or a.build == i
        end
        all = all and got
    end
    if all and g_time - run.lastAnswerAt >= PREVIEW.settleMs then
        run.snapshots.after = previewSnapshot(run)
        return n > 0 and "answered" or "every build failed"
    end
    if g_time - run.firedAt > PREVIEW.timeoutMs then
        run.snapshots.after = previewSnapshot(run)
        return "timed out"
    end
    return nil
end

local function previewUpdate()
    local run = ctx.preview
    if run == nil then
        return
    end
    local ok, why = pcall(previewFrame, run)
    if not ok then
        previewFinish(run, "failed", tostring(why))
    elseif why ~= nil then
        previewFinish(run, why, nil)
    end
end

-- what the spike made of the words, said back so a misparse shows at once
local function previewWords(args)
    local dir = args.auto and "direction Auto" or args.deg ~= nil and ("direction " .. tostring(args.deg) .. " deg")
        or "settings unchanged"
    if args.flags.two then
        dir = dir .. ", two at once"
    end
    if args.flags.wait then
        dir = dir .. ", waits for the game's build"
    end
    if args.flags.steering then
        dir = dir .. ", while steering"
    end
    return dir
end

function CompanionSpike:consolePreview(name, a, b, c, d)
    local v = getControlledVehicle()
    if v == nil then
        return "get in a vehicle first"
    end
    local ok, run, why = pcall(previewStart, v, name, a, b, c, d)
    if not ok then
        return "preview refused: " .. tostring(run)
    end
    if run == nil then
        return "preview refused: " .. tostring(why)
    end
    ctx.status = (run.args.flags.wait and "preview armed: hold H, change a setting, OK"
        or "preview: building on the next frame") .. " (" .. previewWords(run.args) .. ")"
    return ctx.status
end

-- csSettings NAME writes settings-NAME.json: both Steering Assist parts
-- three levels down (0.0.15 went one), the course tables left out (csCourse
-- has them), the vehicle's own settings (cruise at the lane end,
-- VehicleSettings.lua:151) and the game settings the steering reads
-- (AIAutomaticSteering.lua:407, 923). Raw reads only.
local SETTINGS_DEPTH = 3
local GAME_SETTING_NAMES = { "STEERING_ASSIST_LINES", "STEERING_ASSIST_CRUISE_CONTROL" }

local function probeSettings(v)
    local holder = steeringHolder(v)
    if holder == nil then
        return { found = false, vehicle = objectLabel(firstOf(v, "getRootVehicle") or v) }
    end
    local aut, sel = rawget(holder, "spec_aiAutomaticSteering"), rawget(holder, "spec_aiModeSelection")
    local refs = {}
    for _, k in ipairs({ "steeringFieldCourse", "lastActiveSteeringFieldCourse" }) do
        local c = rawget(aut, k)
        if type(c) == "table" then
            refs[c] = "course " .. k
        end
    end
    local budget = { n = 0 }
    local out = { found = true, vehicle = objectLabel(holder), modes = {} }
    local modes = type(AIModeSelection) == "table" and rawget(AIModeSelection, "MODE") or nil
    if type(modes) == "table" then
        for k, m in pairs(modes) do
            out.modes[tostring(k)] = scalarOf(m)
        end
    end
    if type(sel) == "table" then
        refs[sel] = "modeSelection"
        out.modeSelection = plainBody(sel, SETTINGS_DEPTH, refs, budget, "modeSelection")
        out.modeSelectionClasses = {}
        for k, t in pairs(sel) do
            if type(t) == "table" then
                out.modeSelectionClasses[tostring(k)] = { class = classNameOf(t), methods = methodsOf(t) }
            end
        end
    end
    refs[aut] = "automaticSteering"
    out.automaticSteering = plainBody(aut, SETTINGS_DEPTH, refs, budget, "automaticSteering")
    local vs = rawget(holder, "spec_vehicleSettings")
    if type(vs) == "table" and type(rawget(vs, "settings")) == "table" then
        out.vehicleSettings = {}
        local list = rawget(vs, "settings")
        for i = 1, rawLen(list) do
            out.vehicleSettings[i] = plainFieldsOf(rawget(list, i))
        end
    end
    out.gameSettings = {}
    local ids = type(GameSettings) == "table" and rawget(GameSettings, "SETTING") or nil
    for _, name in ipairs(GAME_SETTING_NAMES) do
        local id = type(ids) == "table" and rawget(ids, name) or nil
        local g = { id = scalarOf(id) }
        if id ~= nil and type(g_gameSettings) == "table" then
            g.raw = scalarOf(rawget(g_gameSettings, id))
            for k, t in pairs(g_gameSettings) do
                if type(t) == "table" and rawget(t, id) ~= nil then
                    g["in " .. tostring(k)] = plainOf(rawget(t, id), 1, {}, { n = 0 }, "")
                end
            end
        end
        out.gameSettings[name] = g
    end
    out.values, out.truncated = budget.n, budget.truncated
    return out
end

function CompanionSpike:consoleSettings(name)
    local v = getControlledVehicle()
    if v == nil then
        return "get in a vehicle first"
    end
    local ok, res = pcall(probeSettings, v)
    if not ok then
        return "settings probe failed: " .. tostring(res)
    end
    local file = name ~= nil and name ~= "" and ("settings-" .. tostring(name):gsub("[^%w_-]", "") .. ".json")
        or "settings.json"
    local written = CS._writeJson(file, { settings = res })
    ctx.status = written and ("settings written to " .. file) or "settings: write FAILED"
    if not res.found then
        return ctx.status .. ": no Steering Assist part in this rig"
    end
    return ctx.status
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
        addConsoleCommand("csParts", "Write what each tool's parts say about its buttons to parts.json (csParts NAME: parts-NAME.json)",
            "consoleParts", CompanionSpike)
        addConsoleCommand("csRate", "Press Precision Farming's rate key (or KEY, with VALUE) and record its sprayer part to rate-KEY.json",
            "consoleRate", CompanionSpike)
        addConsoleCommand("csMissions", "Write the game's contracts and the names spec 0019 uses to missions.json (csMissions NAME: missions-NAME.json)",
            "consoleMissions", CompanionSpike)
        addConsoleCommand("csAccept", "CHANGES THE SAVE: accept contract N (from csMissions) with lease or own, e.g. csAccept 4 lease",
            "consoleAccept", CompanionSpike)
        addConsoleCommand("csCancel", "CHANGES THE SAVE: cancel your contract N (from csMissions)",
            "consoleCancel", CompanionSpike)
        addConsoleCommand("csHandIn", "CHANGES THE SAVE: hand in your finished contract N (from csMissions); books its money",
            "consoleHandIn", CompanionSpike)
        addConsoleCommand("csMaxCut", "Call getMaxCutLiters() once on harvest offer N and record its completion state "
            .. "before and after to maxcut-ID.json (a changed one: don't take it, quit without saving)",
            "consoleMaxCut", CompanionSpike)
        addConsoleCommand("csCourse", "Write the Steering Assist course, read only, to course.json (csCourse NAME: course-NAME.json)",
            "consoleCourse", CompanionSpike)
        addConsoleCommand("csPreview", "Ask the game's course builder for a preview course, never given to the vehicle: "
            .. "csPreview NAME [DEG|auto] [two] [wait] [steering] (preview-NAME.json)",
            "consolePreview", CompanionSpike)
        addConsoleCommand("csSettings", "Write both Steering Assist parts three levels down, read only, to settings.json "
            .. "(csSettings NAME: settings-NAME.json)",
            "consoleSettings", CompanionSpike)
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
        removeConsoleCommand("csCourse")
        for _, name in ipairs(MISSION_COMMANDS) do
            removeConsoleCommand(name)
        end
    end
    ctx.missionRun = nil
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

function CompanionSpike:consoleParts(name)
    local v = getControlledVehicle()
    if v == nil then
        return "get in a vehicle first"
    end
    local ok, res = pcall(probeParts, v)
    if not ok then
        return "parts probe failed: " .. tostring(res)
    end
    local file = name ~= nil and name ~= "" and ("parts-" .. tostring(name):gsub("[^%w_-]", "") .. ".json")
        or "parts.json"
    ctx.status = writeJson(file, { parts = res }) and ("parts written to " .. file) or "parts: write FAILED"
    return string.format("%s: %d rig member(s)", ctx.status, #res.rig)
end

function CompanionSpike:consoleRate(key, value)
    if ctx.rate ~= nil then
        return "already recording"
    end
    local v = getControlledVehicle()
    if v == nil then
        return "get in a vehicle first"
    end
    local o = rateTarget(v)
    if o == nil then
        return "no Precision Farming sprayer part in this rig"
    end
    key = key ~= nil and key ~= "" and key or RATE_KEY
    local ok, before = pcall(rateState, o)
    if not ok then
        return "rate probe failed: " .. tostring(before)
    end
    -- pressed on the next frame, recorded from the frame before
    ctx.rate = { o = o, key = key, value = tonumber(value) or 1, before = before, last = before, changes = {} }
    ctx.status = "recording " .. key
    local fields = 0
    for _ in pairs(before) do
        fields = fields + 1
    end
    return string.format("pressing %s (value %s) on %s and recording %d s; %d field(s)", key, tostring(ctx.rate.value),
        tostring(objectLabel(o).name), RATE_MS / 1000, fields)
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
    local rate = ctx.rate
    if rate ~= nil then
        local ok, done = pcall(function()
            if rate.start == nil then
                rate.start = g_time
                rate.called = pressLikeTheMod(rate.key, rate.value)
            end
            return rateFrame(rate)
        end)
        if not ok or done then
            ctx.rate = nil
            local file = "rate-" .. rate.key:gsub("[^%w_-]", "") .. (rate.value ~= 1 and ("-" .. tostring(rate.value)) or "")
                .. ".json"
            local out = { rate = { target = objectLabel(rate.o), key = rate.key, value = rate.value,
                handlersCalled = rate.called, before = rate.before, changes = rate.changes,
                methods = rateMethods(rate.o), keys = actionEventsOf(rate.o), error = not ok and tostring(done) or nil } }
            ctx.status = writeJson(file, out) and ("rate written to " .. file) or "rate: write FAILED"
            log("csRate %s: %d change(s) recorded", rate.key, #rate.changes)
        end
    end
    missionUpdate()
    previewUpdate()
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
    -- 0.0.18: no standing overlay (Vincent: in the way while testing); a
    -- command's status shows for 5 s, the automatic load and report never
    local status = ctx.status
    if status ~= ctx.shownStatus then
        ctx.shownStatus = status
        local auto = status:sub(1, 10) == "map loaded" or status:sub(1, 6) == "report"
        ctx.flashUntil = not auto and (g_time or 0) + 5000 or nil
    end
    if ctx.flashUntil ~= nil and (g_time or 0) < ctx.flashUntil then
        renderText(0.01, 0.6, 0.013, "[CompanionSpike] " .. status)
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
CS._partsOf, CS._probeParts, CS._rateTarget, CS._rateState, CS._rateFrame = partsOf, probeParts, rateTarget, rateState,
    rateFrame
CS._traceWrap, CS._traceUnwrap, CS._traceFrame, CS._newTrace = traceWrap, traceUnwrap, traceFrame, newTrace
CS._probeMissions, CS._pickMission = probeMissions, pickMission
CS._probeCourse, CS._courseLimits, CS._writeJson = probeCourse, COURSE_LIMITS, writeJson
CS._probeSettings, CS._preview = probeSettings, PREVIEW
CS._previewUpdate = previewUpdate

if addModEventListener ~= nil then
    addModEventListener(CompanionSpike)
end
