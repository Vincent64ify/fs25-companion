-- Transport.lua
-- Writes protocol envelopes, one JSON object per line, to a plain file:
--     {"data":{...},"seq":1234,"t":5123456,"topic":"player","v":1}
--
-- The file is opened with "w" (truncate) and kept open. Lines are buffered
-- and written + flushed once per tick. When the file reaches maxBytes it is
-- closed and reopened with "w": the reader sees the file shrink and starts
-- again from offset 0. The caller re-emits `hello` after a rotation so a
-- late reader always gets the session context.
--
-- File handles in GIANTS Lua have no read method; this module only writes.

Companion = Companion or {}

local Transport = {}
Transport.__index = Transport
Companion.Transport = Transport

Transport.PROTOCOL_VERSION = 1
Transport.DEFAULT_MAX_BYTES = 2 * 1024 * 1024

function Transport.new(path, maxBytes)
    local self = setmetatable({}, Transport)
    self.path = path
    self.maxBytes = maxBytes or Transport.DEFAULT_MAX_BYTES
    self.file = nil
    self.bytes = 0
    self.seq = 0
    self.buffer = {}
    self.rotations = 0
    return self
end

function Transport:open()
    self:close()
    local f, err = io.open(self.path, "w")
    if f == nil then
        return false, err
    end
    self.file = f
    self.bytes = 0
    return true
end

function Transport:isOpen()
    return self.file ~= nil
end

function Transport:close()
    if self.file ~= nil then
        pcall(self.file.flush, self.file)
        pcall(self.file.close, self.file)
        self.file = nil
    end
    self.buffer = {}
end

-- Queue one envelope. Encoding errors are the caller's (scheduler's) to catch.
function Transport:send(topic, t, data)
    self.seq = self.seq + 1
    self.buffer[#self.buffer + 1] = Companion.Json.encode({
        v = Transport.PROTOCOL_VERSION,
        seq = self.seq,
        t = t,
        topic = topic,
        data = data,
    }) .. "\n"
end

-- Write the queued lines. Returns true when the file was rotated, so the
-- caller can re-emit hello.
function Transport:flush()
    if self.file == nil or #self.buffer == 0 then
        self.buffer = {}
        return false
    end
    local text = table.concat(self.buffer)
    self.buffer = {}
    self.file:write(text)
    self.file:flush()
    self.bytes = self.bytes + #text
    if self.bytes >= self.maxBytes then
        self.rotations = self.rotations + 1
        local ok = self:open()
        return ok
    end
    return false
end
