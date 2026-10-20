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
 * One entry of the vehicles topic. Only the controlled vehicle carries the
 * dashboard detail (rpm, fuel, implements, ...).
 * @typedef {Pose & {
 *   id: number|string, name?: string, typeName?: string, farmId?: number,
 *   isAI?: boolean, motorized?: boolean, attached?: boolean, speed?: number,
 *   propertyState?: number, [detail: string]: any
 * }} Vehicle
 */

/**
 * A PDA hotspot. category is MapHotspot.CATEGORY_* (see map/icons.js).
 * @typedef {Object} Hotspot
 * @property {number} category
 * @property {number} x
 * @property {number} z
 * @property {string} [name]
 * @property {number} [farmId]
 * @property {boolean} [visible]
 */

/**
 * @typedef {Object} Farmland
 * @property {number} id
 * @property {number} farmId 0 = nobody owns it
 * @property {number} [price]
 * @property {number} [areaHa]
 * @property {number} [x]
 * @property {number} [z]
 * @property {string} [name]
 * @property {boolean} [listed] false: the farmlands screen doesn't offer it
 */

/**
 * Farmland id per cell, row by row (x first) from (originX, originZ),
 * run-length encoded: [id, count, id, count, ...]; id 0 = none.
 * @typedef {Object} FarmlandGrid
 * @property {number} cell cell size in meters
 * @property {number} cols
 * @property {number} rows
 * @property {number} originX
 * @property {number} originZ
 * @property {number[]} runs
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
 * One checkbox in the legend (map/legend.js).
 * @typedef {Object} LegendItem
 * @property {string} id unique within its layer
 * @property {string} label
 * @property {string} [swatch] trusted HTML (map/icons.js)
 * @property {boolean} [defaultOn] default true
 * @property {(on: boolean) => void} setVisible
 */

/**
 * A map layer: one file under map/layers/, registered in main.js. Without
 * legendItems the legend shows one checkbox for the whole layer.
 * @typedef {Object} MapLayer
 * @property {string} id
 * @property {string} title
 * @property {any} leafletLayer
 * @property {LegendItem[]} [legendItems]
 */

export {};
