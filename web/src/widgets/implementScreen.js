// @ts-check
// The Implement screen (docs/THEMES.md, Implement screen): what the tool is
// doing and when to act, where the Vehicle screen says how the tractor is.
// - rigBand: the job in words, speed, PTO, when the first tank runs out and
//   the Engine button, over the rig as tiles in driving order (rear tools
//   left, the vehicle, front tools right).
// - implementCard: the tool the game has selected: ‹ › (and a swipe), four
//   stats, its buttons (the Vehicle screen's implement controls, plus the
//   pipe, unloading or tipping, the cover and Detach), and its tanks with
//   time estimates.
// - implementDetails: wear, working width, area this run, folding, Show on
//   map.
// Selecting is selecting in game (Controls C3): a tile, ‹ › or a swipe send
// implement.select, previous or next, and the selection shows once the cab
// has it; G in game moves it too. The dashboard keeps no pick of its own.
// Estimates come from data/rates.js.

import {
  cabOf, controlledVehicle, entryModel, fillLimitPct, fillMax, fillName, fillPct, fillStop, fillsOf, implementById,
  implementsOf, kindLabel,
  drivingOrder, lowersInRig, rigJob, rigOf, selectedInRig, vehicleKind,
} from "../data/selectors.js";
import { areaText, lengthText, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { minutesText, ratesOf, timeLeft } from "../data/rates.js";
import { sendCommand } from "../connection.js";
import { controlGroup } from "./controls.js";
import { fillMeter, hitchText, maxBadge } from "./implements.js";
import { fmt, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").RigEntry} RigEntry */
/** @typedef {import("../data/selectors.js").Implement} Implement */
/** @typedef {import("../types.js").Vehicle} Vehicle */
/** @typedef {(action: string, value?: number) => Promise<import("../commands.js").CommandResult>} Send */

// a tank this full (of where it stops: its weight limit, else its
// capacity), or full this soon, asks for a trailer
const CALL_TRAILER_PCT = 80;
const CALL_TRAILER_MIN = 3;
// a swipe this far sideways selects the previous or next tool
const SWIPE_PX = 60;

/**
 * The rig the screen shows: the cab's, or (a mod before 0.7.0) the vehicle
 * and its implements, none of them selectable.
 * @param {Vehicle|undefined} v
 * @param {import("../types.js").Cab|undefined} cab
 * @returns {RigEntry[]}
 */
export function screenRig(v, cab) {
  const rig = rigOf(cab);
  if (rig.length || !v) return rig;
  return [{ id: /** @type {any} */ (v.id), name: v.name, depth: 0 },
    ...implementsOf(v).map((i) => ({ ...i, depth: i.depth || 1 }))];
}

/** The entry the card shows: the game's selection, else the first tool, else the vehicle. */
export function cardEntry(/** @type {Vehicle|undefined} */ v, /** @type {any} */ cab) {
  const rig = screenRig(v, cab);
  return selectedInRig(cab) || rig.find((e) => e.depth > 0) || rig[0];
}

/** The vehicles topic's side of an entry: its implement, or the vehicle itself. */
const detailOf = (/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) =>
  /** @type {Implement|undefined} */ (e.depth === 0 ? v : implementById(v, e.id));

/** The kind's icon: tools never count as tractors. */
function entryKind(/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) {
  const d = detailOf(e, v);
  return e.depth === 0 ? vehicleKind(v) : vehicleKind({ ...d, motorized: false });
}

/** Working: turned on, or discharging (the yellow badge, as in the Attached rows). */
const working = (/** @type {RigEntry} */ e) => e.turnedOn === true || e.discharging === true;

/** Whether this tool lowers and raises: not a front loader or its tools (selectors.js isLoaderGear). */
const lowers = (/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) => lowersInRig(e, v);

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
  if (lowers(e, v)) parts.push(hitchText({ ...detailOf(e, v), lowered: e.lowered }));
  if (e.foldable && e.foldMoving) parts.push("Folding…");
  else if (e.foldable && e.unfolded === false) parts.push("Folded");
  if (e.cover?.open) parts.push("Cover open");
  if (!parts.length && e.depth === 0) parts.push(v?.engineOn ? "Engine on" : "Engine off");
  return parts.slice(0, 2).join(" · ");
}

/**
 * Every tank in the rig with its estimate, in rig order.
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
 * The first tank to run out, else the first to fill up: "Seeds empty ≈ 12 min".
 * @param {ReturnType<typeof rigTanks>} tanks
 */
export function firstEvent(tanks) {
  const soonest = (/** @type {boolean} */ full) => tanks.filter((t) => t.left && t.left.full === full)
    .sort((a, b) => (a.left?.minutes ?? 0) - (b.left?.minutes ?? 0))[0];
  const t = soonest(false) || soonest(true);
  if (!t || !t.left) return undefined;
  return `${t.fill.fillType ? fillName(t.fill) : "Tank"} ${t.left.full ? "full" : "empty"} ${minutesText(t.left.minutes)}`;
}

/**
 * The selection: a tap on something the game can select sends
 * implement.select, pending until the cab shows it (or 1.5 s).
 * @param {HTMLElement} el
 * @param {RigEntry} e
 * @param {string} name
 * @param {Send} send
 */
function pickable(el, e, name, send) {
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

/** A thin bar per fill unit, its weight limit shaded. @param {import("../data/selectors.js").Fill[]} fills */
function fillBars(fills) {
  return h("div", { className: "rig-bars" }, ...fills.map((f) => {
    const meter = fillMeter(f);
    meter.title = `${fillName(f)} ${Math.round(fillPct(f))}%${fillMax(f) ? " · MAX" : ""}`;
    return meter;
  }));
}

/**
 * The rig band: the job, speed, PTO and the first tank to run out, the
 * Engine button, and the rig as tiles.
 * @type {import("./widget.js").CreateWidget}
 */
export function rigBand(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const rates = ratesOf(store);
  const badge = h("span", { className: "readout-badge" });
  const job = h("b", { className: "rig-job" });
  const speed = h("span", { className: "rig-chip rig-speed" });
  const pto = h("span", { className: "rig-chip" }, icon("pto"), h("span"));
  const runout = h("span", { className: "rig-chip rig-runout" }, icon("fill"), h("span"));
  const engine = /** @type {HTMLElement} */ (controlGroup({ label: "Engine", controls: ["engineOn"] }, store, send)
    .querySelector(".control"));
  engine.classList.add("readout-engine");
  const tiles = h("ol", { className: "rig-tiles" });
  tiles.setAttribute("aria-label", "Rig");
  const root = h("div", { className: "rig-band" },
    h("div", { className: "rig-head" }, badge, job, speed, pto, runout), tiles, engine);
  if (opts.id) root.id = opts.id;

  let lastIcon = "";
  let lastTiles = "";
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const units = unitsOf(store);
    const what = rigJob(v, cab);
    if (what.icon !== lastIcon) badge.replaceChildren(icon((lastIcon = what.icon)));
    job.textContent = what.text;
    speed.hidden = typeof v?.speed !== "number";
    speed.textContent = typeof v?.speed === "number" ? `${fmt(speedValue(v.speed, units), 1)} ${speedUnit(units)}` : "";
    pto.hidden = typeof v?.pto !== "boolean";
    pto.dataset.state = v?.pto ? "on" : "off";
    /** @type {HTMLElement} */ (pto.lastElementChild).textContent = v?.pto ? "PTO on" : "PTO off";
    const rig = screenRig(v, cab);
    const event = firstEvent(rigTanks(rig, v, rates));
    runout.hidden = !event;
    /** @type {HTMLElement} */ (runout.lastElementChild).textContent = event || "";

    const order = drivingOrder(rig);
    const shown = order.map((e) => ({
      e, name: e.depth === 0 ? entryModel(e, v) : entryModel(e, v) || "Tool", kind: entryKind(e, v),
      state: tileState(e, v), fills: fillsOf(/** @type {any} */ (detailOf(e, v))),
    }));
    const key = JSON.stringify(shown.map((t) => [t.e.id, t.e.selected, t.e.selectable, t.name, t.kind, t.state,
      working(t.e), t.fills.map((f) => [Math.round(fillPct(f)), fillLimitPct(f), fillMax(f)])]));
    if (key === lastTiles) return;
    lastTiles = key;
    tiles.replaceChildren(...shown.map((t) => {
      const tileBadge = h("span", { className: "rig-badge" }, icon(t.kind));
      tileBadge.dataset.on = String(working(t.e));
      const tile = h("li", { className: "rig-tile" }, tileBadge,
        h("div", { className: "rig-text" }, h("b", { text: t.name }), h("span", { text: t.state })));
      if (t.fills.length) tile.append(fillBars(t.fills));
      tile.dataset.depth = String(t.e.depth);
      pickable(tile, t.e, t.name, send);
      return tile;
    }));
    root.dataset.empty = String(shown.length === 0);
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * One stat tile: a label, a value, a bar.
 * @param {string} label
 */
function statTile(label) {
  const labelEl = h("span", { className: "impl-stat-label", text: label });
  const value = h("b", { className: "impl-stat-value" });
  const bar = h("span");
  const meter = h("span", { className: "widget-meter" }, bar);
  const el = h("div", { className: "impl-stat" }, labelEl, value, meter);
  return {
    el,
    /** @param {{label: string, value: string, pct?: number, level?: string, title?: string}} s */
    set(s) {
      labelEl.textContent = s.label;
      value.textContent = s.value;
      meter.hidden = s.pct === undefined;
      bar.style.width = `${Math.max(0, Math.min(100, s.pct ?? 0))}%`;
      if (s.level) el.dataset.level = s.level;
      else delete el.dataset.level;
      if (s.title) el.title = s.title;
      else el.removeAttribute("title");
    },
  };
}

/**
 * The card's four stats: Lift, Work, PTO and Speed against the tool's
 * working speed limit; a trailer shows Load (every trailer together),
 * Tipping and Cover in place of the first three.
 * @param {RigEntry} e
 * @param {Vehicle|undefined} v
 * @param {RigEntry[]} rig
 * @param {import("../data/units.js").Units} units
 * @returns {{label: string, value: string, pct?: number, level?: string, title?: string}[]}
 */
export function cardStats(e, v, rig, units) {
  const d = detailOf(e, v);
  const onOff = (/** @type {boolean|undefined} */ x) => (x === undefined ? "–" : x ? "On" : "Off");
  /** @type {{label: string, value: string, pct?: number, level?: string, title?: string}[]} */
  const out = [];
  if (e.trailer) {
    let level = 0;
    let capacity = 0;
    let max = false;
    for (const t of rig.filter((r) => r.trailer)) {
      for (const f of fillsOf(/** @type {any} */ (detailOf(t, v)))) {
        level += f.level;
        capacity += f.capacity;
        max = max || fillMax(f);
      }
    }
    out.push(capacity > 0
      ? { label: "Load", value: `${Math.round((100 * level) / capacity)}%${max ? " · MAX" : ""}`,
        pct: (100 * level) / capacity,
        title: `${Math.round(level).toLocaleString()} / ${Math.round(capacity).toLocaleString()} L` }
      : { label: "Load", value: "–" });
    out.push({ label: "Tipping", value: onOff(typeof e.discharging === "boolean" ? e.discharging : undefined) });
    out.push({ label: "Cover", value: e.cover ? (e.cover.open ? "Open" : "Closed") : "–" });
  } else {
    if (lowers(e, v)) {
      const at = typeof d?.hitch === "number" ? d.hitch : e.lowered ? 1 : 0;
      out.push({ label: "Lift", value: hitchText({ ...d, lowered: e.lowered }), pct: 100 * at });
    } else {
      out.push({ label: "Lift", value: "–" });
    }
    out.push({ label: "Work", value: e.canTurnOn === false || (e.depth === 0 && !e.canTurnOn) ? "–" : onOff(e.turnedOn === true) });
    const p = /** @type {any} */ (d)?.pto;
    out.push({ label: "PTO", value: onOff(typeof p === "boolean" ? p : undefined) });
  }
  const kmh = typeof v?.speed === "number" ? v.speed : undefined;
  const limit = /** @type {any} */ (d)?.speedLimit;
  const unit = speedUnit(units);
  if (kmh === undefined) {
    out.push({ label: "Speed", value: "–" });
  } else if (typeof limit === "number" && limit > 0) {
    out.push({ label: "Speed", value: `${Math.round(speedValue(kmh, units))} / ${Math.round(speedValue(limit, units))} ${unit}`,
      pct: (100 * kmh) / limit, level: kmh > limit + 0.5 ? "warn" : undefined, title: "Speed / the tool's working limit" });
  } else {
    out.push({ label: "Speed", value: `${fmt(speedValue(kmh, units), 1)} ${unit}` });
  }
  return out;
}

/**
 * The card's tanks: each fill unit with its litres and estimate; the one
 * that runs out first (of two or more) gets a chip, and a tank filling up
 * that's nearly full asks for a trailer, as does a harvester's tank at its
 * weight limit (the game's MAX: it takes no more).
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
      name: fillName(t.fill), pct, chips, max, fill: t.fill,
      litres: `${Math.round(t.fill.level).toLocaleString()} / ${Math.round(t.fill.capacity).toLocaleString()} L`,
      when: max ? "at its weight limit"
        : t.left ? `${t.left.full ? "full in" : "empty in"} ${minutesText(t.left.minutes)}` : "",
    };
  });
}

/**
 * The implement card: the tool the game has selected.
 * @type {import("./widget.js").CreateWidget}
 */
export function implementCard(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const rates = ratesOf(store);
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
  const prev = step("toolPrev", "Previous tool", "implement.previous");
  const next = step("toolNext", "Next tool", "implement.next");
  const badge = h("span", { className: "impl-badge" });
  const name = h("b", { className: "impl-card-name" });
  const sub = h("span", { className: "impl-card-sub" });
  const workChip = h("span", { className: "impl-chip", text: "Working" });
  workChip.dataset.state = "active";
  const head = h("header", { className: "impl-card-head" }, prev, badge,
    h("div", { className: "impl-card-text" }, name, sub), workChip, next);
  const stats = [0, 1, 2, 3].map(() => statTile(""));
  const ids = ["implementLowered", "implementOn", "unload", "fold", "cover", "pipe", "straw", "detach"];
  const buttons = controlGroup({ label: "Controls", controls: ids }, store, send);
  buttons.classList.add("impl-card-controls");
  const controls = /** @type {HTMLElement[]} */ ([...buttons.querySelectorAll(".control")]);
  const byId = Object.fromEntries(ids.map((id, i) => [id, controls[i]]));
  const tanks = h("div", { className: "impl-tanks" });
  const root = h("div", { className: "impl-card" }, head,
    h("div", { className: "impl-stats" }, ...stats.map((s) => s.el)), buttons, tanks);
  if (opts.id) root.id = opts.id;

  // a swipe sideways: left for the next tool, right for the previous one
  /** @type {{x: number, y: number}|undefined} */
  let down;
  root.addEventListener("pointerdown", (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);
    down = target.closest("button, .control") ? undefined : { x: ev.clientX, y: ev.clientY };
  });
  root.addEventListener("pointerup", (ev) => {
    if (!down || next.hidden) return;
    const dx = ev.clientX - down.x;
    const dy = ev.clientY - down.y;
    down = undefined;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) (dx < 0 ? next : prev).click();
  });
  root.addEventListener("pointercancel", () => { down = undefined; });

  let lastKind = "";
  let lastTanks = "";
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const rig = screenRig(v, cab);
    const e = cardEntry(v, cab);
    root.dataset.empty = String(!e);
    const several = rigOf(cab).filter((r) => r.selectable).length > 1;
    prev.hidden = !several;
    next.hidden = !several;
    if (!e) {
      name.textContent = "Get in a vehicle to see its tools here";
      sub.textContent = "";
      workChip.hidden = true;
      return;
    }
    const kind = entryKind(e, v);
    if (kind !== lastKind) badge.replaceChildren(icon((lastKind = kind)));
    badge.dataset.on = String(working(e));
    name.textContent = entryModel(e, v) || "Tool";
    const side = e.side === "front" ? "Front" : e.side === "rear" ? "Rear" : "";
    sub.textContent = [kindLabel(e.depth === 0 ? v : { ...detailOf(e, v), motorized: false }), side]
      .filter(Boolean).join(" · ");
    workChip.hidden = !working(e);
    workChip.textContent = e.discharging ? (e.trailer ? "Tipping" : "Unloading") : "Working";
    cardStats(e, v, rig, unitsOf(store)).forEach((s, i) => stats[i].set(s));

    // the tool's own buttons: a trailer tips and has a cover, a combine
    // has its pipe and unloads; the rest show for every tool, unavailable
    // when it can't. The vehicle's own keys (a combine's pipe, unloading
    // and straw) stay whatever tool is selected, as in the game's help.
    const trailer = e.trailer === true;
    const head = rigOf(cab).find((r) => r.depth === 0);
    const pipe = !!e.pipe || !!head?.pipe;
    byId.implementOn.hidden = trailer;
    byId.unload.hidden = !trailer && !pipe;
    byId.cover.hidden = !trailer && !e.cover;
    byId.pipe.hidden = !pipe;
    byId.straw.hidden = !e.straw && !head?.straw;

    const own = rigTanks([e], v, rates);
    const rows = tankRows(own);
    const key = JSON.stringify(rows);
    if (key === lastTanks) return;
    lastTanks = key;
    tanks.hidden = rows.length === 0;
    tanks.replaceChildren(...rows.map((t) => {
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
    }));
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * The details card: wear, working width, area this run, folding state, and
 * Show on map (a "showonmap" event that main.js handles).
 * @type {import("./widget.js").CreateWidget}
 */
export function implementDetails(store, opts = {}) {
  const rates = ratesOf(store);
  /** @param {string} iconName @param {string} label */
  const row = (iconName, label) => {
    const value = h("dd");
    const bar = h("span");
    const meter = h("span", { className: "widget-meter" }, bar);
    const el = h("div", {}, h("dt", {}, icon(iconName), h("span", { text: label })), value, meter);
    return { el, value, meter, bar };
  };
  const wear = row("wear", "Wear");
  const width = row("workWidth", "Working width");
  const area = row("area", "Area this run");
  const fold = row("fold", "Folding");
  const show = h("button", { className: "show-on-map impl-show" }, icon("map"), h("span", { text: "Show on map" }));
  show.setAttribute("type", "button");
  show.addEventListener("click", () => show.dispatchEvent(new CustomEvent("showonmap", { bubbles: true })));
  const root = h("div", { className: "impl-details" }, h("h2", { text: "Details" }),
    h("dl", {}, wear.el, width.el, area.el, fold.el), show);
  if (opts.id) root.id = opts.id;

  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const units = unitsOf(store);
    const e = cardEntry(v, cab);
    const d = e && detailOf(e, v);
    const tools = e?.depth === 0 ? implementsOf(v) : d ? [/** @type {Implement} */ (d)] : [];
    const w = typeof d?.wear === "number" ? d.wear : undefined;
    wear.value.textContent = w === undefined ? "–" : `${Math.round(100 * w)}%`;
    wear.meter.hidden = w === undefined;
    wear.bar.style.width = `${100 * (w ?? 0)}%`;
    const widest = Math.max(0, ...tools.map((t) => (typeof t.workWidth === "number" ? t.workWidth : 0)));
    width.value.textContent = widest > 0 ? lengthText(widest, units) : "–";
    width.meter.hidden = true;
    const ha = tools.reduce((sum, t) => sum + (rates.area(t.id) ?? 0), 0);
    area.value.textContent = ha > 0 ? `≈ ${areaText(ha, units)}` : "–";
    area.meter.hidden = true;
    fold.value.textContent = !e?.foldable ? "–" : e.foldMoving ? "Folding…" : e.unfolded === false ? "Folded" : "Unfolded";
    fold.meter.hidden = true;
    show.hidden = !v;
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}
