// @ts-check
// A control: an icon button for a game action (docs/THEMES.md, Controls).
// Four states: off, on, pending, unavailable. A control with `press` sends
// its command on touch-down: it shows pending at once, then the game's
// state once the answer is in, or a short error. One without `press` only
// shows the game's state: no handler, and aria-disabled so it isn't
// announced as something to press.
//
// A control can also show steps as dots under its label (setDots): the
// lights' stages, one dot per stage the vehicle has, lit up to the current
// one; or a value line (setValue): the cruise control's set speed.
//
// Pending shows as a "loading" border: a dash running clockwise round the
// button's edge (an SVG rect's stroke-dashoffset), a slow pulse instead
// with reduced motion. Some actions take a while in game after the mod has
// run them (the engine starting, an implement attaching): with `settle`,
// the control stays pending after the ack until the game's state changes
// (settle.key), at most settle.ms; nothing changed then shows settle.hint
// for a moment, quietly, not as a failure. An answer that the game was
// already there (specs/0008) ends pending at once.
//
// A held control (`hold`, the cruise −/+) ticks on touch-down, then again
// after 400 ms every 120 ms, every 50 ms after 1.5 s, until it's let go
// (or the finger slides off, the touch is cancelled, the window loses
// focus). Its label can follow the game (setLabel: "Lower" / "Raise"),
// and while its command runs a `progressive` control says so ("Raising…").

import { icon } from "./icons.js";
import { h } from "./dom.js";

/** @typedef {"off"|"on"|"pending"|"unavailable"} ControlState */
/** @typedef {{lit: number, count: number}} ControlDots lit of count steps */
/**
 * @typedef {Object} ControlSettle
 * @property {() => string} key the game's state the action changes
 * @property {number} ms how long to wait for it after the ack
 * @property {string} [hint] shown when nothing changed in that time
 * @property {string[]} [quiet] failure reasons shown as the hint instead
 */
/**
 * @typedef {Object} ControlHold
 * @property {() => void} tick one step, on touch-down and while held
 * @property {() => void} end let go
 */

export const HOLD_DELAY_MS = 400;
export const HOLD_REPEAT_MS = 120;
export const HOLD_FAST_MS = 50;
export const HOLD_FAST_AFTER_MS = 1500;

/** "Lower" -> "Lowering…", "Raise" -> "Raising…" */
export const ing = (/** @type {string} */ word) =>
  `${word.endsWith("e") ? word.slice(0, -1) : word}ing…`;
/** @typedef {import("../commands.js").CommandResult} CommandResult */

export const ERROR_SHOWN_MS = 2000;

/**
 * @param {{label: string, icon: string, tint?: "ok"|"alarm", progressive?: boolean}} def
 *   tint: the icon's colour while off (turn arrows OK, hazard alarm)
 * @param {() => Promise<CommandResult>} [press] sends the control's command
 * @param {ControlSettle} [settle]
 * @param {ControlHold} [hold] a held control instead of press
 * @returns {{el: HTMLButtonElement, set: (state: ControlState) => void,
 *   setDots: (dots: ControlDots|undefined) => void, setValue: (text: string|undefined) => void,
 *   setLabel: (text: string, iconName?: string) => void}}
 */
export function createControl(def, press, settle, hold) {
  const label = h("span", { className: "control-label", text: def.label });
  let iconEl = icon(def.icon);
  const el = /** @type {HTMLButtonElement} */ (h("button", { className: "control" },
    iconEl, label));
  el.type = "button";
  if (def.tint) el.dataset.tint = def.tint;
  if (!press && !hold) el.setAttribute("aria-disabled", "true");
  let iconName = def.icon;
  /** the label as the game's state has it; a note may cover it */
  let text = def.label;
  /** @type {string|undefined} */
  let note;
  /** the label when the tap went out, for "Raising…" until it's done */
  /** @type {string|undefined} */
  let tapLabel;

  const dotsEl = h("span", { className: "control-dots" });
  dotsEl.setAttribute("aria-hidden", "true");
  const valueEl = h("span", { className: "control-value" });
  el.append(valueEl, dotsEl, loadingRing());
  /** @type {ControlDots|undefined} */
  let dots;

  /** @type {ControlState} the game's state; shown unless a command is out */
  let state = "unavailable";
  let busy = false;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let errorTimer;

  function show() {
    const shown = busy ? "pending" : state;
    if (shown !== "pending") tapLabel = undefined;
    label.textContent = note ?? (tapLabel && def.progressive ? ing(tapLabel) : text);
    el.dataset.state = shown;
    el.setAttribute("aria-pressed", String(shown === "on"));
    const step = dots && shown !== "unavailable" ? `, stage ${dots.lit} of ${dots.count}` : "";
    el.setAttribute("aria-label", `${label.textContent}, ${shown}${step}`);
  }

  /** @param {string} noteText @param {string} [title] @param {boolean} [error] */
  function showNote(noteText, title, error) {
    clearTimeout(errorTimer);
    if (error) el.dataset.error = "";
    else el.dataset.hint = "";
    note = noteText;
    el.title = title || noteText;
    show();
    errorTimer = setTimeout(() => {
      delete el.dataset.error;
      delete el.dataset.hint;
      note = undefined;
      el.removeAttribute("title");
      show();
    }, ERROR_SHOWN_MS);
  }

  /** @type {(() => void)|undefined} ends the wait for the game to settle */
  let settled;
  /** the game's state (settle.key) when the tap went out */
  let settleFrom = "";

  /** after the ack: wait until settle.key changes, true when it did */
  function waitToSettle(/** @type {string} */ before) {
    if (!settle || settle.key() !== before) return Promise.resolve(true);
    settleFrom = before;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { settled = undefined; resolve(false); }, settle.ms);
      settled = () => { clearTimeout(timer); settled = undefined; resolve(true); };
    });
  }

  async function fire() {
    if (!press || busy || state === "unavailable") return;
    busy = true;
    tapLabel = text;
    show();
    const before = settle ? settle.key() : "";
    /** @type {CommandResult} */
    let result;
    try {
      result = await press();
    } catch (e) {
      result = { ok: false, reason: String(e) };
    }
    const changed = result.ok && !result.already ? await waitToSettle(before) : true;
    busy = false;
    show();
    if (!result.ok && settle?.hint && settle.quiet?.includes(result.reason || "")) {
      showNote(settle.hint, result.reason);
    } else if (!result.ok) {
      showNote("Failed", result.reason, true);
    } else if (!changed && settle?.hint) {
      showNote(settle.hint);
    }
  }

  if (press) {
    // touch-down, not click: a tap must feel instant
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button === 0) fire();
    });
    // the keyboard (Enter, Space) clicks with detail 0
    el.addEventListener("click", (ev) => {
      if (ev.detail === 0) fire();
    });
  }

  let holding = false;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let holdTimer;
  if (hold) {
    let since = 0;
    const repeat = () => {
      if (!holding) return;
      hold.tick();
      holdTimer = setTimeout(repeat, performance.now() - since > HOLD_FAST_AFTER_MS ? HOLD_FAST_MS : HOLD_REPEAT_MS);
    };
    const release = () => {
      if (!holding) return;
      holding = false;
      clearTimeout(holdTimer);
      busy = false;
      show();
      hold.end();
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || holding || state === "unavailable") return;
      // keep the pointer: sliding off the button ends the hold
      try { el.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
      holding = true;
      busy = true;
      show();
      since = performance.now();
      hold.tick();
      holdTimer = setTimeout(repeat, HOLD_DELAY_MS);
    });
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
    el.addEventListener("pointerleave", (ev) => { if (!el.hasPointerCapture?.(ev.pointerId)) release(); });
    window.addEventListener("blur", release);
    el.addEventListener("click", (ev) => {
      if (ev.detail === 0 && state !== "unavailable") { hold.tick(); hold.end(); }
    });
  }

  /** @param {ControlState} next */
  function set(next) {
    state = next;
    // set() runs on every update of the game's state: check the wait
    if (settled && settle && settle.key() !== settleFrom) settled();
    show();
  }

  /** @param {string|undefined} text */
  function setValue(text) {
    if (valueEl.textContent === (text || "")) return;
    valueEl.textContent = text || "";
    el.toggleAttribute("data-value", !!text);
  }

  /** @param {ControlDots|undefined} next */
  function setDots(next) {
    const same = dots && next && dots.lit === next.lit && dots.count === next.count;
    if (same || (!dots && !next)) return;
    dots = next;
    dotsEl.replaceChildren(...Array.from({ length: next ? next.count : 0 }, (_, i) =>
      h("span", { className: next && i < next.lit ? "control-dot lit" : "control-dot" })));
    el.toggleAttribute("data-dots", !!next);
    show();
  }
  /** @param {string} next @param {string} [nextIcon] */
  function setLabel(next, nextIcon) {
    if (nextIcon && nextIcon !== iconName) {
      iconName = nextIcon;
      const fresh = icon(nextIcon);
      iconEl.replaceWith(fresh);
      iconEl = fresh;
    }
    if (next === text) return;
    text = next;
    show();
  }

  set("unavailable");
  return { el, set, setDots, setValue, setLabel };
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** the pending border: a rect round the button, its dash running clockwise */
function loadingRing() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "control-ring");
  svg.setAttribute("aria-hidden", "true");
  const rect = document.createElementNS(SVG_NS, "rect");
  // the path's length as 100, whatever the button's size; the size and
  // corner here for browsers without CSS geometry (the theme's CSS wins)
  rect.setAttribute("pathLength", "100");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("rx", "12");
  svg.append(rect);
  return svg;
}
