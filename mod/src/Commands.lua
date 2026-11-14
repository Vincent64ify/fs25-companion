-- Commands.lua
-- Runs the dashboard's commands (docs/ARCHITECTURE.md, Commands). The companion
-- writes one file per command, numbered from 1 per game session, with the
-- dashboard's action name (specs/0007) and the state it wants (specs/0008;
-- hello says so: commands.actions 3):
--
--     modSettings/FS25_Companion/cmd/<n>.xml
--     <command session="<sessionId>" id="<n>" action="beacon.set" ref="<companion ref>" value="1.000"/>
--     <command ... action="cruise.set" ref="..." value="23.000"/>   (km/h)
--     <command ... action="tool.lower" ref="..." value="1.000" tool="9"/>   (a rig id)
--     <command ... action="tool.width" ref="..." value="-1.000" tool="9" side="left"/>
--     <command ... action="tool.unload" ref="..." tool="9"/>   (a one-shot: no value)
--
-- (a temp file, read back once, then renamed, so it appears whole). Every
-- frame the mod checks whether the next number exists (fileExists costs
-- about 0.1 ms, C0). When it does, it reads it with XMLFile.load, checks the
-- session, the action and its value (Commands.ACTIONS, the one list), runs
-- the action, and answers with a `command_ack` envelope:
--
--     {"id":<n>,"ref":"<companion ref>","action":"beacon.set","ok":true,"via":"TOGGLE_BEACON_LIGHTS"}
--     {"id":<n>,"ref":"...","action":"beacon.set","ok":true,"already":true}
--     {"id":<n>,"ref":"...","ok":false,"reason":"not in a vehicle"}
--
-- A set action reads the state the cab reports and presses the key only
-- when it differs; already there (or on its way), it presses nothing and
-- answers `already`. `via` says what ran: the input action's name, or
-- "setter" (the three without a key). The caller
-- sends the `cab` topic in the same frame, so the new state reaches the
-- dashboard with the ack. The companion deletes the file once it sees the ack.
--
-- Never io.open(path, "r") here: FS25 opens the file for writing, which
-- empties it (C0).
--
-- Actions run through the input action's own event callbacks, as a key
-- press would (rebinds, mod actions and multiplayer events just work);
-- g_inputBinding.actionEvents is keyed by the action object
-- (nameActions[name]), verified in C0. The implement keys' events belong
-- to the selected implement, so they act on it as the keys do. An action
-- whose key has no active event answers "not available now", as the key
-- would do nothing (specs/0009: one way to run each action). Setters run
-- only where the game has no key: the cruise set speed, select and detach
-- by id. Which one ran is logged once per action.
--
-- Input action names, from the game's inputBinding.xml (C2): fold is
-- IMPLEMENT_EXTRA2 and turn on IMPLEMENT_EXTRA (there is no
-- IMPLEMENT_FOLD), cruise speed is the axis AXIS_CRUISE_CONTROL.

Companion = Companion or {}

local Api = Companion.Api
local VehicleState = Companion.VehicleState

local Commands = {}
Commands.__index = Commands
Companion.Commands = Commands

-- Setters ------------------------------------------------------------------
-- Only where the game has no key (specs/0009). Each returns true, or false
-- and the reason.

-- The cruise control's one set speed: the one the game holds when cruise
-- control is on. (C2's first try kept a second one for reverse; live, the
-- L90H has none, the Fastrac and the Valtra T195 Active use the main one
-- in reverse, and speedReverse read the same as maxSpeedReverse. The
-- reverse value passes through untouched.)

-- the set speed, km/h (the dashboard's held −/+), clamped to the vehicle's
-- limits
local function cruiseSet(vehicle, _, value)
    local spec = vehicle.spec_drivable
    local cruise = spec ~= nil and spec.cruiseControl or nil
    if type(cruise) ~= "table" or type(vehicle.setCruiseControlMaxSpeed) ~= "function" then
        return false, "no cruise control"
    end
    if type(value) ~= "number" or value ~= value then
        return false, "no speed"
    end
    local max = type(cruise.maxSpeed) == "number" and cruise.maxSpeed or math.huge
    vehicle:setCruiseControlMaxSpeed(math.max(1, math.min(max, value)), cruise.speedReverse)
    return true
end

-- States (specs/0008) ------------------------------------------------------
-- What a set action compares, read as the cab reads it: 1 or 0 (the light
-- stage for the lights), nil when it can't be read (then the key is pressed).

-- the light stage (0 off); without stages, 0 or 1
local function lightStage(vehicle)
    local lights = VehicleState.lights(vehicle)
    if lights == nil then
        return nil
    end
    if lights.stages ~= nil then
        return lights.stage
    end
    return lights.on and 1 or 0
end

local function lightSwitch(name)
    return function(vehicle)
        local lights = VehicleState.lights(vehicle)
        if lights == nil or type(lights[name]) ~= "boolean" then
            return nil
        end
        return lights[name] and 1 or 0
    end
end

-- an engine that is starting is on its way to on
local function engineState(vehicle)
    local state = VehicleState.engineState(vehicle)
    if state == nil then
        return nil
    end
    return state == "off" and 0 or 1
end

local function cruiseOn(vehicle)
    local cruise = VehicleState.cruise(vehicle)
    if cruise == nil then
        return nil
    end
    return cruise.state == "off" and 0 or 1
end

local function aiState(vehicle)
    return VehicleState.aiActive(vehicle) and 1 or 0
end

-- Selection (C3) -----------------------------------------------------------
-- The dashboard picks a tool and the game selects it, as G would after
-- enough presses (verified in the selection spike: docs/GAME-API.md, C3).

-- select the tool (or the tractor) with this id
local function selectTarget(vehicle, _, id)
    local root = VehicleState.rootOf(vehicle)
    if type(root.setSelectedObject) ~= "function" then
        return false, "can't select"
    end
    for _, entry in ipairs(VehicleState.selectables(root)) do
        if entry.vehicle.id == id then
            root:setSelectedObject(entry.object)
            return true
        end
    end
    return false, "not selectable"
end

-- detach the tool with this id from what it hangs on
local function detachTarget(vehicle, _, id)
    local object = VehicleState.attachedById(vehicle, id)
    if object == nil then
        return false, "not attached"
    end
    local allowed, why = Api.tryCallAll(object, "isDetachAllowed")
    if allowed == false then
        return false, type(why) == "string" and why or "can't detach now"
    end
    local attacher = Api.tryCall(object, "getAttacherVehicle")
    if type(attacher) ~= "table" or type(attacher.detachImplementByObject) ~= "function" then
        return false, "can't detach"
    end
    attacher:detachImplementByObject(object)
    return true
end

-- Implement screen ---------------------------------------------------------

-- the vehicle and everything on it, the vehicle first
local function rigObjects(vehicle)
    local list = { vehicle }
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        list[#list + 1] = node.object
    end
    return list
end

-- 1 laying a swath, 0 chopping (the cab's straw)
local function strawState(vehicle)
    for _, object in ipairs(rigObjects(vehicle)) do
        local straw = VehicleState.extras(object, {}).straw
        if straw ~= nil then
            return straw.swath and 1 or 0
        end
    end
    return nil
end

-- Vehicle page's cards (specs/0003) -----------------------------------------
-- A command with a tool's id does what a player does: it selects that tool,
-- presses the action's key and puts the selection back, so every game rule
-- applies. The game registers a tool's keys only on the frames after it is
-- selected (spike 0.0.4), so this runs over a few frames as a job; a key
-- the tool already has live is pressed at once. A key that never comes
-- answers "not available now" (specs/0009).

-- frames to wait for the selected tool's key
Commands.KEY_WAIT_FRAMES = 30

-- the rig member with this id and its depth: the vehicle, or something attached
local function memberById(vehicle, id)
    if vehicle.id == id then
        return vehicle, 0
    end
    return VehicleState.attachedById(vehicle, id), 1
end

-- what a member can do, and whether now (VehicleState.capabilities)
local function capsOf(object, depth)
    return VehicleState.capabilities(object, VehicleState.extras(object, {}), depth)
end

local function hasCap(e, cap)
    for _, c in ipairs(e.can or {}) do
        if c == cap then
            return true
        end
    end
    return false
end

-- the rig in driving order: rear tools (farthest first), the vehicle,
-- front tools, each {object, depth}
local function drivingOrder(vehicle)
    local rear, front = {}, {}
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        local list = node.side == "front" and front or rear
        list[#list + 1] = { object = node.object, depth = node.depth }
    end
    local out = {}
    for i = #rear, 1, -1 do
        out[#out + 1] = rear[i]
    end
    out[#out + 1] = { object = vehicle, depth = 0 }
    for _, m in ipairs(front) do
        out[#out + 1] = m
    end
    return out
end

-- the sprayer's doubled rate key: its own (toggleDoubledAmountInputBinding,
-- from its XML), else the game's default (Sprayer.onLoad)
local function doubledRateKeys(object)
    local spec = object.spec_sprayer
    local own = type(spec) == "table" and spec.toggleDoubledAmountInputBinding or nil
    if type(own) == "string" and own ~= "DOUBLED_SPRAY_AMOUNT" then
        return { own, "DOUBLED_SPRAY_AMOUNT" }
    end
    return { "DOUBLED_SPRAY_AMOUNT" }
end

-- each one-tool action: the capability it needs, its keys (a list, or
-- function(tool) -> list; lower: the key is the tool's own, or the one it
-- hangs on acts on it while it's selected, as the game's attacher joints
-- do), and what its answer checks (`check`: the readings' kind; specs/0012)
local AIMED = {
    LOWER_IMPLEMENT = { cap = "lower", inputs = { "LOWER_IMPLEMENT" }, attacherKey = true, check = "lower" },
    FOLD_IMPLEMENT = { cap = "fold", inputs = { "IMPLEMENT_EXTRA2" }, check = "fold" },
    TURN_ON_IMPLEMENT = { cap = "turnOn", inputs = { "IMPLEMENT_EXTRA" }, check = "turnOn" },
    TOGGLE_DISCHARGE = { cap = "tip", inputs = { "TOGGLE_TIPSTATE", "TOGGLE_TIPSTATE_GROUND" }, check = "tip" },
    -- specs/0014: checked too
    TOGGLE_COVER = { cap = "cover", inputs = { "TOGGLE_COVER" }, check = "cover" },
    TOGGLE_PIPE = { cap = "pipe", inputs = { "TOGGLE_PIPE" }, check = "pipe" },
    TOGGLE_TIPSIDE = { cap = "tipSide", inputs = { "TOGGLE_TIPSIDE" }, check = "tipSide" },
    -- specs/0011: the width keys, one per side (inputBinding.xml; unverified)
    WIDTH_LEFT = { cap = "width", inputs = { "VARIABLE_WORK_WIDTH_LEFT" } },
    WIDTH_RIGHT = { cap = "width", inputs = { "VARIABLE_WORK_WIDTH_RIGHT" } },
    -- specs/0012, from the game's scripts: FillUnit's UNLOAD, the plow's
    -- IMPLEMENT_EXTRA (Plow.actionEventTurn) and IMPLEMENT_EXTRA3
    -- (actionEventLimitToField), the baler's IMPLEMENT_EXTRA4
    -- (actionEventToggleAutomaticDrop), BaleCounter's reset; Precision
    -- Farming's rate keys as the probe pressed them
    UNLOAD = { cap = "unload", inputs = { "UNLOAD" }, check = "unload" },
    ROTATE_PLOW = { cap = "rotate", inputs = { "IMPLEMENT_EXTRA" }, check = "rotate" },
    LIMIT_TO_FIELD = { cap = "createFields", inputs = { "IMPLEMENT_EXTRA3" }, check = "createFields" },
    AUTO_DROP = { cap = "autoDrop", inputs = { "IMPLEMENT_EXTRA4" }, check = "autoDrop" },
    RESET_BALE_COUNTER = { cap = "bales", inputs = { "BALE_COUNTER_RESET" }, check = "resetBales" },
    DOUBLED_RATE = { cap = "doubledRate", inputs = doubledRateKeys, check = "doubledRate" },
    SPRAY_RATE = { cap = "sprayRate", inputs = { "PRECISIONFARMING_SPRAY_AMOUNT" }, check = "sprayRate" },
    SPRAY_RATE_AUTO = { cap = "sprayRate", inputs = { "PRECISIONFARMING_SPRAY_AMOUNT_MODE" }, check = "sprayRateAuto" },
}

-- the first of these inputs with an active event on this object, one the
-- game shows first: a trailer's two tip keys are both active, and the game
-- shows one at a time, hiding the other (displayIsVisible false; spike
-- 0.0.8), which then does nothing (specs/0003 revision 3)
local function liveInputFor(object, inputs)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return nil
    end
    for _, shownOnly in ipairs({ true, false }) do
        for _, name in ipairs(inputs) do
            local action = binding.nameActions[name]
            local events = action ~= nil and binding.actionEvents[action] or nil
            if type(events) == "table" then
                for _, event in pairs(events) do
                    if type(event) == "table" and event.isActive ~= false and event.targetObject == object
                        and type(event.callback) == "function"
                        and not (shownOnly and event.displayIsVisible == false) then
                        return name
                    end
                end
            end
        end
    end
    return nil
end

local function nameOf(object)
    return Api.tryCall(object, "getFullName") or object.typeName or "tool"
end

-- one step of a job: this action on this tool, or why not (the game's own
-- words where it has them)
local function stepFor(object, depth, aim)
    local e = capsOf(object, depth)
    if not hasCap(e, aim.cap) then
        return nil, "can't " .. aim.cap
    end
    if e.canNow ~= nil and e.canNow[aim.cap] == false then
        return nil, e.whyNot ~= nil and e.whyNot[aim.cap] or "not allowed now"
    end
    return { object = object, aim = aim }
end

-- a job over these steps; the game's selection now is put back after
local function newJob(vehicle, steps, refused)
    local root = VehicleState.rootOf(vehicle)
    local selected = Api.tryCall(root, "getSelectedVehicle")
    local restore = nil
    for _, entry in ipairs(VehicleState.selectables(root)) do
        if entry.vehicle == selected then
            restore = entry.object
        end
    end
    return { vehicle = vehicle, root = root, steps = steps, i = 1, phase = "start", frames = 0,
        restore = restore, changed = false, refused = refused or {}, done = 0 }
end

-- presses an input action's events (defined with the actions below)
local runInputAction

-- Checked answers (specs/0003 revision 2) ------------------------------------
-- A fold, lower or turn on answers ok only once each tool started moving
-- the way the button asked, read every frame for up to CHECK_MS of game
-- time after the last press; else it names what didn't move, with the
-- game's words where it has them. Starting to move is enough: a fold
-- takes seconds, and the cab topic shows the rest.
Commands.CHECK_MS = 1000
-- the longest a check waits in all, whatever the game is still doing
Commands.CHECK_CAP_MS = 8000
-- the most frames the check waits while game time stands still (a paused game)
Commands.CHECK_MAX_FRAMES = 240

-- the tractor's attacher joint combo is still running: the game's Lower
-- all works through its joints one after another, the last when it ends,
-- `duration` after the press (2000 ms on the T7.300 and the Valtra S 286;
-- spike 0.0.7). Fields seen live in spike 0.0.7.
local function comboRunning(root)
    local spec = type(root) == "table" and root.spec_attacherJoints or nil
    local combos = type(spec) == "table" and spec.attacherJointCombos or nil
    return type(combos) == "table" and combos.isRunning == true
end

-- where the game's Lower all key goes next: the opposite of its own last
-- press, whatever the tools do since (live, 0.11.0: Lower all, each card's
-- Raise, Lower all again raised nothing); 1 lowering, -1 raising
-- (`direction`, spike 0.0.7), nil when it can't be read
local function comboNext(root)
    local spec = type(root) == "table" and root.spec_attacherJoints or nil
    local combos = type(spec) == "table" and spec.attacherJointCombos or nil
    local direction = type(combos) == "table" and combos.direction or nil
    if direction == 1 or direction == -1 then
        return -direction
    end
    return nil
end

-- the checks the All row's jobs make, by the readings' kind
local CHECKED = { lower = true, fold = true, turnOn = true, tip = true, cover = true }

-- the levels a tool could unload, summed (FillUnit's fillUnits)
local function unloadLevel(object)
    local spec = object.spec_fillUnit
    local sum = 0
    for _, unit in ipairs(type(spec) == "table" and type(spec.fillUnits) == "table" and spec.fillUnits or {}) do
        if type(unit) == "table" and unit.canBeUnloaded ~= false and type(unit.fillLevel) == "number" then
            sum = sum + unit.fillLevel
        end
    end
    return sum
end

-- what the check reads of a tool; the fold's time and direction seen live
-- (spikes 0.0.5, 0.0.6: the time grows while folding, foldMoveDirection 1
-- folding, -1 unfolding, 0 still)
local function readings(object)
    local fold = object.spec_foldable
    local e = VehicleState.extras(object, {})
    VehicleState.capabilities(object, e, 1)
    local fillUnit = object.spec_fillUnit
    local plow, rate = e.plow or {}, e.sprayRate or {}
    return {
        lowered = Api.tryCall(object, "getIsLowered", true) == true,
        on = Api.tryCall(object, "getIsTurnedOn") == true,
        unfolded = Api.tryCall(object, "getIsUnfolded"),
        foldTime = Api.tryCall(object, "getFoldAnimTime") or (type(fold) == "table" and fold.foldAnimTime or nil),
        foldDirection = type(fold) == "table" and fold.foldMoveDirection or nil,
        -- revision 3: Tip, as the cab reads it
        discharging = e.discharging,
        -- specs/0011: the sections on each side
        width = VehicleState.width(object),
        -- specs/0012: the card's states, as the cab reads them; Unload
        -- started (FillUnit) or the tank's level dropped
        rotated = plow.rotated,
        createFields = e.createFields,
        autoDrop = e.autoDrop,
        doubledRate = e.doubledRate,
        rateAuto = rate.auto,
        rateStep = rate.step,
        bales = e.bales ~= nil and e.bales.count or nil,
        unloading = type(fillUnit) == "table" and fillUnit.unloadingFillUnitsRunning == true,
        unloadLevel = unloadLevel(object),
        -- specs/0014: the pipe's target state (Pipe), the side's index
        -- (Trailer), the cover open (Cover), as the cab reads them
        pipeOut = (e.pipe or {}).out,
        tipSideIndex = (e.tipSide or {}).index,
        coverOpen = (e.cover or {}).open,
    }
end

-- specs/0012: the readings each switch's state is (what it asks for:
-- want), and what a one-shot starts
local SWITCHES = { rotate = "rotated", createFields = "createFields", autoDrop = "autoDrop",
    doubledRate = "doubledRate", sprayRateAuto = "rateAuto" }

-- the fold moves toward folded (sign 1) or unfolded (-1)
local function foldMoves(before, now, sign)
    if now.foldDirection == sign then
        return true
    end
    return type(before.foldTime) == "number" and type(now.foldTime) == "number"
        and (now.foldTime - before.foldTime) * sign > 0.001
end

local function moved(t, now)
    if t.kind == "fold" then
        if type(now.unfolded) == "boolean" and now.unfolded == not t.want then
            return true
        end
        return foldMoves(t.before, now, t.want and 1 or -1)
    elseif t.kind == "lower" then
        if now.lowered == t.want then
            return true
        end
        -- through its fold: lowering unfolds toward working, raising folds
        -- up, and getIsLowered stays true while it rises (spike 0.0.6)
        return VehicleState.foldLowers(t.object) and foldMoves(t.before, now, t.want and -1 or 1)
    elseif t.kind == "tip" then
        return now.discharging == t.want
    elseif t.kind == "width" then
        return now.width ~= nil and now.width[t.side] == t.want
    elseif SWITCHES[t.kind] ~= nil then
        return now[SWITCHES[t.kind]] == t.want
    elseif t.kind == "sprayRate" then
        return now.rateStep == t.want
    elseif t.kind == "resetBales" then
        return now.bales == 0
    elseif t.kind == "unload" then
        return now.unloading or now.unloadLevel < t.before.unloadLevel
    elseif t.kind == "pipe" then
        return now.pipeOut == t.want
    elseif t.kind == "tipSide" then
        return now.tipSideIndex ~= nil and now.tipSideIndex ~= t.before.tipSideIndex
    elseif t.kind == "cover" then
        -- a one-shot (a card's) flips it; Cover all asks open or closed
        if t.want == nil then
            return now.coverOpen ~= nil and now.coverOpen ~= t.before.coverOpen
        end
        return now.coverOpen == t.want
    end
    return now.on == t.want
end

-- what to check on a tool: kind (lower, fold, turnOn, ... the readings'),
-- want (lowered, folded, on...; nil for a one-shot), its readings now; cap:
-- the capability whose words a refusal gives (kind by default)
local function checkOf(object, depth, kind, want, cap)
    return { object = object, depth = depth, kind = kind, want = want, cap = cap or kind, before = readings(object) }
end

-- whether a tool is in the asked state, or on its way there (specs/0008):
-- want is lowered, folded, on, out or tipping. A fold moving counts by its
-- direction (1 folding, -1 unfolding; spikes 0.0.5, 0.0.6), so does a
-- tool that lowers through its fold (getIsLowered stays true while it
-- rises); the pipe by the state it moves to
local function isThere(kind, object, e, want)
    local fold = object.spec_foldable
    local direction = type(fold) == "table" and fold.foldMoveDirection or 0
    local moving = direction == 1 or direction == -1
    if kind == "fold" then
        if moving then
            return direction == (want and 1 or -1)
        end
        return type(e.unfolded) == "boolean" and e.unfolded == not want
    elseif kind == "lower" then
        if moving and VehicleState.foldLowers(object) then
            return direction == (want and -1 or 1)
        end
        return e.lowered == want
    elseif kind == "turnOn" then
        return e.turnedOn == want
    elseif kind == "pipe" then
        return e.pipe ~= nil and e.pipe.out == want
    elseif kind == "tip" then
        return e.discharging == want
    elseif kind == "rotate" then
        return e.plow ~= nil and e.plow.rotated == want
    elseif kind == "sprayRateAuto" then
        return e.sprayRate ~= nil and e.sprayRate.auto == want
    elseif kind == "createFields" or kind == "autoDrop" or kind == "doubledRate" then
        return e[kind] == want
    end
    return false
end

-- whether a key has a live event on any object
local function hasLive(name)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return false
    end
    local action = binding.nameActions[name]
    local events = action ~= nil and binding.actionEvents[action] or nil
    for _, event in pairs(type(events) == "table" and events or {}) do
        if type(event) == "table" and event.isActive ~= false and type(event.callback) == "function" then
            return true
        end
    end
    return false
end

-- a one-tool command: its job, or why not, or nil, nil, true when the tool
-- is in the asked state already (want: a set; nil: a one-shot); checked
-- where its aim says what to read (specs/0003 revision 2, 0012)
local function aimed(vehicle, aim, id, want)
    local object, depth = memberById(vehicle, id)
    if object == nil then
        return nil, "not attached"
    end
    local kind = aim.check or aim.cap
    if want ~= nil then
        local e = capsOf(object, depth)
        if hasCap(e, aim.cap) and isThere(kind, object, e, want) then
            return nil, nil, true
        end
    end
    local step, reason = stepFor(object, depth, aim)
    if step == nil then
        return nil, reason
    end
    local job = newJob(vehicle, { step })
    if aim.check ~= nil then
        job.check = { checkOf(object, depth, kind, want, aim.cap) }
    end
    return job
end

-- specs/0012: Precision Farming's rate one step down (-1) or up (1), its
-- value the key's input (the probe: one press with 1 stepped it 1 -> 2),
-- checked: ok once the step moved by one. The rate key does nothing while
-- automatic (inactive: the probe) or past an end: refused at once
local function rateJob(vehicle, id, value)
    local object, depth = memberById(vehicle, id)
    if object == nil then
        return nil, "not attached"
    end
    local step, reason = stepFor(object, depth, AIMED.SPRAY_RATE)
    if step == nil then
        return nil, reason
    end
    local rate = capsOf(object, depth).sprayRate
    if rate.auto then
        return nil, "Automatic rate is on"
    end
    if type(rate.step) ~= "number" then
        return nil, "no rate to read"
    end
    local want = rate.step + value
    if (type(rate.min) == "number" and want < rate.min) or (type(rate.max) == "number" and want > rate.max) then
        return nil, "at its limit"
    end
    step.value = value
    local job = newJob(vehicle, { step })
    job.check = { checkOf(object, depth, "sprayRate", want) }
    return job
end

-- the answer of a job that has nothing to do (specs/0008)
local ALREADY = {}

-- specs/0011: one section in (value -1) or out (1) on one side, by the
-- game's key for that side, checked: ok once that side moved by one. The
-- key takes the other sign: VariableWorkWidth.actionEventWorkWidthLeft /
-- Right set the side to side - inputValue (gameSource.zip; live, 0.17.2:
-- -1 on a full side moved nothing)
local function widthJob(vehicle, id, side, value)
    local object, depth = memberById(vehicle, id)
    if object == nil then
        return nil, "not attached"
    end
    local aim = side == "left" and AIMED.WIDTH_LEFT or AIMED.WIDTH_RIGHT
    local step, reason = stepFor(object, depth, aim)
    if step == nil then
        return nil, reason
    end
    local width = VehicleState.width(object)
    local want = width[side] + value
    if want < 0 or want > width[side .. "Max"] then
        return nil, "at its limit"
    end
    step.value = -value
    local job = newJob(vehicle, { step })
    local t = checkOf(object, depth, "width", want)
    t.side = side
    job.check = { t }
    return job
end

-- Tip all and Uncover all: the one-tool command on each that has the
-- capability and isn't there yet (value 1: tipping, open; 0: stopped,
-- closed), in driving order; Tip all checked (revision 3)
local function eachTool(aim, there)
    return function(vehicle, value)
        local want = value ~= 0
        local steps, refused, check = {}, {}, {}
        for _, m in ipairs(drivingOrder(vehicle)) do
            local e = capsOf(m.object, m.depth)
            if hasCap(e, aim.cap) and there(e) ~= want then
                local step, reason = stepFor(m.object, m.depth, aim)
                if step ~= nil then
                    steps[#steps + 1] = step
                    check[#check + 1] = checkOf(m.object, m.depth, aim.cap, want)
                else
                    refused[#refused + 1] = nameOf(m.object) .. ": " .. reason
                end
            end
        end
        local job = newJob(vehicle, steps, refused)
        if CHECKED[aim.cap] and #check > 0 then
            job.check = check
        end
        return job
    end
end

-- a step that presses one of the game's all-tools keys
local function allKeyStep(name)
    return { run = function()
        if runInputAction(name) > 0 then
            return name
        end
        return nil, "not available now"
    end }
end

-- The All row's tools with this capability, in driving order, and those
-- not in the asked state yet (specs/0008)
local function allTools(vehicle, cap, want)
    local tools, pending = {}, {}
    for _, m in ipairs(drivingOrder(vehicle)) do
        local e = capsOf(m.object, m.depth)
        if hasCap(e, cap) then
            local t = { object = m.object, depth = m.depth, e = e }
            tools[#tools + 1] = t
            if not isThere(cap, m.object, e, want) then
                pending[#pending + 1] = t
            end
        end
    end
    return tools, pending
end

-- each pending tool's own action toward the asked state, checked: where
-- the game's all-tools key would do something else
local function eachOwn(vehicle, pending, aim, want)
    local steps, refused, check = {}, {}, {}
    for _, t in ipairs(pending) do
        local step, reason = stepFor(t.object, t.depth, aim)
        if step ~= nil then
            steps[#steps + 1] = step
            check[#check + 1] = checkOf(t.object, t.depth, aim.cap, want)
        else
            refused[#refused + 1] = nameOf(t.object) .. ": " .. reason
        end
    end
    local job = newJob(vehicle, steps, refused)
    job.check = check
    return job
end

-- Lower all (value 1 lowered, 0 raised): the game's own key once (specs/0003
-- revision 2; spikes 0.0.5 and 0.0.6: the mod's press acts as Ctrl+V)
-- where it gives the asked state, checked: its next press goes the
-- opposite way of its last (comboNext; specs/0009), else, unreadable, it
-- lowers every tool while one is raised and raises them all. Otherwise, or with no live key, each
-- tool's Lower toward that state, in driving order, the selection put
-- back. Nil when no tool has Lower (a combine's header): the key,
-- unchecked.
local function lowerAllJob(vehicle, value)
    local lower = value == 1
    local tools, pending = allTools(vehicle, "lower", lower)
    if #tools == 0 then
        return nil
    end
    if #pending == 0 then
        return ALREADY
    end
    local anyRaised = false
    for _, t in ipairs(tools) do
        anyRaised = anyRaised or t.e.lowered ~= true
    end
    local nextWay = comboNext(VehicleState.rootOf(vehicle))
    local keyFits
    if nextWay ~= nil then
        keyFits = nextWay == (lower and 1 or -1)
    else
        keyFits = lower == anyRaised
    end
    if keyFits and hasLive("LOWER_ALL_IMPLEMENTS") then
        local job = newJob(vehicle, { allKeyStep("LOWER_ALL_IMPLEMENTS") })
        job.check = {}
        for _, t in ipairs(pending) do
            job.check[#job.check + 1] = checkOf(t.object, t.depth, "lower", lower)
        end
        return job
    end
    return eachOwn(vehicle, pending, AIMED.LOWER_IMPLEMENT, lower)
end

-- Turn on all (value 1 on, 0 off): the game's key flips every tool
-- (TurnOnVehicle.actionEventTurnOnAll: setIsTurnedOn(not getIsTurnedOn())),
-- so it's pressed once only when every tool needs it; otherwise each
-- pending tool's own turn on (specs/0009); checked
local function turnOnAllJob(vehicle, value)
    local on = value == 1
    local tools, pending = allTools(vehicle, "turnOn", on)
    if #tools == 0 then
        return newJob(vehicle, {}, { "nothing turns on" })
    end
    if #pending == 0 then
        return ALREADY
    end
    if #pending < #tools then
        return eachOwn(vehicle, pending, AIMED.TURN_ON_IMPLEMENT, on)
    end
    local job = newJob(vehicle, { allKeyStep("TURN_ON_ALL_IMPLEMENTS") })
    job.check = {}
    for _, t in ipairs(pending) do
        job.check[#job.check + 1] = checkOf(t.object, t.depth, "turnOn", on)
    end
    return job
end

-- Fold all (value 1 folded, 0 unfolded): the game's own key, once. It
-- goes the way the tool it's pressed on folds next, for that tool and
-- every tool whose next fold goes the same way (Foldable.actionEventFoldAll;
-- live 0.11.1: pressed on a folded one, it unfolded), so it's pressed on a
-- tool not in the asked state yet (specs/0009). Live (0.8.7) the key
-- folds no tool lowered on its joint ("Folding is not allowed while the
-- tool is lowered."); one that lowers through its fold it raises itself.
-- So, when folding, those are raised first (each one's Lower, as its card
-- does) and the key waits until the game lets them fold (at most
-- SETTLE_FRAMES). Pressed on the last one raised (it's selected then),
-- else the selected tool if it's pending, else the first pending. Only
-- pending tools are raised or pressed on: one in the asked state already
-- would turn the key the other way (live 0.16.0: the game's Lower all
-- lowered the front mower folded; pressed on it, Fold all unfolded it and
-- left the rear one). Folding ends everything folded and up (Vincent,
-- 0.16.2): a folded tool still lowered on its joint is raised by its
-- Lower, checked, never by the key; with nothing to fold, only that.
local function foldAllJob(vehicle, value)
    local folding = value == 1
    local tools, pending = allTools(vehicle, "fold", folding)
    if #tools == 0 then
        return newJob(vehicle, {}, { "nothing folds" })
    end
    local isPending = {}
    for _, t in ipairs(pending) do
        isPending[t] = true
    end
    -- folded already but lowered on its joint (the game's Lower all lowers
    -- a folded front mower): raised by its Lower
    local stowed, stowedBlocked = {}, {}
    for _, t in ipairs(folding and tools or {}) do
        local e = t.e
        if not isPending[t] and e.lowered == true and hasCap(e, "lower")
            and not VehicleState.foldLowers(t.object) then
            if e.canNow ~= nil and e.canNow.lower == false then
                stowedBlocked[#stowedBlocked + 1] = e.whyNot ~= nil and e.whyNot.lower or "not allowed now"
            else
                stowed[#stowed + 1] = t
            end
        end
    end
    if #pending == 0 and #stowed == 0 then
        if #stowedBlocked > 0 then
            return newJob(vehicle, {}, { stowedBlocked[1] })
        end
        return ALREADY
    end
    local steps, check = {}, {}
    for _, t in ipairs(stowed) do
        steps[#steps + 1] = { object = t.object, aim = AIMED.LOWER_IMPLEMENT, quiet = true }
        check[#check + 1] = checkOf(t.object, t.depth, "lower", false)
    end
    if #pending == 0 then
        local job = newJob(vehicle, steps)
        job.check = check
        return job
    end
    local selected = Api.tryCall(VehicleState.rootOf(vehicle), "getSelectedVehicle")
    local at = nil
    for _, t in ipairs(pending) do
        if t.object == selected or at == nil then
            at = t.object
        end
    end
    local raised, blocked = {}, {}
    for _, t in ipairs(pending) do
        local e = t.e
        if folding and e.lowered == true and hasCap(e, "lower") and e.canNow ~= nil and e.canNow.fold == false
            and e.canNow.lower ~= false and not VehicleState.foldLowers(t.object) then
            steps[#steps + 1] = { object = t.object, aim = AIMED.LOWER_IMPLEMENT, quiet = true }
            raised[#raised + 1] = t
            at = t.object
        elseif e.canNow ~= nil and e.canNow.fold == false then
            blocked[#blocked + 1] = e.whyNot ~= nil and e.whyNot.fold or "not allowed now"
        end
    end
    -- none the game lets fold (the engine off): its words, nothing pressed
    if #blocked == #pending then
        return newJob(vehicle, {}, { blocked[1] })
    end
    local aim = { cap = "fold", inputs = { "FOLD_ALL_IMPLEMENTS" } }
    steps[#steps + 1] = { object = at, aim = aim, ready = function()
        for _, t in ipairs(raised) do
            local e = capsOf(t.object, t.depth)
            if e.canNow ~= nil and e.canNow.fold == false then
                return false
            end
        end
        return true
    end }
    local job = newJob(vehicle, steps)
    job.check = check
    for _, t in ipairs(pending) do
        job.check[#job.check + 1] = checkOf(t.object, t.depth, "fold", folding)
    end
    return job
end

-- The lights (specs/0008): the light key steps through the stages, then
-- off (C1); pressed once a frame and the stage read after each, until it
-- shows the asked one, at most stages + 1 presses.
local function lightsJob(vehicle, want, stages)
    local job = { presses = 0 }
    job.tick = function()
        if lightStage(vehicle) == want then
            return { ok = true, via = job.via }
        end
        if job.presses > (stages or 1) then
            return { ok = false, reason = string.format("lights didn't reach stage %d", want), via = job.via }
        end
        job.presses = job.presses + 1
        if runInputAction("TOGGLE_LIGHTS") > 0 then
            job.via = "TOGGLE_LIGHTS"
            return nil
        end
        return { ok = false, reason = "not available now", via = job.via }
    end
    return job
end

-- The game speed (specs/0017): not a vehicle's. The game's 7 (DECREASE_
-- TIMESCALE) and 8 (INCREASE_TIMESCALE; FS25's inputBindingDefault_
-- KeyboardMouse.xml) step through its list; pressed once a frame, the
-- speed read after each, until it shows the asked one: at most as many
-- presses as there are steps. A press after which the speed doesn't move
-- within TIME_SCALE_WAIT_FRAMES ends it ("didn't move"); no live key ends
-- it before anything is pressed.
Commands.TIME_SCALE_WAIT_FRAMES = 10

local function sameSpeed(a, b)
    return type(a) == "number" and type(b) == "number" and math.abs(a - b) < 0.001
end

-- the game's step for this value (the file's 0.500 is x0.5), or nil
local function timeScaleStep(value)
    for _, v in ipairs(Api.timeScaleSteps() or {}) do
        if sameSpeed(v, value) then
            return v
        end
    end
    return nil
end

local function timeScaleKey(now, want)
    return want > now and "INCREASE_TIMESCALE" or "DECREASE_TIMESCALE"
end

local function timeScaleJob(_, value)
    local want = timeScaleStep(value)
    local now = Api.timeScale()
    if now == nil then
        return nil, "no speed to read"
    end
    if not hasLive(timeScaleKey(now, want)) then
        return nil, "not available now"
    end
    local job = { presses = 0, waited = 0, limit = #(Api.timeScaleSteps() or {}) }
    job.tick = function()
        local speed = Api.timeScale()
        if sameSpeed(speed, want) then
            return { ok = true, via = job.via, checked = true }
        end
        if job.pressedAt ~= nil and sameSpeed(speed, job.pressedAt) then
            job.waited = job.waited + 1
            if job.waited >= Commands.TIME_SCALE_WAIT_FRAMES then
                return { ok = false, reason = "didn't move", via = job.via, checked = true }
            end
            return nil
        end
        if speed == nil then
            return { ok = false, reason = "no speed to read", via = job.via, checked = true }
        end
        if job.presses >= job.limit then
            return { ok = false, reason = "didn't reach the speed", via = job.via, checked = true }
        end
        local key = timeScaleKey(speed, want)
        if runInputAction(key) == 0 then
            return { ok = false, reason = "not available now", via = job.via }
        end
        job.presses, job.waited, job.pressedAt, job.via = job.presses + 1, 0, speed, key
        return nil
    end
    return job
end

-- Attach: only while the game has something in reach (its prompt is up)
local function attachInReach(vehicle)
    if VehicleState.attachable(vehicle) then
        return true
    end
    return false, "nothing in reach"
end

-- Lower all needs power: with the engine off lowering only got the game's
-- "Please start the engine first" (live, 0.8.9); one answer for all
local function powered(vehicle)
    local can, why = VehicleState.powered(VehicleState.rootOf(vehicle))
    if can == false then
        return false, why or "not allowed now"
    end
    return true
end

-- Actions ------------------------------------------------------------------
-- The actions a command may run, by the dashboard's name (specs/0007): the
-- one list. Anything else is refused, and so is a value that doesn't fit.
--   inputs     input actions tried in order, the first with an active
--              event wins; or function(vehicle) -> list
--   direct     a setter, only where the game has no key (specs/0009)
--   when       function(vehicle) -> ok, reason: refused unless ok
--   state      function(vehicle) -> the state now (specs/0008): the command's
--              value is the one it asks for; already there, nothing runs
--   fits       function(vehicle, value) -> whether the value fits this vehicle
--   tool       the command carries a tool's id (the cab's rig) and asks
--              that tool for a state (value 1 or 0) with `aim`
--   aim        with a tool's id (specs/0003): select it, press the key, put
--              the selection back (AIMED); aimOnly: the selected tool's id
--              when the command has none
--   job        function(vehicle, value) -> a job over several tools, or
--              ALREADY
--   width      with a tool's id and a side ("left", "right"): the only
--              action with a side (specs/0011)
--   rate       with a tool's id: Precision Farming's rate a step down or
--              up (specs/0012)
--   values     { min, max }: the command's number and its range; without
--              it the command carries none (a tool's one-shot); whole: a
--              whole number; step: not 0
--   optional   the number may be left out (a tool's id: the key's own tool)
-- No command carries a key: the dashboard has a fixed list of buttons, no
-- list of the keys the game registered (specs/0012, rule 4)
local TOOL_ID = { 0, 2 ^ 31 }
-- a state: 1 on, 0 off
local SET = { 0, 1, whole = true }

Commands.ACTIONS = {
    -- the light stage, 0 off (0 or 1 without stages)
    ["lights.set"] = { state = lightStage, values = { 0, 16, whole = true },
        fits = function(vehicle, value)
            local lights = VehicleState.lights(vehicle)
            return value <= (lights ~= nil and lights.stages or 1)
        end,
        job = function(vehicle, value)
            local lights = VehicleState.lights(vehicle)
            return lightsJob(vehicle, value, lights ~= nil and lights.stages or nil)
        end },
    ["highBeam.set"] = { state = lightSwitch("high"), values = SET, inputs = { "TOGGLE_HIGH_BEAM_LIGHT" } },
    ["beacon.set"] = { state = lightSwitch("beacon"), values = SET, inputs = { "TOGGLE_BEACON_LIGHTS" } },
    ["hazard.set"] = { state = lightSwitch("hazard"), values = SET, inputs = { "TOGGLE_TURNLIGHT_HAZARD" } },
    ["turnLeft.set"] = { state = lightSwitch("left"), values = SET, inputs = { "TOGGLE_TURNLIGHT_LEFT" } },
    ["turnRight.set"] = { state = lightSwitch("right"), values = SET, inputs = { "TOGGLE_TURNLIGHT_RIGHT" } },
    ["engine.set"] = { state = engineState, values = SET, inputs = { "TOGGLE_MOTOR_STATE" } },
    ["cruiseOn.set"] = { state = cruiseOn, values = SET, inputs = { "TOGGLE_CRUISE_CONTROL" } },
    -- an absolute set speed in km/h: the dashboard's −/+ while held
    ["cruise.set"] = { direct = cruiseSet, values = { 1, 250 } },
    ["ai.set"] = { state = aiState, values = SET, inputs = { "TOGGLE_AI" } },
    -- one tool's state by its id (specs/0008): lowered, folded, on, pipe
    -- out, tipping
    ["tool.lower"] = { tool = true, aim = AIMED.LOWER_IMPLEMENT, values = SET },
    ["tool.fold"] = { tool = true, aim = AIMED.FOLD_IMPLEMENT, values = SET },
    ["tool.turnOn"] = { tool = true, aim = AIMED.TURN_ON_IMPLEMENT, values = SET },
    ["tool.pipe"] = { tool = true, aim = AIMED.TOGGLE_PIPE, values = SET },
    ["tool.tip"] = { tool = true, aim = AIMED.TOGGLE_DISCHARGE, values = SET },
    -- one section in (-1) or out (1) on one side (specs/0011)
    ["tool.width"] = { tool = true, width = true, values = { -1, 1, whole = true, step = true } },
    -- specs/0012, each on its tool by its id: a plow's rotation (1 rotated)
    -- and create fields (1 on), a baler's automatic drop (1 on), a slurry
    -- tanker's doubled rate (1 on), Precision Farming's automatic rate (1
    -- automatic) and its step (-1, 1); one-shots: Unload, Reset bale count
    ["tool.unload"] = { tool = true, aim = AIMED.UNLOAD },
    ["tool.rotate"] = { tool = true, aim = AIMED.ROTATE_PLOW, values = SET },
    ["tool.createFields"] = { tool = true, aim = AIMED.LIMIT_TO_FIELD, values = SET },
    ["tool.autoDrop"] = { tool = true, aim = AIMED.AUTO_DROP, values = SET },
    ["tool.resetBales"] = { tool = true, aim = AIMED.RESET_BALE_COUNTER },
    ["tool.doubledRate"] = { tool = true, aim = AIMED.DOUBLED_RATE, values = SET },
    ["tool.sprayRate"] = { tool = true, rate = true, values = { -1, 1, whole = true, step = true } },
    ["tool.sprayRateAuto"] = { tool = true, aim = AIMED.SPRAY_RATE_AUTO, values = SET },
    -- Attach (specs/0003): the attach key (Q), only while the game has
    -- something in reach; detaching is each card's Detach. (C2's first try
    -- ran DETACH for an attached implement, which isn't what Q does.)
    ["hitch.toggle"] = { when = attachInReach, inputs = { "ATTACH" } },
    -- C3: the value is the tool's id (the cab's rig)
    ["implement.select"] = { direct = selectTarget, values = TOOL_ID },
    -- G and its other way
    ["implement.next"] = { inputs = { "SWITCH_IMPLEMENT" } },
    ["implement.previous"] = { inputs = { "SWITCH_IMPLEMENT_BACK" } },
    ["implement.detach"] = { direct = detachTarget, values = TOOL_ID },
    -- the cover (N): a one-shot, its rigs not confirmed (specs/0003)
    ["implement.cover"] = { inputs = { "TOGGLE_COVER" }, aim = AIMED.TOGGLE_COVER,
        values = TOOL_ID, optional = true },
    -- the Vehicle page's cards (specs/0003): one tool's tip side
    ["implement.tipSide"] = { aim = AIMED.TOGGLE_TIPSIDE, aimOnly = true, values = TOOL_ID, optional = true },
    -- the All row, each with the state it asks for (specs/0008; value 1:
    -- lowered, folded, on, tipping, open): the game's own key where it
    -- gives that state, else each tool's own (fold all raises what's
    -- lowered first); tip and cover all act on each in turn. Lower all
    -- with no tool that lowers (a combine's header): Ctrl+V
    ["implement.lowerAll"] = { when = powered, job = lowerAllJob, inputs = { "LOWER_ALL_IMPLEMENTS" }, values = SET },
    ["implement.foldAll"] = { job = foldAllJob, values = SET },
    ["implement.turnOnAll"] = { job = turnOnAllJob, values = SET },
    ["implement.tipAll"] = { job = eachTool(AIMED.TOGGLE_DISCHARGE, function(e) return e.discharging == true end),
        values = { 0, 1 } },
    ["implement.coverAll"] = { job = eachTool(AIMED.TOGGLE_COVER, function(e) return e.cover ~= nil and e.cover.open == true end),
        values = { 0, 1 } },
    -- specs/0017: the game speed, one of the game's steps; not tied to a
    -- vehicle (`game`: runs on foot too)
    ["timeScale.set"] = { game = true, values = { 0, 100000 }, state = Api.timeScale,
        fits = function(_, value) return timeScaleStep(value) ~= nil end, job = timeScaleJob },
    -- the Harvester screen: 1 straw swath, 0 chopper (the game's TOGGLE_CHOPPER)
    ["straw.set"] = { state = strawState, values = SET, inputs = { "TOGGLE_CHOPPER" } },
}

-- whether the command's number fits its action
local function inRange(range, value)
    -- value ~= value: NaN
    return value == value and value >= range[1] and value <= range[2]
        and (not range.whole or value == math.floor(value)) and not (range.step and value == 0)
end

local SIDES = { left = true, right = true }

-- whether the command's number, tool and side fit its action; a key fits
-- none (specs/0012: implement.key went, an older companion may still write
-- one)
local function valueFits(spec, value, tool, side, key)
    if key ~= nil then
        return false
    end
    if spec.width then
        if not SIDES[side] or value == 0 then
            return false
        end
    elseif side ~= nil then
        return false
    end
    if spec.tool then
        if tool == nil or not inRange({ TOOL_ID[1], TOOL_ID[2], whole = true }, tool) then
            return false
        end
    elseif tool ~= nil then
        return false
    end
    if spec.values == nil then
        return value == nil
    end
    if value == nil then
        return spec.optional == true
    end
    return inRange(spec.values, value)
end

local ATTRIBUTES = { "session", "id", "action", "ref", "value", "tool", "side", "key" }

function Commands.new(dir, sessionId, log)
    local self = setmetatable({}, Commands)
    self.dir = dir
    self.sessionId = sessionId
    self.log = log or print
    self.nextId = 1
    self.failing = false
    -- "<action> via <what>" already logged
    self.logged = {}
    if createFolder ~= nil then
        pcall(createFolder, dir)
    end
    return self
end

-- for hello: where the companion writes, which number the mod reads next
-- (a companion that starts mid-session continues from there), and that the
-- files name the dashboard's set actions (actions 3, specs/0008)
function Commands:info()
    return { dir = self.dir, next = self.nextId, actions = 3 }
end

function Commands:path(id)
    return string.format("%s%d.xml", self.dir, id)
end

local function exists(path)
    if fileExists == nil then
        return false
    end
    local ok, found = pcall(fileExists, path)
    return ok and found == true
end

local function readCommand(path)
    if XMLFile == nil or XMLFile.load == nil then
        return nil, "no XMLFile"
    end
    local xml = XMLFile.load("companionCommand", path)
    if xml == nil then
        return nil, "unreadable command file"
    end
    local out = {}
    for _, name in ipairs(ATTRIBUTES) do
        out[name] = xml:getString("command#" .. name)
    end
    xml:delete()
    return out
end

-- the active action events' callbacks, called as a key press would:
-- callback(target, actionName, inputValue, callbackState, isAnalog,
-- isMouse, deviceCategory, binding); with target, only that object's.
-- Returns how many ran.
function runInputAction(name, value, target)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return 0
    end
    local action = binding.nameActions[name]
    local events = action ~= nil and binding.actionEvents[action] or nil
    if type(events) ~= "table" then
        return 0
    end
    local called = 0
    for _, event in pairs(events) do
        if type(event) == "table" and type(event.callback) == "function" and event.isActive ~= false
            and (target == nil or event.targetObject == target) then
            local ok = pcall(event.callback, event.targetObject, name, value or 1, event.callbackState,
                false, false, nil, nil)
            if ok then
                called = called + 1
            end
        end
    end
    return called
end

-- returns ok, reason, via, or a job (specs/0003) as the fourth, or
-- already (specs/0008) as the fifth; value: the command's number, if it has
-- one; tool: its tool's id; side: tool.width's; key: refused (specs/0012)
local function run(actionName, value, tool, side, key)
    local spec = Commands.ACTIONS[actionName]
    if spec == nil then
        return false, "action not allowed"
    end
    if not valueFits(spec, value, tool, side, key) then
        return false, "value not allowed"
    end
    -- the game's, not a vehicle's (specs/0017): before the vehicle check
    if spec.game then
        if not spec.fits(nil, value) then
            return false, "value not allowed"
        end
        if sameSpeed(spec.state(), value) then
            return true, nil, nil, nil, true
        end
        local job, why = spec.job(nil, value)
        if job == nil then
            return false, why
        end
        return nil, nil, nil, job
    end
    local vehicle = Api.controlledVehicle()
    if vehicle == nil then
        return false, "not in a vehicle"
    end
    if spec.when ~= nil then
        local ok, why = spec.when(vehicle)
        if not ok then
            return false, why
        end
    end
    if spec.fits ~= nil and not spec.fits(vehicle, value) then
        return false, "value not allowed"
    end
    if spec.state ~= nil and spec.state(vehicle) == value then
        return true, nil, nil, nil, true
    end
    if spec.width or spec.rate then
        local job, why
        if spec.width then
            job, why = widthJob(vehicle, tool, side, value)
        else
            job, why = rateJob(vehicle, tool, value)
        end
        if job == nil then
            return false, why
        end
        return nil, nil, nil, job
    end
    if spec.tool then
        -- a set asks for a state (1 or 0); a one-shot carries no value
        local want = nil
        if spec.values ~= nil then
            want = value == 1
        end
        local job, why, already = aimed(vehicle, spec.aim, tool, want)
        if already then
            return true, nil, nil, nil, true
        end
        if job == nil then
            return false, why
        end
        return nil, nil, nil, job
    end
    if spec.aim ~= nil and (value ~= nil or spec.aimOnly) then
        if value == nil then
            local selected = Api.tryCall(VehicleState.rootOf(vehicle), "getSelectedVehicle")
            value = type(selected) == "table" and selected.id or nil
        end
        local job, why = aimed(vehicle, spec.aim, value)
        if job == nil then
            return false, why
        end
        return nil, nil, nil, job
    end
    -- a job, unless it has none for this rig (then as below)
    local job = spec.job ~= nil and spec.job(vehicle, value) or nil
    if job == ALREADY then
        return true, nil, nil, nil, true
    end
    if job ~= nil then
        return nil, nil, nil, job
    end
    local reason
    if spec.direct ~= nil then
        local done
        done, reason = spec.direct(vehicle, nil, value)
        if done then
            return true, nil, "setter"
        end
    end
    local inputs = spec.inputs
    if type(inputs) == "function" then
        inputs = inputs(vehicle)
    end
    for _, name in ipairs(inputs or {}) do
        if runInputAction(name) > 0 then
            return true, nil, name
        end
    end
    return false, reason or "not available now"
end

-- the selectable entry for this object, to select it
local function selectableFor(root, object)
    for _, entry in ipairs(VehicleState.selectables(root)) do
        if entry.vehicle == object then
            return entry.object
        end
    end
    return nil
end

-- the step's key on its own tool, if the tool has it live, else (lower)
-- the key of what it hangs on while the tool is selected: its name
local function press(step, root)
    local targets = { step.object }
    if step.aim.attacherKey and Api.tryCall(root, "getSelectedVehicle") == step.object then
        targets[#targets + 1] = Api.tryCall(step.object, "getAttacherVehicle")
    end
    local inputs = step.aim.inputs
    if type(inputs) == "function" then
        inputs = inputs(step.object)
    end
    for _, target in ipairs(targets) do
        local name = type(target) == "table" and liveInputFor(target, inputs) or nil
        if name ~= nil and runInputAction(name, step.value or 1, target) > 0 then
            return name
        end
    end
    return nil
end

-- frames a step with `ready` waits for it before its key (fold all, for
-- what it raised first: lowering takes about a second)
Commands.SETTLE_FRAMES = 120

-- a step's key acted: the ack names it, unless the step only
-- prepares the next (`quiet`: fold all's raising)
local function acted(job, step, via)
    job.done = job.done + 1
    if job.via == nil or (job.viaQuiet and not step.quiet) then
        job.via, job.viaQuiet = via, step.quiet == true
    end
end

-- a step that can't press its key: refused
local function giveUp(job, step, why)
    job.refused[#job.refused + 1] = #job.steps > 1 and (nameOf(step.object) .. ": " .. why) or why
end

-- one frame of a job: press the keys that are live, select the next tool
-- and wait for its key; at the end put the selection back. Returns the
-- ack's fields once done.
-- the check's frame: true while a tool may still start moving. The 1 s
-- counts from the press, or from the end of the tractor's combo while it
-- runs; at most CHECK_CAP_MS in all, or CHECK_MAX_FRAMES while game time
-- stands still
local function checking(job)
    local now = type(g_time) == "number" and g_time or nil
    if job.checkFrames == nil then
        job.checkStart, job.checkFrom, job.checkFrames, job.stalled = now, now, 0, 0
    end
    job.checkFrames = job.checkFrames + 1
    if now == nil or now == job.lastNow then
        job.stalled = job.stalled + 1
    end
    job.lastNow = now
    local waiting = false
    for _, t in ipairs(job.check) do
        if not t.moved then
            t.moved = moved(t, readings(t.object))
            waiting = waiting or not t.moved
        end
    end
    if not waiting then
        return false
    end
    if comboRunning(job.root) then
        job.checkFrom = now
    end
    local timeUp = (now ~= nil and job.checkFrom ~= nil and now - job.checkFrom >= Commands.CHECK_MS)
        or (now ~= nil and job.checkStart ~= nil and now - job.checkStart >= Commands.CHECK_CAP_MS)
        or job.stalled > Commands.CHECK_MAX_FRAMES
    return not timeUp
end

-- the tools that didn't move, each with the game's words where it has
-- them, and the reason the ack gives for them
local function unmovedOf(job)
    local out, reasons = {}, {}
    for _, t in ipairs(job.check) do
        if not t.moved then
            local e = capsOf(t.object, t.depth)
            local why = e.whyNot ~= nil and e.whyNot[t.cap or t.kind] or "Nothing moved"
            out[#out + 1] = { id = t.object.id, name = nameOf(t.object), why = why }
            reasons[#reasons + 1] = #job.check > 1 and (nameOf(t.object) .. ": " .. why) or why
        end
    end
    return out, reasons
end

local function stepJob(job)
    -- a job that runs frame by frame by itself (the lights)
    if job.tick ~= nil then
        return job.tick(job)
    end
    while true do
        local step = job.steps[job.i]
        if step == nil then
            if job.changed and job.restore ~= nil and not job.restored then
                job.root:setSelectedObject(job.restore)
                job.restored = true
            end
            -- something was pressed: wait until the tools moved, or the time is up
            if job.check ~= nil and job.done > 0 and checking(job) then
                return nil
            end
            local refused, unmoved = job.refused, nil
            if job.check ~= nil then
                local reasons
                unmoved, reasons = unmovedOf(job)
                if job.done > 0 then
                    refused = {}
                    for _, r in ipairs(job.refused) do
                        refused[#refused + 1] = r
                    end
                    for _, r in ipairs(reasons) do
                        refused[#refused + 1] = r
                    end
                else
                    unmoved = {}
                end
            end
            return {
                ok = (job.done > 0 or (#job.steps == 0 and #job.refused == 0)) and (unmoved == nil or #unmoved == 0),
                reason = #refused > 0 and table.concat(refused, "; ") or nil,
                via = job.via,
                checked = job.check ~= nil or nil,
                unmoved = unmoved,
            }
        end
        if step.ready ~= nil and not step.ready() and (step.waited or 0) < Commands.SETTLE_FRAMES then
            step.waited = (step.waited or 0) + 1
            return nil
        end
        -- a step that runs by itself (an all-tools key), else the tool's key
        local name = step.run == nil and press(step, job.root) or nil
        if step.run ~= nil then
            local via, why = step.run(job)
            if via ~= nil then
                acted(job, step, via)
            else
                job.refused[#job.refused + 1] = why or "not available now"
            end
            job.i = job.i + 1
        elseif name ~= nil then
            acted(job, step, name)
            job.i, job.phase = job.i + 1, "start"
        elseif job.phase == "start" then
            local entry = selectableFor(job.root, step.object)
            if entry ~= nil and type(job.root.setSelectedObject) == "function" then
                job.root:setSelectedObject(entry)
                job.changed = true
                job.phase, job.frames = "wait", 0
                return nil
            end
            giveUp(job, step, "not available now")
            job.i = job.i + 1
        else
            job.frames = job.frames + 1
            if job.frames < Commands.KEY_WAIT_FRAMES then
                return nil
            end
            giveUp(job, step, "not available now")
            job.i, job.phase = job.i + 1, "start"
        end
    end
end

-- logs "<action> via <what>" the first time
function Commands:logVia(action, via)
    if via ~= nil then
        local key = tostring(action) .. " via " .. via
        if not self.logged[key] then
            self.logged[key] = true
            self.log("command " .. key)
        end
    end
end

-- the running job's frame: its ack once it's done
function Commands:step()
    local job = self.job
    local ok, result = pcall(stepJob, job)
    if not ok then
        self.job = nil
        if not self.failing then
            self.log(string.format("command %s failed: %s", tostring(job.ack.action), tostring(result)))
            self.failing = true
        end
        return { id = job.ack.id, ref = job.ack.ref, action = job.ack.action, ok = false, reason = "failed in game" }
    end
    if result == nil then
        return nil
    end
    self.job = nil
    self:logVia(job.ack.action, result.via)
    return { id = job.ack.id, ref = job.ack.ref, action = job.ack.action, ok = result.ok,
        reason = not result.ok and (result.reason or "failed") or result.reason, via = result.via,
        checked = result.checked, unmoved = result.unmoved }
end

-- frames a command file the game can't open is tried before it's given up
Commands.READ_TRIES = 10

-- Called every frame. Returns the ack for a command run this frame, or nil.
-- Reads at most one command per frame, and none while a job runs.
function Commands:poll()
    if self.job ~= nil then
        return self:step()
    end
    local path = self:path(self.nextId)
    if not exists(path) then
        return nil
    end
    local id = self.nextId
    local ok, cmd, err = pcall(readCommand, path)
    if not ok or cmd == nil then
        -- live (0.9.0): "Sharing violation" while something else had the
        -- file open; read it again next frame, and only after READ_TRIES
        -- frames move on (a bad file must not stop the queue)
        self.readTries = (self.readTries or 0) + 1
        if self.readTries < Commands.READ_TRIES then
            return nil
        end
        self.readTries = 0
        self.nextId = id + 1
        return { id = id, ok = false, reason = tostring(err or cmd) }
    end
    self.readTries = 0
    if cmd.session ~= self.sessionId then
        -- left over from an earlier game session: not this session's
        -- command <id>, which the companion will still write
        if deleteFile ~= nil then
            pcall(deleteFile, path)
        end
        if exists(path) then
            self.nextId = id + 1
        end
        return nil
    end
    self.nextId = id + 1
    local ran, reason, via, job, already
    ok, ran, reason, via, job, already = pcall(run, cmd.action, tonumber(cmd.value), tonumber(cmd.tool), cmd.side, cmd.key)
    if ok and job ~= nil then
        job.ack = { id = id, ref = cmd.ref, action = cmd.action }
        self.job = job
        return self:step()
    end
    if not ok then
        if not self.failing then
            self.log(string.format("command %s failed: %s", tostring(cmd.action), tostring(ran)))
            self.failing = true
        end
        ran, reason, via = false, "failed in game", nil
    end
    self:logVia(cmd.action, via)
    return {
        id = id,
        ref = cmd.ref,
        action = cmd.action,
        ok = ran == true,
        reason = ran ~= true and (reason or "failed") or nil,
        via = via,
        already = already or nil,
    }
end
