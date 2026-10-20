// @ts-check
// The selected field (tap a field on the map): owner, crop, growth stage
// and what it needs, like the PDA's field info. Shown over the map, so it
// works the same on a phone; Escape or × closes it.

import { $ } from "./dom.js";
import { cropCatalog, cropName, growthClass, prettyName } from "../map/fieldStyle.js";
import { myFarmId } from "../store.js";

/** @typedef {import("../types.js").FieldState} FieldState */
/** @typedef {import("../types.js").Farmland} Farmland */

const money = (/** @type {number} */ v) => "$" + Math.round(v).toLocaleString();

/**
 * [label, value] rows for a field.
 * @param {FieldState} field
 * @param {Farmland|undefined} farmland
 * @param {ReturnType<typeof cropCatalog>} catalog
 * @param {number} farmId the viewer's farm
 * @returns {[string, string][]}
 */
export function fieldRows(field, farmland, catalog, farmId) {
  /** @type {[string, string][]} */
  const rows = [];
  if (typeof field.areaHa === "number") rows.push(["Area", `${field.areaHa.toFixed(2)} ha`]);
  if (farmland) {
    let owner;
    if (farmland.farmId === farmId) owner = "You";
    else if (farmland.farmId) owner = `Farm ${farmland.farmId}`;
    else owner = typeof farmland.price === "number" ? `For sale, ${money(farmland.price)}` : "For sale";
    rows.push(["Owner", owner]);
    rows.push(["Farmland", farmland.name || String(farmland.id)]);
  } else if (field.farmlandId) {
    rows.push(["Farmland", String(field.farmlandId)]);
  }
  if (typeof field.fruitTypeIndex !== "number") return rows;

  rows.push(["Crop", field.fruitTypeIndex
    ? cropName(catalog.fruits.get(field.fruitTypeIndex), field.fruitTypeIndex) : "None"]);
  const growth = growthClass(field, catalog);
  if (growth.key !== "none") {
    const stage = growth.stage && growth.stages ? ` (stage ${growth.stage} of ${growth.stages})` : "";
    rows.push(["State", growth.label + stage]);
  }
  const ground = catalog.groundNames.get(field.groundType ?? -1);
  if (ground) rows.push(["Ground", prettyName(ground)]);
  const sprayMax = catalog.levels.spray ?? 2;
  if (typeof field.sprayLevel === "number" && sprayMax) {
    rows.push(["Fertilizer", `${Math.round(100 * Math.min(1, field.sprayLevel / sprayMax))}%`]);
  }
  if (typeof field.limeLevel === "number") rows.push(["Lime", field.limeLevel > 0 ? "OK" : "Needed"]);
  if (typeof field.plowLevel === "number") rows.push(["Plowing", field.plowLevel > 0 ? "Not needed" : "Needed"]);
  if (typeof field.weedState === "number") rows.push(["Weeds", field.weedState > 0 ? "Yes" : "None"]);
  if (typeof field.stoneLevel === "number") {
    rows.push(["Stones", field.stoneLevel > 0 ? `Level ${field.stoneLevel}` : "None"]);
  }
  return rows;
}

/** @param {import("../store.js").Store} store */
export function createFieldInfoPanel(store) {
  const box = $("field-info");

  function close() {
    store.set("selectedField", undefined);
  }

  function render() {
    const id = store.get("selectedField");
    if (id == null) {
      box.hidden = true;
      return;
    }
    /** @type {FieldState} */
    const field = (store.get("fields")?.fields || []).find((/** @type {FieldState} */ f) => f.id === id) || { id };
    /** @type {Farmland|undefined} */
    const farmland = (store.get("farmlands")?.farmlands || [])
      .find((/** @type {Farmland} */ f) => f.id === field.farmlandId);
    const rows = fieldRows(field, farmland, cropCatalog(store.get("crop_types")), myFarmId(store));

    const head = document.createElement("div");
    head.className = "field-info-head";
    const title = document.createElement("h3");
    title.textContent = `Field ${id}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "field-info-close";
    button.setAttribute("aria-label", "Close");
    button.textContent = "×";
    button.addEventListener("click", close);
    head.append(title, button);

    const dl = document.createElement("dl");
    for (const [label, value] of rows) {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      div.append(dt, dd);
      dl.append(div);
    }
    if (!rows.length) dl.textContent = "No data yet";
    box.replaceChildren(head, dl);
    box.hidden = false;
  }

  for (const key of ["selectedField", "fields", "farmlands", "crop_types", "hello"]) {
    store.subscribe(key, render);
  }
  // a new map: the old field number means nothing
  store.subscribe("field_outlines", (topic) => {
    const id = store.get("selectedField");
    if (id != null && !(topic?.fields || []).some((/** @type {{id: number}} */ f) => f.id === id)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && store.get("selectedField") != null) close();
  });
  // clicks inside the panel don't reach the map
  L.DomEvent.disableClickPropagation(box);
  L.DomEvent.disableScrollPropagation(box);
}
