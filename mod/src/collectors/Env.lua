-- Env.lua
-- Time, day, weather, temperatures and money, once per second.
-- Weather and money calls come from the old telemetry mod and are not
-- verified against FS25 yet; each value is guarded and left out on failure.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api
local Geo = Companion.Geo

local SIX_HOURS_MS = 6 * 60 * 60 * 1000

local function weatherData(environment)
    local weather = environment.weather
    if weather == nil then
        return nil
    end
    local out = {}
    local minTemp, maxTemp = Api.tryCallAll(weather, "getCurrentMinMaxTemperatures")
    out.tempMin = Geo.round(minTemp, 1)
    out.tempMax = Geo.round(maxTemp, 1)
    out.tempTrend = Api.tryCall(weather, "getCurrentTemperatureTrend")
    out.current = Api.tryCall(weather, "getWeatherTypeAtTime",
        environment.currentDay, environment.dayTime)
    local nextDay, nextTime = Api.tryCallAll(environment, "getDayAndDayTime",
        (environment.dayTime or 0) + SIX_HOURS_MS, environment.currentDay)
    if nextDay ~= nil then
        out.next = Api.tryCall(weather, "getWeatherTypeAtTime", nextDay, nextTime)
    end
    return out
end

-- farmId (as a string key) -> money, for every farm
local function farmMoney()
    local farmManager = g_farmManager
    if farmManager == nil then
        return nil
    end
    local farms = Api.tryCall(farmManager, "getFarms") or farmManager.farms
    if type(farms) ~= "table" then
        return nil
    end
    local out = {}
    for _, farm in pairs(farms) do
        if type(farm) == "table" and farm.farmId ~= nil and type(farm.money) == "number" then
            out[tostring(farm.farmId)] = Geo.round(farm.money, 0)
        end
    end
    return out
end

Companion.Collectors.Env = {
    topic = "env",
    interval = 1000,
    collect = function(ctx)
        local mission = g_currentMission
        local environment = mission.environment
        local data = {
            money = farmMoney(),
        }
        if environment ~= nil then
            data.day = environment.currentDay
            data.season = environment.currentSeason
            if type(environment.dayTime) == "number" then
                data.dayTimeMinutes = math.floor(environment.dayTime / 60000)
            end
            data.weather = weatherData(environment)
        end
        if data.money == nil and mission.missionInfo ~= nil
            and type(mission.missionInfo.money) == "number" then
            -- single-farm fallback from the old mod
            local farmId = g_localPlayer ~= nil and g_localPlayer.farmId or 1
            data.money = { [tostring(farmId)] = Geo.round(mission.missionInfo.money, 0) }
        end
        return data
    end,
}
