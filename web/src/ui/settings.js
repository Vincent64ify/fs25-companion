// @ts-check
// The Settings button and panel, the same in every theme (docs/THEMES.md,
// Settings entry): the button sits top-left in the header and opens and
// closes the panel (shown pressed while open). The panel starts with the
// theme, then Day / Night for a theme with palettes, then Screen (keep the
// screen on) where the browser allows it. Full screen is the status bar's
// button only (widgets/screen.js). The theme
// decides where the button and panel go; the panel's layer (a backdrop plus the panel) fills its
// parent, which is the main area under the header.

import { h } from "./dom.js";
import { icon } from "./icons.js";

/** @typedef {import("../themes/render.js").Theme} Theme */
/** @typedef {import("./screenMode.js").KeepAwake} KeepAwake */

const PALETTE_ICONS = { day: "sun", night: "dayNight" };

/**
 * @typedef {Object} Settings
 * @property {HTMLButtonElement} button
 * @property {HTMLElement} layer the backdrop and the panel; goes in the main area
 * @property {(open: boolean) => void} setOpen
 */

/**
 * @param {Object} opts
 * @param {Theme[]} opts.themes in the order the panel lists them
 * @param {Theme} opts.theme the one showing
 * @param {string|undefined} opts.palette
 * @param {(id: string) => void} opts.onTheme saves and reloads
 * @param {(palette: string) => void} opts.onPalette saves and applies
 * @param {KeepAwake} [opts.keepAwake]
 * @param {() => import("../commands.js").RoundTrips} [opts.roundTrips] the controls' round trips
 * @param {import("../themes/render.js").AutoPick} [opts.autoPick] the Vehicle tab picks Tractor or Harvester
 * @returns {Settings}
 */
export function createSettings({ themes, theme, palette, onTheme, onPalette, keepAwake, roundTrips, autoPick }) {
  const button = /** @type {HTMLButtonElement} */ (h("button", { className: "settings-button" },
    icon("settings"), h("span", { text: "Settings" })));
  button.type = "button";
  button.setAttribute("aria-controls", "settings-panel");

  const cards = themes.map((t) => {
    const input = /** @type {HTMLInputElement} */ (h("input"));
    input.type = "radio";
    input.name = "theme";
    input.value = t.id;
    input.checked = t.id === theme.id;
    input.addEventListener("change", () => { if (input.checked) onTheme(t.id); });
    const thumb = h("span", { className: "theme-thumb" }, ...Array.from({ length: 6 }, () => h("span")));
    thumb.dataset.thumb = t.id;
    thumb.setAttribute("aria-hidden", "true");
    // a tick drawn in CSS: it's a mark, not one of the icon set's symbols
    const check = h("span", { className: "theme-check" });
    check.setAttribute("aria-hidden", "true");
    return h("label", { className: "theme-card" }, input, thumb,
      h("span", { className: "theme-text" },
        h("span", { className: "theme-name", text: t.label }),
        h("span", { className: "theme-note", text: t.note || "" })),
      check);
  });
  const themeSet = h("fieldset", { className: "settings-group" },
    h("legend", { text: "Theme" }), ...cards,
    h("p", { className: "settings-note", text: "Saved on this device. Switching theme reloads the dashboard." }));

  const panel = h("section", { id: "settings-panel", className: "settings-panel" },
    h("h2", { text: "Settings" }), themeSet);
  panel.setAttribute("aria-label", "Settings");

  if (theme.palettes.length) {
    const choices = theme.palettes.map((p) => {
      const b = /** @type {HTMLButtonElement} */ (h("button", {},
        icon(/** @type {Record<string, string>} */ (PALETTE_ICONS)[p] || "dayNight"),
        h("span", { text: p[0].toUpperCase() + p.slice(1) })));
      b.type = "button";
      b.setAttribute("role", "radio");
      b.dataset.palette = p;
      b.addEventListener("click", () => {
        onPalette(p);
        mark(p);
      });
      return b;
    });
    const mark = (/** @type {string|undefined} */ current) => {
      for (const b of choices) b.setAttribute("aria-checked", String(b.dataset.palette === current));
    };
    mark(palette);
    const group = h("div", { className: "palette-switch" }, ...choices);
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "Day or night");
    panel.append(h("fieldset", { className: "settings-group" },
      h("legend", { text: "Display" }), group,
      h("p", { className: "settings-note", text: "Saved on this device. Nothing switches by itself." })));
  }

  /** @type {HTMLButtonElement[]} */
  const screenChoices = [];
  /** @type {string[]} */
  const screenNotes = [];
  /** @param {string} name @param {string} label */
  const toggle = (name, label) => {
    const b = /** @type {HTMLButtonElement} */ (h("button", {}, icon(name), h("span", { text: label })));
    b.type = "button";
    screenChoices.push(b);
    return b;
  };
  if (keepAwake?.supported) {
    const b = toggle("keepAwake", "Keep screen on");
    b.dataset.choice = "keepAwake";
    const mark = () => b.setAttribute("aria-pressed", String(keepAwake.wanted()));
    mark();
    b.addEventListener("click", () => {
      keepAwake.set(!keepAwake.wanted());
      mark();
    });
    screenNotes.push("Keep screen on is saved on this device.");
  }
  if (autoPick) {
    const b = toggle("harvester", "Screen for what I drive");
    b.dataset.choice = "autoPick";
    const mark = () => b.setAttribute("aria-pressed", String(autoPick.wanted()));
    mark();
    b.addEventListener("click", () => {
      autoPick.set(!autoPick.wanted());
      mark();
    });
    screenNotes.push("Screen for what I drive: the Vehicle tab shows the Harvester screen in a combine, " +
      "the Tractor screen otherwise; tap the tab again to choose.");
  }
  if (screenChoices.length) {
    panel.append(h("fieldset", { className: "settings-group" },
      h("legend", { text: "Screen" }), h("div", { className: "screen-switch" }, ...screenChoices),
      h("p", { className: "settings-note", text: screenNotes.join(" ") })));
  }

  // Controls C3: tap to the mod's answer, for the last commands
  /** @type {(() => void)|undefined} */
  let showTrips;
  if (roundTrips) {
    const value = h("b", { className: "round-trip-value" });
    const detail = h("span", { className: "round-trip-detail" });
    showTrips = () => {
      const t = roundTrips();
      const ms = (/** @type {number} */ n) => `${Math.round(n)} ms`;
      value.textContent = t.count && t.median !== undefined ? ms(t.median) : "–";
      detail.textContent = t.count && t.last !== undefined && t.max !== undefined
        ? `median of the last ${t.count} · last ${ms(t.last)} · slowest ${ms(t.max)}`
        : "Tap a control to measure";
    };
    panel.append(h("fieldset", { className: "settings-group" },
      h("legend", { text: "Controls" }),
      h("div", { className: "round-trip" }, h("span", { text: "Round trip" }), value), detail,
      h("p", { className: "settings-note", text: "From a tap to the game's answer, on this device." })));
  }
  /** @type {ReturnType<typeof setInterval>|undefined} */
  let tripTimer;

  const backdrop = h("div", { className: "settings-backdrop" });
  const layer = h("div", { className: "settings-layer", hidden: true }, backdrop, panel);

  /** @param {boolean} open */
  function setOpen(open) {
    layer.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    clearInterval(tripTimer);
    if (open && showTrips) {
      showTrips();
      tripTimer = setInterval(showTrips, 1000);
    }
    if (open) /** @type {HTMLElement|null} */ (panel.querySelector("input:checked"))?.focus();
  }
  setOpen(false);
  button.addEventListener("click", () => setOpen(layer.hidden));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !layer.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  return { button, layer, setOpen };
}
