// @ts-check
// The controlled vehicle's values (or "On foot"), and the player's position.
// Speeds and temperatures follow the game's unit settings (data/units.js).

import { valueWidget } from "./widget.js";
import {
  controlledVehicle, cruiseOf, defLevel, defPct, engineTemp as engineTempOf, fillMax, fillName, fillPct, fillsOf,
  fuelLevel, fuelPct, fuelUsage as fuelUsageOf, gearName, LIMITS, mainFill, operatingHours,
  vehicleName as nameOf, wearPct,
} from "../data/selectors.js";
import { speedUnit, speedValue, tempUnit, tempValue, unitsOf } from "../data/units.js";
import { fmt } from "../ui/dom.js";

const VEHICLE = ["vehicles"];
// values shown in the player's units: the env topic carries them
const WITH_UNITS = ["vehicles", "env"];
/** @param {import("../store.js").Store} store */
const speedUnitOf = (store) => speedUnit(unitsOf(store));
/** km/h in the player's unit, as a whole number. @param {number} kmh @param {import("../store.js").Store} store */
const speedNumber = (kmh, store) => fmt(speedValue(kmh, unitsOf(store)));
const num = (/** @type {unknown} */ v) => (typeof v === "number" ? v : undefined);
const pct = (/** @type {number} */ v) => Math.round(v) + "%";

export const vehicleName = valueWidget({
  label: "Vehicle", topics: VEHICLE,
  read: (store) => nameOf(controlledVehicle(store)),
  text: String,
}, "title");

export const speed = valueWidget({
  label: "Speed", unit: speedUnitOf, icon: "speed", topics: WITH_UNITS,
  read: (store) => num(controlledVehicle(store)?.speed),
  text: (v, store) => `${speedNumber(v, store)} ${speedUnitOf(store)}`, number: speedNumber,
}, "gauge");

export const rpm = valueWidget({
  label: "Engine speed", unit: "rpm", icon: "rpm", topics: VEHICLE,
  read: (store) => num(controlledVehicle(store)?.rpm),
  text: (v) => `${fmt(v)} rpm`, number: fmt,
}, "gauge");

export const gear = valueWidget({
  label: "Gear", icon: "gear", topics: VEHICLE,
  read: (store) => gearName(controlledVehicle(store)),
  text: String,
}, "gauge");

// litres, or kWh for an electric vehicle
const FUEL_UNITS = /** @type {Record<string, string>} */ ({ electriccharge: "kWh" });
const fuelUnit = (/** @type {import("../types.js").Vehicle|undefined} */ v) => FUEL_UNITS[v?.fuelType] || "L";

export const fuel = valueWidget({
  label: "Fuel", unit: "%", icon: "diesel", topics: VEHICLE,
  read: (store) => fuelPct(controlledVehicle(store)),
  text: pct, number: (v) => String(Math.round(v)),
  level: fuelLevel, meter: (v) => v,
  detail: (store) => {
    const v = controlledVehicle(store);
    return v && typeof v.fuel === "number" ? `${Math.round(v.fuel).toLocaleString()} ${fuelUnit(v)}` : undefined;
  },
});

// litres (or kWh) per hour, as the game's HUD shows it
export const fuelUsage = valueWidget({
  label: "Fuel usage", icon: "diesel", topics: VEHICLE,
  unit: (store) => `${fuelUnit(controlledVehicle(store))}/h`,
  read: (store) => fuelUsageOf(controlledVehicle(store)),
  text: (v, store) => `${v.toFixed(1)} ${fuelUnit(controlledVehicle(store))}/h`,
  number: (v) => v.toFixed(1),
});

// DEF (AdBlue), for engines that use it
export const def = valueWidget({
  label: "DEF", unit: "%", icon: "def", topics: VEHICLE,
  read: (store) => defPct(controlledVehicle(store)),
  text: pct, number: (v) => String(Math.round(v)),
  level: defLevel, meter: (v) => v,
  detail: (store) => {
    const v = controlledVehicle(store);
    return v && typeof v.def === "number" ? `${Math.round(v.def).toLocaleString()} L` : undefined;
  },
});

/** "Off", "Full" or the set speed in the player's unit. @param {NonNullable<ReturnType<typeof cruiseOf>>} c */
const cruiseText = (c, /** @type {import("../store.js").Store} */ store) => {
  if (c.state === "off") return "Off";
  if (c.state === "full" || typeof c.speed !== "number") return "Full";
  return `${speedNumber(c.speed, store)} ${speedUnitOf(store)}`;
};

export const cruise = valueWidget({
  label: "Cruise", icon: "cruise", topics: WITH_UNITS,
  read: (store) => cruiseOf(controlledVehicle(store)),
  text: cruiseText,
});

// the set speed while cruise control holds it, hidden otherwise (a readout)
export const cruiseSpeed = valueWidget({
  label: "Cruise", icon: "cruise", topics: WITH_UNITS,
  read: (store) => {
    const c = cruiseOf(controlledVehicle(store));
    return c && c.state !== "off" ? c : undefined;
  },
  text: cruiseText,
}, "readout");

// the vehicle's own load (a grain tank, a trailer, a truck's bed): its
// first loaded unit
export const load = valueWidget({
  label: "Load", unit: "%", icon: "fill", topics: VEHICLE,
  read: (store) => mainFill(fillsOf(controlledVehicle(store))),
  text: (f) => `${fillName(f)} ${Math.round(fillPct(f))}%${fillMax(f) ? " · MAX" : ""}`,
  number: (f) => String(Math.round(fillPct(f))),
  meter: fillPct,
  detail: (store) => {
    const f = mainFill(fillsOf(controlledVehicle(store)));
    return f ? fillName(f) : undefined;
  },
});

export const wear = valueWidget({
  label: "Wear", unit: "%", icon: "wear", topics: VEHICLE,
  read: (store) => wearPct(controlledVehicle(store)),
  text: pct, number: (v) => String(Math.round(v)),
  level: (v) => (v >= LIMITS.wearWarn ? "warn" : undefined),
  bar: (v) => v,
});

const tempNumber = (/** @type {number} */ c, /** @type {import("../store.js").Store} */ store) =>
  String(Math.round(tempValue(c, unitsOf(store))));

// read in °C, so the limits stay in °C
export const engineTemp = valueWidget({
  label: "Engine temp", unit: (store) => tempUnit(unitsOf(store)), icon: "engineTemp", topics: WITH_UNITS,
  read: (store) => engineTempOf(controlledVehicle(store)),
  text: (v, store) => tempNumber(v, store) + tempUnit(unitsOf(store)), number: tempNumber,
  level: (v) => (v >= LIMITS.tempAlarm ? "alarm" : v >= LIMITS.tempWarn ? "warn" : undefined),
  // full at 140 °C, so the alarm sits near the end
  bar: (v) => v / 1.4,
});

export const hours = valueWidget({
  label: "Hours", unit: "h", icon: "hours", topics: VEHICLE,
  read: (store) => operatingHours(controlledVehicle(store)),
  text: (v) => v.toFixed(1) + " h", number: (v) => v.toFixed(1),
  note: "Hour meter",
});

export const position = valueWidget({
  label: "Position", topics: ["player"],
  read: (store) => {
    const p = store.get("player") || {};
    return typeof p.x === "number" ? p : undefined;
  },
  text: (p) => `${fmt(p.x)}, ${fmt(p.z)}`,
});
