// @ts-check
// Field colours, like the PDA's map filters: one colour mode at a time
// (crop, growth, fertilizer, lime, plowing, weeds). Pure functions of the
// fields and crop_types topics, tested in test.html.
//
// Crop colours are the game's own (crop_types: each fruit type's
// defaultMapColor). GIANTS stores colours as linear RGB, so they're
// converted to sRGB for CSS. The other modes use our own palette.

/** @typedef {import("../types.js").FieldState} FieldState */
/** @typedef {import("../types.js").CropTypes} CropTypes */
/** @typedef {import("../types.js").Fruit} Fruit */

/**
 * How one field is drawn in one mode. color null = outline only; muted =
 * a faint fill for "nothing to do here".
 * @typedef {Object} FieldClass
 * @property {string} key unique within the mode, for the legend key
 * @property {string} label
 * @property {string|null} color CSS colour
 * @property {boolean} [muted]
 */

/** @typedef {"crop"|"growth"|"fertilizer"|"lime"|"plow"|"weeds"} FieldMode */

/** @type {{id: FieldMode, label: string}[]} */
export const MODES = [
  { id: "crop", label: "Crop" },
  { id: "growth", label: "Growth" },
  { id: "fertilizer", label: "Fertilizer" },
  { id: "lime", label: "Lime" },
  { id: "plow", label: "Plowing" },
  { id: "weeds", label: "Weeds" },
];

const MUTED = "#94a3b8";

/** @type {Record<string, FieldClass>} in legend order */
const GROWTH = {
  plowed: { key: "plowed", label: "Plowed", color: "#6b4226" },
  cultivated: { key: "cultivated", label: "Cultivated", color: "#a07850" },
  sown: { key: "sown", label: "Sown", color: "#c9d98f" },
  growing: { key: "growing", label: "Growing", color: "#4caf50" },
  ready: { key: "ready", label: "Ready to harvest", color: "#f2c230" },
  harvested: { key: "harvested", label: "Harvested", color: "#ddd2a6" },
  withered: { key: "withered", label: "Withered", color: "#8d5a3b" },
  none: { key: "none", label: "No data", color: null },
};

const NO_DATA = GROWTH.none;
const NO_CROP = { key: "nocrop", label: "No crop", color: null };

/** Ground types (FieldGroundType names) shown as plowed or cultivated. */
const PLOWED_GROUND = /PLOW/;
const CULTIVATED_GROUND = /CULTIVAT|SEEDBED|STUBBLE|ROLLER|RIDGE/;

/**
 * Linear RGB (0..1) -> sRGB hex.
 * @param {number[]} rgb
 */
export function linearToCss(rgb) {
  return "#" + rgb.slice(0, 3).map((c) => {
    const v = Math.min(1, Math.max(0, c));
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(s * 255).toString(16).padStart(2, "0");
  }).join("");
}

/** "SUGARBEET" -> "Sugarbeet", "STUBBLE_TILLAGE" -> "Stubble tillage" */
export function prettyName(/** @type {string} */ name) {
  const s = name.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Lookups built once per crop_types message.
 * @param {CropTypes|undefined} cropTypes
 */
export function cropCatalog(cropTypes) {
  /** @type {Map<number, Fruit>} */
  const fruits = new Map((cropTypes?.fruits || []).map((f) => [f.index, f]));
  /** @type {Map<number, string>} */
  const groundNames = new Map(Object.entries(cropTypes?.groundTypes || {}).map(([k, v]) => [v, k]));
  const levels = cropTypes?.levels || {};
  return { fruits, groundNames, levels };
}

/** @typedef {ReturnType<typeof cropCatalog>} CropCatalog */

/** @param {Fruit|undefined} fruit @param {number} [index] */
export function cropName(fruit, index) {
  if (fruit?.title) return fruit.title;
  if (fruit?.name) return prettyName(fruit.name);
  return index ? `Crop ${index}` : "None";
}

/** @param {FieldState} field @param {CropCatalog} catalog */
function groundClass(field, catalog) {
  const name = catalog.groundNames.get(field.groundType ?? -1) || "";
  if (PLOWED_GROUND.test(name)) return GROWTH.plowed;
  if (CULTIVATED_GROUND.test(name)) return GROWTH.cultivated;
  return NO_DATA;
}

/**
 * The growth stage, as the PDA's growth filter groups it.
 * @param {FieldState} field
 * @param {CropCatalog} catalog
 * @returns {FieldClass & {stage?: number, stages?: number}}
 */
export function growthClass(field, catalog) {
  const g = field.growthState;
  if (!field.fruitTypeIndex || !g) return groundClass(field, catalog);
  const fruit = catalog.fruits.get(field.fruitTypeIndex);
  if (!fruit) return { ...GROWTH.growing, stage: g };
  if (g === fruit.cut) return GROWTH.harvested;
  if (g === fruit.withered) return GROWTH.withered;
  const minHarvest = fruit.minHarvest ?? fruit.numGrowthStates;
  const maxHarvest = fruit.maxHarvest ?? minHarvest;
  if (minHarvest != null && maxHarvest != null && g >= minHarvest && g <= maxHarvest) return GROWTH.ready;
  if (fruit.minPrepare != null && fruit.minPrepare > 0 && fruit.maxPrepare != null &&
      g >= fruit.minPrepare && g <= fruit.maxPrepare) return GROWTH.ready;
  if (g === 1 && fruit.stateNames?.["1"] === "invisible") return GROWTH.sown;
  return { ...GROWTH.growing, stage: g, stages: minHarvest ?? fruit.numGrowthStates };
}

/**
 * 0..max as a share, or null without data.
 * @param {number|undefined} value
 * @param {number|undefined} max
 */
function share(value, max) {
  if (typeof value !== "number" || !max) return null;
  return Math.min(1, Math.max(0, value / max));
}

/** red -> yellow -> green for 0..1 */
function ramp(/** @type {number} */ t) {
  const stops = [[214, 69, 69], [232, 197, 71], [63, 174, 73]];
  const x = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return "#" + stops[i].map((a, k) =>
    Math.round(a + (stops[i + 1][k] - a) * f).toString(16).padStart(2, "0")).join("");
}

/**
 * How a field is drawn in a mode.
 * @param {FieldState|undefined} field
 * @param {CropCatalog} catalog
 * @param {FieldMode} mode
 * @returns {FieldClass}
 */
export function classify(field, catalog, mode) {
  if (!field) return NO_DATA;
  switch (mode) {
    case "crop": {
      if (!field.fruitTypeIndex) return field.fruitTypeIndex === 0 ? NO_CROP : NO_DATA;
      const fruit = catalog.fruits.get(field.fruitTypeIndex);
      return {
        key: `fruit${field.fruitTypeIndex}`,
        label: cropName(fruit, field.fruitTypeIndex),
        color: fruit?.color ? linearToCss(fruit.color) : MUTED,
      };
    }
    case "growth": {
      const { key, label, color } = growthClass(field, catalog);
      return { key, label, color };
    }
    case "fertilizer": {
      const max = catalog.levels.spray ?? 2;
      const s = share(field.sprayLevel, max);
      if (s === null) return NO_DATA;
      return { key: `spray${field.sprayLevel}`, label: `${Math.round(100 * s)}% fertilized`, color: ramp(s) };
    }
    case "lime":
      if (typeof field.limeLevel !== "number") return NO_DATA;
      return field.limeLevel > 0
        ? { key: "limed", label: "Limed", color: MUTED, muted: true }
        : { key: "needsLime", label: "Needs lime", color: "#f4f1e6" };
    case "plow":
      if (typeof field.plowLevel !== "number") return NO_DATA;
      return field.plowLevel > 0
        ? { key: "plowed", label: "No plowing needed", color: MUTED, muted: true }
        : { key: "needsPlow", label: "Needs plowing", color: "#c26a2b" };
    case "weeds":
      if (typeof field.weedState !== "number") return NO_DATA;
      return field.weedState > 0
        ? { key: "weeds", label: "Weeds", color: "#b4448f" }
        : { key: "noWeeds", label: "No weeds", color: MUTED, muted: true };
  }
  return NO_DATA;
}

/**
 * Legend key entries for a mode: every class the fields have, in a fixed
 * order (growth stages as listed, fertilizer by level, crops by area).
 * @param {FieldState[]} fields
 * @param {CropCatalog} catalog
 * @param {FieldMode} mode
 * @returns {FieldClass[]}
 */
export function legendKey(fields, catalog, mode) {
  /** @type {Map<string, {cls: FieldClass, area: number}>} */
  const seen = new Map();
  for (const f of fields) {
    const cls = classify(f, catalog, mode);
    const entry = seen.get(cls.key) || { cls, area: 0 };
    entry.area += f.areaHa || 0;
    seen.set(cls.key, entry);
  }
  const entries = [...seen.values()];
  if (mode === "growth") {
    const order = Object.keys(GROWTH);
    entries.sort((a, b) => order.indexOf(a.cls.key) - order.indexOf(b.cls.key));
  } else if (mode === "crop") {
    entries.sort((a, b) => (a.cls.color === null ? 1 : 0) - (b.cls.color === null ? 1 : 0) ||
      b.area - a.area || a.cls.label.localeCompare(b.cls.label));
  } else {
    entries.sort((a, b) => a.cls.key.localeCompare(b.cls.key));
  }
  return entries.map((e) => e.cls);
}
