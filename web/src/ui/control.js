// @ts-check
// A control: an icon button for a game action (docs/THEMES.md, Controls).
// Four states: off, on, pending, unavailable. Until the "control the game"
// project wires a command, it only shows the game's state: no click
// handler, no press feedback, and aria-disabled so it isn't announced as
// something to press.

import { icon } from "./icons.js";
import { h } from "./dom.js";

/** @typedef {"off"|"on"|"pending"|"unavailable"} ControlState */

/**
 * @param {{label: string, icon: string, tint?: "ok"|"alarm"}} def tint: the
 *   icon's colour while off (turn arrows OK, hazard alarm)
 * @returns {{el: HTMLButtonElement, set: (state: ControlState) => void}}
 */
export function createControl(def) {
  const el = /** @type {HTMLButtonElement} */ (h("button", { className: "control" },
    icon(def.icon), h("span", { className: "control-label", text: def.label })));
  el.type = "button";
  el.setAttribute("aria-disabled", "true");
  if (def.tint) el.dataset.tint = def.tint;

  /** @param {ControlState} state */
  function set(state) {
    if (el.dataset.state === state) return;
    el.dataset.state = state;
    el.setAttribute("aria-pressed", String(state === "on"));
    el.setAttribute("aria-label", `${def.label}, ${state}`);
  }
  set("unavailable");
  return { el, set };
}
