// @ts-check
// The controlled vehicle's attached implements: lowered, on, and wear.
// Variants: "list" (a <ul>), "card" (Default: titled card around the list).
// Hidden while nothing is attached.

import { controlledVehicle, implementsOf } from "../data/selectors.js";
import { h } from "../ui/dom.js";

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

/** @type {import("./widget.js").CreateWidget} */
export function implementsWidget(store, opts = {}) {
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
