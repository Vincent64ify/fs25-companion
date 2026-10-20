-- Json.lua
-- Small JSON encoder. GIANTS Lua (Luau) ships no json library.
--
-- * NaN and +/-inf encode as null (JSON has no representation for them)
-- * integral numbers encode without a fraction, others with %.14g
-- * a table is an array when its keys are exactly 1..n, otherwise an object
--   with keys sorted, so the output is deterministic
-- * an empty table encodes as [] (collectors use string keys for objects
--   that may be empty)

Companion = Companion or {}

local Json = {}
Companion.Json = Json

local ESCAPES = {
    ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
    ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

local function escapeString(s)
    return '"' .. s:gsub('[%c"\\]', function(c)
        return ESCAPES[c] or string.format("\\u%04x", c:byte())
    end) .. '"'
end

local function keyLess(a, b)
    local ta, tb = type(a), type(b)
    if ta ~= tb then
        return ta < tb
    end
    if ta == "number" or ta == "string" then
        return a < b
    end
    return tostring(a) < tostring(b)
end

local function sortedKeys(t)
    local keys = {}
    for k in pairs(t) do
        keys[#keys + 1] = k
    end
    table.sort(keys, keyLess)
    return keys
end

local function isArray(t)
    local n = 0
    for k in pairs(t) do
        if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then
            return false
        end
        n = n + 1
    end
    for i = 1, n do
        if t[i] == nil then
            return false
        end
    end
    return true
end

local function encodeValue(v, buf)
    local tv = type(v)
    if tv == "nil" then
        buf[#buf + 1] = "null"
    elseif tv == "boolean" then
        buf[#buf + 1] = v and "true" or "false"
    elseif tv == "number" then
        if v ~= v or v == math.huge or v == -math.huge then
            buf[#buf + 1] = "null"
        elseif v % 1 == 0 and v > -1e15 and v < 1e15 then
            buf[#buf + 1] = string.format("%d", v)
        else
            buf[#buf + 1] = string.format("%.14g", v)
        end
    elseif tv == "string" then
        buf[#buf + 1] = escapeString(v)
    elseif tv == "table" then
        if isArray(v) then
            buf[#buf + 1] = "["
            for i = 1, #v do
                if i > 1 then
                    buf[#buf + 1] = ","
                end
                encodeValue(v[i], buf)
            end
            buf[#buf + 1] = "]"
        else
            buf[#buf + 1] = "{"
            local first = true
            for _, k in ipairs(sortedKeys(v)) do
                if not first then
                    buf[#buf + 1] = ","
                end
                first = false
                buf[#buf + 1] = escapeString(tostring(k))
                buf[#buf + 1] = ":"
                encodeValue(v[k], buf)
            end
            buf[#buf + 1] = "}"
        end
    else
        -- functions, userdata: never part of the protocol
        buf[#buf + 1] = "null"
    end
end

function Json.encode(v)
    local buf = {}
    encodeValue(v, buf)
    return table.concat(buf)
end
