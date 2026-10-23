// @ts-check
// The theme contract, and the one renderer that turns a theme's data into
// its chrome and screens. A theme with its own build() (Default) draws
// itself instead. Screens are built once and switched with `hidden`; the
// map frame moves into the visible screen's map slot.

import { createWidget, WIDGETS } from "../widgets/index.js";
import { h } from "../ui/dom.js";

/** @typedef {import("../store.js").Store} Store */
/** @typedef {import("../map/mapFrame.js").MapFrame} MapFrame */

/**
 * A place on a screen: a widget, or the map.
 * @typedef {{widget: string, variant?: string} | {map: "full"|"mini"}} Slot
 */

/**
 * One page of the terminal, picked with a tab.
 * @typedef {Object} Screen
 * @property {string} id
 * @property {string} label
 * @property {string} [icon]
 * @property {Slot[]} slots
 */

/**
 * @typedef {Object} Theme
 * @property {string} id "default", "newholland"
 * @property {string} label shown in the theme selector
 * @property {string} [note] under the label ("Not affiliated with ...")
 * @property {string[]} palettes "day", "night"; empty: one look only
 * @property {"corners"|"edge"} mapControls where the map's buttons go
 * @property {string} css the theme's stylesheet, from index.html
 * @property {{status?: string[], values?: string[], controls?: string[]}} [chrome]
 * @property {Screen[]} [screens]
 * @property {(app: HTMLElement, store: Store, frame: MapFrame) => Rendered} [build]
 *   draws the theme itself, ignoring chrome and screens
 */

/**
 * @typedef {Object} Rendered
 * @property {(id: string) => void} [showScreen]
 */

/**
 * What's wrong with a theme's data: unknown widget ids, screens with more
 * than one map slot, duplicate screen ids.
 * @param {Theme} theme
 * @param {string[]} [widgetIds]
 * @returns {string[]}
 */
export function checkTheme(theme, widgetIds = Object.keys(WIDGETS)) {
  /** @type {string[]} */
  const errors = [];
  const known = new Set(widgetIds);
  const want = (/** @type {string} */ id, /** @type {string} */ where) => {
    if (!known.has(id)) errors.push(`${where}: no widget "${id}"`);
  };
  for (const part of /** @type {const} */ (["status", "values"])) {
    for (const id of theme.chrome?.[part] || []) want(id, `chrome.${part}`);
  }
  const seen = new Set();
  for (const screen of theme.screens || []) {
    if (seen.has(screen.id)) errors.push(`screen "${screen.id}" twice`);
    seen.add(screen.id);
    let maps = 0;
    for (const slot of screen.slots) {
      if ("map" in slot) maps++;
      else want(slot.widget, `screen ${screen.id}`);
    }
    if (maps > 1) errors.push(`screen ${screen.id}: ${maps} map slots, at most 1`);
  }
  return errors;
}

/**
 * Draw the theme into #app and put the map frame in its map slot.
 * @param {Theme} theme
 * @param {HTMLElement} app
 * @param {Store} store
 * @param {MapFrame} frame
 * @returns {Rendered}
 */
export function renderTheme(theme, app, store, frame) {
  if (theme.build) return theme.build(app, store, frame);
  const errors = checkTheme(theme);
  if (errors.length) throw new Error(`theme ${theme.id}: ${errors.join("; ")}`);

  const chrome = theme.chrome || {};
  const screens = theme.screens || [];
  const status = h("header", { className: "status-bar" },
    ...(chrome.status || []).map((id) => createWidget(id, store)));
  const values = h("aside", { className: "value-column" },
    ...(chrome.values || []).map((id) => createWidget(id, store, { variant: "tile" })));
  // the controls arrive with ui/control.js (Themes T3)
  const controls = h("aside", { className: "control-column" });

  /** @type {Map<string, {el: HTMLElement, mapSlot: HTMLElement|null, tab: HTMLElement}>} */
  const built = new Map();
  const main = h("main", { className: "screens" });
  const tabs = h("nav", { className: "tab-bar" });
  for (const screen of screens) {
    const el = h("section", { className: "screen", hidden: true });
    el.dataset.screen = screen.id;
    /** @type {HTMLElement|null} */
    let mapSlot = null;
    for (const slot of screen.slots) {
      if ("map" in slot) {
        mapSlot = h("div", { className: `map-slot map-${slot.map}` });
        el.append(mapSlot);
      } else {
        el.append(h("div", { className: "slot" }, createWidget(slot.widget, store, { variant: slot.variant })));
      }
    }
    const tab = h("button", { className: "tab", text: screen.label });
    tab.setAttribute("type", "button");
    tab.dataset.screen = screen.id;
    tab.addEventListener("click", () => showScreen(screen.id));
    tabs.append(tab);
    main.append(el);
    built.set(screen.id, { el, mapSlot, tab });
  }

  /** @param {string} id */
  function showScreen(id) {
    for (const [screenId, s] of built) {
      const shown = screenId === id;
      s.el.hidden = !shown;
      s.tab.setAttribute("aria-pressed", String(shown));
      if (shown && s.mapSlot) frame.moveTo(s.mapSlot);
    }
  }

  app.replaceChildren(status, values, main, controls, tabs);
  if (screens.length) showScreen(screens[0].id);
  return { showScreen };
}
