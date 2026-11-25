-- SteeringCommands.lua
-- Steering Assist's settings from the dashboard (specs/0022): the game's AI
-- Settings dialog, without the dialog. Its own file, loaded after
-- Commands.lua (whose top level is near Lua's 200 locals), it adds five
-- actions to Commands.ACTIONS:
--
--     steering.mode.set         value 0 AI worker, 1 Steering Assist
--     steering.settings.apply   settings="width=6.6;headlands=auto;direction=45;offset=-0.4"
--     steering.lines.set        value 0 or 1 (Show lines)
--     steering.cruiseOff.set    value 0 or 1 (Cruise Control Deactivation: 1 Automatic)
--     steering.settings.preview settings="width=6.6;headlands=2;direction=45;offset=0"
--
-- The game has no keys for these, only its dialog, so this is the second
-- exception to "the game's keys, not its setters" (docs/ARCHITECTURE.md),
-- beside specs/0019's contracts: each does what the dialog's OK does, as
-- spikes 0.0.18 to 0.0.21 saw it (Api.lua), and answers ok only once the
-- game reads the change back. Host only.
--
-- - The dialog's settings: userSettings' entries, one list per mode, which
--   the save writes; a row is changed in its entry (metres as tenths for
--   the width, the direction one of its choices), then the mode's entries
--   are applied onto a clone of the course settings and committed with
--   aiModeSettingsChanged. The mode is the same, with the new mode's own
--   entries (setAIModeSelection alone kept the old mode's values).
-- - Show lines and Cruise are game settings, every vehicle's; the dialog
--   keeps them in its entries too and puts them back when H is held, so
--   both are written.
-- - After a hitch the game keeps no settings until H is held: each command
--   makes them first, as holding H does (spike 0.0.21).
-- - The preview: a clone with the panel's values, to the game's course
--   builder at the vehicle's front, never given to the vehicle; its answer
--   goes out as the steering_preview topic (collectors/SteeringPreview.lua).
--   One at a time (one command job at a time, 5 s at most); the web keeps
--   the newest waiting. After a hitch it makes the dialog's settings first,
--   as every command here does (holding H's two calls), and changes
--   nothing else the game keeps.

Companion = Companion or {}

local Api = Companion.Api
local VehicleState = Companion.VehicleState
local Commands = Companion.Commands

local SteeringCommands = {}
Companion.SteeringCommands = SteeringCommands

-- frames after the commit that the game may take to read the change back
SteeringCommands.WAIT_FRAMES = 10
-- how long a preview waits for the builder (it answered in 150 to 340 ms):
-- under the web's 10 s, since no other command runs meanwhile; frames
-- where the game gives no time
SteeringCommands.PREVIEW_WAIT_MS = 5000
SteeringCommands.PREVIEW_WAIT_FRAMES = 300

-- a row's name in the settings attribute, and its entry's identifier
local ENTRY = { width = "implementWidth", headlands = "numHeadlands", direction = "workDirection", offset = "sideOffset" }
local SA = "steeringAssist"

-- a job that answers at once: a refusal found once the job started
local function answer(reason)
    return { tick = function() return { ok = false, reason = reason } end }
end

-- ok the frame done() reads true (the commit's frame included), else
-- "didn't change" after WAIT_FRAMES more
local function checkedJob(done, via)
    local job = { frames = 0 }
    job.tick = function()
        if done() then
            return { ok = true, via = via, checked = true }
        end
        job.frames = job.frames + 1
        if job.frames > SteeringCommands.WAIT_FRAMES then
            return { ok = false, reason = "didn't change", via = via, checked = true }
        end
        return nil
    end
    return job
end

-- "width=6.6;direction=auto" -> {width = 6.6, direction = "auto"}; nil for
-- a name that isn't a course row
local function parse(settings)
    local rows, any = {}, false
    for part in (tostring(settings) .. ";"):gmatch("([^;]*);") do
        local name, v = part:match("^(%a+)=([%w%.%-]+)$")
        if name == nil or ENTRY[name] == nil then
            return nil
        end
        rows[name] = v == "auto" and "auto" or tonumber(v)
        if rows[name] == nil then
            return nil
        end
        any = true
    end
    return any and rows or nil
end

-- the value a row's entry takes, in the entry's own units, or nil when it
-- isn't one the dialog offers: auto is the default (the direction's, the
-- first of its choices: Automatic)
local function entryValue(row, v, entry)
    if v == "auto" then
        if row == "direction" then
            local choices = Api.directionChoices(entry)
            return choices ~= nil and type(choices[1]) == "number" and choices[1] or nil
        end
        return type(entry.defaultValue) == "number" and entry.defaultValue or nil
    end
    local value
    if row == "width" then
        value = math.floor(v * 10 + 0.5)
    elseif row == "headlands" then
        if v ~= math.floor(v) then
            return nil
        end
        value = v
    elseif row == "direction" then
        local choices = Api.directionChoices(entry) or {}
        for i = 2, #choices do
            if choices[i] == v then
                return v
            end
        end
        return nil
    else
        value = math.floor(v * 10 + 0.5) / 10
    end
    if (type(entry.min) == "number" and value < entry.min) or (type(entry.max) == "number" and value > entry.max) then
        return nil
    end
    return value
end

-- a course setting's value from its entry's, as userSettings:apply writes
-- it (spike 0.0.20: tenths to metres, degrees to radians, Automatic -1)
local function courseValue(row, value)
    if row == "width" then
        return value / 10
    elseif row == "direction" then
        return value < 0 and -1 or math.rad(value)
    end
    return value
end

local function sameValue(row, want, got)
    if type(got) ~= "number" then
        return false
    end
    if row == "direction" and want < 0 then
        return got < 0
    end
    return math.abs(got - courseValue(row, want)) < 0.001
end

-- the rows' new entry values, checked against the dialog's: {row, entry,
-- value} each, or nil and why
local function rowsFor(vehicle, settings)
    local rows = parse(settings)
    if rows == nil then
        return nil, "value not allowed"
    end
    local made, why = Api.ensureUserSettings(vehicle)
    if not made then
        return nil, why
    end
    local list = Api.userEntries(vehicle, SA)
    local out = {}
    for row, v in pairs(rows) do
        local entry = Api.entryOf(list, ENTRY[row])
        if entry == nil then
            return nil, "no settings"
        end
        local value = entryValue(row, v, entry)
        if value == nil then
            return nil, "value not allowed"
        end
        out[#out + 1] = { row = row, entry = entry, value = value }
    end
    return out
end

-- The course rows: Steering Assist mode, on a field the farm may work,
-- steering off (the game rebuilds the course and stops steering on a
-- change). Plain reads, no calls.
local function courseRowsOpen(vehicle)
    local spec = Api.automaticSteering(vehicle)
    if spec == nil or Api.modeSelection(vehicle) == nil then
        return false, "no Steering Assist"
    end
    if Api.aiMode(vehicle) ~= SA then
        return false, "not in Steering Assist mode"
    end
    if Api.steeringOnField(vehicle) ~= true then
        return false, "not on a field you may work"
    end
    if spec.steeringEnabled == true then
        return false, "steering is on"
    end
    return true
end

-- steering.settings.apply: the entries set, applied onto a clone, committed;
-- put back when the game refuses
local function applyJob(vehicle, _, settings)
    local rows, why = rowsFor(vehicle, settings)
    if rows == nil then
        return answer(why)
    end
    -- revision 2: rows left in the game's dialog with Back go back to the
    -- lanes' values first, so only the panel's changes are committed
    local back = {}
    local lanes = VehicleState.lanesEntries(vehicle)
    if lanes ~= nil then
        local list = Api.userEntries(vehicle, SA)
        for _, id in pairs(ENTRY) do
            local e = Api.entryOf(list, id)
            if e ~= nil and lanes[id] ~= nil and e.value ~= lanes[id] then
                back[#back + 1] = { entry = e, old = e.value }
                e.value = lanes[id]
            end
        end
    end
    for _, r in ipairs(rows) do
        r.old = r.entry.value
        r.entry.value = r.value
    end
    local done, refused = Api.commitUserSettings(vehicle, SA)
    if not done then
        for _, r in ipairs(rows) do
            r.entry.value = r.old
        end
        for _, b in ipairs(back) do
            b.entry.value = b.old
        end
        return answer(refused)
    end
    VehicleState.steeringCommitted(vehicle)
    return checkedJob(function()
        local spec = Api.modeSelection(vehicle)
        local s = spec ~= nil and spec.fieldCourseSettings or nil
        if type(s) ~= "table" then
            return false
        end
        for _, r in ipairs(rows) do
            if not sameValue(r.row, r.value, s[ENTRY[r.row]]) then
                return false
            end
        end
        return true
    end, "aiModeSettingsChanged")
end

-- steering.mode.set ---------------------------------------------------------

local function modeOpen(vehicle)
    if Api.modeSelection(vehicle) == nil or Api.automaticSteering(vehicle) == nil then
        return false, "no Steering Assist"
    end
    -- never tried: a mode change under a hired worker
    if VehicleState.aiActive(vehicle) then
        return false, "the AI worker is driving"
    end
    return true
end

local function modeState(vehicle)
    local mode = Api.aiMode(vehicle)
    if mode == nil then
        return nil
    end
    return mode == SA and 1 or 0
end

-- as the dialog's OK with a new mode: that mode's own entries applied onto
-- a clone, committed with the mode
local function modeJob(vehicle, value)
    local name = value == 1 and SA or "worker"
    if value == 1 and Api.canAssist(vehicle) ~= true then
        return answer("no tool allows steering")
    end
    local made, why = Api.ensureUserSettings(vehicle)
    if not made then
        return answer(why)
    end
    local done, refused = Api.commitUserSettings(vehicle, name)
    if not done then
        return answer(refused)
    end
    VehicleState.steeringCommitted(vehicle)
    return checkedJob(function() return Api.aiMode(vehicle) == name end, "aiModeSettingsChanged")
end

-- steering.lines.set, steering.cruiseOff.set ---------------------------------
-- the dialog's entry and the game setting; already only when both hold it
-- (the game's own lines key flips only the setting)

local function partOpen(vehicle)
    if Api.modeSelection(vehicle) == nil then
        return false, "no Steering Assist"
    end
    return true
end

local function switchState(setting, identifier)
    return function(vehicle)
        local entry = Api.entryOf(Api.userEntries(vehicle, SA), identifier)
        local _, game = Api.gameSetting(setting)
        if entry == nil or type(entry.value) ~= "boolean" or entry.value ~= game then
            return nil
        end
        return game and 1 or 0
    end
end

local function switchJob(setting, identifier)
    return function(vehicle, value)
        local want = value == 1
        local made, why = Api.ensureUserSettings(vehicle)
        if not made then
            return answer(why)
        end
        local entry = Api.entryOf(Api.userEntries(vehicle, SA), identifier)
        if entry == nil then
            return answer("no settings")
        end
        local old = entry.value
        entry.value = want
        local done, refused = Api.setGameSetting(setting, want)
        if not done then
            entry.value = old
            return answer(refused)
        end
        return checkedJob(function()
            local _, game = Api.gameSetting(setting)
            return entry.value == want and game == want
        end, "setter")
    end
end

-- steering.settings.preview ---------------------------------------------------
-- The state the steering_preview topic sends: the last preview's data, and
-- whether it changed since it was sent.

local preview = { key = 0, dirty = false, data = nil }

function SteeringCommands.previewState()
    return preview
end

function SteeringCommands.resetPreview()
    preview.key, preview.dirty, preview.data = 0, false, nil
end

local function previewSend(data)
    preview.data, preview.dirty = data, true
end

local function previewJob(vehicle, _, settings)
    local rows, why = rowsFor(vehicle, settings)
    if rows == nil then
        return answer(why)
    end
    local clone = Api.cloneCourseSettings(vehicle)
    if clone == nil then
        return answer("no settings")
    end
    -- the clone's fields set directly: no entry is touched
    for _, r in ipairs(rows) do
        clone[ENTRY[r.row]] = courseValue(r.row, r.value)
    end
    local builder = Api.courseBuilder()
    if builder == nil then
        return answer("no course builder")
    end
    local x, z = Api.coursePosition(vehicle, builder)
    if x == nil then
        return answer("no place to build at")
    end
    preview.key = preview.key + 1
    local base = { key = preview.key, ["for"] = settings }
    local function send(state, more)
        local data = { key = base.key, ["for"] = base["for"], state = state }
        for k, v in pairs(more or {}) do
            data[k] = v
        end
        previewSend(data)
    end
    send("building")
    -- alive until the job ends: an answer after that is stored nowhere
    local job = { frames = 0, alive = true, answered = false, since = type(g_time) == "number" and g_time or nil }
    local started = Api.buildCourse(builder, x, z, clone, function(course)
        if job.alive then
            job.course, job.answered = course, true
        end
    end)
    if not started then
        job.alive = false
        send("failed")
        return answer("the game refused the preview")
    end
    job.tick = function()
        if Api.controlledVehicle() ~= vehicle then
            job.alive = false
            send("failed")
            return { ok = false, reason = "not in that vehicle any more" }
        end
        if job.answered then
            job.alive = false
            local geometry = job.course ~= nil and Companion.CourseGeometry ~= nil
                and Companion.CourseGeometry(job.course) or false
            if geometry then
                send("ready", { width = geometry.width, boundary = geometry.boundary, segments = geometry.segments })
            else
                send("none")
            end
            return { ok = true, via = "generateFieldCourseAtWorldPos", checked = true }
        end
        job.frames = job.frames + 1
        local waited = job.since ~= nil and type(g_time) == "number" and g_time - job.since or nil
        if job.frames > SteeringCommands.PREVIEW_WAIT_FRAMES
            or (waited ~= nil and waited > SteeringCommands.PREVIEW_WAIT_MS) then
            job.alive = false
            send("failed")
            return { ok = false, reason = "no answer from the game" }
        end
        return nil
    end
    return job
end

-- the actions ----------------------------------------------------------------

local SET = { 0, 1, whole = true }

Commands.ACTIONS["steering.mode.set"] = { when = modeOpen, state = modeState, values = SET, job = modeJob }
Commands.ACTIONS["steering.settings.apply"] = { when = courseRowsOpen, settings = true, job = applyJob }
Commands.ACTIONS["steering.lines.set"] = { when = partOpen, state = switchState("lines", "showLines"), values = SET,
    job = switchJob("lines", "showLines") }
Commands.ACTIONS["steering.cruiseOff.set"] = { when = partOpen, state = switchState("cruise", "cruiseControl"),
    values = SET, job = switchJob("cruise", "cruiseControl") }
Commands.ACTIONS["steering.settings.preview"] = { when = courseRowsOpen, settings = true, job = previewJob }
