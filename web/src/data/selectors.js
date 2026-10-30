// @ts-check
// Pure reads of the store's topics, shared by every theme's widgets. They
// return raw values (numbers, names) or undefined when the data is
// missing; widgets do the formatting.

import { myFarmId } from "../store.js";
import { METRIC, tempUnit, tempValue } from "./units.js";

/** @typedef {import("../types.js").Vehicle} Vehicle */
/** @typedef {{get: (key: string) => any}} StoreLike */

export const WEATHER_NAMES = ["Sunny", "Light clouds", "Cloudy", "Fog", "Rain", "Storm"];

/**
 * The vehicle the player drives, if any.
 * @param {StoreLike} store
 * @returns {Vehicle|undefined}
 */
export function controlledVehicle(store) {
  const topic = store.get("vehicles") || {};
  return (topic.vehicles || []).find((/** @type {Vehicle} */ v) => v.id === topic.controlledId);
}

/**
 * The cab topic: the controlled vehicle's switches, sent the frame they
 * change (mod 0.5.0 and later; undefined before).
 * @param {StoreLike} store
 * @returns {import("../types.js").Cab|undefined}
 */
export function cabOf(store) {
  const cab = store.get("cab");
  return cab && typeof cab === "object" ? cab : undefined;
}

/** @param {Vehicle|undefined} v */
export const vehicleName = (v) => (v ? v.name || v.typeName || "Vehicle" : "On foot");

// a vehicle's kind, for its icon: the shop category the mod sends, else the
// type name (older mods, the replay). First match wins: tools and wagons
// before loaders, headers before harvesters.
const KINDS = /** @type {[RegExp, string][]} */ ([
  [/TOOL|CUTTER|HEADER/, "implement"],
  [/WEIGHT/, "weight"],
  [/TRAILER|WAGON|TANK|TRANSPORT|AUGER/, "trailer"],
  [/HARVESTER|COMBINE/, "harvester"],
  [/LOADER|TELEHANDLER|SKIDSTEER|FORKLIFT/, "loader"],
  [/TRUCK|^CARS?$/, "truck"],
  [/TRACTOR/, "tractor"],
]);

export const KIND_LABELS = /** @type {Record<string, string>} */ ({
  tractor: "Tractor", harvester: "Harvester", loader: "Loader", trailer: "Trailer", truck: "Truck",
  implement: "Implement", weight: "Weight",
});

/**
 * tractor, harvester, loader, trailer, truck, implement or weight: an
 * icon name in ui/icons.js.
 * @param {{category?: string, typeName?: string, motorized?: boolean}|undefined} v
 */
export function vehicleKind(v) {
  for (const name of [v?.category, v?.typeName]) {
    if (typeof name !== "string") continue;
    const found = KINDS.find(([re]) => re.test(name.toUpperCase()));
    if (found) return found[1];
  }
  return v?.motorized === false ? "implement" : "tractor";
}

/** The shop's category name ("Tractors M"), else the kind's ("Tractor"). */
export const kindLabel = (/** @type {{categoryTitle?: string, category?: string, typeName?: string}|undefined} */ v) =>
  (typeof v?.categoryTitle === "string" && v.categoryTitle) || KIND_LABELS[vehicleKind(v)];

/** @param {Vehicle|undefined} v @returns {string|undefined} "New Holland" */
export const vehicleBrand = (v) => (typeof v?.brand === "string" && v.brand ? v.brand : undefined);

/** The name without its brand in front ("T7.315 HD"), as the card shows it under the brand. */
export function modelName(/** @type {Vehicle|undefined} */ v) {
  const name = vehicleName(v);
  const brand = vehicleBrand(v);
  return brand && name.startsWith(brand + " ") ? name.slice(brand.length + 1) : name;
}

/**
 * What the vehicle is doing, for the readout card's header.
 * @param {Vehicle|undefined} v
 * @returns {{text: string, icon: string, detail?: string}}
 */
export function activity(v) {
  if (!v) return { text: "On foot", icon: "position" };
  const impls = implementsOf(v);
  const working = impls.find((i) => i.turnedOn);
  const detail = (working || impls[0])?.name;
  if (v.isAI) return { text: "AI worker", icon: "aiWorker", detail: aiJobText(v) || detail };
  if (working) return { text: "Working", icon: "implementOn", detail };
  if ((v.speed ?? 0) >= 0.5) return { text: "Driving", icon: "speed", detail };
  return { text: v.engineOn ? "Standing" : "Parked", icon: vehicleKind(v), detail };
}

// the speed arc's full scale: the first that holds the speed
export const SPEED_SCALES = [50, 80, 120];

/** @param {number} kmh @param {number} [atLeast] keeps a scale once reached @returns {number} */
export function speedScale(kmh, atLeast = 0) {
  const fit = SPEED_SCALES.find((s) => s >= kmh) ?? SPEED_SCALES[SPEED_SCALES.length - 1];
  return Math.max(fit, atLeast);
}

/**
 * The gear as the cab shows it: the game's name ("2", "3H" with its range,
 * "D" and "N" on a CVT), reverse as "R1" or "R3H" where the game says "-1"
 * or "-3H".
 * @param {Vehicle|undefined} v
 * @returns {string|undefined}
 */
export function gearName(v) {
  const g = v?.gear;
  if (g == null || g === "") return undefined;
  const text = String(g);
  return /^-./.test(text) ? "R" + text.slice(1) : text;
}

/** @param {Vehicle|undefined} v @returns {number|undefined} 0..100 of the engine's top rpm */
export function rpmPct(v) {
  if (!v || typeof v.rpm !== "number") return undefined;
  const max = typeof v.rpmMax === "number" && v.rpmMax > 0 ? v.rpmMax : 2400;
  return Math.max(0, Math.min(100, (100 * v.rpm) / max));
}

/** @param {Vehicle|undefined} v @returns {number|undefined} 0..100 */
export function fuelPct(v) {
  return v && v.fuelCapacity > 0 ? 100 * (v.fuel / v.fuelCapacity) : undefined;
}

/** @param {Vehicle|undefined} v @returns {number|undefined} 0..100 */
export function wearPct(v) {
  return v && typeof v.wear === "number" ? 100 * v.wear : undefined;
}

/** @param {Vehicle|undefined} v @returns {number|undefined} °C */
export function engineTemp(v) {
  return v && typeof v.motorTemp === "number" ? v.motorTemp : undefined;
}

/** @param {Vehicle|undefined} v @returns {number|undefined} */
export function operatingHours(v) {
  return v && typeof v.operatingHours === "number" ? v.operatingHours : undefined;
}

/** @param {Vehicle|undefined} v @returns {number|undefined} litres (kWh) per hour */
export function fuelUsage(v) {
  return v && typeof v.fuelUsage === "number" ? v.fuelUsage : undefined;
}

/** @param {Vehicle|undefined} v @returns {number|undefined} 0..100 of the DEF tank */
export function defPct(v) {
  return v && v.defCapacity > 0 && typeof v.def === "number" ? 100 * (v.def / v.defCapacity) : undefined;
}

/**
 * Cruise control: off, on (holding speed, km/h) or full (full throttle).
 * @param {Vehicle|undefined} v
 * @returns {{state: "off"|"on"|"full", speed?: number, maxSpeed?: number}|undefined}
 */
export function cruiseOf(v) {
  const c = v?.cruise;
  return c && typeof c === "object" && ["off", "on", "full"].includes(c.state) ? c : undefined;
}

/** @param {Vehicle|undefined} v @returns {boolean|undefined} undefined: no PTO attached */
export function ptoOf(v) {
  return typeof v?.pto === "boolean" ? v.pto : undefined;
}

/**
 * The AI worker's job, as one line: "Field work · Field 1".
 * @param {Vehicle|undefined} v
 * @returns {string|undefined}
 */
export function aiJobText(v) {
  const ai = v?.isAI ? v.ai : undefined;
  if (!ai || typeof ai !== "object") return undefined;
  const parts = [ai.job, ai.description].filter((p) => typeof p === "string" && p);
  // a description often repeats the title ("Field work: field 1")
  if (parts.length === 2 && parts[1].toLowerCase().includes(parts[0].toLowerCase())) parts.shift();
  return parts.join(" · ") || undefined;
}

/**
 * One fill unit, as the mod sends it: an empty unit has no fill type. Under
 * the game's Trailer Fill Limit, maxReached is the HUD's MAX (the vehicle is
 * at its maximum mass) and limit the litres the unit stops at, when below
 * its capacity.
 * @typedef {{unit?: number, level: number, capacity: number, fillType?: string, fillTitle?: string,
 *   maxReached?: boolean, limit?: number}} Fill
 */

/** @param {any} list @returns {Fill[]} */
const fillList = (list) => (Array.isArray(list) ? list.filter((f) => f && f.capacity > 0) : []);

/** The vehicle's own fill units (a grain tank, a truck's load), without its fuel. @param {Vehicle|undefined} v */
export const fillsOf = (v) => fillList(v?.fills);

/** @param {Fill} f @returns {number} 0..100 */
export const fillPct = (f) => Math.max(0, Math.min(100, (100 * (f.level || 0)) / f.capacity));

/** The litres the unit stops at: its weight limit, else its capacity. @param {Fill} f */
export const fillStop = (f) => (typeof f.limit === "number" && f.limit < f.capacity ? Math.max(0, f.limit) : f.capacity);

/** Where the weight limit falls on the bar, 0..100; undefined without one. @param {Fill} f */
export const fillLimitPct = (f) => (fillStop(f) < f.capacity ? (100 * fillStop(f)) / f.capacity : undefined);

/** The game's MAX: the unit takes no more, at any level. @param {Fill} f */
export const fillMax = (f) => f.maxReached === true;

/** "Wheat", "Empty" for an empty unit. @param {Fill} f */
export function fillName(f) {
  if (!f.fillType || !(f.level > 0)) return "Empty";
  return f.fillTitle || f.fillType.charAt(0).toUpperCase() + f.fillType.slice(1).toLowerCase();
}

/**
 * The first loaded unit, else the first: what a "Load" tile shows.
 * @param {Fill[]} fills
 * @returns {Fill|undefined}
 */
export const mainFill = (fills) => fills.find((f) => f.level > 0) || fills[0];

/**
 * An attached implement, as the mod sends it. hitch: 0 raised .. 1 lowered;
 * pto missing for an implement without one.
 * speedLimit (km/h), workWidth (m) and crop since the Implement screen.
 * @typedef {{id?: number, name?: string, brand?: string, typeName?: string, category?: string, categoryTitle?: string,
 *   depth?: number, lowered?: boolean, turnedOn?: boolean, wear?: number, pto?: boolean,
 *   hitch?: number, fills?: Fill[], speedLimit?: number, workWidth?: number,
 *   crop?: {name?: string, title?: string}}} Implement
 */

/**
 * Attached implements, in attach order; depth 1 hangs on the vehicle.
 * @param {Vehicle|undefined} v
 * @returns {Implement[]}
 */
export function implementsOf(v) {
  return (v && v.implements) || [];
}

/**
 * The cab's rig (Controls C3): the vehicle, then what's attached; empty on
 * foot or from a mod before 0.7.0.
 * @param {import("../types.js").Cab|undefined} cab
 * @returns {import("../types.js").RigEntry[]}
 */
export function rigOf(cab) {
  return cab && cab.inVehicle && Array.isArray(cab.rig) ? cab.rig : [];
}

/**
 * The rig entry the game has selected (what G moved to), if any.
 * @param {import("../types.js").Cab|undefined} cab
 */
export const selectedInRig = (cab) => rigOf(cab).find((e) => e.selected === true);

/**
 * A tool's name without its brand in front ("TERRIA 6040"), the brand from
 * the vehicles topic's implement with the same id (any case: the game
 * writes some brands in capitals in the name).
 * @param {{id?: number, name?: string}} tool
 * @param {Vehicle|undefined} v the vehicle it hangs on
 */
export function toolModel(tool, v) {
  const name = tool.name || "";
  const brand = implementsOf(v).find((i) => i.id === tool.id)?.brand;
  if (typeof brand === "string" && brand && name.toLowerCase().startsWith(brand.toLowerCase() + " ")) {
    return name.slice(brand.length + 1);
  }
  return name;
}

/**
 * The tool an implement key acts on right now (cab.keys): null when the
 * mod says no tool's key is live, undefined when it doesn't say (a mod
 * before 0.7.0).
 * @param {import("../types.js").Cab|undefined} cab
 * @param {"lower"|"fold"|"turnOn"} key
 * @returns {import("../types.js").RigEntry|null|undefined}
 */
export function keyTool(cab, key) {
  if (!cab || !cab.inVehicle || !cab.keys || !Array.isArray(cab.rig)) return undefined;
  const id = cab.keys[key];
  // the vehicle itself only for its own fold (a combine unfolds itself)
  return cab.rig.find((e) => e.id === id && (e.depth > 0 || (key === "fold" && e.foldable === true))) ?? null;
}

/** The rig entry with this id. @param {import("../types.js").Cab|undefined} cab @param {number|undefined} id */
export const rigEntry = (cab, id) => (id === undefined ? undefined : rigOf(cab).find((e) => e.id === id));

/** The vehicles topic's implement with this id. @param {Vehicle|undefined} v @param {number|undefined} id */
export const implementById = (v, id) => (id === undefined ? undefined : implementsOf(v).find((i) => i.id === id));

/**
 * The rig left to right, as you'd see it driving to the right (the
 * Implement screen's rig band): rear tools, the farthest first, the
 * vehicle, then front tools; a tool on a tool sits next to its parent,
 * farther out. A tool without a side counts as rear (a trailer).
 * @param {import("../types.js").RigEntry[]} rig
 * @returns {import("../types.js").RigEntry[]}
 */
export function drivingOrder(rig) {
  const tools = rig.filter((e) => e.depth > 0);
  return [...tools.filter((e) => e.side !== "front").reverse(), ...rig.filter((e) => e.depth === 0),
    ...tools.filter((e) => e.side === "front")];
}

/**
 * A rig entry's name without its brand: the vehicle's as its card shows it,
 * a tool's by toolModel.
 * @param {import("../types.js").RigEntry} entry
 * @param {Vehicle|undefined} v the controlled vehicle
 */
export const entryModel = (entry, v) => (entry.depth === 0 ? modelName(v) : toolModel(entry, v));

/**
 * The tool an Implement screen key acts on (cab.keys: the pipe, unloading,
 * the cover), at any depth (a combine's own pipe), among the entries `has`
 * accepts; else the first such entry, with live false (the key isn't live
 * now, or the mod doesn't say).
 * @param {import("../types.js").Cab|undefined} cab
 * @param {string} key
 * @param {(e: import("../types.js").RigEntry) => boolean} has
 * @returns {{tool: import("../types.js").RigEntry|undefined, live: boolean}}
 */
export function liveTool(cab, key, has) {
  const rig = rigOf(cab);
  const id = /** @type {any} */ (cab?.keys)?.[key];
  const keyed = id === undefined ? undefined : rig.find((e) => e.id === id && has(e));
  return { tool: keyed || rig.find(has), live: keyed !== undefined };
}

// a front loader and its tools by joint type name (mod 0.8.5), shop
// category or type name; a loader wagon is a trailer
const LOADER_JOINT = /frontloader|wheelloader|telehandler|teleloader|skidsteer|loaderfork|bigbag/i;
const LOADER_CATEGORY = /LOADER|SKIDSTEER|TELEHANDLER|FORKLIFT/;
const LOADER_TYPE = /frontloader|shovel|dynamicmount|fork|bigbag|balegrab/i;

/**
 * A front loader or one of its tools (bucket, forks, hook): the game has
 * no lowered or raised for them, so the dashboard never shows one
 * (Vincent, 2026-10-26, specs/0002).
 * @param {{joint?: string, category?: string, typeName?: string}|undefined} entry the cab's rig entry
 * @param {{category?: string, typeName?: string}|undefined} [impl] the vehicles topic's implement
 */
export function isLoaderGear(entry, impl) {
  const joint = /** @type {any} */ (entry)?.joint;
  if (typeof joint === "string" && LOADER_JOINT.test(joint)) return true;
  return [impl, entry].some((x) => {
    const cat = typeof x?.category === "string" ? x.category.toUpperCase() : "";
    return (LOADER_CATEGORY.test(cat) && !/LOADERWAGON/.test(cat)) || LOADER_TYPE.test(x?.typeName || "");
  });
}

/**
 * Whether a rig entry lowers and raises: a tool the game lets lower, not
 * loader gear.
 * @param {import("../types.js").RigEntry} e
 * @param {Vehicle|undefined} v
 */
export const lowersInRig = (e, v) => e.depth > 0 && e.canLower !== false && typeof e.lowered === "boolean" &&
  !isLoaderGear(e, implementById(v, e.id));

// --- the Vehicle page's cards (specs/0003) ---------------------------------

/**
 * The rig the Vehicle page shows: the cab's, or (a mod before 0.7.0) the
 * vehicle and its implements, none of them selectable.
 * @param {Vehicle|undefined} v
 * @param {import("../types.js").Cab|undefined} cab
 * @returns {import("../types.js").RigEntry[]}
 */
export function screenRig(v, cab) {
  const rig = rigOf(cab);
  if (rig.length || !v) return rig;
  return [{ id: /** @type {any} */ (v.id), name: v.name, depth: 0 },
    ...implementsOf(v).map((i) => ({ ...i, depth: i.depth || 1 }))];
}

/** A card's buttons come from these, in this order (mod 0.8.7's `can`). */
export const CAPABILITIES = ["lower", "fold", "turnOn", "tip", "tipSide", "cover", "pipe", "rotate", "bales", "detach"];

/**
 * What a rig member can do: the mod's `can`, read from the game's parts
 * (mod 0.8.7); from an older mod, what its fields show.
 * @param {import("../types.js").RigEntry} e
 * @returns {string[]}
 */
export function canOf(e) {
  if (Array.isArray(e.can)) return e.can.filter((c) => typeof c === "string");
  const out = [];
  if (e.depth > 0 && e.canLower !== false && typeof e.lowered === "boolean") out.push("lower");
  if (e.foldable) out.push("fold");
  if (e.canTurnOn) out.push("turnOn");
  if (e.trailer && typeof e.discharging === "boolean") out.push("tip");
  if (e.cover) out.push("cover");
  if (e.pipe) out.push("pipe");
  if (e.depth > 0) out.push("detach");
  return out;
}

/** The ids of what's mounted on the loader's forks or hook (mod 0.8.5). @param {Vehicle|undefined} v */
const carriedIds = (v) => new Set((Array.isArray(/** @type {any} */ (v)?.carried) ? /** @type {any} */ (v).carried : [])
  .map((/** @type {any} */ c) => c?.id));

/**
 * A working thing gets a card: a rig member, the vehicle too, that can do
 * more than lower and detach, or has tanks on the HUD. Loader gear and a
 * carried bag or pallet never do: they're the Loader page's.
 * @param {import("../types.js").RigEntry} e
 * @param {Vehicle|undefined} v
 */
export function isWorkingThing(e, v) {
  const impl = e.depth === 0 ? undefined : implementById(v, e.id);
  if (e.depth > 0 && (isLoaderGear(e, impl) || carriedIds(v).has(e.id))) return false;
  if (canOf(e).some((c) => c !== "lower" && c !== "detach")) return true;
  return fillsOf(/** @type {any} */ (e.depth === 0 ? v : impl)).length > 0;
}

/**
 * The cards, in driving order (rear tools on the left, the vehicle in its
 * place, front tools on the right).
 * @param {Vehicle|undefined} v
 * @param {import("../types.js").Cab|undefined} cab
 */
export const cardsOf = (v, cab) => drivingOrder(screenRig(v, cab)).filter((e) => isWorkingThing(e, v));

/**
 * Also attached: each tool with no card, in driving order; a carried bag
 * or pallet is a load, never a tool.
 * @param {Vehicle|undefined} v
 * @param {import("../types.js").Cab|undefined} cab
 */
export const alsoAttached = (v, cab) => drivingOrder(screenRig(v, cab))
  .filter((e) => e.depth > 0 && !isWorkingThing(e, v) && !carriedIds(v).has(e.id));

/**
 * One button of the All row: its command, lit while every one of them is
 * on, labelled with what a tap does.
 * @typedef {{cap: string, action: string, value?: number, label: string, on: boolean, unavailable?: boolean,
 *   note?: string, moving?: boolean}} AllAction
 */

/**
 * The All row: a button for each capability two or more cards share. Fold,
 * lower and turn on all are the game's own keys; tip and cover all act on
 * each in turn. Turn on all waits while one of them is folded.
 * @param {import("../types.js").RigEntry[]} cards
 * @returns {AllAction[]}
 */
export function allActions(cards) {
  /** @type {AllAction[]} */
  const out = [];
  /** @param {string} cap @param {(list: import("../types.js").RigEntry[]) => Omit<AllAction, "cap">} make */
  const add = (cap, make) => {
    const list = cards.filter((e) => canOf(e).includes(cap));
    if (list.length >= 2) out.push({ cap, ...make(list) });
  };
  add("fold", (list) => {
    const on = list.every((e) => e.unfolded === true);
    // none the game lets fold (the engine off: live 0.8.8), with its words;
    // a lowered one doesn't count: Fold all raises it first
    const blocked = list.every((e) => e.canNow?.fold === false && e.lowered !== true);
    return { action: "implement.foldAll", on, label: on ? "Fold all" : "Unfold all", moving: list.some((e) => e.foldMoving),
      unavailable: blocked || undefined, note: blocked ? list[0].whyNot?.fold || "Not now" : undefined };
  });
  add("lower", (list) => {
    const on = list.every((e) => e.lowered === true);
    // none the game lets lower or raise (the engine off: live 0.8.9)
    const blocked = list.every((e) => e.canNow?.lower === false);
    return { action: "implement.lowerAll", on, label: on ? "Raise all" : "Lower all",
      unavailable: blocked || undefined, note: blocked ? list[0].whyNot?.lower || "Not now" : undefined };
  });
  add("turnOn", (list) => {
    const on = list.every((e) => e.turnedOn === true);
    const folded = !on && list.some((e) => canOf(e).includes("fold") && e.unfolded === false);
    return { action: "implement.turnOnAll", on, label: on ? "Turn off all" : "Turn on all", unavailable: folded,
      note: folded ? "Unfold first" : undefined };
  });
  add("tip", (list) => {
    const on = list.every((e) => e.discharging === true);
    return { action: "implement.tipAll", value: on ? 0 : 1, on, label: on ? "Stop all" : "Tip all" };
  });
  add("cover", (list) => {
    const on = list.every((e) => e.cover?.open === true);
    return { action: "implement.coverAll", value: on ? 0 : 1, on, label: on ? "Cover all" : "Uncover all" };
  });
  return out;
}

// what a working tool does, by its shop category; first match wins
const JOBS = /** @type {[RegExp, string][]} */ ([
  [/FORAGEHARVESTER/, "Chopping"], [/PLOW/, "Ploughing"], [/CULTIVATOR/, "Cultivating"],
  [/DISCHARROW|POWERHARROW/, "Harrowing"], [/SUBSOILER/, "Subsoiling"], [/MULCHER/, "Mulching"],
  [/SPADER/, "Digging"], [/STONEPICKER/, "Picking stones"], [/PLANT/, "Planting"], [/SEEDER|SOWING/, "Seeding"],
  [/SPRAYER/, "Spraying"], [/SPREADER|SLURRY/, "Spreading"], [/WEEDER/, "Weeding"], [/ROLLER/, "Rolling"],
  [/HARVESTER|CUTTER|HEADER|COMBINE/, "Harvesting"], [/MOWER/, "Mowing"], [/TEDDER/, "Tedding"],
  [/WINDROWER/, "Raking"], [/LOADERWAGON/, "Loading"], [/BALEWRAPPER/, "Wrapping"], [/BALER/, "Baling"],
]);

/** "Seeding" for a seeder, from its shop category. @param {{category?: string}|undefined} tool */
export function jobVerb(tool) {
  const name = typeof tool?.category === "string" ? tool.category.toUpperCase() : "";
  return name ? JOBS.find(([re]) => re.test(name))?.[1] : undefined;
}

/**
 * The job in words, for the Implement screen's rig band: an AI worker's
 * job, "Tipping" or "Unloading" while something discharges, the working
 * tool's job ("Seeding", "Harvesting · Wheat"), else what the vehicle does
 * (activity: Driving, Standing, Parked).
 * @param {Vehicle|undefined} v
 * @param {import("../types.js").Cab|undefined} cab
 * @returns {{text: string, icon: string}}
 */
export function rigJob(v, cab) {
  if (!v) return { text: "On foot", icon: "position" };
  if (v.isAI) return { text: aiJobText(v) || "AI worker", icon: "aiWorker" };
  const rig = rigOf(cab);
  const out = rig.find((e) => e.discharging === true);
  if (out) return { text: out.trailer ? "Tipping" : "Unloading", icon: "unload" };
  const impls = implementsOf(v);
  // turned on first (a seeder sowing), then lowered (a cultivator at work)
  const state = (/** @type {Implement} */ i) => rigEntry(cab, i.id) || i;
  const working = impls.find((i) => state(i).turnedOn) ||
    impls.find((i) => state(i).lowered && /** @type {any} */ (state(i)).canLower !== false &&
      !isLoaderGear(rigEntry(cab, i.id), i));
  const head = rig.find((e) => e.depth === 0);
  const tool = working || (head?.turnedOn ? v : undefined);
  if (tool) {
    const verb = jobVerb(tool) || (tool === v ? "Harvesting" : undefined) || "Working";
    const crop = verb === "Harvesting" ? cropTitle(v, /** @type {Implement} */ (tool)) : undefined;
    return { text: crop ? `${verb} · ${crop}` : verb, icon: "implementOn" };
  }
  const what = activity(v);
  return { text: what.text, icon: what.icon };
}

/**
 * What a combine harvests: the crop the mod names, else the grain tank's fill.
 * @param {Vehicle|undefined} v
 * @param {Implement} [tool]
 */
export function cropTitle(v, tool) {
  for (const src of [tool, v]) {
    const crop = /** @type {any} */ (src)?.crop;
    if (crop && (crop.title || crop.name)) return crop.title || fillName({ level: 1, capacity: 1, fillType: crop.name });
  }
  const fill = fillsOf(v).find((f) => f.level > 0);
  return fill ? fillName(fill) : undefined;
}

/**
 * The vehicle's light switches, undefined for a vehicle without lights.
 * @param {Vehicle|undefined} v
 * @returns {{on?: boolean, high?: boolean, left?: boolean, right?: boolean, hazard?: boolean, beacon?: boolean}|undefined}
 */
export function lightsOf(v) {
  return v && v.lights && typeof v.lights === "object" ? v.lights : undefined;
}

// when a value turns into an alert; fuel's warn level also colours its meter
export const LIMITS = { fuelWarn: 15, fuelAlarm: 5, tempWarn: 100, tempAlarm: 110, wearWarn: 80, defWarn: 10, defAlarm: 3 };

/** @param {number|undefined} pct @returns {"warn"|"alarm"|undefined} */
export function fuelLevel(pct) {
  if (pct === undefined) return undefined;
  return pct < LIMITS.fuelAlarm ? "alarm" : pct < LIMITS.fuelWarn ? "warn" : undefined;
}

/** @param {number|undefined} pct @returns {"warn"|"alarm"|undefined} */
export function defLevel(pct) {
  if (pct === undefined) return undefined;
  return pct < LIMITS.defAlarm ? "alarm" : pct < LIMITS.defWarn ? "warn" : undefined;
}

/**
 * What needs the driver's attention, worst first.
 * @param {Vehicle|undefined} v
 * @param {import("./units.js").Units} [units] for the engine's temperature
 * @returns {{id: string, level: "warn"|"alarm", text: string, icon: string}[]}
 */
export function alerts(v, units = METRIC) {
  /** @type {{id: string, level: "warn"|"alarm", text: string, icon: string}[]} */
  const out = [];
  const fuel = fuelPct(v);
  const fuelAt = fuelLevel(fuel);
  if (fuelAt) out.push({ id: "fuel", level: fuelAt, text: `Fuel ${Math.round(/** @type {number} */ (fuel))}%`, icon: "diesel" });
  const def = defPct(v);
  const defAt = defLevel(def);
  if (defAt) out.push({ id: "def", level: defAt, text: `DEF ${Math.round(/** @type {number} */ (def))}%`, icon: "def" });
  const temp = engineTemp(v);
  if (temp !== undefined && temp >= LIMITS.tempWarn) {
    const shown = Math.round(tempValue(temp, units));
    out.push({ id: "temp", level: temp >= LIMITS.tempAlarm ? "alarm" : "warn", text: `Engine ${shown}${tempUnit(units)}`, icon: "engineTemp" });
  }
  const wear = wearPct(v);
  if (wear !== undefined && wear >= LIMITS.wearWarn) {
    out.push({ id: "wear", level: "warn", text: `Wear ${Math.round(wear)}%`, icon: "wear" });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "alarm" ? -1 : 1));
}

/**
 * In-game time of day, "HH:MM".
 * @param {any} env
 * @returns {string|undefined}
 */
export function clock(env) {
  const mins = env?.dayTimeMinutes;
  if (typeof mins !== "number") return undefined;
  return `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** @param {any} env @returns {string|undefined} */
export function weatherName(env) {
  const current = env?.weather?.current;
  if (typeof current === "number") return WEATHER_NAMES[current];
  return current || undefined;
}

export const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];

/**
 * The season as the game's calendar shows it: from the month (1 = January),
 * March to May spring, June to August summer, September to November autumn,
 * December to February winter. Without a month, environment.currentSeason,
 * which reads one season ahead as 0-based (August showed "Autumn" live), so
 * it's taken as 1-based.
 * @param {any} env @returns {string|undefined}
 */
export function seasonName(env) {
  if (typeof env?.month === "number" && env.month >= 1 && env.month <= 12) {
    return SEASON_NAMES[Math.floor((env.month + 9) % 12 / 3)];
  }
  return typeof env?.season === "number" ? SEASON_NAMES[env.season - 1] : undefined;
}

/** @param {any} env @returns {[number, number]|undefined} today's min and max, °C */
export function temperatureRange(env) {
  const w = env?.weather || {};
  return typeof w.tempMin === "number" ? [w.tempMin, w.tempMax] : undefined;
}

/**
 * The farm's balance.
 * @param {any} env
 * @param {number} farmId the viewer's farm (myFarmId)
 * @returns {number|undefined}
 */
export function money(env, farmId) {
  const value = env?.money && env.money[String(farmId)];
  return typeof value === "number" ? value : undefined;
}

/** @param {StoreLike} store */
export const farmMoney = (store) => money(store.get("env"), myFarmId(store));

/**
 * The connection pill: text and kind (the CSS class).
 * @param {{pairing?: string, backend?: boolean, client?: boolean}|undefined} conn
 * @param {number} sinceLastTopic ms since the last topic data
 * @param {number} staleMs
 * @returns {{text: string, kind: "connected"|"waiting"|"disconnected"}}
 */
export function connectionStatus(conn, sinceLastTopic, staleMs) {
  const c = conn || {};
  if (!c.pairing) return { text: "no pairing code (?pair=…)", kind: "disconnected" };
  if (!c.backend) return { text: "backend offline", kind: "disconnected" };
  if (!c.client) return { text: "companion offline", kind: "disconnected" };
  if (sinceLastTopic > staleMs) return { text: "waiting for game", kind: "waiting" };
  return { text: "live", kind: "connected" };
}
