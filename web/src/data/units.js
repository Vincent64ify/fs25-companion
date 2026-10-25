// @ts-check
// The player's units, from the game's settings (env.units, Themes T6):
// miles, Fahrenheit, acres and the currency symbol. The mod sends metric
// values; these convert them for display. Without settings: metric and "$"
// (the dashboard's money sign before T6).

/**
 * @typedef {Object} Units
 * @property {boolean} miles
 * @property {boolean} fahrenheit
 * @property {boolean} acres
 * @property {string} currency
 */

/** @type {Units} */
export const METRIC = Object.freeze({ miles: false, fahrenheit: false, acres: false, currency: "$" });

const KM_PER_MILE = 1.609344;
const HA_PER_ACRE = 0.40468564224;

/**
 * The env topic's units, missing ones metric.
 * @param {any} env
 * @returns {Units}
 */
export function unitsFrom(env) {
  const u = env?.units;
  if (!u || typeof u !== "object") return METRIC;
  return {
    miles: u.miles === true,
    fahrenheit: u.fahrenheit === true,
    acres: u.acres === true,
    currency: typeof u.currency === "string" && u.currency ? u.currency : METRIC.currency,
  };
}

/** @param {{get: (key: string) => any}} store */
export const unitsOf = (store) => unitsFrom(store.get("env"));

/** @param {Units} u */
export const speedUnit = (u) => (u.miles ? "mph" : "km/h");
/** @param {number} kmh @param {Units} u */
export const speedValue = (kmh, u) => (u.miles ? kmh / KM_PER_MILE : kmh);
/** the other way: a speed in the player's unit, in km/h @param {number} value @param {Units} u */
export const speedToKmh = (value, u) => (u.miles ? value * KM_PER_MILE : value);

/** @param {Units} u */
export const tempUnit = (u) => (u.fahrenheit ? "°F" : "°C");
/** @param {number} celsius @param {Units} u */
export const tempValue = (celsius, u) => (u.fahrenheit ? celsius * 1.8 + 32 : celsius);

/** "1.51 ha" or "3.73 ac". @param {number} ha @param {Units} u */
export const areaText = (ha, u) => (u.acres ? `${(ha / HA_PER_ACRE).toFixed(2)} ac` : `${ha.toFixed(2)} ha`);
/** @param {Units} u */
export const areaUnit = (u) => (u.acres ? "ac" : "ha");
/** an area in the player's unit @param {number} ha @param {Units} u */
export const areaValue = (ha, u) => (u.acres ? ha / HA_PER_ACRE : ha);
/** something per hectare (a yield), per acre with acres @param {number} perHa @param {Units} u */
export const perAreaValue = (perHa, u) => (u.acres ? perHa * HA_PER_ACRE : perHa);

/** "£123,457". @param {number} amount @param {Units} u */
export const moneyText = (amount, u) => u.currency + Math.round(amount).toLocaleString();

const FT_PER_M = 3.28084;

/** A working width: "6.0 m", or "19.7 ft" with miles. @param {number} m @param {Units} u */
export const lengthText = (m, u) => (u.miles ? `${(m * FT_PER_M).toFixed(1)} ft` : `${m.toFixed(1)} m`);
