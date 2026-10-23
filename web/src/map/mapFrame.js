// @ts-check
// The map frame: the one Leaflet map's box with its overlays (the
// "Waiting for the game" hint and the field panel). There is one frame;
// it moves into whichever map slot the visible screen has.

import { h } from "../ui/dom.js";
import { remeasure } from "./mapView.js";

/** @param {import("../store.js").Store} store */
export function createMapFrame(store) {
  const mapEl = h("div", { id: "map" });
  const hint = h("div", { id: "map-hint", text: "Waiting for the game…" });
  const fieldInfo = h("div", { id: "field-info", className: "field-info", hidden: true });
  const el = h("section", { id: "map-wrap" }, mapEl, hint, fieldInfo);
  store.subscribe("hello", (hello) => { hint.hidden = !!hello; });

  return {
    el,
    /** the Leaflet map's container */
    mapEl,
    /** the field panel's box (panels/fieldInfoPanel.js) */
    fieldInfo,
    /** @type {any} L.Map, once created */
    map: null,

    /**
     * Put the frame first in a map slot; the map re-measures itself.
     * @param {HTMLElement} slot
     */
    moveTo(slot) {
      if (el.parentElement !== slot || slot.firstElementChild !== el) slot.prepend(el);
      if (this.map) remeasure(this.map, { pan: false });
    },
  };
}

/** @typedef {ReturnType<typeof createMapFrame>} MapFrame */
