// @ts-check
// The controlled vehicle (or "On foot"): gauges, condition, implements.

import { $, fmt } from "./dom.js";

/** @param {import("../store.js").Store} store */
export function createVehiclePanel(store) {
  const els = {
    name: $("vehicle-name"), speed: $("speed"), rpm: $("rpm"), gear: $("gear"),
    fuel: $("fuel"), wear: $("wear"), temp: $("temp"), hours: $("hours"), pos: $("pos"),
    implCard: $("impl-card"), impls: $("implements"),
  };

  function render() {
    const topic = store.get("vehicles") || {};
    const player = store.get("player") || {};
    const vehicles = topic.vehicles || [];
    const v = vehicles.find((/** @type {any} */ x) => x.id === topic.controlledId);

    els.name.textContent = v ? (v.name || v.typeName || "Vehicle") : "On foot";
    els.speed.textContent = v ? fmt(v.speed) : "–";
    els.rpm.textContent = v ? fmt(v.rpm) : "–";
    els.gear.textContent = v && v.gear != null ? String(v.gear) : "–";
    els.fuel.textContent = v && v.fuelCapacity > 0
      ? Math.round(100 * (v.fuel / v.fuelCapacity)) + "%" : "–";
    els.wear.textContent = v && typeof v.wear === "number" ? Math.round(100 * v.wear) + "%" : "–";
    els.temp.textContent = v && typeof v.motorTemp === "number" ? Math.round(v.motorTemp) + "°C" : "–";
    els.hours.textContent = v && typeof v.operatingHours === "number"
      ? v.operatingHours.toFixed(1) + " h" : "–";
    els.pos.textContent = typeof player.x === "number" ? `${fmt(player.x)}, ${fmt(player.z)}` : "–";

    const impls = (v && v.implements) || [];
    els.implCard.hidden = impls.length === 0;
    els.impls.replaceChildren(...impls.map((/** @type {any} */ impl) => {
      const bits = [];
      if (impl.lowered) bits.push("lowered");
      if (impl.turnedOn) bits.push("on");
      if (impl.wear > 0) bits.push(`wear ${Math.round(100 * impl.wear)}%`);
      const li = document.createElement("li");
      li.textContent = "  ".repeat(Math.max(0, (impl.depth || 1) - 1)) +
        (impl.name || "Implement") + (bits.length ? " – " + bits.join(", ") : "");
      return li;
    }));
  }

  store.subscribe("vehicles", render);
  store.subscribe("player", render);
}
