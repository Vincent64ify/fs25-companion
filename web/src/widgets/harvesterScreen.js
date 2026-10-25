// @ts-check
// The Harvester screen (docs/THEMES.md, Harvester screen): the Vehicle tab's
// other page, for a combine. The rig band comes from the Implement screen;
// under it the work card (header, thresher, pipe, straw, speed against the
// header's limit), the grain tank with its estimate and Precision Farming's
// yield, and the details (both wears, width, area, folding).
// Data: the vehicles topic's combine (fills, crop, hectares, yield, wear)
// and its header (wear, workWidth), and the cab's rig (pipe, straw,
// turnedOn, lowered, fold).

import {
  cabOf, controlledVehicle, entryModel, fillMax, fillName, fillPct, implementById, rigJob, rigOf, vehicleKind,
} from "../data/selectors.js";
import { areaText, lengthText, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { ratesOf } from "../data/rates.js";
import { rigTanks, tankRows } from "./implementScreen.js";
import { fillMeter, maxBadge } from "./implements.js";
import { fmt, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").RigEntry} RigEntry */
/** @typedef {import("../types.js").Vehicle} Vehicle */

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

/** A state tile on the work card: a caption, a ring or a track, a big value. */
function stateTile(/** @type {string} */ caption, /** @type {string} */ iconName) {
  const ring = h("span", { className: "harv-ring" }, icon(iconName));
  const value = h("b", { className: "harv-state-value" });
  const sub = h("span", { className: "harv-state-sub" });
  const el = h("div", { className: "harv-state" }, h("span", { className: "harv-cap", text: caption }), ring, value, sub);
  return {
    el,
    /** @param {{value: string, on?: boolean, sub?: string, hidden?: boolean}} s */
    set(s) {
      el.hidden = s.hidden === true;
      value.textContent = s.value;
      sub.textContent = s.sub || "";
      ring.dataset.on = String(s.on === true);
    },
  };
}

/**
 * The work card: the job and the rig, then Header (where the cutter is),
 * Thresher, Pipe, Straw and Speed against the header's working limit.
 * @type {import("./widget.js").CreateWidget}
 */
export function harvestWork(store, opts = {}) {
  const job = h("h2", {});
  const rigLine = h("p", {});
  const pill = h("span", { className: "harv-pill" }, h("i"), h("span", { text: "Working" }));
  const liftBar = h("span");
  const liftValue = h("b", { className: "harv-state-value" });
  const liftSub = h("span", { className: "harv-state-sub" });
  const lift = h("div", { className: "harv-state harv-lift" }, h("span", { className: "harv-cap", text: "Header" }),
    h("div", { className: "harv-lift-body" }, h("span", { className: "harv-track" }, liftBar),
      h("div", {}, liftValue, liftSub)));
  const thresher = stateTile("Thresher", "implementOn");
  const pipe = stateTile("Pipe", "pipe");
  const straw = stateTile("Straw", "straw");
  const speedValueEl = h("b");
  const speedUnitEl = h("span");
  const speedBar = h("span");
  const speedMark = h("em");
  const speedLimit = h("span");
  const speed = h("div", { className: "harv-state harv-speed" }, h("span", { className: "harv-cap", text: "Speed" }),
    h("div", { className: "harv-speed-value" }, speedValueEl, speedUnitEl),
    h("span", { className: "harv-speed-track" }, speedBar, speedMark),
    h("div", { className: "harv-speed-scale" }, h("span", { text: "0" }), speedLimit));
  const root = h("section", { className: "harv-work" },
    h("div", { className: "harv-work-head" }, h("span", { className: "readout-badge" }, icon("harvester")),
      h("div", { className: "harv-work-title" }, job, rigLine), pill),
    h("div", { className: "harv-states" }, lift, thresher.el, pipe.el, straw.el, speed));
  root.setAttribute("aria-label", "Work");
  if (opts.id) root.id = opts.id;

  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const units = unitsOf(store);
    const { head, header } = harvestRig(cab);
    job.textContent = isHarvester(v) ? rigJob(v, cab).text : "Get in a combine to see it here";
    const headerName = header ? entryModel(header, v) : undefined;
    rigLine.textContent = [v ? entryModel(/** @type {any} */ (head || { name: v.name, depth: 0 }), v) : "",
      headerName ? `with ${headerName}` : "no header"].filter(Boolean).join(" ");
    pill.hidden = !(head?.turnedOn || head?.discharging);
    /** @type {HTMLElement} */ (pill.lastElementChild).textContent = head?.discharging ? "Unloading" : "Working";

    const at = header ? (typeof implementById(v, header.id)?.hitch === "number"
      ? /** @type {number} */ (implementById(v, header.id)?.hitch) : header.lowered ? 1 : 0) : 0;
    liftBar.style.height = `${100 * at}%`;
    liftValue.textContent = !header ? "–" : at > 0.05 && at < 0.95 ? `${Math.round(100 * at)}%` : header.lowered ? "Down" : "Up";
    liftSub.textContent = !header ? "No header" : header.lowered ? "Lowered" : "Raised";
    thresher.set(head?.canTurnOn ? { value: head.turnedOn ? "On" : "Off", on: head.turnedOn === true } : { value: "–" });
    pipe.set(head?.pipe ? { value: head.pipe.moving ? "Moving" : head.pipe.out ? "Out" : "In", on: head.pipe.out === true,
      sub: head.discharging ? "Unloading" : "" } : { value: "–" });
    straw.set(head?.straw ? { value: head.straw.swath ? "Swath" : "Chopped", on: head.straw.swath, sub: "" }
      : { value: "–", hidden: true });

    const kmh = typeof v?.speed === "number" ? v.speed : undefined;
    const limit = typeof v?.speedLimit === "number" && v.speedLimit > 0 ? v.speedLimit
      : header ? /** @type {any} */ (implementById(v, header.id))?.speedLimit : undefined;
    speedValueEl.textContent = kmh === undefined ? "–" : fmt(speedValue(kmh, units), 1);
    speedUnitEl.textContent = speedUnit(units);
    const top = typeof limit === "number" && limit > 0 ? limit : undefined;
    speedBar.style.width = `${top && kmh !== undefined ? Math.min(100, (100 * kmh) / top) : 0}%`;
    speed.dataset.level = top && kmh !== undefined && kmh > top + 0.5 ? "warn" : "";
    speedMark.hidden = !top;
    speedLimit.textContent = top ? `Limit ${Math.round(speedValue(top, units))} ${speedUnit(units)}` : "No limit";
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * Precision Farming's yield and the area: t/ha, its % against the field's
 * potential, this run and in total. Yield only with Precision Farming.
 * @param {Vehicle|undefined} v
 * @param {import("../data/units.js").Units} units
 */
export function harvestStats(v, units) {
  const y = /** @type {any} */ (v)?.yield;
  const ha = /** @type {any} */ (v)?.hectares;
  const out = [];
  if (y && typeof y.tPerHa === "number") {
    out.push({ id: "yield", label: "Yield", value: fmt(y.tPerHa, 1), unit: "t/ha" });
    if (typeof y.pct === "number") out.push({ id: "pct", label: "Of potential", value: String(Math.round(y.pct)), unit: "%" });
  }
  const area = (/** @type {unknown} */ x) => (typeof x === "number" ? areaText(x, units).split(" ") : ["–", ""]);
  const [run, runUnit] = area(ha?.run);
  const [total, totalUnit] = area(ha?.total);
  out.push({ id: "run", label: "This run", value: run, unit: runUnit });
  out.push({ id: "total", label: "Total", value: total, unit: totalUnit });
  return out;
}

/**
 * The grain tank: its level, MAX at the weight limit, the time to full and
 * Call a trailer, how fast it fills, then the yield and area.
 * @type {import("./widget.js").CreateWidget}
 */
export function grainTank(store, opts = {}) {
  const rates = ratesOf(store);
  const tank = h("div", { className: "harv-tank" });
  const rate = h("p", { className: "harv-rate" });
  const stats = h("div", { className: "harv-stats" });
  const root = h("section", { className: "harv-grain" }, h("h2", { text: "Grain tank" }), tank, rate, stats);
  root.setAttribute("aria-label", "Grain tank");
  if (opts.id) root.id = opts.id;

  let last = "";
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const units = unitsOf(store);
    const { head } = harvestRig(cab);
    const own = head ? rigTanks([head], v, rates) : [];
    const row = tankRows(own)[0];
    const perMin = own[0] && v ? rates.rate(v.id, own[0].fill, 0) : undefined;
    const st = harvestStats(v, units);
    const key = JSON.stringify([row, perMin && Math.round(perMin / 20), st]);
    if (key === last) return;
    last = key;
    if (!row) {
      tank.replaceChildren(h("p", { className: "harv-empty", text: "No grain tank" }));
    } else {
      const meter = fillMeter(row.fill);
      meter.classList.add("tank-meter");
      tank.replaceChildren(
        h("div", { className: "harv-tank-head" }, h("span", { className: "readout-badge" }, icon("fill")),
          h("span", { className: "tank-name", text: row.fill.fillType ? fillName(row.fill) : "Empty" }),
          ...row.chips.map((c) => h("span", { className: "tank-chip", text: c })),
          ...(fillMax(row.fill) ? [maxBadge()] : []),
          h("b", { className: "harv-tank-pct", text: `${Math.round(fillPct(row.fill))}` }), h("span", { text: "%" })),
        meter,
        h("div", { className: "tank-foot" }, h("span", { text: row.litres }), h("span", { text: row.when })));
      tank.dataset.alert = String(row.chips.length > 0);
    }
    rate.hidden = !(perMin && perMin > 0);
    rate.replaceChildren(icon("clock"),
      h("span", { text: `Filling at about ${Math.round(perMin || 0).toLocaleString()} L per minute` }),
      h("b", { text: "last 60 s" }));
    stats.replaceChildren(...st.map((s) => {
      const el = h("div", { className: "harv-stat" }, h("span", { className: "harv-cap", text: s.label }),
        h("div", {}, h("b", { text: s.value }), h("span", { text: s.unit })));
      el.dataset.stat = s.id;
      return el;
    }));
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * The details: header and combine wear, working width, area this run,
 * folding (the combine's, else the header's), Show on map.
 * @type {import("./widget.js").CreateWidget}
 */
export function harvestDetails(store, opts = {}) {
  /** @param {string} iconName @param {string} label */
  const row = (iconName, label) => {
    const value = h("dd");
    const bar = h("span");
    const meter = h("span", { className: "widget-meter" }, bar);
    const el = h("div", {}, h("dt", {}, icon(iconName), h("span", { text: label })), value, meter);
    return { el, value, meter, bar };
  };
  const headerWear = row("wear", "Header wear");
  const combineWear = row("wear", "Combine wear");
  const width = row("workWidth", "Working width");
  const area = row("area", "Done this run");
  const fold = row("fold", "Folding");
  const show = h("button", { className: "show-on-map impl-show" }, icon("map"), h("span", { text: "Show on map" }));
  show.setAttribute("type", "button");
  show.addEventListener("click", () => show.dispatchEvent(new CustomEvent("showonmap", { bubbles: true })));
  const root = h("div", { className: "impl-details" }, h("h2", { text: "Details" }),
    h("dl", {}, headerWear.el, combineWear.el, width.el, area.el, fold.el), show);
  if (opts.id) root.id = opts.id;

  /** @param {ReturnType<typeof row>} r @param {unknown} w */
  const setWear = (r, w) => {
    r.value.textContent = typeof w === "number" ? `${Math.round(100 * w)}%` : "–";
    r.meter.hidden = typeof w !== "number";
    r.bar.style.width = `${100 * (typeof w === "number" ? w : 0)}%`;
  };
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const units = unitsOf(store);
    const { head, header } = harvestRig(cab);
    const hd = header ? implementById(v, header.id) : undefined;
    setWear(headerWear, hd?.wear);
    setWear(combineWear, /** @type {any} */ (v)?.wear);
    const w = /** @type {any} */ (hd)?.workWidth;
    width.value.textContent = typeof w === "number" && w > 0 ? lengthText(w, units) : "–";
    width.meter.hidden = true;
    const run = /** @type {any} */ (v)?.hectares?.run;
    area.value.textContent = typeof run === "number" ? areaText(run, units) : "–";
    area.meter.hidden = true;
    const f = head?.foldable ? head : header?.foldable ? header : undefined;
    fold.value.textContent = !f ? "–" : f.foldMoving ? "Folding…" : f.unfolded === false ? "Folded" : "Unfolded";
    fold.meter.hidden = true;
    show.hidden = !v;
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}
