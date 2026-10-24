// @ts-check
// The widget contract. A widget shows one live value or list:
// create(store, {variant}) returns an element that keeps itself up to date.
// Variants differ in markup only; themes style them. Without data a widget
// hides itself, or shows "–" when the theme asks for it (whenMissing:
// "dash", New Holland's condition tiles).

import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../store.js").Store} Store */

/**
 * @typedef {Object} WidgetOptions
 * @property {string} [variant] the markup to use; each widget has a default
 * @property {"hide"|"dash"} [whenMissing] default "hide"
 * @property {string} [id] id of the returned element
 */

/** @typedef {(store: Store, opts?: WidgetOptions) => HTMLElement} CreateWidget */

/**
 * One live value.
 * @typedef {Object} ValueDef
 * @property {string} label "Engine temp"
 * @property {string|((store: Store) => string)} [unit] beside the number in the gauge and tile
 *   variants; a function for units that follow the game's settings (km/h or mph)
 * @property {string[]} topics the store keys it reads
 * @property {(store: Store) => any} read the raw value, undefined when missing
 * @property {(raw: any, store: Store) => string} text with its unit, for rows ("85°C")
 * @property {(raw: any, store: Store) => string} [number] the number alone ("85"); default text
 * @property {string} [icon] a name in ui/icons.js, for the tile and readout variants
 * @property {(raw: any) => "warn"|"alarm"|undefined} [level] sets data-level on the root
 * @property {(raw: any) => number} [meter] 0..100: the readout variant adds a bar
 * @property {(raw: any) => number} [bar] 0..100 for the condition variant's bar; default meter
 * @property {(store: Store) => string|undefined} [detail] beside the number in the condition variant ("72 L")
 * @property {string} [note] under the number in the condition variant, in place of a bar
 */

/** The unit's element, marked so a unit that follows the settings can change. */
function unitEl(/** @type {string} */ tag, /** @type {string} */ text, /** @type {string} */ className = "") {
  const el = h(tag, { className, text });
  el.dataset.unit = "";
  return el;
}

/**
 * Markup per variant: [root, the element showing the value]. The unit is
 * already resolved to its text.
 * @type {Record<string, (def: ValueDef & {unit?: string}) => [HTMLElement, HTMLElement]>}
 */
const VARIANTS = {
  // <div><dt>Fuel</dt><dd>57%</dd></div>, in a <dl>
  row(def) {
    const value = h("dd");
    return [h("div", {}, h("dt", { text: def.label }), value), value];
  },
  // big number over its unit
  gauge(def) {
    const value = h("span");
    return [h("div", { className: "gauge" }, value, unitEl("small", def.unit || def.label.toLowerCase())), value];
  },
  // the value as a title (the vehicle's name)
  title() {
    const value = h("h2");
    return [value, value];
  },
  // label, number and unit, each in its own span (and the icon first)
  tile(def) {
    const value = h("span", { className: "widget-value" });
    const root = h("div", { className: "widget-tile" },
      h("span", { className: "widget-label", text: def.label }), value);
    if (def.unit) root.append(unitEl("span", def.unit, "widget-unit"));
    if (def.icon) root.prepend(icon(def.icon));
    return [root, value];
  },
  // the value alone, as text (a status bar's map name or money)
  text(def) {
    const value = h("span", { className: "widget-text" });
    value.title = def.label;
    return [value, value];
  },
  // a slim readout: number then unit, or label then number when there's no
  // unit ("Gear F4"); a value with a meter (fuel) starts with its icon and bar
  readout(def) {
    const value = h("b", { className: "widget-value" });
    const root = h("span", { className: "widget-readout" });
    root.title = def.label;
    if (def.meter) {
      if (def.icon) root.append(icon(def.icon));
      root.append(h("span", { className: "widget-meter" }, h("span")));
    }
    if (def.unit) root.append(value, unitEl("small", def.unit));
    else root.append(h("small", { text: def.label }), value);
    return [root, value];
  },
  // a condition tile (Vehicle screen): icon badge and label, the number with
  // its unit and detail, then a bar or a note
  condition(def) {
    const value = h("span", { className: "widget-value" });
    const root = h("div", { className: "widget-condition" },
      h("div", { className: "widget-head" }, ...(def.icon ? [icon(def.icon)] : []),
        h("span", { className: "widget-label", text: def.label })),
      h("div", { className: "widget-number" }, value,
        ...(def.unit ? [unitEl("span", def.unit, "widget-unit")] : []),
        ...(def.detail ? [h("span", { className: "widget-detail" })] : [])));
    if (def.note) root.append(h("div", { className: "widget-note", text: def.note }));
    else if (def.bar || def.meter) root.append(h("span", { className: "widget-meter" }, h("span")));
    return [root, value];
  },
};

const NUMBER_VARIANTS = new Set(["gauge", "tile", "readout", "condition"]);

/**
 * @param {ValueDef} def
 * @param {string} [defaultVariant]
 * @returns {CreateWidget}
 */
export function valueWidget(def, defaultVariant = "row") {
  return (store, opts = {}) => {
    const variant = opts.variant || defaultVariant;
    const make = VARIANTS[variant];
    if (!make) throw new Error(`no widget variant "${variant}"`);
    const unitOf = typeof def.unit === "function" ? def.unit : undefined;
    const [root, value] = make(unitOf ? { ...def, unit: unitOf(store) } : /** @type {any} */ (def));
    if (opts.id) root.id = opts.id;
    const unitEls = unitOf ? [...root.querySelectorAll("[data-unit]")] : [];
    const asNumber = NUMBER_VARIANTS.has(variant);
    const bar = /** @type {HTMLElement|null} */ (root.querySelector(".widget-meter > span"));
    const fill = def.bar || def.meter;
    const detail = /** @type {HTMLElement|null} */ (root.querySelector(".widget-detail"));

    const render = () => {
      const raw = def.read(store);
      const missing = raw === undefined;
      root.hidden = missing && opts.whenMissing !== "dash";
      value.textContent = missing ? "–" : (asNumber && def.number ? def.number(raw, store) : def.text(raw, store));
      if (unitOf) for (const el of unitEls) el.textContent = unitOf(store);
      if (def.level) {
        const level = missing ? undefined : def.level(raw);
        if (level) root.dataset.level = level;
        else delete root.dataset.level;
      }
      if (bar && fill) bar.style.width = missing ? "0" : `${Math.max(0, Math.min(100, fill(raw)))}%`;
      if (detail && def.detail) detail.textContent = (!missing && def.detail(store)) || "";
    };
    for (const topic of def.topics) store.subscribe(topic, render);
    return root;
  };
}
