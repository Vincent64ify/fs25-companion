// @ts-check
// The one description of every topic's fields (specs/0007): the companion
// checks only the envelope (companion/protocol.py) and passes data on as
// the mod wrote it. Topics may gain fields at any time: code must ignore
// what it doesn't know. Units are world meters, km/h, litres and degrees
// unless a field says otherwise; a field the mod can't read is left out.

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
 * The hello topic: first in every stream file. A new sessionId means a new
 * game session (the companion drops the old state).
 * @typedef {Object} Hello
 * @property {number} protocolVersion
 * @property {string} sessionId
 * @property {string} [modVersion]
 * @property {string} [platform] "windows" or "macos"
 * @property {string} [mapId]
 * @property {string} [mapTitle]
 * @property {string} [mapDir] the map's folder, as the game reports it
 * @property {string} [mapXmlFilename]
 * @property {boolean} [isModMap]
 * @property {boolean} [isMultiplayer]
 * @property {number} [terrainSize]
 * @property {IngameMap} [ingameMap]
 * @property {number} [farmId]
 * @property {string} [playerName]
 * @property {string} [profileDir]
 * @property {string} [gameDir]
 * @property {{dir?: string, next: number, actions?: number}} [commands] where
 *   the companion writes commands and the number the mod reads next;
 *   actions 3: the files name the dashboard's set actions (mod 0.10.0,
 *   specs/0008); 2: its toggles (mod 0.9.x, specs/0007); absent before
 */

/**
 * The env topic.
 * @typedef {Object} Env
 * @property {number} [day]
 * @property {number} [dayTimeMinutes] minutes since midnight
 * @property {number} [season]
 * @property {number} [month] 1 = January (the game's period 1 is March)
 * @property {{tempMin?: number, tempMax?: number, tempTrend?: number, current?: number|string,
 *   next?: number|string}} [weather] degrees C
 * @property {Record<string, number>} [money] farmId (as a string) -> money
 * @property {{miles?: boolean, fahrenheit?: boolean, acres?: boolean, currency?: string}} [units]
 *   the player's unit settings; missing ones mean metric
 */

/**
 * Heading in degrees, 0 = north (-Z), clockwise, 0 <= heading < 360.
 * @typedef {Object} Pose
 * @property {number} x
 * @property {number} z
 * @property {number} [y]
 * @property {number} [heading]
 */

/**
 * @typedef {Pose & {inVehicle?: boolean, vehicleId?: number|string, farmId?: number}} Player
 */

/**
 * One entry of the vehicles topic ({vehicles: Vehicle[], controlledId?}).
 * Only the controlled vehicle carries the dashboard detail (see
 * data/selectors.js):
 *   rpm, rpmMin, rpmMax, gear (number or name), fuel, fuelCapacity,
 *   fuelType, fuelUsage (litres, kWh for electric, per hour), def and
 *   defCapacity (DEF, litres), cruise {state: "off"|"on"|"full", speed?,
 *   maxSpeed?}, pto (a PTO turns; absent: none has one), fills
 *   (FillLevel[], without the fuel), motorTemp (degrees C), engineOn, wear
 *   (0..1), operatingHours, mass, lights (as the cab's), implements
 *   ({name?, depth, lowered, turnedOn, wear?, pto?, hitch? (0 raised .. 1
 *   lowered; absent: a fixed joint), fills}[]; Lua writes an empty one as
 *   []).
 * An AI worker's vehicle carries ai {job?, description?, helper?}.
 * @typedef {Pose & {
 *   id: number|string, name?: string, typeName?: string, farmId?: number,
 *   isAI?: boolean, motorized?: boolean, attached?: boolean, speed?: number,
 *   propertyState?: number, [detail: string]: any
 * }} Vehicle
 */

/**
 * One fill unit: a trailer's load, a sprayer's tank. An empty unit has no
 * fill type. maxReached and limit: the game's Trailer Fill Limit (the
 * vehicle is at its maximum mass, the HUD's MAX; the litres this unit
 * stops at, below its capacity).
 * @typedef {Object} FillLevel
 * @property {number} [unit]
 * @property {number} level
 * @property {number} capacity
 * @property {string} [fillType] the game's name, lower case ("wheat")
 * @property {string} [fillTitle]
 * @property {boolean} [maxReached]
 * @property {number} [limit]
 */

/**
 * The cab topic: what the controls show, for the controlled vehicle, sent
 * the frame it changes. On foot: {inVehicle: false}.
 * @typedef {Object} Cab
 * @property {boolean} inVehicle
 * @property {number|string} [vehicleId]
 * @property {boolean} [engineOn]
 * @property {"off"|"starting"|"on"} [engineState] starting takes a few seconds
 * @property {{on?: boolean, high?: boolean, left?: boolean, right?: boolean, hazard?: boolean, beacon?: boolean, stage?: number, stages?: number}} [lights]
 *   stage: the light key's step, 0 = off, of stages (mod 0.5.1)
 * @property {{state: string, speed?: number}} [cruise]
 * @property {boolean} [aiActive]
 * @property {boolean} [hitched] something is attached
 * @property {boolean} [attachable] something is in reach to attach: the
 *   game's Attach prompt is up (mod 0.8.7)
 * @property {SelectedImplement} [implement] the one the implement keys act on
 * @property {{lowered: boolean, turnedOn: boolean}[]} [implements]
 * @property {RigEntry[]} [rig] the vehicle, then everything attached, depth
 *   first (mod 0.7.0, Controls C3)
 * @property {{lower?: number, fold?: number, turnOn?: number, pipe?: number, unload?: number, cover?: number,
 *   lowerAll?: number}} [keys] the rig id of the tool each implement key
 *   acts on now; not always the selected one (the game keeps an action
 *   only one tool has live). pipe, unload, cover and lowerAll since mod 0.8.0
 */

/**
 * One object in the cab's rig: the controlled vehicle (depth 0) or a tool
 * hanging on it. Tools also carry the SelectedImplement fields.
 * The Implement screen's (mod 0.8.0), on the vehicle too: pipe (out, and
 * moving), discharging (tipping or unloading), trailer, cover (open).
 * The Vehicle page's cards (mod 0.8.7, specs/0003): can, what the game's
 * parts on it allow; canNow[cap] false (whyNot[cap], the game's words)
 * while the game refuses it now; a trailer's tipSide, a plow's rotation,
 * the bale counter; the selected one's other live keys with the game's
 * labels (extraKeys).
 * @typedef {SelectedImplement & {id?: number, parent?: number, depth: number, side?: "front"|"rear",
 *   selectable?: boolean, selected?: boolean, pipe?: {out: boolean, moving: boolean}, discharging?: boolean,
 *   trailer?: boolean, cover?: {open: boolean}, can?: string[], canNow?: Record<string, boolean>,
 *   whyNot?: Record<string, string>, tipSide?: {index: number, count: number, name?: string}, tipTo?: "object"|"ground",
 *   plow?: {rotated: boolean}, bales?: {count?: number, total?: number},
 *   extraKeys?: {action: string, text: string}[]}} RigEntry
 */

/**
 * The selected implement (cab.implement). unfolded is undefined when the
 * game doesn't say; foldMoving while a fold animation runs.
 * @typedef {Object} SelectedImplement
 * @property {string} [name]
 * @property {boolean} [lowered]
 * @property {boolean} [canLower]
 * @property {boolean} [turnedOn]
 * @property {boolean} [canTurnOn]
 * @property {boolean} [foldable]
 * @property {boolean|null} [unfolded]
 * @property {boolean} [foldMoving]
 */

/**
 * The command_ack topic: the mod's answer to one command, an event (the
 * companion relays it to the viewer that asked and never keeps it).
 * @typedef {Object} CommandAck
 * @property {number} [id] the command file's number
 * @property {string} [ref] the companion's reference for it
 * @property {string} [action] the dashboard's action name (mod 0.9.0)
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {string} [via] what ran: the input action's name, or "setter"
 * @property {boolean} [already] the game was in the asked state already:
 *   nothing ran (mod 0.10.0, specs/0008)
 * @property {boolean} [checked] the mod waited for the tools to move
 *   (specs/0003 revision 2)
 * @property {{id: number, name?: string, why?: string}[]} [unmoved] those that didn't
 */

/**
 * A PDA hotspot (hotspots topic: {hotspots: Hotspot[]}). category is
 * MapHotspot.CATEGORY_*: ANIMAL 2, MISSION 3, TOUR 4, UNLOADING 9 (sell
 * points), LOADING 10, PRODUCTION 11, SHOP 12, OTHER 13 (see map/icons.js).
 * @typedef {Object} Hotspot
 * @property {number} category
 * @property {number} x
 * @property {number} z
 * @property {string} [name]
 * @property {number} [farmId]
 * @property {boolean} [visible]
 */

/**
 * A farmland (farmlands topic: {farmlands: Farmland[]}).
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
 * The farmland_grid topic. Farmland id per cell, row by row (x first) from
 * (originX, originZ), run-length encoded: [id, count, id, count, ...]; id
 * 0 = none. The counts add up to cols * rows.
 * @typedef {Object} FarmlandGrid
 * @property {number} cell cell size in meters
 * @property {number} cols
 * @property {number} rows
 * @property {number} originX
 * @property {number} originZ
 * @property {number[]} runs
 */

/**
 * A field's outline (field_outlines topic, {fields: FieldOutline[]}, once
 * per map): flattened [x1, z1, x2, z2, ...] in world meters, at least three
 * points.
 * @typedef {Object} FieldOutline
 * @property {number} id
 * @property {number[]} points
 */

/**
 * A field's crop and soil state (fields topic: {fields: FieldState[]}):
 * the game's fieldState. fruitTypeIndex 0 = no crop, else an index into
 * crop_types.fruits.
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
 * meta.json written by companion/map_assets.py.
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
