// @ts-check
// The theme contract, and the one renderer that turns a theme's data into
// its chrome and screens. Screens are built once and switched with
// `hidden`; the map frame moves into the visible screen's map slot.

import { createWidget, WIDGETS } from "../widgets/index.js";
import { controlGroup, CONTROLS } from "../widgets/controls.js";
import { isHarvester } from "../widgets/harvesterScreen.js";
import { hasLoader } from "../widgets/vehicleScreen.js";
import { controlledVehicle } from "../data/selectors.js";
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
 * that shows them elsewhere, plus the screen's own groups in `add`), or a
 * group of slots the theme's CSS lays out together (data-group).
 * @typedef {{widget: string, variant?: string, whenMissing?: "hide"|"dash"} | {map: "full"|"mini"}
 *   | {controls: true, omit?: string[], add?: ControlGroup[]} | {group: string, slots: Slot[]}} Slot
 */

/**
 * One page of the terminal, picked with a tab.
 * @typedef {Object} Screen
 * @property {string} id
 * @property {string} label
 * @property {string} [icon]
 * @property {Slot[]} slots
 * @property {WidgetRef[]} [readout] widgets in the tab bar while this screen shows
 * @property {string} [tab] another screen whose tab this one shares (the
 *   Harvester screen on the Vehicle tab): a second tap on that tab offers
 *   both, by their `choice` labels
 * @property {string} [choice] its name in that tab's menu ("Vehicle")
 * @property {keyof typeof DETECT} [when] the tab picks this screen by itself
 *   while this holds, with the auto pick on
 */

/** What a screen's `when` can name: whether the store's state calls for it. */
export const DETECT = {
  harvester: (/** @type {Store} */ store) => isHarvester(controlledVehicle(store)),
  loader: (/** @type {Store} */ store) => hasLoader(controlledVehicle(store)),
};

/**
 * Whether a tab picks its screen by what you drive (Settings, Screen).
 * @typedef {{wanted: () => boolean, set: (on: boolean) => void}} AutoPick
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
    if (screen.tab !== undefined && !(theme.screens || []).some((s) => s.id === screen.tab && !s.tab)) {
      errors.push(`screen ${screen.id}: no tab "${screen.tab}"`);
    }
    if (screen.when !== undefined && !(screen.when in DETECT)) errors.push(`screen ${screen.id}: no detector "${screen.when}"`);
    let maps = 0;
    for (const slot of flatSlots(screen.slots)) {
      if ("map" in slot) maps++;
      else if ("widget" in slot) want(slot.widget, `screen ${screen.id}`);
      else if ("controls" in slot) {
        for (const id of slot.omit || []) {
          if (!CONTROLS[id]) errors.push(`screen ${screen.id}: omits no control "${id}"`);
        }
        for (const id of (slot.add || []).flatMap((group) => group.controls)) {
          if (!CONTROLS[id]) errors.push(`screen ${screen.id}: adds no control "${id}"`);
          else wantIcon(CONTROLS[id].icon, `control ${id}`);
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
 * @param {AutoPick} [autoPick] whether shared tabs pick their screen by themselves
 * @returns {Rendered}
 */
export function renderTheme(theme, app, store, frame, settings, autoPick) {
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
  /** the tab each screen is on: its own, or the one it shares */
  const tabOf = (/** @type {Screen} */ screen) => screen.tab || screen.id;
  /** @typedef {{button: HTMLElement, screens: Screen[], pick: string, menu: HTMLElement|null,
   *   away: ((ev: Event) => void)|null}} TabGroup */
  /** @type {Map<string, TabGroup>} */
  const tabGroups = new Map();
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
            .filter((group) => group.controls.length)
            .concat(slot.add || []);
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
    const shared = tabGroups.get(tabOf(screen));
    /** @type {HTMLElement} */
    let tab;
    if (shared) {
      shared.screens.push(screen);
      tab = shared.button;
      // a tab of several pages: a chevron for its menu
      if (!tab.querySelector(".tab-more")) {
        const more = h("span", { className: "tab-more" });
        more.setAttribute("aria-hidden", "true");
        tab.append(more);
      }
    } else {
      tab = h("button", { className: "tab" },
        ...(screen.icon ? [icon(screen.icon)] : []), h("span", { className: "tab-label", text: screen.label }));
      tab.setAttribute("type", "button");
      tab.title = screen.label;
      tab.dataset.screen = screen.id;
      /** @type {TabGroup} */
      const group = { button: tab, screens: [screen], pick: screen.id, menu: null, away: null };
      tabGroups.set(screen.id, group);
      tab.addEventListener("click", () => tapTab(group));
      tabList.append(tab);
    }
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

  // a shared tab: a tap shows its screen (the one picked), a tap on the
  // tab already shown opens the menu of its screens
  /** @param {TabGroup} group */
  function closeMenu(group) {
    group.menu?.remove();
    group.menu = null;
    // however it closes: a stale listener would close the next menu on press
    if (group.away) document.removeEventListener("pointerdown", group.away, true);
    group.away = null;
    group.button.setAttribute("aria-expanded", "false");
  }
  /** @param {TabGroup} group */
  function tapTab(group) {
    const onIt = group.screens.some((s) => s.id === app.dataset.screen);
    if (!onIt || group.screens.length < 2) {
      showScreen(group.pick);
      return;
    }
    if (group.menu) {
      closeMenu(group);
      return;
    }
    const menu = h("div", { className: "tab-menu" }, ...group.screens.map((s) => {
      const b = h("button", {}, ...(s.icon ? [icon(s.icon)] : []), h("span", { text: s.choice || s.label }));
      b.setAttribute("type", "button");
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(s.id === app.dataset.screen));
      b.addEventListener("click", () => {
        closeMenu(group);
        showScreen(s.id);
      });
      return b;
    }));
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", group.screens[0].label);
    const box = group.button.getBoundingClientRect();
    menu.style.left = `${Math.round(box.left)}px`;
    menu.style.bottom = `${Math.round(window.innerHeight - box.top + 8)}px`;
    app.append(menu);
    group.menu = menu;
    group.button.setAttribute("aria-expanded", "true");
    // a press anywhere else closes it
    group.away = (/** @type {Event} */ ev) => {
      const target = /** @type {Node} */ (ev.target);
      if (!menu.contains(target) && !group.button.contains(target)) closeMenu(group);
    };
    document.addEventListener("pointerdown", group.away, true);
  }

  /**
   * The page a tab opens on. The tab wears its icon (a tractor, a combine)
   * and names it after its own: "Vehicle · Harvester" ("Vehicle" alone on
   * the tab's first page).
   * @param {TabGroup} group
   * @param {Screen} screen
   */
  function setPick(group, screen) {
    group.pick = screen.id;
    if (screen.icon) group.button.querySelector(".icon")?.replaceWith(icon(screen.icon));
    const first = group.screens[0];
    const name = screen === first ? first.label : `${first.label} · ${screen.choice || screen.label}`;
    const label = group.button.querySelector(".tab-label");
    if (label) label.textContent = name;
    group.button.title = name;
  }

  /** @param {string} id */
  function showScreen(id) {
    const screen = screens.find((s) => s.id === id);
    const group = screen && tabGroups.get(tabOf(screen));
    if (group && screen) setPick(group, screen);
    for (const [screenId, s] of built) {
      const shown = screenId === id;
      s.el.hidden = !shown;
      if (s.readout) s.readout.hidden = !shown;
      if (shown && s.mapSlot) frame.moveTo(s.mapSlot);
    }
    for (const g of tabGroups.values()) {
      g.button.setAttribute("aria-pressed", String(g.screens.some((s) => s.id === id)));
    }
    app.dataset.screen = id;
  }

  // the auto pick: when what you drive changes, a shared tab takes the
  // screen for it (shown at once if that tab is open); a pick by hand
  // stays until it changes again
  /** @type {Map<string, string>} */
  const detected = new Map();
  const autoDetect = () => {
    for (const [tabId, group] of tabGroups) {
      if (group.screens.length < 2) continue;
      const fits = group.screens.find((s) => s.when && DETECT[s.when](store)) || group.screens[0];
      if (detected.get(tabId) === fits.id) continue;
      detected.set(tabId, fits.id);
      if (autoPick && !autoPick.wanted()) continue;
      if (group.screens.some((s) => s.id === app.dataset.screen)) showScreen(fits.id);
      else setPick(group, fits);
    }
  };
  store.subscribe("vehicles", autoDetect);

  app.replaceChildren(...[status, values, main, tabs].filter((el) => el !== null));
  if (screens.length) showScreen(screens[0].id);
  const mapScreen = screens.find((screen) => flatSlots(screen.slots).some((slot) => "map" in slot))?.id;
  return { showScreen, mapScreen };
}
