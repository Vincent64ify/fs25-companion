-- state/Steering.lua
-- Steering Assist (specs/0020): the vehicle's AI mode, whether the game
-- steers, and whether it would take the steering key now. A plain reader,
-- no cache, no game calls: the fields of AIModeSelection.lua and
-- AIAutomaticSteering.lua (names through Api.lua, unverified until the
-- live check), read as spike 0.0.15 saw them (mod/tests/fixtures/spike0020/).

Companion = Companion or {}

local Api = Companion.Api

local VehicleState = Companion.VehicleState or {}
Companion.VehicleState = VehicleState

-- the game's own steering key (Activate lane / Deactivate lane): its event
-- is active only with a course and a lane under you
VehicleState.STEERING_KEY = "TOGGLE_AI_STEERING"

-- {mode = "worker"|"steeringAssist", state = "off"|"ready"|"steering",
-- canSteer}; nil without either part or with a mode neither name has. A
-- truck may carry both parts (spike 0.0.15): the mode decides, not the
-- vehicle. canSteer is the steering key's event (VehicleState.liveKey),
-- false with none registered.
function VehicleState.steering(vehicle)
    local spec = Api.automaticSteering(vehicle)
    if spec == nil then
        return nil
    end
    local mode = Api.aiMode(vehicle)
    if mode == nil then
        return nil
    end
    local state = "off"
    if spec.steeringEnabled == true then
        state = "steering"
    elseif spec.steeringFieldCourse ~= nil then
        state = "ready"
    end
    local key = VehicleState.liveKey(vehicle, VehicleState.STEERING_KEY)
    local out = { mode = mode, state = state, canSteer = key ~= nil and key.active == true,
        onField = Api.steeringOnField(vehicle) }
    -- specs/0021: the steering_course topic's key while there is a course
    local course = Api.steeringCourse(vehicle)
    if course ~= nil then
        out.courseKey = VehicleState.courseKey(course)
    end
    -- specs/0022: the dialog's settings, and whether a tool allows Steering
    -- Assist (the Mode row's fade)
    out.settings = VehicleState.steeringSettings(vehicle)
    out.canAssist = Api.canAssist(vehicle)
    -- revision 2: the game's dialog without OK, and Show lines and Cruise
    -- whether or not the vehicle has settings
    out.dialog = VehicleState.steeringDialog(vehicle)
    out.showLines, out.cruiseOff = VehicleState.steeringGameSettings()
    return out
end

-- specs/0022: Steering Assist's settings as its dialog shows them -----------
-- Its entries in userSettings (spike 0.0.19), whatever the mode: a value
-- equal to its default is Auto (no flag: back at 5.0 m from 5.1 m the
-- dialog said Auto again); the direction is Auto when negative (-57.2958 as
-- the dialog sets it, -57 after a reload). After a hitch the game keeps no
-- entries until H is held: then the course's own settings, all Auto, and
-- made false (the commands make them first). Show lines and Cruise are game
-- settings, every vehicle's (spike 0.0.18). Plain reads, no calls.

local OFFSET_SAME = 0.001

local function num(v)
    return type(v) == "number" and v or nil
end

-- tenths of a metre as metres, one decimal
local function metres(tenths)
    return tenths ~= nil and math.floor(tenths + 0.5) / 10 or nil
end

local function isAuto(e, tolerance)
    local v, d = num(e.value), num(e.defaultValue)
    return v ~= nil and d ~= nil and math.abs(v - d) <= (tolerance or 0)
end

-- revision 2: a course row's entry, or the same entry with the value the
-- lanes were built with
local COURSE_IDS = { "implementWidth", "numHeadlands", "workDirection", "sideOffset" }

local function valued(e, values, id)
    if e == nil or values == nil or values[id] == nil then
        return e
    end
    return { value = values[id], defaultValue = e.defaultValue, min = e.min, max = e.max }
end

local function width(e)
    return { m = metres(e.value), auto = isAuto(e), min = metres(num(e.min)), max = metres(num(e.max)) }
end

local function headlands(e)
    return { count = e.value, auto = isAuto(e), min = num(e.min), max = num(e.max) }
end

local function direction(e)
    return { deg = e.value >= 0 and e.value or nil, auto = e.value < 0 }
end

local function offset(e)
    return { m = math.floor(e.value * 10 + 0.5) / 10, auto = isAuto(e, OFFSET_SAME), min = num(e.min), max = num(e.max) }
end

-- the rows from the entries; `values` (identifier -> value) in place of
-- the entries' own where given
local function fromEntries(list, values)
    local w = valued(Api.entryOf(list, "implementWidth"), values, "implementWidth")
    local h = valued(Api.entryOf(list, "numHeadlands"), values, "numHeadlands")
    local d = valued(Api.entryOf(list, "workDirection"), values, "workDirection")
    local o = valued(Api.entryOf(list, "sideOffset"), values, "sideOffset")
    if w == nil or num(w.value) == nil or h == nil or num(h.value) == nil
        or d == nil or num(d.value) == nil or o == nil or num(o.value) == nil then
        return nil
    end
    return { made = true, width = width(w), headlands = headlands(h), direction = direction(d), offset = offset(o) }
end

-- the course's own settings, after a hitch: what the game built it with
local function fromCourse(course)
    local s = type(course) == "table" and course.fieldCourseSettings or nil
    if type(s) ~= "table" or num(s.implementWidth) == nil then
        return nil
    end
    return {
        made = false,
        width = { m = math.floor(s.implementWidth * 10 + 0.5) / 10, auto = true },
        headlands = { count = num(s.numHeadlands) or 0, auto = true },
        direction = { auto = true },
        offset = { m = 0, auto = true },
    }
end

-- Revision 2 (live check 2026-11-25): the game's dialog writes its entries
-- as each row is stepped and Back keeps them; only OK builds a course. So
-- the mod keeps, per course table, the entries as they were when it first
-- saw that course: what the lanes are. After the mod's own commit the
-- entries are what's coming, until the game's next course.
local lanesOf = setmetatable({}, { __mode = "k" })
local committing = setmetatable({}, { __mode = "k" })

local function entryValues(list)
    local out = {}
    for _, id in ipairs(COURSE_IDS) do
        local e = Api.entryOf(list, id)
        if e == nil or num(e.value) == nil then
            return nil
        end
        out[id] = e.value
    end
    return out
end

-- identifier -> the value the lanes were built with, or nil (no course,
-- no entries)
function VehicleState.lanesEntries(vehicle)
    local course = Api.steeringCourse(vehicle)
    local now = entryValues(Api.userEntries(vehicle, "steeringAssist"))
    if course == nil or now == nil then
        return nil
    end
    if committing[vehicle] ~= nil then
        if committing[vehicle] == course then
            return now
        end
        committing[vehicle] = nil
    end
    local lanes = lanesOf[course]
    if lanes == nil then
        lanes = now
        lanesOf[course] = lanes
    end
    return lanes
end

-- the mod committed the entries (Apply, Reset, the mode): they're the
-- lanes' from now on, until the game builds its next course
function VehicleState.steeringCommitted(vehicle)
    committing[vehicle] = Api.steeringCourse(vehicle) or false
end

-- {width = {m, auto, min, max}, headlands = {count, auto, min, max},
-- direction = {deg, auto}, offset = {m, auto, min, max}, showLines,
-- cruiseOff, made}, or nil when the game has none for this vehicle: what
-- the lanes are built with (revision 2)
function VehicleState.steeringSettings(vehicle)
    local list = Api.userEntries(vehicle, "steeringAssist")
    local out = fromEntries(list, VehicleState.lanesEntries(vehicle))
        or fromCourse(Api.steeringCourse(vehicle))
    if out == nil then
        return nil
    end
    local lines, cruise = VehicleState.steeringGameSettings()
    out.showLines, out.cruiseOff = lines, cruise
    return out
end

-- the rows the game's dialog holds without OK, in the settings' shape, only
-- those that differ from the lanes'; nil when none (revision 2)
function VehicleState.steeringDialog(vehicle)
    local lanes = VehicleState.lanesEntries(vehicle)
    local list = Api.userEntries(vehicle, "steeringAssist")
    local now = entryValues(list)
    if lanes == nil or now == nil then
        return nil
    end
    local out, any = {}, false
    local rows = { implementWidth = { "width", width }, numHeadlands = { "headlands", headlands },
        workDirection = { "direction", direction }, sideOffset = { "offset", offset } }
    for _, id in ipairs(COURSE_IDS) do
        if math.abs(now[id] - lanes[id]) > 1e-6 then
            local row = rows[id]
            out[row[1]] = row[2](Api.entryOf(list, id))
            any = true
        end
    end
    return any and out or nil
end

-- Show lines and Cruise: game settings, every vehicle's (spike 0.0.18)
function VehicleState.steeringGameSettings()
    local _, lines = Api.gameSetting("lines")
    local _, cruise = Api.gameSetting("cruise")
    if type(lines) ~= "boolean" then
        lines = nil
    end
    if type(cruise) ~= "boolean" then
        cruise = nil
    end
    return lines, cruise
end

-- specs/0021: a number for each course table the game builds, so the web
-- redraws a course only when it is a new one; kept while the table lives
local courseKeys = setmetatable({}, { __mode = "k" })
local lastCourseKey = 0

function VehicleState.courseKey(course)
    local key = courseKeys[course]
    if key == nil then
        lastCourseKey = lastCourseKey + 1
        key = lastCourseKey
        courseKeys[course] = key
    end
    return key
end

-- whether the game steers now; nil without the part
function VehicleState.steeringEnabled(vehicle)
    local spec = Api.automaticSteering(vehicle)
    if spec == nil then
        return nil
    end
    return spec.steeringEnabled == true
end
