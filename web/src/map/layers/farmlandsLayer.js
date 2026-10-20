// @ts-check
// Farmlands: outlines traced from the farmland_grid topic (once per map),
// shaded by owner from the farmlands topic (every 10 s): the viewer's land,
// other farms' land, and land for sale. Land the farmlands screen doesn't
// offer (towns, roads) isn't drawn. Tap a farmland for its size and price.

import { worldToLatLng } from "../mapView.js";
import { farmlandSwatch } from "../icons.js";
import { farmlandOutlines } from "../farmlandGeometry.js";
import { myFarmId } from "../../store.js";

/** @typedef {import("../../types.js").Farmland} Farmland */
/** @typedef {import("../../types.js").FarmlandGrid} FarmlandGrid */
/** @typedef {"mine"|"other"|"sale"} FarmlandClass */

/** @type {{id: FarmlandClass, label: string}[]} */
const CLASSES = [
  { id: "mine", label: "Your land" },
  { id: "other", label: "Other farms' land" },
  { id: "sale", label: "Land for sale" },
];

/** Leaflet path styles; colours match the legend swatches (style.css). */
const STYLES = {
  mine: { color: "#4ade80", weight: 1.5, opacity: 0.9, fillColor: "#22c55e", fillOpacity: 0.25 },
  other: { color: "#93c5fd", weight: 1, opacity: 0.8, fillColor: "#3b82f6", fillOpacity: 0.18 },
  sale: { color: "#f8fafc", weight: 1, opacity: 0.4, fillColor: "#f8fafc", fillOpacity: 0 },
};

/** @param {Farmland|undefined} f @param {number} farmId @returns {FarmlandClass|null} */
function classOf(f, farmId) {
  if (!f) return "sale"; // outline known, details not yet
  if (f.farmId === farmId) return "mine";
  if (f.farmId) return "other";
  return f.listed === false ? null : "sale";
}

const money = (/** @type {number} */ v) => "$" + Math.round(v).toLocaleString();

/** @param {number} id @param {Farmland|undefined} f @param {number} farmId */
function popupContent(id, f, farmId) {
  const div = document.createElement("div");
  div.className = "farmland-popup";
  const title = document.createElement("strong");
  title.textContent = `Farmland ${f?.name || id}`;
  div.append(title);
  const lines = [];
  if (typeof f?.areaHa === "number") lines.push(`${f.areaHa.toFixed(2)} ha`);
  if (f?.farmId === farmId) lines.push("Owned by you");
  else if (f?.farmId) lines.push(`Owned by farm ${f.farmId}`);
  else if (f) lines.push(typeof f.price === "number" ? `For sale: ${money(f.price)}` : "For sale");
  for (const text of lines) {
    const line = document.createElement("div");
    line.textContent = text;
    div.append(line);
  }
  return div;
}

/**
 * @param {any} map L.Map
 * @param {import("../../store.js").Store} store
 */
export function createFarmlandsLayer(map, store) {
  // above the overview image (overlayPane, 400), below every marker
  map.createPane("farmlands").style.zIndex = "410";
  const renderer = L.canvas({ pane: "farmlands", padding: 0.5 });
  /** @type {Record<FarmlandClass, any>} */
  const groups = { mine: L.layerGroup(), other: L.layerGroup(), sale: L.layerGroup() };
  const root = L.layerGroup(Object.values(groups));
  /** @type {Map<number, {polygon: any, cls: FarmlandClass|null}>} */
  const shapes = new Map();
  let tracedKey = "";

  /** @param {FarmlandGrid|undefined} grid */
  function trace(grid) {
    // the same grid comes again in every snapshot and after a file rotation
    const key = grid ? [grid.cell, grid.cols, grid.rows, grid.originX, grid.originZ, grid.runs?.join()].join("|") : "";
    if (key === tracedKey) return;
    tracedKey = key;
    for (const g of Object.values(groups)) g.clearLayers();
    shapes.clear();
    if (!grid) return;
    let outlines;
    try {
      outlines = farmlandOutlines(grid);
    } catch (e) {
      console.warn("farmland grid unusable", e);
      return;
    }
    for (const [id, rings] of outlines) {
      const latLngs = rings.map((ring) => ring.map((p) => worldToLatLng(p.x, p.z)));
      const polygon = L.polygon(latLngs, { renderer, pane: "farmlands", ...STYLES.sale });
      polygon.bindPopup(() => popupContent(id, byId().get(id), myFarmId(store)));
      shapes.set(id, { polygon, cls: null });
    }
  }

  function byId() {
    /** @type {Farmland[]} */
    const list = store.get("farmlands")?.farmlands || [];
    return new Map(list.map((f) => [f.id, f]));
  }

  function shade() {
    const farmlands = byId();
    const farmId = myFarmId(store);
    for (const [id, shape] of shapes) {
      const cls = classOf(farmlands.get(id), farmId);
      if (cls === shape.cls) continue;
      if (shape.cls) groups[shape.cls].removeLayer(shape.polygon);
      shape.cls = cls;
      if (cls) {
        shape.polygon.setStyle(STYLES[cls]);
        groups[cls].addLayer(shape.polygon);
      }
    }
  }

  store.subscribe("farmland_grid", (/** @type {FarmlandGrid|undefined} */ grid) => {
    trace(grid);
    shade();
  });
  store.subscribe("farmlands", shade);
  store.subscribe("hello", shade);

  return {
    id: "farmlands",
    title: "Farmlands",
    leafletLayer: root,
    legendItems: CLASSES.map((c) => ({
      id: c.id,
      label: c.label,
      swatch: farmlandSwatch(c.id),
      setVisible: (/** @type {boolean} */ on) => {
        if (on) root.addLayer(groups[c.id]);
        else root.removeLayer(groups[c.id]);
      },
    })),
  };
}
