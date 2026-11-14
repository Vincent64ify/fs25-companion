// @ts-check
// The game speed panel (specs/0017): opened from the status bar's pill, in
// the main area like the Settings panel (a backdrop plus the panel, 12
// below the status bar, never over it). It holds every step the game's 7
// and 8 go through (from the mod) in one well, the current one raised and
// ringed. A tap on a step asks for that speed: pending on touch-down until
// the mod answers; ok closes the panel, a failure says "Failed" on the
// step tapped (spec 0013 revision 6) and the panel stays open.

import { h } from "./dom.js";
import { ERROR_SHOWN_MS } from "./control.js";

/** @typedef {import("../commands.js").CommandResult} CommandResult */

/** "0.5", "5", "360": a step as the game shows it */
export const speedText = (/** @type {number} */ v) => String(Math.round(v * 1000) / 1000);

/**
 * @typedef {Object} SpeedPanel
 * @property {HTMLElement} layer the backdrop and the panel; goes in the main area
 * @property {(steps: number[]) => void} setSteps the game's steps, slowest first
 * @property {(speed: number|undefined) => void} setCurrent the speed shown (ringed)
 * @property {(open: boolean) => void} setOpen
 * @property {() => boolean} isOpen
 */

/**
 * @param {Object} opts
 * @param {(value: number) => Promise<CommandResult>} opts.ask sends timeScale.set
 * @param {(value: number) => void} opts.onOk the mod checked the speed
 * @param {(open: boolean) => void} opts.onOpen the panel opened or closed
 * @returns {SpeedPanel}
 */
export function createSpeedPanel({ ask, onOk, onOpen }) {
  const well = h("div", { className: "speed-steps" });
  well.setAttribute("role", "group");
  well.setAttribute("aria-label", "Game speed steps");
  const panel = h("section", { id: "speed-panel", className: "speed-panel" },
    h("h2", { text: "Game speed" }), well);
  panel.setAttribute("aria-label", "Game speed");
  const backdrop = h("div", { className: "speed-backdrop" });
  backdrop.setAttribute("aria-hidden", "true");
  const layer = h("div", { className: "speed-layer", hidden: true }, backdrop, panel);

  /** @type {number[]} */
  let steps = [];
  /** @type {number|undefined} */
  let current;
  /** @type {number|undefined} the step asked for, while its answer is out */
  let pending;
  /** @type {number|undefined} the step whose tap failed, while "Failed" shows */
  let failed;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let failTimer;
  /** @type {HTMLButtonElement[]} */
  let buttons = [];

  function show() {
    for (const b of buttons) {
      const v = Number(b.dataset.value);
      const isFailed = v === failed;
      b.dataset.state = v === pending ? "pending" : "off";
      b.toggleAttribute("data-error", isFailed);
      if (v === current) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
      b.replaceChildren(...(isFailed ? [document.createTextNode("Failed")]
        : [h("span", { className: "speed-x", text: "×" }), document.createTextNode(speedText(v))]));
      b.setAttribute("aria-label", `${isFailed ? "Failed: " : ""}Game speed ×${speedText(v)}`);
    }
  }

  /** @param {number} v */
  async function press(v) {
    if (pending !== undefined) return;
    clearTimeout(failTimer);
    failed = undefined;
    pending = v;
    show();
    /** @type {CommandResult} */
    let result;
    try {
      result = await ask(v);
    } catch (e) {
      result = { ok: false, reason: String(e) };
    }
    pending = undefined;
    if (result.ok) {
      current = v;
      show();
      onOk(v);
      setOpen(false);
      return;
    }
    failed = v;
    show();
    const b = buttons.find((x) => Number(x.dataset.value) === v);
    if (b) b.title = result.reason || "Failed";
    failTimer = setTimeout(() => {
      failed = undefined;
      if (b) b.removeAttribute("title");
      show();
    }, ERROR_SHOWN_MS);
  }

  /** @param {number[]} next */
  function setSteps(next) {
    if (next.join(",") === steps.join(",")) return;
    steps = next.slice();
    buttons = steps.map((v) => {
      const b = /** @type {HTMLButtonElement} */ (h("button", { className: "speed-step" }));
      b.type = "button";
      b.dataset.value = String(v);
      // touch-down, not click: a tap must feel instant (ui/control.js)
      b.addEventListener("pointerdown", (ev) => { if (ev.button === 0) press(v); });
      // the keyboard (Enter, Space) clicks with detail 0
      b.addEventListener("click", (ev) => { if (ev.detail === 0) press(v); });
      return b;
    });
    well.replaceChildren(...buttons);
    show();
  }

  /** @param {number|undefined} speed */
  function setCurrent(speed) {
    if (speed === current) return;
    current = speed;
    show();
  }

  /** @param {boolean} open */
  function setOpen(open) {
    if (open === !layer.hidden) return;
    layer.hidden = !open;
    if (!open) {
      clearTimeout(failTimer);
      failed = undefined;
      show();
    }
    onOpen(open);
  }
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !layer.hidden) setOpen(false);
  });

  return { layer, setSteps, setCurrent, setOpen, isOpen: () => !layer.hidden };
}
