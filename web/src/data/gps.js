// @ts-check
// The GPS screen's numbers (specs/0021): what the course the game's
// Steering Assist built says, read from the steering_course topic, and the
// time left from your own times on it.
// - Done is the game's flag, never "behind you" (lanes are skipped by
//   hand), and the segment you're on never counts, whatever its flag says:
//   the game may set it as you start (Vincent, 2026-11-23).
// - A round is done once every piece of it is.
// - The lane you're on fills up to the rig, measured along it from the end
//   the rig drives from, while the rig is within a lane's width of it.
// - Time left is one rate, seconds a metre, from the lanes you finished:
//   only lanes the game marks done as you leave them, only time the rig
//   moves; the turn counts with the lane it leads to (the game moves to the
//   next lane as you reach the end). "–" until two lanes are done.

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
  let lanes = 0, lanesDone = 0;
  /** @type {Map<number, boolean>} round → every piece done */
  const rounds = new Map();
  for (const s of c.segments) {
    const state = stateOf(c, done, s);
    if (typeof s.lane === "number") {
      lanes++;
      if (state === "done") lanesDone++;
    } else if (typeof s.round === "number") {
      rounds.set(s.round, (rounds.get(s.round) ?? true) && state === "done");
    }
  }
  const cur = c.current ? c.segments.find((s) => s.i === c.current?.i) : undefined;
  const on = cur && typeof cur.lane === "number" ? { kind: /** @type {const} */ ("lane"), n: cur.lane }
    : cur && typeof cur.round === "number" ? { kind: /** @type {const} */ ("round"), n: cur.round } : undefined;
  return { lanes, lanesDone, rounds: rounds.size, roundsDone: [...rounds.values()].filter(Boolean).length, on };
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
 * The time left on a course, fed the course and the rig as they come. One
 * per page; `now` (ms) for the tests.
 * @param {{now?: () => number}} [opts]
 */
export function createGpsTimes({ now = () => performance.now() } = {}) {
  /** the course timed, by key */
  let key = /** @type {number|undefined} */ (undefined);
  /** the segment you're on, and the moving seconds spent on it */
  let on = /** @type {number|undefined} */ (undefined);
  let onSeconds = 0;
  let last = /** @type {number|undefined} */ (undefined);
  let moving = false;
  /** lanes finished: seconds and metres, summed */
  let lanes = 0, seconds = 0, metres = 0;

  /**
   * The course as it is now (its done flags, the segment you're on), and
   * whether the rig moves.
   * @param {SteeringCourse|undefined} c @param {number|undefined} speedKmh
   */
  function feed(c, speedKmh) {
    const t = now();
    if (last !== undefined && moving && on !== undefined) onSeconds += (t - last) / 1000;
    last = t;
    moving = typeof speedKmh === "number" && speedKmh > MOVING_KMH;
    if (!c) {
      // the course went: the next one starts again, whatever its key
      key = undefined;
      return;
    }
    if (c.key !== key) {
      key = c.key;
      on = c.current?.i;
      onSeconds = 0;
      lanes = seconds = metres = 0;
      return;
    }
    const next = c.current?.i;
    if (next === on) return;
    // left `on`: a lane the game marks done counts, with its turn in
    const left = c.segments.find((s) => s.i === on);
    if (left && typeof left.lane === "number" && (c.done || []).includes(left.i) && onSeconds > 0) {
      lanes++;
      seconds += onSeconds;
      metres += lengthOf(left.pts);
    }
    on = next;
    onSeconds = 0;
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
