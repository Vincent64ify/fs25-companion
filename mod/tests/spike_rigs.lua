-- spike_rigs.lua
-- Test helpers for spec 0003 (a card per tool): a JSON decoder (plain Lua
-- has none), and mock game objects built from spike 0.0.4's dumps in
-- mod/tests/fixtures/spike0003/: a rig member from what the spike read off
-- it, a whole rig with its selection and the selected tool's keys, and an
-- object for a census type from its specialization names.
--
-- Used by run.lua and by fixtures/rig_fixtures.py (the web's rig fixtures).

SpikeRigs = {}

-- the game's reason a tool lowered on its joint can't fold (spike 0.0.4)
SpikeRigs.FOLD_WHILE_LOWERED = "Folding is not allowed while the tool is lowered."
-- the game's warning on a fold key with the engine off (live, 0.8.8)
SpikeRigs.START_ENGINE = "Please start the engine first"

-- JSON -----------------------------------------------------------------------

local function utf8(code)
    if code < 0x80 then
        return string.char(code)
    elseif code < 0x800 then
        return string.char(0xC0 + math.floor(code / 0x40), 0x80 + code % 0x40)
    end
    return string.char(0xE0 + math.floor(code / 0x1000), 0x80 + math.floor(code / 0x40) % 0x40, 0x80 + code % 0x40)
end

local ESCAPES = { ['"'] = '"', ["\\"] = "\\", ["/"] = "/", b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }

-- objects become tables, arrays lists; null becomes nil
function SpikeRigs.decode(text)
    local pos = 1
    local value

    local function space()
        pos = text:find("[^ \t\r\n]", pos) or #text + 1
    end

    local function str()
        local out = {}
        pos = pos + 1
        while true do
            local c = text:sub(pos, pos)
            if c == '"' then
                pos = pos + 1
                return table.concat(out)
            elseif c == "\\" then
                local e = text:sub(pos + 1, pos + 1)
                if e == "u" then
                    out[#out + 1] = utf8(tonumber(text:sub(pos + 2, pos + 5), 16))
                    pos = pos + 6
                else
                    out[#out + 1] = ESCAPES[e]
                    pos = pos + 2
                end
            elseif c == "" then
                error("unterminated string")
            else
                local stop = text:find('["\\]', pos)
                out[#out + 1] = text:sub(pos, stop - 1)
                pos = stop
            end
        end
    end

    function value()
        space()
        local c = text:sub(pos, pos)
        if c == "{" then
            local t = {}
            pos = pos + 1
            space()
            if text:sub(pos, pos) == "}" then
                pos = pos + 1
                return t
            end
            while true do
                space()
                local k = str()
                space()
                pos = pos + 1 -- :
                t[k] = value()
                space()
                local sep = text:sub(pos, pos)
                pos = pos + 1
                if sep == "}" then
                    return t
                end
            end
        elseif c == "[" then
            local t = {}
            pos = pos + 1
            space()
            if text:sub(pos, pos) == "]" then
                pos = pos + 1
                return t
            end
            while true do
                t[#t + 1] = value()
                space()
                local sep = text:sub(pos, pos)
                pos = pos + 1
                if sep == "]" then
                    return t
                end
            end
        elseif c == '"' then
            return str()
        elseif text:sub(pos, pos + 3) == "true" then
            pos = pos + 4
            return true
        elseif text:sub(pos, pos + 4) == "false" then
            pos = pos + 5
            return false
        elseif text:sub(pos, pos + 3) == "null" then
            pos = pos + 4
            return nil
        end
        local num = text:match("^-?%d+%.?%d*[eE]?[-+]?%d*", pos)
        pos = pos + #num
        return tonumber(num)
    end

    return value()
end

function SpikeRigs.readFile(path)
    local f = assert(io.open(path, "r"))
    local text = f:read("*a")
    f:close()
    return text
end

-- Mock objects ---------------------------------------------------------------

-- "FS25_precisionFarming.extendedSprayer" -> "extendedSprayer"
local function shortName(name)
    return name:match("([^%.]+)$") or name
end

local nextEventId = 0

-- the input binding the mocks register their keys in: by action name, as
-- the game has it (nameActions, actionEvents keyed by the action, events
-- by id with isActive and contextDisplayText)
function SpikeRigs.binding()
    local b = { nameActions = {}, actionEvents = {}, events = {}, pressed = {} }
    g_inputBinding = b
    return b
end

-- register one key on an object's spec, as the game does while it's selected
function SpikeRigs.register(object, specName, key)
    local b = g_inputBinding
    local action = b.nameActions[key.action]
    if action == nil then
        action = { name = key.action }
        b.nameActions[key.action] = action
        b.actionEvents[action] = {}
    end
    nextEventId = nextEventId + 1
    local event = {
        id = nextEventId, isActive = key.active ~= false, targetObject = object,
        contextDisplayText = key.text,
        callback = function(target, name)
            b.pressed[#b.pressed + 1] = { id = target.id, action = name }
            if target.onKey ~= nil then
                target.onKey(name)
            else
                SpikeRigs.act(target, name)
            end
        end,
    }
    table.insert(b.actionEvents[action], event)
    b.events[nextEventId] = event
    local spec = object["spec_" .. shortName(specName)] or {}
    object["spec_" .. shortName(specName)] = spec
    spec.actionEvents = spec.actionEvents or {}
    spec.actionEvents[key.action] = { actionEventId = nextEventId }
end

-- What the game's keys do, as seen live (spec 0003 revision 2 answers ok
-- only once the tools moved, so the mocks' keys must act). A test's
-- onKey replaces this; a tool with `stuck` ignores every key; with the
-- engine off nothing moves (the game only warns).
local function rigTools(root)
    local out = {}
    for _, o in pairs(root.members or {}) do
        if o ~= root and not o.stuck then
            out[#out + 1] = o
        end
    end
    table.sort(out, function(a, b) return a.id < b.id end)
    return out
end

local function lowerable(o)
    return o:getAllowsLowering() or (type(o.spec_foldable) == "table" and o.spec_foldable.foldMiddleAnimTime ~= nil)
end

function SpikeRigs.act(target, name)
    local root = target.getRootVehicle ~= nil and target:getRootVehicle() or target
    if root.engineOff or target.stuck then
        return
    end
    if name == "LOWER_IMPLEMENT" then
        -- the tractor's key acts on the selected tool (attacher joints)
        local tool = target == root and root:getSelectedVehicle() or target
        if tool ~= nil and tool ~= root and not tool.stuck then
            tool.lowered = not tool.lowered
        end
    elseif name == "IMPLEMENT_EXTRA2" then
        if target.setFoldState ~= nil and target:getIsFoldAllowed() ~= false then
            target:setFoldState(target:getToggledFoldDirection())
        end
    elseif name == "IMPLEMENT_EXTRA" then
        if target.setIsTurnedOn ~= nil and target:getCanBeTurnedOn() then
            target.on = not target.on
        end
    elseif name == "FOLD_ALL_IMPLEMENTS" then
        -- folds every one it may while one is unfolded, else unfolds all
        -- (spike 0.0.5: the KDF folded and the KDD unfolded, the KDD folded)
        local tools, fold = {}, false
        for _, o in ipairs(rigTools(root)) do
            if o.setFoldState ~= nil then
                tools[#tools + 1] = o
                fold = fold or o:getIsUnfolded()
            end
        end
        for _, o in ipairs(tools) do
            if o:getIsUnfolded() == fold and (not fold or o:getIsFoldAllowed() ~= false) then
                o:setFoldState(o:getToggledFoldDirection())
            end
        end
    elseif name == "TURN_ON_ALL_IMPLEMENTS" then
        local tools, on = {}, false
        for _, o in ipairs(rigTools(root)) do
            if o.setIsTurnedOn ~= nil then
                tools[#tools + 1] = o
                on = on or not o.on
            end
        end
        for _, o in ipairs(tools) do
            if o.on ~= on and (not on or o:getCanBeTurnedOn()) then
                o.on = on
            end
        end
    elseif name == "LOWER_ALL_IMPLEMENTS" then
        local tools, lower = {}, false
        for _, o in ipairs(rigTools(root)) do
            if lowerable(o) then
                tools[#tools + 1] = o
                lower = lower or not o.lowered
            end
        end
        for _, o in ipairs(tools) do
            o.lowered = lower
        end
    end
end

-- drop every key of an object (it's no longer selected)
function SpikeRigs.unregister(object)
    local b = g_inputBinding
    for _, events in pairs(b.actionEvents) do
        for i = #events, 1, -1 do
            if events[i].targetObject == object then
                b.events[events[i].id] = nil
                table.remove(events, i)
            end
        end
    end
    for k, spec in pairs(object) do
        if type(k) == "string" and k:sub(1, 5) == "spec_" and type(spec) == "table" then
            spec.actionEvents = nil
        end
    end
end

-- one rig member from the spike's dump of it: its parts, holding what the
-- spike found in them, and the getters it called
function SpikeRigs.member(m)
    local o = { id = m.id, typeName = m.typeName, dump = m }
    for _, s in ipairs(m.specs or {}) do
        o["spec_" .. shortName(s)] = {}
    end
    o.getFullName = function() return m.name end
    -- the vehicle answers for its tools: no power with the engine off
    o.getIsPowered = function(self)
        local root = self.getRootVehicle ~= nil and self:getRootVehicle() or self
        if root.engineOff then
            return false, SpikeRigs.START_ENGINE
        end
        return true
    end
    if m.fold ~= nil then
        local parts = {}
        for i = 1, m.fold.parts or 0 do
            parts[i] = {}
        end
        o.spec_foldable = o.spec_foldable or {}
        o.spec_foldable.foldingParts = parts
        -- a mower that lowers through its own fold (the rear XT 390)
        o.spec_foldable.foldMiddleAnimTime = m.fold.middle
        o.foldDirection = m.fold.toggledDirection
        o.getToggledFoldDirection = function(self) return self.foldDirection end
        -- the direction F goes next: 1 folds (every dump with 1 offers
        -- "Fold mower", "Fold plow"), so it's unfolded now
        o.getIsUnfolded = function(self) return self.foldDirection == 1 end
        -- the game's "while lowered" holds only while it is (live, 0.8.7)
        o.getIsFoldAllowed = function(self)
            local a = m.fold.allowed or {}
            if a[1] == false and a[2] == SpikeRigs.FOLD_WHILE_LOWERED and not self.lowered then
                return true
            end
            return a[1], a[2]
        end
        o.setFoldState = function(self, direction) self.foldDirection = -direction end
    end
    if m.turnOn ~= nil then
        o.spec_turnOnVehicle = o.spec_turnOnVehicle or {}
        o.on = false
        -- false while folded or with the engine off (live, 0.8.7)
        o.getCanBeTurnedOn = function(self)
            return m.turnOn.canBeTurnedOn == true and (self.getIsUnfolded == nil or self:getIsUnfolded())
                and not self.engineOff
        end
        o.getIsTurnedOn = function(self) return self.on end
        o.setIsTurnedOn = function(self, on) self.on = on end
    end
    -- the spike kept lower only when it read something (getAllowsLowering,
    -- getIsLowered); the joint lowers it where getAllowsLowering said so.
    -- Live (0.8.7): the rear mower lowers through its fold's middle
    -- position, not its joint
    local lower = m.lower
    o.lowered = lower ~= nil and lower.lowered == true
    o.getAllowsLowering = function() return lower ~= nil and lower.allows == true end
    o.getIsLowered = function(self) return self.lowered end
    o.getActiveInputAttacherJoint = function() return { allowsLowering = lower ~= nil and lower.allows == true } end
    if m.detach ~= nil then
        o.isDetachAllowed = function() return m.detach[1], m.detach[2] end
    end
    if m.dischargeState ~= nil then
        o.spec_dischargeable = o.spec_dischargeable or {}
        o.spec_dischargeable.currentDischargeState = m.dischargeState
        o.getDischargeState = function(self) return self.spec_dischargeable.currentDischargeState end
    end
    if m.trailer ~= nil then
        o.spec_trailer = { tipSideCount = m.trailer.tipSideCount, preferedTipSideIndex = m.trailer.preferedTipSideIndex,
            tipState = m.trailer.tipState }
    end
    if m.cover ~= nil then
        o.spec_cover = { hasCovers = m.cover.hasCovers, state = m.cover.state, covers = {} }
    end
    if m.plow ~= nil then
        o.spec_plow = { rotationMax = m.plow.rotationMax, limitToField = m.plow.limitToField,
            rotationPart = { turnAnimation = m.plow.turnAnimation } }
    end
    if m.baler ~= nil and o.spec_baleCounter ~= nil then
        -- the counter's fields are unverified: the spike didn't read them
        o.spec_baleCounter.sessionCounter = 0
    end
    if m.workWidth ~= nil then
        o.getAIWorkAreaWidth = function() return m.workWidth end
    end
    if m.speedLimit ~= nil then
        o.getSpeedLimit = function() return m.speedLimit end
    end
    return o
end

-- a whole rig from a spike dump: the members joined to their parents, the
-- side each hangs on (`sides`, by id: the dumps don't say; rear by
-- default), the game's selection, and the selected tool's keys (the game
-- registers a tool's keys only while it's selected) and the vehicle's own
-- in the input binding. Returns the controlled vehicle and the members by id.
function SpikeRigs.rig(dump, sides)
    sides = sides or {}
    SpikeRigs.binding()
    local byId, root = {}, nil
    for _, m in ipairs(dump.members) do
        local o = SpikeRigs.member(m)
        byId[m.id] = o
        if m.depth == 0 then
            root = o
        end
    end
    local z = {}
    for _, m in ipairs(dump.members) do
        local o = byId[m.id]
        o.attached = o.attached or {}
        o.getAttachedImplements = function(self) return self.attached end
        o.rootNode = "node" .. m.id
        if m.parent ~= nil then
            local parent = byId[m.parent]
            parent.attached = parent.attached or {}
            parent.spec_attacherJoints = parent.spec_attacherJoints or {}
            parent.spec_attacherJoints.attacherJoints = parent.spec_attacherJoints.attacherJoints or {}
            local joints = parent.spec_attacherJoints.attacherJoints
            local node = "joint" .. m.id
            joints[#joints + 1] = { jointTransform = node }
            z[node] = sides[m.id] == "front" and 2 or -3
            table.insert(parent.attached, { object = o, jointDescIndex = #joints })
            o.getAttacherVehicle = function() return parent end
            parent.detachImplementByObject = function(self, object)
                for i, entry in ipairs(self.attached) do
                    if entry.object == object then
                        table.remove(self.attached, i)
                    end
                end
            end
        end
        o.getRootVehicle = function() return root end
    end
    localToLocal = function(node) return 0, 0, z[node] or 0 end
    root.selectableObjects = {}
    root.selection = 1
    for i, id in ipairs(dump.selectable or {}) do
        root.selectableObjects[i] = { vehicle = byId[id] }
        if id == dump.selectedId then
            root.selection = i
        end
    end
    root.getSelectedVehicle = function(self)
        local entry = self.selectableObjects[self.selection]
        return entry ~= nil and entry.vehicle or nil
    end
    root.getSelectedObject = function(self) return self.selectableObjects[self.selection] end
    -- the game registers the newly selected tool's keys on a later frame:
    -- SpikeRigs.frame() does it
    root.setSelectedObject = function(self, object)
        for i, entry in ipairs(self.selectableObjects) do
            if entry == object then
                local was = self:getSelectedVehicle()
                self.selection = i
                if was ~= entry.vehicle then
                    root.keysDue = true
                end
            end
        end
    end
    root.spec_attacherJoints = root.spec_attacherJoints or {}
    root.spec_attacherJoints.attachableInfo = dump.attachInReach and { attachable = {} } or {}
    root.members = byId
    SpikeRigs.registerKeys(root)
    g_localPlayer = { getCurrentVehicle = function() return root end }
    return root, byId
end

-- the selected tool's keys and the vehicle's own, as the game has them now
function SpikeRigs.registerKeys(root)
    for _, o in pairs(root.members) do
        SpikeRigs.unregister(o)
    end
    local selected = root:getSelectedVehicle()
    for _, o in pairs(root.members) do
        if o == root or o == selected then
            local specs = {}
            for spec in pairs(o.dump.keys or {}) do
                specs[#specs + 1] = spec
            end
            table.sort(specs)
            for _, spec in ipairs(specs) do
                for _, key in ipairs(o.dump.keys[spec]) do
                    SpikeRigs.register(o, spec, key)
                end
            end
        end
    end
    root.keysDue = false
end

-- one game frame: keys follow the selection
function SpikeRigs.frame(root)
    if root.keysDue then
        SpikeRigs.registerKeys(root)
    end
end

-- Census -------------------------------------------------------------------

-- an object of a census type: each of its specializations, and in each what
-- the capability rule looks for; `full` false gives every part empty (a
-- Foldable with no folding part, a Cover with no cover, ...)
function SpikeRigs.censusObject(specNames, full)
    local o = { typeName = "census" }
    for _, s in ipairs(specNames) do
        o["spec_" .. shortName(s)] = {}
    end
    if o.spec_foldable then
        o.spec_foldable.foldingParts = full and { {} } or {}
    end
    if o.spec_turnOnVehicle then
        o.getCanBeTurnedOn = function() return full end
    end
    if o.spec_trailer then
        o.spec_trailer.tipSideCount = full and 3 or 0
        o.spec_trailer.preferedTipSideIndex = 1
    end
    if o.spec_cover then
        o.spec_cover.hasCovers = full
        o.spec_cover.state = 0
    end
    if o.spec_pipe then
        o.spec_pipe.hasMovablePipe = full
        o.spec_pipe.currentState, o.spec_pipe.targetState = 1, 1
    end
    if o.spec_plow then
        o.spec_plow.rotationPart = full and { turnAnimation = "turn" } or {}
    end
    if o.spec_attachable then
        o.getActiveInputAttacherJoint = function() return { allowsLowering = full } end
        o.getAllowsLowering = function() return full end
    end
    return o
end
