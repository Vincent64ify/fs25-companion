-- state/Tools.lua
-- What each tool shows and can do: lower, fold, turn on, the Implement
-- screen's extras and the capabilities, what it has and what it can do now
-- (specs/0003, 0012). All guarded.

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

-- an object that folds (a tool, or a combine itself): sets unfolded,
-- foldMoving and, while it moves, foldDirection ("folding", "unfolding") on
-- out and returns true; false when it doesn't fold. getIsUnfolded turns
-- false as soon as a fold starts (live, 0.12.1), so only the direction says
-- which way it goes (foldMoveDirection, spikes 0.0.5 and 0.0.6: 1 folding,
-- -1 unfolding, 0 still)
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
    local direction = foldable.foldMoveDirection
    if out.foldMoving and type(direction) == "number" and direction ~= 0 then
        out.foldDirection = direction > 0 and "folding" or "unfolding"
    end
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

-- Capabilities (specs/0003, 0012) ---------------------------------------------
-- A card's buttons come from what a tool is (specs/0012, rule 1): read from
-- its parts and the settings they were loaded with, never from what the
-- game allows this frame, so a button never comes and goes. A part being
-- there isn't enough: spike 0.0.4's census found Foldable on 178 of 196
-- vehicle types, and trailers, weights and balers with Foldable but no
-- folding part, Cover with no cover. So each needs what the part holds.
-- The game's live answers only fade a button (rule 2): canNow false, with
-- whyNot the game's words. Names from the game's own scripts (the SDK's
-- gameSource.zip) and the probes, as in the spec's Data contract; the
-- unverified ones guarded.

VehicleState.CAPABILITIES = { "lower", "fold", "turnOn", "unload", "tip", "tipSide", "cover", "pipe", "rotate",
    "createFields", "autoDrop", "bales", "doubledRate", "sprayRate", "width", "detach" }

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

-- how it lowers, or nil: "fold" (its fold's middle position), "pickup" (a
-- pickup with its own animation lowers itself: Pickup registers its own
-- LOWER_IMPLEMENT then), "joint" (its input attacher joint's allowsLowering:
-- the probe read it on the W 600 and the Berthoud; unverified on others).
-- No getAllowsLowering here: it's a "now" (false on a mower folded for
-- transport)
local function lowersBy(object)
    if VehicleState.foldLowers(object) then
        return "fold"
    end
    local pickup = object.spec_pickup
    if type(pickup) == "table" and type(pickup.animationName) == "string" and pickup.animationName ~= "" then
        return "pickup"
    end
    local joint = Api.tryCall(object, "getActiveInputAttacherJoint")
    if type(joint) == "table" and joint.allowsLowering == true then
        return "joint"
    end
    return nil
end

-- whether it has a turn on key: TurnOnVehicle registers it only where
-- getCanToggleTurnedOn, false on a tool always on (isAlwaysTurnedOn) or
-- turned on by its tractor (turnedOnByAttacherVehicle), settings fixed at
-- load (the probe, 2026-11-02: the W 600 and the ARION have no turn on part
-- at all). Read as fields: a sprayer's own getCanToggleTurnedOn asks its
-- tank too. And not where its joint never turns it on (canBeTurnedOn)
local function turnsOn(object, depth)
    local spec = object.spec_turnOnVehicle
    if type(spec) ~= "table" then
        return false
    end
    local always, byTractor = spec.isAlwaysTurnedOn, spec.turnedOnByAttacherVehicle
    if type(always) == "boolean" or type(byTractor) == "boolean" then
        if always == true or byTractor == true then
            return false
        end
    elseif Api.tryCall(object, "getCanToggleTurnedOn") == false then
        return false
    end
    local joint = depth > 0 and Api.tryCall(object, "getActiveInputAttacherJoint") or nil
    return not (type(joint) == "table" and joint.canBeTurnedOn == false)
end

-- whether it has something to unload into pallets now: a fill unit that
-- can be unloaded (canBeUnloaded, true unless its XML says) with a level
-- and a pallet for it (FillUnit.updateUnloadActionDisplay); nil when they
-- can't be read
local function hasToUnload(object, spec)
    if type(spec.fillUnits) ~= "table" then
        return nil
    end
    local palletOf = type(object.getFillUnitUnloadPalletFilename) == "function"
    for i, unit in ipairs(spec.fillUnits) do
        if type(unit) == "table" and unit.canBeUnloaded ~= false and type(unit.fillLevel) == "number"
            and unit.fillLevel > 0 and (not palletOf or Api.tryCall(object, "getFillUnitUnloadPalletFilename", i) ~= nil) then
            return true
        end
    end
    return false
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
-- 0.0.4 (the Berthoud Vantage 4300: 4 + 4 and a centre). {left, leftMax,
-- right, rightMax, center}, or nil without sections or when a read fails.
-- No metres: sections[i].width isn't one (live, 0.12.0: 1, 0.84, 0.65,
-- 0.29, 0 ... 1 across a 33 m boom), and the game's own isn't known yet
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
        return w
    end)
    return ok and out or nil
end

-- the part with this name, a mod's prefix left off:
-- "spec_FS25_precisionFarming.extendedSprayer" is "extendedSprayer"
local function partNamed(object, name)
    for k, spec in pairs(object) do
        if type(k) == "string" and type(spec) == "table" and k:sub(1, 5) == "spec_"
            and (k:match("([^%.]+)$"):gsub("^spec_", "")) == name then
            return spec
        end
    end
    return nil
end

-- Precision Farming's sprayer part (the probe, 2026-11-02, the Rogator
-- 937H: sprayAmountAutoMode true while automatic, sprayAmountManual 1 to
-- 45 between sprayAmountManualMin and Max). Its own script isn't readable:
-- all guarded
function VehicleState.precisionSprayer(object)
    return partNamed(object, "extendedSprayer")
end

-- the rate the Application rate row reads: {auto, step, min, max}
local function sprayRateOf(pf)
    local out = { auto = pf.sprayAmountAutoMode == true }
    for k, field in pairs({ step = "sprayAmountManual", min = "sprayAmountManualMin", max = "sprayAmountManualMax" }) do
        if type(pf[field]) == "number" then
            out[k] = pf[field]
        end
    end
    return out
end

-- a baler's automatic drop where it toggles (toggleableAutomaticDrop, fixed
-- at load): the platform's own setting where it has one
-- (Baler.setBalerAutomaticDrop); a baler-wrapper's wrapper has its own
-- (BaleWrapper), toggled by the same key. Returns its state, and whether
-- it toggles
local function dropOf(object)
    local baler, wrapper = object.spec_baler, object.spec_baleWrapper
    local on, toggles = nil, false
    if type(baler) == "table" and baler.toggleableAutomaticDrop == true then
        on, toggles = baler.automaticDrop, true
        if baler.hasPlatform == true then
            on = baler.platformAutomaticDrop
        end
    elseif type(wrapper) == "table" and wrapper.toggleableAutomaticDrop == true then
        on, toggles = wrapper.automaticDrop, true
    end
    if type(on) ~= "boolean" then
        on = nil
    end
    return on, toggles
end

-- Rule 1: what a member has, and the state each label reads. depth 0: the
-- vehicle (no Lower, no Detach)
local function hasOf(object, out, depth)
    local has = {}
    if depth > 0 then
        out.lowered = Api.tryCall(object, "getIsLowered", true) == true
        has.lower = lowersBy(object) ~= nil
        has.detach = true
    end
    has.fold = VehicleState.fold(object, out)
    if turnsOn(object, depth) then
        has.turnOn = true
        out.turnedOn = Api.tryCall(object, "getIsTurnedOn") == true
    end
    -- FillUnit registers UNLOAD only where it has unloading places
    local fillUnit = object.spec_fillUnit
    has.unload = type(fillUnit) == "table" and type(fillUnit.unloading) == "table" and next(fillUnit.unloading) ~= nil
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
    if type(plow) == "table" then
        if type(plow.rotationPart) == "table" and plow.rotationPart.turnAnimation ~= nil then
            has.rotate = true
            out.plow = { rotated = plow.rotationMax == true }
        end
        -- Plow registers its limit to field key on every plow; forced
        -- (forceLimitToField, or the platform can't create fields), the
        -- key does nothing
        local forced = Api.tryCall(object, "getPlowForceLimitToField")
        if forced == nil then
            forced = plow.forceLimitToField == true
        end
        if forced ~= true then
            has.createFields = true
            if type(plow.limitToField) == "boolean" then
                out.createFields = not plow.limitToField
            end
        end
    end
    local drop, toggles = dropOf(object)
    if toggles then
        has.autoDrop = true
        out.autoDrop = drop
    end
    -- the game's own bale count (BaleCounter.lua)
    local counter = object.spec_baleCounter
    if type(counter) == "table" then
        has.bales = true
        out.bales = { count = type(counter.sessionCounter) == "number" and counter.sessionCounter or nil,
            total = type(counter.lifetimeCounter) == "number" and counter.lifetimeCounter or nil }
    end
    -- Sprayer allows a doubled rate only on a slurry tanker or a manure
    -- spreader (getSprayerDoubledAmountActive; isFertilizerSprayer is set
    -- at load; Vincent, 2026-11-03)
    local sprayer = object.spec_sprayer
    if type(sprayer) == "table" and sprayer.isFertilizerSprayer == false then
        has.doubledRate = true
        out.doubledRate = sprayer.doubledAmountIsActive == true
    end
    local pf = VehicleState.precisionSprayer(object)
    if type(pf) == "table" and pf.sprayAmountAutoModeChangeAllowed == true then
        has.sprayRate = true
        out.sprayRate = sprayRateOf(pf)
    end
    -- the sections' strip always; their buttons only without Precision
    -- Farming's sprayer part, which takes the sections over and leaves the
    -- game no width key (the probe; Vincent, 2026-11-02)
    out.width = VehicleState.width(object)
    has.width = out.width ~= nil and pf == nil
    return has
end

-- Rule 2: what the game refuses now, with its words: canNow[cap] false and
-- whyNot[cap], the first refusal for each
local function nowOf(object, out, has)
    local canNow, whyNot = {}, {}
    local function refuse(cap, can, why)
        if has[cap] and can == false and canNow[cap] == nil then
            canNow[cap] = false
            whyNot[cap] = why
        end
    end
    local power, noPower = VehicleState.powered(object)
    -- it says whether it may lower: raising stays allowed. Through the
    -- fold, getAllowsLowering is always false: Foldable's own
    -- getIsFoldMiddleAllowed (unverified) says; a pickup lowers whenever
    -- (Pickup.getCanChangePickupState). Either way, it needs power
    if has.lower and not out.lowered then
        local by = lowersBy(object)
        if by == "fold" then
            refuse("lower", allowed(object, "getIsFoldMiddleAllowed"))
        elseif by == "joint" then
            refuse("lower", allowed(object, "getAllowsLowering"))
        end
    end
    refuse("lower", power, noPower)
    refuse("detach", allowed(object, "isDetachAllowed"))
    refuse("fold", allowed(object, "getIsFoldAllowed", Api.tryCall(object, "getToggledFoldDirection") or 1, false))
    -- it needs power too, while getIsFoldAllowed says yes (live, 0.8.8)
    refuse("fold", power, noPower)
    -- getCanBeTurnedOn is false while folded or with the engine off (live,
    -- 0.8.7 and 0.12.1): the game's warning (TurnOnVehicle without power,
    -- Foldable folded), else the engine's
    if has.turnOn and Api.tryCall(object, "getCanBeTurnedOn") == false then
        local why = Api.tryCall(object, "getTurnedOnNotAllowedWarning")
        refuse("turnOn", false, type(why) == "string" and why or power == false and noPower or nil)
    end
    -- FillUnit.unloadFillUnits does nothing while it runs, nor without a
    -- level to unload (which of the two the game shows: unverified)
    if has.unload then
        local fillUnit = object.spec_fillUnit
        refuse("unload", fillUnit.unloadingFillUnitsRunning ~= true)
        refuse("unload", hasToUnload(object, fillUnit), "Nothing to unload")
    end
    -- Plow.actionEventTurn asks getCanTogglePlowRotation (the fold's
    -- limits, lowered, power); else getIsPlowRotationAllowed (the fold's)
    if has.rotate then
        local can = Api.tryCall(object, "getCanTogglePlowRotation")
        if can == nil then
            can = Api.tryCall(object, "getIsPlowRotationAllowed")
        end
        refuse("rotate", can)
        refuse("rotate", power, noPower)
    end
    -- Plow.onUpdate: the player's createFields permission
    if has.createFields and type(g_currentMission) == "table" then
        refuse("createFields", Api.tryCall(g_currentMission, "getHasPlayerPermission", "createFields",
            Api.tryCall(object, "getOwnerConnection")))
    end
    -- powered keys (addPoweredActionEvent): Baler's drop, BaleCounter's reset
    refuse("autoDrop", power, noPower)
    refuse("bales", power, noPower)
    -- Sprayer.onUpdateTick: its key is active only for the spray type in it
    if has.doubledRate then
        local params = object.spec_sprayer.workAreaParameters
        local _, ok = Api.tryCallAll(object, "getSprayerDoubledAmountActive",
            type(params) == "table" and params.sprayType or nil)
        refuse("doubledRate", ok)
    end
    -- the rate's three buttons need power; Rate - and + fade by sprayRate
    -- too (automatic on, at an end)
    refuse("sprayRate", power, noPower)
    -- the width: Sprayer sets isActive from the spray type's
    -- supportsVariableWorkWidth (the probe read it true); folded, the boom
    -- has no sections to switch: Foldable's own warning (unfoldWarning)
    if has.width then
        refuse("width", object.spec_variableWorkWidth.isActive ~= false, "This spray type has no partial width")
        if out.unfolded == false then
            local foldable = object.spec_foldable
            refuse("width", false, type(foldable) == "table" and type(foldable.unfoldWarning) == "string"
                and foldable.unfoldWarning or nil)
        end
    end
    if next(canNow) ~= nil then
        out.canNow, out.whyNot = canNow, next(whyNot) ~= nil and whyNot or nil
    end
end

-- sets out.can (what it has, in CAPABILITIES' order: rule 1), the state
-- each goes with (lowered, unfolded, turnedOn, tipTo, tipSide, cover, pipe,
-- plow, createFields, autoDrop, bales, doubledRate, sprayRate, width), and
-- out.canNow[cap] = false with out.whyNot[cap] for what the game refuses
-- now (rule 2). depth 0: the vehicle.
function VehicleState.capabilities(object, out, depth)
    local has = hasOf(object, out, depth)
    out.can = {}
    for _, cap in ipairs(VehicleState.CAPABILITIES) do
        if has[cap] then
            out.can[#out.can + 1] = cap
        end
    end
    nowOf(object, out, has)
    return out
end

-- an object's registered key for this input action: {action, text, active,
-- spec, shown}. The game registers a tool's keys only while it's selected
-- (spike 0.0.4): Tip's way and the tip side's name read them while they're
-- there; no button comes from them (specs/0012)
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
