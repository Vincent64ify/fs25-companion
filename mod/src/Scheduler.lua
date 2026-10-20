-- Scheduler.lua
-- Runs collectors at their own interval and sends what they return.
--
-- Collector contract:
--     { topic = "vehicles", interval = 500, collect = function(ctx) return data end }
-- * interval in ms; nil means "only when asked" (see emit), used by hello
-- * collect returns the topic's data table, or nil to send nothing this tick
--   (for example while the player isn't spawned yet)
-- * every call runs under pcall: a failing API call drops that topic for
--   that tick and is logged once, never the game or the other topics
-- * optional reset(): called when the collector is added (once per map), to
--   clear state kept from the previous map
-- * optional resend = true: the last data sent is sent again after a file
--   rotation, for topics sent only once (the farmland grid)
--
-- Luau has no coroutines, so expensive work is an explicit cursor job: a
-- collector with interval 0 runs every frame, does a bounded slice of work
-- and returns nil until the job is done (see collectors/FarmlandGrid.lua).

Companion = Companion or {}

local Scheduler = {}
Scheduler.__index = Scheduler
Companion.Scheduler = Scheduler

function Scheduler.new(transport, log)
    local self = setmetatable({}, Scheduler)
    self.transport = transport
    self.log = log or print
    self.collectors = {}
    self.byTopic = {}
    return self
end

function Scheduler:add(collector)
    if collector.reset ~= nil then
        local ok, err = pcall(collector.reset)
        if not ok then
            self.log(string.format("topic %s reset failed: %s", collector.topic, tostring(err)))
        end
    end
    local entry = {
        collector = collector,
        -- due on the first update
        elapsed = collector.interval or 0,
        failing = false,
        last = nil,
    }
    self.collectors[#self.collectors + 1] = entry
    self.byTopic[collector.topic] = entry
end

function Scheduler:run(entry, ctx)
    local c = entry.collector
    local ok, data = pcall(c.collect, ctx)
    if ok and data ~= nil then
        local sent = data
        ok, data = pcall(self.transport.send, self.transport, c.topic, ctx.time, data)
        if ok and c.resend then
            entry.last = sent
        end
    end
    if not ok then
        if not entry.failing then
            self.log(string.format("topic %s failed: %s", c.topic, tostring(data)))
        end
        entry.failing = true
    elseif entry.failing then
        self.log(string.format("topic %s recovered", c.topic))
        entry.failing = false
    end
end

function Scheduler:update(dt, ctx)
    for _, entry in ipairs(self.collectors) do
        local interval = entry.collector.interval
        if interval ~= nil then
            entry.elapsed = entry.elapsed + dt
            if entry.elapsed >= interval then
                -- keep the remainder, but don't burst after a long frame
                entry.elapsed = math.min(entry.elapsed - interval, interval)
                self:run(entry, ctx)
            end
        end
    end
end

-- Collect and send one topic now, regardless of its interval.
function Scheduler:emit(topic, ctx)
    local entry = self.byTopic[topic]
    if entry ~= nil then
        self:run(entry, ctx)
    end
end

-- After a file rotation: hello again (collected fresh), then the last data
-- of every resend topic, so a reader that starts on the new file has them.
function Scheduler:resend(ctx)
    self:emit("hello", ctx)
    for _, entry in ipairs(self.collectors) do
        local c = entry.collector
        if c.resend and entry.last ~= nil then
            local ok, err = pcall(self.transport.send, self.transport, c.topic, ctx.time, entry.last)
            if not ok then
                self.log(string.format("topic %s resend failed: %s", c.topic, tostring(err)))
            end
        end
    end
end
