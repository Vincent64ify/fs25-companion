// @ts-check
// The GPS screen's numbers (specs/0021): what the course the game's
// Steering Assist built says, read from the steering_course topic, and the
// time left from your own times on it.
// - Done is the game's flag, never "behind you" (lanes are skipped by
//   hand), and the segment you're on never counts, whatever its flag says:
//   the game may set it as you start (Vincent, 2026-11-23).
// - A lane or a round is done once every piece of it is (the game cuts a
//   lane crossing a notch in two pieces with one number: field 6).
// - The lane you're on fills up to the rig, measured along it from the end
//   the rig drives from, while the rig is within a lane's width of it.
// - Time left is one rate, seconds a metre, from the lanes you finished:
//   only lanes the game marks done as you leave them, each once, and only
//   once you drove half of it (the lane under you flickers across the round
//   and its neighbours in a turn: live check, 2026-11-23); only time the
//   rig moves; every second since the last lane timed, the turn included,
//   counts with the next (the game moves to the next lane as you reach the
//   end). "–" until two lanes are done.

import { cabOf, controlledVehicle } from "./selectors.js";

/** @typedef {import("../types.js").SteeringCourse} SteeringCourse */
/** @typedef {import("../types.js").CourseSegment} CourseSegment */
/** @typedef {{get: (key: string) => any}} StoreLike */

// the rig moves: faster than this (as the trail, data/coverage.js)
export const MOVING_KMH = 0.5;
// lanes finished before the time left shows
export const LANES_FOR_TIME = 2;
// a lane width the topic doesn't give
const DEFAULT_WIDTH_M = 6;
// a round's pieces meet within this (they meet to the centimetre on fields 6 and 7)
const JOINT_M = 0.05;

/**
 * The course on screen: the topic while its key is the cab's courseKey (the
 * store keeps the last topic after the course goes), else undefined.
 * @param {StoreLike} store
 * @returns {SteeringCourse|undefined}
 */
export function courseOf(store) {
  const key = cabOf(store)?.steering?.courseKey;
  const topic = store.get("steering_course");
  if (key === undefined || !topic || topic.key !== key || !Array.isArray(topic.segments)) return undefined;
  return topic;
}

/** The lanes' spacing, metres. @param {SteeringCourse} c */
export const widthOf = (c) => (typeof c.width === "number" && c.width > 0 ? c.width : DEFAULT_WIDTH_M);

/** A polyline's length, metres. @param {number[]} pts */
export function lengthOf(pts) {
  let len = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

/**
 * A segment's state on screen: the one you're on is "current" whatever
 * its flag; else "done" by the game's flag, or "todo".
 * @param {SteeringCourse} c @param {Set<number>} done @param {CourseSegment} s
 * @returns {"done"|"current"|"todo"}
 */
export function stateOf(c, done, s) {
  if (c.current?.i === s.i) return "current";
  return done.has(s.i) ? "done" : "todo";
}

/**
 * The counts over the field.
 * @param {SteeringCourse} c
 * @returns {{lanes: number, lanesDone: number, rounds: number, roundsDone: number,
 *   on: {kind: "lane"|"round", n: number}|undefined}}
 */
export function countsOf(c) {
  const done = new Set(c.done || []);
  /** @type {Map<number, boolean>} lane → every piece done (the game cuts a lane crossing a notch in pieces with one number) */
  const lanes = new Map();
  /** @type {Map<number, boolean>} round → every piece done */
  const rounds = new Map();
  for (const s of c.segments) {
    const state = stateOf(c, done, s);
    if (typeof s.lane === "number") {
      lanes.set(s.lane, (lanes.get(s.lane) ?? true) && state === "done");
    } else if (typeof s.round === "number") {
      rounds.set(s.round, (rounds.get(s.round) ?? true) && state === "done");
    }
  }
  const cur = c.current ? c.segments.find((s) => s.i === c.current?.i) : undefined;
  const on = cur && typeof cur.lane === "number" ? { kind: /** @type {const} */ ("lane"), n: cur.lane }
    : cur && typeof cur.round === "number" ? { kind: /** @type {const} */ ("round"), n: cur.round } : undefined;
  return { lanes: lanes.size, lanesDone: [...lanes.values()].filter(Boolean).length, rounds: rounds.size, roundsDone: [...rounds.values()].filter(Boolean).length, on };
}

/**
 * How far along a segment the rig is, 0..1, from the end it drives from
 * (its heading against the segment's direction where it is), and whether
 * that is the polyline's first end. 0 when the rig is farther than `near`
 * metres from it.
 * @param {number[]} pts @param {{x: number, z: number, heading?: number}} rig heading: 0 north (-z), clockwise
 * @param {number} near
 * @returns {{t: number, fromStart: boolean, at: [number, number]|undefined}}
 */
export function progressAlong(pts, rig, near) {
  const total = lengthOf(pts);
  let best = Infinity, bestAt = 0, dir = [1, 0], at = /** @type {[number, number]|undefined} */ (undefined);
  let walked = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const ax = pts[i - 2], az = pts[i - 1], dx = pts[i] - ax, dz = pts[i + 1] - az;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      const u = Math.max(0, Math.min(1, ((rig.x - ax) * dx + (rig.z - az) * dz) / (len * len)));
      const px = ax + dx * u, pz = az + dz * u;
      const d = Math.hypot(rig.x - px, rig.z - pz);
      if (d < best) {
        best = d;
        bestAt = walked + u * len;
        dir = [dx / len, dz / len];
        at = [px, pz];
      }
    }
    walked += len;
  }
  const h = ((rig.heading ?? 0) * Math.PI) / 180;
  const fromStart = Math.sin(h) * dir[0] - Math.cos(h) * dir[1] >= 0;
  if (!(total > 0) || best > near) return { t: 0, fromStart, at: undefined };
  const t = bestAt / total;
  return { t: fromStart ? t : 1 - t, fromStart, at };
}

/**
 * The lane you're on, filled: how far along, and the polyline from the end
 * the rig drives from up to it. Undefined without a rig on it.
 * @param {SteeringCourse} c @param {{x: number, z: number, heading?: number}|undefined} rig
 * @returns {{t: number, pts: number[]}|undefined}
 */
export function fillOf(c, rig) {
  const cur = c.current ? c.segments.find((s) => s.i === c.current?.i) : undefined;
  if (!cur || !rig || typeof rig.x !== "number" || typeof rig.z !== "number") return undefined;
  const p = progressAlong(cur.pts, rig, widthOf(c));
  if (!p.at || p.t <= 0) return { t: 0, pts: [] };
  // the polyline from the start end up to the rig's place on it
  const pts = p.fromStart ? cur.pts : reversed(cur.pts);
  const want = p.t * lengthOf(pts);
  const out = [pts[0], pts[1]];
  let walked = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const len = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (walked + len >= want) {
      const k = len > 0 ? (want - walked) / len : 0;
      out.push(pts[i - 2] + (pts[i] - pts[i - 2]) * k, pts[i - 1] + (pts[i + 1] - pts[i - 1]) * k);
      return { t: p.t, pts: out };
    }
    walked += len;
    out.push(pts[i], pts[i + 1]);
  }
  return { t: p.t, pts: out };
}

/** A flat polyline the other way round. @param {number[]} pts */
function reversed(pts) {
  const out = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
}

/**
 * The headland rounds, each one closed loop: its pieces end to end in the
 * game's order (they meet to the centimetre: fields 6 and 7), the joint
 * points once, the last one dropped when it closes on the first.
 * @param {SteeringCourse} c
 * @returns {{round: number, pts: number[], starts: number[], pieces: number[]}[]}
 *   starts: the loop point each piece begins at; pieces: their segment indices
 */
export function roundLoopsOf(c) {
  /** @type {Map<number, CourseSegment[]>} */
  const byRound = new Map();
  for (const s of c.segments) {
    if (typeof s.round !== "number" || s.pts.length < 4) continue;
    if (!byRound.has(s.round)) byRound.set(s.round, []);
    /** @type {CourseSegment[]} */ (byRound.get(s.round)).push(s);
  }
  return [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([round, pcs]) => {
    /** @type {number[]} */
    const pts = [];
    /** @type {number[]} */
    const starts = [];
    for (const s of pcs) {
      const n = pts.length / 2;
      const joins = n > 0 && Math.hypot(s.pts[0] - pts[2 * n - 2], s.pts[1] - pts[2 * n - 1]) < JOINT_M;
      starts.push(joins ? n - 1 : n);
      pts.push(...(joins ? s.pts.slice(2) : s.pts));
    }
    const n = pts.length / 2;
    if (n > 2 && Math.hypot(pts[0] - pts[2 * n - 2], pts[1] - pts[2 * n - 1]) < JOINT_M) pts.length -= 2;
    return { round, pts, starts, pieces: pcs.map((s) => s.i) };
  });
}

/**
 * A round's pieces in runs of one state. A whole round is one run with no
 * sector; else each run's sector, the loop's polygon cut on the corner's
 * bisector at the run's two joints, `w` × 1.5 either side of the loop, to
 * clip the loop's stroke to.
 * @param {{pts: number[], starts: number[]}} loop @param {string[]} states a piece each @param {number} w
 * @returns {{state: string, sector: number[]|undefined}[]}
 */
export function roundRuns(loop, states, w) {
  const k = states.length;
  if (states.every((x) => x === states[0])) return [{ state: states[0], sector: undefined }];
  const L = loop.pts, n = L.length / 2;
  /** the corner's bisector at loop point j, a unit vector to the loop's left */
  const bis = (/** @type {number} */ j) => {
    const a = (j - 1 + n) % n, b = (j + 1) % n;
    const u1x = L[2 * j] - L[2 * a], u1z = L[2 * j + 1] - L[2 * a + 1], l1 = Math.hypot(u1x, u1z) || 1;
    const u2x = L[2 * b] - L[2 * j], u2z = L[2 * b + 1] - L[2 * j + 1], l2 = Math.hypot(u2x, u2z) || 1;
    const mx = -u1z / l1 - u2z / l2, mz = u1x / l1 + u2x / l2, ml = Math.hypot(mx, mz) || 1;
    return [mx / ml, mz / ml];
  };
  const reach = w * 1.5;
  const first = states.findIndex((x, i) => x !== states[(i - 1 + k) % k]);
  /** @type {{state: string, sector: number[]|undefined}[]} */
  const runs = [];
  for (let c = 0; c < k;) {
    const a = (first + c) % k;
    let len = 1;
    while (len < k && states[(a + len) % k] === states[a]) len++;
    const from = loop.starts[a], to = loop.starts[(a + len) % k] % n;
    /** @type {number[]} */
    const idx = [];
    for (let j = from; idx.length <= n; j = (j + 1) % n) {
      idx.push(j);
      if (j === to && idx.length > 1) break;
    }
    /** @type {number[]} */
    const left = [], right = [];
    for (const j of idx) {
      const [mx, mz] = bis(j);
      left.push(L[2 * j] + mx * reach, L[2 * j + 1] + mz * reach);
      right.unshift(L[2 * j] - mx * reach, L[2 * j + 1] - mz * reach);
    }
    runs.push({ state: states[a], sector: left.concat(right) });
    c += len;
  }
  return runs;
}

/**
 * A lane's polyline run out `w` metres past each end along its end pieces,
 * so its strip can be cut flush by the round it ends in.
 * @param {number[]} pts @param {number} w
 */
export function runOut(pts, w) {
  const n = pts.length / 2;
  if (n < 2) return pts.slice();
  const ax = pts[2] - pts[0], az = pts[3] - pts[1], al = Math.hypot(ax, az) || 1;
  const bx = pts[2 * n - 2] - pts[2 * n - 4], bz = pts[2 * n - 1] - pts[2 * n - 3], bl = Math.hypot(bx, bz) || 1;
  const out = pts.slice();
  out[0] = pts[0] - (ax / al) * w;
  out[1] = pts[1] - (az / al) * w;
  out[2 * n - 2] = pts[2 * n - 2] + (bx / bl) * w;
  out[2 * n - 1] = pts[2 * n - 1] + (bz / bl) * w;
  return out;
}

/**
 * A polyline moved `d` metres to its left (its normal (−dz, dx); − moves it
 * right), mitred at its joints: a lane's edge, half its width out
 * (specs/0021 revision 3).
 * @param {number[]} pts @param {number} d
 */
export function offsetLine(pts, d) {
  const n = pts.length / 2;
  /** the unit left normal of the piece from point i to i + 1 */
  const nrm = (/** @type {number} */ i) => {
    const dx = pts[2 * i + 2] - pts[2 * i], dz = pts[2 * i + 3] - pts[2 * i + 1], l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? nrm(i - 1) : undefined, b = i < n - 1 ? nrm(i) : undefined;
    let m = a && b ? [a[0] + b[0], a[1] + b[1]] : /** @type {number[]} */ (a || b);
    const ml = Math.hypot(m[0], m[1]) || 1;
    m = [m[0] / ml, m[1] / ml];
    // the mitre: as far out as keeps both pieces d away (capped at a sharp turn)
    const c = a && b ? Math.max(0.25, m[0] * a[0] + m[1] * a[1]) : 1;
    out.push(pts[2 * i] + (m[0] * d) / c, pts[2 * i + 1] + (m[1] * d) / c);
  }
  return out.map((v) => Math.round(v * 1e6) / 1e6);
}

// --- revision 4: the close-up at the lane's end ------------------------------------

/** Auto's rule: close from the last `endM` of a lane, back once settled on one (within half a width, heading
 * along it within `headingDeg`) for `settleMs`; only while lanes are under `helpsPx` in the whole field */
export const AUTO_ZOOM = { endM: 40, settleMs: 3000, headingDeg: 15, helpsPx: 16 };

/**
 * Auto's state, fed the course, the rig and how wide a lane is in the
 * whole-field view, as they come; says whether the close-up shows. `now`
 * (ms) for the tests.
 * @param {{now?: () => number}} [opts]
 */
export function createAutoZoom({ now = () => performance.now() } = {}) {
  let zoomed = false;
  let settledSince = /** @type {number|undefined} */ (undefined);
  return {
    /**
     * @param {SteeringCourse|undefined} c
     * @param {{x: number, z: number, heading?: number}|undefined} rig
     * @param {number} lanePx a lane's width in the whole-field view
     */
    feed(c, rig, lanePx) {
      if (!c || !rig || !(lanePx < AUTO_ZOOM.helpsPx)) {
        zoomed = false;
        settledSince = undefined;
        return false;
      }
      const w = widthOf(c);
      const cur = c.current ? c.segments.find((s) => s.i === c.current?.i) : undefined;
      const lane = cur && typeof cur.lane === "number" && cur.pts.length >= 4 ? cur : undefined;
      // how far to the lane's end the rig drives to, while it is on the lane
      const left = (/** @type {number} */ near) => {
        if (!lane) return undefined;
        const p = progressAlong(lane.pts, rig, near);
        return p.at ? (1 - p.t) * lengthOf(lane.pts) : undefined;
      };
      if (!zoomed) {
        const l = left(w);
        if (l !== undefined && l <= AUTO_ZOOM.endM) {
          zoomed = true;
          settledSince = undefined;
        }
        return zoomed;
      }
      // settled: on a lane, within half a width of it, heading along it, and not at its end already
      const l = left(w / 2);
      let aligned = false;
      if (lane && l !== undefined) {
        const n = lane.pts.length;
        const dx = lane.pts[n - 2] - lane.pts[0], dz = lane.pts[n - 1] - lane.pts[1], len = Math.hypot(dx, dz) || 1;
        const h = ((rig.heading ?? 0) * Math.PI) / 180;
        aligned = Math.abs((Math.sin(h) * dx - Math.cos(h) * dz) / len) >= Math.cos((AUTO_ZOOM.headingDeg * Math.PI) / 180);
      }
      if (aligned && /** @type {number} */ (l) > AUTO_ZOOM.endM) {
        settledSince ??= now();
        if (now() - settledSince >= AUTO_ZOOM.settleMs) {
          zoomed = false;
          settledSince = undefined;
        }
      } else settledSince = undefined;
      return zoomed;
    },
  };
}

/**
 * The close-up's view, world metres [x, z, w, h] in the box's shape: about
 * nine lanes across its short side, at least 30 m; north up; the rig a
 * third in from where it came, so the lane's end and the headland are ahead.
 * @param {{x: number, z: number, heading?: number}} rig @param {number} w the lanes' width
 * @param {number} boxW @param {number} boxH
 * @returns {[number, number, number, number]}
 */
export function closeView(rig, w, boxW, boxH) {
  const span = Math.max(9 * w, 30);
  const wide = boxW >= boxH;
  const vw = wide ? (span * boxW) / boxH : span, vh = wide ? span : (span * boxH) / boxW;
  const h = ((rig.heading ?? 0) * Math.PI) / 180, hx = Math.sin(h), hz = -Math.cos(h);
  const ahead = 0.2 * (Math.abs(hx) * vw + Math.abs(hz) * vh);
  const cx = rig.x + hx * ahead, cz = rig.z + hz * ahead;
  return [cx - vw / 2, cz - vh / 2, vw, vh];
}

/**
 * The lanes' numbers for the close-up: each lane's end nearer the rig (its
 * first piece's, by number), where it is in the view, with the direction
 * into the lane and the lane's state.
 * @param {SteeringCourse} c @param {{x: number, z: number}} rig @param {number[]} view [x, z, w, h]
 * @returns {{n: number, x: number, z: number, ux: number, uz: number, state: string}[]}
 */
export function laneNumbersOf(c, rig, view) {
  const done = new Set(c.done || []);
  const seen = new Set();
  const out = [];
  for (const s of c.segments) {
    if (typeof s.lane !== "number" || seen.has(s.lane) || s.pts.length < 4) continue;
    seen.add(s.lane);
    const n = s.pts.length;
    const a = [s.pts[0], s.pts[1]], b = [s.pts[n - 2], s.pts[n - 1]];
    const nearA = Math.hypot(a[0] - rig.x, a[1] - rig.z) <= Math.hypot(b[0] - rig.x, b[1] - rig.z);
    const [e, f] = nearA ? [a, b] : [b, a];
    if (e[0] < view[0] || e[0] > view[0] + view[2] || e[1] < view[1] || e[1] > view[1] + view[3]) continue;
    const l = Math.hypot(f[0] - e[0], f[1] - e[1]) || 1;
    out.push({ n: s.lane, x: e[0], z: e[1], ux: (f[0] - e[0]) / l, uz: (f[1] - e[1]) / l, state: stateOf(c, done, s) });
  }
  return out.sort((p, q) => p.n - q.n);
}

/**
 * The time left on a course, fed the course and the rig as they come. One
 * per page; `now` (ms) for the tests.
 * @param {{now?: () => number}} [opts]
 */
export function createGpsTimes({ now = () => performance.now() } = {}) {
  /** the course timed, by key */
  let key = /** @type {number|undefined} */ (undefined);
  /** the segment you're on */
  let on = /** @type {number|undefined} */ (undefined);
  let last = /** @type {number|undefined} */ (undefined);
  let lastKmh = 0;
  /** moving seconds since the last lane timed, and per segment the seconds and metres driven on it since */
  let pending = 0;
  /** @type {Map<number, {s: number, m: number}>} */
  let driven = new Map();
  /** the lanes timed on this course */
  let timed = new Set();
  /** lanes finished: seconds and metres, summed */
  let lanes = 0, seconds = 0, metres = 0;

  /**
   * The course as it is now (its done flags, the segment you're on), and
   * whether the rig moves.
   * @param {SteeringCourse|undefined} c @param {number|undefined} speedKmh
   */
  function feed(c, speedKmh) {
    const t = now();
    if (last !== undefined && lastKmh > MOVING_KMH && on !== undefined && t > last) {
      const dt = (t - last) / 1000;
      pending += dt;
      const d = driven.get(on) || { s: 0, m: 0 };
      d.s += dt;
      d.m += (lastKmh / 3.6) * dt;
      driven.set(on, d);
    }
    last = t;
    lastKmh = typeof speedKmh === "number" ? speedKmh : 0;
    if (!c) {
      // the course went: the next one starts again, whatever its key
      key = undefined;
      return;
    }
    if (c.key !== key) {
      key = c.key;
      on = c.current?.i;
      pending = 0;
      driven = new Map();
      timed = new Set();
      lanes = seconds = metres = 0;
      return;
    }
    const next = c.current?.i;
    if (next === on) return;
    // left `on`: a lane the game marks done, not timed yet, half of it driven
    const left = c.segments.find((s) => s.i === on);
    const d = on === undefined ? undefined : driven.get(on);
    if (left && typeof left.lane === "number" && !timed.has(left.i) && (c.done || []).includes(left.i) && d) {
      const len = lengthOf(left.pts);
      if (len > 0 && d.m >= len / 2) {
        timed.add(left.i);
        lanes++;
        // the first lane: only its own seconds (before it you may have driven to the field)
        seconds += lanes === 1 ? d.s : pending;
        metres += len;
        pending = 0;
        driven = new Map();
      }
    }
    on = next;
  }

  /**
   * Minutes left, or undefined until LANES_FOR_TIME lanes are done: the
   * metres of the segments not done, less the part of the one you're on
   * done (`fill`, 0..1), at your rate.
   * @param {SteeringCourse|undefined} c @param {number} [fill]
   */
  function minutesLeft(c, fill = 0) {
    if (!c || c.key !== key || lanes < LANES_FOR_TIME || !(metres > 0)) return undefined;
    const done = new Set(c.done || []);
    let left = 0;
    for (const s of c.segments) {
      const state = stateOf(c, done, s);
      if (state === "done") continue;
      const len = lengthOf(s.pts);
      left += state === "current" ? len * (1 - Math.max(0, Math.min(1, fill))) : len;
    }
    return (left * (seconds / metres)) / 60;
  }

  return { feed, minutesLeft, lanesTimed: () => lanes };
}

/**
 * What the screen shows: the course, or the words saying why there's none.
 * `dim` while the course stays off the field (the game keeps it).
 * @param {StoreLike} store
 * @returns {{course: SteeringCourse|undefined, words: string, dim: boolean, building: boolean}}
 */
export function gpsState(store) {
  const cab = cabOf(store);
  const none = (/** @type {string} */ words, building = false) => ({ course: undefined, words, dim: false, building });
  if (!cab || cab.inVehicle === false || !controlledVehicle(store)) return none("Get into a vehicle");
  const s = cab.steering;
  if (!s) return none("No Steering Assist on this vehicle");
  if (s.mode !== "steeringAssist") return none("Steering Assist is off for this tractor");
  const course = courseOf(store);
  if (!course) return s.onField ? none("Building the lanes…", true) : none("Drive onto a field you may work");
  if (s.onField === false) return { course, words: "Drive onto a field you may work", dim: true, building: false };
  if (!course.current) return { course, words: "No lane here", dim: false, building: false };
  return { course, words: "", dim: false, building: false };
}
