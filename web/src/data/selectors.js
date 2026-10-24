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
 * One fill unit, as the mod sends it: an empty unit has no fill type.
 * @typedef {{unit?: number, level: number, capacity: number, fillType?: string, fillTitle?: string}} Fill
 */

/** @param {any} list @returns {Fill[]} */
const fillList = (list) => (Array.isArray(list) ? list.filter((f) => f && f.capacity > 0) : []);

/** The vehicle's own fill units (a grain tank, a truck's load), without its fuel. @param {Vehicle|undefined} v */
export const fillsOf = (v) => fillList(v?.fills);

/** @param {Fill} f @returns {number} 0..100 */
export const fillPct = (f) => Math.max(0, Math.min(100, (100 * (f.level || 0)) / f.capacity));

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
 * @typedef {{id?: number, name?: string, brand?: string, typeName?: string, category?: string, categoryTitle?: string,
 *   depth?: number, lowered?: boolean, turnedOn?: boolean, wear?: number, pto?: boolean,
 *   hitch?: number, fills?: Fill[]}} Implement
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
  return cab.rig.find((e) => e.depth > 0 && e.id === id) ?? null;
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
