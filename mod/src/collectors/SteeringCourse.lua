-- SteeringCourse.lua
-- specs/0021: the GPS screen's course, the one the game's Steering Assist
-- built for the controlled vehicle's field: its outline, every segment
-- (the straight lanes and the headland round's pieces) with its polyline,
-- the ones the game marks done and the one under you. Read every 500 ms:
-- the geometry once per course table, the flags and the segment under you
-- each time; sent when it's a new course or those changed, never without a
-- course. Plain field reads (Api.lua), no call on the course or its
-- segments (getters are not reads: spike 0.0.10's freeze).
--
--     {"key":3,"width":6,"boundary":[-564.2,-609.2,...],
--      "segments":[{"i":1,"lane":1,"pts":[-793.0,-654.6,...]},
--                  {"i":11,"round":1,"pts":[-567.0,-610.8,...]}],
--      "done":[7,9,10,11,12,13,14],"current":{"i":9,"left":true}}
--
-- `key` is cab.steering.courseKey, so the web draws a course only while
-- it is the controlled vehicle's. A course with a segment the mod can't
-- read whole sends nothing, not half a course.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo
local VehicleState = Companion.VehicleState

-- the course whose geometry is built, and that geometry (false: unreadable)
local built = { course = nil, geometry = nil }
-- what was sent last: the key, done and current as one string
local lastSent = nil

-- {x, z} pairs to a flat array at 0.1 m; nil when a point isn't two numbers
local function flat(points, min)
    if type(points) ~= "table" then
        return nil
    end
    local out = {}
    for _, p in ipairs(points) do
        local x, z = type(p) == "table" and p[1] or nil, type(p) == "table" and p[2] or nil
        if type(x) ~= "number" or type(z) ~= "number" then
            return nil
        end
        out[#out + 1] = Geo.round(x, 1)
        out[#out + 1] = Geo.round(z, 1)
    end
    if #out < 2 * min then
        return nil
    end
    return out
end

-- the outline, the width and every segment; false when any part is missing
local function geometryOf(course)
    local segments = Api.courseSegments(course)
    local boundary = flat(Api.courseBoundary(course), 3)
    if segments == nil or boundary == nil then
        return false
    end
    local out = { width = Api.courseWidth(course), boundary = boundary, segments = {} }
    for i, segment in ipairs(segments) do
        if type(segment) ~= "table" then
            return false
        end
        local parts = Api.segmentParts(segment)
        local pts = flat(parts.positions, 2)
        if pts == nil then
            return false
        end
        out.segments[i] = {
            i = type(parts.id) == "number" and parts.id or i,
            lane = type(parts.lane) == "number" and parts.lane or nil,
            round = type(parts.round) == "number" and parts.round or nil,
            pts = pts,
        }
    end
    if #out.segments == 0 then
        return false
    end
    return out
end

-- specs/0022: the preview's course (the builder's raw course) the same way
Companion.CourseGeometry = geometryOf

-- the indices whose flag is set, ascending
local function doneOf(course, count)
    local states = Api.courseStates(course)
    local done = {}
    if states ~= nil then
        for i = 1, count do
            if states[i] == true then
                done[#done + 1] = i
            end
        end
    end
    return done
end

Companion.Collectors.SteeringCourse = {
    topic = "steering_course",
    interval = 500,
    resend = true,
    reset = function()
        built.course, built.geometry = nil, nil
        lastSent = nil
    end,
    collect = function(ctx)
        local course = Api.steeringCourse(Api.controlledVehicle())
        if course == nil then
            -- the next course (or this one back) is sent again
            lastSent = nil
            return nil
        end
        if built.course ~= course then
            built.course = course
            built.geometry = geometryOf(course)
            lastSent = nil
        end
        local geometry = built.geometry
        if not geometry then
            -- not whole yet: read again next time
            built.course = nil
            return nil
        end
        local key = VehicleState.courseKey(course)
        local done = doneOf(course, #geometry.segments)
        local index, left = Api.courseCurrent(course)
        local stamp = key .. "|" .. table.concat(done, ",") .. "|" .. tostring(index) .. "|" .. tostring(left)
        if stamp == lastSent then
            return nil
        end
        lastSent = stamp
        return {
            key = key,
            width = geometry.width,
            boundary = geometry.boundary,
            segments = geometry.segments,
            done = done,
            current = index ~= nil and { i = index, left = left } or nil,
        }
    end,
}
