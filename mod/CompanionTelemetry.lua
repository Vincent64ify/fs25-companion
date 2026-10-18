-- CompanionTelemetry.lua
-- FS25 Companion — in-game telemetry mod
--
-- Writes a framed telemetry stream to the Windows named pipe
-- \\.\pipe\fssimx. The pipe instance is created by an external consumer
-- (the companion client, see ../client); the game connects to it as a pipe
-- client. If no consumer is running, io.open fails and telemetry is
-- silently skipped — the game itself is never affected.
--
-- Wire format (text, fields separated by '<'):
--     HEADER<key1<key2<...<BODY<val1<val2<...<HEADER<...
-- The HEADER frame (re-sent every `RefreshRate` updates) lists the keys in
-- the exact order their values appear in the following BODY frame. Table
-- values are joined with '>' (trailing '>'). Booleans are 1/0, numbers are
-- %d or %.2f.
--
-- Based on "FarmingSimulatorTelemetry" by Marciel Grützmann
-- (https://github.com/Marciel032/FarmingSimulatorTelemetry) and the FS25
-- conversion by upsidedown (https://github.com/upsidedownLS13/LS25_FSTelemetry),
-- both MIT licensed.
--
-- Changes for FS25 Companion:
--   * adds PositionX/Y/Z, Heading, MapName, PlayerName, SessionId, IsMultiplayer
--   * trimmed vehicle fields to what the dashboard needs (the base mod has
--     more: lights detail, cruise control, wipers, tyre defl/air, prices, …)
--   * same pipe name and wire format as the base mod (drop-in compatible)

CompanionTelemetry = {}
local CT = CompanionTelemetry

local CTContext = {
    PipeName = "\\\\.\\pipe\\fssimx",
    Pipe = nil,
    RefreshRate = 100,        -- re-open the pipe every N updates (~1.6 s)
    RefreshCurrent = -1,
    UpdateInterval = { Target = 16.66, Current = 0.0 },  -- ~60 Hz cap
    MaxImplementsDepth = 6,
    SessionId = "",
    Telemetry = {},
}

local function sortedKeys(t)
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = k end
    table.sort(keys)
    return keys
end

---------------------------------------------------------------------------
-- Mod event listener interface
---------------------------------------------------------------------------

function CompanionTelemetry:loadMap(name)
    CTContext.SessionId = os.date("%Y%m%d%H%M%S") .. "-" .. math.random(100000, 999999)
    CTContext.Telemetry = {}
    CT:InitTelemetry()
end

function CompanionTelemetry:delete()
    CT:ClosePipe()
end

function CompanionTelemetry:saveToXMLFile(xmlFile, key)
    -- Close the pipe so a running consumer doesn't hold the save
    CT:ClosePipe()
end

function CompanionTelemetry:update(dt)
    CTContext.UpdateInterval.Current = CTContext.UpdateInterval.Current + dt
    if CTContext.UpdateInterval.Current < CTContext.UpdateInterval.Target then
        return
    end
    CTContext.UpdateInterval.Current = 0

    CT:RefreshPipe()
    if CTContext.Pipe == nil then
        return
    end

    CT:ProcessSession()
    CT:ProcessGameData()
    CT:ProcessPlayer()
    CT:ProcessVehicle()
    CT:WriteTelemetry()
end

---------------------------------------------------------------------------
-- Telemetry defaults (defines the key set sent in HEADER frames)
---------------------------------------------------------------------------

function CT:InitTelemetry()
    local t = CTContext.Telemetry
    -- session
    t.SessionId = CTContext.SessionId
    t.MapName = ""
    t.PlayerName = ""
    t.IsMultiplayer = false
    -- game
    t.Money = 0.0
    t.TemperatureMin = 0.0
    t.TemperatureMax = 0.0
    t.TemperatureTrend = 0
    t.WeatherCurrent = 0
    t.WeatherNext = 0
    t.DayTimeMinutes = 0
    t.Day = 0
    -- player
    t.PositionX = 0.0
    t.PositionY = 0.0
    t.PositionZ = 0.0
    t.Heading = 0.0
    -- vehicle
    t.IsDrivingVehicle = false
    t.VehicleName = ""
    t.Speed = 0.0
    t.RPM = 0
    t.RPMMin = 0
    t.RPMMax = 0
    t.Gear = 0
    t.Fuel = 0.0
    t.FuelMax = 0.0
    t.Wear = 0.0
    t.OperationTimeMinutes = 0
    t.MotorTemperature = 0.0
    t.Mass = 0.0
    t.TotalMass = 0.0
    t.IsEngineStarted = false
    t.IsLightOn = false
    t.IsLightHighOn = false
    t.IsLightTurnLeftOn = false
    t.IsLightTurnRightOn = false
    t.IsLightHazardOn = false
    t.IsLightBeaconOn = false
    t.AttachedImplementsPosition = {}
    t.AttachedImplementsLowered = {}
    t.AttachedImplementsTurnedOn = {}
    t.AttachedImplementsWear = {}
end

---------------------------------------------------------------------------
-- Data collection
---------------------------------------------------------------------------

function CT:ProcessSession()
    local t = CTContext.Telemetry
    t.IsMultiplayer = g_environment ~= nil and g_environment.isMultiplayer == true
    t.MapName = ""
    t.PlayerName = ""

    local mission = g_currentMission
    if mission == nil then
        return
    end
    if mission.missionInfo ~= nil then
        -- TODO: verify the exact map-name field for FS25 (name vs mapName)
        t.MapName = mission.missionInfo.name or mission.missionInfo.mapName or ""
    end
    if mission.player ~= nil then
        t.PlayerName = mission.player.nickname or ""
    end
end

function CT:ProcessGameData()
    local t = CTContext.Telemetry
    t.Money = 0.0
    t.TemperatureMin = 0.0
    t.TemperatureMax = 0.0
    t.TemperatureTrend = 0
    t.WeatherCurrent = 0
    t.WeatherNext = 0
    t.DayTimeMinutes = 0
    t.Day = 0

    local mission = g_currentMission
    if mission == nil then
        return
    end
    if mission.missionInfo ~= nil then
        t.Money = mission.missionInfo.money or 0.0
    end

    local environment = mission.environment
    if environment == nil or environment.weather == nil then
        return
    end

    local weather = environment.weather
    local minTemp, maxTemp = weather:getCurrentMinMaxTemperatures()
    t.TemperatureMin = minTemp or 0.0
    t.TemperatureMax = maxTemp or 0.0
    t.TemperatureTrend = weather:getCurrentTemperatureTrend() or 0
    t.WeatherCurrent = weather:getWeatherTypeAtTime(environment.currentDay, environment.dayTime) or 0

    local sixHours = 6 * 60 * 60 * 1000
    local dayPlus6h, timePlus6h = environment:getDayAndDayTime(environment.dayTime + sixHours, environment.currentDay)
    t.WeatherNext = weather:getWeatherTypeAtTime(dayPlus6h, timePlus6h) or 0

    t.DayTimeMinutes = math.floor(environment.dayTime / (1000 * 60))
    t.Day = environment.currentDay
end

function CT:ProcessPlayer()
    local t = CTContext.Telemetry
    t.PositionX = 0.0
    t.PositionY = 0.0
    t.PositionZ = 0.0
    t.Heading = 0.0

    local mission = g_currentMission
    if mission == nil or mission.player == nil then
        return
    end

    local ok, x, y, z, rotY = pcall(function()
        return mission.player:getPositionData()
    end)
    if not ok or x == nil then
        x, y, z = mission.player:getPosition()
        rotY = nil
    end

    t.PositionX = x
    t.PositionY = y or 0.0
    t.PositionZ = z
    if rotY ~= nil then
        -- convention: 0 = north (up on the map), clockwise; the dashboard
        -- applies mapConfig.headingOffset for final calibration
        t.Heading = math.deg(-rotY) % 360
    end
end

local function getControlledVehicle()
    local mission = g_currentMission
    if mission == nil or mission.hud == nil or mission.hud.player == nil then
        return nil
    end
    local player = mission.hud.player
    if player.getCurrentVehicle == nil then
        return nil
    end
    local vehicle = player:getCurrentVehicle()
    if vehicle ~= nil and vehicle.spec_motorized ~= nil then
        return vehicle
    end
    return nil
end

function CT:ProcessVehicle()
    local t = CTContext.Telemetry
    t.IsDrivingVehicle = false
    t.VehicleName = ""
    t.Speed = 0.0
    t.RPM = 0
    t.RPMMin = 0
    t.RPMMax = 0
    t.Gear = 0
    t.Fuel = 0.0
    t.FuelMax = 0.0
    t.Wear = 0.0
    t.OperationTimeMinutes = 0
    t.MotorTemperature = 0.0
    t.Mass = 0.0
    t.TotalMass = 0.0
    t.IsEngineStarted = false
    t.IsLightOn = false
    t.IsLightHighOn = false
    t.IsLightTurnLeftOn = false
    t.IsLightTurnRightOn = false
    t.IsLightHazardOn = false
    t.IsLightBeaconOn = false
    t.AttachedImplementsPosition = {}
    t.AttachedImplementsLowered = {}
    t.AttachedImplementsTurnedOn = {}
    t.AttachedImplementsWear = {}

    local vehicle = getControlledVehicle()
    if vehicle == nil then
        return
    end

    t.IsDrivingVehicle = true
    t.VehicleName = vehicle.getFullName and vehicle:getFullName() or vehicle.name or ""

    local motor = vehicle.getMotor and vehicle:getMotor()
    local specMotorized = vehicle.spec_motorized
    local specLights = vehicle.spec_lights
    local specWearable = vehicle.spec_wearable

    -- speed (km/h)
    if specMotorized ~= nil and vehicle.getLastSpeed ~= nil then
        t.Speed = math.max(0.0, vehicle:getLastSpeed() * (specMotorized.speedDisplayScale or 3.6))
    end

    -- motor
    if motor ~= nil then
        if motor.getMinRpm then t.RPMMin = math.ceil(motor:getMinRpm() or 0) end
        if motor.getMaxRpm then t.RPMMax = math.ceil(motor:getMaxRpm() or 0) end
        if motor.getLastRealMotorRpm then t.RPM = math.ceil(motor:getLastRealMotorRpm() or 0) end
        if motor.getGear then t.Gear = motor:getGear() or 0 end
    end

    -- fuel / engine
    if specMotorized ~= nil then
        if specMotorized.fuelLevel ~= nil then
            t.Fuel = specMotorized.fuelLevel.value or 0.0
        end
        t.FuelMax = specMotorized.maxFuelLevel or 0.0
        t.IsEngineStarted = specMotorized.engineStarted == true
        if specMotorized.motorTemperature ~= nil then
            t.MotorTemperature = specMotorized.motorTemperature.value or 0.0
        end
    end

    -- wear / hours
    if specWearable ~= nil then
        t.Wear = specWearable.wear or 0.0
    end
    if vehicle.getOperationTime then
        t.OperationTimeMinutes = math.floor((vehicle:getOperationTime() or 0) / 60)
    end

    -- lights
    if specLights ~= nil then
        t.IsLightOn = specLights.isLightOn == true
        t.IsLightHighOn = specLights.isLightHighOn == true
        t.IsLightTurnLeftOn = specLights.leftTurnSignalOn == true
        t.IsLightTurnRightOn = specLights.rightTurnSignalOn == true
        t.IsLightHazardOn = specLights.hazardOn == true
        t.IsLightBeaconOn = specLights.beaconOn == true
    end

    -- mass
    if vehicle.getTotalMass then
        t.Mass = vehicle:getTotalMass(true) or 0.0
        t.TotalMass = vehicle:getTotalMass(false) or 0.0
    end

    -- attached implements (recursive, front to back)
    CT:ProcessAttachedImplements(vehicle, false, 0, 0)
end

function CT:ProcessAttachedImplements(vehicle, invertX, x, depth)
    if vehicle.getAttachedImplements == nil then
        return
    end
    local attachedImplements = vehicle:getAttachedImplements()
    if attachedImplements == nil then
        return
    end

    for _, implement in pairs(attachedImplements) do
        local object = implement.object
        if object ~= nil and vehicle.schemaOverlay ~= nil then
            local jointDesc = vehicle.schemaOverlay.attacherJoints[implement.jointDescIndex]
            if jointDesc ~= nil then
                local flip = invertX ~= jointDesc.invertX
                local baseX = flip and x - 1 + (1 - jointDesc.x) or x + jointDesc.x
                baseX = math.ceil(baseX)

                local t = CTContext.Telemetry
                t.AttachedImplementsPosition[baseX] = baseX
                t.AttachedImplementsLowered[baseX] = object.getIsLowered and object:getIsLowered(true) or false
                t.AttachedImplementsTurnedOn[baseX] = object.getIsTurnedOn and object:getIsTurnedOn() or false
                t.AttachedImplementsWear[baseX] = object.getDamageAmount and object:getDamageAmount() or 0.0

                -- data injection hook (same as the base mod): other mods can
                -- attach extra per-implement data via object.FStelemetryAddonData
                if object.FStelemetryAddonData ~= nil then
                    for key, value in pairs(object.FStelemetryAddonData) do
                        if CTContext.Telemetry["AttachedImplements" .. key] == nil then
                            CTContext.Telemetry["AttachedImplements" .. key] = {}
                        end
                        CTContext.Telemetry["AttachedImplements" .. key][baseX] = value
                    end
                end

                if depth < CTContext.MaxImplementsDepth then
                    CT:ProcessAttachedImplements(object, flip, baseX, depth + 1)
                end
            end
        end
    end
end

---------------------------------------------------------------------------
-- Pipe + wire format (compatible with the LS25_FSTelemetry base mod)
---------------------------------------------------------------------------

function CT:ClosePipe()
    if CTContext.Pipe ~= nil then
        CTContext.Pipe:flush()
        CTContext.Pipe:close()
        CTContext.Pipe = nil
    end
end

function CT:RefreshPipe()
    CTContext.RefreshCurrent = CTContext.RefreshCurrent + 1
    if CTContext.RefreshCurrent >= CTContext.RefreshRate then
        CTContext.RefreshCurrent = 0
    end
    if CTContext.RefreshCurrent == 0 then
        CT:ClosePipe()
        CTContext.Pipe = io.open(CTContext.PipeName, "w")
    end
end

function CT:WriteTelemetry()
    if CTContext.Pipe == nil then
        return
    end
    if CTContext.RefreshCurrent == 0 then
        CTContext.Pipe:write(CT:BuildHeaderText())
        CTContext.Pipe:flush()
    end
    CTContext.Pipe:write(CT:BuildBodyText())
    CTContext.Pipe:flush()
end

function CT:BuildHeaderText()
    local text = CT:AddText("HEADER", "")
    for _, k in ipairs(sortedKeys(CTContext.Telemetry)) do
        text = CT:AddText(k, text)
    end
    return text
end

function CT:BuildBodyText()
    local text = CT:AddText("BODY", "")
    for _, k in ipairs(sortedKeys(CTContext.Telemetry)) do
        text = CT:AddText(CT:GetTextValue(CTContext.Telemetry[k]), text)
    end
    return text
end

function CT:AddText(value, text)
    return text .. value .. "<"
end

function CT:GetTextValue(value)
    local valueType = type(value)
    if valueType == "boolean" then
        return CT:GetTextBoolean(value)
    elseif valueType == "string" then
        return value
    elseif valueType == "number" then
        return CT:GetTextDecimal(value)
    elseif valueType == "table" then
        return CT:GetTextTable(value)
    end
    return ""
end

function CT:GetTextDecimal(value)
    local integerPart, floatPart = math.modf(value)
    if floatPart > 0 then
        return string.format("%.2f", value)
    end
    return string.format("%d", integerPart)
end

function CT:GetTextBoolean(value)
    return value and "1" or "0"
end

function CT:GetTextTable(valueTable)
    local text = ""
    for _, key in ipairs(sortedKeys(valueTable)) do
        text = text .. CT:GetTextValue(valueTable[key]) .. ">"
    end
    return text
end

---------------------------------------------------------------------------
-- Init
---------------------------------------------------------------------------

local initialised = false
function CompanionTelemetry.init()
    if not initialised then
        addModEventListener(CompanionTelemetry)

        -- close the pipe on save / mission delete so consumers don't
        -- hold the save (same as the base mod)
        FSCareerMissionInfo.saveToXMLFile = Utils.prependedFunction(
            FSCareerMissionInfo.saveToXMLFile, CompanionTelemetry.saveToXMLFile)
        FSBaseMission.delete = Utils.prependedFunction(
            FSBaseMission.delete, CompanionTelemetry.delete)

        initialised = true
    end
end

CompanionTelemetry.init()
