// @ts-check
// The widget contract. A widget shows one live value or list:
// create(store, {variant}) returns an element that keeps itself up to date.
// Variants differ in markup only; themes style them. Without data a widget
// hides itself, or shows "–" when the theme asks for it (whenMissing:
// "dash", Default's rows and gauges).

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
 * @property {string} [unit] beside the number in the gauge and tile variants
 * @property {string[]} topics the store keys it reads
 * @property {(store: Store) => any} read the raw value, undefined when missing
 * @property {(raw: any) => string} text with its unit, for rows ("85°C")
 * @property {(raw: any) => string} [number] the number alone ("85"); default text
 * @property {string} [icon] a name in ui/icons.js, for the tile and readout variants
 * @property {(raw: any) => "warn"|"alarm"|undefined} [level] sets data-level on the root
 * @property {(raw: any) => number} [meter] 0..100: the readout variant adds a bar
 */

/**
 * Markup per variant: [root, the element showing the value].
 * @type {Record<string, (def: ValueDef) => [HTMLElement, HTMLElement]>}
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
    return [h("div", { className: "gauge" }, value, h("small", { text: def.unit || def.label.toLowerCase() })), value];
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
    if (def.unit) root.append(h("span", { className: "widget-unit", text: def.unit }));
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
    if (def.unit) root.append(value, h("small", { text: def.unit }));
    else root.append(h("small", { text: def.label }), value);
    return [root, value];
  },
};

const NUMBER_VARIANTS = new Set(["gauge", "tile", "readout"]);

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
    const [root, value] = make(def);
    if (opts.id) root.id = opts.id;
    const asNumber = NUMBER_VARIANTS.has(variant);
    const bar = /** @type {HTMLElement|null} */ (root.querySelector(".widget-meter > span"));

    const render = () => {
      const raw = def.read(store);
      const missing = raw === undefined;
      root.hidden = missing && opts.whenMissing !== "dash";
      value.textContent = missing ? "–" : (asNumber && def.number ? def.number(raw) : def.text(raw));
      if (def.level) {
        const level = missing ? undefined : def.level(raw);
        if (level) root.dataset.level = level;
        else delete root.dataset.level;
      }
      if (bar && def.meter) bar.style.width = missing ? "0" : `${Math.max(0, Math.min(100, def.meter(raw)))}%`;
    };
    for (const topic of def.topics) store.subscribe(topic, render);
    return root;
  };
}
