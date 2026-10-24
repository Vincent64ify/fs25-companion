-- Env.lua
-- Time, day, weather, temperatures, money and the player's units, once per
-- second. Weather and money calls come from the old telemetry mod, the unit
-- settings from the FS22 script docs; none is verified against FS25 yet, and
-- each value is guarded and left out on failure.

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

-- GameSettings.SETTING.* ids, with FS22's names if the table is missing
local UNIT_SETTINGS = {
    { key = "miles", setting = "USE_MILES", name = "useMiles" },
    { key = "fahrenheit", setting = "USE_FAHRENHEIT", name = "useFahrenheit" },
    { key = "acres", setting = "USE_ACRE", name = "useAcre" },
}
-- GS_MONEY_EURO 1, GS_MONEY_DOLLAR 2, GS_MONEY_POUND 3
local MONEY_SYMBOLS = { "€", "$", "£" }

local function settingValue(setting, name)
    local ids = type(GameSettings) == "table" and GameSettings.SETTING or nil
    local id = type(ids) == "table" and ids[setting] or name
    return Api.tryCall(g_gameSettings, "getValue", id)
end

-- the units the player picked in the game's settings: miles, fahrenheit
-- and acres (booleans) and the currency symbol. Nil when nothing is known;
-- the dashboard then shows metric units.
local function unitSettings()
    local out = {}
    for _, unit in ipairs(UNIT_SETTINGS) do
        local value = settingValue(unit.setting, unit.name)
        if type(value) == "boolean" then
            out[unit.key] = value
        end
    end
    local symbol = Api.tryCall(g_i18n, "getCurrencySymbol", true)
    if type(symbol) ~= "string" or symbol == "" then
        symbol = MONEY_SYMBOLS[settingValue("MONEY_UNIT", "moneyUnit")]
    end
    out.currency = symbol
    return next(out) ~= nil and out or nil
end

Companion.Collectors.Env = {
    topic = "env",
    interval = 1000,
    collect = function(ctx)
        local mission = g_currentMission
        local environment = mission.environment
        local data = {
            money = farmMoney(),
            units = unitSettings(),
        }
        if environment ~= nil then
            data.day = environment.currentDay
            data.season = environment.currentSeason
            -- the game's period: 1 = March ... 12 = February, as its calendar
            -- shows it. The dashboard names the season from it.
            local period = environment.currentPeriod
            if type(period) ~= "number" then
                period = Api.tryCall(environment, "getPeriodFromDay", environment.currentDay)
            end
            if type(period) == "number" then
                data.month = (math.floor(period) + 1) % 12 + 1
            end
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
