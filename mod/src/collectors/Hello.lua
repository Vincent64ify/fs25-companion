-- Hello.lua
-- Session context, sent at the start and again after every file rotation,
-- so a reader that starts late always knows the map and the session.

Companion = Companion or {}
Companion.Collectors = Companion.Collectors or {}

local Api = Companion.Api

-- the game's install folder, so the client can read base-game maps
-- ($data/maps/...). getAppBasePath is an engine function not yet verified in
-- game, hence the guard.
local function gameDir()
    if type(getAppBasePath) ~= "function" then
        return nil
    end
    local ok, path = pcall(getAppBasePath)
    if ok and type(path) == "string" and path ~= "" then
        return path
    end
    return nil
end

local INGAME_MAP_KEYS = {
    "worldSizeX", "worldSizeZ", "worldCenterOffsetX", "worldCenterOffsetZ",
    "mapExtensionScaleFactor", "mapExtensionOffsetX", "mapExtensionOffsetZ",
}

Companion.Collectors.Hello = {
    topic = "hello",
    interval = nil,
    collect = function(ctx)
        local mission = g_currentMission
        local info = mission.missionInfo or {}
        local map = info.map or {}

        local data = {
            protocolVersion = Companion.Transport.PROTOCOL_VERSION,
            modVersion = ctx.modVersion,
            sessionId = ctx.sessionId,
            platform = ctx.platform,
            mapId = map.id or info.mapId,
            mapTitle = map.title or info.mapTitle,
            mapDir = map.baseDirectory,
            mapXmlFilename = map.mapXMLFilename,
            isModMap = map.isModMap == true,
            terrainSize = mission.terrainSize,
            isMultiplayer = mission.missionDynamicInfo ~= nil
                and mission.missionDynamicInfo.isMultiplayer == true,
            profileDir = ctx.profileDir,
            gameDir = gameDir(),
        }

        local ingameMap = mission.hud ~= nil and mission.hud.ingameMap or nil
        if ingameMap ~= nil then
            local values = {}
            for _, key in ipairs(INGAME_MAP_KEYS) do
                if type(ingameMap[key]) == "number" then
                    values[key] = ingameMap[key]
                end
            end
            data.ingameMap = values
        end

        local player = g_localPlayer
        if player ~= nil then
            data.farmId = player.farmId
            data.playerName = player.nickname or Api.tryCall(player, "getNickname")
        end
        return data
    end,
}
