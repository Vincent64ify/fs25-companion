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
//   moves the rig and the fill's dash and paints no lane.
// - Nothing is painted while the page is hidden (0 × 0): screens are built
//   once and switched with `hidden`, and the iPad pays for every paint.
// - Every lane and round is the strip it works (revision 2): a stroke its
//   width less a pixel (a hairline between strips), square ends, mitred
//   corners; a lane to do also has its two edges as lines of the to-do
//   colour while lanes are 3 px or more apart (revision 3, so they can be
//   counted). Lanes run out a width past their ends and are cut flush by
//   erasing the rounds' strokes a pixel wider; each round is one closed
//   stroke, worked part way clipped to each run's sector. Closer than 4 px
//   the strips are drawn full width, so a dense field reads as areas.
// - The trail shows only inside the lanes to do (a mask the trail painter
//   applies after each paint); the fill is one SVG line, masked by the rounds
//   on a lane (not on a round piece, which the mask would hide):
//   the whole lane you're on, set once per lane, shown up to the rig by its
//   dash, which steps with each position (revision 5: a slide with the
//   arrow felt jittery on the iPad, Vincent).
// - Set up (specs/0022), top right on the field card, opens the Steering
//   Assist settings in the Drive column's place (widgets/steeringSettings.js).
//   While a course row differs from the game's, the field shows the preview
//   the game's builder made for the panel's settings (steering_preview):
//   its lanes and rounds tinted in this lane's colour with a centre line,
//   tagged "Preview · not applied", the counts quiet; "Building the
//   preview…" over the game's course dimmed until the one asked for comes;
//   "No lanes with these settings" when the game built none. The course
//   and the preview are painted on the same canvas, their keys kept apart
//   ("c3", "p3").
// - The close-up (revision 4): a switch bottom right on the field card,
//   Field · Auto · Close, kept in the browser. Auto shows the close-up while
//   an end of your lane is on the close-up's picture, keeping it through the
//   turn (revision 5), where lanes are under 16 px in the whole field
//   (data/gps.js createAutoZoom). The close-up is about nine lanes across, north up, the
//   rig a third in from where it came, with the lanes' numbers at their
//   ends. Every layer sits in one element (.gps-layers): the close-up is
//   painted once for twice the box each way and slid by a transform as the
//   rig moves (gliding between positions), painted again only near the
//   painted area's edge, the picture and the arrow then gliding on from
//   where they were (revision 5); going in and out scales the old picture for
//   0.4 s, then paints the new one sharp. Set up's preview is always the
//   whole field.

import { closeView, countsOf, createAutoZoom, createGpsTimes, fillOf, gpsState, laneNumbersOf, offsetLine, roundLoopsOf, roundRuns, runOut, stateOf,
  widthOf } from "../data/gps.js";
import { controlledVehicle, fieldAt, outlineBounds } from "../data/selectors.js";
import { contractsOf, onField, titleOf } from "../data/contracts.js";
import { coverageOf } from "../data/coverage.js";
import { areaText, unitsOf } from "../data/units.js";
import { createTrailCanvas, fitView, TRAIL_FALLBACK } from "../ui/trailCanvas.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { dropPreview, setupOf, setSetup } from "../data/steeringSettings.js";

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
const FALLBACK = { done: "#2F8A5C", current: "#0C4DB8", todo: "#6F7C94" };
// a lane to do: its strip in the to-do colour this strong (revision 3: 24 %, was 16 %); the lane you're on
// ahead of the rig in its own
const TODO_ALPHA = 0.24;
// revision 3: a lane to do's edges are lines of the to-do colour, a CSS pixel wide, while lanes are this far apart
const LINE_MIN_PX = 3;
const AHEAD_ALPHA = 0.2;
// the lane you're on: its outline this many pixels wide each side
const EDGE_PX = 2;
// mitred corners up to this (the rounds turn at about 90°)
const MITER = 8;
// the trail shows this far in from a lane to do's sides (the tool spills over them)
const TRAIL_IN_M = 1.5;
// the preview's strips (specs/0022): this lane's colour this strong, a centre line this strong
const PREVIEW_ALPHA = 0.3;
const PREVIEW_LINE_ALPHA = 0.75;
// each screen's SVG mask its own id
let screens = 0;
// revision 4: the view picked, kept in the browser; going in and out of the close-up
const VIEW_KEY = "fs25companion.gpsView";
const VIEWS = /** @type {const} */ (["field", "auto", "close"]);
const ZOOM_MS = 400;
// a lane number's baseline under its chip's middle, in ems (Archivo 700's digits: 0.70 em up, 0.02 down)
const DIGIT_MID_EM = 0.34;
// a canvas's pixels at most (Safari's limit is 16.7 M): the close-up's painted area keeps under it
const MAX_CANVAS_PX = 15e6;
/** @typedef {"field"|"auto"|"close"} ViewMode */
/** @typedef {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void}} KeptChoices */
/** the browser's own, quiet in private mode @type {KeptChoices} */
const BROWSER = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** @param {string} tag @param {Record<string, string|number>} [attrs] */
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Close's X, as the canvas draws it (specs/0022). */
function closeIcon() {
  const s = svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2.2,
    "stroke-linecap": "round", "aria-hidden": "true" });
  s.append(svg("path", { d: "M6 6l12 12M18 6L6 18" }));
  return s;
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
    times?: ReturnType<typeof createGpsTimes>, stats?: PaintStats, storage?: KeptChoices, zoomMs?: number}} */ (/** @type {any} */ (opts));
  const coverage = more.coverage || coverageOf(store);
  const watchSize = more.watchSize || observeSize;
  const times = more.times || createGpsTimes();
  const stats = more.stats || { full: 0, lanes: 0, pieces: 0 };
  const storage = more.storage || BROWSER;
  const zoomMs = more.zoomMs ?? ZOOM_MS;

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
  // revision 4: the lanes' numbers in the close-up
  const chipsEl = svg("g", { class: "gps-chips" });
  over.append(defs, fillEl, edgeEl, chipsEl);
  const rigSvg = svg("svg", { class: "gps-rig-svg", width: 1, height: 1, overflow: "visible" });
  rigSvg.append(svg("path", { class: "gps-arrow", d: "M0 -13 L9 10 L0 5 L-9 10 Z" }));
  const rig = h("div", { className: "gps-rig" }, rigSvg);
  rig.hidden = true;
  const key = (/** @type {string} */ cls, /** @type {string} */ text) => h("span", { className: "gps-key" },
    h("i", { className: cls }), document.createTextNode(text));
  const trailKey = key("trail", "Worked, not counted");
  const courseKeys = [key("done", "Done"), key("current", "This lane"), key("todo", "To do"), trailKey];
  const previewKey = key("preview", "Lanes with these settings");
  // the preview's key is in the legend only while a preview shows
  const legend = h("div", { className: "gps-legend" }, ...courseKeys);
  const wordsEl = h("div", { className: "gps-words" });
  // Set up (specs/0022): top right on the field card; Close while open
  const setUp = /** @type {HTMLButtonElement} */ (h("button", { className: "st-open" }));
  setUp.type = "button";
  setUp.setAttribute("aria-controls", "st-col");
  setUp.addEventListener("click", () => {
    const open = !setupOf(store).open;
    dropPreview(store);
    setSetup(store, { open, draft: undefined, phase: "idle", previewFor: undefined, previewFailed: undefined,
      lanesChanged: false });
  });
  // whose course the field shows while Set up is open
  const tagText = h("b");
  const tagSub = h("span");
  const tag = h("div", { className: "st-tag" }, tagText, tagSub);
  tag.hidden = true;
  // every layer in one element in one measured box, so the canvases, the SVGs and the rig share one fit;
  // the close-up's layers are twice the box each way, slid by a transform (revision 4)
  const layers = h("div", { className: "gps-layers" }, ground, trailCanvas, courseCanvas, over, rig);
  const box = h("div", { className: "gps-box" }, layers);
  // the view switch, bottom right: Field · Auto · Close
  let viewMode = /** @type {ViewMode} */ (VIEWS.find((v) => v === storage.getItem(VIEW_KEY)) || "auto");
  /** @type {Record<string, HTMLButtonElement>} */
  const viewSegs = {};
  const viewEl = h("div", { className: "gps-view" });
  viewEl.setAttribute("role", "radiogroup");
  viewEl.setAttribute("aria-label", "View");
  for (const [v, label] of [["field", "Field"], ["auto", "Auto"], ["close", "Close"]]) {
    const b = /** @type {HTMLButtonElement} */ (h("button", { className: "gps-view-seg", text: label }));
    b.type = "button";
    b.dataset.value = v;
    b.setAttribute("role", "radio");
    b.addEventListener("click", () => {
      if (viewMode === v) return;
      viewMode = /** @type {ViewMode} */ (v);
      storage.setItem(VIEW_KEY, v);
      render();
    });
    viewSegs[v] = b;
    viewEl.append(b);
  }
  // Auto has zoomed: why, top left
  const zoomTag = h("div", { className: "gps-zoomtag" }, h("b", { text: "Close-up" }), h("span", { text: "Auto" }));
  zoomTag.hidden = true;
  const mapBox = h("div", { className: "gps-map" }, box, legend, wordsEl, tag, zoomTag, setUp, viewEl);
  mapBox.setAttribute("role", "img");
  const root = h("section", { className: "gps-screen" }, head, mapBox);
  root.setAttribute("aria-label", "GPS");
  if (opts.id) root.id = opts.id;

  const colourOf = (/** @type {string} */ name, /** @type {string} */ fallback) =>
    getComputedStyle(root).getPropertyValue(name).trim() || fallback;
  const trail = createTrailCanvas(trailCanvas, coverage,
    (kind) => colourOf(`--trail-${kind}`, TRAIL_FALLBACK[kind]));

  let boxW = 0, boxH = 0;
  /** the layers' size: the box's, twice it each way in the close-up */
  let lw = 0, lh = 0;
  /** what's on screen: the view the layers are painted for, the field (for the trail), the outline drawn */
  let view = /** @type {View|undefined} */ (undefined);
  let viewKey = "";
  /** revision 4: the whole field's view; the close-up on screen; Auto's rule; going in or out now */
  let fieldView = /** @type {View|undefined} */ (undefined);
  let screenView = /** @type {View|undefined} */ (undefined);
  let zoomed = false;
  let zooming = false;
  const autoZoom = createAutoZoom();
  let svgViewKey = "";
  let chipsKey = "";
  let fieldId = /** @type {number|undefined} */ (undefined);
  let clip = /** @type {number[]|undefined} */ (undefined);
  let course = /** @type {SteeringCourse|undefined} */ (undefined);
  /** specs/0022: the course on the canvas is the preview's */
  let previewing = false;
  let rigAt = /** @type {{x: number, z: number, heading: number}|undefined} */ (undefined);
  let lastHead = "";
  /** what the course canvas holds; -1: a course gone while the page was hidden, to clear */
  const painted = { key: /** @type {number|undefined} */ (undefined), w: 0, h: 0, dpr: 0, palette: "", view: "",
    states: /** @type {Map<number, string>} */ (new Map()) };

  /** the course's shapes, once per key: each round's loop, each lane's polyline run out past its ends */
  const geo = { key: /** @type {number|undefined} */ (undefined), loops: /** @type {ReturnType<typeof roundLoopsOf>} */ ([]),
    lanes: /** @type {Map<number, number[]>} */ (new Map()), edges: /** @type {Map<number, number[][]>} */ (new Map()) };
  /** @param {SteeringCourse} c */
  function geometry(c) {
    if (geo.key !== c.key) {
      const w = widthOf(c);
      geo.key = c.key;
      geo.loops = roundLoopsOf(c);
      geo.lanes = new Map(c.segments.filter((s) => typeof s.lane === "number" && s.pts.length >= 4)
        .map((s) => [s.i, runOut(s.pts, w)]));
      // revision 3: each lane's two edges, half its width out
      geo.edges = new Map([...geo.lanes].map(([i, pts]) => [i, [offsetLine(pts, w / 2), offsetLine(pts, -w / 2)]]));
    }
    return geo;
  }

  /** The strips' widths at this size, in world metres (the canvas's transform makes them pixels). @param {SteeringCourse} c */
  function lookOf(c) {
    const w = widthOf(c);
    const px = view && lw > 0 && lh > 0 ? 1 / fitView(view, lw, lh).k : w / 20;
    const dense = w / px < DENSE_PX;
    return { w, px, dense, lines: w / px >= LINE_MIN_PX, band: dense ? w : w - px, cut: dense ? w : w + px,
      inner: Math.max(px, w - (1 + 2 * EDGE_PX) * px),
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

  /**
   * A lane to do's two edges (revision 3), a CSS pixel wide: drawn before the
   * rounds cut the lanes, so they stop flush too.
   * @param {CourseSegment} s @param {ReturnType<typeof lookOf>} look
   */
  function drawEdges(s, look) {
    const sides = geometry(/** @type {SteeringCourse} */ (course)).edges.get(s.i);
    if (!sides || !look.lines) return;
    stroke(() => { for (const pts of sides) trace(ctx, pts, false); }, look.px, look.colours.todo);
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

  /**
   * The preview (specs/0022): every lane and round as the strip it would
   * work, tinted in this lane's colour, with a centre line.
   * @param {SteeringCourse} c @param {ReturnType<typeof lookOf>} look
   */
  function paintPreview(c, look) {
    for (const s of c.segments) {
      if (s.pts.length >= 4) stroke(() => trace(ctx, s.pts, false), look.band, look.colours.current, PREVIEW_ALPHA);
    }
    for (const s of c.segments) {
      if (s.pts.length >= 4) stroke(() => trace(ctx, s.pts, false), look.px, look.colours.current, PREVIEW_LINE_ALPHA);
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
    const fit = fitView(view, lw, lh);
    const look = lookOf(course);
    const g = geometry(course);
    const viewStr = view.join(",");
    const done = new Set(course.done || []);
    const states = new Map(course.segments.map((s) => [s.i, stateOf(/** @type {SteeringCourse} */ (course), done, s)]));
    const full = painted.key !== course.key || painted.w !== lw || painted.h !== lh || painted.dpr !== dpr
      || painted.palette !== palette || painted.view !== viewStr;
    const lanes = course.segments.filter((s) => typeof s.lane === "number");
    const changed = (/** @type {number} */ i) => painted.states.get(i) !== states.get(i);
    if (full) {
      const width = Math.round(lw * dpr), height = Math.round(lh * dpr);
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
    if (previewing) {
      // the preview has no states: painted whole, once per key and size
      if (full) {
        paintPreview(course, look);
        stats.full++;
        Object.assign(painted, { key: course.key, w: lw, h: lh, dpr, palette, view: viewStr });
      }
    } else if (full) {
      // the lanes, cut by the rounds, then the rounds
      for (const s of lanes) drawLane(s, states.get(s.i) || "todo", look, false);
      for (const s of lanes) if (states.get(s.i) === "todo") drawEdges(s, look);
      cutRounds(look);
      for (const r of g.loops) drawRound(r, states, look, false);
      stats.full++;
      Object.assign(painted, { key: course.key, w: lw, h: lh, dpr, palette, view: viewStr });
    } else {
      const lanesChanged = lanes.filter((s) => changed(s.i));
      for (const s of lanesChanged) drawLane(s, states.get(s.i) || "todo", look, true);
      // the edges of the lanes changed, and of their neighbours to do (an erase takes half a shared edge)
      const near = new Set(lanesChanged.flatMap((s) => [/** @type {number} */ (s.lane) - 1, s.lane, /** @type {number} */ (s.lane) + 1]));
      for (const s of lanes) if (near.has(s.lane) && states.get(s.i) === "todo") drawEdges(s, look);
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
    const fill = course && rigAt && !previewing ? fillOf(course, rigAt) : undefined;
    const run = fill && fill.run && fill.run.length >= 4 && fill.t > 0 ? fill : undefined;
    // revision 5: the whole lane, in the way it's driven, set once; its dash ends at the rig, a step per position
    const runKey = run && course ? `${course.key}:${course.current?.i}:${run.run?.slice(0, 2).join(",")}` : "";
    const off = run ? n1(/** @type {number} */ (run.total) - /** @type {number} */ (run.along)) : "";
    if (fillEl.dataset.run !== runKey) {
      fillEl.dataset.run = runKey;
      fillEl.setAttribute("points", run ? pointsAttr(/** @type {number[]} */ (run.run)) : "");
      fillEl.style.strokeDasharray = run ? `${n1(/** @type {number} */ (run.total))} ${n1(/** @type {number} */ (run.total) + 1)}` : "";
      fillEl.style.strokeDashoffset = off;
    } else if (fillEl.style.strokeDashoffset !== off) fillEl.style.strokeDashoffset = off;
    // a lane's fill is cut flush by the rounds' mask; a round's own fill isn't, or the mask would hide all of it
    const cur = course?.current ? course.segments.find((sg) => sg.i === course.current?.i) : undefined;
    const masked = !cur || typeof cur.lane === "number";
    if (fillEl.hasAttribute("mask") !== masked) {
      if (masked) fillEl.setAttribute("mask", `url(#${maskId})`);
      else fillEl.removeAttribute("mask");
    }
    if (!course || !view || !(lw > 0 && lh > 0)) return;
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
    const fit = fitView(view, lw, lh);
    // the heading the short way round from the last one, so the close-up's glide never spins the arrow
    rigDeg = rigAt.heading + 360 * Math.round((rigDeg - rigAt.heading) / 360);
    const place = (/** @type {{x: number, z: number}} */ p, /** @type {number} */ deg) =>
      `translate(${n1(fit.x0 + p.x * fit.k)}px, ${n1(fit.z0 + p.z * fit.k)}px) rotate(${n1(deg)}deg)`;
    const t = place(rigAt, rigDeg);
    if (freshPicture) {
      freshPicture = false;
      // the close-up painted again (revision 5): from where the arrow was, in the new picture, gliding on;
      // else a new picture: the arrow at its new place at once, not gliding from the old one
      if (carryPicture && rigWas) {
        jump(rig, place(rigWas, rigWasDeg));
        rig.style.transform = t;
      } else jump(rig, t);
      carryPicture = false;
    } else if (rig.style.transform !== t) rig.style.transform = t;
    rigWas = { x: rigAt.x, z: rigAt.z };
    rigWasDeg = rigDeg;
  }

  /** What depends on the box's size; nothing while the page is hidden (0 × 0). */
  function paint() {
    if (!(boxW > 0 && boxH > 0) || zooming) return;
    frame();
    trail.paint({ fieldId, view, clip, w: lw, h: lh, mask: course && view && !previewing ? trailMask(course) : undefined });
    paintCourse();
    placeRig();
    placeChips();
  }

  /** A transform at once, not glided (a new picture, or the zoom's end). @param {HTMLElement} el @param {string} t */
  function jump(el, t) {
    el.style.transition = "none";
    el.style.transform = t;
    void el.offsetWidth;
    el.style.transition = "";
  }

  /** whether the close-up shows now (Auto fed elsewhere, in render) */
  let wantClose = false;
  /** a new picture since the arrow was placed; the arrow's heading as last set (unwound) */
  let freshPicture = false;
  let rigDeg = 0;
  /** revision 5: the new picture is the close-up painted again, so the picture and the arrow glide on; where the arrow was */
  let carryPicture = false;
  let rigWas = /** @type {{x: number, z: number}|undefined} */ (undefined);
  let rigWasDeg = 0;

  /**
   * The view the layers are painted for and where they sit (revision 4):
   * the whole field at the box's size, or the close-up, painted for twice
   * the box each way around the screen's view, slid by a transform, painted
   * again when the screen's view nears its edge.
   */
  function frame() {
    if (!fieldView) {
      view = undefined;
      lw = boxW;
      lh = boxH;
      return;
    }
    if (!wantClose || !rigAt || !course) {
      const changed = view !== fieldView || lw !== boxW || lh !== boxH;
      view = fieldView;
      lw = boxW;
      lh = boxH;
      screenView = undefined;
      if (changed) {
        layers.style.width = `${lw}px`;
        layers.style.height = `${lh}px`;
        jump(layers, "");
        freshPicture = true;
      }
      mapBox.dataset.view = "field";
      setSvgView();
      return;
    }
    const viewWas = mapBox.dataset.view === "close" ? screenView : undefined;
    screenView = closeView(rigAt, widthOf(course), boxW, boxH);
    const f = overPaint();
    const fitNow = view && lw === Math.round(f * boxW) && lh === Math.round(f * boxH) ? fitView(view, lw, lh) : undefined;
    // the screen's view inside the painted area, in the layers' pixels
    const at = (/** @type {{k: number, x0: number, z0: number}} */ f, /** @type {View} */ sv = /** @type {View} */ (screenView)) =>
      [f.x0 + sv[0] * f.k, f.z0 + sv[1] * f.k];
    let off = fitNow && mapBox.dataset.view === "close" ? at(fitNow) : undefined;
    // a new picture: none yet, or the screen's view within an eighth of the box of the painted area's edge
    const fresh = !off || off[0] < boxW / 8 || off[1] < boxH / 8 || off[0] > lw - boxW - boxW / 8 || off[1] > lh - boxH - boxH / 8;
    // painted again while the close-up shows: glide on from the old view (revision 5)
    const carry = fresh && !!off && !!viewWas;
    let from = /** @type {number[]|undefined} */ (undefined);
    if (fresh) {
      const [x, z, w, hh] = screenView;
      const f = overPaint();
      view = [x - (w * (f - 1)) / 2, z - (hh * (f - 1)) / 2, w * f, hh * f];
      lw = Math.round(f * boxW);
      lh = Math.round(f * boxH);
      layers.style.width = `${lw}px`;
      layers.style.height = `${lh}px`;
      const fit = fitView(view, lw, lh);
      off = at(fit);
      if (carry) from = at(fit, /** @type {View} */ (viewWas));
    }
    mapBox.dataset.view = "close";
    setSvgView();
    const t = `translate(${n1(-off[0])}px, ${n1(-off[1])}px)`;
    if (fresh) {
      if (from) {
        jump(layers, `translate(${n1(-from[0])}px, ${n1(-from[1])}px)`);
        layers.style.transform = t;
      } else jump(layers, t);
      freshPicture = true;
      carryPicture = carry;
    } else if (layers.style.transform !== t) layers.style.transform = t;
  }

  /**
   * How much bigger than the box the close-up is painted each way: twice,
   * less where a canvas would pass about 15 Mpx (Safari's limit is 16.7).
   */
  function overPaint() {
    const dpr = window.devicePixelRatio || 1;
    return Math.max(1.25, Math.min(2, Math.sqrt(MAX_CANVAS_PX / Math.max(1, boxW * boxH * dpr * dpr))));
  }

  /** The SVGs' view box: the view the layers are painted for. */
  function setSvgView() {
    const attr = view ? view.map(n1).join(" ") : "0 0 1 1";
    if (attr === svgViewKey) return;
    svgViewKey = attr;
    ground.setAttribute("viewBox", attr);
    over.setAttribute("viewBox", attr);
  }

  /** The lanes' numbers, close up: at each lane's end nearer the rig, in the painted area. */
  function placeChips() {
    const show = mapBox.dataset.view === "close" && !!course && !!view && !!rigAt && lw > 0;
    const c = /** @type {SteeringCourse} */ (course);
    const key = show ? `${svgViewKey}|${c.key}|${(c.done || []).join(",")}|${c.current?.i}` : "";
    if (key === chipsKey) return;
    chipsKey = key;
    chipsEl.replaceChildren();
    if (!show) return;
    const k = fitView(/** @type {View} */ (view), lw, lh).k;
    for (const n of laneNumbersOf(c, /** @type {{x: number, z: number}} */ (rigAt), /** @type {View} */ (view))) {
      const txt = String(n.n), cw = (14 + 8 * txt.length) / k, ch = 22 / k;
      const cx = n.x + n.ux * (cw / 2 + 8 / k), cz = n.z + n.uz * (cw / 2 + 8 / k);
      const g = svg("g", { class: "gps-chip", "data-state": n.state });
      const r2 = (/** @type {number} */ v) => String(Math.round(v * 100) / 100);
      const fs = Math.round((13 / k) * 100) / 100;
      // the baseline by hand, so the digits sit in the chip's middle: iPad Safari ignores dominant-baseline;
      // Archivo's digits are 0.70 em tall, a hair below the baseline, so their middle is 0.34 em above it
      const label = svg("text", { x: r2(cx), y: r2(cz + DIGIT_MID_EM * fs), "font-size": String(fs), "text-anchor": "middle" });
      label.textContent = txt;
      g.append(svg("rect", { x: String(Math.round((cx - cw / 2) * 100) / 100), y: String(Math.round((cz - ch / 2) * 100) / 100),
        width: String(Math.round(cw * 100) / 100), height: String(Math.round(ch * 100) / 100), rx: String(Math.round((6 / k) * 100) / 100) }), label);
      chipsEl.append(g);
    }
  }

  /**
   * Going in or out of the close-up (revision 4): the old picture scaled to
   * where the new view is for 0.4 s, then the new one painted sharp.
   * @param {boolean} into
   */
  function zoomTo(into) {
    wantClose = into;
    if (zoomed === into) return;
    zoomed = into;
    if (!(zoomMs > 0) || !view || !fieldView || !rigAt || !course || !(boxW > 0)) return;
    const f = fitView(fieldView, boxW, boxH);
    let t = "";
    if (into) {
      const sv = closeView(rigAt, widthOf(course), boxW, boxH);
      const s = boxW / (sv[2] * f.k);
      t = `scale(${s}) translate(${n1(-(f.x0 + sv[0] * f.k))}px, ${n1(-(f.z0 + sv[1] * f.k))}px)`;
    } else {
      const kc = fitView(view, lw, lh).k;
      t = `translate(${n1(f.x0 + view[0] * f.k)}px, ${n1(f.z0 + view[1] * f.k)}px) scale(${f.k / kc})`;
    }
    zooming = true;
    layers.style.transition = `transform ${zoomMs}ms var(--ease, ease)`;
    layers.style.transform = t;
    setTimeout(() => {
      zooming = false;
      layers.style.transition = "";
      paint();
      placeFill();
    }, zoomMs);
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

  /**
   * Set up's button and tag, and what the field shows (specs/0022): the
   * game's course, the preview, or the game's course dimmed while the
   * preview builds.
   * @param {ReturnType<typeof gpsState>} state
   * @returns {{course: SteeringCourse|undefined, previewing: boolean, words: string, dim: boolean, empty: boolean,
   *   building: boolean}}
   */
  function setUpView(state) {
    const steering = store.get("cab")?.steering;
    const setup = setupOf(store);
    const open = setup.open && !!steering;
    setUp.hidden = !steering;
    setUp.setAttribute("aria-expanded", String(open));
    const label = open ? "Close" : "Set up";
    if (setUp.dataset.label !== label) {
      setUp.dataset.label = label;
      setUp.replaceChildren(open ? closeIcon() : icon("steering"), document.createTextNode(label));
    }
    const game = { course: state.course, previewing: false, words: state.words, dim: state.dim, empty: false, building: false };
    tag.hidden = !open;
    if (!open) return game;
    /** @param {string} b @param {string} [sub] @param {string} [kind] @param {string} [tone] */
    const setTag = (b, sub = "", kind = "course", tone = "") => {
      if (tagText.textContent !== b) tagText.textContent = b;
      if (tagSub.textContent !== sub) tagSub.textContent = sub;
      tagSub.hidden = !sub;
      tag.dataset.kind = kind;
      if (tone) tagSub.dataset.tone = tone;
      else delete tagSub.dataset.tone;
    };
    if (steering.mode !== "steeringAssist") {
      setTag("AI worker mode", "No lanes");
      return game;
    }
    if (!setup.lanesChanged || !setup.previewFor) {
      setTag("The game's course");
      return game;
    }
    const applying = setup.phase === "applying";
    const lanesDone = (state.course?.done || []).length > 0;
    setTag(applying ? "Preview · applying" : "Preview · not applied",
      applying ? "The game builds them now" : lanesDone ? "Changing starts a new course" : "Apply to steer on these lanes",
      "preview", lanesDone && !applying ? "warn" : "");
    const pv = /** @type {import("../types.js").SteeringPreview|undefined} */ (store.get("steering_preview"));
    const mine = pv && pv.for === setup.previewFor ? pv : undefined;
    if (mine?.state === "ready" && mine.boundary && mine.segments) {
      const c = /** @type {SteeringCourse} */ ({ key: /** @type {any} */ (`p${mine.key}`), width: mine.width,
        boundary: mine.boundary, segments: mine.segments, done: [] });
      return { course: c, previewing: true, words: "", dim: false, empty: false, building: false };
    }
    if (mine?.state === "none") return { ...game, course: undefined, words: "No lanes with these settings", dim: false, empty: true };
    if (mine?.state === "failed" || (!mine && setup.previewFailed === setup.previewFor)) return { ...game, words: "Preview failed" };
    return { ...game, words: "Building the preview…", dim: true, building: true };
  }

  const render = () => {
    const state = gpsState(store);
    const v = /** @type {any} */ (controlledVehicle(store));
    const placed = v && typeof v.x === "number" && typeof v.z === "number";
    rigAt = placed ? { x: v.x, z: v.z, heading: typeof v.heading === "number" ? v.heading : 0 } : undefined;
    times.feed(state.course, v?.speed);
    const shown = setUpView(state);
    previewing = shown.previewing;
    // the course's key apart from the preview's (both count from 1)
    course = shown.course && !previewing ? /** @type {SteeringCourse} */ ({ ...shown.course, key: /** @type {any} */ (`c${shown.course.key}`) })
      : shown.course;
    const words = shown.words;
    // no course: the canvas is stale even while hidden, so a key the mod
    // gives again (it counts from 1 after a restart) still paints whole
    if (!course && painted.key !== undefined) painted.key = -1;

    // the field: the course's outline, or (building) the field's under the rig;
    // a preview is on the game's course's field (the header keeps to it)
    const fieldOf = state.course || course;
    const here = fieldOf ? courseField(fieldOf) : state.building && placed ? fieldAt(store, v.x, v.z) : undefined;
    const outline = course ? course.boundary : fieldOf ? fieldOf.boundary : here?.points;
    fieldId = here?.id;
    clip = here?.points;
    const nextViewKey = outline ? outline.join(",") : "";
    if (nextViewKey !== viewKey) {
      viewKey = nextViewKey;
      fieldView = outline && outline.length >= 6 ? courseView(outline) : undefined;
      if (!fieldView) view = undefined;
      const pts = outline ? pointsAttr(outline) : "";
      fieldEl.setAttribute("points", pts);
      edgeEl.setAttribute("points", pts);
    }
    mapBox.dataset.empty = String(!fieldView);
    // revision 4: the view switch, and whether the close-up shows (never with Set up open)
    const setupOpen = !tag.hidden;
    for (const [v, b] of Object.entries(viewSegs)) b.setAttribute("aria-checked", String(viewMode === v));
    const lanePx = course && fieldView && boxW > 0 && boxH > 0 ? widthOf(course) * fitView(fieldView, boxW, boxH).k : Infinity;
    const auto = viewMode === "auto" && !setupOpen && !previewing ? autoZoom.feed(state.course, rigAt, lanePx,
      state.course && rigAt && boxW > 0 && boxH > 0 ? closeView(rigAt, widthOf(state.course), boxW, boxH) : undefined) : false;
    if (viewMode !== "auto") autoZoom.feed(undefined, undefined, Infinity);
    const close = !!course && !!rigAt && !setupOpen && !previewing && (viewMode === "close" || auto);
    zoomTag.hidden = !(viewMode === "auto" && close);
    courseCanvas.dataset.dim = String(shown.dim);
    trailCanvas.hidden = previewing;
    // the legend goes with words, but for the game's course under "Building the preview…"
    legend.hidden = !course || (!!words && !shown.building);
    for (const k of courseKeys) k.hidden = previewing;
    if (previewing !== previewKey.isConnected) {
      if (previewing) legend.append(previewKey);
      else previewKey.remove();
    }
    trailKey.hidden = previewing || !coverage.trails || fieldId === undefined || !coverage.trails(fieldId).length;
    viewEl.hidden = legend.hidden || setupOpen;
    if (wordsEl.textContent !== words) wordsEl.textContent = words;
    wordsEl.hidden = !words;

    // the header: rewritten only when its words change; quiet while a preview shows
    head.dataset.quiet = String(previewing || shown.empty);
    const counted = state.course;
    const counts = counted ? countsOf(counted) : undefined;
    const fill = counted && rigAt ? fillOf(counted, rigAt) : undefined;
    const minutes = times.minutesLeft(counted, fill?.t ?? 0);
    const units = unitsOf(store);
    const field = here ? (store.get("fields")?.fields || []).find((/** @type {any} */ f) => f.id === here.id) : undefined;
    const contract = here ? onField(contractsOf(store), here.id)[0] : undefined;
    const parts = [typeof field?.areaHa === "number" ? areaText(field.areaHa, units) : "",
      contract ? `Contract: ${titleOf(contract)}` : "", counted ? `${widthOf(counted).toFixed(1)} m` : ""].filter(Boolean);
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
        ? `Field ${here?.id ?? ""}: ${counts.lanesDone} of ${counts.lanes} lanes done` : words || "GPS");
    }
    zoomTo(close);
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
  for (const k of ["cab", "vehicles", "steering_course", "field_outlines", "fields", "contracts", "env", "farmlands",
    "gpsSetup", "steering_preview"]) {
    store.subscribe(k, render);
  }
  return root;
}
