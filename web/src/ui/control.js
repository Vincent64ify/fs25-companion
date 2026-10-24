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
// one.

import { icon } from "./icons.js";
import { h } from "./dom.js";

/** @typedef {"off"|"on"|"pending"|"unavailable"} ControlState */
/** @typedef {{lit: number, count: number}} ControlDots lit of count steps */
/** @typedef {import("../commands.js").CommandResult} CommandResult */

export const ERROR_SHOWN_MS = 2000;

/**
 * @param {{label: string, icon: string, tint?: "ok"|"alarm"}} def tint: the
 *   icon's colour while off (turn arrows OK, hazard alarm)
 * @param {() => Promise<CommandResult>} [press] sends the control's command
 * @returns {{el: HTMLButtonElement, set: (state: ControlState) => void,
 *   setDots: (dots: ControlDots|undefined) => void}}
 */
export function createControl(def, press) {
  const label = h("span", { className: "control-label", text: def.label });
  const el = /** @type {HTMLButtonElement} */ (h("button", { className: "control" },
    icon(def.icon), label));
  el.type = "button";
  if (def.tint) el.dataset.tint = def.tint;
  if (!press) el.setAttribute("aria-disabled", "true");

  const dotsEl = h("span", { className: "control-dots" });
  dotsEl.setAttribute("aria-hidden", "true");
  el.append(dotsEl);
  /** @type {ControlDots|undefined} */
  let dots;

  /** @type {ControlState} the game's state; shown unless a command is out */
  let state = "unavailable";
  let busy = false;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let errorTimer;

  function show() {
    const shown = busy ? "pending" : state;
    el.dataset.state = shown;
    el.setAttribute("aria-pressed", String(shown === "on"));
    const step = dots && shown !== "unavailable" ? `, stage ${dots.lit} of ${dots.count}` : "";
    el.setAttribute("aria-label", `${def.label}, ${shown}${step}`);
  }

  /** @param {string|undefined} reason */
  function showError(reason) {
    clearTimeout(errorTimer);
    el.dataset.error = "";
    label.textContent = "Failed";
    el.title = reason || "Failed";
    errorTimer = setTimeout(() => {
      delete el.dataset.error;
      label.textContent = def.label;
      el.removeAttribute("title");
    }, ERROR_SHOWN_MS);
  }

  async function fire() {
    if (!press || busy || state === "unavailable") return;
    busy = true;
    show();
    /** @type {CommandResult} */
    let result;
    try {
      result = await press();
    } catch (e) {
      result = { ok: false, reason: String(e) };
    }
    busy = false;
    show();
    if (!result.ok) showError(result.reason);
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

  /** @param {ControlState} next */
  function set(next) {
    state = next;
    show();
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
  set("unavailable");
  return { el, set, setDots };
}
