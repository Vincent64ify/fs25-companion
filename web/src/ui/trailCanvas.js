// @ts-check
// The trail on a canvas (specs/0013, shared with the GPS screen since
// specs/0021): where the rig's tools worked on a field (data/coverage.js),
// fitted to a view of world metres and clipped to the field's outline. All
// of it when the field, size or palette changed or a tool's trail went;
// else only each run's newest stretch, so a vehicles message paints a few
// points.

/** @typedef {[number, number, number, number]} View x, z, width, height in world metres */
/** @typedef {{k: number, x0: number, z0: number}} Fit pixels a metre, and where x = 0 and z = 0 land */
/** @typedef {{trails: (fieldId: number) => any[], version: (fieldId: number) => number}} TrailSource */

// the trail's colours when the theme has none (the day's)
export const TRAIL_FALLBACK = { work: "#B4D6C8", mow: "#E8E1BF" };

/**
 * A view fitted to a box, centred ("xMidYMid meet", as an SVG's viewBox):
 * a world point lands at (x0 + x·k, z0 + z·k) pixels.
 * @param {View} view @param {number} width @param {number} height
 * @returns {Fit}
 */
export function fitView(view, width, height) {
  const k = Math.min(width / view[2], height / view[3]);
  return { k, x0: (width - view[2] * k) / 2 - view[0] * k, z0: (height - view[3] * k) / 2 - view[1] * k };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {TrailSource} coverage
 * @param {(kind: "work"|"mow") => string} colourOf the trail's colour for a kind
 */
export function createTrailCanvas(canvas, coverage, colourOf) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  /** what the canvas holds: a field at a size and palette, by these tools, at this version */
  const painted = { field: /** @type {number|undefined} */ (undefined), w: 0, h: 0, dpr: 0, palette: "", version: -1,
    seam: 0, tools: /** @type {Set<number>} */ (new Set()) };
  /** how many points of each run are on the canvas */
  /** @type {WeakMap<object, number>} */
  const drawnPts = new WeakMap();
  let clipped = false;

  /**
   * One stroke along a run's points from..n-1 (world metres; the canvas's
   * transform makes them pixels).
   * @param {number[]} pts @param {number} from @param {number} n @param {number} width @param {string} colour
   */
  function stroke(pts, from, n, width, colour) {
    if (n - from < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[2 * from], pts[2 * from + 1]);
    for (let i = from + 1; i < n; i++) ctx.lineTo(pts[2 * i], pts[2 * i + 1]);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /**
   * The field's trail in the box, or a clear canvas without a field.
   * @param {{fieldId: number|undefined, view: View|undefined, clip: number[]|undefined, w: number, h: number}} at
   *   clip: the field's outline, [x1, z1, ...]
   */
  function paint({ fieldId, view, clip, w: boxW, h: boxH }) {
    const dpr = window.devicePixelRatio || 1;
    const palette = document.documentElement.dataset.palette || "";
    if (fieldId === undefined || !view || !clip) {
      if (painted.field !== undefined) {
        // out of the field's fit and clip first, or the clear lands in world
        // metres near the map's origin and misses the trail
        if (clipped) ctx.restore();
        clipped = false;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      painted.field = undefined;
      return;
    }
    const version = coverage.version(fieldId);
    const full = painted.field !== fieldId || painted.w !== boxW || painted.h !== boxH || painted.dpr !== dpr
      || painted.palette !== palette;
    if (!full && version === painted.version) return;
    const list = coverage.trails(fieldId);
    const ids = new Set(list.map((t) => t.tool));
    if (full || [...painted.tools].some((id) => !ids.has(id))) {
      const width = Math.round(boxW * dpr), height = Math.round(boxH * dpr);
      // a new size clears the canvas and its clip
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      if (clipped) ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      clipped = true;
      const fit = fitView(view, boxW, boxH);
      ctx.setTransform(dpr * fit.k, 0, 0, dpr * fit.k, dpr * fit.x0, dpr * fit.z0);
      // the trail ends at the field's edge
      ctx.beginPath();
      ctx.moveTo(clip[0], clip[1]);
      for (let i = 2; i + 1 < clip.length; i += 2) ctx.lineTo(clip[i], clip[i + 1]);
      ctx.closePath();
      ctx.clip();
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      // a pixel wider (in metres), so passes side by side leave no seam
      Object.assign(painted, { field: fieldId, w: boxW, h: boxH, dpr, palette, seam: 1 / fit.k });
      const colours = { work: colourOf("work"), mow: colourOf("mow") };
      for (const t of list) {
        for (const run of t.runs) {
          const n = run.pts.length / 2;
          stroke(run.pts, 0, n, run.w + painted.seam, colours[/** @type {"work"|"mow"} */ (t.kind)]);
          drawnPts.set(run, n);
        }
      }
    } else {
      const colours = { work: "", mow: "" };
      for (const t of list) {
        const kind = /** @type {"work"|"mow"} */ (t.kind);
        for (const run of t.runs) {
          const n = run.pts.length / 2;
          const done = drawnPts.get(run) ?? 0;
          if (n <= done) {
            // the cap merged its points: what's painted stays
            if (n < done) drawnPts.set(run, n);
            continue;
          }
          colours[kind] ||= colourOf(kind);
          // from two points back, so the bend joins up
          stroke(run.pts, Math.max(0, done - 2), n, run.w + painted.seam, colours[kind]);
          drawnPts.set(run, n);
        }
      }
    }
    painted.version = version;
    painted.tools = ids;
  }

  return { paint };
}
