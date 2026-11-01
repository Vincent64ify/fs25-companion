-- state/Rig.lua
-- The tractor and everything attached, the selection and which tool each
-- implement key acts on. All guarded.

Companion = Companion or {}

local Api = Companion.Api

-- the one VehicleState table, filled by the files in state/ (specs/0009)
local VehicleState = Companion.VehicleState or {}
Companion.VehicleState = VehicleState

-- Rig (Controls C3) ---------------------------------------------------------
-- The tractor and everything attached, and which tool each implement key
-- acts on. Verified live with the selection spike (mod 0.6.4, PLAN.md C3):
-- root:setSelectedObject(entry of root.selectableObjects) selects one tool
-- directly; a joint's z in its vehicle's frame says front (>= 0) or rear;
-- some keys stay with a tool that isn't selected (fold stayed on the
-- cultivator with the loader selected), as the game intends.

local function rootOf(vehicle)
    local root = Api.tryCall(vehicle, "getRootVehicle")
    return type(root) == "table" and root or vehicle
end
VehicleState.rootOf = rootOf

-- the vehicle behind a selectable object (object.vehicle) or the object
local function vehicleOf(object)
    if type(object) == "table" and type(object.vehicle) == "table" then
        return object.vehicle
    end
    return object
end

-- the root's selectable objects in the game's order (what G cycles)
function VehicleState.selectables(root)
    local list = {}
    if type(root) == "table" and type(root.selectableObjects) == "table" then
        for _, object in ipairs(root.selectableObjects) do
            if type(object) == "table" then
                list[#list + 1] = { object = object, vehicle = vehicleOf(object) }
            end
        end
    end
    return list
end

-- the parent's attacher joint at this index, or nil
local function jointAt(parent, jointIndex)
    local spec = parent.spec_attacherJoints
    local joints = type(spec) == "table" and spec.attacherJoints or nil
    local joint = type(joints) == "table" and jointIndex ~= nil and joints[jointIndex] or nil
    return type(joint) == "table" and joint or nil
end

-- "front" or "rear" from the attacher joint, nil when unknown
local function sideOf(parent, jointIndex)
    local joint = jointAt(parent, jointIndex)
    if joint == nil or joint.jointTransform == nil or parent.rootNode == nil
        or localToLocal == nil then
        return nil
    end
    local ok, _, _, z = pcall(localToLocal, joint.jointTransform, parent.rootNode, 0, 0, 0)
    if not ok or type(z) ~= "number" then
        return nil
    end
    return z >= 0 and "front" or "rear"
end

-- Vehicle screen (specs/0002): the coupling's name, the attacher joint's
-- type as the game registered it ("implement", "trailer", "frontloader"):
-- its jointType number, looked up backwards in
-- AttacherJoints.jointTypeNameToInt. Unverified (the spec's spike).
local jointNames, jointNamesOf = {}, nil

local function jointTypeName(parent, jointIndex)
    local registry = type(AttacherJoints) == "table" and AttacherJoints.jointTypeNameToInt or nil
    if type(registry) ~= "table" then
        return nil
    end
    if registry ~= jointNamesOf then
        jointNames, jointNamesOf = {}, registry
        for name, n in pairs(registry) do
            if type(name) == "string" then
                jointNames[n] = name
            end
        end
    end
    local joint = jointAt(parent, jointIndex)
    return joint ~= nil and joint.jointType ~= nil and jointNames[joint.jointType] or nil
end

local MAX_RIG_DEPTH = 6

-- every attached object, depth first: {object, parent, depth, side, joint};
-- a tool on a tool (a loader's bucket) takes its parent's side
function VehicleState.attachedTree(vehicle)
    local out = {}
    local function walk(parent, depth, parentSide)
        local attached = Api.tryCall(parent, "getAttachedImplements")
        if type(attached) ~= "table" then
            return
        end
        for _, entry in pairs(attached) do
            local object = type(entry) == "table" and entry.object or nil
            if type(object) == "table" then
                local side = parentSide or sideOf(parent, entry.jointDescIndex)
                out[#out + 1] = { object = object, parent = parent, depth = depth, side = side,
                    joint = jointTypeName(parent, entry.jointDescIndex) }
                if depth < MAX_RIG_DEPTH then
                    walk(object, depth + 1, side)
                end
            end
        end
    end
    walk(vehicle, 1, nil)
    return out
end

-- the object whose live event an input action would run now (the first
-- active one), or nil; names: one input action, or a list tried in order
function VehicleState.keyTarget(names)
    local binding = g_inputBinding
    if type(binding) ~= "table" or type(binding.nameActions) ~= "table"
        or type(binding.actionEvents) ~= "table" then
        return nil
    end
    for _, name in ipairs(type(names) == "table" and names or { names }) do
        local action = binding.nameActions[name]
        local events = action ~= nil and binding.actionEvents[action] or nil
        if type(events) == "table" then
            for _, event in pairs(events) do
                if type(event) == "table" and event.isActive ~= false and type(event.targetObject) == "table" then
                    return event.targetObject
                end
            end
        end
    end
    return nil
end

-- the implement keys, by the cab's name for them. The Implement screen's:
-- the pipe (O), unloading or tipping (I, else Ctrl+I to the ground, the
-- one the game has live), the cover (N) and lower all (Ctrl+V).
VehicleState.KEYS = {
    lower = "LOWER_IMPLEMENT", fold = "IMPLEMENT_EXTRA2", turnOn = "IMPLEMENT_EXTRA",
    pipe = "TOGGLE_PIPE", unload = { "TOGGLE_TIPSTATE", "TOGGLE_TIPSTATE_GROUND" }, cover = "TOGGLE_COVER",
    lowerAll = "LOWER_ALL_IMPLEMENTS", straw = "TOGGLE_CHOPPER",
}

-- the cab's rig: the controlled vehicle first, then what's attached, each
-- with its id, parent's id, depth, side, whether the game can select it
-- and has it selected; the tools also carry their implement state
function VehicleState.rig(vehicle)
    local root = rootOf(vehicle)
    local selectable = {}
    for _, entry in ipairs(VehicleState.selectables(root)) do
        selectable[entry.vehicle] = true
    end
    local selected = Api.tryCall(root, "getSelectedVehicle")
    local function mark(e, object)
        e.id = object.id
        e.selectable = selectable[object] == true
        e.selected = selected == object
        return e
    end
    local head = { name = Api.tryCall(vehicle, "getFullName") or vehicle.typeName, depth = 0 }
    -- a combine works itself: threshing is its turn on
    if vehicle.spec_turnOnVehicle ~= nil then
        head.turnedOn = Api.tryCall(vehicle, "getIsTurnedOn") == true
        head.canTurnOn = true
    end
    -- a combine folds itself too (its ladder, tank extensions): F unfolds it
    if VehicleState.fold(vehicle, head) then
        head.foldable = true
    end
    local rig = { mark(VehicleState.capabilities(vehicle, VehicleState.extras(vehicle, head), 0), vehicle) }
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        local e = mark(VehicleState.extras(node.object, VehicleState.implement(node.object)), node.object)
        VehicleState.capabilities(node.object, e, node.depth)
        -- a joint that lowers it: a mower folded for transport still lowers
        for _, cap in ipairs(e.can) do
            if cap == "lower" then
                e.canLower = true
            end
        end
        e.parent = node.parent.id
        e.depth = node.depth
        e.side = node.side
        e.joint = node.joint
        rig[#rig + 1] = e
    end
    -- the selected one's other keys (specs/0003); the vehicle's without its
    -- driving keys (specs/0011)
    for i, e in ipairs(rig) do
        if e.selected then
            local object = i == 1 and vehicle or VehicleState.attachedById(vehicle, e.id)
            local keys = object ~= nil and VehicleState.extraKeys(object, e.can, i == 1) or {}
            if #keys > 0 then
                e.extraKeys = keys
            end
        end
    end
    return rig
end

-- which object's id each implement key acts on right now
function VehicleState.keys()
    local out = {}
    for key, input in pairs(VehicleState.KEYS) do
        local target = VehicleState.keyTarget(input)
        if target ~= nil then
            out[key] = target.id
        end
    end
    return out
end

-- the attached object with this id, or nil
function VehicleState.attachedById(vehicle, id)
    for _, node in ipairs(VehicleState.attachedTree(vehicle)) do
        if node.object.id == id then
            return node.object
        end
    end
    return nil
end
