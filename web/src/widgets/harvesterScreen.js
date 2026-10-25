// @ts-check
// The Harvester screen (specs/0001-harvester-screen.md; look in docs/THEMES.md,
// Harvester screen): the Vehicle tab's other page, for a combine.
// - harvestBand: the job and the rig, then the grain tank, until full, the
//   yield and the speed against the header's limit.
// - combineCard: the grain tank with Call a trailer, the Thresher, Pipe and
//   Straw tiles (each its state and its button), Yield, Throughput, This run,
//   Total and the combine's wear.
// - headerCard: the lift, the Header and Fold tiles, working width, speed
//   limit and the header's wear.
// Data: the vehicles topic's combine (fills with massPerLiter, crop,
// hectares, Precision Farming's yield, wear) and its header (hitch, wear,
// workWidth, speedLimit), and the cab's rig (pipe, straw, turnedOn, lowered,
// fold). Rates come from data/rates.js; without Precision Farming the yield
// is our own estimate (createYieldEstimate).

import {
  cabOf, controlledVehicle, entryModel, fillLimitPct, fillMax, fillName, fillPct, fillStop, fillsOf, implementById,
  rigOf, vehicleKind, cropTitle,
} from "../data/selectors.js";
import { areaUnit, areaValue, lengthText, perAreaValue, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { minutesText, ratesOf, timeLeft } from "../data/rates.js";
import { sendCommand } from "../connection.js";
import { controlTiles } from "./controls.js";
import { fillMeter, maxBadge } from "./implements.js";
import { fmt, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").RigEntry} RigEntry */
/** @typedef {import("../types.js").Vehicle} Vehicle */
/** @typedef {import("../data/selectors.js").Fill} Fill */
/** @typedef {import("../data/units.js").Units} Units */
/** @typedef {{tPerHa: number, ha: number}} YieldEstimate */
/**
 * @typedef {{rate: (owner: any, fill: any, i: number) => number|undefined,
 *   rising?: (owner: any, fill: any, i: number) => boolean}} Rates
 */

// the tank this full (of where it stops), or full this soon, calls a trailer
const CALL_TRAILER_PCT = 80;
const CALL_TRAILER_MIN = 3;
// the yield estimate shows from this much area counted
export const YIELD_MIN_HA = 0.05;
// moving: harvesting, not standing with the thresher on
const MOVING_KMH = 0.5;

/** A combine: what the Vehicle tab shows the Harvester screen for. @param {Vehicle|undefined} v */
export const isHarvester = (v) => !!v && vehicleKind(v) === "harvester";

/**
 * The combine and its header: the rig's vehicle and the first tool that
 * lowers in front of it (the cutter).
 * @param {any} cab
 * @returns {{head: RigEntry|undefined, header: RigEntry|undefined}}
 */
export function harvestRig(cab) {
  const rig = rigOf(cab);
  return {
    head: rig.find((e) => e.depth === 0),
    header: rig.find((e) => e.depth === 1 && e.side !== "rear" && e.canLower !== false && typeof e.lowered === "boolean"),
  };
}

/** The combine's grain tank: its first fill unit. @param {Vehicle|undefined} v */
const grainFill = (v) => fillsOf(/** @type {any} */ (v))[0];

/**
 * The job: Harvesting · crop only with the thresher on, the header lowered
 * and the combine moving; Ready with the thresher on otherwise; Standing.
 * @param {Vehicle|undefined} v
 * @param {any} cab
 * @returns {{text: string, state: "harvesting"|"ready"|"standing"|"none"}}
 */
export function harvestJob(v, cab) {
  if (!isHarvester(v)) return { text: "Get in a combine to see it here", state: "none" };
  const { head, header } = harvestRig(cab);
  if (!head?.turnedOn) return { text: "Standing", state: "standing" };
  if (header?.lowered && (v?.speed ?? 0) > MOVING_KMH) {
    const crop = cropTitle(v);
    return { text: crop ? `Harvesting · ${crop}` : "Harvesting", state: "harvesting" };
  }
  return { text: "Ready", state: "ready" };
}

/**
 * The grain tank: its litres (and tonnes), how fast it fills, when it's
 * full, and whether to call a trailer: at 80% of where it stops (its
 * capacity, or its weight limit), 3 minutes before full, or at MAX.
 * @param {Fill} fill
 * @param {number|undefined} perMin litres a minute over the last minute
 */
export function grainTankState(fill, perMin) {
  const filling = typeof perMin === "number" && perMin > 0;
  const left = filling ? timeLeft(fill, perMin) : undefined;
  const ofStop = (100 * fill.level) / fillStop(fill);
  const mass = /** @type {any} */ (fill).massPerLiter;
  const tonnes = typeof mass === "number" && fill.level > 0 ? ` · ${fmt(fill.level * mass, 1)} t` : "";
  return {
    pct: fillPct(fill),
    litres: `${Math.round(fill.level).toLocaleString()} / ${Math.round(fill.capacity).toLocaleString()} L${tonnes}`,
    rate: filling ? `Filling at about ${Math.round(/** @type {number} */ (perMin)).toLocaleString()} L/min` : undefined,
    left,
    call: fillMax(fill) || ofStop >= CALL_TRAILER_PCT || (!!left && left.minutes <= CALL_TRAILER_MIN),
  };
}

/**
 * The yield: Precision Farming's when it's there, else our estimate (≈),
 * "–" before there's enough of it. t/ha, or t/ac with acres.
 * @param {Vehicle|undefined} v
 * @param {YieldEstimate|undefined} est
 * @param {Units} units
 */
export function yieldShown(v, est, units) {
  const y = /** @type {any} */ (v)?.yield;
  const unit = `t/${areaUnit(units)}`;
  if (y && typeof y.tPerHa === "number") {
    return { value: fmt(perAreaValue(y.tPerHa, units), 1), unit,
      sub: typeof y.pct === "number" ? `${Math.round(y.pct)}% of potential` : "Precision Farming" };
  }
  return { value: est ? `≈ ${fmt(perAreaValue(est.tPerHa, units), 1)}` : "–", unit, sub: "estimate, no Precision Farming" };
}

/**
 * The band's four numbers: the grain tank, until full, the yield, the
 * speed against the header's working limit. Until full reads "measuring…"
 * while the tank rises but there isn't a rate yet (the first ~20 s).
 * @param {Vehicle|undefined} v
 * @param {any} cab
 * @param {number|undefined} perMin
 * @param {YieldEstimate|undefined} est
 * @param {Units} units
 * @param {boolean} [rising] the level went up over the last seconds
 * @returns {{id: string, value: string, unit: string, label: string, alert: boolean}[]}
 */
export function bandReadouts(v, cab, perMin, est, units, rising = false) {
  const fill = grainFill(v);
  const tank = fill ? grainTankState(fill, perMin) : undefined;
  const left = tank?.left;
  const y = yieldShown(v, est, units);
  const { header } = harvestRig(cab);
  const limit = header ? /** @type {any} */ (implementById(v, header.id))?.speedLimit : undefined;
  const unit = speedUnit(units);
  return [
    { id: "tank", value: tank ? String(Math.round(tank.pct)) : "–", unit: "%", label: "grain tank", alert: false },
    left
      ? { id: "full", value: minutesText(left.minutes).replace(/ min$/, ""), unit: "min", label: "until full", alert: !!tank?.call }
      : { id: "full", value: "–", unit: "", label: rising ? "measuring…" : "not filling", alert: !!tank?.call },
    { id: "yield", value: y.value, unit: y.unit, label: "yield", alert: false },
    { id: "speed", value: typeof v?.speed === "number" ? fmt(speedValue(v.speed, units), 1) : "–", unit,
      label: typeof limit === "number" && limit > 0 ? `limit ${Math.round(speedValue(limit, units))} ${unit}` : "no limit",
      alert: false },
  ];
}

/**
 * The Combine card's stats: Yield, Throughput (t/h from the last minute's
 * rate, "0" while not filling, "–" and "measuring…" while it rises without
 * a rate yet, "–" without the crop's mass), This run and Total.
 * @param {Vehicle|undefined} v
 * @param {number|undefined} perMin
 * @param {YieldEstimate|undefined} est
 * @param {Units} units
 * @param {boolean} [rising] the level went up over the last seconds
 * @returns {{id: string, label: string, value: string, unit: string, sub: string}[]}
 */
export function combineStats(v, perMin, est, units, rising = false) {
  const y = yieldShown(v, est, units);
  const mass = /** @type {any} */ (grainFill(v))?.massPerLiter;
  const measuring = rising && !(typeof perMin === "number" && perMin > 0);
  const tph = typeof mass !== "number" || measuring ? undefined
    : typeof perMin === "number" && perMin > 0 ? (perMin * 60 * mass) : 0;
  const ha = /** @type {any} */ (v)?.hectares;
  const area = (/** @type {unknown} */ x) => (typeof x === "number" ? areaValue(x, units).toFixed(2) : "–");
  return [
    { id: "yield", label: "Yield", value: y.value, unit: y.unit, sub: y.sub },
    { id: "throughput", label: "Throughput", value: tph === undefined ? "–" : tph === 0 ? "0" : fmt(tph, 1), unit: "t/h",
      sub: measuring ? "measuring…" : "last minute" },
    { id: "run", label: "This run", value: area(ha?.run), unit: areaUnit(units), sub: "since you got in" },
    { id: "total", label: "Total", value: area(ha?.total), unit: areaUnit(units), sub: "this combine" },
  ];
}

/**
 * Our yield estimate without Precision Farming: the grain that went into
 * the tank this run (litres × the crop's mass per litre) over the area done
 * meanwhile, both counted only while the tank rises with the pipe in, so
 * unloading on the move doesn't pull it down. Starts again in another
 * vehicle or when the game's run starts again.
 * @param {{get: (key: string) => any, subscribe: (key: string, fn: () => void) => any}} store
 */
export function createYieldEstimate(store) {
  /** @type {unknown} */
  let vehicleId;
  /** @type {{level: number, run: number}|undefined} */
  let last;
  let tonnes = 0;
  let ha = 0;
  store.subscribe("vehicles", () => {
    const v = controlledVehicle(store);
    if (v?.id !== vehicleId) {
      vehicleId = v?.id;
      last = undefined;
      tonnes = 0;
      ha = 0;
    }
    const fill = grainFill(v);
    const run = /** @type {any} */ (v)?.hectares?.run;
    if (!fill || typeof run !== "number") { last = undefined; return; }
    const mass = /** @type {any} */ (fill).massPerLiter;
    const pipeOut = harvestRig(cabOf(store)).head?.pipe?.out === true;
    if (last) {
      const dl = fill.level - last.level;
      const dha = run - last.run;
      if (dha < 0) {
        tonnes = 0;
        ha = 0;
      } else if (dl > 0 && !pipeOut && typeof mass === "number") {
        tonnes += dl * mass;
        ha += dha;
      }
    }
    last = { level: fill.level, run };
  });
  return {
    /** @returns {YieldEstimate|undefined} */
    get: () => (ha >= YIELD_MIN_HA - 1e-9 ? { tPerHa: tonnes / ha, ha } : undefined),
  };
}

/** @type {WeakMap<object, ReturnType<typeof createYieldEstimate>>} */
const estimates = new WeakMap();

/** The store's yield estimate, made on first use. @param {Parameters<typeof createYieldEstimate>[0]} store */
export function yieldOf(store) {
  let est = estimates.get(store);
  if (!est) {
    est = createYieldEstimate(store);
    estimates.set(store, est);
  }
  return est;
}

/** The combine's grain rate (litres a minute) from the rates. @param {Rates} rates @param {Vehicle|undefined} v */
const grainRate = (rates, v) => {
  const fill = grainFill(v);
  return fill && v ? rates.rate(v.id, fill, 0) : undefined;
};
/** Whether the grain tank's level is going up. @param {Rates} rates @param {Vehicle|undefined} v */
const grainRising = (rates, v) => {
  const fill = grainFill(v);
  return !!fill && !!v && rates.rising?.(v.id, fill, 0) === true;
};

/** The widgets' options: tests pass their own rates and send. */
const ratesFrom = (/** @type {any} */ opts, /** @type {any} */ store) => /** @type {Rates} */ (opts.rates || ratesOf(store));

/**
 * The band: the job and the rig, the four numbers.
 * @type {import("./widget.js").CreateWidget}
 */
export function harvestBand(store, opts = {}) {
  const rates = ratesFrom(opts, store);
  const est = yieldOf(store);
  const job = h("h1", { className: "harv-job" });
  const rig = h("p", { className: "harv-rig" });
  const ids = ["tank", "full", "yield", "speed"];
  const cells = ids.map((id) => {
    const value = h("b");
    const unit = h("span");
    const label = h("small");
    const el = h("div", { className: "harv-ro" }, h("div", {}, value, unit), label);
    el.dataset.ro = id;
    return { el, value, unit, label };
  });
  const root = h("section", { className: "harv-band" }, h("div", { className: "harv-band-text" }, job, rig),
    h("div", { className: "harv-ros" }, ...cells.map((c) => c.el)));
  root.setAttribute("aria-label", "Harvest");
  if (opts.id) root.id = opts.id;

  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const { head, header } = harvestRig(cab);
    job.textContent = harvestJob(v, cab).text;
    const model = isHarvester(v) ? entryModel(/** @type {any} */ (head || { depth: 0 }), v) : "";
    rig.textContent = model && header ? `${model} with ${entryModel(header, v)}` : model || "";
    bandReadouts(v, cab, grainRate(rates, v), est.get(), unitsOf(store), grainRising(rates, v)).forEach((r, i) => {
      const c = cells[i];
      c.value.textContent = r.value;
      c.unit.textContent = r.unit;
      c.label.textContent = r.label;
      c.el.dataset.alert = String(r.alert);
    });
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/** A card's head: the badge, the name and what it is. @param {string} iconName */
function cardHead(iconName) {
  const name = h("h2", { className: "harv-card-name" });
  const sub = h("p", { className: "harv-card-sub" });
  const el = h("div", { className: "harv-card-head" }, h("span", { className: "readout-badge" }, icon(iconName)),
    h("div", { className: "harv-card-text" }, name, sub));
  return { el, name, sub };
}

/** A wear row: the label, %, its bar. @param {string} label */
function wearRow(label) {
  const value = h("b");
  const bar = h("span");
  const el = h("div", { className: "harv-wear" }, icon("wear"),
    h("div", {}, h("div", {}, h("span", { text: label }), value), h("span", { className: "widget-meter" }, bar)));
  return {
    el,
    /** @param {unknown} w 0..1 */
    set(w) {
      value.textContent = typeof w === "number" ? `${Math.round(100 * w)}%` : "–";
      bar.style.width = `${100 * (typeof w === "number" ? w : 0)}%`;
    },
  };
}

/**
 * The Combine card: the grain tank, the tiles, the stats and the wear.
 * @type {import("./widget.js").CreateWidget}
 */
export function combineCard(store, opts = {}) {
  const rates = ratesFrom(opts, store);
  const est = yieldOf(store);
  const send = /** @type {any} */ (opts).send || sendCommand;
  const head = cardHead("harvester");
  const chip = h("span", { className: "harv-chip" });
  head.el.append(chip);
  const tankName = h("span", { className: "harv-tank-name" });
  const pct = h("b", { className: "harv-tank-pct" });
  const max = h("span", { className: "harv-max" });
  let meter = h("span", { className: "widget-meter fill-meter" });
  const meterSlot = h("div", { className: "harv-meter" }, meter);
  const litres = h("span", { className: "harv-tank-litres" });
  const rate = h("span", { className: "harv-tank-rate" }, icon("clock"), h("span"));
  const call = h("span", { className: "harv-call", text: "Call a trailer" });
  const tank = h("div", { className: "harv-tank" },
    h("div", { className: "harv-tank-head" }, tankName, max, h("span", { className: "harv-tank-value" }, pct, h("span", { text: "%" }))),
    meterSlot, h("div", { className: "harv-tank-sub" }, litres, rate, call));
  const tiles = controlTiles(["thresher", "pipe", "straw"], store, send);
  const statEls = ["yield", "throughput", "run", "total"].map((id) => {
    const label = h("span", { className: "harv-cap" });
    const value = h("b");
    const unit = h("span");
    const sub = h("small");
    const el = h("div", { className: "harv-stat" }, label, h("div", {}, value, unit), sub);
    el.dataset.stat = id;
    return { el, label, value, unit, sub };
  });
  const wear = wearRow("Combine wear");
  const root = h("section", { className: "harv-card harv-combine" }, head.el, tank, tiles,
    h("div", { className: "harv-stats" }, ...statEls.map((s) => s.el)),
    wear.el);
  root.setAttribute("aria-label", "Combine");
  if (opts.id) root.id = opts.id;

  let lastMeter = "";
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const units = unitsOf(store);
    const combine = isHarvester(v);
    const { head: entry } = harvestRig(cab);
    head.name.textContent = combine ? entryModel(/** @type {any} */ (entry || { depth: 0 }), v) || "Combine" : "No combine";
    head.sub.textContent = "Combine";
    const job = harvestJob(v, cab);
    chip.hidden = job.state === "none";
    chip.textContent = job.state === "harvesting" ? "Harvesting" : job.state === "ready" ? "Ready" : "Standing";
    chip.dataset.state = job.state === "harvesting" ? "active" : "";

    const fill = grainFill(v);
    const perMin = grainRate(rates, v);
    tank.hidden = !fill;
    if (fill) {
      const t = grainTankState(fill, perMin);
      tankName.textContent = fill.fillType && fill.level > 0 ? `Grain tank · ${fillName(fill)}` : "Grain tank";
      pct.textContent = String(Math.round(t.pct));
      max.replaceChildren(...(fillMax(fill) ? [maxBadge()] : []));
      const key = JSON.stringify([fill.level, fill.capacity, fillLimitPct(fill)]);
      if (key !== lastMeter) {
        lastMeter = key;
        const fresh = fillMeter(fill);
        meter.replaceWith(fresh);
        meter = fresh;
      }
      meter.dataset.level = t.call ? "warn" : "";
      litres.textContent = t.litres;
      rate.hidden = !t.rate;
      /** @type {HTMLElement} */ (rate.lastElementChild).textContent = t.rate || "";
      call.hidden = !t.call;
    }
    combineStats(v, perMin, est.get(), units, grainRising(rates, v)).forEach((s, i) => {
      const el = statEls[i];
      el.label.textContent = s.label;
      el.value.textContent = s.value;
      el.unit.textContent = s.unit;
      el.sub.textContent = s.sub;
    });
    wear.set(/** @type {any} */ (v)?.wear);
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * The Header card: the lift, the Header and Fold tiles, working width,
 * speed limit and wear; "No header" without one.
 * @type {import("./widget.js").CreateWidget}
 */
export function headerCard(store, opts = {}) {
  const send = /** @type {any} */ (opts).send || sendCommand;
  const head = cardHead("implement");
  const liftValue = h("b");
  const liftBar = h("i");
  const lift = h("div", { className: "harv-lift" },
    h("div", {}, h("span", { className: "harv-cap", text: "Lift" }), liftValue),
    h("span", { className: "harv-bar" }, liftBar),
    h("div", { className: "harv-bar-labels" }, h("span", { text: "Raised" }), h("span", { text: "Lowered" })));
  const tiles = controlTiles(["header", "fold"], store, send);
  /** @param {string} id @param {string} iconName @param {string} label */
  const row = (id, iconName, label) => {
    const value = h("b");
    const el = h("div", { className: "harv-row" }, icon(iconName), h("span", { text: label }), value);
    el.dataset.row = id;
    return { el, value };
  };
  const width = row("width", "workWidth", "Working width");
  const limit = row("limit", "speed", "Speed limit");
  const wear = wearRow("Header wear");
  const body = h("div", { className: "harv-header-body" }, lift, tiles,
    h("div", { className: "harv-rows" }, width.el, limit.el, wear.el));
  const root = h("section", { className: "harv-card harv-header" }, head.el, body);
  root.setAttribute("aria-label", "Header");
  if (opts.id) root.id = opts.id;

  const render = () => {
    const v = controlledVehicle(store);
    const units = unitsOf(store);
    const { header } = harvestRig(cabOf(store));
    root.dataset.empty = String(!header);
    body.hidden = !header;
    head.sub.textContent = "Header";
    if (!header) {
      head.name.textContent = "No header";
      return;
    }
    const d = /** @type {any} */ (implementById(v, header.id));
    head.name.textContent = entryModel(header, v) || "Header";
    const at = typeof d?.hitch === "number" ? d.hitch : header.lowered ? 1 : 0;
    liftValue.textContent = at > 0.05 && at < 0.95 ? `${Math.round(100 * at)}%` : header.lowered ? "Lowered" : "Raised";
    liftBar.style.width = `${100 * at}%`;
    width.value.textContent = typeof d?.workWidth === "number" && d.workWidth > 0 ? lengthText(d.workWidth, units) : "–";
    limit.value.textContent = typeof d?.speedLimit === "number" && d.speedLimit > 0
      ? `${Math.round(speedValue(d.speedLimit, units))} ${speedUnit(units)}` : "none";
    wear.set(d?.wear);
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}
