-- state/Tools.lua
-- What each tool shows and can do: lower, fold, turn on, the Implement
-- screen's extras, the capabilities (specs/0003) and the selected tool's
-- keys. All guarded.

Companion = Companion or {}

local Api = Companion.Api

-- the one VehicleState table, filled by the files in state/ (specs/0009)
local VehicleState = Companion.VehicleState or {}
Companion.VehicleState = VehicleState

-- Implements ---------------------------------------------------------------
-- The implement the game's implement keys act on (lower, fold, turn on):
-- the selected one, else the first one attached. These names follow the
-- FS22 specs (selection, Foldable, TurnOnVehicle, Attachable) and are not
-- verified in FS25 yet; all guarded.

function VehicleState.selectedImplement(vehicle)
    local selected = Api.tryCall(vehicle, "getSelectedVehicle")
    if type(selected) == "table" and selected ~= vehicle then
        return selected
    end
    local implement = Api.tryCall(vehicle, "getSelectedImplement")
    if type(implement) == "table" and type(implement.object) == "table" and implement.object ~= vehicle then
        return implement.object
    end
    local attached = Api.tryCall(vehicle, "getAttachedImplements")
    if type(attached) == "table" then
        for _, entry in pairs(attached) do
            if type(entry) == "table" and type(entry.object) == "table" then
                return entry.object
            end
        end
    end
    return nil
end

-- whether a fold animation runs right now
local function foldMoving(object, spec)
    local parts = spec.foldingParts
    local asked = false
    if type(parts) == "table" then
        for _, part in pairs(parts) do
            if type(part) == "table" and part.animationName ~= nil then
                local playing = Api.tryCall(object, "getIsAnimationPlaying", part.animationName)
                if playing == true then
                    return true
                end
                asked = asked or playing == false
            end
        end
    end
    if asked then
        return false
    end
    -- no animation API: between the two ends counts as moving
    local t = spec.foldAnimTime
    return type(t) == "number" and t > 0.001 and t < 0.999
end

-- what the implement controls show for one implement
function VehicleState.implement(object)
    local out = {
        name = Api.tryCall(object, "getFullName") or object.typeName,
        lowered = Api.tryCall(object, "getIsLowered", true) == true,
        turnedOn = Api.tryCall(object, "getIsTurnedOn") == true,
        canTurnOn = object.spec_turnOnVehicle ~= nil,
    }
    local allows = Api.tryCall(object, "getAllowsLowering")
    out.canLower = allows ~= false
    out.foldable = VehicleState.fold(object, out)
    return out
end

-- an object that folds (a tool, or a combine itself): sets unfolded and
-- foldMoving on out and returns true; false when it doesn't fold
function VehicleState.fold(object, out)
    local foldable = object.spec_foldable
    if foldable == nil or (type(foldable.foldingParts) == "table" and next(foldable.foldingParts) == nil) then
        return false
    end
    local unfolded = Api.tryCall(object, "getIsUnfolded")
    if type(unfolded) == "boolean" then
        out.unfolded = unfolded
    end
    out.foldMoving = foldMoving(object, foldable)
    return true
end

-- Implement screen (2026-10-24) ----------------------------------------------
-- What its buttons and tiles show beyond lower, fold and turn on: a pipe
-- (combines), whether it discharges (a trailer tipping, a combine
-- unloading), a cover, and whether it's a trailer. Names from the game's
-- own scripts (the SDK's gameSource.zip: Pipe, Dischargeable, Trailer,
-- Cover); still guarded.

-- Dischargeable.DISCHARGE_STATE_OFF
local DISCHARGE_OFF = 0

function VehicleState.extras(object, out)
    local pipe = object.spec_pipe
    if type(pipe) == "table" and pipe.hasMovablePipe == true and type(pipe.targetState) == "number" then
        -- state 1 is in, the others out; currentState is 0 while it moves
        out.pipe = { out = pipe.targetState > 1, moving = pipe.currentState ~= pipe.targetState }
    end
    if type(object.spec_dischargeable) == "table" then
        local state = Api.tryCall(object, "getDischargeState")
        if type(state) ~= "number" then
            state = object.spec_dischargeable.currentDischargeState
        end
        if type(state) == "number" then
            out.discharging = state ~= DISCHARGE_OFF
        end
    end
    if object.spec_trailer ~= nil then
        out.trailer = true
    end
    local cover = object.spec_cover
    if type(cover) == "table" and cover.hasCovers == true and type(cover.state) == "number" then
        -- 0 closed, else the open cover's index
        out.cover = { open = cover.state ~= 0 }
    end
    -- a combine that can lay its straw in a swath or chop it (Combine.lua:
    -- TOGGLE_CHOPPER is offered only when both are available)
    local combine = object.spec_combine
    if type(combine) == "table" and type(combine.swath) == "table" and type(combine.chopper) == "table"
        and combine.swath.isAvailable == true and combine.chopper.isAvailable == true then
        out.straw = { swath = combine.isSwathActive == true }
    end
    return out
end

-- Capabilities (specs/0003) -------------------------------------------------
-- What each rig member can do, read from the game's own parts, so a tool
-- the dashboard has never seen gets a button for each thing it does. A part
-- being there isn't enough: spike 0.0.4's census found Foldable on 178 of
-- 196 vehicle types, and trailers, weights and balers with Foldable but no
-- folding part, Cover with no cover. So each needs what the part holds.
-- Names seen in spike 0.0.4 (the spec's Data contract) unless marked.

VehicleState.CAPABILITIES = { "lower", "fold", "turnOn", "tip", "tipSide", "cover", "pipe", "rotate", "bales", "width",
    "detach" }

-- the game's own "can't now": a boolean and its warning text
local function allowed(object, name, ...)
    if type(object) ~= "table" or type(object[name]) ~= "function" then
        return nil
    end
    local ok, can, why = pcall(object[name], object, ...)
    if not ok or type(can) ~= "boolean" then
        return nil
    end
    return can, type(why) == "string" and why or nil
end

-- whether it has power for its keys, and the game's words when it hasn't:
-- with the engine off, folding, lowering and raising only got "Please start
-- the engine first" (live, 0.8.8 and 0.8.9). getIsPowered (Motorized's; a
-- tool asks its vehicle) is unverified
function VehicleState.powered(object)
    return allowed(object, "getIsPowered")
end

-- a tool that lowers through its own fold: Foldable's middle position
-- (foldMiddleAnimTime, seen in spike 0.0.4 on the rear Samasz XT 390; live
-- in 0.8.7 its joint said it doesn't lower while the game offered Lower)
function VehicleState.foldLowers(object)
    local spec = object.spec_foldable
    return type(spec) == "table" and type(spec.foldMiddleAnimTime) == "number"
end

-- the attacher joint lowers it: the input joint's allowsLowering
-- (unverified), else getAllowsLowering as today, which also says "not now"
-- (a mower folded for transport: false, while it still lowers); or its fold
local function lowers(object, out)
    if VehicleState.foldLowers(object) then
        return true
    end
    local joint = Api.tryCall(object, "getActiveInputAttacherJoint")
    if type(joint) == "table" and type(joint.allowsLowering) == "boolean" then
        return joint.allowsLowering
    end
    return Api.tryCall(object, "getAllowsLowering") ~= false or out.lowered == true
end

-- a trailer's tip side: its index, how many, its name when the game's
-- tipSides entry has one (unverified), else from the tip side key's label
-- ("Tip side (Back)"), which the game shows while the trailer is selected
local function tipSideOf(object, spec)
    local index = type(spec.preferedTipSideIndex) == "number" and spec.preferedTipSideIndex or 1
    local out = { index = index, count = spec.tipSideCount }
    local side = type(spec.tipSides) == "table" and spec.tipSides[index] or nil
    if type(side) == "table" and type(side.name) == "string" and side.name ~= "" then
        out.name = side.name
    else
        local key = VehicleState.liveKey(object, "TOGGLE_TIPSIDE")
        out.name = key ~= nil and key.text ~= nil and key.text:match("%((.+)%)") or nil
    end
    return out
end

-- where a trailer's Tip goes (specs/0003 revision 3): "object" while the
-- game shows I (TOGGLE_TIPSTATE, over something that takes the load),
-- "ground" while it shows Ctrl+I (TOGGLE_TIPSTATE_GROUND, "Unload here");
-- both are active, one shown (spike 0.0.8). Not selected, its keys aren't
-- registered: Dischargeable's getCanDischargeToObject on its current node
-- (true only over the sale point that took the load, spike 0.0.8)
local function tipToOf(object)
    local into = VehicleState.liveKey(object, "TOGGLE_TIPSTATE")
    if into ~= nil and into.shown == true then
        return "object"
    end
    local ground = VehicleState.liveKey(object, "TOGGLE_TIPSTATE_GROUND")
    if ground ~= nil and ground.shown == true then
        return "ground"
    end
    local spec = object.spec_dischargeable
    local node = type(spec) == "table" and spec.currentDischargeNode or nil
    if type(node) == "table" then
        local can = Api.tryCall(object, "getCanDischargeToObject", node)
        if type(can) == "boolean" then
            return can and "object" or "ground"
        end
    end
    return nil
end

-- The working width (specs/0011): a sprayer's sections, which the game's
-- PARTIAL WIDTH HUD block shows. VariableWorkWidth's fields seen in spike
-- 0.0.4 (the Berthoud Vantage 4300: 4 + 4 and a centre); each section's
-- width is unverified. {left, leftMax, right, rightMax, center, sections?},
-- or nil without sections or when a read fails
function VehicleState.width(object)
    local spec = object.spec_variableWorkWidth
    if type(spec) ~= "table" then
        return nil
    end
    local ok, out = pcall(function()
        if spec.hasSections ~= true then
            return nil
        end
        local w = { left = spec.leftSide, leftMax = spec.leftSideMax, right = spec.rightSide,
            rightMax = spec.rightSideMax, center = spec.hasCenter == true }
        for _, k in ipairs({ "left", "leftMax", "right", "rightMax" }) do
            if type(w[k]) ~= "number" then
                return nil
            end
        end
        -- the metres only from the game's own widths, one for each section
        local sections, widths = spec.sections, {}
        local count = w.leftMax + w.rightMax + (w.center and 1 or 0)
        if type(sections) == "table" and #sections == count then
            for i = 1, count do
                local section = sections[i]
                widths[i] = type(section) == "table" and type(section.width) == "number" and section.width or nil
            end
            if #widths == count then
                w.sections = widths
            end
        end
        return w
    end)
    return ok and out or nil
end

-- the tools whose width keys were live once: the game registers them only
-- while the tool is selected (spike 0.0.4: not even then, which the probe
-- checks), and its buttons must not come and go with the selection
local widthKeysSeen = setmetatable({}, { __mode = "k" })

-- the width has buttons only where the game's own keys are live (Vincent,
-- 2026-11-01: no other way in)
local function widthKeys(object)
    if VehicleState.liveKey(object, "VARIABLE_WORK_WIDTH_LEFT") ~= nil
        or VehicleState.liveKey(object, "VARIABLE_WORK_WIDTH_RIGHT") ~= nil then
        widthKeysSeen[object] = true
    end
    return widthKeysSeen[object] == true
end

-- sets out.can (the capabilities in CAPABILITIES' order), the state each
-- goes with (lowered, unfolded, turnedOn, discharging, tipSide, cover,
-- pipe, plow, bales, width), and out.canNow[cap] = false with out.whyNot[cap] (the
-- game's own words) for what the game refuses now. depth 0: the vehicle.
function VehicleState.capabilities(object, out, depth)
    local has, canNow, whyNot = {}, {}, {}
    local function refuse(cap, can, why)
        if can == false then
            canNow[cap] = false
            whyNot[cap] = why
        end
    end
    if depth > 0 then
        out.lowered = Api.tryCall(object, "getIsLowered", true) == true
        if lowers(object, out) then
            has.lower = true
            -- it says whether it may lower: raising stays allowed. Through
            -- the fold, getAllowsLowering is always false: Foldable's own
            -- getIsFoldMiddleAllowed (unverified) says
            if not out.lowered then
                refuse("lower", allowed(object, VehicleState.foldLowers(object) and "getIsFoldMiddleAllowed"
                    or "getAllowsLowering"))
            end
            -- either way, it needs power
            if canNow.lower == nil then
                refuse("lower", VehicleState.powered(object))
            end
        end
        has.detach = true
        refuse("detach", allowed(object, "isDetachAllowed"))
    end
    if VehicleState.fold(object, out) then
        has.fold = true
        refuse("fold", allowed(object, "getIsFoldAllowed", Api.tryCall(object, "getToggledFoldDirection") or 1, false))
        -- it needs power too, while getIsFoldAllowed says yes (live, 0.8.8)
        if canNow.fold == nil then
            refuse("fold", VehicleState.powered(object))
        end
    end
    -- getCanBeTurnedOn is also false while folded or with the engine off
    -- (live, 0.8.7); folded, Turn on stays, unavailable, with the game's
    -- warning (Foldable's, unverified)
    local canTurnOn = object.spec_turnOnVehicle ~= nil and Api.tryCall(object, "getCanBeTurnedOn")
    if canTurnOn == false and out.unfolded == false then
        has.turnOn = true
        out.turnedOn = Api.tryCall(object, "getIsTurnedOn") == true
        local why = Api.tryCall(object, "getTurnedOnNotAllowedWarning")
        refuse("turnOn", false, type(why) == "string" and why or nil)
    elseif object.spec_turnOnVehicle ~= nil and canTurnOn ~= false then
        has.turnOn = true
        out.turnedOn = Api.tryCall(object, "getIsTurnedOn") == true
        -- getIsTurnedOnAllowed isn't in FS25; what these answer is unverified
        if Api.tryCall(object, "getCanToggleTurnedOn") == false then
            local why = Api.tryCall(object, "getTurnedOnNotAllowedWarning")
            refuse("turnOn", false, type(why) == "string" and why or nil)
        end
    end
    local trailer = object.spec_trailer
    if type(trailer) == "table" and type(trailer.tipSideCount) == "number" and trailer.tipSideCount >= 1 then
        has.tip = true
        out.tipTo = tipToOf(object)
        if trailer.tipSideCount >= 2 then
            has.tipSide = true
            out.tipSide = tipSideOf(object, trailer)
        end
    end
    has.cover = out.cover ~= nil
    has.pipe = out.pipe ~= nil
    local plow = object.spec_plow
    if type(plow) == "table" and type(plow.rotationPart) == "table" and plow.rotationPart.turnAnimation ~= nil then
        has.rotate = true
        out.plow = { rotated = plow.rotationMax == true }
        if Api.tryCall(object, "getIsPlowRotationAllowed") == false then
            refuse("rotate", false)
        end
    end
    -- the game's own bale count (BaleCounter.lua; its fields are unverified)
    local counter = object.spec_baleCounter
    if type(counter) == "table" then
        has.bales = true
        out.bales = { count = type(counter.sessionCounter) == "number" and counter.sessionCounter or nil,
            total = type(counter.lifetimeCounter) == "number" and counter.lifetimeCounter or nil }
    end
    out.width = VehicleState.width(object)
    if out.width ~= nil and widthKeys(object) then
        has.width = true
        -- folded, the boom has no sections to switch: Foldable's own
        -- warning (unfoldWarning, unverified)
        if out.unfolded == false then
            local foldable = object.spec_foldable
            refuse("width", false, type(foldable) == "table" and type(foldable.unfoldWarning) == "string"
                and foldable.unfoldWarning or nil)
        end
    end
    out.can = {}
    for _, cap in ipairs(VehicleState.CAPABILITIES) do
        if has[cap] then
            out.can[#out.can + 1] = cap
        end
    end
    if next(canNow) ~= nil then
        out.canNow, out.whyNot = canNow, next(whyNot) ~= nil and whyNot or nil
    end
    return out
end

-- The selected tool's keys (specs/0003): each spec's actionEvents, keyed by
-- input action, and the input binding's events[id] with isActive and the
-- game's own label (contextDisplayText). The game registers a tool's keys
-- only while it is selected (spike 0.0.4).

-- an object's registered key for this input action: {action, text, active}
function VehicleState.liveKey(object, action)
    local events = type(g_inputBinding) == "table" and g_inputBinding.events or nil
    if type(events) ~= "table" then
        return nil
    end
    for k, spec in pairs(object) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and type(spec) == "table"
            and type(spec.actionEvents) == "table" then
            local ev = spec.actionEvents[action]
            local e = type(ev) == "table" and ev.actionEventId ~= nil and events[ev.actionEventId] or nil
            if type(e) == "table" then
                return { action = action, text = e.contextDisplayText, active = e.isActive ~= false, spec = k,
                    -- false while the game hides it (spike 0.0.8)
                    shown = e.displayIsVisible }
            end
        end
    end
    return nil
end

-- the input actions a capability's button presses, by the spec that
-- registers them where one action does different things (IMPLEMENT_EXTRA:
-- turn on, a plow's rotate). The all-tools keys, Attach and Detach are the
-- All row's, the column's and every card's; the vehicle's attacher joints'
-- keys (Lower plow, Detach tool) act on its tools, which have their cards.
local KEY_CAPS = {
    LOWER_IMPLEMENT = "lower", IMPLEMENT_EXTRA2 = "fold", TOGGLE_TIPSIDE = "tipSide",
    TOGGLE_TIPSTATE = "tip", TOGGLE_TIPSTATE_GROUND = "tip", TOGGLE_COVER = "cover", TOGGLE_PIPE = "pipe",
    DETACH = "detach", BALE_COUNTER_RESET = "bales",
    VARIABLE_WORK_WIDTH_LEFT = "width", VARIABLE_WORK_WIDTH_RIGHT = "width",
    IMPLEMENT_EXTRA = { spec_turnOnVehicle = "turnOn", spec_plow = "rotate" },
}
local NOT_A_TOOL_KEY = { FOLD_ALL_IMPLEMENTS = true, TURN_ON_ALL_IMPLEMENTS = true, LOWER_ALL_IMPLEMENTS = true,
    ATTACH = true, DETACH = true }

-- the capabilities a card has a button for: the ones confirmed in game
-- (spec 0003's close). Cover, rotate and bales wait for their own spec;
-- until then their keys are other keys, with the game's labels
local BUTTON_CAPS = { lower = true, fold = true, turnOn = true, tip = true, tipSide = true, pipe = true,
    width = true, detach = true }

-- the vehicle's own driving parts: their keys (Accelerate, Steer vehicle,
-- Honk...; live 2026-10-31, the Vestrum 100) are never a card's
-- (specs/0011). By the part's own name, a mod's prefix left off
-- ("FS25_precisionFarming.extendedMotorized"); unverified on a
-- self-propelled sprayer
local DRIVING_PARTS = {
    drivable = true, motorized = true, enterable = true, honk = true, lights = true, wipers = true,
    crabSteering = true, articulatedAxis = true, reverseDriving = true, dashboard = true,
    aiDrivable = true, aiFieldWorker = true, aiJobVehicle = true, aiAutomaticSteering = true, aiVehicle = true,
    extendedMotorized = true, enterableCameraMirrors = true,
}

-- "spec_drivable" -> "drivable", "spec_FS25_precisionFarming.extendedMotorized" -> "extendedMotorized"
local function partName(k)
    return (k:match("([^%.]+)$"):gsub("^spec_", ""))
end

-- the selected tool's live keys that no button in `can` covers, each
-- once, by input action: {action, text} ("Allow create fields", "Turn on
-- automatic drop", a modded tool's own). The turn on key never is: Turn on
-- comes and goes with the fold and the engine (live, 0.8.7: "Turn on
-- mower" on a folded mower, which only got the game's warning). own: the
-- vehicle itself, whose driving parts' keys are left out
function VehicleState.extraKeys(object, can, own)
    local events = type(g_inputBinding) == "table" and g_inputBinding.events or nil
    if type(events) ~= "table" then
        return {}
    end
    local covered = {}
    for _, cap in ipairs(can or {}) do
        covered[cap] = BUTTON_CAPS[cap] == true
    end
    local seen, out = {}, {}
    for k, spec in pairs(object) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and k ~= "spec_attacherJoints" and type(spec) == "table"
            and type(spec.actionEvents) == "table" and not (own and DRIVING_PARTS[partName(k)]) then
            for action, ev in pairs(spec.actionEvents) do
                local e = type(ev) == "table" and ev.actionEventId ~= nil and events[ev.actionEventId] or nil
                local cap = KEY_CAPS[action]
                if type(cap) == "table" then
                    cap = cap[k]
                end
                if type(action) == "string" and type(e) == "table" and e.isActive ~= false
                    and type(e.contextDisplayText) == "string" and e.contextDisplayText ~= ""
                    and not NOT_A_TOOL_KEY[action] and not (cap ~= nil and (covered[cap] or cap == "turnOn"))
                    and not seen[action] then
                    seen[action] = true
                    out[#out + 1] = { action = action, text = e.contextDisplayText }
                end
            end
        end
    end
    table.sort(out, function(a, b) return a.action < b.action end)
    return out
end

-- whether the game has something in reach to attach (its Attach prompt is
-- up): the vehicle's attachableInfo.attachable, else the attach key's label
function VehicleState.attachable(vehicle)
    for _, v in ipairs({ vehicle, VehicleState.rootOf(vehicle) }) do
        local spec = v.spec_attacherJoints
        if type(spec) == "table" and type(spec.attachableInfo) == "table" then
            if spec.attachableInfo.attachable ~= nil then
                return true
            end
            return false
        end
    end
    local key = VehicleState.liveKey(vehicle, "ATTACH")
    return key ~= nil and key.active and type(key.text) == "string" and key.text ~= ""
end
