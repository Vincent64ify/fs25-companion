// @ts-check
// Contracts on the map (specs/0018-contracts.md): a pin at each contract's
// place (the field's number position for field work), filled for yours
// with its %, outlined for the ones on offer with their money per hour (by
// the Contracts page's switch). A tap opens a popup with the row's line
// and Details, which opens the Contracts page on it. The sell point of a
// contract you're delivering for gets a "Deliver here" mark.
//
// A label stays whole and in the clear: a pin stands over its point and
// the Deliver here label hangs under it, centred. Where that would run off
// the map's view or under one of the map's controls (the buttons, the
// scale, the land panel), it starts or ends at the point, or goes to the
// other side. Looked at again when the view comes to rest.
//
// The topic arrives every 2 s and on each change: a pin is touched only when its place or its
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

/** @typedef {{left: number, top: number, right: number, bottom: number}} Box */

/**
 * @typedef {object} LabelShape
 * @property {number} w its width, px
 * @property {number} h its height, px
 * @property {number} gap between the point and the label, px
 * @property {number} inset how far before the point a label starting at it begins, px
 */

/**
 * Where a label goes: the first place where it's whole inside the view and
 * clear of the controls. Its own side of the point first (centred, then
 * starting or ending at the point), then the other side. With no clear
 * place (the point itself is under a control), the one inside the view
 * that's least covered; with none inside, its own.
 * @param {{x: number, y: number}} point the label's point, px in the view
 * @param {{x: number, y: number}} size the view's size, px
 * @param {LabelShape} label
 * @param {"below"|"above"} home the side it's on when nothing is in the way
 * @param {Box[]} [blocks] the controls over the view, px
 * @returns {{v: "below"|"above", h: "start"|"centre"|"end"}}
 */
export function labelSide(point, size, label, home, blocks = []) {
  /** @type {{v: "below"|"above", h: "start"|"centre"|"end"}|undefined} */
  let least;
  let leastCovered = Infinity;
  for (const v of /** @type {("below"|"above")[]} */ ([home, home === "below" ? "above" : "below"])) {
    for (const h of /** @type {("start"|"centre"|"end")[]} */ (["centre", "start", "end"])) {
      const left = h === "centre" ? point.x - label.w / 2 : h === "start" ? point.x - label.inset : point.x + label.inset - label.w;
      const top = v === "below" ? point.y + label.gap : point.y - label.gap - label.h;
      const right = left + label.w;
      const bottom = top + label.h;
      if (left < 0 || top < 0 || right > size.x || bottom > size.y) continue;
      let covered = 0;
      for (const b of blocks) {
        covered += Math.max(0, Math.min(right, b.right) - Math.max(left, b.left))
          * Math.max(0, Math.min(bottom, b.bottom) - Math.max(top, b.top));
      }
      if (!covered) return { v, h };
      if (covered < leastCovered) {
        least = { v, h };
        leastCovered = covered;
      }
    }
  }
  return least || { v: home, h: "centre" };
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

  // The map's controls and the panels laid over it, in the view's pixels.
  function blocks() {
    const box = map.getContainer();
    const at = box.getBoundingClientRect();
    /** @type {Box[]} */
    const out = [];
    const over = [...box.querySelectorAll(".leaflet-control"), ...(box.parentElement?.children || [])];
    for (const el of over) {
      if (el === box) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out.push({ left: r.left - at.left, top: r.top - at.top, right: r.right - at.left, bottom: r.bottom - at.top });
    }
    return out;
  }

  // Each label's side, for where its point is in the view now. A point
  // well outside the view keeps its own side.
  function aim() {
    if (!map.hasLayer(root)) return;
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const over = blocks();
    for (const pin of pins.values()) {
      const el = /** @type {HTMLElement|null} */ (pin.marker.getElement()?.firstElementChild);
      if (!el) continue;
      const deliver = el.classList.contains("ct-deliver");
      const home = deliver ? "below" : "above";
      const point = map.latLngToContainerPoint(pin.marker.getLatLng());
      const seen = point.x >= -16 && point.y >= -16 && point.x <= size.x + 16 && point.y <= size.y + 16;
      const side = seen
        ? labelSide(point, size, { w: el.offsetWidth, h: el.offsetHeight, gap: deliver ? 14 : 6, inset: deliver ? 8 : 14 }, home, over)
        : { v: home, h: "centre" };
      el.dataset.v = side.v;
      el.dataset.h = side.h;
    }
  }
  map.on("moveend zoomend resize", aim);
  root.on("add", aim);
  // the land panel opens and closes with the selection, after this runs
  store.subscribe("selection", () => setTimeout(aim, 0));

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
    aim();
  }

  for (const key of ["contracts", "contractPrefs", "env", "cab"]) store.subscribe(key, render);
  // Show on the map (the Contracts page): that contract's pin opens, once
  // the Map is showing and centred on it
  store.subscribe("goto", (/** @type {{pin?: string}|undefined} */ go) => {
    if (go?.pin === undefined) return;
    setTimeout(() => {
      const pin = pins.get(String(go.pin));
      if (store.get("goto") === go && pin && map.hasLayer(root)) pin.marker.openPopup();
    }, 60);
  });

  return { id: "contracts", title: "Contracts", leafletLayer: root };
}
