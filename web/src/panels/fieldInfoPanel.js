// @ts-check
// The selected land (tap the map): a field, or a farmland without a field.
// One panel, in sections: a field's own (its area, crop, growth as a bar
// of stages, and what it needs, like the PDA's field info), then the
// farmland it sits on (owner, area, the fields on it, the price when for
// sale: you buy the farmland, never the field). A bare farmland shows only
// its section. Shown over the map, so it works the same on a phone;
// Escape or × closes it.

import { cropCatalog, cropName, growthClass } from "../map/fieldStyle.js";
import { myFarmId } from "../store.js";
import { areaText, METRIC, moneyText, unitsOf } from "../data/units.js";

/** @typedef {import("../types.js").FieldState} FieldState */
/** @typedef {import("../types.js").Farmland} Farmland */

/**
 * The store's "selection": a field (with the farmland under it), or a
 * farmland alone.
 * @typedef {{field?: number, farmland?: number}} LandSelection
 */

/**
 * One section of the panel.
 * @typedef {Object} LandSection
 * @property {"field"|"farmland"} kind
 * @property {string} badge
 * @property {string} title
 * @property {string} subtitle a field's area; a farmland's owner · area
 * @property {{label: string, value: string, tone?: "ok"|"alarm"}[]} rows
 * @property {{done: number, of: number}} [progress] growth stages, under the Growth row
 */

/** @param {Farmland|undefined} farmland @param {number} farmId */
function ownerText(farmland, farmId) {
  if (!farmland) return "";
  if (farmland.farmId === farmId) return "Owned";
  return farmland.farmId ? `Farm ${farmland.farmId}` : "For sale";
}

/** The Price row, for land for sale. @param {Farmland|undefined} farmland @param {import("../data/units.js").Units} units */
function priceRows(farmland, units) {
  return farmland && !farmland.farmId && typeof farmland.price === "number"
    ? [{ label: "Price", value: moneyText(farmland.price, units) }] : [];
}

/**
 * What a field needs, in the PDA's words: the work still to do.
 * @param {FieldState} field
 * @param {ReturnType<typeof cropCatalog>} catalog
 */
export function fieldNeeds(field, catalog) {
  const needs = [];
  const sprayMax = catalog.levels.spray ?? 2;
  if (typeof field.sprayLevel === "number" && sprayMax && field.sprayLevel < sprayMax) needs.push("Fertilizer");
  if (field.limeLevel === 0) needs.push("Lime");
  if (field.plowLevel === 0) needs.push("Plowing");
  if (typeof field.rollerLevel === "number" && field.rollerLevel > 0) needs.push("Rolling");
  if (typeof field.weedState === "number" && field.weedState > 0) needs.push("Weeding");
  if (typeof field.stoneLevel === "number" && field.stoneLevel > 0) needs.push("Stones");
  return needs;
}

/**
 * Stages grown out of the stages to harvest, or undefined when the field
 * isn't growing anything.
 * @param {FieldState} field
 * @param {ReturnType<typeof cropCatalog>} catalog
 */
function growthProgress(field, catalog) {
  const growth = growthClass(field, catalog);
  const fruit = catalog.fruits.get(field.fruitTypeIndex ?? -1);
  const of = growth.stages ?? fruit?.minHarvest ?? fruit?.numGrowthStates;
  if (!of) return undefined;
  if (growth.key === "growing" && growth.stage) return { done: Math.min(of, growth.stage), of };
  if (growth.key === "ready") return { done: of, of };
  if (growth.key === "sown") return { done: 0, of };
  return undefined;
}

/**
 * @param {Farmland|undefined} farmland
 * @param {number} id
 * @param {FieldState[]} fields
 * @param {number} farmId
 * @param {import("../data/units.js").Units} units
 * @returns {LandSection}
 */
function farmlandSection(farmland, id, fields, farmId, units) {
  const name = farmland?.name || String(id);
  const subtitle = [ownerText(farmland, farmId),
    typeof farmland?.areaHa === "number" ? areaText(farmland.areaHa, units) : ""].filter(Boolean).join(" · ");
  const on = fields.filter((f) => f.farmlandId === id).map((f) => f.id).sort((a, b) => a - b);
  return {
    kind: "farmland",
    badge: name,
    title: `Farmland ${name}`,
    subtitle,
    rows: [{ label: "Fields", value: on.length ? on.join(", ") : "None" }, ...priceRows(farmland, units)],
  };
}

/**
 * @param {FieldState} field
 * @param {ReturnType<typeof cropCatalog>} catalog
 * @param {import("../data/units.js").Units} units
 * @returns {LandSection}
 */
function fieldSection(field, catalog, units) {
  /** @type {LandSection} */
  const section = { kind: "field", badge: String(field.id), title: `Field ${field.id}`,
    subtitle: typeof field.areaHa === "number" ? areaText(field.areaHa, units) : "", rows: [] };
  if (typeof field.fruitTypeIndex !== "number") return section;
  section.rows.push({ label: "Crop", value: field.fruitTypeIndex
    ? cropName(catalog.fruits.get(field.fruitTypeIndex), field.fruitTypeIndex) : "None" });
  const growth = growthClass(field, catalog);
  if (growth.key !== "none") {
    /** @type {"ok"|"alarm"|undefined} */
    const tone = growth.key === "ready" ? "ok" : growth.key === "withered" ? "alarm" : undefined;
    section.rows.push({ label: "Growth", value: growth.label, tone });
    section.progress = growthProgress(field, catalog);
  }
  const needs = fieldNeeds(field, catalog);
  section.rows.push({ label: "Needs", value: needs.length ? needs.join(" · ") : "Nothing" });
  return section;
}

/**
 * The panel's sections: the field then its farmland, or the farmland alone.
 * @param {LandSelection} selection
 * @param {FieldState[]} fields
 * @param {Farmland[]} farmlands
 * @param {ReturnType<typeof cropCatalog>} catalog
 * @param {number} farmId the viewer's farm
 * @param {import("../data/units.js").Units} [units] for the area and price
 * @returns {LandSection[]}
 */
export function landInfo(selection, fields, farmlands, catalog, farmId, units = METRIC) {
  const sections = [];
  let farmlandId = selection.farmland;
  if (selection.field != null) {
    const field = fields.find((f) => f.id === selection.field) || { id: selection.field };
    farmlandId = field.farmlandId ?? farmlandId;
    sections.push(fieldSection(field, catalog, units));
  }
  if (farmlandId != null) {
    sections.push(farmlandSection(farmlands.find((f) => f.id === farmlandId), farmlandId, fields, farmId, units));
  }
  return sections;
}

/**
 * @param {import("../store.js").Store} store
 * @param {HTMLElement} box the map frame's land panel
 */
export function createFieldInfoPanel(store, box) {
  function close() {
    store.set("selection", undefined);
  }

  function render() {
    /** @type {LandSelection|undefined} */
    const selection = store.get("selection");
    const sections = selection ? landInfo(selection, store.get("fields")?.fields || [],
      store.get("farmlands")?.farmlands || [], cropCatalog(store.get("crop_types")), myFarmId(store), unitsOf(store)) : [];
    if (!sections.length) {
      box.hidden = true;
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "field-info-close";
    button.setAttribute("aria-label", "Close");
    button.textContent = "×";
    button.addEventListener("click", close);
    box.replaceChildren(...sections.map((section, i) => sectionEl(section, i === 0 ? button : null)));
    box.hidden = false;
  }

  for (const key of ["selection", "fields", "farmlands", "crop_types", "hello"]) {
    store.subscribe(key, render);
  }
  // env arrives every second: draw again only when the units change
  let units = "";
  store.subscribe("env", () => {
    const now = JSON.stringify(unitsOf(store));
    if (now !== units) { units = now; render(); }
  });
  // a new map: the old field number means nothing
  store.subscribe("field_outlines", (topic) => {
    const id = store.get("selection")?.field;
    if (id != null && !(topic?.fields || []).some((/** @type {{id: number}} */ f) => f.id === id)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && store.get("selection")) close();
  });
  // clicks inside the panel don't reach the map
  L.DomEvent.disableClickPropagation(box);
  L.DomEvent.disableScrollPropagation(box);
}

/**
 * @param {LandSection} section
 * @param {HTMLElement|null} closeButton in the first section's head
 */
function sectionEl(section, closeButton) {
  const badge = document.createElement("span");
  badge.className = "field-info-badge";
  badge.textContent = section.badge;
  const title = document.createElement("h3");
  title.textContent = section.title;
  const subtitle = document.createElement("div");
  subtitle.className = "field-info-sub";
  subtitle.textContent = section.subtitle;
  subtitle.hidden = !section.subtitle;
  const names = document.createElement("div");
  names.className = "field-info-names";
  names.append(title, subtitle);
  const head = document.createElement("div");
  head.className = "field-info-head";
  head.append(badge, names);
  if (closeButton) head.append(closeButton);

  const dl = document.createElement("dl");
  for (const row of section.rows) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = row.label;
    const dd = document.createElement("dd");
    dd.textContent = row.value;
    if (row.tone) dd.dataset.tone = row.tone;
    div.append(dt, dd);
    dl.append(div);
    if (row.label === "Growth" && section.progress) dl.append(stageBar(section.progress));
  }
  if (section.kind === "field" && !section.rows.length) dl.textContent = "No crop data yet";

  const el = document.createElement("section");
  el.className = "field-info-part";
  el.dataset.kind = section.kind;
  el.append(head, dl);
  return el;
}

/** One segment per growth stage, lit up to the current one. */
function stageBar(/** @type {{done: number, of: number}} */ { done, of }) {
  const bar = document.createElement("div");
  bar.className = "field-info-stages";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `Stage ${done} of ${of}`);
  for (let i = 0; i < of; i++) {
    const seg = document.createElement("span");
    if (i < done) seg.className = "lit";
    bar.append(seg);
  }
  return bar;
}
