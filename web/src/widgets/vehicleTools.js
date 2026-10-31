// @ts-check
// The Vehicle page's tools (specs/0003-implement-screen.md; the Implement
// tab merged in): every tool you can work with as a card with all its
// buttons, under the band.
// - toolsAll: the All row, a button for each thing two or more cards share
//   (Unfold all, Lower all, Turn on all, Tip all).
// - toolCards: a card per working thing in driving order, the vehicle in
//   its place when it works by itself (a sprayer, a tipper truck). A card
//   has a button for each capability the mod sends (`can`, read from the
//   game's parts), never one per tool type, and the selected tool's other
//   live keys with the game's own labels. Three or more cards go compact.
// - toolsAlso: each tool with no card (a weight), one line, Lower and Detach.
// A tap on a card's head selects that tool in game; a button aims at its
// own tool (the command carries its id); the page never changes.
// Estimates come from data/rates.js.

import {
  allActions, alsoAttached, buttonCapsOf, cabOf, canOf, cardsOf, controlledVehicle, entryModel, fillMax, fillName, fillPct,
  fillStop, fillsOf, implementById, kindLabel, lowersInRig, screenRig, vehicleKind,
} from "../data/selectors.js";
import { areaText, lengthText, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { minutesText, ratesOf, timeLeft } from "../data/rates.js";
import { sendCommand } from "../connection.js";
import { fillMeter, hitchText, maxBadge } from "./implements.js";
import { createControl } from "../ui/control.js";
import { fmt, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").RigEntry} RigEntry */
/** @typedef {import("../data/selectors.js").Implement} Implement */
/** @typedef {import("../types.js").Vehicle} Vehicle */
/** @typedef {(action: string, value?: number, tool?: number) => Promise<import("../commands.js").CommandResult>} Send */

// a tank this full (of where it stops: its weight limit, else its
// capacity), or full this soon, asks for a trailer
const CALL_TRAILER_PCT = 80;
const CALL_TRAILER_MIN = 3;
// this many cards or more: the compact form (head, buttons, main meter)
const COMPACT_FROM = 3;
// how long a faded button's reason stays on its card after a tap
const NOTE_SHOWN_MS = 3000;

/** The vehicles topic's side of an entry: its implement, or the vehicle itself. */
export const detailOf = (/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) =>
  /** @type {Implement|undefined} */ (e.depth === 0 ? v : implementById(v, e.id));

/** The kind's icon: tools never count as tractors. */
export function entryKind(/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) {
  const d = detailOf(e, v);
  return e.depth === 0 ? vehicleKind(v) : vehicleKind({ ...d, motorized: false });
}

/** Working: turned on, or discharging (the yellow badge). */
export const working = (/** @type {RigEntry} */ e) => e.turnedOn === true || e.discharging === true;

/**
 * A tile's state line: what it does first ("Pipe out", "Tipping",
 * "Working"), then where it is ("Lowered", "Hitch 40%", "Folded"); the
 * vehicle without either says whether its engine runs.
 * @param {RigEntry} e
 * @param {Vehicle|undefined} v
 */
export function tileState(e, v) {
  const parts = [];
  if (e.pipe) parts.push(e.pipe.moving ? "Pipe moving" : e.pipe.out ? "Pipe out" : "Pipe in");
  if (e.discharging) parts.push(e.trailer ? "Tipping" : "Unloading");
  else if (e.turnedOn) parts.push("Working");
  if (lowersInRig(e, v)) parts.push(hitchText({ ...detailOf(e, v), lowered: e.lowered }));
  if (e.foldable && e.foldMoving) parts.push("Folding…");
  else if (e.foldable && e.unfolded === false) parts.push("Folded");
  if (e.cover?.open) parts.push("Cover open");
  if (!parts.length && e.depth === 0) parts.push(v?.engineOn ? "Engine on" : "Engine off");
  return parts.slice(0, 2).join(" · ");
}

/**
 * Every tank of these rig entries with its estimate, in rig order.
 * @param {RigEntry[]} rig
 * @param {Vehicle|undefined} v
 * @param {ReturnType<typeof ratesOf>} rates
 */
export function rigTanks(rig, v, rates) {
  /** @type {{entry: RigEntry, fill: import("../data/selectors.js").Fill, left?: {minutes: number, full: boolean}}[]} */
  const out = [];
  for (const entry of rig) {
    const owner = entry.depth === 0 ? v?.id : entry.id;
    const raw = detailOf(entry, v)?.fills;
    (Array.isArray(raw) ? raw : []).forEach((fill, i) => {
      if (!fill || !(fill.capacity > 0)) return;
      out.push({ entry, fill, left: timeLeft(fill, rates.rate(owner, fill, i)) });
    });
  }
  return out;
}

/**
 * A card's tanks: each fill unit with its litres and estimate; the one that
 * runs out first (of two or more) gets a chip, and a tank filling up that's
 * nearly full asks for a trailer, as does a harvester's tank at its weight
 * limit (the game's MAX: it takes no more).
 * @param {ReturnType<typeof rigTanks>} tanks the card tool's
 */
export function tankRows(tanks) {
  const emptying = tanks.filter((t) => t.left && !t.left.full);
  const first = emptying.length > 1 || tanks.length > 1
    ? emptying.sort((a, b) => (a.left?.minutes ?? 0) - (b.left?.minutes ?? 0))[0] : undefined;
  return tanks.map((t) => {
    const pct = fillPct(t.fill);
    const max = fillMax(t.fill);
    const ofStop = (100 * t.fill.level) / fillStop(t.fill);
    const chips = [];
    if (t === first) chips.push("Runs out first");
    if ((t.left?.full && (ofStop >= CALL_TRAILER_PCT || t.left.minutes <= CALL_TRAILER_MIN)) || (max && t.entry.pipe)) {
      chips.push("Call a trailer");
    }
    return {
      name: t.fill.level > 0 ? fillName(t.fill) : "Empty", pct, chips, max, fill: t.fill,
      litres: `${Math.round(t.fill.level).toLocaleString()} / ${Math.round(t.fill.capacity).toLocaleString()} L`,
      when: max ? "at its weight limit"
        : t.left ? `${t.left.full ? "full in" : "empty in"} ${minutesText(t.left.minutes)}` : "",
    };
  });
}

/**
 * The selection: a tap on something the game can select sends
 * implement.select, pending until the cab shows it (or 1.5 s).
 * @param {HTMLElement} el
 * @param {RigEntry} e
 * @param {string} name
 * @param {Send} send
 */
export function pickable(el, e, name, send) {
  el.dataset.selected = String(e.selected === true);
  if (!e.selectable || e.selected || typeof e.id !== "number") return;
  const id = e.id;
  el.dataset.pick = "true";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `Select ${name} in game`);
  const pick = async () => {
    if (el.dataset.pending === "true") return;
    el.dataset.pending = "true";
    const result = await send("implement.select", id);
    if (!result.ok) delete el.dataset.pending;
    else setTimeout(() => { delete el.dataset.pending; }, 1500);
  };
  el.addEventListener("click", pick);
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); }
  });
}

/**
 * One button: what a tap does, the command (with the tool's id), lit or
 * not, unavailable with the game's reason, a value line.
 * value: the state a tap asks for (specs/0008) with the tool's id as tool,
 * or a one-shot's number (the tool's id for Tip side and Detach).
 * @typedef {{key: string, label: string, icon: string, action: string, value?: number, tool?: number, on: boolean,
 *   unavailable?: boolean, why?: string, moving?: boolean, progressive?: boolean, line?: string}} ToolButton
 */

/** Unavailable while the game says not now, with its words (or the button's own, or ours). */
const notNow = (/** @type {RigEntry} */ e, /** @type {string} */ cap) => e.canNow?.[cap] === false;
const whyNot = (/** @type {RigEntry} */ e, /** @type {string} */ cap, /** @type {string|undefined} */ own) =>
  e.whyNot?.[cap] || own || "Not now";

/**
 * A card's buttons: one for each confirmed capability in `can`, in the
 * mod's order, labelled with what a tap does ("Raise", "Fold", "Turn off",
 * "Tip") and asking the tool for that state (specs/0008: tool.lower 0 for
 * Raise); the vehicle's own card has no Detach. The selected tool's other
 * live keys follow, with the game's labels (cover, rotate and the bale
 * counter's among them until their own spec: spec 0003's close).
 * @param {RigEntry} e
 * @returns {ToolButton[]}
 */
export function toolButtons(e) {
  const id = typeof e.id === "number" ? e.id : undefined;
  const can = buttonCapsOf(e);
  const folded = can.includes("fold") && e.unfolded === false;
  /** @type {(asked: boolean) => {value: number, tool: number|undefined}} the state a tap asks for */
  const set = (asked) => ({ value: asked ? 1 : 0, tool: id });
  /** @type {Record<string, () => Omit<ToolButton, "key">|undefined>} */
  const make = {
    lower: () => ({ label: e.lowered ? "Raise" : "Lower", icon: e.lowered ? "hitchUp" : "hitchDown",
      action: "tool.lower", ...set(e.lowered !== true), on: e.lowered === true, progressive: true }),
    // value 1: folded
    fold: () => ({ label: e.foldMoving ? (e.unfolded ? "Folding…" : "Unfolding…") : e.unfolded ? "Fold" : "Unfold",
      icon: "fold", action: "tool.fold", ...set(e.unfolded === true), on: e.unfolded === true,
      moving: e.foldMoving === true }),
    turnOn: () => {
      const b = { label: e.turnedOn ? "Turn off" : "Turn on", icon: "implementOn", action: "tool.turnOn",
        ...set(e.turnedOn !== true), on: e.turnedOn === true };
      // a folded tool can't turn on (Vincent, 2026-10-26)
      return folded && !e.turnedOn ? { ...b, unavailable: true, why: "Unfold first" } : b;
    },
    // where the load goes, as the key the game shows (spec 0003 revision 3):
    // Ctrl+I's "Unload here" off a sale point, else Tip into it
    tip: () => ({ label: e.discharging ? "Stop" : e.tipTo === "ground" ? "Unload here" : "Tip", icon: "unload",
      action: "tool.tip", ...set(e.discharging !== true), on: e.discharging === true }),
    tipSide: () => ({ label: "Tip side", icon: "tipSide", action: "implement.tipSide", value: id, on: false,
      line: e.tipSide?.name || (e.tipSide ? `${e.tipSide.index} / ${e.tipSide.count}` : undefined) }),
    pipe: () => ({ label: e.pipe?.out ? "Pipe in" : "Pipe out", icon: "pipe", action: "tool.pipe",
      ...set(e.pipe?.out !== true), on: e.pipe?.out === true, moving: e.pipe?.moving === true }),
    detach: () => (e.depth === 0 ? undefined
      : { label: "Detach", icon: "hitch", action: "implement.detach", value: id, on: false }),
  };
  /** @type {ToolButton[]} */
  const out = [];
  for (const cap of can) {
    const b = make[cap]?.();
    if (!b) continue;
    const button = { key: cap, ...b };
    if (notNow(e, cap)) Object.assign(button, { unavailable: true, why: whyNot(e, cap, button.why) });
    out.push(button);
  }
  if (e.selected) {
    (Array.isArray(e.extraKeys) ? e.extraKeys : []).forEach((k, i) => {
      if (k && typeof k.text === "string") {
        out.push({ key: `key:${k.action}`, label: k.text, icon: "implement", action: "implement.key", value: i + 1, on: false });
      }
    });
  }
  return out;
}

/**
 * A row of buttons kept across renders, so a tap's pending state survives
 * the cab's next update. Each sends its command; pending until the ack,
 * then until its state changes (at most 1.5 s). A tap on an unavailable one,
 * and a failed answer ("Nothing moved", the game's words: revision 2),
 * hand their reason to `onWhy` (a tablet has no hover for the title).
 * @param {Send} send
 * @param {(why: string) => void} [onWhy]
 */
function buttonRow(send, onWhy) {
  const sent = send;
  send = async (action, value, tool) => {
    const result = await sent(action, value, tool);
    if (!result.ok && result.reason) onWhy?.(result.reason);
    return result;
  };
  const el = h("div", { className: "tool-buttons" });
  /** @type {Map<string, {ui: ReturnType<typeof createControl>, b: ToolButton}>} */
  const shown = new Map();
  let order = "";
  return {
    el,
    /** @param {ToolButton[]} buttons */
    set(buttons) {
      const keys = buttons.map((b) => `${b.key}:${b.icon}`).join("|");
      if (keys !== order) {
        order = keys;
        for (const b of buttons) {
          if (shown.has(b.key)) continue;
          const item = { b, ui: /** @type {ReturnType<typeof createControl>} */ (/** @type {unknown} */ (undefined)) };
          item.ui = createControl({ label: b.label, icon: b.icon, progressive: b.progressive },
            () => send(item.b.action, item.b.value, item.b.tool),
            { ms: 1500, key: () => `${item.b.on}:${item.b.label}:${item.b.line ?? ""}` });
          item.ui.el.dataset.control = b.key;
          item.ui.el.addEventListener("pointerdown", (ev) => {
            if (ev.button === 0 && item.b.unavailable && item.b.why) onWhy?.(item.b.why);
          });
          shown.set(b.key, item);
        }
        for (const key of [...shown.keys()]) if (!buttons.some((b) => b.key === key)) shown.delete(key);
        el.replaceChildren(...buttons.map((b) => /** @type {any} */ (shown.get(b.key)).ui.el));
        el.style.setProperty("--cols", String(buttons.length));
      }
      for (const b of buttons) {
        const item = /** @type {{ui: ReturnType<typeof createControl>, b: ToolButton}} */ (shown.get(b.key));
        item.b = b;
        item.ui.setLabel(b.label, b.icon);
        item.ui.setValue(b.line);
        item.ui.set(b.unavailable ? "unavailable" : b.moving ? "pending" : b.on ? "on" : "off");
        // unavailable: the game's reason on hover
        if (b.unavailable && b.why) {
          item.ui.el.title = b.why;
          item.ui.el.dataset.why = "true";
        } else if (item.ui.el.dataset.why) {
          item.ui.el.removeAttribute("title");
          delete item.ui.el.dataset.why;
        }
      }
    },
  };
}

/** "Krone · Mowers · Front": the brand, the shop's category, the side. */
export function cardSub(/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) {
  const d = detailOf(e, v);
  const brand = typeof d?.brand === "string" ? d.brand : "";
  const kind = kindLabel(e.depth === 0 ? v : { ...d, motorized: false });
  const side = e.side === "front" ? "Front" : e.side === "rear" ? "Rear" : "";
  return [brand, kind, side].filter(Boolean).join(" · ");
}

/** @typedef {{label: string, value: string, pct?: number, level?: string, title?: string}} Stat */

/**
 * A card's stats: speed against the tool's working limit, working width,
 * area this run, and the tool's own wear (not on the vehicle's card: the
 * band has it).
 * @param {RigEntry} e
 * @param {Vehicle|undefined} v
 * @param {ReturnType<typeof ratesOf>} rates
 * @param {import("../data/units.js").Units} units
 * @returns {Stat[]}
 */
export function cardStats(e, v, rates, units) {
  const d = /** @type {any} */ (detailOf(e, v));
  /** @type {Stat[]} */
  const out = [];
  const kmh = typeof v?.speed === "number" ? v.speed : undefined;
  const limit = d?.speedLimit;
  const unit = speedUnit(units);
  if (kmh === undefined) out.push({ label: "Speed", value: "–" });
  else if (typeof limit === "number" && limit > 0) {
    out.push({ label: "Speed", value: `${Math.round(speedValue(kmh, units))} / ${Math.round(speedValue(limit, units))} ${unit}`,
      pct: (100 * kmh) / limit, level: kmh > limit + 0.5 ? "warn" : undefined, title: "Speed / the tool's working limit" });
  } else out.push({ label: "Speed", value: `${fmt(speedValue(kmh, units), 1)} ${unit}` });
  out.push({ label: "Width", value: typeof d?.workWidth === "number" && d.workWidth > 0 ? lengthText(d.workWidth, units) : "–" });
  const ha = rates.area(e.depth === 0 ? v?.id : e.id);
  // from a hundredth of a hectare: less shows as 0.00
  out.push({ label: "Area", value: typeof ha === "number" && ha >= 0.01 ? `≈ ${areaText(ha, units)}` : "–",
    title: "Area this run" });
  if (e.depth > 0) {
    const w = typeof d?.wear === "number" ? d.wear : undefined;
    out.push({ label: "Wear", value: w === undefined ? "–" : `${Math.round(100 * w)}%`, pct: w === undefined ? undefined : 100 * w });
  }
  return out;
}

/** One stat: a label, a value, a bar. */
function statTile(/** @type {Stat} */ s) {
  const el = h("div", { className: "tool-stat" }, h("span", { className: "tool-stat-label", text: s.label }),
    h("b", { className: "tool-stat-value", text: s.value }));
  if (s.pct !== undefined) {
    const bar = h("span");
    bar.style.width = `${Math.max(0, Math.min(100, s.pct))}%`;
    el.append(h("span", { className: "widget-meter" }, bar));
  }
  if (s.level) el.dataset.level = s.level;
  if (s.title) el.title = s.title;
  return el;
}

/** A tank row: name, chips, %, its meter, litres and estimate. */
function tankRow(/** @type {ReturnType<typeof tankRows>[number]} */ t) {
  const meter = fillMeter(t.fill);
  meter.classList.add("tank-meter");
  const row = h("div", { className: "tank" },
    h("div", { className: "tank-head" }, h("span", { className: "tank-name", text: t.name }),
      ...t.chips.map((c) => h("span", { className: "tank-chip", text: c })),
      ...(t.max ? [maxBadge()] : []),
      h("b", { className: "tank-pct", text: `${Math.round(t.pct)}%` })),
    meter,
    h("div", { className: "tank-foot" }, h("span", { text: t.litres }), h("span", { text: t.when })));
  if (t.chips.length) row.dataset.alert = "true";
  return row;
}

/** A button's reason (faded, or a failed answer), for a few seconds after a tap. */
function reasonNote() {
  const el = h("p", { className: "tool-note" });
  el.hidden = true;
  el.setAttribute("role", "status");
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  return {
    el,
    show(/** @type {string} */ why) {
      clearTimeout(timer);
      el.textContent = why;
      el.hidden = false;
      timer = setTimeout(() => { el.hidden = true; }, NOTE_SHOWN_MS);
    },
  };
}

/**
 * One card, kept for its tool across renders.
 * @param {Send} send
 */
function toolCard(send) {
  const badge = h("span", { className: "tool-badge" });
  const name = h("b", { className: "tool-name" });
  const sub = h("span", { className: "tool-sub" });
  const chip = h("span", { className: "tool-chip", text: "Working" });
  let head = h("header", { className: "tool-head" }, badge, h("div", { className: "tool-text" }, name, sub), chip);
  const stats = h("div", { className: "tool-stats" });
  const note = reasonNote();
  const buttons = buttonRow(send, note.show);
  const tanks = h("div", { className: "tool-tanks" });
  const el = h("section", { className: "tool-card" }, head, stats, buttons.el, tanks, note.el);
  let lastHead = "";
  let lastKind = "";
  let lastStats = "";
  let lastTanks = "";
  return {
    el,
    /**
     * @param {RigEntry} e @param {Vehicle|undefined} v @param {ReturnType<typeof ratesOf>} rates
     * @param {import("../data/units.js").Units} units
     */
    render(e, v, rates, units) {
      const model = entryModel(e, v) || "Tool";
      el.dataset.id = String(e.id);
      el.dataset.vehicle = String(e.depth === 0);
      el.dataset.selected = String(e.selected === true);
      el.setAttribute("aria-label", model);
      const kind = entryKind(e, v);
      if (kind !== lastKind) badge.replaceChildren(icon((lastKind = kind)));
      badge.dataset.on = String(working(e));
      chip.hidden = !working(e);
      chip.textContent = e.discharging ? (e.trailer || canOf(e).includes("tip") ? "Tipping" : "Unloading") : "Working";
      name.textContent = model;
      sub.textContent = cardSub(e, v);
      // the head selects the tool in game: rebuilt when that changes
      const headKey = JSON.stringify([e.id, e.selectable, e.selected]);
      if (headKey !== lastHead) {
        lastHead = headKey;
        const fresh = h("header", { className: "tool-head" }, ...head.childNodes);
        head.replaceWith(fresh);
        head = fresh;
        pickable(head, e, model, send);
      }
      const st = cardStats(e, v, rates, units);
      const stKey = JSON.stringify(st);
      if (stKey !== lastStats) {
        lastStats = stKey;
        stats.replaceChildren(...st.map(statTile));
      }
      buttons.set(toolButtons(e));
      const rows = tankRows(rigTanks([e], v, rates));
      const tKey = JSON.stringify(rows);
      if (tKey !== lastTanks) {
        lastTanks = tKey;
        tanks.hidden = rows.length === 0;
        tanks.replaceChildren(...rows.map(tankRow));
      }
    },
  };
}

/**
 * The cards: one per working thing, in driving order, as many as fit at
 * 1180 × 820 (full width alone, two side by side, compact from three).
 * Without a vehicle, a line saying so; with nothing attached, "Nothing
 * attached".
 * @type {import("./widget.js").CreateWidget}
 */
export function toolCards(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const rates = /** @type {ReturnType<typeof ratesOf>} */ (/** @type {any} */ (opts).rates || ratesOf(store));
  const list = h("div", { className: "tool-list" });
  const none = h("p", { className: "tool-none" });
  const root = h("section", { className: "tool-cards" }, list, none);
  root.setAttribute("aria-label", "Tools");
  if (opts.id) root.id = opts.id;
  /** @type {Map<unknown, ReturnType<typeof toolCard>>} */
  const cards = new Map();
  let lastOrder = "";
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const shown = v ? cardsOf(v, cab) : [];
    const tools = screenRig(v, cab).filter((e) => e.depth > 0);
    none.textContent = !v ? "Get in a vehicle to see its tools here" : tools.length ? "" : "Nothing attached";
    none.hidden = !none.textContent;
    root.dataset.count = String(shown.length);
    root.dataset.compact = String(shown.length >= COMPACT_FROM);
    const order = shown.map((e) => e.id).join("|");
    if (order !== lastOrder) {
      lastOrder = order;
      for (const id of [...cards.keys()]) if (!shown.some((e) => e.id === id)) cards.delete(id);
      for (const e of shown) if (!cards.has(e.id)) cards.set(e.id, toolCard(send));
      list.replaceChildren(...shown.map((e) => /** @type {any} */ (cards.get(e.id)).el));
    }
    const units = unitsOf(store);
    for (const e of shown) cards.get(e.id)?.render(e, v, rates, units);
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * The All row: with two or more working things, a button for each thing
 * they share, lit while every one of them is on; Turn on all waits while
 * one is folded ("Unfold first").
 * @type {import("./widget.js").CreateWidget}
 */
export function toolsAll(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  // a failed answer names the tools that didn't move (revision 2)
  const note = reasonNote();
  const buttons = buttonRow(send, note.show);
  const root = h("section", { className: "tools-all" }, h("span", { className: "veh-cap", text: "All" }), buttons.el,
    note.el);
  root.setAttribute("aria-label", "All tools");
  if (opts.id) root.id = opts.id;
  const render = () => {
    const v = controlledVehicle(store);
    const actions = v ? allActions(cardsOf(v, cabOf(store))) : [];
    root.hidden = actions.length === 0;
    buttons.set(actions.map((a) => ({ key: a.cap, label: a.label, icon: ALL_ICONS[a.cap] || "implement",
      action: a.action, value: a.value, on: a.on, unavailable: a.unavailable, why: a.note, line: a.note,
      moving: a.moving })));
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  return root;
}

const ALL_ICONS = /** @type {Record<string, string>} */ ({
  fold: "fold", lower: "lowerAll", turnOn: "implementOn", tip: "unload",
});

/** "1,500 kg · Fendt · Weights · Front · Raised": an Also attached line. */
export function alsoLine(/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) {
  const state = lowersInRig(e, v) ? (e.lowered ? "Lowered" : "Raised") : "";
  return [entryModel(e, v) || "Tool", cardSub(e, v), state].filter(Boolean).join(" · ");
}

/**
 * Also attached: each tool with no card, one line with Lower / Raise
 * (where it lowers) and Detach.
 * @type {import("./widget.js").CreateWidget}
 */
export function toolsAlso(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const list = h("ul", { className: "tools-also-list" });
  const root = h("section", { className: "tools-also" }, h("span", { className: "veh-cap", text: "Also attached" }), list);
  root.setAttribute("aria-label", "Also attached");
  if (opts.id) root.id = opts.id;
  /** @type {Map<unknown, {el: HTMLElement, text: HTMLElement, badge: HTMLElement, buttons: ReturnType<typeof buttonRow>}>} */
  const rows = new Map();
  let lastOrder = "";
  const render = () => {
    const v = controlledVehicle(store);
    const also = v ? alsoAttached(v, cabOf(store)) : [];
    root.hidden = also.length === 0;
    const order = also.map((e) => e.id).join("|");
    if (order !== lastOrder) {
      lastOrder = order;
      for (const e of also) {
        if (rows.has(e.id)) continue;
        const badge = h("span", { className: "tool-badge" });
        const text = h("span", { className: "tools-also-text" });
        const buttons = buttonRow(send);
        rows.set(e.id, { el: h("li", { className: "tools-also-row" }, badge, text, buttons.el), text, badge, buttons });
      }
      list.replaceChildren(...also.map((e) => /** @type {any} */ (rows.get(e.id)).el));
    }
    for (const e of also) {
      const row = /** @type {any} */ (rows.get(e.id));
      row.badge.replaceChildren(icon(entryKind(e, v)));
      row.text.textContent = alsoLine(e, v);
      row.buttons.set(toolButtons(e).filter((b) => b.key === "detach" || (b.key === "lower" && lowersInRig(e, v))));
    }
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  return root;
}
