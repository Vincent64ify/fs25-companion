// @ts-check
// The Vehicle page's tools (specs/0003-implement-screen.md; the Implement
// tab merged in; the calm page, specs/0013): every tool you can work with
// as a card with all its buttons, under the rig strip.
// - toolsAll: the column's All tools group, a button for each thing two or
//   more cards share (Unfold all, Lower all, Turn on all, Tip all).
// - toolCards: a card per working thing, front of the rig to the back, the vehicle in
//   its place when it works by itself (a sprayer, a tipper truck), each as
//   tall as its content. A card has a button for each capability the mod
//   sends (`can`, read from what the tool is: specs/0012), from our fixed
//   list, never one per tool type; the game's "not now" only fades one. The
//   main row, drawn as the column's buttons, then a collapsed More (a plow's
//   Rotate, a baler's drop, the application rate...), its button the main
//   row's last. Three or more cards go compact.
// - toolsAlso: each tool with no card (a weight), a slim card with Lower
//   and Detach.
// A sprayer's card shows its working width (specs/0011-sprayer.md): a strip
// of its sections and how many are on, with Left / Right in / out where the
// game's width keys are live.
// The game's selected tool shows on the strip only (specs/0013); a tap on a
// card still selects its tool in game. A button aims at its own tool (the
// command carries its id); the page never changes. Estimates come from
// data/rates.js.

import {
  MORE_CAPABILITIES, allActions, alsoAttached, buttonCapsOf, cabOf, cardsOf, controlledVehicle, entryModel, fillMax,
  fillName, fillPct, fillStop, fillsOf, foldingText, implementById, kindLabel, lowersInRig, moreCount, screenRig, vehicleKind,
  sectionsSpraying, widthMetres, widthSegments,
} from "../data/selectors.js";
import { areaText, lengthText, lengthUnit, lengthValue, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { minutesText, ratesOf, timeLeft } from "../data/rates.js";
import { sendCommand } from "../connection.js";
import { fillMeter, hitchText, maxBadge } from "./implements.js";
import { createControl } from "../ui/control.js";
import { fmt, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").RigEntry} RigEntry */
/** @typedef {import("../data/selectors.js").Implement} Implement */
/** @typedef {import("../types.js").Vehicle} Vehicle */
/** @typedef {import("../types.js").RigWidth} RigWidth */
/**
 * @typedef {(action: string, value?: number, tool?: number, side?: "left"|"right") =>
 *   Promise<import("../commands.js").CommandResult>} Send
 */

// a tank this full (of where it stops: its weight limit, else its
// capacity), or full this soon, asks for a trailer
const CALL_TRAILER_PCT = 80;
const CALL_TRAILER_MIN = 3;
// this many cards or more: the compact form (head, buttons, main meter)
const COMPACT_FROM = 3;
// the tool models whose More is open, in this browser (specs/0012: a
// convenience only)
const MORE_STORE = "fs25companion.moreOpen";

/** The vehicles topic's side of an entry: its implement, or the vehicle itself. */
export const detailOf = (/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) =>
  /** @type {Implement|undefined} */ (e.depth === 0 ? v : implementById(v, e.id));

/** The kind's icon: tools never count as tractors. */
export function entryKind(/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) {
  const d = detailOf(e, v);
  return e.depth === 0 ? vehicleKind(v) : vehicleKind({ ...d, motorized: false });
}

/**
 * A row's key across renders: the tool's id, else its place (an older mod's
 * tools have no id; NEXT.md, the Solek replay).
 */
const keyOf = (/** @type {RigEntry} */ e, /** @type {number} */ i) => (typeof e.id === "number" ? e.id : `#${i}`);

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
  if (e.foldable && e.foldMoving) parts.push(foldingText(e));
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
        : t.left ? (t.left.full ? `full in ${minutesText(t.left.minutes)}` : `${minutesText(t.left.minutes)} left`) : "",
    };
  });
}

/**
 * The selection: a tap on something the game can select sends
 * implement.select, pending until the cab shows it (or 1.5 s). Pending only
 * stops a second tap: the game answers in a frame or two, so it has no look
 * (specs/0010).
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
 * not, unavailable (why: the game's reason, not shown), a value line.
 * value: the state a tap asks for (specs/0008) with the tool's id as tool,
 * or a one-shot's number (the tool's id for Tip side, Cover and Detach;
 * none for Unload and Reset bale count, their tool alone); side:
 * tool.width's; more: under the card's More (specs/0012).
 * @typedef {{key: string, label: string, icon: string, action: string, value?: number, tool?: number, on: boolean,
 *   side?: "left"|"right", unavailable?: boolean, why?: string, moving?: boolean, progressive?: boolean,
 *   line?: string, more?: boolean}} ToolButton
 */

/** Unavailable while the game says not now, with its words (or the button's own, or ours). */
const notNow = (/** @type {RigEntry} */ e, /** @type {string} */ cap) => e.canNow?.[cap] === false;
const whyNot = (/** @type {RigEntry} */ e, /** @type {string} */ cap, /** @type {string|undefined} */ own) =>
  e.whyNot?.[cap] || own || "Not now";

/**
 * A card's buttons (specs/0012): one for each capability in `can`, from our
 * fixed list in the mod's order, labelled with what a tap does ("Raise",
 * "Fold", "Turn off", "Tip", "Create fields on") and asking the tool for
 * that state (specs/0008: tool.lower 0 for Raise); the vehicle's own card
 * has no Detach. The main row first, then More's (`more`: Rotate, Create
 * fields, Automatic drop, Reset bale count, Doubled rate, and the
 * application rate's Rate −, Auto, Rate +, always together). The game's
 * "not now" only fades a button. The width (specs/0011) gives four: Left
 * out, Left in, Right in, Right out, one section each; a side at its limit
 * fades its button (keys "width:…", shown in the card's width row). An
 * older mod's other keys (extraKeys) have no button (rule 4).
 * @param {RigEntry} e
 * @returns {ToolButton[]}
 */
export function toolButtons(e) {
  const id = typeof e.id === "number" ? e.id : undefined;
  const can = buttonCapsOf(e);
  const folded = can.includes("fold") && e.unfolded === false;
  /** @type {(asked: boolean) => {value: number, tool: number|undefined}} the state a tap asks for */
  const set = (asked) => ({ value: asked ? 1 : 0, tool: id });
  /** @type {(on: boolean|undefined, what: string) => string} "Create fields on" while off: what a tap does */
  const onOff = (on, what) => `${what} ${on ? "off" : "on"}`;
  const count = e.bales?.count;
  /** @type {Record<string, () => Omit<ToolButton, "key">|undefined>} */
  const make = {
    lower: () => ({ label: e.lowered ? "Raise" : "Lower", icon: e.lowered ? "hitchUp" : "hitchDown",
      action: "tool.lower", ...set(e.lowered !== true), on: e.lowered === true, progressive: true }),
    // value 1: folded
    fold: () => ({ label: e.foldMoving ? foldingText(e) : e.unfolded ? "Fold" : "Unfold",
      icon: "fold", action: "tool.fold", ...set(e.unfolded === true), on: e.unfolded === true,
      moving: e.foldMoving === true }),
    turnOn: () => {
      const b = { label: e.turnedOn ? "Turn off" : "Turn on", icon: "implementOn", action: "tool.turnOn",
        ...set(e.turnedOn !== true), on: e.turnedOn === true };
      // a folded tool can't turn on (Vincent, 2026-10-26)
      return folded && !e.turnedOn ? { ...b, unavailable: true, why: "Unfold first" } : b;
    },
    // a one-shot: pallets of what's in the tank (FillUnit), its tool alone
    unload: () => ({ label: "Unload", icon: "unload", action: "tool.unload", tool: id, on: false }),
    // where the load goes, as the key the game shows (spec 0003 revision 3):
    // Ctrl+I's "Unload here" off a sale point, else Tip into it
    tip: () => ({ label: e.discharging ? "Stop" : e.tipTo === "ground" ? "Unload here" : "Tip", icon: "unload",
      action: "tool.tip", ...set(e.discharging !== true), on: e.discharging === true }),
    tipSide: () => ({ label: "Tip side", icon: "tipSide", action: "implement.tipSide", value: id, on: false,
      line: e.tipSide?.name || (e.tipSide ? `${e.tipSide.index} / ${e.tipSide.count}` : undefined) }),
    // a one-shot by the tool's id (the game's cover key steps it); lit while open
    cover: () => ({ label: e.cover?.open ? "Cover" : "Uncover", icon: "cover", action: "implement.cover", value: id,
      on: e.cover?.open === true }),
    pipe: () => ({ label: e.pipe?.out ? "Pipe in" : "Pipe out", icon: "pipe", action: "tool.pipe",
      ...set(e.pipe?.out !== true), on: e.pipe?.out === true, moving: e.pipe?.moving === true }),
    rotate: () => ({ label: "Rotate", icon: "rotate", action: "tool.rotate", ...set(e.plow?.rotated !== true), on: false }),
    createFields: () => ({ label: onOff(e.createFields, "Create fields"), icon: "area", action: "tool.createFields",
      ...set(e.createFields !== true), on: e.createFields === true }),
    autoDrop: () => ({ label: onOff(e.autoDrop, "Automatic drop"), icon: "unload", action: "tool.autoDrop",
      ...set(e.autoDrop !== true), on: e.autoDrop === true }),
    bales: () => ({ label: "Reset bale count", icon: "reset", action: "tool.resetBales", tool: id, on: false,
      line: typeof count === "number" ? `${count} ${count === 1 ? "bale" : "bales"}` : undefined }),
    doubledRate: () => ({ label: onOff(e.doubledRate, "Doubled rate"), icon: "fill", action: "tool.doubledRate",
      ...set(e.doubledRate !== true), on: e.doubledRate === true }),
    detach: () => (e.depth === 0 ? undefined
      : { label: "Detach", icon: "hitch", action: "implement.detach", value: id, on: false }),
  };
  /** @type {ToolButton[]} */
  const main = [];
  /** @type {ToolButton[]} */
  const more = [];
  for (const cap of can) {
    const into = MORE_CAPABILITIES.includes(cap) ? more : main;
    if (cap === "width" || cap === "sprayRate") {
      for (const b of cap === "width" ? widthButtons(e, id) : rateButtons(e, id)) {
        if (notNow(e, cap)) Object.assign(b, { unavailable: true, why: whyNot(e, cap) });
        into.push(b);
      }
      continue;
    }
    const b = make[cap]?.();
    if (!b) continue;
    const button = { key: cap, ...b };
    if (notNow(e, cap)) Object.assign(button, { unavailable: true, why: whyNot(e, cap, button.why) });
    into.push(button);
  }
  return [...main, ...more.map((b) => ({ ...b, more: true }))];
}

/**
 * Precision Farming's application rate (specs/0012): one row like
 * Cruise's, always together: Rate −, Auto, Rate +. Auto is lit while the
 * game sets the rate itself; Rate − and + are faded then (the game's rate
 * key does nothing) and at the ends. Auto's line is the step while the
 * player sets it ("Step 2 / 45"; the HUD's l/ha isn't in what the mod reads).
 * @param {RigEntry} e
 * @param {number|undefined} id
 * @returns {ToolButton[]}
 */
function rateButtons(e, id) {
  const r = e.sprayRate;
  if (!r) return [];
  const step = typeof r.step === "number" ? r.step : undefined;
  const end = (/** @type {number|undefined} */ limit, /** @type {-1|1} */ dir) =>
    step === undefined || (typeof limit === "number" && (dir < 0 ? step <= limit : step >= limit));
  /** @type {(dir: -1|1) => ToolButton} */
  const stepButton = (dir) => {
    const atEnd = r.auto === true || end(dir < 0 ? r.min : r.max, dir);
    return { key: dir < 0 ? "rate:down" : "rate:up", label: dir < 0 ? "Rate −" : "Rate +",
      icon: dir < 0 ? "cruiseDown" : "cruiseUp", action: "tool.sprayRate", value: dir, tool: id, on: false,
      ...(atEnd ? { unavailable: true } : {}) };
  };
  return [stepButton(-1),
    { key: "rate:auto", label: "Auto", icon: "cruise", action: "tool.sprayRateAuto", value: r.auto ? 0 : 1, tool: id,
      on: r.auto === true,
      line: r.auto || step === undefined ? undefined : `Step ${step}${typeof r.max === "number" ? ` / ${r.max}` : ""}` },
    stepButton(1)];
}

/**
 * The width's four buttons, always together (as the Cruise row), each side's
 * at its end of the strip: Left out, Left in, Right in, Right out. In takes
 * one section off that side (-1), out puts one back (+1), as the game's
 * width key for that side does.
 * @param {RigEntry} e
 * @param {number|undefined} id
 * @returns {ToolButton[]}
 */
function widthButtons(e, id) {
  const w = e.width;
  if (!w) return [];
  /** @type {[string, "left"|"right", number, string][]} */
  const four = [["Left out", "left", 1, "widthLeftOut"], ["Left in", "left", -1, "widthLeftIn"],
    ["Right in", "right", -1, "widthRightIn"], ["Right out", "right", 1, "widthRightOut"]];
  return four.map(([label, side, value, glyph]) => {
    const now = side === "left" ? w.left : w.right;
    const max = side === "left" ? w.leftMax : w.rightMax;
    const atLimit = value < 0 ? now <= 0 : now >= max;
    return { key: `width:${side}${value < 0 ? "In" : "Out"}`, label, icon: glyph, action: "tool.width", value, tool: id,
      side, on: false, ...(atLimit ? { unavailable: true } : {}) };
  });
}

// the strip's sections and their metres live with the selectors: the
// trail (data/coverage.js) needs them too
export { widthMetres, widthSegments };

/**
 * "8 / 9 sections · 30 / 33 m" (Vincent, 2026-11-01); the sections alone
 * until the mod has their widths. The sections counted: those spraying,
 * else those set by hand (specs/0013 revision 4).
 * @param {RigWidth} w
 * @param {import("../data/units.js").Units} units
 * @param {boolean[]} [on]
 */
export function widthLine(w, units, on = widthSegments(w)) {
  const sections = `${on.filter(Boolean).length} / ${on.length} sections`;
  const m = widthMetres(w);
  if (!m) return sections;
  const used = /** @type {number[]} */ (w.sections).reduce((sum, x, i) => sum + (on[i] ? x : 0), 0);
  const n = (/** @type {number} */ x) => Math.round(lengthValue(x, units));
  return `${sections} · ${n(used)} / ${n(m.all)} ${lengthUnit(units)}`;
}

/**
 * A row of buttons kept across renders, so a tap's pending state survives
 * the cab's next update. Each sends its command; pending until the ack,
 * then until its state changes (at most 1.5 s). A failed answer shows on
 * the button itself, "Failed" (ui/control.js), and nowhere else: no note
 * on the card or the column (Vincent, 2026-11-08). An unavailable one is
 * only faded: no reason on hover or on a tap (Vincent, 2026-11-01).
 * @param {Send} send
 * @param {string} [className] the grid's class: the column's own in the column
 */
function buttonRow(send, className = "tool-buttons") {
  const el = h("div", { className });
  /** @type {Map<string, {ui: ReturnType<typeof createControl>, b: ToolButton}>} */
  const shown = new Map();
  let order = "";
  return {
    el,
    /**
     * @param {ToolButton[]} buttons
     * @param {HTMLElement} [tail] one more tile at the row's end (the card's More)
     */
    set(buttons, tail) {
      const keys = buttons.map((b) => `${b.key}:${b.icon}`).join("|") + (tail ? "|tail" : "");
      if (keys !== order) {
        order = keys;
        for (const b of buttons) {
          if (shown.has(b.key)) continue;
          const item = { b, ui: /** @type {ReturnType<typeof createControl>} */ (/** @type {unknown} */ (undefined)) };
          item.ui = createControl({ label: b.label, icon: b.icon, progressive: b.progressive },
            () => send(item.b.action, item.b.value, item.b.tool, item.b.side),
            { ms: 1500, key: () => `${item.b.on}:${item.b.label}:${item.b.line ?? ""}` });
          item.ui.el.dataset.control = b.key;
          shown.set(b.key, item);
        }
        for (const key of [...shown.keys()]) if (!buttons.some((b) => b.key === key)) shown.delete(key);
        el.replaceChildren(...buttons.map((b) => /** @type {any} */ (shown.get(b.key)).ui.el), ...(tail ? [tail] : []));
        el.style.setProperty("--cols", String(buttons.length + (tail ? 1 : 0)));
      }
      for (const b of buttons) {
        const item = /** @type {{ui: ReturnType<typeof createControl>, b: ToolButton}} */ (shown.get(b.key));
        item.b = b;
        item.ui.setLabel(b.label, b.icon);
        item.ui.setValue(b.line);
        item.ui.set(b.unavailable ? "unavailable" : b.moving ? "pending" : b.on ? "on" : "off");
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
 * A card's stats: speed against the tool's working limit, working width
 * (a sprayer's in use, where its sections' widths are known),
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
  // a sprayer's width in use, from its sections' widths (specs/0011)
  const inUse = e.width ? widthMetres(e.width)?.used : undefined;
  const width = inUse ?? (typeof d?.workWidth === "number" && d.workWidth > 0 ? d.workWidth : undefined);
  out.push({ label: "Width", value: width !== undefined ? lengthText(width, units) : "–" });
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

/**
 * One stat on its small quiet tile (specs/0013): a label and a value, no
 * bar; over the tool's limit its value turns orange.
 */
function statTile(/** @type {Stat} */ s) {
  const el = h("div", { className: "tool-stat" }, h("span", { className: "tool-stat-label", text: s.label }),
    h("b", { className: "tool-stat-value", text: s.value }));
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

/**
 * The card's working width (specs/0011): the strip, its line and the four
 * buttons; hidden on a tool without sections.
 * @param {Send} send
 */
function widthBlock(send) {
  const strip = h("div", { className: "tool-width-strip" });
  strip.setAttribute("aria-hidden", "true");
  const line = h("span", { className: "tool-width-line" });
  const buttons = buttonRow(send);
  const el = h("div", { className: "tool-width" }, h("div", { className: "tool-width-head" }, strip, line), buttons.el);
  el.hidden = true;
  let lastStrip = "";
  return {
    el,
    /**
     * @param {RigWidth|undefined} w
     * @param {ToolButton[]} four
     * @param {import("../data/units.js").Units} units
     * @param {boolean[]} [on] the sections lit: spraying, else set by hand (specs/0013 revision 4)
     */
    render(w, four, units, on = w ? widthSegments(w) : []) {
      el.hidden = !w;
      if (!w) return;
      const key = on.join();
      if (key !== lastStrip) {
        lastStrip = key;
        strip.replaceChildren(...on.map((o) => {
          const seg = h("span", { className: "tool-width-seg" });
          seg.dataset.on = String(o);
          return seg;
        }));
      }
      line.textContent = widthLine(w, units, on);
      buttons.el.hidden = four.length === 0;
      buttons.set(four);
    },
  };
}

/** The tool models whose More is open, from this browser's storage. */
function openMores() {
  try {
    const list = JSON.parse(localStorage.getItem(MORE_STORE) || "[]");
    return new Set(Array.isArray(list) ? list.filter((m) => typeof m === "string") : []);
  } catch {
    return new Set();
  }
}

/** Whether this tool model's More is open in this browser. @param {string} model */
export const moreOpen = (model) => openMores().has(model);

/** Remember this tool model's More open or closed (a convenience: storage may fail). */
function rememberMore(/** @type {string} */ model, /** @type {boolean} */ open) {
  const set = openMores();
  if (open) set.add(model);
  else set.delete(model);
  try {
    localStorage.setItem(MORE_STORE, JSON.stringify([...set]));
  } catch { /* the page works without it */ }
}

/**
 * A card's More (specs/0012): the main row's last button, "More" over its
 * count ("2", specs/0013), closed (Vincent, 2026-11-03: not a row of its
 * own, so a card fits at 1180 × 820); a tap opens or closes it on that
 * card, lit while open, its buttons a row under the main row, remembered by
 * the tool's model in this browser. Compact (three cards or more) keeps the
 * button, faded and closed. None on a tool with nothing under More.
 * @param {Send} send
 */
function moreBlock(send) {
  const value = h("span", { className: "control-value" });
  const toggle = /** @type {HTMLButtonElement} */ (h("button", { className: "control tool-more-toggle" },
    h("span", { className: "icon tool-more-chevron" }), h("span", { className: "control-label", text: "More" }), value));
  toggle.dataset.value = "";
  toggle.type = "button";
  toggle.dataset.control = "more";
  const buttons = buttonRow(send);
  const el = h("div", { className: "tool-more" }, buttons.el);
  el.hidden = true;
  let model = "";
  let compact = false;
  let count = 0;
  const paint = () => {
    const open = count > 0 && !compact && moreOpen(model);
    el.hidden = !open;
    toggle.dataset.state = compact ? "unavailable" : open ? "on" : "off";
    toggle.setAttribute("aria-expanded", String(open));
    if (compact) toggle.setAttribute("aria-disabled", "true");
    else toggle.removeAttribute("aria-disabled");
  };
  toggle.addEventListener("click", () => {
    if (compact) return;
    rememberMore(model, !moreOpen(model));
    paint();
  });
  return {
    el,
    /** the tile for the main row, or undefined with nothing under More */
    tile: () => (count > 0 ? toggle : undefined),
    /**
     * @param {string} toolModel the tool's model, what the browser remembers
     * @param {number} n how many things are under it
     * @param {ToolButton[]} list its buttons
     * @param {boolean} isCompact
     */
    render(toolModel, n, list, isCompact) {
      model = toolModel;
      count = n;
      compact = isCompact;
      value.textContent = String(n);
      toggle.setAttribute("aria-label", `More, ${n}`);
      buttons.set(list);
      paint();
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
  let head = h("header", { className: "tool-head" }, badge, h("div", { className: "tool-text" }, name, sub));
  const stats = h("div", { className: "tool-stats" });
  const buttons = buttonRow(send);
  const width = widthBlock(send);
  const more = moreBlock(send);
  const tanks = h("div", { className: "tool-tanks" });
  const el = h("section", { className: "tool-card" }, head, stats, buttons.el, more.el, width.el, tanks);
  // a tap anywhere on the card selects its tool, as the head does; its
  // buttons only press (specs/0010, revision 2)
  el.addEventListener("click", (ev) => {
    const target = /** @type {Element} */ (ev.target);
    if (head.contains(target) || target.closest("button, a, input, select, .control")) return;
    if (head.dataset.pick === "true") head.click();
  });
  let lastHead = "";
  let lastKind = "";
  let lastStats = "";
  let lastTanks = "";
  return {
    el,
    /**
     * @param {RigEntry} e @param {Vehicle|undefined} v @param {ReturnType<typeof ratesOf>} rates
     * @param {import("../data/units.js").Units} units
     * @param {boolean} [compact] three or more cards: the width's buttons go, More stays closed
     */
    render(e, v, rates, units, compact = false) {
      const model = entryModel(e, v) || "Tool";
      el.dataset.id = String(e.id);
      el.dataset.vehicle = String(e.depth === 0);
      el.setAttribute("aria-label", model);
      const kind = entryKind(e, v);
      if (kind !== lastKind) badge.replaceChildren(icon((lastKind = kind)));
      // working: the badge's "on" look (specs/0013: no Working chip)
      badge.dataset.on = String(working(e));
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
      const all = toolButtons(e);
      more.render(model, moreCount(e), all.filter((b) => b.more), compact);
      buttons.set(all.filter((b) => !b.more && !b.key.startsWith("width:")), more.tile());
      // the sections the nozzles spray while on, else those set by hand (specs/0013 revision 4)
      width.render(e.width, compact ? [] : all.filter((b) => b.key.startsWith("width:")), units,
        sectionsSpraying(e, implementById(v, e.id)));
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
 * The cards: one per working thing, front of the rig to the back, as many as fit at
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
  /** @type {string|undefined} */
  let lastOrder;
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const shown = v ? cardsOf(v, cab) : [];
    const tools = screenRig(v, cab).filter((e) => e.depth > 0);
    none.textContent = !v ? "Get in a vehicle to see its tools here" : tools.length ? "" : "Nothing attached";
    none.hidden = !none.textContent;
    root.dataset.count = String(shown.length);
    root.dataset.compact = String(shown.length >= COMPACT_FROM);
    const keys = shown.map(keyOf);
    const order = JSON.stringify(keys);
    if (order !== lastOrder) {
      lastOrder = order;
      for (const key of [...cards.keys()]) if (!keys.includes(key)) cards.delete(key);
      for (const key of keys) if (!cards.has(key)) cards.set(key, toolCard(send));
      list.replaceChildren(...keys.map((key) => /** @type {any} */ (cards.get(key)).el));
    }
    const units = unitsOf(store);
    shown.forEach((e, i) => cards.get(keys[i])?.render(e, v, rates, units, shown.length >= COMPACT_FROM));
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * All tools (specs/0013): the column's third group, under Drive, three to a
 * row. With two or more working things, a button for each thing they
 * share, lit while every one of them is on; Turn on all waits while one is
 * folded ("Unfold first"). Their parts decide the buttons (specs/0012), so
 * the group comes with the rig and stays while it's the same. A failed
 * answer shows on its button, "Failed", as on a card.
 * @type {import("./widget.js").CreateWidget}
 */
export function toolsAll(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const buttons = buttonRow(send, "control-grid");
  const root = h("section", { className: "control-group tools-all" },
    h("h2", { className: "control-group-label", text: "All tools" }), buttons.el);
  root.setAttribute("aria-label", "All tools");
  if (opts.id) root.id = opts.id;
  const render = () => {
    const v = controlledVehicle(store);
    const actions = v ? allActions(cardsOf(v, cabOf(store))) : [];
    root.hidden = actions.length === 0;
    buttons.set(actions.map((a) => ({ key: a.cap, label: a.label, icon: ALL_ICONS[a.cap] || "implement",
      action: a.action, value: a.value, on: a.on, unavailable: a.unavailable,
      moving: a.moving })));
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  return root;
}

const ALL_ICONS = /** @type {Record<string, string>} */ ({
  fold: "fold", lower: "lowerAll", turnOn: "implementOn", tip: "unload", cover: "cover",
});

/** "Fendt · Weights · Front · Raised": an Also attached card's line, under its model. */
export function alsoLine(/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) {
  const state = lowersInRig(e, v) ? (e.lowered ? "Lowered" : "Raised") : "";
  return [cardSub(e, v), state].filter(Boolean).join(" · ");
}

/**
 * Also attached: each tool with no card as a slim card at the bottom of the
 * tools: its badge, model and line, then Lower / Raise (where it lowers)
 * and Detach, the column's size.
 * @type {import("./widget.js").CreateWidget}
 */
export function toolsAlso(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const list = h("ul", { className: "tools-also-list" });
  const root = h("section", { className: "tools-also" }, h("span", { className: "veh-cap", text: "Also attached" }), list);
  root.setAttribute("aria-label", "Also attached");
  if (opts.id) root.id = opts.id;
  /** @type {Map<unknown, {el: HTMLElement, name: HTMLElement, sub: HTMLElement, badge: HTMLElement,
   *   buttons: ReturnType<typeof buttonRow>, kind: string}>} */
  const rows = new Map();
  /** @type {string|undefined} */
  let lastOrder;
  const render = () => {
    const v = controlledVehicle(store);
    const also = v ? alsoAttached(v, cabOf(store)) : [];
    root.hidden = also.length === 0;
    const keys = also.map(keyOf);
    const order = JSON.stringify(keys);
    if (order !== lastOrder) {
      lastOrder = order;
      for (const key of keys) {
        if (rows.has(key)) continue;
        const badge = h("span", { className: "tool-badge" });
        const name = h("b", { className: "tool-name" });
        const sub = h("span", { className: "tool-sub" });
        const buttons = buttonRow(send);
        rows.set(key, { el: h("li", { className: "tools-also-row" }, h("div", { className: "tool-head" }, badge,
          h("div", { className: "tool-text" }, name, sub)), buttons.el), name, sub, badge, buttons, kind: "" });
      }
      list.replaceChildren(...keys.map((key) => /** @type {any} */ (rows.get(key)).el));
    }
    also.forEach((e, i) => {
      const row = /** @type {any} */ (rows.get(keys[i]));
      const kind = entryKind(e, v);
      if (kind !== row.kind) row.badge.replaceChildren(icon((row.kind = kind)));
      row.name.textContent = entryModel(e, v) || "Tool";
      row.sub.textContent = alsoLine(e, v);
      row.buttons.set(toolButtons(e).filter((b) => b.key === "detach" || (b.key === "lower" && lowersInRig(e, v))));
    });
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  return root;
}
