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
