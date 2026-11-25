-- collectors/SteeringPreview.lua
-- The steering_preview topic (specs/0022): the course the game's builder
-- made for the dashboard's Steering Assist settings before Apply, never
-- given to the vehicle (SteeringCommands.lua runs the build). Latest wins:
--
--   {"key":3,"for":"width=6.6;headlands=2;direction=45;offset=0","state":"building"}
--   {"key":3,"for":"...","state":"ready","width":6.6,"boundary":[...],"segments":[...]}
--   {"key":3,"for":"...","state":"none"}     (the game built no lanes)
--   {"key":3,"for":"...","state":"failed"}   (no answer, or another vehicle)
--
-- `for` is the command's settings attribute as it was sent, for the web to
-- match against the draft it asked for; the course is steering_course's
-- shape (specs/0021). Sent the frame after it changes, and again after a
-- file rotation.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local function state()
    return Companion.SteeringCommands.previewState()
end

Companion.Collectors.SteeringPreview = {
    topic = "steering_preview",
    -- nothing to do but on a change
    interval = 1000,
    resend = true,
    reset = function()
        Companion.SteeringCommands.resetPreview()
    end,
    changed = function()
        return state().dirty
    end,
    collect = function(ctx)
        local p = state()
        if not p.dirty then
            return nil
        end
        p.dirty = false
        return p.data
    end,
}
