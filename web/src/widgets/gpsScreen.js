// @ts-check
// The GPS screen (specs/0021): the field the game's Steering Assist built
// lanes on, big, with its lanes and headland round, which are done, the one
// you're on, the counts and the time left. Steering on and off is the Drive
// group's (specs/0020); nothing here is pressed.
//
// Layers in the field's box, bottom to top: the field (an SVG polygon), the
// Vehicle page's trail (ui/trailCanvas.js), the course on its own canvas,
// an SVG with the field's edge and the lane you're on filled up to the rig,
// the rig (one element moved by a transform), the legend, the words.
// - The course canvas is painted whole once per course `key` (and per
//   size, dpr and palette), then only the segments whose state changed
//   (and the round's pieces over a changed lane's ends). A vehicles message
//   moves the rig and the fill and paints no lane.
// - Nothing is painted while the page is hidden (0 × 0): screens are built
//   once and switched with `hidden`, and the iPad pays for every paint.
// - The lanes are drawn their width wide less a pixel, so done ones stand
//   apart; closer than 4 px they're drawn full width and the ones to do
//   shaded, so a dense field reads as areas.

import { countsOf, createGpsTimes, fillOf, gpsState, stateOf, widthOf } from "../data/gps.js";
import { controlledVehicle, fieldAt, outlineBounds } from "../data/selectors.js";
import { contractsOf, onField, titleOf } from "../data/contracts.js";
import { coverageOf } from "../data/coverage.js";
import { areaText, unitsOf } from "../data/units.js";
import { createTrailCanvas, fitView, TRAIL_FALLBACK } from "../ui/trailCanvas.js";
import { h } from "../ui/dom.js";

/** @typedef {import("../types.js").SteeringCourse} SteeringCourse */
/** @typedef {import("../types.js").CourseSegment} CourseSegment */
/** @typedef {import("../ui/trailCanvas.js").View} View */
/** @typedef {(el: Element, cb: (width: number, height: number) => void) => void} WatchSize */
/** @typedef {{full: number, lanes: number, pieces: number}} PaintStats how often the course was painted whole, and segments repainted */

const SVG = "http://www.w3.org/2000/svg";
// the field fills the box: this much of its size around it, at least this many metres
const MARGIN = 0.04;
const MIN_MARGIN_M = 8;
// lanes narrower than this on screen are drawn full width, the ones to do shaded
const DENSE_PX = 4;
// the colours when the theme has none (the day's)
const FALLBACK = { done: "#2F8A5C", current: "#0C4DB8", todo: "#8F9BB0" };

/** @param {string} tag @param {Record<string, string|number>} [attrs] */
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A number for an attribute: a tenth is plenty. */
const n1 = (/** @type {number} */ x) => String(Math.round(x * 10) / 10);

/** "x1,z1 x2,z2 ..." from a flat array. @param {number[]} pts */
function pointsAttr(pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push(`${n1(pts[i])},${n1(pts[i + 1])}`);
  return out.join(" ");
}

/**
 * The field's box, a little around it so it fills the screen.
 * @param {number[]} points [x1, z1, ...]
 * @returns {View}
 */
export function courseView(points) {
  const [x0, z0, x1, z1] = outlineBounds(points);
  const w = x1 - x0, hgt = z1 - z0;
  const mx = Math.max(MARGIN * w, MIN_MARGIN_M), mz = Math.max(MARGIN * hgt, MIN_MARGIN_M);
  return [x0 - mx, z0 - mz, w + 2 * mx, hgt + 2 * mz];
}

/** The resize observer, 0 × 0 while the page is hidden. @type {WatchSize} */
const observeSize = (el, cb) => new ResizeObserver((entries) => {
  const box = entries[entries.length - 1].contentRect;
  cb(box.width, box.height);
}).observe(el);

/**
 * A stat over the field: its label and its number, with a small "of 10".
 * @param {string} label
 */
function stat(label) {
  const labelEl = h("span", { className: "gps-label", text: label });
  const num = h("span", { className: "gps-num" });
  const small = h("small");
  const root = h("div", { className: "gps-stat" }, labelEl, h("span", { className: "gps-value" }, num, small));
  /** @param {string} value @param {string} [of] @param {string} [newLabel] */
  const set = (value, of = "", newLabel) => {
    num.textContent = value;
    small.textContent = of;
    if (newLabel !== undefined && labelEl.textContent !== newLabel) labelEl.textContent = newLabel;
    root.dataset.quiet = String(value === "–");
  };
  return { root, set };
}

/**
 * The GPS screen. Besides the widget options it takes `coverage` (the
 * trails), `watchSize` (the box's size), `times` (the time left's clock)
 * and `stats` (counts the course's paints), all for the tests.
 * @type {import("./widget.js").CreateWidget}
 */
export function gpsScreen(store, opts = {}) {
  const more = /** @type {{coverage?: ReturnType<typeof coverageOf>, watchSize?: WatchSize,
    times?: ReturnType<typeof createGpsTimes>, stats?: PaintStats}} */ (/** @type {any} */ (opts));
  const coverage = more.coverage || coverageOf(store);
  const watchSize = more.watchSize || observeSize;
  const times = more.times || createGpsTimes();
  const stats = more.stats || { full: 0, lanes: 0, pieces: 0 };

  // the header: the field, the counts, the time left
  const badge = h("span", { className: "gps-badge" });
  const name = h("b");
  const line = h("span");
  const lanesStat = stat("Lanes done");
  const onStat = stat("On lane");
  const roundsStat = stat("Rounds done");
  const timeStat = stat("Time left");
  const head = h("div", { className: "gps-head" }, badge, h("div", { className: "gps-name" }, name, line),
    lanesStat.root, onStat.root, roundsStat.root, h("span", { className: "gps-sep" }), timeStat.root);

  // the field's box
  const ground = svg("svg", { class: "gps-ground", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
  const fieldEl = svg("polygon", { class: "gps-field" });
  ground.append(fieldEl);
  const trailCanvas = document.createElement("canvas");
  trailCanvas.className = "gps-trail";
  trailCanvas.setAttribute("aria-hidden", "true");
  const courseCanvas = document.createElement("canvas");
  courseCanvas.className = "gps-course";
  courseCanvas.setAttribute("aria-hidden", "true");
  const ctx = /** @type {CanvasRenderingContext2D} */ (courseCanvas.getContext("2d"));
  const over = svg("svg", { class: "gps-over", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
  const fillEl = svg("polyline", { class: "gps-fill" });
  const edgeEl = svg("polygon", { class: "gps-edge" });
  over.append(fillEl, edgeEl);
  const rigSvg = svg("svg", { class: "gps-rig-svg", width: 1, height: 1, overflow: "visible" });
  rigSvg.append(svg("path", { class: "gps-arrow", d: "M0 -13 L9 10 L0 5 L-9 10 Z" }));
  const rig = h("div", { className: "gps-rig" }, rigSvg);
  rig.hidden = true;
  const key = (/** @type {string} */ cls, /** @type {string} */ text) => h("span", { className: "gps-key" },
    h("i", { className: cls }), document.createTextNode(text));
  const trailKey = key("trail", "Worked off the lanes");
  const legend = h("div", { className: "gps-legend" }, key("done", "Done"), key("current", "This lane"), key("todo", "To do"), trailKey);
  const wordsEl = h("div", { className: "gps-words" });
  // every layer in one measured box, so the canvases, the SVGs and the rig share one fit
  const box = h("div", { className: "gps-box" }, ground, trailCanvas, courseCanvas, over, rig);
  const mapBox = h("div", { className: "gps-map" }, box, legend, wordsEl);
  mapBox.setAttribute("role", "img");
  const root = h("section", { className: "gps-screen" }, head, mapBox);
  root.setAttribute("aria-label", "GPS");
  if (opts.id) root.id = opts.id;

  const colourOf = (/** @type {string} */ name, /** @type {string} */ fallback) =>
    getComputedStyle(root).getPropertyValue(name).trim() || fallback;
  const trail = createTrailCanvas(trailCanvas, coverage,
    (kind) => colourOf(`--trail-${kind}`, TRAIL_FALLBACK[kind]));

  let boxW = 0, boxH = 0;
  /** what's on screen: the view, the field (for the trail), the outline drawn */
  let view = /** @type {View|undefined} */ (undefined);
  let viewKey = "";
  let fieldId = /** @type {number|undefined} */ (undefined);
  let clip = /** @type {number[]|undefined} */ (undefined);
  let course = /** @type {SteeringCourse|undefined} */ (undefined);
  let rigAt = /** @type {{x: number, z: number, heading: number}|undefined} */ (undefined);
  let lastHead = "";
  /** what the course canvas holds; -1: a course gone while the page was hidden, to clear */
  const painted = { key: /** @type {number|undefined} */ (undefined), w: 0, h: 0, dpr: 0, palette: "",
    states: /** @type {Map<number, string>} */ (new Map()) };

  /** The segment's stroke, in world metres (the canvas's transform makes them pixels). @param {number[]} pts */
  function path(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  }

  /**
   * One segment in its state, over what was there (erased first).
   * @param {CourseSegment} s @param {string} state @param {{w: number, px: number, colours: typeof FALLBACK}} look
   */
  function drawSeg(s, state, look) {
    const piece = typeof s.round === "number";
    const dense = look.w / look.px < DENSE_PX;
    ctx.lineCap = piece ? "round" : "butt";
    ctx.lineJoin = "round";
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.setLineDash([]);
    ctx.lineWidth = look.w;
    ctx.strokeStyle = "#000";
    path(s.pts);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    if (state === "todo" && !dense) {
      ctx.setLineDash([3 * look.px, 3 * look.px]);
      ctx.lineWidth = 1.25 * look.px;
      ctx.strokeStyle = look.colours.todo;
    } else {
      ctx.setLineDash([]);
      ctx.lineWidth = dense ? look.w : look.w - look.px;
      ctx.strokeStyle = look.colours[/** @type {"done"|"current"|"todo"} */ (state)];
      if (state === "todo") ctx.globalAlpha = 0.18;
    }
    path(s.pts);
    ctx.stroke();
    ctx.restore();
  }

  /** The course: whole when it's new (or the size or palette), else only what changed. */
  function paintCourse() {
    const dpr = window.devicePixelRatio || 1;
    const palette = document.documentElement.dataset.palette || "";
    if (!course || !view) {
      if (painted.key !== undefined) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, courseCanvas.width, courseCanvas.height);
      }
      painted.key = undefined;
      painted.states = new Map();
      return;
    }
    const fit = fitView(view, boxW, boxH);
    const look = { w: widthOf(course), px: 1 / fit.k, colours: {
      done: colourOf("--gps-done", FALLBACK.done), current: colourOf("--gps-current", FALLBACK.current),
      todo: colourOf("--gps-todo", FALLBACK.todo) } };
    const done = new Set(course.done || []);
    const states = new Map(course.segments.map((s) => [s.i, stateOf(/** @type {SteeringCourse} */ (course), done, s)]));
    const full = painted.key !== course.key || painted.w !== boxW || painted.h !== boxH || painted.dpr !== dpr
      || painted.palette !== palette;
    const lanes = course.segments.filter((s) => typeof s.round !== "number");
    const pieces = course.segments.filter((s) => typeof s.round === "number");
    if (full) {
      const width = Math.round(boxW * dpr), height = Math.round(boxH * dpr);
      if (courseCanvas.width !== width) courseCanvas.width = width;
      if (courseCanvas.height !== height) courseCanvas.height = height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(dpr * fit.k, 0, 0, dpr * fit.k, dpr * fit.x0, dpr * fit.z0);
      // the lanes, then the round over their ends
      for (const s of lanes) drawSeg(s, states.get(s.i) || "todo", look);
      for (const s of pieces) drawSeg(s, states.get(s.i) || "todo", look);
      stats.full++;
      Object.assign(painted, { key: course.key, w: boxW, h: boxH, dpr, palette });
    } else {
      const changed = (/** @type {CourseSegment} */ s) => painted.states.get(s.i) !== states.get(s.i);
      const lanesChanged = lanes.filter(changed);
      for (const s of lanesChanged) drawSeg(s, states.get(s.i) || "todo", look);
      stats.lanes += lanesChanged.length;
      // a lane's erase reaches under the round at its ends: the round again
      const redo = lanesChanged.length ? pieces : pieces.filter(changed);
      for (const s of redo) drawSeg(s, states.get(s.i) || "todo", look);
      stats.pieces += redo.length;
    }
    painted.states = states;
  }

  /** The lane you're on, filled up to the rig: one polyline's points, no lane repainted. */
  function placeFill() {
    const fill = course && rigAt ? fillOf(course, rigAt) : undefined;
    const pts = fill && fill.pts.length >= 4 ? pointsAttr(fill.pts) : "";
    if (fillEl.getAttribute("points") !== pts) fillEl.setAttribute("points", pts);
    if (course) {
      const w = n1(widthOf(course) * 0.6);
      if (fillEl.getAttribute("stroke-width") !== w) fillEl.setAttribute("stroke-width", w);
    }
  }

  /** The rig at its place and heading. */
  function placeRig() {
    const show = !!rigAt && !!view;
    if (rig.hidden === show) rig.hidden = !show;
    if (!rigAt || !view) return;
    const fit = fitView(view, boxW, boxH);
    rig.style.transform = `translate(${n1(fit.x0 + rigAt.x * fit.k)}px, ${n1(fit.z0 + rigAt.z * fit.k)}px) `
      + `rotate(${n1(rigAt.heading)}deg)`;
  }

  /** What depends on the box's size; nothing while the page is hidden (0 × 0). */
  function paint() {
    if (!(boxW > 0 && boxH > 0)) return;
    trail.paint({ fieldId, view, clip, w: boxW, h: boxH });
    paintCourse();
    placeRig();
  }

  /**
   * The field the course is on (field_outlines): the one holding the middle
   * of its middle lane, away from the bends at the lanes' ends.
   * @param {SteeringCourse} c
   */
  function courseField(c) {
    const lanes = c.segments.filter((s) => typeof s.lane === "number" && s.pts.length >= 4);
    for (const s of [lanes[Math.floor(lanes.length / 2)], ...lanes]) {
      if (!s) continue;
      const n = s.pts.length / 2, a = Math.floor((n - 1) / 2) * 2;
      const found = fieldAt(store, (s.pts[a] + s.pts[a + 2]) / 2, (s.pts[a + 1] + s.pts[a + 3]) / 2);
      if (found) return found;
    }
    return undefined;
  }

  const render = () => {
    const state = gpsState(store);
    const v = /** @type {any} */ (controlledVehicle(store));
    const placed = v && typeof v.x === "number" && typeof v.z === "number";
    rigAt = placed ? { x: v.x, z: v.z, heading: typeof v.heading === "number" ? v.heading : 0 } : undefined;
    times.feed(state.course, v?.speed);
    course = state.course;
    // no course: the canvas is stale even while hidden, so a key the mod
    // gives again (it counts from 1 after a restart) still paints whole
    if (!course && painted.key !== undefined) painted.key = -1;

    // the field: the course's outline, or (building) the field's under the rig
    const here = course ? courseField(course) : state.building && placed ? fieldAt(store, v.x, v.z) : undefined;
    const outline = course ? course.boundary : here?.points;
    fieldId = here?.id;
    clip = here?.points;
    const nextViewKey = outline ? outline.join(",") : "";
    if (nextViewKey !== viewKey) {
      viewKey = nextViewKey;
      view = outline && outline.length >= 6 ? courseView(outline) : undefined;
      const attr = view ? view.map(n1).join(" ") : "0 0 1 1";
      ground.setAttribute("viewBox", attr);
      over.setAttribute("viewBox", attr);
      const pts = outline ? pointsAttr(outline) : "";
      fieldEl.setAttribute("points", pts);
      edgeEl.setAttribute("points", pts);
    }
    mapBox.dataset.empty = String(!view);
    courseCanvas.dataset.dim = String(state.dim);
    legend.hidden = !course || !!state.words;
    trailKey.hidden = !coverage.trails || fieldId === undefined || !coverage.trails(fieldId).length;
    if (wordsEl.textContent !== state.words) wordsEl.textContent = state.words;
    wordsEl.hidden = !state.words;

    // the header: rewritten only when its words change
    const counts = course ? countsOf(course) : undefined;
    const fill = course && rigAt ? fillOf(course, rigAt) : undefined;
    const minutes = times.minutesLeft(course, fill?.t ?? 0);
    const units = unitsOf(store);
    const field = here ? (store.get("fields")?.fields || []).find((/** @type {any} */ f) => f.id === here.id) : undefined;
    const contract = here ? onField(contractsOf(store), here.id)[0] : undefined;
    const parts = [typeof field?.areaHa === "number" ? areaText(field.areaHa, units) : "",
      contract ? `Contract: ${titleOf(contract)}` : "", course ? `${widthOf(course).toFixed(1)} m` : ""].filter(Boolean);
    const headKey = JSON.stringify([here?.id, parts, counts, minutes === undefined ? -1 : Math.round(minutes)]);
    if (headKey !== lastHead) {
      lastHead = headKey;
      badge.textContent = here ? String(here.id) : "–";
      name.textContent = here ? `Field ${here.id}` : "No field";
      line.textContent = parts.join(" · ");
      lanesStat.set(counts ? String(counts.lanesDone) : "–", counts ? `of ${counts.lanes}` : "");
      onStat.set(counts?.on ? String(counts.on.n) : "–", "", counts?.on?.kind === "round" ? "On headland" : "On lane");
      roundsStat.set(counts && counts.rounds ? String(counts.roundsDone) : "–", counts && counts.rounds ? `of ${counts.rounds}` : "");
      timeStat.set(minutes === undefined ? "–" : `≈ ${Math.max(1, Math.round(minutes))}`, minutes === undefined ? "" : "min");
      mapBox.setAttribute("aria-label", counts
        ? `Field ${here?.id ?? ""}: ${counts.lanesDone} of ${counts.lanes} lanes done` : state.words || "GPS");
    }
    paint();
    placeFill();
  };
  watchSize(box, (width, height) => {
    boxW = width;
    boxH = height;
    paint();
  });
  for (const k of ["cab", "vehicles", "steering_course", "field_outlines", "fields", "contracts", "env", "farmlands"]) {
    store.subscribe(k, render);
  }
  return root;
}
