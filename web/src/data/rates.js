// @ts-check
// Estimates from the dashboard alone (docs/THEMES.md, Implement screen):
// how fast each tank fills or empties, from its level over the last 60 s,
// and the area each tool has worked since it was attached (or the page
// opened). Nothing here comes from the game but the levels, the speed and
// the working width.
//
// A rate is the slope of a straight line through the last minute's levels
// (least squares). It's hidden (undefined) while there's under 20 s of
// samples, when the line fits badly (unsteady: a refill, stop and go) or
// when the level barely moves.

import { controlledVehicle, implementsOf, rigEntry, cabOf } from "./selectors.js";

export const RATE_WINDOW_MS = 60000;
export const RATE_MIN_SPAN_MS = 20000;
const MIN_SAMPLES = 8;
// how well the line must fit (R²)
const MIN_FIT = 0.8;
// gaps longer than this don't count as working time for the area
const MAX_STEP_MS = 2000;

/** @typedef {{t: number, level: number}} Sample */

/**
 * Litres per minute through the samples (negative: emptying), or undefined
 * when there's too little, it's unsteady or it doesn't move.
 * @param {Sample[]} samples oldest first, t in ms
 * @param {number} capacity
 * @returns {number|undefined}
 */
export function fitRate(samples, capacity) {
  const n = samples.length;
  if (n < MIN_SAMPLES || samples[n - 1].t - samples[0].t < RATE_MIN_SPAN_MS) return undefined;
  let mt = 0;
  let ml = 0;
  for (const s of samples) { mt += s.t; ml += s.level; }
  mt /= n;
  ml /= n;
  let stt = 0;
  let stl = 0;
  let sll = 0;
  for (const s of samples) {
    stt += (s.t - mt) ** 2;
    stl += (s.t - mt) * (s.level - ml);
    sll += (s.level - ml) ** 2;
  }
  if (stt === 0 || sll === 0) return undefined;
  const fit = (stl * stl) / (stt * sll);
  const perMin = (stl / stt) * 60000;
  // under 0.1 % of the tank a minute: as good as standing still
  if (fit < MIN_FIT || Math.abs(perMin) < capacity * 0.001) return undefined;
  return perMin;
}

/**
 * Minutes until the tank is empty (rate < 0) or full (rate > 0): full at
 * its weight limit (the Trailer Fill Limit), else at its capacity.
 * @param {{level: number, capacity: number, limit?: number}} fill
 * @param {number|undefined} rate litres per minute
 * @returns {{minutes: number, full: boolean}|undefined}
 */
export function timeLeft(fill, rate) {
  if (rate === undefined || rate === 0) return undefined;
  const full = rate > 0;
  const top = typeof fill.limit === "number" && fill.limit < fill.capacity ? fill.limit : fill.capacity;
  const litres = full ? top - fill.level : fill.level;
  if (litres <= 0) return undefined;
  return { minutes: litres / Math.abs(rate), full };
}

/** "≈ 12 min", "≈ 1 h 05 min", "< 1 min". @param {number} minutes */
export function minutesText(minutes) {
  if (minutes < 1) return "< 1 min";
  const m = Math.round(minutes);
  if (m < 60) return `≈ ${m} min`;
  return `≈ ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** the key of one fill unit: its owner's id (the vehicle or a tool) and unit */
export const fillKey = (/** @type {number|string|undefined} */ owner, /** @type {any} */ fill, /** @type {number} */ i) =>
  `${owner}:${fill.unit ?? i}`;

/**
 * The estimates for one store, kept as the vehicles topic comes in.
 * @param {{get: (key: string) => any, subscribe: (key: string, fn: () => void) => any}} store
 * @param {() => number} [now] ms
 */
export function createRates(store, now = () => performance.now()) {
  /** @type {Map<string, Sample[]>} */
  const levels = new Map();
  /** @type {Map<number, number>} tool id -> hectares */
  const areas = new Map();
  /** @type {unknown} */
  let vehicleId;
  let lastAt = 0;

  store.subscribe("vehicles", () => {
    const v = controlledVehicle(store);
    const t = now();
    if (v?.id !== vehicleId) {
      vehicleId = v?.id;
      levels.clear();
      areas.clear();
      lastAt = t;
      if (!v) return;
    }
    if (!v) return;
    const seen = new Set();
    /** @param {number|string|undefined} owner @param {any} fills */
    const sample = (owner, fills) => {
      (Array.isArray(fills) ? fills : []).forEach((f, i) => {
        if (!f || !(f.capacity > 0)) return;
        const key = fillKey(owner, f, i);
        seen.add(key);
        const list = levels.get(key) || [];
        list.push({ t, level: f.level || 0 });
        while (list.length && list[0].t < t - RATE_WINDOW_MS) list.shift();
        levels.set(key, list);
      });
    };
    sample(v.id, v.fills);
    const cab = cabOf(store);
    const dt = Math.min(t - lastAt, MAX_STEP_MS);
    const ids = new Set();
    for (const impl of implementsOf(v)) {
      sample(impl.id, impl.fills);
      if (typeof impl.id !== "number") continue;
      ids.add(impl.id);
      // working: lowered, or turned on (a sprayer), as the cab has it now
      const state = rigEntry(cab, impl.id) || impl;
      const working = state.lowered || state.turnedOn;
      if (working && impl.workWidth && impl.workWidth > 0 && (v.speed ?? 0) > 0.5 && dt > 0) {
        const ha = ((v.speed ?? 0) / 3.6) * (dt / 1000) * impl.workWidth / 10000;
        areas.set(impl.id, (areas.get(impl.id) || 0) + ha);
      }
    }
    lastAt = t;
    for (const key of levels.keys()) if (!seen.has(key)) levels.delete(key);
    // detached: its run is over
    for (const id of areas.keys()) if (!ids.has(id)) areas.delete(id);
  });

  return {
    /**
     * Litres per minute for one fill unit, undefined when there's no steady rate.
     * @param {number|string|undefined} owner @param {any} fill @param {number} i its index
     */
    rate(owner, fill, i) {
      const list = levels.get(fillKey(owner, fill, i));
      return list ? fitRate(list, fill.capacity) : undefined;
    },
    /** Hectares the tool has worked this run, undefined before any. @param {number|undefined} id */
    area: (id) => (id === undefined ? undefined : areas.get(id)),
  };
}

/** @type {WeakMap<object, ReturnType<typeof createRates>>} */
const shared = new WeakMap();

/**
 * The store's estimates, made on first use.
 * @param {Parameters<typeof createRates>[0]} store
 */
export function ratesOf(store) {
  let rates = shared.get(store);
  if (!rates) {
    rates = createRates(store);
    shared.set(store, rates);
  }
  return rates;
}
