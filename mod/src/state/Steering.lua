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

local function fromEntries(list)
    local width = Api.entryOf(list, "implementWidth")
    local heads = Api.entryOf(list, "numHeadlands")
    local dir = Api.entryOf(list, "workDirection")
    local off = Api.entryOf(list, "sideOffset")
    if width == nil or num(width.value) == nil or heads == nil or num(heads.value) == nil
        or dir == nil or num(dir.value) == nil or off == nil or num(off.value) == nil then
        return nil
    end
    local deg = dir.value
    return {
        made = true,
        width = { m = metres(width.value), auto = isAuto(width), min = metres(num(width.min)), max = metres(num(width.max)) },
        headlands = { count = heads.value, auto = isAuto(heads), min = num(heads.min), max = num(heads.max) },
        direction = { deg = deg >= 0 and deg or nil, auto = deg < 0 },
        offset = { m = math.floor(off.value * 10 + 0.5) / 10, auto = isAuto(off, OFFSET_SAME), min = num(off.min),
            max = num(off.max) },
    }
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

-- {width = {m, auto, min, max}, headlands = {count, auto, min, max},
-- direction = {deg, auto}, offset = {m, auto, min, max}, showLines,
-- cruiseOff, made}, or nil when the game has none for this vehicle
function VehicleState.steeringSettings(vehicle)
    local out = fromEntries(Api.userEntries(vehicle, "steeringAssist"))
        or fromCourse(Api.steeringCourse(vehicle))
    if out == nil then
        return nil
    end
    local _, lines = Api.gameSetting("lines")
    local _, cruise = Api.gameSetting("cruise")
    if type(lines) == "boolean" then
        out.showLines = lines
    end
    if type(cruise) == "boolean" then
        out.cruiseOff = cruise
    end
    return out
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
