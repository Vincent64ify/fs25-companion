// @ts-check
// The controlled vehicle's attached implements: lowered, on, and wear.
// Variants: "list" (a <ul>), "card" (Default: titled card around the list),
// both hidden while nothing is attached; "rows" (the Vehicle screen: one
// row per implement with its icon, state chips and wear bar, and a line
// saying so when nothing is attached).

import { controlledVehicle, implementsOf, kindLabel, vehicleKind } from "../data/selectors.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/**
 * One line per implement, indented by how deep it hangs.
 * @param {ReturnType<typeof implementsOf>[number]} impl
 */
export function implementLine(impl) {
  const bits = [];
  if (impl.lowered) bits.push("lowered");
  if (impl.turnedOn) bits.push("on");
  if ((impl.wear ?? 0) > 0) bits.push(`wear ${Math.round(100 * (impl.wear ?? 0))}%`);
  return "  ".repeat(Math.max(0, (impl.depth || 1) - 1)) +
    (impl.name || "Implement") + (bits.length ? " – " + bits.join(", ") : "");
}

/** A state chip: icon or dot, then the text. */
function chip(/** @type {string} */ text, /** @type {string} */ state, /** @type {Node} */ mark) {
  const el = h("span", { className: "impl-chip" }, mark, h("span", { text }));
  el.dataset.state = state;
  return el;
}

/** @param {import("../data/selectors.js").Implement} impl */
function implementRow(impl) {
  const badge = h("span", { className: "impl-badge" }, icon(vehicleKind({ ...impl, motorized: false })));
  badge.dataset.on = String(!!impl.turnedOn);
  const row = h("li", { className: "impl-row" }, badge,
    h("div", { className: "impl-text" }, h("b", { text: impl.name || "Implement" }),
      h("span", { text: kindLabel(impl) })),
    chip(impl.lowered ? "Lowered" : "Raised", impl.lowered ? "on" : "off", icon(impl.lowered ? "hitchDown" : "hitchUp")),
    chip(impl.turnedOn ? "Working" : "Off", impl.turnedOn ? "active" : "off", h("span", { className: "impl-dot" })));
  if (typeof impl.wear === "number") {
    const pct = Math.round(100 * impl.wear);
    const bar = h("span");
    bar.style.width = `${Math.min(100, pct)}%`;
    row.append(h("div", { className: "impl-wear" },
      h("div", {}, h("span", { text: "Wear" }), h("b", { text: `${pct}%` })), h("span", { className: "widget-meter" }, bar)));
  }
  return row;
}

/** @type {import("./widget.js").CreateWidget} */
function implementRows(store, opts = {}) {
  const title = h("h2", { text: "Attached" });
  const list = h("ul", { className: "impl-list" });
  const empty = h("p", { className: "impl-empty", text: "Nothing attached" });
  const root = h("div", { className: "implements-card" }, h("div", { className: "impl-head" }, title), list, empty);
  if (opts.id) root.id = opts.id;
  let last = "";
  store.subscribe("vehicles", () => {
    const impls = implementsOf(controlledVehicle(store));
    const key = JSON.stringify(impls);
    if (key === last) return;
    last = key;
    title.textContent = impls.length ? `Attached · ${impls.length}` : "Attached";
    list.replaceChildren(...impls.map(implementRow));
    empty.hidden = impls.length > 0;
  });
  return root;
}

/** @type {import("./widget.js").CreateWidget} */
export function implementsWidget(store, opts = {}) {
  if (opts.variant === "rows") return implementRows(store, opts);
  const list = h("ul");
  const root = opts.variant === "card"
    ? h("div", { className: "card" }, h("h3", { text: "Implements" }), list)
    : list;
  if (opts.id) root.id = opts.id;

  store.subscribe("vehicles", () => {
    const impls = implementsOf(controlledVehicle(store));
    root.hidden = impls.length === 0;
    list.replaceChildren(...impls.map((impl) => h("li", { text: implementLine(impl) })));
  });
  return root;
}
