// @ts-check
// The controlled vehicle's attached implements: lowered (and where the
// hitch is while it moves), on, PTO, wear and fill levels.
// Variants: "list" (a <ul>, hidden while nothing is attached); "rows" (the
// Vehicle screen: one row per implement with its icon, state chips and wear
// bar, and a line saying so when nothing is attached).
//
// Rows pick a tool (Controls C3): tapping a row the game can select selects
// it in game, as G would after enough presses; the selected row is marked
// and has a Detach button for that tool. ‹ › in the header select the
// previous or next one in the game's order, as G does both ways. G pressed
// in game moves the mark, since it follows the cab's rig. Older mods send
// no rig: rows only show.

import { cabOf, controlledVehicle, fillName, fillPct, implementsOf, kindLabel, rigOf, vehicleKind }
  from "../data/selectors.js";
import { sendCommand } from "../connection.js";
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

/**
 * @param {import("../data/selectors.js").Implement} impl
 * @param {import("../types.js").RigEntry|undefined} rig the tool's entry in the cab's rig
 * @param {(action: string, value?: number) => Promise<import("../commands.js").CommandResult>} send
 */
function implementRow(impl, rig, send) {
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
  if (rig && typeof rig.id === "number") pickable(row, impl, rig, send);
  return row;
}

/**
 * A row the game can select: a tap selects it, pending until the game
 * reports it; the selected one is marked and gets Detach.
 * @param {HTMLElement} row
 * @param {import("../data/selectors.js").Implement} impl
 * @param {import("../types.js").RigEntry} rig
 * @param {(action: string, value?: number) => Promise<import("../commands.js").CommandResult>} send
 */
function pickable(row, impl, rig, send) {
  const id = /** @type {number} */ (rig.id);
  row.dataset.selected = String(rig.selected === true);
  if (rig.side) row.dataset.side = rig.side;
  if (rig.selectable && !rig.selected) {
    row.dataset.pick = "true";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Select ${impl.name || "implement"} in game`);
    const pick = async () => {
      if (row.dataset.pending === "true") return;
      row.dataset.pending = "true";
      const result = await send("implement.select", id);
      // the cab redraws the rows once the game has it; a refusal clears here
      if (!result.ok) delete row.dataset.pending;
      else setTimeout(() => { delete row.dataset.pending; }, 1500);
    };
    row.addEventListener("click", pick);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
    });
  }
  if (rig.selected) {
    const mark = h("span", { className: "impl-selected", text: "Selected" });
    const detach = /** @type {HTMLButtonElement} */ (h("button", { className: "impl-detach" },
      icon("hitchUp"), h("span", { text: "Detach" })));
    detach.type = "button";
    detach.addEventListener("click", async () => {
      if (detach.dataset.state === "pending") return;
      detach.dataset.state = "pending";
      const result = await send("implement.detach", id);
      if (!result.ok) {
        detach.dataset.state = "error";
        detach.title = result.reason || "failed";
        const label = /** @type {HTMLElement} */ (detach.lastElementChild);
        label.textContent = result.reason === "can't detach now" ? "Not now" : "Failed";
        setTimeout(() => { delete detach.dataset.state; label.textContent = "Detach"; }, 2000);
      }
    });
    row.querySelector(".impl-text")?.append(h("div", { className: "impl-pick" }, mark, detach));
  }
}

/** @type {import("./widget.js").CreateWidget} */
function implementRows(store, opts = {}) {
  /** @type {(action: string, value?: number) => Promise<import("../commands.js").CommandResult>} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const title = h("h2", { text: "Attached" });
  const list = h("ul", { className: "impl-list" });
  const empty = h("p", { className: "impl-empty", text: "Nothing attached" });
  /** ‹ or ›: the previous or next tool in game */
  const step = (/** @type {string} */ name, /** @type {string} */ label, /** @type {string} */ action) => {
    const b = /** @type {HTMLButtonElement} */ (h("button", { className: "impl-step" }, icon(name)));
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", async () => {
      if (b.dataset.state === "pending") return;
      b.dataset.state = "pending";
      await send(action);
      delete b.dataset.state;
    });
    return b;
  };
  const steps = h("div", { className: "impl-steps" },
    step("toolPrev", "Previous tool", "implement.previous"), step("toolNext", "Next tool", "implement.next"));
  const root = h("div", { className: "implements-card" }, h("div", { className: "impl-head" }, title, steps),
    list, empty);
  if (opts.id) root.id = opts.id;
  let last = "";
  const update = () => {
    const impls = implementsOf(controlledVehicle(store));
    const rig = rigOf(cabOf(store));
    const byId = new Map(rig.filter((e) => e.depth > 0).map((e) => [e.id, e]));
    const picks = impls.map((i) => {
      const e = typeof i.id === "number" ? byId.get(i.id) : undefined;
      return e && { id: e.id, selectable: e.selectable, selected: e.selected, side: e.side };
    });
    steps.hidden = rig.filter((e) => e.selectable).length < 2;
    const key = JSON.stringify([impls, picks]);
    if (key === last) return;
    last = key;
    title.textContent = impls.length ? `Attached · ${impls.length}` : "Attached";
    list.replaceChildren(...impls.map((impl, i) => implementRow(impl, picks[i] || undefined, send)));
    empty.hidden = impls.length > 0;
  };
  store.subscribe("vehicles", update);
  store.subscribe("cab", update);
  return root;
}

/** @type {import("./widget.js").CreateWidget} */
export function implementsWidget(store, opts = {}) {
  if (opts.variant === "rows") return implementRows(store, opts);
  const root = h("ul");
  if (opts.id) root.id = opts.id;

  store.subscribe("vehicles", () => {
    const impls = implementsOf(controlledVehicle(store));
    root.hidden = impls.length === 0;
    root.replaceChildren(...impls.map((impl) => h("li", { text: implementLine(impl) })));
  });
  return root;
}
