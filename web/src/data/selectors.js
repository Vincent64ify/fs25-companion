// @ts-check
// Pure reads of the store's topics, shared by every theme's widgets. They
// return raw values (numbers, names) or undefined when the data is
// missing; widgets do the formatting.

import { myFarmId } from "../store.js";

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

/** @param {Vehicle|undefined} v */
export const vehicleName = (v) => (v ? v.name || v.typeName || "Vehicle" : "On foot");

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

/**
 * Attached implements, in attach order; depth 1 hangs on the vehicle.
 * @param {Vehicle|undefined} v
 * @returns {{name?: string, depth?: number, lowered?: boolean, turnedOn?: boolean, wear?: number}[]}
 */
export function implementsOf(v) {
  return (v && v.implements) || [];
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
export const LIMITS = { fuelWarn: 15, fuelAlarm: 5, tempWarn: 100, tempAlarm: 110, wearWarn: 80 };

/** @param {number|undefined} pct @returns {"warn"|"alarm"|undefined} */
export function fuelLevel(pct) {
  if (pct === undefined) return undefined;
  return pct < LIMITS.fuelAlarm ? "alarm" : pct < LIMITS.fuelWarn ? "warn" : undefined;
}

/**
 * What needs the driver's attention, worst first.
 * @param {Vehicle|undefined} v
 * @returns {{id: string, level: "warn"|"alarm", text: string, icon: string}[]}
 */
export function alerts(v) {
  /** @type {{id: string, level: "warn"|"alarm", text: string, icon: string}[]} */
  const out = [];
  const fuel = fuelPct(v);
  const fuelAt = fuelLevel(fuel);
  if (fuelAt) out.push({ id: "fuel", level: fuelAt, text: `Fuel ${Math.round(/** @type {number} */ (fuel))}%`, icon: "diesel" });
  const temp = engineTemp(v);
  if (temp !== undefined && temp >= LIMITS.tempWarn) {
    out.push({ id: "temp", level: temp >= LIMITS.tempAlarm ? "alarm" : "warn", text: `Engine ${Math.round(temp)}°C`, icon: "engineTemp" });
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

// environment.currentSeason, 0-based like the game's Season enum
export const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];

/** @param {any} env @returns {string|undefined} */
export function seasonName(env) {
  return typeof env?.season === "number" ? SEASON_NAMES[env.season] : undefined;
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
