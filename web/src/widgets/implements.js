// @ts-check
// The controlled vehicle's attached implements: lowered (and where the
// hitch is while it moves), on, PTO, wear and fill levels.
// Variants: "list" (a <ul>), "card" (Default: titled card around the list),
// both hidden while nothing is attached; "rows" (the Vehicle screen: one
// row per implement with its icon, state chips and wear bar, and a line
// saying so when nothing is attached).

import { controlledVehicle, fillName, fillPct, implementsOf, kindLabel, vehicleKind } from "../data/selectors.js";
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
  if (impl.pto === true) bits.push("PTO");
  if ((impl.wear ?? 0) > 0) bits.push(`wear ${Math.round(100 * (impl.wear ?? 0))}%`);
  for (const f of fillsOfImpl(impl)) bits.push(`${fillName(f).toLowerCase()} ${Math.round(fillPct(f))}%`);
  return "  ".repeat(Math.max(0, (impl.depth || 1) - 1)) +
    (impl.name || "Implement") + (bits.length ? " – " + bits.join(", ") : "");
}

/** @param {import("../data/selectors.js").Implement} impl */
const fillsOfImpl = (impl) => (Array.isArray(impl.fills) ? impl.fills.filter((f) => f && f.capacity > 0) : []);

/**
 * The hitch chip's text: Raised or Lowered, or where the hitch is while it
 * moves ("Hitch 40%").
 * @param {import("../data/selectors.js").Implement} impl
 */
export function hitchText(impl) {
  const at = impl.hitch;
  if (typeof at === "number" && at > 0.05 && at < 0.95) return `Hitch ${Math.round(100 * at)}%`;
  return impl.lowered ? "Lowered" : "Raised";
}

/** A labelled meter: "Wear 25%", "Seeds 25%" with the litres. */
function meterLine(/** @type {string} */ className, /** @type {string} */ name, /** @type {number} */ pct, /** @type {string} */ value) {
  const bar = h("span");
  bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  return h("div", { className },
    h("div", {}, h("span", { text: name }), h("b", { text: value })), h("span", { className: "widget-meter" }, bar));
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
    chip(hitchText(impl), impl.lowered ? "on" : "off", icon(impl.lowered ? "hitchDown" : "hitchUp")),
    chip(impl.turnedOn ? "Working" : "Off", impl.turnedOn ? "active" : "off", h("span", { className: "impl-dot" })));
  if (typeof impl.pto === "boolean") {
    row.append(chip(impl.pto ? "PTO on" : "PTO off", impl.pto ? "active" : "off", icon("pto")));
  }
  if (typeof impl.wear === "number") {
    const pct = Math.round(100 * impl.wear);
    row.append(meterLine("impl-wear", "Wear", pct, `${pct}%`));
  }
  for (const f of fillsOfImpl(impl)) {
    const pct = Math.round(fillPct(f));
    row.append(meterLine("impl-fill", fillName(f), pct,
      `${pct}% · ${Math.round(f.level).toLocaleString()} / ${Math.round(f.capacity).toLocaleString()} L`));
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
