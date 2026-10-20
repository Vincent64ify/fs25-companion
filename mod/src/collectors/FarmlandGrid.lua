-- FarmlandGrid.lua
-- Which farmland covers each spot of the map, sampled once per map with
-- g_farmlandManager:getFarmlandIdAtWorldPosition on a grid: 4 m cells on a
-- 2 km map, at most 512 cells a side. The dashboard traces the farmland
-- outlines from it, so no map files need parsing.
--
-- Phase 0 timed the lookup at 7.4 ms per 10,000 calls, so the whole grid
-- costs about 200 ms. It runs as a cursor job: CELLS_PER_FRAME lookups per
-- frame (about 3 ms), done a second or two after loading.
--
-- data: {cell, cols, rows, originX, originZ, runs}
--   cells go row by row (x first, then z) from (originX, originZ) and each
--   is sampled at its centre. runs is run-length encoded and flattened:
--   [id, count, id, count, ...], with id 0 = no farmland (the game's 255).

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local MIN_CELL_M = 4
local MAX_CELLS_PER_SIDE = 512
local CELLS_PER_FRAME = 4096
local NO_FARMLAND = 255

local job = nil

local function newJob()
    local size = g_currentMission.terrainSize
    if type(size) ~= "number" or size <= 0 or g_farmlandManager == nil then
        return nil
    end
    local cell = math.max(MIN_CELL_M, size / MAX_CELLS_PER_SIDE)
    local cols = math.ceil(size / cell)
    return {
        cell = cell,
        cols = cols,
        rows = cols,
        originX = -size / 2,
        originZ = -size / 2,
        index = 0,
        runs = {},
        runId = nil,
        runLength = 0,
        done = false,
    }
end

local function pushRun(j)
    if j.runId ~= nil then
        j.runs[#j.runs + 1] = j.runId
        j.runs[#j.runs + 1] = j.runLength
    end
end

Companion.Collectors.FarmlandGrid = {
    topic = "farmland_grid",
    interval = 0,
    resend = true,
    reset = function()
        job = nil
    end,
    collect = function(ctx)
        if job == nil then
            job = newJob()
            if job == nil then
                return nil
            end
        end
        if job.done then
            return nil
        end
        local j = job
        local manager = g_farmlandManager
        local total = j.cols * j.rows
        local stop = math.min(total, j.index + CELLS_PER_FRAME)
        while j.index < stop do
            local col = j.index % j.cols
            local row = (j.index - col) / j.cols
            local id = manager:getFarmlandIdAtWorldPosition(
                j.originX + (col + 0.5) * j.cell, j.originZ + (row + 0.5) * j.cell)
            if type(id) ~= "number" or id == NO_FARMLAND then
                id = 0
            end
            if id == j.runId then
                j.runLength = j.runLength + 1
            else
                pushRun(j)
                j.runId = id
                j.runLength = 1
            end
            -- only after a successful lookup: a lookup that raises is
            -- retried next frame (and logged once by the scheduler)
            j.index = j.index + 1
        end
        if j.index < total then
            return nil
        end
        pushRun(j)
        j.done = true
        return {
            cell = j.cell,
            cols = j.cols,
            rows = j.rows,
            originX = j.originX,
            originZ = j.originZ,
            runs = j.runs,
        }
    end,
}
