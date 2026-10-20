// @ts-check
// Farmland outlines from the farmland_grid topic (FarmlandGrid.lua): a grid
// of farmland ids, run-length encoded. Pure functions, tested in test.html.
//
// 1. decodeGrid: runs -> one id per cell, row by row (x first, then z)
// 2. traceOutlines: per farmland, the closed rings along the cell edges
//    between it and anything else. Rings are walked with the farmland on
//    the same side, so outer rings and holes come out together; drawn with
//    the even-odd rule (Leaflet's default) they fill exactly the cells.
// 3. simplifyRing: the cell edges are 4 m staircases; Douglas-Peucker with
//    a tolerance under one cell turns them into straight slopes.

/** @typedef {import("../types.js").FarmlandGrid} FarmlandGrid */
/** @typedef {[number, number]} Point */

/**
 * @param {FarmlandGrid} grid
 * @returns {Uint16Array} farmland id per cell, 0 = none
 */
export function decodeGrid(grid) {
  const total = grid.cols * grid.rows;
  const cells = new Uint16Array(total);
  let i = 0;
  for (let k = 0; k + 1 < grid.runs.length; k += 2) {
    const n = grid.runs[k + 1];
    if (i + n > total) throw new Error("farmland grid runs overflow the grid");
    cells.fill(grid.runs[k], i, i + n);
    i += n;
  }
  if (i !== total) throw new Error(`farmland grid runs cover ${i} of ${total} cells`);
  return cells;
}

/**
 * Rings of every farmland in grid vertex coordinates: vertex (c, r) is the
 * corner at column c, row r. Only corners are kept (no points in the
 * middle of a straight edge). A ring isn't repeated at its end.
 * @param {Uint16Array} cells
 * @param {number} cols
 * @param {number} rows
 * @returns {Map<number, Point[][]>} farmland id -> rings
 */
export function traceOutlines(cells, cols, rows) {
  const stride = cols + 1;
  /** @type {Map<number, Map<number, number[]>>} id -> start vertex -> end vertices */
  const edges = new Map();
  const add = (/** @type {number} */ id, /** @type {number} */ from, /** @type {number} */ to) => {
    let byStart = edges.get(id);
    if (!byStart) edges.set(id, (byStart = new Map()));
    const ends = byStart.get(from);
    if (ends) ends.push(to);
    else byStart.set(from, [to]);
  };
  // clockwise on screen (rows grow down) around each cell: top, right,
  // bottom, left; only the sides facing a different id
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = cells[r * cols + c];
      if (id === 0) continue;
      const tl = r * stride + c, tr = tl + 1, bl = tl + stride, br = bl + 1;
      if (r === 0 || cells[(r - 1) * cols + c] !== id) add(id, tl, tr);
      if (c === cols - 1 || cells[r * cols + c + 1] !== id) add(id, tr, br);
      if (r === rows - 1 || cells[(r + 1) * cols + c] !== id) add(id, br, bl);
      if (c === 0 || cells[r * cols + c - 1] !== id) add(id, bl, tl);
    }
  }

  /** @type {Map<number, Point[][]>} */
  const out = new Map();
  for (const [id, byStart] of edges) {
    /** @type {Point[][]} */
    const rings = [];
    for (const [start, ends] of byStart) {
      while (ends.length) {
        /** @type {Point[]} */
        const ring = [];
        let from = start;
        let to = /** @type {number} */ (ends.pop());
        let dir = to - from;
        ring.push([from % stride, Math.floor(from / stride)]);
        // where two corners touch, a vertex has two ways on; any pairing
        // gives the same filled area under the even-odd rule
        while (to !== start) {
          const next = byStart.get(to);
          // can't happen: every boundary vertex has as many ways in as out
          if (!next?.length) break;
          const step = /** @type {number} */ (next.pop());
          const ndir = step - to;
          if (ndir !== dir) ring.push([to % stride, Math.floor(to / stride)]);
          from = to;
          to = step;
          dir = ndir;
        }
        if (ring.length >= 3) rings.push(ring);
      }
    }
    out.set(id, rings);
  }
  return out;
}

/** distance from p to the segment a-b */
function segmentDistance(/** @type {Point} */ p, /** @type {Point} */ a, /** @type {Point} */ b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Douglas-Peucker on a closed ring (iterative: rings can be long).
 * @param {Point[]} ring not repeated at its end
 * @param {number} tolerance in the ring's units
 * @returns {Point[]} fewer than 3 points when the ring collapses
 */
export function simplifyRing(ring, tolerance) {
  const n = ring.length;
  if (n <= 4) return ring;
  // split at the vertex farthest from the first: two open chains
  let far = 0, farD = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farD) [far, farD] = [i, d];
  }
  const pts = [...ring, ring[0]];
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = keep[n] = 1;
  /** @type {[number, number][]} */
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = /** @type {[number, number]} */ (stack.pop());
    let best = -1, bestD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(pts[i], pts[a], pts[b]);
      if (d > bestD) [best, bestD] = [i, d];
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  /** @type {Point[]} */
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

/** Twice the signed area of a ring (shoelace), in its units squared. */
export function ringArea2(/** @type {Point[]} */ ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return a;
}

/**
 * Farmland outlines in world meters, simplified.
 * @param {FarmlandGrid} grid
 * @param {number} [toleranceCells] Douglas-Peucker tolerance, in cells
 * @returns {Map<number, {x: number, z: number}[][]>} farmland id -> rings
 */
export function farmlandOutlines(grid, toleranceCells = 0.75) {
  const traced = traceOutlines(decodeGrid(grid), grid.cols, grid.rows);
  /** @type {Map<number, {x: number, z: number}[][]>} */
  const out = new Map();
  for (const [id, rings] of traced) {
    const world = [];
    for (const ring of rings) {
      const simple = simplifyRing(ring, toleranceCells);
      if (simple.length < 3 || Math.abs(ringArea2(simple)) < 1) continue;
      world.push(simple.map(([c, r]) => ({ x: grid.originX + c * grid.cell, z: grid.originZ + r * grid.cell })));
    }
    if (world.length) out.set(id, world);
  }
  return out;
}
