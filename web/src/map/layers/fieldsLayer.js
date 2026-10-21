// @ts-check
// Fields: outlines from field_outlines (once per map), coloured from the
// fields topic (every 15 s) in one of the PDA's modes: crop, growth,
// fertilizer, lime, plowing, weeds. Field numbers show when zoomed in.
// Tap a field to select it: the field info panel shows its details (the
// selection is the store's "selectedField" key). Tap anywhere else on the
// map to close it.

import { landRenderer, worldToLatLng } from "../mapView.js";
import { MODES, classify, cropCatalog, legendKey } from "../fieldStyle.js";

/** @typedef {import("../../types.js").FieldOutline} FieldOutline */
/** @typedef {import("../../types.js").FieldState} FieldState */
/** @typedef {import("../fieldStyle.js").FieldMode} FieldMode */

/** zoom from which the field numbers show (2 m per pixel) */
const LABEL_ZOOM = -1;

const BASE = { weight: 1, color: "#0f172a", opacity: 0.55 };
const SELECTED = { weight: 3, color: "#ffffff", opacity: 1 };

/**
 * @param {any} map L.Map
 * @param {import("../../store.js").Store} store
 */
export function createFieldsLayer(map, store) {
  const renderer = landRenderer(map);
  map.createPane("fieldLabels").style.zIndex = "420";
  const shapes = L.layerGroup();
  const labels = L.layerGroup();
  const root = L.layerGroup([shapes]);
  /** @type {Map<number, {polygon: any, label: any}>} */
  const byId = new Map();
  /** field clicked in the click being dispatched (the shape fires before the map) */
  let picked = /** @type {number|undefined} */ (undefined);
  /** @type {FieldMode} */
  let mode = "crop";
  let labelsOn = true;
  let outlineKey = "";
  const key = document.createElement("div");
  key.className = "legend-key";

  /** @param {{fields?: FieldOutline[]}|undefined} topic */
  function build(topic) {
    const list = topic?.fields || [];
    // the same outlines come again in every snapshot and after a rotation
    const k = list.map((f) => `${f.id}:${f.points.join(",")}`).join("|");
    if (k === outlineKey) return;
    outlineKey = k;
    shapes.clearLayers();
    labels.clearLayers();
    byId.clear();
    for (const f of list) {
      const latLngs = [];
      for (let i = 0; i + 1 < f.points.length; i += 2) {
        latLngs.push(worldToLatLng(f.points[i], f.points[i + 1]));
      }
      const polygon = L.polygon(latLngs, { renderer, pane: "land", ...BASE, fillOpacity: 0 });
      // the canvas hands a click only to shapes listening for it
      polygon.on("click", () => { picked = f.id; });
      shapes.addLayer(polygon);
      const label = L.marker(polygon.getBounds().getCenter(), {
        pane: "fieldLabels",
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "field-label", html: String(f.id), iconSize: [28, 16] }),
      });
      labels.addLayer(label);
      byId.set(f.id, { polygon, label });
    }
  }

  function restyle() {
    /** @type {FieldState[]} */
    const fields = store.get("fields")?.fields || [];
    const catalog = cropCatalog(store.get("crop_types"));
    const states = new Map(fields.map((f) => [f.id, f]));
    const selected = store.get("selectedField");
    for (const [id, { polygon, label }] of byId) {
      const state = states.get(id);
      const cls = classify(state, catalog, mode);
      polygon.setStyle({
        ...(id === selected ? SELECTED : BASE),
        fill: true,
        fillColor: cls.color || "#000",
        fillOpacity: cls.color === null ? 0 : cls.muted ? 0.15 : 0.75,
      });
      // the field number sits on the game's field sign when known
      if (typeof state?.x === "number" && typeof state?.z === "number") {
        label.setLatLng(worldToLatLng(state.x, state.z));
      }
    }
    renderKey(fields.filter((f) => byId.has(f.id)), catalog);
  }

  /** @param {FieldState[]} fields @param {import("../fieldStyle.js").CropCatalog} catalog */
  function renderKey(fields, catalog) {
    key.replaceChildren(...legendKey(fields, catalog, mode).map((cls) => {
      const row = document.createElement("div");
      row.className = "legend-key-item";
      const swatch = document.createElement("span");
      swatch.className = "field-swatch" + (cls.color === null ? " empty" : "");
      if (cls.color) {
        swatch.style.background = cls.color;
        if (cls.muted) swatch.style.opacity = "0.4";
      }
      const text = document.createElement("span");
      text.textContent = cls.label;
      row.append(swatch, text);
      return row;
    }));
  }

  function updateLabels() {
    const show = labelsOn && map.hasLayer(shapes) && map.getZoom() >= LABEL_ZOOM;
    if (show && !root.hasLayer(labels)) root.addLayer(labels);
    else if (!show && root.hasLayer(labels)) root.removeLayer(labels);
  }

  store.subscribe("field_outlines", (topic) => {
    build(topic);
    restyle();
  });
  store.subscribe("fields", restyle);
  store.subscribe("crop_types", restyle);
  store.subscribe("selectedField", (id) => {
    restyle();
    byId.get(id)?.polygon.bringToFront();
  });
  // Every click on the land ends here (markers don't bubble up): a field
  // selects it, anything else (a farmland, bare map) closes the panel. The
  // click goes on to the farmlands layer, which opens the farmland popup.
  map.on("click", () => {
    store.set("selectedField", picked);
    picked = undefined;
  });
  map.on("zoomend", updateLabels);
  shapes.on("add remove", updateLabels);

  return {
    id: "fields",
    title: "Fields",
    leafletLayer: root,
    legendItems: [
      {
        id: "shapes",
        label: "Fields",
        setVisible: (/** @type {boolean} */ on) => {
          if (on) root.addLayer(shapes);
          else root.removeLayer(shapes);
          updateLabels();
        },
      },
      {
        id: "labels",
        label: "Field numbers",
        setVisible: (/** @type {boolean} */ on) => {
          labelsOn = on;
          updateLabels();
        },
      },
    ],
    legendChoice: {
      id: "mode",
      label: "Colour by",
      options: MODES,
      defaultValue: "crop",
      set: (/** @type {string} */ value) => {
        mode = /** @type {FieldMode} */ (value);
        restyle();
      },
    },
    legendExtra: key,
  };
}
