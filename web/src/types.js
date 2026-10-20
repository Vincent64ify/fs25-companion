// @ts-check
// JSDoc types mirroring backend/app/protocol.py. Topics may gain fields at
// any time: code must ignore what it doesn't know.

/**
 * @typedef {Object} Envelope
 * @property {number} v
 * @property {number} seq
 * @property {number} t
 * @property {string} topic
 * @property {any} data
 */

/**
 * @typedef {Object} IngameMap
 * @property {number} [worldSizeX]
 * @property {number} [worldSizeZ]
 * @property {number} [worldCenterOffsetX]
 * @property {number} [worldCenterOffsetZ]
 * @property {number} [mapExtensionScaleFactor]
 * @property {number} [mapExtensionOffsetX]
 * @property {number} [mapExtensionOffsetZ]
 */

/**
 * @typedef {Object} Hello
 * @property {number} protocolVersion
 * @property {string} sessionId
 * @property {string} [mapId]
 * @property {string} [mapTitle]
 * @property {number} [terrainSize]
 * @property {IngameMap} [ingameMap]
 * @property {number} [farmId]
 * @property {string} [playerName]
 */

/**
 * Heading in degrees, 0 = north (-Z), clockwise.
 * @typedef {Object} Pose
 * @property {number} x
 * @property {number} z
 * @property {number} [heading]
 */

/**
 * @typedef {Pose & {inVehicle?: boolean, vehicleId?: number|string, farmId?: number}} Player
 */

/**
 * World rectangle in meters: [minX, minZ, maxX, maxZ].
 * @typedef {[number, number, number, number]} WorldBounds
 */

/**
 * meta.json written by client/map_assets.py.
 * @typedef {Object} MapMeta
 * @property {string} mapId
 * @property {string} [title]
 * @property {number} terrainSize
 * @property {WorldBounds} imageBounds     what the whole image covers
 * @property {WorldBounds} playableBounds  the terrain
 * @property {number} imageWidth
 * @property {number} imageHeight
 */

/**
 * @typedef {Object} MapAssets
 * @property {string} mapId
 * @property {string} hash
 */

/**
 * A map layer: one file under map/layers/, registered in main.js.
 * @typedef {Object} MapLayer
 * @property {string} id
 * @property {string} title
 * @property {any} leafletLayer
 */

export {};
