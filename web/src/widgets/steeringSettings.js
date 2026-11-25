// @ts-check
// Steering Assist's settings column (specs/0022): the game's AI Settings
// dialog on the GPS page. Set up (on the GPS screen's field card) opens it
// in the Drive column's place; Close drops what wasn't applied and brings
// the Drive column back. One row per setting, its value on the right as the
// game holds it; a tap opens its steps under it, one row at a time.
//
// - Mode sets at once (its own command); the other rows are held in the
//   panel until Apply, which sends the course rows in one command, then
//   Show lines and Cruise. "Applying…" until the mod answers (it answers ok
//   once the game reads the change back); a failure says "Failed" on Apply.
// - Reset, as the game's dialog: the four course rows to Auto.
// - The preview: half a second after the last change to a course row the
//   GPS screen's field shows the course the game would build. One preview
//   is out at a time; the newest settings wait behind it, older ones are
//   dropped. The column and the screen share the panel's state in the
//   store's "gpsSetup" (data/steeringSettings.js).
// - Faded, with the reason above them: the course rows in AI worker mode,
//   off a field you may work and while steering; Show lines and Cruise in
//   AI worker mode; Steering Assist in the Mode row without a tool that
//   allows it.

import { sendCommand } from "../connection.js";
import { ERROR_SHOWN_MS } from "../ui/control.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import {
  applyAttr, changesOf, COURSE_ROWS, courseChanged, draftOf, dropPreview, locksOf, PREVIEW_DELAY_MS, previewAttr, reset, rowText,
  sameRow, setSetup, setupOf, step, toAuto, wasText,
} from "../data/steeringSettings.js";
import { courseOf } from "../data/gps.js";

/** @typedef {import("../data/steeringSettings.js").Draft} Draft */
/** @typedef {import("../data/steeringSettings.js").Row} Row */
/** @typedef {import("../data/steeringSettings.js").CourseRow} CourseRow */
/** @typedef {import("../commands.js").CommandResult} CommandResult */

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

  const vehicleLabel = h("span");
  const list = h("div", { className: "st-list" });
  const resetEl = button("st-reset", "", {});
  resetEl.append(icon("reset"), document.createTextNode("Reset"));
  const applyEl = button("st-apply", "No changes");
  const root = h("aside", { className: "st-col" },
    h("div", { className: "st-col-label" }, document.createTextNode("Set up"), vehicleLabel),
    list, h("div", { className: "st-foot" }, resetEl, applyEl));
  root.setAttribute("aria-label", "Steering Assist settings");
  root.id = opts.id || "st-col";
  root.hidden = true;

  /** the row whose steps are open */
  let openRow = /** @type {Row|"mode"|null} */ (null);
  /** the mode asked for, while its answer is out; the one whose tap failed */
  let modePending = /** @type {string|null} */ (null);
  let modeFailed = /** @type {string|null} */ (null);
  let modeFailTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);
  /** the preview out, and the newest waiting behind it */
  let previewOut = /** @type {string|undefined} */ (undefined);
  let previewWaiting = /** @type {string|undefined} */ (undefined);
  let previewTimer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);

  const steering = () => store.get("cab")?.steering;
  const game = () => {
    const s = steering()?.settings;
    return s ? draftOf(s) : undefined;
  };
  /** the panel's draft: its own once edited, else the game's */
  const draft = () => setupOf(store).draft || game();

  // one setting: a head to tap, its steps under it ---------------------------------
  /**
   * @param {Row|"mode"} id @param {string} label
   * @param {(body: HTMLElement) => void} fillBody
   */
  function item(id, label, fillBody) {
    const name = h("b", { text: label });
    const sub = h("span");
    const value = h("b");
    const autoTag = h("i", { text: "Auto" });
    const head = button("st-head");
    head.append(h("span", { className: "st-name" }, name, sub), h("span", { className: "st-v" }, value, autoTag));
    const body = h("div", { className: "st-body" });
    fillBody(body);
    const el = h("div", { className: "st-item" }, head, body);
    el.dataset.row = id;
    head.addEventListener("click", () => {
      if (head.getAttribute("aria-disabled") === "true") return;
      openRow = openRow === id ? null : id;
      render();
    });
    return { el, head, sub, value, autoTag, body };
  }

  /** a change to the draft: the course rows ask for a preview */
  function edit(/** @type {(d: Draft) => Draft} */ fn, lanes = true) {
    const d = draft();
    if (!d || setupOf(store).phase === "applying") return;
    setSetup(store, { draft: fn(d), phase: "idle" });
    if (lanes) schedulePreview();
  }

  /** a step on a course row */
  const stepOn = (/** @type {CourseRow} */ row, /** @type {number} */ by) => () =>
    edit((d) => step(d, row, by, steering()?.settings, courseOf(store)));
  const autoOn = (/** @type {CourseRow} */ row) => () => edit((d) => toAuto(d, row, steering()?.settings));

  /** @param {HTMLElement} body @param {CourseRow} row @param {[string, number, string, boolean?][]} steps */
  function steps(body, row, steps) {
    for (const [label, by, aria, fine] of steps) {
      const b = button("st-step", "", { "aria-label": aria });
      if (fine) b.dataset.fine = "true";
      if (row === "offset") b.append(arrow(by < 0), document.createTextNode(label));
      else b.textContent = label;
      b.addEventListener("click", stepOn(row, by));
      body.append(b);
    }
    const auto = button("st-step", "Auto");
    auto.dataset.auto = "";
    auto.addEventListener("click", autoOn(row));
    body.append(auto);
  }

  // the rows -----------------------------------------------------------------
  /** @type {Record<string, HTMLButtonElement>} */
  const modeSegs = {};
  const mode = item("mode", "Mode", (body) => {
    body.setAttribute("role", "radiogroup");
    body.setAttribute("aria-label", "Mode");
    for (const [m, label, ic] of [["worker", "AI worker", "aiWorker"], ["steeringAssist", "Steering Assist", "steering"]]) {
      const seg = button("st-seg", "", { role: "radio" });
      seg.append(icon(ic), document.createTextNode(label));
      seg.addEventListener("click", () => pickMode(m));
      modeSegs[m] = seg;
      body.append(seg);
    }
  });
  const whyEl = h("div", { className: "st-why" });
  const whyText = document.createTextNode("");
  const whySmall = h("small");
  whyEl.append(whyText, whySmall);
  const rows = {
    width: item("width", "Working width", (b) => steps(b, "width", [["−1", -1, "Narrower by 1 metre"],
      ["−0.1", -0.1, "Narrower by 0.1 metre", true], ["+0.1", 0.1, "Wider by 0.1 metre", true], ["+1", 1, "Wider by 1 metre"]])),
    headlands: item("headlands", "Headlands", (b) => steps(b, "headlands", [["−", -1, "One round fewer"], ["+", 1, "One round more"]])),
    direction: item("direction", "Work direction", (b) => steps(b, "direction", [["−5°", -5, "5 degrees anticlockwise"],
      ["+5°", 5, "5 degrees clockwise"]])),
    offset: item("offset", "Side offset", (b) => steps(b, "offset", [["Left", -0.1, "0.1 metre to the left"],
      ["Right", 0.1, "0.1 metre to the right"]])),
    lines: item("lines", "Show lines", (body) => {
      body.dataset.text = "true";
      body.setAttribute("role", "radiogroup");
      body.setAttribute("aria-label", "Show lines");
      for (const [label, on] of /** @type {[string, boolean][]} */ ([["Off", false], ["On", true]])) {
        const seg = button("st-seg", label, { role: "radio" });
        seg.dataset.value = String(on);
        seg.addEventListener("click", () => edit((d) => ({ ...d, lines: on }), false));
        body.append(seg);
      }
    }),
    cruise: item("cruise", "Cruise control", (body) => {
      body.dataset.text = "true";
      body.setAttribute("role", "radiogroup");
      body.setAttribute("aria-label", "Cruise control deactivation");
      for (const [label, on] of /** @type {[string, boolean][]} */ ([["Manual", false], ["Automatic", true]])) {
        const seg = button("st-seg", label, { role: "radio" });
        seg.dataset.value = String(on);
        seg.addEventListener("click", () => edit((d) => ({ ...d, cruise: on }), false));
        body.append(seg);
      }
    }),
  };
  list.append(mode.el, whyEl, rows.width.el, rows.headlands.el, rows.direction.el, rows.offset.el,
    h("div", { className: "st-gap" }), rows.lines.el, rows.cruise.el);

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

  // Apply and Reset ---------------------------------------------------------------------
  async function apply() {
    const setup = setupOf(store);
    const d = setup.draft, g = game();
    const locks = locksOf(steering());
    if (!d || !g || setup.phase === "applying") return;
    const changes = changesOf(d, g, locks);
    if (!changes.length) return;
    setSetup(store, { phase: "applying" });
    /** @type {Promise<CommandResult>[]} the commands, in the order they run */
    const out = [];
    const course = changes.some((row) => COURSE_ROWS.includes(/** @type {CourseRow} */ (row)));
    if (course) out.push(send("steering.settings.apply", undefined, undefined, undefined, undefined, applyAttr(d, g)));
    if (changes.includes("lines")) out.push(send("steering.lines.set", d.lines ? 1 : 0));
    if (changes.includes("cruise")) out.push(send("steering.cruiseOff.set", d.cruise ? 1 : 0));
    const results = await Promise.all(out.map((p) => Promise.resolve(p).catch((e) => ({ ok: false, reason: String(e) }))));
    if (!setupOf(store).open) return;
    if (results.every((r) => r.ok)) {
      dropPreview(store);
      setSetup(store, { phase: "idle", draft: undefined, previewFor: undefined });
    }
    else setSetup(store, { phase: "failed" });
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
        openRow = null;
        clearTimeout(previewTimer);
        previewWaiting = undefined;
      }
      return;
    }
    if (!wasOpen) {
      wasOpen = true;
      openRow = null;
    }
    const rig = store.get("cab")?.rig || [];
    const names = [rig[0]?.name, rig.length > 1 ? rig[rig.length - 1]?.name : undefined].filter(Boolean);
    text(vehicleLabel, names.join(" · "));

    const g = game();
    const d = draft();
    const locks = locksOf(s);
    const applying = setup.phase === "applying";
    const changes = d && g ? changesOf(d, g, locks) : [];
    const assist = s.mode === "steeringAssist";
    // a row that locks closes
    if ((openRow && openRow !== "mode" && COURSE_ROWS.includes(/** @type {CourseRow} */ (openRow)) && locks.lanes)
      || ((openRow === "lines" || openRow === "cruise") && locks.misc)) openRow = null;

    // the mode
    text(mode.value, assist ? "Steering Assist" : "AI worker");
    attr(mode.el, "data-open", openRow === "mode");
    attr(mode.head, "aria-expanded", String(openRow === "mode"));
    mode.autoTag.hidden = true;
    mode.body.hidden = openRow !== "mode";
    const modeSub = modePending ? "Switching…" : s.canAssist === false ? "No tool here allows steering" : "";
    text(mode.sub, modeSub);
    mode.sub.hidden = !modeSub;
    attr(mode.sub, "data-tone", modePending ? "pending" : undefined);
    for (const [m, seg] of Object.entries(modeSegs)) {
      attr(seg, "aria-checked", String(s.mode === m));
      attr(seg, "aria-disabled", m === "steeringAssist" && s.canAssist === false ? "true" : undefined);
      attr(seg, "data-state", modePending === m ? "pending" : undefined);
      if (modeFailed === m) seg.dataset.error = "";
      else delete seg.dataset.error;
    }

    // why the rows are faded
    text(whyText, locks.why);
    text(whySmall, locks.whySmall);
    whyEl.hidden = !locks.why;

    // the course rows, Show lines, Cruise
    for (const row of /** @type {Row[]} */ (["width", "headlands", "direction", "offset", "lines", "cruise"])) {
      const r = rows[row];
      const locked = COURSE_ROWS.includes(/** @type {CourseRow} */ (row)) ? locks.lanes : locks.misc;
      const changed = !!d && !!g && changes.includes(row);
      const isOpen = openRow === row && !locked;
      text(r.value, d ? rowText(d, row) : "–");
      r.autoTag.hidden = !(d && (row === "width" || row === "headlands" || row === "offset") && d[row].auto
        && rowText(d, row) !== "Auto");
      const sub = changed ? (applying ? "Applying…" : wasText(/** @type {Draft} */ (g), row))
        : row === "cruise" ? "Off at the lane end" : "";
      text(r.sub, sub);
      r.sub.hidden = !sub;
      attr(r.sub, "data-tone", changed ? (applying ? "pending" : "changed") : undefined);
      attr(r.el, "data-open", isOpen);
      attr(r.el, "data-changed", changed);
      attr(r.el, "data-state", changed && applying ? "pending" : undefined);
      attr(r.el, "data-locked", locked);
      attr(r.head, "aria-expanded", String(isOpen));
      attr(r.head, "aria-disabled", locked ? "true" : undefined);
      r.body.hidden = !isOpen;
      if (row === "lines" || row === "cruise") {
        for (const seg of r.body.querySelectorAll("button")) {
          attr(/** @type {HTMLElement} */ (seg), "aria-checked", String(d?.[row] === (seg.dataset.value === "true")));
        }
      } else {
        const auto = /** @type {HTMLElement} */ (r.body.querySelector("[data-auto]"));
        attr(auto, "aria-pressed", String(!!d && d[/** @type {CourseRow} */ (row)].auto));
      }
    }

    // Reset and Apply
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
    // back to the game's settings: the draft goes (the panel follows the game again)
    if (setup.draft && g && !applying && COURSE_ROWS.every((row) => sameRow(row, setup.draft, g))
      && sameRow("lines", setup.draft, g) && sameRow("cruise", setup.draft, g)) {
      setSetup(store, { draft: undefined, phase: "idle" });
    }
  }

  for (const k of ["cab", "gpsSetup", "steering_course"]) store.subscribe(k, render);
  return root;
}
