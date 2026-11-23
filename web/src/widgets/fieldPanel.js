// @ts-check
// The field panel (specs/0013-vehicle-screen-calm.md, revision 2): the
// field the rig is in, beside its tools' cards.
// - The field's outline on the card's colour, the view fixed to the field.
//   No map image: it made the page slow to show on an iPad.
// - The trail the rig's tools have made on it (data/coverage.js), on a
//   canvas that paints only the newest stretch of each message.
// - The rig as a dot with a heading arrow, a sprayer's boom behind it (its
//   sections that are off grey): one element moved by a CSS transform.
// - Under it: the field's number and area, its crop and stage over a bar of
//   its stages, what it needs (the Map's field panel's words) and how much
//   of it this run has done, while there's a trail. The compact variant
//   (the Harvester page, specs/0001 revision 3) leaves out what it needs.
// - On a field with one of your running contracts, one more row for it
//   ("Contract · Plough · 87 %", the time left under it): a tap opens the
//   Contracts page on it (specs/0018).
// Only fields your farm owns (revision 3), or with one of your running
// contracts (specs/0018). Off the field it stays while the
// rig is inside the panel's view (the field plus its margin), so a headland
// turn keeps it; past that, or with none yet, "Not on your field". Hidden on foot and with three working tools or more:
// their cards need the width.
// A vehicles message writes nothing in the outline and adds no element: it
// paints a stretch, moves the arrow and changes the % when it moves.

import {
  cabOf, cardsOf, controlledVehicle, implementById, isOwnField, outlineBounds, ownFieldAt, screenRig, sectionsSpraying,
  widthMetres,
} from "../data/selectors.js";
import { coverageOf } from "../data/coverage.js";
import { cropCatalog, cropName, growthClass } from "../map/fieldStyle.js";
import { fieldNeeds, growthProgress } from "../panels/fieldInfoPanel.js";
import { areaText, unitsOf } from "../data/units.js";
import { contextOf, contractsOf, fieldRow, onField } from "../data/contracts.js";
import { icon } from "../ui/icons.js";
import { h } from "../ui/dom.js";
import { createTrailCanvas, fitView, TRAIL_FALLBACK } from "../ui/trailCanvas.js";

export { fitView };

/** @typedef {import("../types.js").FieldOutline} FieldOutline */
/** @typedef {import("../types.js").FieldState} FieldState */
/** @typedef {import("../ui/trailCanvas.js").View} View */
/** @typedef {(el: Element, cb: (width: number, height: number) => void) => void} WatchSize */

const SVG = "http://www.w3.org/2000/svg";
// the field's bounds and this much of its size on each side...
const FIELD_MARGIN = 0.15;
// ...at least this many metres, so a headland turn stays in view
const MIN_MARGIN_M = 25;
// three working tools or more: no panel (their cards take the width)
const HIDDEN_FROM = 3;
// the rig's boom, in screen pixels behind the dot
const BOOM_BEHIND_PX = 13;

/** @param {string} tag @param {Record<string, string|number>} [attrs] */
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A number for an attribute: a tenth is plenty. */
const n1 = (/** @type {number} */ x) => String(Math.round(x * 10) / 10);

/**
 * What the panel shows of a field: its bounds and 15 % of its size around
 * them, at least 25 m.
 * @param {number[]} points the outline, [x1, z1, x2, z2, ...]
 * @returns {View}
 */
export function fieldView(points) {
  const [x0, z0, x1, z1] = outlineBounds(points);
  const w = x1 - x0, hgt = z1 - z0;
  const mx = Math.max(FIELD_MARGIN * w, MIN_MARGIN_M), mz = Math.max(FIELD_MARGIN * hgt, MIN_MARGIN_M);
  return [x0 - mx, z0 - mz, w + 2 * mx, hgt + 2 * mz];
}


/** The box's size as it changes (a ResizeObserver): 0 × 0 while the page is hidden. @type {WatchSize} */
const observeSize = (el, cb) => new ResizeObserver((entries) => {
  const box = entries[entries.length - 1].contentRect;
  cb(box.width, box.height);
}).observe(el);

/**
 * The growth line: "Growing · stage 3 of 7", "Ready to harvest", "Plowed".
 * @param {FieldState} field
 * @param {ReturnType<typeof cropCatalog>} catalog
 */
function stageText(field, catalog) {
  const growth = growthClass(field, catalog);
  const progress = growthProgress(field, catalog);
  if (growth.key === "growing" && progress) return `${growth.label} · stage ${progress.done} of ${progress.of}`;
  return growth.key === "none" ? "" : growth.label;
}

/**
 * The outline of the field with this id, from field_outlines.
 * @param {import("../data/selectors.js").StoreLike} store @param {number|undefined} id
 * @returns {FieldOutline|undefined}
 */
function outlineById(store, id) {
  if (id === undefined) return undefined;
  const fields = store.get("field_outlines")?.fields;
  return Array.isArray(fields)
    ? fields.find((/** @type {any} */ f) => f?.id === id && Array.isArray(f.points) && f.points.length >= 6) : undefined;
}

/**
 * The panel. Besides the widget options it takes `coverage` (the trails;
 * the store's own by default) and `watchSize` (the box's size; a
 * ResizeObserver by default), both for the tests.
 * @type {import("./widget.js").CreateWidget}
 */
export function fieldPanel(store, opts = {}) {
  const more = /** @type {{coverage?: ReturnType<typeof coverageOf>, watchSize?: WatchSize}} */ (/** @type {any} */ (opts));
  const coverage = more.coverage || coverageOf(store);
  const watchSize = more.watchSize || observeSize;

  // three layers: the trail, the outline over it, the rig on top
  const canvas = document.createElement("canvas");
  canvas.className = "field-trail";
  canvas.setAttribute("aria-hidden", "true");
  const outlineEl = svg("polygon", { class: "field-outline", "vector-effect": "non-scaling-stroke", hidden: "" });
  const map = svg("svg", { class: "field-svg", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
  map.append(outlineEl);
  const boom = svg("g", { class: "field-boom" });
  const rigSvg = svg("svg", { class: "field-rig-svg", width: 1, height: 1, overflow: "visible" });
  rigSvg.append(boom, svg("circle", { class: "field-dot", r: 11 }),
    svg("path", { class: "field-arrow", d: "M0 -7 L5 4 L0 1.5 L-5 4 Z" }));
  const rig = document.createElement("div");
  rig.className = "field-rig";
  rig.hidden = true;
  rig.append(rigSvg);
  const mapBox = h("div", { className: "field-map" }, canvas, map, rig);

  const title = h("b", { className: "field-title" });
  const area = h("span", { className: "field-area" });
  const crop = h("span", { className: "field-crop" });
  const stage = h("span", { className: "field-stage" });
  const stages = h("div", { className: "field-stages" });
  stages.setAttribute("aria-hidden", "true");
  const cropRow = h("div", { className: "field-crop-row" }, h("div", { className: "field-row" }, crop, stage), stages);
  // the compact variant (the Harvester page, specs/0001 revision 3) has no
  // Needs row: the field you harvest needs harvesting, and the map needs the room
  const compact = opts.variant === "compact";
  const needList = h("span", { className: "field-need-list" });
  const needs = h("div", { className: "field-needs" }, h("span", { className: "veh-cap", text: "Needs" }), needList);
  const coverText = h("b");
  const cover = h("div", { className: "field-row field-cover" }, h("span", { text: "This run" }), coverText);
  cover.hidden = true;
  // one row per running contract of yours on this field (specs/0018)
  const contractRows = h("div", { className: "field-contracts", hidden: true });
  const root = h("section", { className: "field-panel" }, mapBox, h("div", { className: "field-facts" },
    h("div", { className: "field-row" }, title, area), cropRow, ...(compact ? [] : [needs]), cover, contractRows));
  root.setAttribute("aria-label", "Field");
  if (compact) root.dataset.variant = "compact";
  if (opts.id) root.id = opts.id;

  /** the vehicle the field is held for: another one starts with none */
  let vehicleId = /** @type {unknown} */ (undefined);
  /** the field shown: the last of yours the rig was in, while it's in its view */
  let heldId = /** @type {number|undefined} */ (undefined);
  /** the outline drawn, and its view */
  let shown = /** @type {FieldOutline|undefined} */ (undefined);
  let view = /** @type {View|undefined} */ (undefined);
  /** where the rig is, and the sprayer whose boom it draws */
  let rigAt = /** @type {{x: number, z: number, heading: number, boom?: {on: boolean[], metres: number[]}}|undefined} */ (undefined);
  let boxW = 0, boxH = 0;
  let lastInfo = "";
  let lastCover = "";
  let lastContracts = "";
  let boomKey = "";

  /** The trail's colour for a kind, from the theme. @param {"work"|"mow"} kind */
  const trailColour = (kind) => getComputedStyle(root).getPropertyValue(`--trail-${kind}`).trim() || TRAIL_FALLBACK[kind];
  const trail = createTrailCanvas(canvas, coverage, trailColour);

  /** The trail: the shown field's, clipped to its outline (ui/trailCanvas.js). */
  const paintTrail = () => trail.paint({ fieldId: shown?.id, view, clip: shown?.points, w: boxW, h: boxH });


  /** The rig at its place, heading up the screen; a sprayer's boom behind it at its width. */
  function placeRig() {
    const show = !!rigAt && !!view;
    if (rig.hidden === show) rig.hidden = !show;
    if (!rigAt || !view) return;
    const fit = fitView(view, boxW, boxH);
    rig.style.transform = `translate(${n1(fit.x0 + rigAt.x * fit.k)}px, ${n1(fit.z0 + rigAt.z * fit.k)}px) `
      + `rotate(${n1(rigAt.heading)}deg)`;
    const key = rigAt.boom ? `${n1(fit.k)}|${rigAt.boom.on.join()}|${rigAt.boom.metres.join()}` : "";
    if (key === boomKey) return;
    boomKey = key;
    boom.replaceChildren();
    if (!rigAt.boom) return;
    const { on, metres } = rigAt.boom;
    let at = -metres.reduce((a, b) => a + b, 0) / 2;
    on.forEach((lit, i) => {
      boom.append(svg("line", { class: lit ? "field-boom-on" : "field-boom-off", x1: n1(at * fit.k),
        x2: n1((at + metres[i]) * fit.k), y1: BOOM_BEHIND_PX, y2: BOOM_BEHIND_PX }));
      at += metres[i];
    });
  }

  /** What depends on the box's size; nothing while the page is hidden (0 × 0). */
  function paint() {
    if (!(boxW > 0 && boxH > 0)) return;
    placeRig();
    paintTrail();
  }

  /** A sprayer's boom: its sections on and their metres, or undefined. @param {any} v */
  function boomOf(v) {
    const sprayer = screenRig(v, cabOf(store)).find((e) => e.width && e.unfolded !== false);
    if (!sprayer?.width) return undefined;
    const impl = implementById(v, sprayer.id);
    const on = sectionsSpraying(sprayer, impl);
    const all = impl?.workWidth;
    const metres = widthMetres(sprayer.width) ? /** @type {number[]} */ (sprayer.width.sections)
      : typeof all === "number" && all > 0 ? on.map(() => all / on.length) : undefined;
    return on.length && metres ? { on, metres } : undefined;
  }

  const render = () => {
    const v = controlledVehicle(store);
    if (v?.id !== vehicleId) {
      vehicleId = v?.id;
      heldId = undefined;
    }
    const cab = cabOf(store);
    const hide = !v || cardsOf(v, cab).length >= HIDDEN_FROM;
    if (root.hidden !== hide) root.hidden = hide;
    if (hide || !v) return;
    const x = /** @type {any} */ (v).x, z = /** @type {any} */ (v).z;
    const placed = typeof x === "number" && typeof z === "number";
    const here = placed ? ownFieldAt(store, x, z) : undefined;
    if (here) heldId = here.id;
    else if (heldId !== undefined) {
      // off the field: kept inside its view (a headland turn), let go past it
      const held = outlineById(store, heldId);
      const box = held && (held === shown && view ? view : fieldView(held.points));
      const inView = !!box && placed && x >= box[0] && x <= box[0] + box[2] && z >= box[1] && z <= box[1] + box[3];
      if (!inView || !isOwnField(store, heldId)) heldId = undefined;
    }
    const outline = outlineById(store, heldId);

    // the outline: written only when the field changes
    if (outline !== shown) {
      shown = outline;
      view = outline ? fieldView(outline.points) : undefined;
      if (outline && view) {
        const pts = [];
        for (let i = 0; i + 1 < outline.points.length; i += 2) pts.push(`${n1(outline.points[i])},${n1(outline.points[i + 1])}`);
        map.setAttribute("viewBox", view.map(n1).join(" "));
        outlineEl.setAttribute("points", pts.join(" "));
      }
      outlineEl.toggleAttribute("hidden", !outline);
    }
    const heading = /** @type {any} */ (v).heading;
    rigAt = placed ? { x, z, heading: typeof heading === "number" ? heading : 0, boom: boomOf(v) } : undefined;
    paint();

    // the rows: rewritten only when the field or what's known of it changes
    const field = outline ? (store.get("fields")?.fields || []).find((/** @type {FieldState} */ f) => f.id === outline.id) : undefined;
    const catalog = cropCatalog(store.get("crop_types"));
    const units = unitsOf(store);
    const info = JSON.stringify([outline?.id, field, units, catalog.fruits.size]);
    if (info !== lastInfo) {
      lastInfo = info;
      title.textContent = outline ? `Field ${outline.id}` : "Not on your field";
      area.textContent = typeof field?.areaHa === "number" ? areaText(field.areaHa, units) : "";
      const growing = field && typeof field.fruitTypeIndex === "number";
      cropRow.hidden = !growing;
      if (field && growing) {
        crop.textContent = field.fruitTypeIndex ? cropName(catalog.fruits.get(field.fruitTypeIndex), field.fruitTypeIndex) : "No crop";
        stage.textContent = stageText(field, catalog);
        const progress = growthProgress(field, catalog);
        stages.hidden = !progress;
        stages.replaceChildren(...Array.from({ length: progress?.of ?? 0 }, (_, i) => {
          const seg = h("span");
          seg.dataset.on = String(!!progress && i < progress.done);
          return seg;
        }));
      }
      needs.hidden = !field;
      if (field && !compact) {
        const list = fieldNeeds(field, catalog);
        needList.replaceChildren(...(list.length ? list.map((need) => h("span", { className: "field-need", text: need }))
          : [h("span", { className: "field-needs-none", text: "Nothing" })]));
      }
    }
    // the contract rows: rewritten only when their words change
    const rows = outline ? onField(contractsOf(store), outline.id).map((c) => ({ id: c.id, ...fieldRow(c, contextOf(store)) })) : [];
    const rowsKey = JSON.stringify(rows);
    if (rowsKey !== lastContracts) {
      lastContracts = rowsKey;
      contractRows.hidden = !rows.length;
      contractRows.replaceChildren(...rows.map((row) => contractRow(store, row)));
    }
    // the share done: rewritten only when its rounded value moves
    const pct = outline ? coverage.percent(outline.id) : undefined;
    const coverLine = pct === undefined ? "" : `≈ ${Math.round(pct)} % of the field`;
    if (coverLine !== lastCover) {
      lastCover = coverLine;
      cover.hidden = !coverLine;
      coverText.textContent = coverLine;
    }
  };
  watchSize(mapBox, (width, height) => {
    boxW = width;
    boxH = height;
    paint();
  });
  for (const key of ["vehicles", "cab", "fields", "farmlands", "field_outlines", "crop_types", "contracts", "env"]) {
    store.subscribe(key, render);
  }
  return root;
}

/**
 * A field panel's row for one of your running contracts (specs/0018): its
 * words (data/contracts.js fieldRow), and a tap opens the Contracts page on
 * it. The Map's land panel shows the same row.
 * @param {import("../store.js").Store} store
 * @param {{id: string, head: string, sub: string, late: boolean}} row
 */
export function contractRow(store, row) {
  const button = h("button", { className: "field-contract" },
    h("span", { className: "field-contract-text" }, h("b", { text: row.head }), h("span", { text: row.sub })),
    icon("toolNext"));
  button.setAttribute("type", "button");
  button.dataset.contract = row.id;
  if (row.late) button.dataset.tone = "warn";
  button.addEventListener("click", () => store.set("goto", { screen: "contracts", contract: row.id }));
  return button;
}
