// @ts-check
// The controlled vehicle's values (or "On foot"), and the player's position.

import { valueWidget } from "./widget.js";
import {
  controlledVehicle, engineTemp as engineTempOf, fuelLevel, fuelPct, LIMITS, operatingHours,
  vehicleName as nameOf, wearPct,
} from "../data/selectors.js";
import { fmt } from "../ui/dom.js";

const VEHICLE = ["vehicles"];
const num = (/** @type {unknown} */ v) => (typeof v === "number" ? v : undefined);
const pct = (/** @type {number} */ v) => Math.round(v) + "%";

export const vehicleName = valueWidget({
  label: "Vehicle", topics: VEHICLE,
  read: (store) => nameOf(controlledVehicle(store)),
  text: String,
}, "title");

export const speed = valueWidget({
  label: "Speed", unit: "km/h", icon: "speed", topics: VEHICLE,
  read: (store) => num(controlledVehicle(store)?.speed),
  text: (v) => `${fmt(v)} km/h`, number: fmt,
}, "gauge");

export const rpm = valueWidget({
  label: "Engine speed", unit: "rpm", icon: "rpm", topics: VEHICLE,
  read: (store) => num(controlledVehicle(store)?.rpm),
  text: (v) => `${fmt(v)} rpm`, number: fmt,
}, "gauge");

export const gear = valueWidget({
  label: "Gear", icon: "gear", topics: VEHICLE,
  read: (store) => controlledVehicle(store)?.gear ?? undefined,
  text: String,
}, "gauge");

// litres, or kWh for an electric vehicle
const FUEL_UNITS = /** @type {Record<string, string>} */ ({ electriccharge: "kWh" });

export const fuel = valueWidget({
  label: "Fuel", unit: "%", icon: "diesel", topics: VEHICLE,
  read: (store) => fuelPct(controlledVehicle(store)),
  text: pct, number: (v) => String(Math.round(v)),
  level: fuelLevel, meter: (v) => v,
  detail: (store) => {
    const v = controlledVehicle(store);
    return v && typeof v.fuel === "number" ? `${Math.round(v.fuel).toLocaleString()} ${FUEL_UNITS[v.fuelType] || "L"}` : undefined;
  },
});

export const wear = valueWidget({
  label: "Wear", unit: "%", icon: "wear", topics: VEHICLE,
  read: (store) => wearPct(controlledVehicle(store)),
  text: pct, number: (v) => String(Math.round(v)),
  level: (v) => (v >= LIMITS.wearWarn ? "warn" : undefined),
  bar: (v) => v,
});

export const engineTemp = valueWidget({
  label: "Engine temp", unit: "°C", icon: "engineTemp", topics: VEHICLE,
  read: (store) => engineTempOf(controlledVehicle(store)),
  text: (v) => Math.round(v) + "°C", number: (v) => String(Math.round(v)),
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
