// @ts-check
// The field panel (specs/0013-vehicle-screen-calm.md): the field the rig is
// in, beside its tools' cards.
// - The map zoomed to the field: the Map screen's own image, the field's
//   outline, the trail the rig's tools have made on it (data/coverage.js),
//   and the rig as a dot with a heading arrow, a sprayer's boom behind it
//   (its sections that are off grey).
// - Under it: the field's number and area, its crop and stage over a bar of
//   its stages, what it needs (the Map's field panel's words) and how much
//   of it this run has done, while there's a trail.
// Off a field, the map 300 m around the rig, "Not on a field". It's a plain
// SVG in world metres over the image (x right, z down: no transform), not a
// second Leaflet map, so the map frame stays on the Map screen. Hidden on
// foot and with three working tools or more: their cards need the width.

import { cabOf, cardsOf, controlledVehicle, fieldAt, implementById, outlineBounds, screenRig, widthMetres, widthSegments }
  from "../data/selectors.js";
import { coverageOf } from "../data/coverage.js";
import { imageName } from "../map/overviewLayer.js";
import { cropCatalog, cropName, growthClass } from "../map/fieldStyle.js";
import { fieldNeeds, growthProgress } from "../panels/fieldInfoPanel.js";
import { areaText, unitsOf } from "../data/units.js";
import { h } from "../ui/dom.js";

/** @typedef {import("../types.js").FieldOutline} FieldOutline */
/** @typedef {import("../types.js").FieldState} FieldState */
/** @typedef {[number, number, number, number]} View x, z, width, height in world metres */

const SVG = "http://www.w3.org/2000/svg";
// the field's bounds and this much of its size on each side
const FIELD_MARGIN = 0.15;
// off a field: this much map around the rig
const AROUND_M = 300;
// three working tools or more: no panel (their cards take the width)
const HIDDEN_FROM = 3;
// the rig's dot, arrow and boom, in screen pixels
const BOOM_BEHIND_PX = 13;

/** @param {string} tag @param {Record<string, string|number>} [attrs] */
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A number for an attribute: a tenth of a metre is plenty. */
const n1 = (/** @type {number} */ x) => String(Math.round(x * 10) / 10);

/**
 * What the map shows of a field: its bounds and 15 % of its size around them.
 * @param {number[]} points the outline, [x1, z1, x2, z2, ...]
 * @returns {View}
 */
export function fieldView(points) {
  const [x0, z0, x1, z1] = outlineBounds(points);
  const w = x1 - x0, hgt = z1 - z0;
  return [x0 - FIELD_MARGIN * w, z0 - FIELD_MARGIN * hgt, w * (1 + 2 * FIELD_MARGIN), hgt * (1 + 2 * FIELD_MARGIN)];
}

/** Off a field: 300 m around the rig. @param {number} x @param {number} z @returns {View} */
export const aroundView = (x, z) => [x - AROUND_M / 2, z - AROUND_M / 2, AROUND_M, AROUND_M];

/** @type {Map<string, Promise<import("../types.js").MapMeta|undefined>>} meta.json per map, fetched once */
const metas = new Map();

/** The map's meta.json (its image's world bounds), once per map and hash. @param {string} base */
function metaOf(base) {
  let meta = metas.get(base);
  if (!meta) {
    meta = fetch(`${base}/meta.json`).then((res) => (res.ok ? res.json() : undefined)).catch(() => undefined);
    metas.set(base, meta);
  }
  return meta;
}

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
 * The panel.
 * @type {import("./widget.js").CreateWidget}
 */
export function fieldPanel(store, opts = {}) {
  const coverage = /** @type {ReturnType<typeof coverageOf>} */ (/** @type {any} */ (opts).coverage || coverageOf(store));
  const image = svg("image", { class: "field-image", preserveAspectRatio: "none" });
  const outlineEl = svg("polygon", { class: "field-outline", "vector-effect": "non-scaling-stroke" });
  const trails = { work: svg("g", { class: "field-trail", "data-kind": "work" }),
    mow: svg("g", { class: "field-trail", "data-kind": "mow" }) };
  const boom = svg("g", { class: "field-boom" });
  const rig = svg("g", { class: "field-rig" });
  rig.append(boom, svg("circle", { class: "field-dot", r: 11 }),
    svg("path", { class: "field-arrow", d: "M0 -7 L5 4 L0 1.5 L-5 4 Z" }));
  const dim = svg("filter", { id: "field-dim", "color-interpolation-filters": "sRGB" });
  // the night's dimmed map: 72 % brightness, 80 % saturation
  const sat = svg("feColorMatrix", { type: "saturate", values: 0.8 });
  const bright = svg("feComponentTransfer");
  for (const c of ["R", "G", "B"]) bright.append(svg(`feFunc${c}`, { type: "linear", slope: 0.72 }));
  dim.append(sat, bright);
  // the trail ends at the field's edge (a turn on the headland stays off the map)
  const clipShape = svg("polygon");
  const clip = svg("clipPath", { id: "field-clip" });
  clip.append(clipShape);
  for (const g of Object.values(trails)) g.setAttribute("clip-path", "url(#field-clip)");
  const defs = svg("defs");
  defs.append(dim, clip);
  const map = svg("svg", { class: "field-svg", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
  map.append(defs, image, outlineEl, trails.work, trails.mow, rig);

  const title = h("b", { className: "field-title" });
  const area = h("span", { className: "field-area" });
  const crop = h("span", { className: "field-crop" });
  const stage = h("span", { className: "field-stage" });
  const stages = h("div", { className: "field-stages" });
  stages.setAttribute("aria-hidden", "true");
  const cropRow = h("div", { className: "field-crop-row" }, h("div", { className: "field-row" }, crop, stage), stages);
  const needList = h("span", { className: "field-need-list" });
  const needs = h("div", { className: "field-needs" }, h("span", { className: "veh-cap", text: "Needs" }), needList);
  const coverText = h("b");
  const cover = h("div", { className: "field-row field-cover" }, h("span", { text: "This run" }), coverText);
  const root = h("section", { className: "field-panel" },
    h("div", { className: "field-map" }, map),
    h("div", { className: "field-facts" }, h("div", { className: "field-row" }, title, area), cropRow, needs, cover));
  root.setAttribute("aria-label", "Field");
  if (opts.id) root.id = opts.id;

  /** the trail's polylines per tool and run, kept across renders */
  /** @type {Map<number, SVGElement[]>} */
  const lines = new Map();
  /** @type {WeakMap<SVGElement, {pts: number[], n: number}>} what each line was drawn from */
  const drawn = new WeakMap();
  let shownField = /** @type {number|undefined} */ (undefined);
  let lastVersion = -1;
  let lastInfo = "";
  let imageKey = "";

  /** The map's image at its world bounds; none until the companion has converted it. */
  async function placeImage() {
    const hello = store.get("hello");
    const assets = store.get("mapAssets");
    const key = assets && hello?.mapId === assets.mapId ? `${assets.mapId}/${assets.hash}` : "";
    if (key === imageKey) return;
    imageKey = key;
    root.dataset.image = "false";
    image.removeAttribute("href");
    if (!key) return;
    const base = `/api/maps/${encodeURIComponent(assets.mapId)}/${assets.hash}`;
    const meta = await metaOf(base);
    if (imageKey !== key || !meta || !Array.isArray(meta.imageBounds)) return;
    const [x0, z0, x1, z1] = meta.imageBounds;
    for (const [k, v] of [["x", x0], ["y", z0], ["width", x1 - x0], ["height", z1 - z0]]) image.setAttribute(String(k), String(v));
    image.setAttribute("href", `${base}/${imageName()}`);
    root.dataset.image = "true";
  }

  /** The field's trails, a polyline a run (a band at its width). @param {number|undefined} fieldId */
  function drawTrails(fieldId) {
    const version = coverage.version(fieldId);
    if (fieldId === shownField && version === lastVersion) return;
    if (fieldId !== shownField) {
      trails.work.replaceChildren();
      trails.mow.replaceChildren();
      lines.clear();
    }
    shownField = fieldId;
    lastVersion = version;
    const list = coverage.trails(fieldId);
    for (const id of [...lines.keys()]) {
      if (!list.some((t) => t.tool === id)) {
        for (const el of /** @type {SVGElement[]} */ (lines.get(id))) el.remove();
        lines.delete(id);
      }
    }
    for (const t of list) {
      const els = lines.get(t.tool) || [];
      lines.set(t.tool, els);
      t.runs.forEach((run, i) => {
        let el = els[i];
        if (!el) {
          el = svg("polyline", { class: "field-band" });
          els.push(el);
          trails[t.kind].append(el);
        }
        const was = drawn.get(el);
        if (was && was.pts === run.pts && was.n === run.pts.length) return;
        drawn.set(el, { pts: run.pts, n: run.pts.length });
        const pts = [];
        for (let k = 0; k + 1 < run.pts.length; k += 2) pts.push(`${n1(run.pts[k])},${n1(run.pts[k + 1])}`);
        el.setAttribute("points", pts.join(" "));
        el.setAttribute("stroke-width", n1(run.w));
      });
      for (const el of els.splice(t.runs.length)) el.remove();
    }
  }

  /**
   * The rig: where it is and which way it faces, at screen size; a sprayer's
   * boom across its working width, behind the dot, its sections that are off grey.
   * @param {any} v @param {View} view
   */
  function drawRig(v, view) {
    const placed = typeof v?.x === "number" && typeof v?.z === "number";
    rig.toggleAttribute("hidden", !placed);
    if (!placed) return;
    // metres a pixel: the view fits the map's box ("meet")
    const boxW = map.clientWidth || 320, boxH = map.clientHeight || 360;
    const k = Math.max(view[2] / boxW, view[3] / boxH);
    const heading = typeof v.heading === "number" ? v.heading : 0;
    rig.setAttribute("transform", `translate(${n1(v.x)} ${n1(v.z)}) rotate(${n1(heading)}) scale(${k})`);
    const cab = cabOf(store);
    const sprayer = screenRig(v, cab).find((e) => e.width && e.unfolded !== false);
    boom.replaceChildren();
    if (!sprayer?.width) return;
    const on = widthSegments(sprayer.width);
    const metres = widthMetres(sprayer.width) ? /** @type {number[]} */ (sprayer.width.sections) : undefined;
    const all = metres ? metres.reduce((a, b) => a + b, 0) : implementById(v, sprayer.id)?.workWidth;
    if (!(typeof all === "number" && all > 0) || !on.length) return;
    let at = -all / 2;
    on.forEach((lit, i) => {
      const w = metres ? metres[i] : all / on.length;
      boom.append(svg("line", { class: lit ? "field-boom-on" : "field-boom-off", x1: at / k, x2: (at + w) / k,
        y1: BOOM_BEHIND_PX, y2: BOOM_BEHIND_PX }));
      at += w;
    });
  }

  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    root.hidden = !v || cardsOf(v, cab).length >= HIDDEN_FROM;
    if (root.hidden || !v) return;
    placeImage();
    const x = /** @type {any} */ (v).x, z = /** @type {any} */ (v).z;
    const outline = typeof x === "number" ? fieldAt(store, x, z) : undefined;
    /** @type {View} */
    const view = outline ? fieldView(outline.points) : typeof x === "number" ? aroundView(x, z) : [0, 0, 300, 300];
    map.setAttribute("viewBox", view.map(n1).join(" "));
    outlineEl.toggleAttribute("hidden", !outline);
    if (outline) {
      const pts = [];
      for (let i = 0; i + 1 < outline.points.length; i += 2) pts.push(`${n1(outline.points[i])},${n1(outline.points[i + 1])}`);
      outlineEl.setAttribute("points", pts.join(" "));
      clipShape.setAttribute("points", pts.join(" "));
    }
    drawTrails(outline?.id);
    drawRig(v, view);

    const field = outline ? (store.get("fields")?.fields || []).find((/** @type {FieldState} */ f) => f.id === outline.id) : undefined;
    const catalog = cropCatalog(store.get("crop_types"));
    const pct = outline ? coverage.percent(outline.id) : undefined;
    const units = unitsOf(store);
    const info = JSON.stringify([outline?.id, field, pct === undefined ? null : Math.round(pct), units,
      catalog.fruits.size]);
    if (info === lastInfo) return;
    lastInfo = info;
    title.textContent = outline ? `Field ${outline.id}` : "Not on a field";
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
    if (field) {
      const list = fieldNeeds(field, catalog);
      needList.replaceChildren(...(list.length ? list.map((need) => h("span", { className: "field-need", text: need }))
        : [h("span", { className: "field-needs-none", text: "Nothing" })]));
    }
    cover.hidden = pct === undefined;
    coverText.textContent = pct === undefined ? "" : `≈ ${Math.round(pct)} % of the field`;
  };
  for (const key of ["vehicles", "cab", "fields", "field_outlines", "crop_types", "mapAssets", "hello"]) store.subscribe(key, render);
  return root;
}
