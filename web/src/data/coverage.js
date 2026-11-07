// @ts-check
// The trail (specs/0013-vehicle-screen-calm.md): where the rig's tools have
// worked on each field while the page is open. It's our own estimate from
// the rig's path, each tool's working width and the cab's state, never the
// game's own sprayed or mowed map.
//
// Fed as rates.js is (the vehicles topic). A tool records while it works,
// by Area's rule: lowered (not loader gear) or turned on, the rig faster
// than 0.5 km/h, with a working width. Its band is the sections that are on
// (specs/0011's width), so a narrower pass is narrower and shifted to the
// side still on. The share of a field done counts its 2 m cells under any
// band, so passes that overlap count once.
//
// In memory only, in world metres. At most 20,000 points a field: past
// that the oldest runs lose every other point (the share is kept in the
// cells, so it doesn't change). A tool's trail goes when it's detached, and
// everything when you change vehicles or get out, as Area does.

import {
  cabOf, controlledVehicle, fieldAt, implementsOf, isLoaderGear, outlineBounds, rigEntry, widthMetres, widthSegments,
} from "./selectors.js";

export const CELL_M = 2;
export const MAX_POINTS = 20000;
// the rig moved farther than this between two messages: a jump, not a pass
const MAX_STEP_M = 30;
// a run's polyline is cut at this many points, so drawing one only redraws the last
const RUN_POINTS = 500;
const MIN_KMH = 0.5;

/** @typedef {import("../types.js").RigWidth} RigWidth */
/** @typedef {import("../types.js").FieldOutline} FieldOutline */
/**
 * One run: a band of one width along its middle line, x and z in turn.
 * @typedef {{w: number, o: number, pts: number[], seq: number}} Run
 */
/**
 * A tool's trail on one field: green for work ("work"), pale yellow for
 * mowing ("mow").
 * @typedef {{tool: number, kind: "work"|"mow", runs: Run[], cells: Uint8Array}} Trail
 */
/**
 * @typedef {Object} FieldCover
 * @property {number} id
 * @property {{x0: number, z0: number, cols: number, rows: number}} grid
 * @property {Uint8Array} mask 1 for a cell whose middle is in the field
 * @property {number} inField how many such cells
 * @property {Uint8Array} count how many tools' bands cover each cell
 * @property {number} covered cells in the field under any band
 * @property {Map<number, Trail>} trails by tool id
 * @property {number} points
 * @property {number} version changes with its trails
 */

/**
 * The band across the track: how wide, and how far its middle sits to the
 * right of the rig's track (negative: left), from the sections that are on;
 * the whole working width without sections.
 * @param {RigWidth|undefined} w
 * @param {number} workWidth metres
 * @returns {{w: number, o: number}}
 */
export function bandOf(w, workWidth) {
  if (!w) return { w: workWidth, o: 0 };
  const on = widthSegments(w);
  if (!on.length) return { w: workWidth, o: 0 };
  const metres = widthMetres(w) ? /** @type {number[]} */ (w.sections) : on.map(() => workWidth / on.length);
  const all = metres.reduce((a, b) => a + b, 0);
  const first = on.indexOf(true);
  const last = on.lastIndexOf(true);
  if (first < 0) return { w: 0, o: 0 };
  const from = metres.slice(0, first).reduce((a, b) => a + b, 0);
  const to = metres.slice(0, last + 1).reduce((a, b) => a + b, 0);
  return { w: to - from, o: (from + to) / 2 - all / 2 };
}

/**
 * A field's cells: those whose middle is inside its outline (even-odd, a
 * row at a time).
 * @param {FieldOutline} outline
 * @param {number} cell
 */
function fieldCells(outline, cell) {
  const [x0, z0, x1, z1] = outlineBounds(outline.points);
  const cols = Math.max(1, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(1, Math.ceil((z1 - z0) / cell));
  const mask = new Uint8Array(cols * rows);
  const p = outline.points;
  const n = p.length - (p.length % 2);
  let inField = 0;
  for (let r = 0; r < rows; r++) {
    const z = z0 + (r + 0.5) * cell;
    /** @type {number[]} */
    const xs = [];
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const zi = p[i + 1], zj = p[j + 1];
      if ((zi > z) !== (zj > z)) xs.push(p[i] + ((p[j] - p[i]) * (z - zi)) / (zj - zi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5));
      const to = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let c = from; c <= to; c++) {
        if (!mask[r * cols + c]) inField++;
        mask[r * cols + c] = 1;
      }
    }
  }
  return { grid: { x0, z0, cols, rows }, mask, inField };
}

/**
 * The cells whose middle is inside a convex quad (corners in order), on a
 * field's grid: each one once.
 * @param {FieldCover["grid"]} grid
 * @param {number} cell
 * @param {number[]} q x and z of four corners
 * @param {(index: number) => void} each
 */
function quadCells(grid, cell, q, each) {
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 1; i < 8; i += 2) { zMin = Math.min(zMin, q[i]); zMax = Math.max(zMax, q[i]); }
  const r0 = Math.max(0, Math.ceil((zMin - grid.z0) / cell - 0.5));
  const r1 = Math.min(grid.rows - 1, Math.floor((zMax - grid.z0) / cell - 0.5));
  for (let r = r0; r <= r1; r++) {
    const z = grid.z0 + (r + 0.5) * cell;
    let xMin = Infinity, xMax = -Infinity;
    // where the row's line crosses each edge (both ends of one along it)
    for (let i = 0, j = 6; i < 8; j = i, i += 2) {
      const zi = q[i + 1], zj = q[j + 1];
      if (z < Math.min(zi, zj) || z > Math.max(zi, zj)) continue;
      const xs = zi === zj ? [q[i], q[j]] : [q[i] + ((q[j] - q[i]) * (z - zi)) / (zj - zi)];
      for (const x of xs) {
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
      }
    }
    if (xMin > xMax) continue;
    const c0 = Math.max(0, Math.ceil((xMin - grid.x0) / cell - 0.5));
    const c1 = Math.min(grid.cols - 1, Math.floor((xMax - grid.x0) / cell - 0.5));
    for (let c = c0; c <= c1; c++) each(r * grid.cols + c);
  }
}

/**
 * The trails for one store, kept as the vehicles topic comes in.
 * @param {{get: (key: string) => any, subscribe: (key: string, fn: () => void) => any}} store
 * @param {{maxPoints?: number, cell?: number}} [options]
 */
export function createCoverage(store, { maxPoints = MAX_POINTS, cell = CELL_M } = {}) {
  /** @type {Map<number, FieldCover>} */
  const fields = new Map();
  /** where each tool's open run is: its field, the rig's last spot and band */
  /** @type {Map<number, {field: number, x: number, z: number, w: number, o: number, run: Run}>} */
  const open = new Map();
  /** @type {unknown} */
  let vehicleId;
  /** @type {unknown} */
  let outlines;
  let seq = 0;

  const clear = () => {
    fields.clear();
    open.clear();
  };

  /** @param {FieldOutline} outline */
  function coverOf(outline) {
    let f = fields.get(outline.id);
    if (!f) {
      const { grid, mask, inField } = fieldCells(outline, cell);
      f = { id: outline.id, grid, mask, inField, count: new Uint8Array(mask.length), covered: 0, trails: new Map(),
        points: 0, version: 0 };
      fields.set(outline.id, f);
    }
    return f;
  }

  /** A band from one spot to the next: its cells, for that tool. */
  function paint(/** @type {FieldCover} */ f, /** @type {Trail} */ t, /** @type {number[]} */ a, /** @type {number[]} */ b,
    /** @type {number} */ w) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (!(len > 0) || !(w > 0)) return;
    const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2);
    quadCells(f.grid, cell, [a[0] + nx, a[1] + nz, b[0] + nx, b[1] + nz, b[0] - nx, b[1] - nz, a[0] - nx, a[1] - nz], (i) => {
      if (t.cells[i]) return;
      t.cells[i] = 1;
      if (f.count[i]++ === 0 && f.mask[i]) f.covered++;
    });
  }

  /** The oldest runs lose every other point until the field is under the cap. @param {FieldCover} f */
  function merge(f) {
    while (f.points > maxPoints) {
      const runs = [...f.trails.values()].flatMap((t) => t.runs).sort((a, b) => a.seq - b.seq);
      let dropped = 0;
      for (const run of runs) {
        const n = run.pts.length / 2;
        if (n <= 2) continue;
        /** @type {number[]} */
        const kept = [];
        for (let i = 0; i < n; i++) if (i % 2 === 0 || i === n - 1) kept.push(run.pts[2 * i], run.pts[2 * i + 1]);
        dropped += n - kept.length / 2;
        f.points -= n - kept.length / 2;
        run.pts = kept;
        if (f.points <= maxPoints) break;
      }
      if (!dropped) break;
    }
  }

  /** Forget a tool: its trail on every field. @param {number} id */
  function drop(id) {
    open.delete(id);
    for (const f of fields.values()) {
      const t = f.trails.get(id);
      if (!t) continue;
      for (let i = 0; i < t.cells.length; i++) {
        if (t.cells[i] && --f.count[i] === 0 && f.mask[i]) f.covered--;
      }
      f.points -= t.runs.reduce((sum, r) => sum + r.pts.length / 2, 0);
      f.trails.delete(id);
      f.version++;
    }
  }

  store.subscribe("vehicles", () => {
    const v = controlledVehicle(store);
    const topic = store.get("field_outlines");
    // another map: its trails mean nothing here
    if (topic !== outlines) {
      if (!sameOutlines(topic, outlines)) clear();
      outlines = topic;
    }
    if (v?.id !== vehicleId) {
      vehicleId = v?.id;
      clear();
    }
    if (!v) return;
    const ids = new Set();
    const cab = cabOf(store);
    const x = /** @type {any} */ (v).x, z = /** @type {any} */ (v).z;
    const heading = /** @type {any} */ (v).heading;
    const outline = typeof x === "number" && typeof z === "number" ? fieldAt(store, x, z) : undefined;
    for (const impl of implementsOf(v)) {
      if (typeof impl.id !== "number") continue;
      const id = impl.id;
      ids.add(id);
      const entry = rigEntry(cab, id);
      const state = entry || impl;
      const working = (state.lowered && !isLoaderGear(entry, impl)) || state.turnedOn;
      const wide = typeof impl.workWidth === "number" && impl.workWidth > 0;
      if (!outline || !working || !wide || !((v.speed ?? 0) > MIN_KMH)) {
        open.delete(id);
        continue;
      }
      const f = coverOf(outline);
      let t = f.trails.get(id);
      if (!t) {
        t = { tool: id, kind: /MOWER/i.test(impl.category || "") ? "mow" : "work", runs: [], cells: new Uint8Array(f.mask.length) };
        f.trails.set(id, t);
      }
      const band = bandOf(entry?.width, /** @type {number} */ (impl.workWidth));
      const last = open.get(id);
      const h = typeof heading === "number" ? (heading * Math.PI) / 180
        : last ? Math.atan2(x - last.x, -(z - last.z)) : 0;
      // the band's middle: o metres to the right of the track
      const mid = (/** @type {number} */ o) => [x + o * Math.cos(h), z + o * Math.sin(h)];
      const here = mid(band.o);
      const joined = last && last.field === outline.id && Math.hypot(x - last.x, z - last.z) <= MAX_STEP_M;
      let run = joined ? /** @type {NonNullable<typeof last>} */ (last).run : undefined;
      if (run && (run.w !== band.w || run.o !== band.o || run.pts.length / 2 >= RUN_POINTS)) {
        // a new width (or a long run): a new run from the last spot
        const prev = /** @type {NonNullable<typeof last>} */ (last);
        const from = band.o === run.o ? run.pts.slice(-2)
          : [prev.x + band.o * Math.cos(h), prev.z + band.o * Math.sin(h)];
        run = { w: band.w, o: band.o, pts: from, seq: ++seq };
        t.runs.push(run);
        f.points += 1;
      }
      if (!run) {
        run = { w: band.w, o: band.o, pts: [], seq: ++seq };
        t.runs.push(run);
      }
      const prevPt = run.pts.length ? run.pts.slice(-2) : undefined;
      run.pts.push(here[0], here[1]);
      f.points += 1;
      if (prevPt) paint(f, t, prevPt, here, band.w);
      f.version++;
      open.set(id, { field: outline.id, x, z, w: band.w, o: band.o, run });
      if (f.points > maxPoints) merge(f);
    }
    // detached: its trail is over
    for (const f of fields.values()) for (const id of f.trails.keys()) if (!ids.has(id)) drop(id);
  });

  return {
    /**
     * The trails on a field, a tool each, oldest first.
     * @param {number|undefined} fieldId
     * @returns {{tool: number, kind: "work"|"mow", runs: {w: number, pts: number[]}[]}[]}
     */
    trails(fieldId) {
      const f = fieldId === undefined ? undefined : fields.get(fieldId);
      return f ? [...f.trails.values()].map((t) => ({ tool: t.tool, kind: t.kind, runs: t.runs })) : [];
    },
    /**
     * The share of the field under a trail, 0..100; undefined without one.
     * @param {number|undefined} fieldId
     */
    percent(fieldId) {
      const f = fieldId === undefined ? undefined : fields.get(fieldId);
      if (!f || !f.points || !f.inField) return undefined;
      return (100 * f.covered) / f.inField;
    },
    /** How many points the field's trails hold. @param {number|undefined} fieldId */
    points: (fieldId) => (fieldId === undefined ? 0 : fields.get(fieldId)?.points ?? 0),
    /** Changes whenever the field's trails do: what a drawing goes by. @param {number|undefined} fieldId */
    version: (fieldId) => (fieldId === undefined ? 0 : fields.get(fieldId)?.version ?? 0),
  };
}

/** The same outlines sent again (a snapshot, a rotation): the trails stay. */
function sameOutlines(/** @type {any} */ a, /** @type {any} */ b) {
  const key = (/** @type {any} */ t) => (Array.isArray(t?.fields)
    ? t.fields.map((/** @type {any} */ f) => `${f.id}:${f.points?.length}:${f.points?.[0]}:${f.points?.[1]}`).join("|") : "");
  return key(a) === key(b);
}

/** @type {WeakMap<object, ReturnType<typeof createCoverage>>} */
const shared = new WeakMap();

/**
 * The store's trails, made on first use.
 * @param {Parameters<typeof createCoverage>[0]} store
 */
export function coverageOf(store) {
  let coverage = shared.get(store);
  if (!coverage) {
    coverage = createCoverage(store);
    shared.set(store, coverage);
  }
  return coverage;
}
