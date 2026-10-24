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
 * dashboard detail (rpm, fuel, implements, ...; since Themes T6 also
 * fuelUsage, def and defCapacity, cruise {state, speed, maxSpeed}, pto and
 * fills, see data/selectors.js). An AI worker's vehicle carries ai {job,
 * description, helper}.
 * @typedef {Pose & {
 *   id: number|string, name?: string, typeName?: string, farmId?: number,
 *   isAI?: boolean, motorized?: boolean, attached?: boolean, speed?: number,
 *   propertyState?: number, [detail: string]: any
 * }} Vehicle
 */

/**
 * The cab topic: what the controls show, for the controlled vehicle, sent
 * the frame it changes. On foot: {inVehicle: false}.
 * @typedef {Object} Cab
 * @property {boolean} inVehicle
 * @property {number|string} [vehicleId]
 * @property {boolean} [engineOn]
 * @property {{on?: boolean, high?: boolean, left?: boolean, right?: boolean, hazard?: boolean, beacon?: boolean, stage?: number, stages?: number}} [lights]
 *   stage: the light key's step, 0 = off, of stages (mod 0.5.1)
 * @property {{state: string, speed?: number}} [cruise]
 * @property {{lowered: boolean, turnedOn: boolean}[]} [implements]
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
 * A field's outline (field_outlines topic, once per map): flattened
 * [x1, z1, x2, z2, ...] in world meters.
 * @typedef {Object} FieldOutline
 * @property {number} id
 * @property {number[]} points
 */

/**
 * A field's crop and soil state (fields topic): the game's fieldState.
 * fruitTypeIndex 0 = no crop.
 * @typedef {Object} FieldState
 * @property {number} id
 * @property {number} [farmlandId]
 * @property {number} [x] field number position
 * @property {number} [z]
 * @property {number} [areaHa]
 * @property {number} [fruitTypeIndex]
 * @property {number} [growthState]
 * @property {number} [groundType]
 * @property {number} [sprayLevel]
 * @property {number} [sprayType]
 * @property {number} [limeLevel]
 * @property {number} [plowLevel]
 * @property {number} [rollerLevel]
 * @property {number} [stubbleShredLevel]
 * @property {number} [weedState]
 * @property {number} [stoneLevel]
 */

/**
 * A crop (crop_types topic). Colours are linear RGB, 0..1.
 * @typedef {Object} Fruit
 * @property {number} index
 * @property {string} [name]
 * @property {string} [title]
 * @property {number[]} [color]
 * @property {number[]} [colorBlindColor]
 * @property {number} [numGrowthStates]
 * @property {number} [minHarvest]
 * @property {number} [maxHarvest]
 * @property {number} [withered]
 * @property {number} [cut]
 * @property {number} [minPrepare]
 * @property {number} [maxPrepare]
 * @property {boolean} [regrows]
 * @property {boolean} [shownOnMap]
 * @property {Record<string, string>} [stateNames] growth state -> game name
 */

/**
 * @typedef {Object} CropTypes
 * @property {Fruit[]} fruits
 * @property {Record<string, number>} [groundTypes] FieldGroundType name -> value
 * @property {{lime?: number, plow?: number, spray?: number}} [levels] maximum values
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
 * A drop-down in the legend (map/legend.js), remembered like the checkboxes.
 * @typedef {Object} LegendChoice
 * @property {string} id unique within its layer
 * @property {string} label
 * @property {{id: string, label: string}[]} options
 * @property {string} defaultValue
 * @property {(value: string) => void} set
 */

/**
 * A map layer: one file under map/layers/, registered in main.js. Without
 * legendItems the legend shows one checkbox for the whole layer. A layer
 * may add a drop-down (legendChoice) and an element of its own below its
 * items (legendExtra, a colour key for example).
 * @typedef {Object} MapLayer
 * @property {string} id
 * @property {string} title
 * @property {any} leafletLayer
 * @property {LegendItem[]} [legendItems]
 * @property {LegendChoice} [legendChoice]
 * @property {HTMLElement} [legendExtra]
 */

export {};
