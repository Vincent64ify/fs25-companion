// @ts-check
// The theme contract, and the one renderer that turns a theme's data into
// its chrome and screens. Screens are built once and switched with
// `hidden`; the map frame moves into the visible screen's map slot.

import { createWidget, WIDGETS } from "../widgets/index.js";
import { controlGroup, CONTROLS } from "../widgets/controls.js";
import { h } from "../ui/dom.js";
import { hasIcon, icon } from "../ui/icons.js";

/** @typedef {import("../store.js").Store} Store */
/** @typedef {import("../map/mapFrame.js").MapFrame} MapFrame */
/** @typedef {import("../ui/settings.js").Settings} Settings */
/** @typedef {import("../widgets/controls.js").ControlGroup} ControlGroup */

/**
 * A widget by id, or with the variant to draw it in.
 * @typedef {string | {widget: string, variant?: string}} WidgetRef
 */

/**
 * A place on a screen: a widget (and what it shows without data), the map,
 * the theme's control groups (less the ones `omit` names, for a screen
 * that shows them elsewhere), or a group of slots the theme's CSS lays out
 * together (data-group).
 * @typedef {{widget: string, variant?: string, whenMissing?: "hide"|"dash"} | {map: "full"|"mini"}
 *   | {controls: true, omit?: string[]} | {group: string, slots: Slot[]}} Slot
 */

/**
 * One page of the terminal, picked with a tab.
 * @typedef {Object} Screen
 * @property {string} id
 * @property {string} label
 * @property {string} [icon]
 * @property {Slot[]} slots
 * @property {WidgetRef[]} [readout] widgets in the tab bar while this screen shows
 */

/**
 * The status bar: left, centre and right. A plain list is the left part.
 * @typedef {WidgetRef[] | {start?: WidgetRef[], centre?: WidgetRef[], end?: WidgetRef[]}} StatusBar
 */

/**
 * @typedef {Object} Theme
 * @property {string} id "newholland"
 * @property {string} label shown in the theme selector
 * @property {string} [note] under the label ("Not affiliated with ...")
 * @property {string[]} palettes "day", "night"; empty: one look only
 * @property {string} css the theme's stylesheet, from index.html
 * @property {{status?: StatusBar, values?: string[], controls?: ControlGroup[]}} [chrome]
 * @property {Screen[]} [screens]
 */

/**
 * @typedef {Object} Rendered
 * @property {(id: string) => void} [showScreen]
 * @property {string} [mapScreen] the first screen with a map slot
 */

/** Every slot of a screen, groups opened. @param {Slot[]} slots @returns {Slot[]} */
const flatSlots = (slots) => slots.flatMap((slot) => ("group" in slot ? flatSlots(slot.slots) : [slot]));

/** @param {WidgetRef} ref @returns {{widget: string, variant?: string}} */
const asRef = (ref) => (typeof ref === "string" ? { widget: ref } : ref);

/** @param {StatusBar|undefined} status */
function statusParts(status) {
  if (!status) return { start: [], centre: [], end: [] };
  if (Array.isArray(status)) return { start: status, centre: [], end: [] };
  return { start: status.start || [], centre: status.centre || [], end: status.end || [] };
}

/**
 * What's wrong with a theme's data: unknown widget, control or icon names,
 * screens with more than one map slot, duplicate screen ids.
 * @param {Theme} theme
 * @param {string[]} [widgetIds]
 * @returns {string[]}
 */
export function checkTheme(theme, widgetIds = Object.keys(WIDGETS)) {
  /** @type {string[]} */
  const errors = [];
  const known = new Set(widgetIds);
  const want = (/** @type {WidgetRef} */ ref, /** @type {string} */ where) => {
    const id = asRef(ref).widget;
    if (!known.has(id)) errors.push(`${where}: no widget "${id}"`);
  };
  const wantIcon = (/** @type {string|undefined} */ name, /** @type {string} */ where) => {
    if (name && !hasIcon(name)) errors.push(`${where}: no icon "${name}"`);
  };
  const chrome = theme.chrome || {};
  for (const [part, refs] of Object.entries(statusParts(chrome.status))) {
    for (const ref of refs) want(ref, `chrome.status.${part}`);
  }
  for (const id of chrome.values || []) want(id, "chrome.values");
  for (const group of chrome.controls || []) {
    for (const id of group.controls) {
      if (!CONTROLS[id]) errors.push(`chrome.controls: no control "${id}"`);
      else wantIcon(CONTROLS[id].icon, `control ${id}`);
    }
  }
  const seen = new Set();
  for (const screen of theme.screens || []) {
    if (seen.has(screen.id)) errors.push(`screen "${screen.id}" twice`);
    seen.add(screen.id);
    wantIcon(screen.icon, `screen ${screen.id}`);
    let maps = 0;
    for (const slot of flatSlots(screen.slots)) {
      if ("map" in slot) maps++;
      else if ("widget" in slot) want(slot.widget, `screen ${screen.id}`);
      else if ("controls" in slot) {
        for (const id of slot.omit || []) {
          if (!CONTROLS[id]) errors.push(`screen ${screen.id}: omits no control "${id}"`);
        }
      }
    }
    if (maps > 1) errors.push(`screen ${screen.id}: ${maps} map slots, at most 1`);
    for (const ref of screen.readout || []) want(ref, `screen ${screen.id} readout`);
  }
  return errors;
}

/**
 * Draw the theme into #app and put the map frame in its map slot.
 * @param {Theme} theme
 * @param {HTMLElement} app
 * @param {Store} store
 * @param {MapFrame} frame
 * @param {Settings} [settings] the Settings button and panel (ui/settings.js)
 * @returns {Rendered}
 */
export function renderTheme(theme, app, store, frame, settings) {
  const errors = checkTheme(theme);
  if (errors.length) throw new Error(`theme ${theme.id}: ${errors.join("; ")}`);

  const chrome = theme.chrome || {};
  const screens = theme.screens || [];
  /** @param {WidgetRef[]} refs */
  const widgets = (refs) => refs.map((ref) => {
    const { widget, variant } = asRef(ref);
    return createWidget(widget, store, { variant });
  });

  const parts = statusParts(chrome.status);
  const status = h("header", { className: "status-bar" },
    h("div", { className: "status-start" }, ...(settings ? [settings.button] : []), ...widgets(parts.start)),
    h("div", { className: "status-centre" }, ...widgets(parts.centre)),
    h("div", { className: "status-end" }, ...widgets(parts.end)));
  const values = chrome.values?.length
    ? h("aside", { className: "value-column" },
      ...chrome.values.map((id) => createWidget(id, store, { variant: "tile" })))
    : null;

  /** @type {Map<string, {el: HTMLElement, mapSlot: HTMLElement|null, tab: HTMLElement, readout: HTMLElement|null}>} */
  const built = new Map();
  const main = h("main", { className: "screens" });
  const tabList = h("div", { className: "tabs" });
  const tabs = h("nav", { className: "tab-bar" }, tabList);
  tabs.setAttribute("aria-label", "Screens");
  for (const screen of screens) {
    const el = h("section", { className: "screen", hidden: true });
    el.dataset.screen = screen.id;
    el.setAttribute("aria-label", screen.label);
    /** @type {HTMLElement|null} */
    let mapSlot = null;
    /** @param {Slot[]} slots @param {HTMLElement} parent */
    const place = (slots, parent) => {
      for (const slot of slots) {
        if ("map" in slot) {
          mapSlot = h("div", { className: `map-slot map-${slot.map}` });
          parent.append(mapSlot);
        } else if ("controls" in slot) {
          const omit = new Set(slot.omit || []);
          const groups = (chrome.controls || [])
            .map((group) => ({ ...group, controls: group.controls.filter((id) => !omit.has(id)) }))
            .filter((group) => group.controls.length);
          const column = h("aside", { className: "control-column" },
            ...groups.map((group) => controlGroup(group, store)));
          column.setAttribute("aria-label", "Controls");
          parent.append(column);
        } else if ("group" in slot) {
          const group = h("div", { className: "slot-group" });
          group.dataset.group = slot.group;
          place(slot.slots, group);
          parent.append(group);
        } else {
          const { widget, variant, whenMissing } = slot;
          parent.append(h("div", { className: "slot" }, createWidget(widget, store, { variant, whenMissing })));
        }
      }
    };
    place(screen.slots, el);
    const tab = h("button", { className: "tab" },
      ...(screen.icon ? [icon(screen.icon)] : []), h("span", { className: "tab-label", text: screen.label }));
    tab.setAttribute("type", "button");
    tab.title = screen.label;
    tab.dataset.screen = screen.id;
    tab.addEventListener("click", () => showScreen(screen.id));
    tabList.append(tab);
    const readout = screen.readout?.length
      ? h("div", { className: "tab-readout", hidden: true }, ...widgets(screen.readout))
      : null;
    if (readout) {
      readout.dataset.screen = screen.id;
      readout.setAttribute("aria-label", "Vehicle readout");
      tabs.append(readout);
    }
    main.append(el);
    built.set(screen.id, { el, mapSlot, tab, readout });
  }
  if (settings) main.append(settings.layer);

  /** @param {string} id */
  function showScreen(id) {
    for (const [screenId, s] of built) {
      const shown = screenId === id;
      s.el.hidden = !shown;
      if (s.readout) s.readout.hidden = !shown;
      s.tab.setAttribute("aria-pressed", String(shown));
      if (shown && s.mapSlot) frame.moveTo(s.mapSlot);
    }
    app.dataset.screen = id;
  }

  app.replaceChildren(...[status, values, main, tabs].filter((el) => el !== null));
  if (screens.length) showScreen(screens[0].id);
  const mapScreen = screens.find((screen) => flatSlots(screen.slots).some((slot) => "map" in slot))?.id;
  return { showScreen, mapScreen };
}
