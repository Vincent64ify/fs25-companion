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
// - Every lane and round is the strip it works (revision 2): a stroke its
//   width less a pixel (a hairline between strips), square ends, mitred
//   corners. Lanes run out a width past their ends and are cut flush by
//   erasing the rounds' strokes a pixel wider; each round is one closed
//   stroke, worked part way clipped to each run's sector. Closer than 4 px
//   the strips are drawn full width, so a dense field reads as areas.
// - The trail shows only inside the lanes to do (a mask the trail painter
//   applies after each paint); the fill is one SVG line masked by the rounds.

import { countsOf, createGpsTimes, fillOf, gpsState, roundLoopsOf, roundRuns, runOut, stateOf, widthOf } from "../data/gps.js";
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
// a lane to do: its strip in the to-do colour this strong; the lane you're on ahead of the rig in its own
const TODO_ALPHA = 0.16;
const AHEAD_ALPHA = 0.2;
// the lane you're on: its outline this many pixels wide each side
const EDGE_PX = 2;
// mitred corners up to this (the rounds turn at about 90°)
const MITER = 8;
// the trail shows this far in from a lane to do's sides (the tool spills over them)
const TRAIL_IN_M = 1.5;
// each screen's SVG mask its own id
let screens = 0;

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
  // the fill is cut by the rounds as the lanes are: the field less the rounds' strokes a pixel wider
  const maskId = `gps-rounds-${++screens}`;
  const big = { x: -1e5, y: -1e5, width: 2e5, height: 2e5 };
  const roundsMask = svg("mask", { id: maskId, maskUnits: "userSpaceOnUse", ...big });
  roundsMask.append(svg("rect", { ...big, fill: "#fff" }));
  const defs = svg("defs");
  defs.append(roundsMask);
  const fillEl = svg("polyline", { class: "gps-fill", mask: `url(#${maskId})` });
  const edgeEl = svg("polygon", { class: "gps-edge" });
  over.append(defs, fillEl, edgeEl);
  const rigSvg = svg("svg", { class: "gps-rig-svg", width: 1, height: 1, overflow: "visible" });
  rigSvg.append(svg("path", { class: "gps-arrow", d: "M0 -13 L9 10 L0 5 L-9 10 Z" }));
  const rig = h("div", { className: "gps-rig" }, rigSvg);
  rig.hidden = true;
  const key = (/** @type {string} */ cls, /** @type {string} */ text) => h("span", { className: "gps-key" },
    h("i", { className: cls }), document.createTextNode(text));
  const trailKey = key("trail", "Worked, not counted");
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

  /** the course's shapes, once per key: each round's loop, each lane's polyline run out past its ends */
  const geo = { key: /** @type {number|undefined} */ (undefined), loops: /** @type {ReturnType<typeof roundLoopsOf>} */ ([]),
    lanes: /** @type {Map<number, number[]>} */ (new Map()) };
  /** @param {SteeringCourse} c */
  function geometry(c) {
    if (geo.key !== c.key) {
      const w = widthOf(c);
      geo.key = c.key;
      geo.loops = roundLoopsOf(c);
      geo.lanes = new Map(c.segments.filter((s) => typeof s.lane === "number" && s.pts.length >= 4)
        .map((s) => [s.i, runOut(s.pts, w)]));
    }
    return geo;
  }

  /** The strips' widths at this size, in world metres (the canvas's transform makes them pixels). @param {SteeringCourse} c */
  function lookOf(c) {
    const w = widthOf(c);
    const px = view && boxW > 0 && boxH > 0 ? 1 / fitView(view, boxW, boxH).k : w / 20;
    const dense = w / px < DENSE_PX;
    return { w, px, dense, band: dense ? w : w - px, cut: dense ? w : w + px, inner: Math.max(px, w - (1 + 2 * EDGE_PX) * px),
      colours: { done: colourOf("--gps-done", FALLBACK.done), current: colourOf("--gps-current", FALLBACK.current),
        todo: colourOf("--gps-todo", FALLBACK.todo) } };
  }

  /**
   * A polyline into the context's path, closed for a round's loop.
   * @param {CanvasRenderingContext2D} c @param {number[]} pts @param {boolean} closed
   */
  function trace(c, pts, closed) {
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 1 < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (closed) c.closePath();
  }

  /** One stroke along a shape. @param {() => void} shape @param {number} width @param {string} colour @param {number} [alpha] */
  function stroke(shape, width, colour, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    shape();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Erase along a shape. @param {() => void} shape @param {number} width */
  function erase(shape, width) {
    ctx.globalCompositeOperation = "destination-out";
    stroke(shape, width, "#000");
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * A strip in its state: done solid; to do faintly tinted; the lane you're
   * on outlined, the part ahead tinted (the fill paints the part behind).
   * @param {() => void} shape @param {string} state @param {ReturnType<typeof lookOf>} look
   */
  function strip(shape, state, look) {
    if (state === "done") stroke(shape, look.band, look.colours.done);
    else if (state === "todo") stroke(shape, look.band, look.colours.todo, TODO_ALPHA);
    else {
      stroke(shape, look.band, look.colours.current);
      if (look.dense) return;
      erase(shape, look.inner);
      stroke(shape, look.inner, look.colours.current, AHEAD_ALPHA);
    }
  }

  /** A lane, over what was there (erased first when repainting). @param {CourseSegment} s @param {string} state @param {ReturnType<typeof lookOf>} look @param {boolean} again */
  function drawLane(s, state, look, again) {
    const pts = geometry(/** @type {SteeringCourse} */ (course)).lanes.get(s.i);
    if (!pts) return;
    const shape = () => trace(ctx, pts, false);
    if (again) erase(shape, look.w);
    strip(shape, state, look);
  }

  /** The lanes cut flush by the rounds: their strokes erased a pixel wider. @param {ReturnType<typeof lookOf>} look */
  function cutRounds(look) {
    const g = geometry(/** @type {SteeringCourse} */ (course));
    if (g.loops.length) erase(() => { for (const r of g.loops) trace(ctx, r.pts, true); }, look.cut);
  }

  /**
   * A round: one closed stroke, or worked part way each run of one state
   * clipped to its sector, cut on the bisectors at its joints.
   * @param {ReturnType<typeof roundLoopsOf>[number]} r @param {Map<number, string>} states
   * @param {ReturnType<typeof lookOf>} look @param {boolean} again
   */
  function drawRound(r, states, look, again) {
    const shape = () => trace(ctx, r.pts, true);
    if (again) erase(shape, look.w);
    for (const run of roundRuns(r, r.pieces.map((i) => states.get(i) || "todo"), look.w)) {
      ctx.save();
      if (run.sector) {
        ctx.beginPath();
        trace(ctx, run.sector, true);
        ctx.clip();
      }
      strip(shape, run.state, look);
      ctx.restore();
    }
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
    const look = lookOf(course);
    const g = geometry(course);
    const done = new Set(course.done || []);
    const states = new Map(course.segments.map((s) => [s.i, stateOf(/** @type {SteeringCourse} */ (course), done, s)]));
    const full = painted.key !== course.key || painted.w !== boxW || painted.h !== boxH || painted.dpr !== dpr
      || painted.palette !== palette;
    const lanes = course.segments.filter((s) => typeof s.lane === "number");
    const changed = (/** @type {number} */ i) => painted.states.get(i) !== states.get(i);
    if (full) {
      const width = Math.round(boxW * dpr), height = Math.round(boxH * dpr);
      if (courseCanvas.width !== width) courseCanvas.width = width;
      if (courseCanvas.height !== height) courseCanvas.height = height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(dpr * fit.k, 0, 0, dpr * fit.k, dpr * fit.x0, dpr * fit.z0);
    }
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.miterLimit = MITER;
    // a mitre's point never leaves the field
    ctx.save();
    ctx.beginPath();
    trace(ctx, course.boundary, true);
    ctx.clip();
    if (full) {
      // the lanes, cut by the rounds, then the rounds
      for (const s of lanes) drawLane(s, states.get(s.i) || "todo", look, false);
      cutRounds(look);
      for (const r of g.loops) drawRound(r, states, look, false);
      stats.full++;
      Object.assign(painted, { key: course.key, w: boxW, h: boxH, dpr, palette });
    } else {
      const lanesChanged = lanes.filter((s) => changed(s.i));
      for (const s of lanesChanged) drawLane(s, states.get(s.i) || "todo", look, true);
      stats.lanes += lanesChanged.length;
      // a lane's erase reaches into the rounds at its ends: the rounds again
      if (lanesChanged.length) cutRounds(look);
      const redo = lanesChanged.length ? g.loops : g.loops.filter((r) => r.pieces.some(changed));
      for (const r of redo) drawRound(r, states, look, true);
      stats.pieces += redo.reduce((n, r) => n + r.pieces.length, 0);
    }
    ctx.restore();
    painted.states = states;
  }

  /** The lane you're on, filled up to the rig: one polyline's points, no lane repainted. */
  function placeFill() {
    const fill = course && rigAt ? fillOf(course, rigAt) : undefined;
    const pts = fill && fill.pts.length >= 4 ? pointsAttr(fill.pts) : "";
    if (fillEl.getAttribute("points") !== pts) fillEl.setAttribute("points", pts);
    if (!course || !view || !(boxW > 0 && boxH > 0)) return;
    const look = lookOf(course);
    const g = geometry(course);
    // the rounds in the mask: once per course
    if (roundsMask.dataset.key !== String(course.key)) {
      roundsMask.dataset.key = String(course.key);
      while (roundsMask.childNodes.length > 1) roundsMask.lastChild?.remove();
      for (const r of g.loops) {
        roundsMask.append(svg("path", { d: `M${pointsAttr(r.pts).replace(/ /g, "L")}Z`, fill: "none", stroke: "#000",
          "stroke-linejoin": "miter", "stroke-miterlimit": MITER }));
      }
    }
    const w = n1(look.band), cut = n1(look.cut);
    if (fillEl.getAttribute("stroke-width") !== w) fillEl.setAttribute("stroke-width", w);
    for (const el of roundsMask.querySelectorAll("path")) if (el.getAttribute("stroke-width") !== cut) el.setAttribute("stroke-width", cut);
  }

  /** The trail's mask: keep what's inside the lanes to do, a little in from their sides, and off the rounds. @param {SteeringCourse} c */
  function trailMask(c) {
    const g = geometry(c);
    const done = new Set(c.done || []);
    const todo = c.segments.filter((s) => typeof s.lane === "number" && stateOf(c, done, s) === "todo");
    const look = lookOf(c);
    return {
      key: `${c.key}:${todo.map((s) => s.i).join(",")}`,
      /** @param {CanvasRenderingContext2D} t */
      apply(t) {
        t.lineCap = "butt";
        t.lineJoin = "miter";
        t.miterLimit = MITER;
        if (!todo.length) {
          t.setTransform(1, 0, 0, 1, 0, 0);
          t.clearRect(0, 0, t.canvas.width, t.canvas.height);
          return;
        }
        t.globalCompositeOperation = "destination-in";
        t.lineWidth = Math.max(look.px, look.w - 2 * TRAIL_IN_M);
        t.beginPath();
        for (const s of todo) trace(t, /** @type {number[]} */ (g.lanes.get(s.i)), false);
        t.stroke();
        t.globalCompositeOperation = "destination-out";
        t.lineWidth = look.cut;
        t.beginPath();
        for (const r of g.loops) trace(t, r.pts, true);
        t.stroke();
      }
    };
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
    trail.paint({ fieldId, view, clip, w: boxW, h: boxH, mask: course && view ? trailMask(course) : undefined });
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
    // the fill's width and the rounds' mask go by the size too
    placeFill();
  });
  for (const k of ["cab", "vehicles", "steering_course", "field_outlines", "fields", "contracts", "env", "farmlands"]) {
    store.subscribe(k, render);
  }
  return root;
}
