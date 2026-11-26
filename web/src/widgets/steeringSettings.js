// @ts-check
// Steering Assist's settings column (specs/0022): the game's AI Settings
// dialog on the GPS page. Set up (on the GPS screen's field card) opens it
// in the Drive column's place; Close drops what wasn't applied and brings
// the Drive column back.
//
// Revision 3 (every setting at a glance): a grouped list, every row open.
// - Mode: a slim two-way switch; it sets at once (its own command).
// - Lanes: one line a setting, its name (or "Width · was 5.0 m"), its value
//   (blue while changed), an AUTO tag or an Auto chip, and its steps in a
//   small well; the width on two lines (four steps). One tap a step; held
//   in the panel until Apply, which sends the four lane rows in one command.
//   "Applying…" until the mod answers (ok once the game reads the change
//   back); a failure says "Failed" on Apply. Reset: the four rows to Auto.
// - Every vehicle: Show lines and Cruise, two choices each, set at once
//   (they build no course); the tapped one breathes until the game has it,
//   a failure rings its switch.
// - The preview: half a second after the last change to a lane row the GPS
//   screen's field shows the course the game would build. One preview is
//   out at a time; the newest settings wait behind it, older ones are
//   dropped. The column and the screen share the panel's state in the
//   store's "gpsSetup" (data/steeringSettings.js).
// - Faded in place: the lane rows in AI worker mode, off a field you may
//   work and while steering, with the reason in Reset and Apply's place;
//   Show lines and Cruise in AI worker mode; Steering Assist in the switch
//   without a tool that allows it (the reason says so). A mode tapped says
//   "Switching…" on its own choice until the answer.

import { sendCommand } from "../connection.js";
import { ERROR_SHOWN_MS } from "../ui/control.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import {
  applyAttr, changesOf, COURSE_ROWS, courseChanged, draftOf, dropPreview, locksOf, PREVIEW_DELAY_MS, previewAttr, reset, rowText,
  sameRow, setSetup, setupOf, step, toAuto, wasText, dialogText, miscOf,
} from "../data/steeringSettings.js";
import { courseOf } from "../data/gps.js";

/** @typedef {import("../data/steeringSettings.js").Draft} Draft */
/** @typedef {import("../data/steeringSettings.js").CourseRow} CourseRow */
/** @typedef {import("../commands.js").CommandResult} CommandResult */

/** a flip of Show lines or Cruise held until the game has it: these long at most once answered */
const FLIP_HOLD_MS = 3000;

/**
 * A button.
 * @param {string} className @param {string} [text] @param {Record<string, string>} [attrs]
 */
function button(className, text, attrs = {}) {
  const b = /** @type {HTMLButtonElement} */ (h("button", { className }));
  b.type = "button";
  if (text) b.textContent = text;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  return b;
}

/** A left or right arrow for the offset's steps. @param {boolean} left */
function arrow(left) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 16 16");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", left ? "M13 8H3M7 4L3 8l4 4" : "M3 8h10M9 4l4 4-4 4");
  s.append(p);
  return s;
}

/** @param {HTMLElement} el @param {string} name @param {string|boolean|undefined} value */
function attr(el, name, value) {
  const v = value === undefined || value === false ? null : value === true ? "true" : value;
  if (v === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

/** @param {HTMLElement} el @param {string} text */
function text(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * The column. Besides the widget options it takes `send` (the commands) and
 * `previewDelayMs`, for the tests.
 * @type {import("./widget.js").CreateWidget}
 */
export function steeringSettings(store, opts = {}) {
  const more = /** @type {{send?: typeof sendCommand, previewDelayMs?: number}} */ (/** @type {any} */ (opts));
  const send = more.send || sendCommand;
  const previewDelayMs = more.previewDelayMs ?? PREVIEW_DELAY_MS;

  const steering = () => store.get("cab")?.steering;
  const game = () => {
    const s = steering()?.settings;
    return s ? draftOf(s) : undefined;
  };
  /** the panel's draft: its own once edited, else the game's */
  const draft = () => setupOf(store).draft || game();

  // the mode: a slim switch -------------------------------------------------------------
  /** @type {Record<string, HTMLButtonElement>} */
  const modeSegs = {};
  const modeEl = h("div", { className: "gl-mode" });
  modeEl.dataset.row = "mode";
  modeEl.setAttribute("role", "radiogroup");
  modeEl.setAttribute("aria-label", "Mode");
  for (const [m, label] of [["worker", "AI worker"], ["steeringAssist", "Steering Assist"]]) {
    const seg = button("gl-mseg", label, { role: "radio" });
    seg.dataset.value = m;
    seg.addEventListener("click", () => pickMode(m));
    modeSegs[m] = seg;
    modeEl.append(seg);
  }

  // the lane rows: one line each, the steps in a well ------------------------------------
  /**
   * @param {CourseRow} row @param {string} name @param {[string, number, string, boolean?][]} steps
   */
  function laneRow(row, name, steps) {
    const lab = h("span", { className: "gl-lab", text: name });
    const value = h("b");
    const tag = h("i", { text: "Auto" });
    const auto = button("gl-auto", "Auto", { "aria-label": `${name} back to Auto` });
    auto.addEventListener("click", () => {
      if (auto.getAttribute("aria-disabled") !== "true") edit((d) => toAuto(d, row, steering()?.settings));
    });
    const well = h("div", { className: "gl-well" });
    for (const [label, by, aria, fine] of steps) {
      const b = button("gl-b", "", { "aria-label": aria });
      if (fine) b.dataset.fine = "true";
      if (row === "offset") b.append(arrow(by < 0));
      else b.textContent = label;
      b.addEventListener("click", () => {
        if (b.getAttribute("aria-disabled") !== "true") edit((d) => step(d, row, by, steering()?.settings, courseOf(store)));
      });
      well.append(b);
    }
    const el = h("div", { className: "gl-r" }, h("div", { className: "gl-info" }, lab, h("span", { className: "gl-val" }, value, tag, auto)), well);
    el.dataset.row = row;
    if (steps.length > 2) el.dataset.wide = "true";
    return { el, name, lab, value, tag, auto, well };
  }
  const lanes = {
    width: laneRow("width", "Width", [["−1", -1, "Narrower by 1 metre"], ["−.1", -0.1, "Narrower by 0.1 metre", true],
      ["+.1", 0.1, "Wider by 0.1 metre", true], ["+1", 1, "Wider by 1 metre"]]),
    headlands: laneRow("headlands", "Headlands", [["−", -1, "One round fewer"], ["+", 1, "One round more"]]),
    direction: laneRow("direction", "Direction", [["−5°", -5, "5 degrees anticlockwise"], ["+5°", 5, "5 degrees clockwise"]]),
    offset: laneRow("offset", "Offset", [["Left", -0.1, "0.1 metre to the left"], ["Right", 0.1, "0.1 metre to the right"]]),
  };
  const lanesGroup = h("div", { className: "gl-group" }, lanes.width.el, lanes.headlands.el, lanes.direction.el, lanes.offset.el);
  lanesGroup.dataset.group = "lanes";

  // Show lines and Cruise: two choices, set at once -------------------------------------
  /** a tap waiting for the game, or one that failed */
  let flip = /** @type {{row: "lines"|"cruise", on: boolean, answered?: boolean, at?: number}|null} */ (null);
  let flipFailed = /** @type {string|null} */ (null);
  let flipTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);
  /**
   * @param {"lines"|"cruise"} row @param {string} name @param {string} aria @param {[string, string]} labels off, on
   */
  function gameRow(row, name, aria, labels) {
    const well = h("div", { className: "gl-well gl-seg" });
    well.setAttribute("role", "radiogroup");
    well.setAttribute("aria-label", aria);
    /** @type {HTMLButtonElement[]} */
    const segs = [];
    for (const on of [false, true]) {
      const seg = button("gl-s", labels[on ? 1 : 0], { role: "radio" });
      seg.dataset.value = String(on);
      seg.addEventListener("click", () => pickFlip(row, on));
      segs.push(seg);
      well.append(seg);
    }
    const el = h("div", { className: "gl-r" }, h("span", { className: "gl-lab gl-lab-line", text: name }), well);
    el.dataset.row = row;
    return { el, well, segs };
  }
  const gameRows = {
    lines: gameRow("lines", "Show lines", "Show lines", ["Off", "On"]),
    cruise: gameRow("cruise", "Cruise control", "Cruise Control Deactivation", ["Manual", "Automatic"]),
  };
  const gameGroup = h("div", { className: "gl-group" }, gameRows.lines.el, gameRows.cruise.el);
  gameGroup.dataset.group = "game";

  // the column ---------------------------------------------------------------------------
  const vehicleLabel = h("span");
  const list = h("div", { className: "st-list gl-list" }, modeEl, h("div", { className: "gl-head", text: "Lanes" }), lanesGroup,
    h("div", { className: "gl-head", text: "Every vehicle" }), gameGroup);
  const whyEl = h("div", { className: "st-why gl-why" });
  const whyText = document.createTextNode("");
  const whySmall = h("small");
  whyEl.append(whyText, whySmall);
  const resetEl = button("st-reset", "", {});
  resetEl.append(icon("reset"), document.createTextNode("Reset"));
  const applyEl = button("st-apply", "No changes");
  const root = h("aside", { className: "st-col" },
    h("div", { className: "st-col-label" }, document.createTextNode("Set up"), vehicleLabel),
    list, h("div", { className: "st-foot" }, whyEl, resetEl, applyEl));
  root.setAttribute("aria-label", "Steering Assist settings");
  root.id = opts.id || "st-col";
  root.hidden = true;

  /** the mode asked for, while its answer is out; the one whose tap failed */
  let modePending = /** @type {string|null} */ (null);
  let modeFailed = /** @type {string|null} */ (null);
  let modeFailTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);
  /** the preview out, and the newest waiting behind it */
  let previewOut = /** @type {string|undefined} */ (undefined);
  let previewWaiting = /** @type {string|undefined} */ (undefined);
  let previewTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);

  /** a change to the draft's lane rows: the preview follows */
  function edit(/** @type {(d: Draft) => Draft} */ fn) {
    const d = draft();
    if (!d || setupOf(store).phase === "applying") return;
    setSetup(store, { draft: fn(d), phase: "idle" });
    schedulePreview();
  }

  /** the lane rows the panel holds otherwise than the game (Show lines and Cruise set at once) */
  const laneChanges = (/** @type {Draft} */ d, /** @type {Draft} */ g, /** @type {ReturnType<typeof locksOf>} */ locks) =>
    changesOf(d, g, locks).filter((row) => COURSE_ROWS.includes(/** @type {CourseRow} */ (row)));

  // the mode: at once ----------------------------------------------------------------
  /** @param {string} m */
  async function pickMode(m) {
    const s = steering();
    if (!s || s.mode === m || modePending || (m === "steeringAssist" && s.canAssist === false)) return;
    modePending = m;
    modeFailed = null;
    render();
    /** @type {CommandResult} */
    let result;
    try {
      result = await send("steering.mode.set", m === "steeringAssist" ? 1 : 0);
    } catch (e) {
      result = { ok: false, reason: String(e) };
    }
    modePending = null;
    if (!result.ok) {
      modeFailed = m;
      clearTimeout(modeFailTimer);
      modeFailTimer = setTimeout(() => { modeFailed = null; render(); }, ERROR_SHOWN_MS);
    }
    render();
  }

  // Show lines and Cruise: at once ------------------------------------------------------
  /** @param {"lines"|"cruise"} row @param {boolean} on */
  async function pickFlip(row, on) {
    const s = steering();
    const now = miscOf(s)[row];
    if (!s || flip || locksOf(s).misc || now === on) return;
    flip = { row, on };
    flipFailed = null;
    render();
    /** @type {CommandResult} */
    let result;
    try {
      result = await send(row === "lines" ? "steering.lines.set" : "steering.cruiseOff.set", on ? 1 : 0);
    } catch (e) {
      result = { ok: false, reason: String(e) };
    }
    clearTimeout(flipTimer);
    if (!result.ok) {
      flip = null;
      flipFailed = row;
      flipTimer = setTimeout(() => { flipFailed = null; render(); }, ERROR_SHOWN_MS);
    } else {
      // the cab may say so a moment later: the choice stays until it does
      flip = { row, on, answered: true };
      flipTimer = setTimeout(() => { flip = null; render(); }, FLIP_HOLD_MS);
    }
    render();
  }

  // the preview: one out at a time, the newest waiting --------------------------------
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(askPreview, previewDelayMs);
  }

  function askPreview() {
    const d = setupOf(store).draft;
    const g = game();
    const locks = locksOf(steering());
    if (!d || !g || locks.lanes || !courseChanged(d, g) || !setupOf(store).open) return;
    const want = previewAttr(d);
    if (setupOf(store).previewFor !== want) setSetup(store, { previewFor: want });
    if (previewOut !== undefined) {
      previewWaiting = want;
      return;
    }
    sendPreview(want);
  }

  /** @param {string} want */
  function sendPreview(want) {
    previewOut = want;
    previewWaiting = undefined;
    Promise.resolve(send("steering.settings.preview", undefined, undefined, undefined, undefined, want))
      .catch((e) => ({ ok: false, reason: String(e) }))
      .then((result) => {
        previewOut = undefined;
        // no topic comes for a preview the mod refused or never answered
        if (!result?.ok && setupOf(store).previewFor === want) setSetup(store, { previewFailed: want });
        const next = previewWaiting;
        previewWaiting = undefined;
        // the newest, unless the panel moved on (closed, or back to the game's)
        if (next !== undefined && next === setupOf(store).previewFor && setupOf(store).open) sendPreview(next);
      });
  }

  // Apply and Reset: the lane rows ------------------------------------------------------
  async function apply() {
    const setup = setupOf(store);
    const d = setup.draft, g = game();
    const locks = locksOf(steering());
    if (!d || !g || setup.phase === "applying" || locks.lanes || !laneChanges(d, g, locks).length) return;
    setSetup(store, { phase: "applying" });
    /** @type {CommandResult} */
    let result;
    try {
      result = await send("steering.settings.apply", undefined, undefined, undefined, undefined, applyAttr(d, g));
    } catch (e) {
      result = { ok: false, reason: String(e) };
    }
    if (!setupOf(store).open) return;
    if (result.ok) {
      dropPreview(store);
      setSetup(store, { phase: "idle", draft: undefined, previewFor: undefined });
    } else setSetup(store, { phase: "failed" });
  }
  applyEl.addEventListener("click", () => { if (applyEl.getAttribute("aria-disabled") !== "true") apply(); });
  resetEl.addEventListener("click", () => {
    if (resetEl.getAttribute("aria-disabled") === "true") return;
    edit((d) => reset(d, steering()?.settings));
  });

  // the column ----------------------------------------------------------------------------
  let wasOpen = false;
  function render() {
    const setup = setupOf(store);
    const s = steering();
    const open = setup.open && !!s;
    // in the Drive column's place while open (specs/0022)
    if (root.hidden === open) root.hidden = !open;
    const slot = root.parentElement;
    if (slot && slot.classList.contains("slot") && slot.hidden === open) slot.hidden = !open;
    const column = /** @type {HTMLElement|null|undefined} */ (root.closest(".screen")?.querySelector(":scope > .control-column"));
    if (column && column.hidden !== open) column.hidden = open;
    if (!open) {
      if (wasOpen) {
        wasOpen = false;
        clearTimeout(previewTimer);
        previewWaiting = undefined;
      }
      return;
    }
    wasOpen = true;
    const rig = store.get("cab")?.rig || [];
    const names = [rig[0]?.name, rig.length > 1 ? rig[rig.length - 1]?.name : undefined].filter(Boolean);
    text(vehicleLabel, names.join(" · "));

    const g = game();
    const d = draft();
    const locks = locksOf(s);
    const applying = setup.phase === "applying";
    const changes = d && g ? laneChanges(d, g, locks) : [];

    // the mode
    // the choice waiting says Switching… (no line of its own: the mini's list has no height to spare);
    // without a tool that allows it, the reason at the foot says why
    for (const [m, seg] of Object.entries(modeSegs)) {
      text(seg, modePending === m ? "Switching…" : m === "worker" ? "AI worker" : "Steering Assist");
      attr(seg, "aria-checked", String(s.mode === m));
      attr(seg, "aria-disabled", m === "steeringAssist" && s.canAssist === false ? "true" : undefined);
      attr(seg, "data-state", modePending === m ? "pending" : undefined);
      if (modeFailed === m) seg.dataset.error = "";
      else delete seg.dataset.error;
    }

    // the lane rows
    attr(lanesGroup, "data-locked", locks.lanes);
    for (const row of COURSE_ROWS) {
      const r = lanes[row];
      const changed = changes.includes(row);
      text(r.value, d ? rowText(d, row) : "–");
      const isAuto = !!d && d[row].auto;
      // the AUTO tag on a value the game picks, the chip back to Auto on a set one (the direction's Auto is its value)
      r.tag.hidden = !(isAuto && row !== "direction" && rowText(/** @type {Draft} */ (d), row) !== "Auto");
      r.auto.hidden = !d || isAuto;
      const inDialog = !changed ? dialogText(s.dialog, row) : "";
      const sub = changed ? (applying ? "Applying…" : wasText(/** @type {Draft} */ (g), row)) : inDialog;
      text(r.lab, sub ? `${r.name} · ${sub}` : r.name);
      attr(r.lab, "data-tone", changed ? (applying ? "pending" : "changed") : inDialog ? "dialog" : undefined);
      attr(r.el, "data-changed", changed);
      attr(r.el, "data-state", changed && applying ? "pending" : undefined);
      for (const b of [r.auto, ...r.well.querySelectorAll("button")]) attr(/** @type {HTMLElement} */ (b), "aria-disabled", locks.lanes || applying ? "true" : undefined);
    }

    // Show lines and Cruise: the game's, or the choice waiting for it
    attr(gameGroup, "data-locked", locks.misc);
    const misc = miscOf(s);
    if (flip?.answered && misc[flip.row] === flip.on) {
      flip = null;
      clearTimeout(flipTimer);
    }
    for (const row of /** @type {("lines"|"cruise")[]} */ (["lines", "cruise"])) {
      const r = gameRows[row];
      const on = flip?.row === row ? flip.on : misc[row];
      for (const seg of r.segs) {
        attr(seg, "aria-checked", String(on !== undefined && on === (seg.dataset.value === "true")));
        attr(seg, "aria-disabled", locks.misc ? "true" : undefined);
      }
      attr(r.well, "data-state", flip?.row === row && !flip.answered ? "pending" : undefined);
      attr(r.well, "data-error", flipFailed === row ? "true" : undefined);
      attr(r.well, "title", flipFailed === row ? "Failed" : undefined);
    }

    // the foot: the reason while the lane rows can't be set, else Reset and Apply
    text(whyText, locks.lanes ? locks.why : "");
    text(whySmall, locks.lanes ? locks.whySmall : "");
    whyEl.hidden = !locks.lanes;
    resetEl.hidden = locks.lanes;
    applyEl.hidden = locks.lanes;
    const allAuto = !d || COURSE_ROWS.every((row) => d[row].auto);
    attr(resetEl, "aria-disabled", locks.lanes || allAuto || applying ? "true" : undefined);
    const n = changes.length;
    text(applyEl, applying ? "Applying…" : setup.phase === "failed" ? "Failed"
      : n === 0 ? "No changes" : n === 1 ? "Apply 1 change" : `Apply ${n} changes`);
    attr(applyEl, "aria-disabled", n === 0 && !applying ? "true" : undefined);
    attr(applyEl, "data-state", applying ? "pending" : setup.phase === "failed" ? "error" : undefined);

    // what the GPS screen needs: whether a preview shows, and which
    const lanesChanged = !!d && !!g && !locks.lanes && courseChanged(d, g);
    const patch = /** @type {Partial<import("../data/steeringSettings.js").Setup>} */ ({});
    if (!!setup.lanesChanged !== lanesChanged) patch.lanesChanged = lanesChanged;
    if (!lanesChanged && setup.previewFor !== undefined) patch.previewFor = undefined;
    if (Object.keys(patch).length) setSetup(store, patch);
    // back to the game's lane settings: the draft goes (the panel follows the game again)
    if (setup.draft && g && !applying && COURSE_ROWS.every((row) => sameRow(row, setup.draft, g))) {
      setSetup(store, { draft: undefined, phase: "idle" });
    }
  }

  for (const k of ["cab", "gpsSetup", "steering_course"]) store.subscribe(k, render);
  return root;
}
