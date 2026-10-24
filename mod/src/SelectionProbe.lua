-- SelectionProbe.lua
-- Selection spike for Controls C3 (docs/PLAN.md): can the mod select one
-- chosen implement directly, instead of cycling with G? Console commands,
-- run in a tractor with its implements attached:
--   ccRig         the rig as the game sees it: the attach tree (front or
--                 rear), the selectable objects in the game's order, what
--                 is selected, the selection functions and input actions
--   ccSelect <n>  select object <n> of ccRig's list directly, then report
--                 which call worked and what is selected now
--   ccKeys        which object the implement keys (lower, turn on, fold,
--                 attach) act on right now
-- Everything goes to log.txt as well. FS22 names, unverified in FS25: all
-- guarded, a failure is reported, never the game. Removed once C3 is built.

Companion = Companion or {}

local Api = Companion.Api

local Probe = {}
Companion.SelectionProbe = Probe

local COMMANDS = {
    { "ccRig", "Companion: dump the rig and the game's selection", "consoleRig" },
    { "ccSelect", "Companion: select object <n> of ccRig's list", "consoleSelect" },
    { "ccKeys", "Companion: which object the implement keys act on", "consoleKeys" },
}

-- the implement keys and the cycle keys' likely names (dumped either way)
local KEY_ACTIONS = { "LOWER_IMPLEMENT", "IMPLEMENT_EXTRA", "IMPLEMENT_EXTRA2", "ATTACH", "DETACH" }

local lines

local function out(msg)
    lines[#lines + 1] = msg
    print("[FS25_Companion] selection probe: " .. msg)
end

local function nameOf(object)
    if type(object) ~= "table" then
        return tostring(object)
    end
    local name = Api.tryCall(object, "getFullName") or Api.tryCall(object, "getName")
        or object.typeName or object.configFileName
    return tostring(name)
end

-- the vehicle behind a selectable object (FS22: object.vehicle) or itself
local function vehicleOf(object)
    if type(object) == "table" and type(object.vehicle) == "table" then
        return object.vehicle
    end
    return object
end

local function rootOf(vehicle)
    local root = Api.tryCall(vehicle, "getRootVehicle")
    if type(root) == "table" then
        return root
    end
    return vehicle
end

-- the selectable objects in the game's order (FS22: root.selectableObjects)
local function selectables(root)
    local list = {}
    if type(root.selectableObjects) == "table" then
        for _, object in ipairs(root.selectableObjects) do
            list[#list + 1] = object
        end
    end
    return list
end

local function selectedNow(root)
    local object = Api.tryCall(root, "getSelectedObject")
    local vehicle = Api.tryCall(root, "getSelectedVehicle")
    local current = root.currentSelection
    local index = type(current) == "table" and current.index or nil
    local sub = type(current) == "table" and current.subIndex or nil
    return object, vehicle, index, sub
end

local function describeSelected(root)
    local object, vehicle, index, sub = selectedNow(root)
    return string.format("getSelectedObject = %s, getSelectedVehicle = %s, currentSelection index %s sub %s",
        object ~= nil and nameOf(vehicleOf(object)) or "nil",
        vehicle ~= nil and nameOf(vehicle) or "nil", tostring(index), tostring(sub))
end

-- function names containing `part` on the object and its class chain
local function functionsWith(object, part)
    local found, seen = {}, {}
    local t, depth = object, 0
    while type(t) == "table" and depth < 8 do
        for key, value in pairs(t) do
            if type(key) == "string" and type(value) == "function" and not seen[key]
                and key:lower():find(part, 1, true) then
                seen[key] = true
                found[#found + 1] = key
            end
        end
        local meta = getmetatable(t)
        t = type(meta) == "table" and meta.__index or nil
        depth = depth + 1
    end
    table.sort(found)
    return found
end

-- front or rear from the joint's position in the parent's frame
local function side(parent, jointIndex)
    local spec = parent.spec_attacherJoints
    local joints = type(spec) == "table" and spec.attacherJoints or nil
    local joint = type(joints) == "table" and joints[jointIndex] or nil
    if type(joint) ~= "table" then
        return "joint ?"
    end
    local text = "jointType " .. tostring(joint.jointType)
    if localToLocal ~= nil and joint.jointTransform ~= nil and parent.rootNode ~= nil then
        local ok, _, _, z = pcall(localToLocal, joint.jointTransform, parent.rootNode, 0, 0, 0)
        if ok and type(z) == "number" then
            text = text .. string.format(", z %.2f (%s)", z, z >= 0 and "front" or "rear")
        end
    end
    return text
end

local function tree(vehicle, depth)
    local attached = Api.tryCall(vehicle, "getAttachedImplements")
    if type(attached) ~= "table" then
        return
    end
    for _, entry in pairs(attached) do
        if type(entry) == "table" and type(entry.object) == "table" then
            local child = entry.object
            out(string.format("%s%s: %s, joint %s, %s, selected %s", string.rep("  ", depth),
                nameOf(child), tostring(child.typeName), tostring(entry.jointDescIndex),
                side(vehicle, entry.jointDescIndex), tostring(Api.tryCall(child, "getIsSelected"))))
            tree(child, depth + 1)
        end
    end
end

local function inputActionsWith(parts)
    local found = {}
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table" then
        return found
    end
    for name in pairs(binding.nameActions) do
        for _, part in ipairs(parts) do
            if type(name) == "string" and name:find(part, 1, true) then
                found[#found + 1] = name
                break
            end
        end
    end
    table.sort(found)
    return found
end

-- the objects the active events of an input action belong to
local function eventTargets(name)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return "no input binding"
    end
    local action = binding.nameActions[name]
    local events = action ~= nil and binding.actionEvents[action] or nil
    if type(events) ~= "table" then
        return "no events"
    end
    local names = {}
    for _, event in pairs(events) do
        if type(event) == "table" then
            names[#names + 1] = nameOf(event.targetObject) .. (event.isActive == false and " (inactive)" or "")
        end
    end
    return #names > 0 and table.concat(names, "; ") or "no events"
end

local function controlledRoot()
    local vehicle = Api.controlledVehicle()
    if vehicle == nil then
        out("not in a vehicle")
        return nil
    end
    return rootOf(vehicle)
end

local function run(fn, ...)
    lines = {}
    local ok, err = pcall(fn, ...)
    if not ok then
        out("failed: " .. tostring(err))
    end
    return table.concat(lines, "\n")
end

local function rig()
    local root = controlledRoot()
    if root == nil then
        return
    end
    out("root " .. nameOf(root) .. ", " .. describeSelected(root))
    out("attach tree:")
    tree(root, 1)
    local list = selectables(root)
    out(string.format("selectableObjects: %d (ccSelect <n>)", #list))
    for i, object in ipairs(list) do
        local subs = type(object.subSelections) == "table" and #object.subSelections or 0
        out(string.format("  %d: %s, index %s, isActive %s, subSelections %d", i,
            nameOf(vehicleOf(object)), tostring(object.index), tostring(object.isActive), subs))
    end
    out("root functions with 'selec': " .. table.concat(functionsWith(root, "selec"), ", "))
    out("input actions SWITCH/SELECT: "
        .. table.concat(inputActionsWith({ "SWITCH", "SELECT" }), ", "))
end

local function keys()
    local root = controlledRoot()
    if root == nil then
        return
    end
    out(describeSelected(root))
    for _, name in ipairs(KEY_ACTIONS) do
        out(name .. " -> " .. eventTargets(name))
    end
end

-- each way to select `object` the FS22 API offers, until one sticks
local function select(index)
    local root = controlledRoot()
    if root == nil then
        return
    end
    local list = selectables(root)
    local n = tonumber(index)
    local object = n ~= nil and list[n] or nil
    if object == nil then
        out(string.format("no object %s (ccRig lists %d)", tostring(index), #list))
        return
    end
    local target = vehicleOf(object)
    out("before: " .. describeSelected(root))
    out("target " .. n .. ": " .. nameOf(target))
    local tries = {
        { "setSelectedObject(object)", function() root:setSelectedObject(object) end, root.setSelectedObject },
        { "setSelectedVehicle(vehicle)", function() root:setSelectedVehicle(target) end, root.setSelectedVehicle },
        { "setSelectedVehicle(vehicle, 1)", function() root:setSelectedVehicle(target, 1) end, root.setSelectedVehicle },
    }
    for _, try in ipairs(tries) do
        if type(try[3]) ~= "function" then
            out(try[1] .. ": missing")
        else
            local ok, err = pcall(try[2])
            local object2, vehicle2 = selectedNow(root)
            local hit = object2 == object or vehicle2 == target
            out(string.format("%s: %s, selected %s now", try[1], ok and "ran" or ("error " .. tostring(err)),
                hit and "the target" or "something else"))
            if hit then
                break
            end
        end
    end
    out("after: " .. describeSelected(root))
    out("run ccKeys next to see whether the implement keys followed")
end

function Probe.consoleRig()
    return run(rig)
end

function Probe.consoleSelect(_, index)
    return run(select, index)
end

function Probe.consoleKeys()
    return run(keys)
end

function Probe.register()
    if addConsoleCommand == nil then
        return
    end
    for _, c in ipairs(COMMANDS) do
        pcall(addConsoleCommand, c[1], c[2], c[3], Probe)
    end
end

function Probe.unregister()
    if removeConsoleCommand == nil then
        return
    end
    for _, c in ipairs(COMMANDS) do
        pcall(removeConsoleCommand, c[1])
    end
end
