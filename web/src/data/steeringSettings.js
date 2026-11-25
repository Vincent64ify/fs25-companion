// @ts-check
// Steering Assist's settings (specs/0022): the panel's draft against the
// game's settings (cab.steering.settings), the steps, the words, what Apply
// and the preview send. Pure: the column (widgets/steeringSettings.js) and
// the GPS screen's preview share it through the store's "gpsSetup" key.
//
// - Auto as the game has it (spike 0.0.19): width, headlands and offset are
//   Auto when the value is the tool's own (no flag); the direction's Auto is
//   a choice of its own, the game picking the angle for the field.
// - The direction is one of the game dialog's choices: 0° to 175° in 5°
//   steps (Vincent, 2026-11-24); leaving Auto it starts from the angle the
//   game's lanes run at, and 175° steps on to 0° (lanes have no way round).
// - The settings attribute: "width=6.6;headlands=auto;direction=45;offset=-0.4",
//   rows in this order, a number or auto each (the companion checks its
//   shape, the mod each row). The preview's topic echoes it as `for`.

/** @typedef {import("../types.js").SteeringSettings} SteeringSettings */
/** @typedef {import("../types.js").SteeringCourse} SteeringCourse */

/**
 * The panel's settings, or the game's as the panel reads them.
 * @typedef {Object} Draft
 * @property {{m: number|undefined, auto: boolean}} width m undefined: Auto, its width not known
 * @property {{count: number|undefined, auto: boolean}} headlands
 * @property {{deg: number|undefined, auto: boolean}} direction deg undefined on Auto
 * @property {{m: number, auto: boolean}} offset − left, + right
 * @property {boolean|undefined} lines Show lines
 * @property {boolean|undefined} cruise Cruise Control Deactivation: true Automatic
 */

/** @typedef {"width"|"headlands"|"direction"|"offset"} CourseRow */
/** @typedef {CourseRow|"lines"|"cruise"} Row */

/** the course rows, in the attribute's order */
export const COURSE_ROWS = /** @type {CourseRow[]} */ (["width", "headlands", "direction", "offset"]);
export const ROWS = /** @type {Row[]} */ ([...COURSE_ROWS, "lines", "cruise"]);
/** the game dialog's ranges when the mod sends none */
export const RANGES = { width: [0.5, 60], headlands: [1, 4], offset: [-5, 5] };
export const DIRECTION_STEP = 5;
export const DIRECTION_MAX = 175;
/** the preview is asked for this long after the last change (spec 0022) */
export const PREVIEW_DELAY_MS = 500;

const r1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;
const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));

/**
 * The game's settings as a draft.
 * @param {SteeringSettings} s
 * @returns {Draft}
 */
export function draftOf(s) {
  return {
    width: { m: s.width.m, auto: s.width.auto },
    headlands: { count: s.headlands.count, auto: s.headlands.auto },
    direction: { deg: s.direction.auto ? undefined : s.direction.deg, auto: s.direction.auto },
    offset: { m: s.offset.m ?? 0, auto: s.offset.auto },
    lines: s.showLines,
    cruise: s.cruiseOff,
  };
}

/** @param {Draft} d @returns {Draft} */
export const copyDraft = (d) => JSON.parse(JSON.stringify(d));

/**
 * Whether a row says the same in both: values compared where both are
 * known (5.0 m set is the tool's 5.0 m Auto, as the game has it).
 * @param {Row} row @param {Draft} a @param {Draft} b
 */
export function sameRow(row, a, b) {
  if (row === "width") {
    if (a.width.m !== undefined && b.width.m !== undefined) return Math.abs(a.width.m - b.width.m) < 0.05;
    return a.width.auto === b.width.auto;
  }
  if (row === "headlands") {
    if (a.headlands.count !== undefined && b.headlands.count !== undefined) return a.headlands.count === b.headlands.count;
    return a.headlands.auto === b.headlands.auto;
  }
  if (row === "direction") return a.direction.auto ? b.direction.auto : !b.direction.auto && a.direction.deg === b.direction.deg;
  if (row === "offset") return Math.abs(a.offset.m - b.offset.m) < 0.05;
  return a[row] === b[row];
}

/** @param {SteeringSettings|undefined} s @param {"width"|"headlands"|"offset"} row */
function rangeOf(s, row) {
  const r = s?.[row];
  const [lo, hi] = RANGES[row];
  return [typeof r?.min === "number" ? r.min : lo, typeof r?.max === "number" ? r.max : hi];
}

/**
 * The angle the game's lanes run at, to the nearest of the dialog's steps
 * (0 to 175): where the direction starts when it leaves Auto.
 * @param {SteeringCourse|undefined} course
 */
export function laneAngle(course) {
  let best = 0, angle = 0;
  for (const s of course?.segments || []) {
    if (typeof s.lane !== "number" || s.pts.length < 4) continue;
    const dx = s.pts[s.pts.length - 2] - s.pts[0], dz = s.pts[s.pts.length - 1] - s.pts[1];
    const len = Math.hypot(dx, dz);
    if (len > best) {
      best = len;
      angle = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 180;
    }
  }
  return (Math.round(angle / DIRECTION_STEP) * DIRECTION_STEP) % 180;
}

/**
 * A step on a row, as the panel's −/+ do: width ±0.1 and ±1 m, headlands ±1,
 * direction ±5° round the dialog's choices, offset ±0.1 m; within the
 * game's range. Landing on the tool's own value (known while the game is on
 * Auto) is Auto, as in the game.
 * @param {Draft} d @param {CourseRow} row @param {number} by
 * @param {SteeringSettings|undefined} game @param {SteeringCourse} [course] for the direction's start
 * @returns {Draft}
 */
export function step(d, row, by, game, course) {
  const out = copyDraft(d);
  if (row === "width") {
    const [lo, hi] = rangeOf(game, "width");
    const m = clamp(r1((d.width.m ?? game?.width.m ?? 6) + by), lo, hi);
    out.width = { m, auto: !!game?.width.auto && game.width.m !== undefined && Math.abs(game.width.m - m) < 0.05 };
  } else if (row === "headlands") {
    const [lo, hi] = rangeOf(game, "headlands");
    const count = clamp(Math.round((d.headlands.count ?? game?.headlands.count ?? 1) + by), lo, hi);
    out.headlands = { count, auto: !!game?.headlands.auto && game.headlands.count === count };
  } else if (row === "direction") {
    const from = d.direction.auto || d.direction.deg === undefined ? laneAngle(course) : d.direction.deg;
    out.direction = { deg: (((from + by) % 180) + 180) % 180, auto: false };
  } else {
    const [lo, hi] = rangeOf(game, "offset");
    const m = clamp(r1(d.offset.m + by), lo, hi);
    out.offset = { m: m === 0 ? 0 : m, auto: m === 0 };
  }
  return out;
}

/**
 * A row back to Auto: the tool's own value where the game shows it.
 * @param {Draft} d @param {CourseRow} row @param {SteeringSettings|undefined} game
 * @returns {Draft}
 */
export function toAuto(d, row, game) {
  const out = copyDraft(d);
  if (row === "width") out.width = { m: game?.width.auto ? game.width.m : undefined, auto: true };
  else if (row === "headlands") out.headlands = { count: game?.headlands.auto ? game.headlands.count : undefined, auto: true };
  else if (row === "direction") out.direction = { deg: undefined, auto: true };
  else out.offset = { m: 0, auto: true };
  return out;
}

/**
 * Reset, as the game's dialog: the four course rows to Auto; Show lines and
 * Cruise as they are.
 * @param {Draft} d @param {SteeringSettings|undefined} game
 */
export function reset(d, game) {
  return COURSE_ROWS.reduce((acc, row) => toAuto(acc, row, game), d);
}

/** Whether a row is Auto in the draft. @param {Draft} d @param {CourseRow} row */
export const isAuto = (d, row) => d[row].auto;

// the words ------------------------------------------------------------------

const metres = (/** @type {number} */ m) => `${(Math.abs(m) < 0.05 ? 0 : m).toFixed(1)} m`;

/** What a row shows. @param {Draft} d @param {Row} row */
export function rowText(d, row) {
  if (row === "width") return d.width.m === undefined ? "Auto" : metres(d.width.m);
  if (row === "headlands") {
    const n = d.headlands.count;
    return n === undefined ? "Auto" : `${n} ${n === 1 ? "round" : "rounds"}`;
  }
  if (row === "direction") return d.direction.auto ? "Auto" : `${d.direction.deg}°`;
  if (row === "offset") {
    const m = d.offset.m;
    return Math.abs(m) < 0.05 ? "0.0 m" : `${Math.abs(m).toFixed(1)} m ${m < 0 ? "left" : "right"}`;
  }
  if (row === "lines") return d.lines === undefined ? "–" : d.lines ? "On" : "Off";
  return d.cruise === undefined ? "–" : d.cruise ? "Automatic" : "Manual";
}

/** "was Auto · 5.0 m", under a changed row. @param {Draft} game @param {Row} row */
export function wasText(game, row) {
  const text = rowText(game, row);
  const auto = (row === "width" || row === "headlands" || row === "offset") && game[row].auto && text !== "Auto";
  return `was ${auto ? "Auto · " : ""}${text}`;
}

/**
 * Revision 2: a row the game's dialog holds without OK (cab.steering.dialog,
 * only the rows that differ from the lanes'), "Dialog: 6.0 m"
 * (short: the row's value and AUTO tag share the line); "" for a row it
 * doesn't hold.
 * @param {Partial<SteeringSettings>|undefined} dialog @param {CourseRow} row
 */
export function dialogText(dialog, row) {
  const r = dialog?.[row];
  if (!r) return "";
  /** @type {any} */
  const one = {
    width: { m: undefined, auto: true }, headlands: { count: undefined, auto: true },
    direction: { deg: undefined, auto: true }, offset: { m: 0, auto: true },
  };
  if (row === "width") one.width = { m: /** @type {any} */ (r).m, auto: r.auto };
  else if (row === "headlands") one.headlands = { count: /** @type {any} */ (r).count, auto: r.auto };
  else if (row === "direction") one.direction = { deg: r.auto ? undefined : /** @type {any} */ (r).deg, auto: r.auto };
  else one.offset = { m: /** @type {any} */ (r).m ?? 0, auto: r.auto };
  const text = rowText(one, row);
  const auto = (row === "width" || row === "headlands") && r.auto && text !== "Auto";
  return `Dialog: ${auto ? "Auto · " : ""}${text}`;
}

/**
 * Show lines and Cruise as the game holds them: from the settings, else
 * from cab.steering's top (revision 2: the game's, every vehicle's, sent
 * also before a vehicle has settings).
 * @param {import("../types.js").CabSteering|undefined} s
 * @returns {{lines: boolean|undefined, cruise: boolean|undefined}}
 */
export function miscOf(s) {
  return { lines: s?.settings?.showLines ?? s?.showLines, cruise: s?.settings?.cruiseOff ?? s?.cruiseOff };
}

// what's locked, and why ---------------------------------------------------------

/**
 * The course rows are set only in Steering Assist mode, on a field you may
 * work, steering off; Show lines and Cruise only in Steering Assist mode.
 * @param {import("../types.js").CabSteering|undefined} s
 * @returns {{lanes: boolean, misc: boolean, why: string, whySmall: string}}
 */
export function locksOf(s) {
  const assist = s?.mode === "steeringAssist";
  const out = { lanes: !assist, misc: !assist, why: "", whySmall: "" };
  if (!s) return { ...out, lanes: true, misc: true };
  if (!assist && s.canAssist === false) {
    return { ...out, why: "No tool here allows Steering Assist", whySmall: "Hitch one that does." };
  }
  if (!assist) return { ...out, why: "Switch to Steering Assist", whySmall: "These are its settings; the AI worker keeps its own." };
  if (s.onField === false) {
    return { ...out, lanes: true, why: "Drive onto a field you may work", whySmall: "The lanes are set up for the field you are on." };
  }
  if (s.state === "steering") {
    return { ...out, lanes: true, why: "Steering is on", whySmall: "Close, stop steering, then change the lanes." };
  }
  return out;
}

/**
 * The rows that differ from the game and may be applied now.
 * @param {Draft} d @param {Draft} game @param {{lanes: boolean, misc: boolean}} locks
 * @returns {Row[]}
 */
export function changesOf(d, game, locks) {
  return ROWS.filter((row) => !sameRow(row, d, game)
    && (COURSE_ROWS.includes(/** @type {CourseRow} */ (row)) ? !locks.lanes : !locks.misc));
}

// what goes to the game ------------------------------------------------------------

/** A row's value in the attribute: auto, or the number. @param {Draft} d @param {CourseRow} row */
function attrValue(d, row) {
  if (row === "width") return d.width.auto || d.width.m === undefined ? "auto" : d.width.m.toFixed(1);
  if (row === "headlands") return d.headlands.auto || d.headlands.count === undefined ? "auto" : String(d.headlands.count);
  if (row === "direction") return d.direction.auto ? "auto" : String(d.direction.deg);
  return d.offset.auto ? "auto" : (Math.abs(d.offset.m) < 0.05 ? 0 : d.offset.m).toFixed(1);
}

/** The attribute for these rows, in order. @param {Draft} d @param {CourseRow[]} rows */
export function settingsAttr(d, rows) {
  return COURSE_ROWS.filter((row) => rows.includes(row)).map((row) => `${row}=${attrValue(d, row)}`).join(";");
}

/** What Apply sends for the course rows (the changed ones), or "" with none. @param {Draft} d @param {Draft} game */
export const applyAttr = (d, game) => settingsAttr(d, COURSE_ROWS.filter((row) => !sameRow(row, d, game)));

/** What the preview asks for: all four rows. @param {Draft} d */
export const previewAttr = (d) => settingsAttr(d, COURSE_ROWS);

/** Whether any course row differs from the game's. @param {Draft} d @param {Draft} game */
export const courseChanged = (d, game) => COURSE_ROWS.some((row) => !sameRow(row, d, game));

// the panel's state in the store ------------------------------------------------------

/**
 * @typedef {Object} Setup what the column and the GPS screen share (the store's "gpsSetup")
 * @property {boolean} open
 * @property {Draft} [draft] while open
 * @property {"idle"|"applying"|"failed"} phase
 * @property {string} [previewFor] the preview the panel waits for: its settings attribute
 * @property {string} [previewFailed] a preview whose command failed (no topic will come for it)
 * @property {boolean} [lanesChanged] a course row differs from the game's and may be set
 */

/** @param {{get: (key: string) => any}} store @returns {Setup} */
export const setupOf = (store) => store.get("gpsSetup") || { open: false, phase: "idle" };

/** @param {{get: (key: string) => any, set: (key: string, value: any) => void}} store @param {Partial<Setup>} patch */
export function setSetup(store, patch) {
  store.set("gpsSetup", { ...setupOf(store), ...patch });
}

/**
 * The panel opened, closed or applied: the last preview is dropped, so a
 * preview for another field or an older course never shows (the mod sends
 * a new one for the next draft).
 * @param {{get: (key: string) => any, set: (key: string, value: any) => void}} store
 */
export function dropPreview(store) {
  if (store.get("steering_preview") !== undefined) store.set("steering_preview", undefined);
}
