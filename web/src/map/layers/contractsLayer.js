// @ts-check
// Contracts on the map (specs/0018-contracts.md): a pin at each contract's
// place (the field's number position for field work), filled for yours
// with its %, outlined for the ones on offer with their money per hour (by
// the Contracts page's switch). A tap opens a popup with the row's line
// and Details, which opens the Contracts page on it. The sell point of a
// contract you're delivering for gets a "Deliver here" mark.
//
// The topic arrives every 2 s: a pin is touched only when its place or its
// words change, so an open popup stays open.

import { worldToLatLng } from "../mapView.js";
import {
  contextOf, contractsOf, figures, FINISH_WORDS, pctText, placeOf, statLine, titleOf,
} from "../../data/contracts.js";
import { areaText, moneyText, unitsOf } from "../../data/units.js";
import { h } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";

/** @typedef {import("../../types.js").Contract} Contract */

/**
 * What a contract's pin says: yours its %, an offer its money per hour
 * (else its net, else its title).
 * @param {Contract} c @param {import("../../data/contracts.js").Figures} f @param {import("../../data/units.js").Units} units
 */
export function pinLabel(c, f, units) {
  if (c.status === "offer") {
    if (f.perHour !== undefined) return `${moneyText(f.perHour, units)}/h`;
    return f.net !== undefined ? moneyText(f.net, units) : c.title || "Contract";
  }
  if (c.status === "finished") return FINISH_WORDS[c.finishState || ""] || "Finished";
  return typeof c.completion === "number" ? pctText(c.completion) : c.title || "Contract";
}

/**
 * @param {any} map L.Map
 * @param {import("../../store.js").Store} store
 * @returns {import("../../types.js").MapLayer}
 */
export function createContractsLayer(map, store) {
  // over the places (610), under Leaflet's own markers and popups
  map.createPane("contracts").style.zIndex = "620";
  const root = L.layerGroup();
  /** @type {Map<string, {marker: any, key: string}>} */
  const pins = new Map();

  /** @param {string} id */
  function popup(id) {
    const c = contractsOf(store).find((k) => k.id === id);
    if (!c) return h("div", { className: "ct-popup" });
    const units = unitsOf(store);
    const line = statLine(c, contextOf(store), units).map((s) => s.pre + s.v + s.post).join(" · ");
    const details = h("button", { className: "ct-btn", text: "Details" });
    details.setAttribute("type", "button");
    details.addEventListener("click", () => {
      map.closePopup();
      store.set("goto", { screen: "contracts", contract: id });
    });
    return h("div", { className: "ct-popup" }, h("b", { text: titleOf(c) }),
      h("span", { className: "ct-popup-sub", text: [placeOf(c), typeof c.areaHa === "number" ? areaText(c.areaHa, units) : "",
        c.npc ? `for ${c.npc}` : ""].filter(Boolean).join(" · ") }),
      h("span", { className: "ct-popup-line", text: line }), details);
  }

  /**
   * @param {string} id @param {number} x @param {number} z @param {string} key what it shows
   * @param {() => HTMLElement} draw @param {string} title @param {boolean} tappable
   */
  function place(id, x, z, key, draw, title, tappable) {
    const had = pins.get(id);
    if (had?.key === key) return;
    const divIcon = L.divIcon({ className: "ct-pin-box", html: draw(), iconSize: [0, 0] });
    if (had) {
      had.marker.setLatLng(worldToLatLng(x, z));
      had.marker.setIcon(divIcon);
      had.key = key;
      return;
    }
    const marker = L.marker(worldToLatLng(x, z), { icon: divIcon, pane: "contracts", keyboard: false, title,
      interactive: tappable });
    if (tappable) marker.bindPopup(() => popup(id), { minWidth: 220, maxWidth: 300 });
    root.addLayer(marker);
    pins.set(id, { marker, key });
  }

  function render() {
    const ctx = contextOf(store);
    const units = unitsOf(store);
    const seen = new Set();
    for (const c of contractsOf(store)) {
      const mine = c.status !== "offer";
      if (typeof c.x === "number" && typeof c.z === "number") {
        const f = figures(c, ctx);
        const label = pinLabel(c, f, units);
        const late = mine && f.late;
        seen.add(c.id);
        place(c.id, c.x, c.z, JSON.stringify([c.x, c.z, label, mine, late]), () => {
          const pin = h("span", { className: "ct-pin", text: label });
          pin.dataset.mine = String(mine);
          if (late) pin.dataset.tone = "warn";
          return pin;
        }, titleOf(c), true);
      }
      const sell = c.sellPoint;
      if (c.status === "running" && sell && typeof sell.x === "number" && typeof sell.z === "number") {
        const id = `${c.id}:deliver`;
        const text = ["Deliver here", sell.name].filter(Boolean).join(" · ");
        seen.add(id);
        place(id, sell.x, sell.z, JSON.stringify([sell.x, sell.z, text]),
          () => h("span", { className: "ct-deliver" }, icon("unload"), text), text, false);
      }
    }
    for (const [id, pin] of pins) {
      if (seen.has(id)) continue;
      root.removeLayer(pin.marker);
      pins.delete(id);
    }
  }

  for (const key of ["contracts", "contractPrefs", "env", "cab"]) store.subscribe(key, render);

  return { id: "contracts", title: "Contracts", leafletLayer: root };
}
