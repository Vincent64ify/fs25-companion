// @ts-check
// The widget contract. A widget shows one live value or list:
// create(store, {variant}) returns an element that keeps itself up to date.
// Variants differ in markup only; themes style them. Without data a widget
// hides itself, or shows "–" when the theme asks for it (whenMissing:
// "dash", Default's rows and gauges).

import { h } from "../ui/dom.js";

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
  // label, number and unit, each in its own span
  tile(def) {
    const value = h("span", { className: "widget-value" });
    const root = h("div", { className: "widget-tile" },
      h("span", { className: "widget-label", text: def.label }), value);
    if (def.unit) root.append(h("span", { className: "widget-unit", text: def.unit }));
    return [root, value];
  },
};

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
    const asNumber = variant === "gauge" || variant === "tile";

    const render = () => {
      const raw = def.read(store);
      const missing = raw === undefined;
      root.hidden = missing && opts.whenMissing !== "dash";
      value.textContent = missing ? "–" : (asNumber && def.number ? def.number(raw) : def.text(raw));
    };
    for (const topic of def.topics) store.subscribe(topic, render);
    return root;
  };
}
