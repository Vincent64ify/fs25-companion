// @ts-check
// The Vehicle screen (specs/0002-vehicle-screen.md; look in docs/THEMES.md,
// Vehicle screen): the Vehicle tab's default page, tuned for yard work with
// a loader.
// - vehicleBand: the job, speed, fuel and DEF as a range, wear and Engine
//   hot, over the rig strip: every vehicle in the rig as a tile in driving
//   order, joined by links that name the coupling. A tap on a tile selects
//   that tool in game and opens the Implement tab (a "showscreen" event
//   that bubbles up to main.js).
// - loadCard: what's on the loader and the session's tally (createTally);
//   without a loader, every tank in the rig.
// - targetCard: the vehicle nearby that takes what you carry (the mod picks
//   it) and how many more loads it takes.
// Data: the vehicles topic's controlled vehicle (carried and target since
// mod 0.8.5) and the cab's rig (joint).

import {
  LIMITS, cabOf, controlledVehicle, defPct, drivingOrder, entryModel, fillMax, fillName, fillPct, fillStop, fillsOf,
  fuelPct, gearName, implementById, implementsOf, kindLabel, lowersInRig, rigJob, vehicleKind,
} from "../data/selectors.js";
import { speedUnit, speedValue, unitsOf } from "../data/units.js";
import { ratesOf } from "../data/rates.js";
import { sendCommand } from "../connection.js";
import { screenRig, tileState } from "./implementScreen.js";
import { fillMeter, maxBadge } from "./implements.js";
import { fmt, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").RigEntry} RigEntry */
/** @typedef {import("../types.js").Vehicle} Vehicle */
/** @typedef {import("../data/selectors.js").Fill} Fill */
/** @typedef {import("../data/selectors.js").Implement} Implement */
/** @typedef {import("../data/units.js").Units} Units */
/** @typedef {(action: string, value?: number) => Promise<import("../commands.js").CommandResult>} Send */
/**
 * A pallet or bigbag on the forks or a hook (mod 0.8.5).
 * @typedef {{id?: number, name?: string, pallet?: boolean, bigBag?: boolean, fills?: Fill[]}} Carried
 */
/** @typedef {{name: string, fillType?: string, title: string, litres: number, tonnes?: number}} LoadLine */

// wear this high (%) turns orange: "repair soon"
const WEAR_WARN = 70;
// a bucket counts a load from over this full (%) to under the next
const LOAD_FULL_PCT = 50;
const LOAD_EMPTY_PCT = 5;
const FT_PER_M = 3.28084;

// a vehicle that is a loader, or a rig with a loader, by shop category
const LOADER_RE = /LOADER|TELEHANDLER|SKIDSTEER|FORKLIFT/;
// a loader's tool by type name: a bucket (shovel), forks and hooks
// (dynamic mounts), a bigbag lifter, a bale grab
const TOOL_TYPE_RE = /shovel|dynamicmount|fork|bigbag|balegrab/i;

const cat = (/** @type {{category?: string}|undefined} */ x) => (typeof x?.category === "string" ? x.category.toUpperCase() : "");

/** A loader's tool: a bucket, forks, a hook. @param {Implement} i */
export const isLoaderTool = (i) => TOOL_TYPE_RE.test(i.typeName || "") || (LOADER_RE.test(cat(i)) && /TOOL/.test(cat(i)));

/** The pallets and bigbags on the loader. @param {Vehicle|undefined} v @returns {Carried[]} */
export function carriedOf(v) {
  const list = /** @type {any} */ (v)?.carried;
  return Array.isArray(list) ? list.filter((c) => c && typeof c === "object") : [];
}

/**
 * Whether the page is about loading: the vehicle is a loader, or the rig
 * has a loader or a loader's tool, or something hangs on it.
 * @param {Vehicle|undefined} v
 */
export function hasLoader(v) {
  if (!v) return false;
  if (vehicleKind(v) === "loader" || carriedOf(v).length || /** @type {any} */ (v).target) return true;
  return implementsOf(v).some((i) => LOADER_RE.test(cat(i)) || isLoaderTool(i));
}

/** The loader's tool: the last one in the rig (a bucket on a loader). @param {Vehicle|undefined} v */
export const loaderTool = (v) => loaderTools(v).pop();

/**
 * The rig's loader tools; a carried bag or pallet hanging in the rig (on a
 * bigbag lifter) is the load, never a tool.
 * @param {Vehicle|undefined} v
 */
function loaderTools(v) {
  const carried = new Set(carriedOf(v).map((c) => c.id));
  return implementsOf(v).filter((i) => isLoaderTool(i) && !carried.has(i.id));
}

/** "Bucket", "Forks", else the shop's category. @param {Implement} tool */
export function toolKind(tool) {
  const type = tool.typeName || "";
  if (/shovel/i.test(type)) return "Bucket";
  if (/dynamicmount|fork/i.test(type)) return "Forks";
  return kindLabel(tool) || "Tool";
}

/** The first unit with something in it, else the first. @param {Fill[]} fills */
const loadedFill = (fills) => fills.find((f) => f.level > 0) || fills[0];

/**
 * What's on the loader, one line each: a pallet's or bigbag's content
 * ("Seeds pallet"), else what's in the bucket ("Potatoes"); none when empty.
 * @param {Vehicle|undefined} v
 * @returns {LoadLine[]}
 */
export function loadLines(v) {
  const carried = carriedOf(v);
  if (carried.length) {
    return carried.map((c) => {
      const fills = fillsOf(/** @type {any} */ (c));
      const fill = loadedFill(fills);
      const title = fill && fill.level > 0 ? fillName(fill) : c.name || "Load";
      const kind = c.bigBag ? "bigbag" : c.pallet ? "pallet" : "";
      const litres = fills.reduce((sum, f) => sum + (f.level || 0), 0);
      const masses = fills.filter((f) => f.level > 0).map((f) => /** @type {any} */ (f).massPerLiter);
      const tonnes = masses.length && masses.every((m) => typeof m === "number")
        ? fills.reduce((sum, f) => sum + (f.level > 0 ? f.level * /** @type {any} */ (f).massPerLiter : 0), 0) : undefined;
      return { name: kind ? `${title} ${kind}` : title, fillType: fill?.fillType, title, litres, tonnes };
    });
  }
  const tool = loaderTool(v);
  return fillsOf(/** @type {any} */ (tool)).filter((f) => f.level > 0).map((f) => {
    const mass = /** @type {any} */ (f).massPerLiter;
    return { name: fillName(f), fillType: f.fillType, title: fillName(f), litres: f.level,
      tonnes: typeof mass === "number" ? f.level * mass : undefined };
  });
}

/** "1,640 L · 1.1 t". @param {LoadLine} line */
const amountText = (line) => `${Math.round(line.litres).toLocaleString()} L` +
  (typeof line.tonnes === "number" ? ` · ${fmt(line.tonnes, 1)} t` : "");

/**
 * The job: an AI worker's, "Loading · Potatoes" while something is on the
 * loader, else the Implement tab's.
 * @param {Vehicle|undefined} v
 * @param {import("../types.js").Cab|undefined} cab
 * @returns {{text: string, icon: string}}
 */
export function vehicleJob(v, cab) {
  if (v && !v.isAI) {
    const line = loadLines(v)[0];
    if (line) return { text: `Loading · ${line.title}`, icon: "loader" };
  }
  return rigJob(v, cab);
}

/** Under the speed: the gear and the way it goes ("F2 · forward", "R1 · reverse"). @param {Vehicle|undefined} v */
export function gearLine(v) {
  const g = gearName(v);
  if (!g) return "";
  const way = /^R/.test(g) ? "reverse" : g === "N" ? "neutral" : "forward";
  return `${/^\d/.test(g) ? "F" + g : g} · ${way}`;
}

/**
 * Hours a tank lasts at this use, undefined while the use isn't known.
 * @param {number|undefined} level litres
 * @param {number|undefined} perHour litres an hour
 */
export function fuelRange(level, perHour) {
  return typeof level === "number" && typeof perHour === "number" && perHour > 0 ? level / perHour : undefined;
}

/** "≈ 5" h, "≈ 40" min. @param {number} hours */
function rangeText(hours) {
  return hours >= 1 ? { value: `≈ ${Math.round(hours)}`, unit: "h" }
    : { value: `≈ ${Math.max(1, Math.round(hours * 60))}`, unit: "min" };
}

/** @typedef {{id: string, label: string, value: string, unit: string, sub: string, alert: boolean}} Readout */

/**
 * The band's numbers: speed with the gear, fuel and DEF (with DEF only) as
 * a range with the % under it ("%" alone while the use isn't known), wear.
 * @param {Vehicle|undefined} v
 * @param {{fuel?: number, def?: number}} ranges hours
 * @param {Units} units
 * @returns {Readout[]}
 */
export function bandReadouts(v, ranges, units) {
  /** @returns {Readout} */
  const tank = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number|undefined} */ pct,
    /** @type {number|undefined} */ hours) => {
    if (pct === undefined) return { id, label, value: "–", unit: "", sub: "", alert: false };
    if (hours === undefined) return { id, label, value: String(Math.round(pct)), unit: "%", sub: "", alert: false };
    return { id, label, ...rangeText(hours), sub: `${Math.round(pct)}%`, alert: false };
  };
  const out = [
    { id: "speed", label: "Speed", value: typeof v?.speed === "number" ? fmt(speedValue(v.speed, units), 1) : "–",
      unit: speedUnit(units), sub: gearLine(v), alert: false },
    // an electric vehicle's "fuel" is its battery (in kWh)
    tank("fuel", v?.fuelType === "electriccharge" ? "Battery" : "Fuel", fuelPct(v), ranges.fuel),
  ];
  const def = defPct(v);
  if (def !== undefined) out.push(tank("def", "DEF", def, ranges.def));
  const wear = typeof v?.wear === "number" ? Math.round(100 * v.wear) : undefined;
  out.push(wear === undefined ? { id: "wear", label: "Wear", value: "–", unit: "%", sub: "", alert: false }
    : { id: "wear", label: "Wear", value: String(wear), unit: "%", sub: wear >= WEAR_WARN ? "repair soon" : "good",
      alert: wear >= WEAR_WARN });
  return out;
}

/**
 * Engine hot from 100 °C: the game has no warning level of its own (spec
 * 0002's spike; its fan comes on at 95 °C).
 * @param {Vehicle|undefined} v
 */
export function engineHot(v) {
  return typeof v?.motorTemp === "number" && v.motorTemp >= LIMITS.tempWarn;
}

// a coupling's name from its joint's type name (the game's 24, spec 0002);
// first match wins: a cutter trailer is towed, a bigbag hangs on a hook
const JOINTS = /** @type {[RegExp, string][]} */ ([
  [/attachablefrontloader/i, "Loader"], [/cuttertrailer/i, "Drawbar"], [/bigbag/i, "Hook"], [/cutter|header/i, "Header"],
  [/frontloader|wheelloader|telehandler|teleloader|skidsteer|fork/i, "Tool"],
  [/trailer|hooklift|drawbar/i, "Drawbar"], [/implement/i, "3-point"],
]);

/** The link's chip: the coupling, else "Front" or "Rear". @param {RigEntry} e */
export function jointLabel(e) {
  const joint = /** @type {any} */ (e).joint;
  const found = typeof joint === "string" ? JOINTS.find(([re]) => re.test(joint)) : undefined;
  return found ? found[1] : e.side === "front" ? "Front" : "Rear";
}

/**
 * Solid while the tool is lowered, dashed while it's raised; a tool that
 * doesn't lower (a trailer, a front loader and its tools), solid.
 * @param {RigEntry} e @param {Vehicle|undefined} v
 */
const linkSolid = (e, v) => !lowersInRig(e, v) || e.lowered === true;

/** The vehicles topic's side of an entry: its implement, or the vehicle. */
const detailOf = (/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) =>
  /** @type {Implement|undefined} */ (e.depth === 0 ? v : implementById(v, e.id));

/**
 * A tile's state line. The vehicle: what it does ("PTO on", "Engine on"),
 * then its hours; a loader's tool with a load: the load ("Potatoes · 82%");
 * a tool: the Implement tab's line ("Working · Lowered"), else its kind.
 * @param {RigEntry} e
 * @param {Vehicle|undefined} v
 */
export function stripState(e, v) {
  if (e.depth === 0) {
    const base = tileState(e, v);
    const hours = typeof v?.operatingHours === "number" ? `${Math.round(v.operatingHours).toLocaleString()} h` : "";
    return [base === "Engine on" && v?.pto === true ? "PTO on" : base, hours].filter(Boolean).join(" · ");
  }
  const d = detailOf(e, v);
  const load = d && isLoaderTool(d) ? fillsOf(/** @type {any} */ (d)).find((f) => f.level > 0) : undefined;
  if (load) return `${fillName(load)} · ${Math.round(fillPct(load))}%`;
  if (d && isLoaderTool(d)) return tileState(e, v) || toolKind(d);
  return tileState(e, v) || (d ? kindLabel(d) : "") || "";
}

/** Working: turned on, or discharging (the yellow badge). */
const working = (/** @type {RigEntry} */ e) => e.turnedOn === true || e.discharging === true;

/** The kind's icon: tools never count as tractors. */
function entryKind(/** @type {RigEntry} */ e, /** @type {Vehicle|undefined} */ v) {
  const d = detailOf(e, v);
  return e.depth === 0 ? vehicleKind(v) : vehicleKind({ ...d, motorized: false });
}

/**
 * One tile: badge, model, state line, a bar per fill unit. A tap selects
 * it in game (implement.select, unless it is selected already) and opens
 * the Implement tab.
 * @param {RigEntry} e
 * @param {Vehicle|undefined} v
 * @param {Send} send
 */
function stripTile(e, v, send) {
  const name = entryModel(e, v) || "Tool";
  const badge = h("span", { className: "rig-badge" }, icon(entryKind(e, v)));
  badge.dataset.on = String(working(e));
  const tile = h("li", { className: "rig-tile" }, badge,
    h("div", { className: "rig-text" }, h("b", { text: name }), h("span", { text: stripState(e, v) })));
  const fills = fillsOf(/** @type {any} */ (detailOf(e, v)));
  if (fills.length) {
    tile.append(h("div", { className: "rig-bars" }, ...fills.map((f) => {
      const meter = fillMeter(f);
      meter.title = `${fillName(f)} ${Math.round(fillPct(f))}%${fillMax(f) ? " · MAX" : ""}`;
      return meter;
    })));
  }
  tile.dataset.depth = String(e.depth);
  tile.dataset.selected = String(e.selected === true);
  if (typeof e.id !== "number" || !(e.selectable || e.selected)) return tile;
  const id = e.id;
  tile.dataset.pick = "true";
  tile.tabIndex = 0;
  tile.setAttribute("role", "button");
  tile.setAttribute("aria-label", `${name}: select in game and open Implement`);
  const pick = async () => {
    tile.dispatchEvent(new CustomEvent("showscreen", { bubbles: true, detail: "implement" }));
    if (e.selected || tile.dataset.pending === "true") return;
    tile.dataset.pending = "true";
    const result = await send("implement.select", id);
    if (!result.ok) delete tile.dataset.pending;
    else setTimeout(() => { delete tile.dataset.pending; }, 1500);
  };
  tile.addEventListener("click", pick);
  tile.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); }
  });
  return tile;
}

/** A link between two tiles: a line and the coupling's chip. @param {RigEntry} e the outer one @param {Vehicle|undefined} v */
function stripLink(e, v) {
  const link = h("li", { className: "rig-link" }, h("span", { text: jointLabel(e) }));
  link.dataset.lowered = String(linkSolid(e, v));
  link.setAttribute("aria-label", lowersInRig(e, v)
    ? `${jointLabel(e)} coupling, ${e.lowered ? "lowered" : "raised"}` : `${jointLabel(e)} coupling`);
  return link;
}

/**
 * The strip's tiles and links in driving order: rear tools, the vehicle,
 * front tools. A link belongs to the tile farther from the vehicle.
 * @param {RigEntry[]} order
 * @param {Vehicle|undefined} v
 * @param {Send} send
 */
function stripItems(order, v, send) {
  const at = order.findIndex((e) => e.depth === 0);
  /** @type {HTMLElement[]} */
  const items = [];
  order.forEach((e, i) => {
    items.push(stripTile(e, v, send));
    if (i < order.length - 1) items.push(stripLink(i < at ? e : order[i + 1], v));
  });
  return items;
}

/** The widgets' options: tests pass their own rates, send and tally. */
const ratesFrom = (/** @type {any} */ opts, /** @type {any} */ store) =>
  /** @type {{fuelPerHour: () => number|undefined, defPerHour: () => number|undefined}} */ (opts.rates || ratesOf(store));

/**
 * The band: the job and its four numbers over the rig strip, one readout
 * card.
 * @type {import("./widget.js").CreateWidget}
 */
export function vehicleBand(store, opts = {}) {
  /** @type {Send} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const rates = ratesFrom(opts, store);
  const job = h("h1", { className: "veh-job" });
  const hot = h("span", { className: "veh-hot" }, icon("engineTemp"), h("span", { text: "Engine hot" }));
  const ros = h("div", { className: "veh-ros" });
  const strip = h("ol", { className: "veh-strip" });
  strip.setAttribute("aria-label", "Rig");
  const none = h("p", { className: "veh-strip-none", text: "Nothing attached" });
  const root = h("section", { className: "veh-band" },
    h("div", { className: "veh-band-head" },
      h("div", { className: "veh-band-text" }, h("span", { className: "veh-cap", text: "Vehicle" }),
        h("div", { className: "veh-job-row" }, job, hot)),
      ros),
    h("div", { className: "veh-strip-row" }, strip, none));
  root.setAttribute("aria-label", "Vehicle");
  if (opts.id) root.id = opts.id;

  let lastRos = "";
  let lastStrip = "";
  const render = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    const units = unitsOf(store);
    job.textContent = vehicleJob(v, cab).text;
    hot.hidden = !engineHot(v);
    const readouts = bandReadouts(v, { fuel: fuelRange(v?.fuel, rates.fuelPerHour()),
      def: fuelRange(/** @type {any} */ (v)?.def, rates.defPerHour()) }, units);
    const roKey = JSON.stringify(readouts);
    if (roKey !== lastRos) {
      lastRos = roKey;
      ros.replaceChildren(...readouts.map((r) => {
        const el = h("div", { className: "veh-ro" }, h("span", { className: "veh-cap", text: r.label }),
          h("div", {}, h("b", { text: r.value }), h("span", { className: "veh-ro-unit", text: r.unit })),
          h("small", { text: r.sub }));
        el.dataset.ro = r.id;
        el.dataset.alert = String(r.alert);
        return el;
      }));
    }
    const order = v ? drivingOrder(screenRig(v, cab)) : [];
    const key = JSON.stringify(order.map((e) => [e, stripState(e, v), entryKind(e, v),
      fillsOf(/** @type {any} */ (detailOf(e, v))).map((f) => [Math.round(fillPct(f)), fillMax(f)])]));
    if (key !== lastStrip) {
      lastStrip = key;
      strip.replaceChildren(...stripItems(order, v, send));
    }
    none.hidden = !(v && order.length <= 1);
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}

/**
 * The session's tally of loads (since the page opened, across vehicles,
 * until reset): a bucket counts when it drops from over 50% to under 5% of
 * its capacity, with what it held at the top; a pallet or bigbag when it
 * leaves the forks or hook. Mass from litres × the fill type's mass per
 * litre. Getting out isn't setting down: tracking starts again.
 * @param {{get: (key: string) => any, subscribe: (key: string, fn: () => void) => any}} store
 */
export function createTally(store) {
  /** @type {Map<string, {title: string, loads: number, tonnes: number}>} by fill type */
  const types = new Map();
  let loads = 0;
  let tonnes = 0;
  /** @type {{fillType: string|undefined, litres: number}|undefined} */
  let last;
  /** @type {Map<string, {peak: number, fillType?: string, title: string, mass?: number}>} full buckets */
  let full = new Map();
  /** @type {Map<unknown, LoadLine>} what's on the forks */
  let held = new Map();
  /** @type {unknown} */
  let vehicleId;

  /** @param {string|undefined} fillType @param {string} title @param {number} litres @param {number} t */
  const count = (fillType, title, litres, t) => {
    loads++;
    tonnes += t;
    const key = fillType || title;
    const entry = types.get(key) || { title, loads: 0, tonnes: 0 };
    entry.loads++;
    entry.tonnes += t;
    types.set(key, entry);
    last = { fillType, litres };
  };

  store.subscribe("vehicles", () => {
    const v = controlledVehicle(store);
    if (v?.id !== vehicleId) {
      vehicleId = v?.id;
      full = new Map();
      held = new Map();
    }
    if (!v) return;
    const seen = new Set();
    for (const tool of loaderTools(v)) {
      fillsOf(/** @type {any} */ (tool)).forEach((f, i) => {
        const key = `${tool.id}:${f.unit ?? i}`;
        seen.add(key);
        const pct = fillPct(f);
        const was = full.get(key);
        if (pct > LOAD_FULL_PCT) {
          const mass = /** @type {any} */ (f).massPerLiter;
          full.set(key, { peak: Math.max(was?.peak ?? 0, f.level), fillType: f.fillType, title: fillName(f),
            mass: typeof mass === "number" ? mass : was?.mass });
        } else if (was && pct < LOAD_EMPTY_PCT) {
          full.delete(key);
          count(was.fillType, was.title, was.peak, was.mass ? was.peak * was.mass : 0);
        }
      });
    }
    for (const key of [...full.keys()]) if (!seen.has(key)) full.delete(key);
    const now = new Map();
    const carried = carriedOf(v);
    const lines = carried.length ? loadLines(v) : [];
    // what each held at the most: a bag emptied into a seeder, then set
    // down, counts what it brought
    carried.forEach((c, i) => {
      const was = held.get(c.id ?? i);
      now.set(c.id ?? i, was && (!lines[i] || was.litres >= lines[i].litres) ? was : lines[i]);
    });
    for (const [id, line] of held) {
      if (!now.has(id) && line) count(line.fillType, line.title, line.litres, line.tonnes ?? 0);
    }
    held = now;
  });

  return {
    /** @returns {{loads: number, tonnes: number, byType: {title: string, loads: number, tonnes: number}[]}} */
    get: () => ({ loads, tonnes, byType: [...types.values()].map((t) => ({ ...t })) }),
    /** The last load counted: what "≈ n more loads" goes by while the loader is empty. */
    lastLoad: () => last,
    reset() {
      loads = 0;
      tonnes = 0;
      types.clear();
      last = undefined;
    },
  };
}

/** @type {WeakMap<object, ReturnType<typeof createTally>>} */
const tallies = new WeakMap();

/** The store's tally, made on first use. @param {Parameters<typeof createTally>[0]} store */
export function tallyOf(store) {
  let tally = tallies.get(store);
  if (!tally) {
    tally = createTally(store);
    tallies.set(store, tally);
  }
  return tally;
}

const tallyFrom = (/** @type {any} */ opts, /** @type {any} */ store) =>
  /** @type {ReturnType<typeof createTally>} */ (opts.tally || tallyOf(store));

/** "14 loads", "1 load". @param {number} n */
const loadsText = (n) => `${n} ${n === 1 ? "load" : "loads"}`;

/** A card's head: its label and what's on its right. */
function cardHead(/** @type {string} */ cls) {
  const label = h("span", { className: "veh-card-label" });
  const el = h("div", { className: `veh-card-head ${cls}` }, label);
  return { el, label };
}

/**
 * The Load card: on the loader, what's on it (big), the tool, and the
 * session's tally with Reset; without a loader, Loads: every tank in the
 * rig and the rig's weight.
 * @type {import("./widget.js").CreateWidget}
 */
export function loadCard(store, opts = {}) {
  const tally = tallyFrom(opts, store);
  const head = cardHead("veh-load-headrow");
  const tool = h("span", { className: "veh-load-tool" });
  const mass = h("span", { className: "veh-rig-mass" });
  head.el.append(tool, mass);
  const lines = h("div", { className: "veh-load-lines" });
  const total = h("b", { className: "veh-tally-total" });
  const reset = /** @type {HTMLButtonElement} */ (h("button", { className: "control veh-reset" },
    h("span", { className: "control-label", text: "Reset" })));
  reset.type = "button";
  reset.setAttribute("aria-label", "Reset this session's loads");
  const types = h("ul", { className: "veh-tally-types" });
  const tallyEl = h("div", { className: "veh-tally" },
    h("div", { className: "veh-tally-head" },
      h("div", {}, h("span", { className: "veh-cap", text: "This session" }), total), reset),
    types);
  const root = h("section", { className: "veh-card veh-load" }, head.el, lines, tallyEl);
  root.setAttribute("aria-label", "Load");
  if (opts.id) root.id = opts.id;

  let lastKey = "";
  const render = () => {
    const v = controlledVehicle(store);
    const loader = hasLoader(v);
    head.label.textContent = loader ? "On the loader" : "Loads";
    root.dataset.mode = loader ? "loader" : "loads";
    tallyEl.hidden = !loader;
    const t = loaderTool(v);
    tool.textContent = loader && t ? `${entryModel(/** @type {any} */ ({ ...t, depth: t.depth || 1 }), v)} · ${toolKind(t)}` : "";
    tool.hidden = !tool.textContent;
    const kg = /** @type {any} */ (v)?.mass;
    mass.textContent = !loader && typeof kg === "number" ? `Rig ${fmt(kg, 1)} t` : "";
    mass.hidden = !mass.textContent;
    const tl = tally.get();
    total.textContent = tl.loads ? `${loadsText(tl.loads)} · ${fmt(tl.tonnes, 1)} t` : loadsText(0);

    const key = JSON.stringify([loader, t?.id, loader ? loadLines(v) : rigFills(v).map(({ fill }) => fill), tl]);
    if (key === lastKey) return;
    lastKey = key;
    types.replaceChildren(...tl.byType.map((x) =>
      h("li", { className: "veh-tally-type", text: `${x.title} · ${loadsText(x.loads)} · ${fmt(x.tonnes, 1)} t` })));
    if (loader) {
      const list = loadLines(v);
      // forks or a hook with nothing the game mounted: a bag hung on bare
      // tines by its straps isn't recorded anywhere (spec 0002's spike)
      const none = t && /dynamicmount|fork/i.test(t.typeName || "") ? "Nothing mounted" : "Empty";
      lines.replaceChildren(...(list.length ? list : [undefined]).map((line) =>
        h("div", { className: "veh-load-line" + (line ? "" : " veh-load-empty") },
          h("b", { text: line ? line.name : none }), h("span", { text: line ? amountText(line) : "" }))));
      const fill = loadedFill(fillsOf(/** @type {any} */ (t)));
      if (fill && !carriedOf(v).length) lines.append(h("div", { className: "veh-load-meter" }, fillMeter(fill)));
    } else {
      const tanks = rigFills(v);
      lines.replaceChildren(...(tanks.length ? tanks.map(({ fill }) => {
        const meter = fillMeter(fill);
        const line = h("div", { className: "veh-load-line veh-load-tank" },
          h("b", { text: `${fillName(fill)} · ${Math.round(fillPct(fill))}%` }),
          h("span", { text: `${Math.round(fill.level).toLocaleString()} / ${Math.round(fill.capacity).toLocaleString()} L` }),
          meter);
        if (fillMax(fill)) line.append(maxBadge());
        return line;
      }) : [h("p", { className: "veh-load-none", text: v ? "No tanks in the rig" : "Get in a vehicle to see it here" })]));
    }
  };
  reset.addEventListener("click", () => {
    tally.reset();
    render();
  });
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  return root;
}

/** Every fill unit in the rig, the vehicle's first. @param {Vehicle|undefined} v */
function rigFills(v) {
  /** @type {{owner: unknown, fill: Fill}[]} */
  const out = [];
  for (const owner of [v, ...implementsOf(v)]) {
    for (const fill of fillsOf(/** @type {any} */ (owner))) out.push({ owner, fill });
  }
  return out;
}

/** "6 m", "20 ft". @param {unknown} m @param {Units} units */
function distanceText(m, units) {
  if (typeof m !== "number") return "";
  return units.miles ? `${Math.round(m * FT_PER_M)} ft` : `${Math.round(m)} m`;
}

/**
 * What the Target card shows: the vehicle nearby that takes the load (the
 * mod picks it), its unit's level and how many more loads it takes: free
 * space (the game's, else to where it stops; less under the weight limit)
 * ÷ the load, rounded up; Full at capacity or the weight limit.
 * @param {Vehicle|undefined} v
 * @param {number|undefined} perLoad litres a load: what you carry now, else the last load
 * @param {Units} units
 */
export function targetView(v, perLoad, units) {
  const t = /** @type {any} */ (v)?.target;
  if (!t || typeof t !== "object") return { state: "none" };
  const category = (typeof t.categoryTitle === "string" && t.categoryTitle) || kindLabel(t);
  const dist = distanceText(t.distance, units);
  const view = {
    state: t.stale ? "stale" : "live",
    name: typeof t.name === "string" && t.name ? t.name : "Vehicle",
    sub: [category, t.stale ? `out of range · ${dist}` : dist].filter(Boolean).join(" · "),
    kind: vehicleKind({ ...t, motorized: false }),
    /** @type {string|undefined} */ fill: undefined,
    /** @type {number|undefined} */ pct: undefined,
    /** @type {string|undefined} */ litres: undefined,
    /** @type {string|undefined} */ more: undefined,
    full: false,
    /** @type {string|undefined} */ weight: undefined,
    /** @type {number|undefined} */ weightPct: undefined,
    /** @type {Fill|undefined} */ meter: undefined,
  };
  const ml = t.massLimit && typeof t.massLimit.max === "number" && typeof t.massLimit.mass === "number" ? t.massLimit : undefined;
  if (ml) {
    view.weight = `${fmt(ml.mass, 1)} / ${fmt(ml.max, 1)} t`;
    view.weightPct = ml.max > 0 ? Math.min(100, (100 * ml.mass) / ml.max) : undefined;
  }
  const fill = /** @type {Fill|undefined} */ (Array.isArray(t.fills) ? t.fills.find((f) => f && f.capacity > 0) : undefined);
  if (!fill) return view;
  const stop = fillStop(fill);
  const given = /** @type {any} */ (fill).free;
  let free = typeof given === "number" ? given : stop - fill.level;
  const mass = /** @type {any} */ (fill).massPerLiter;
  if (ml && typeof mass === "number" && mass > 0) free = Math.min(free, Math.max(0, (ml.max - ml.mass) / mass));
  view.meter = fill;
  view.pct = fillPct(fill);
  view.fill = `${fillName(fill)} · ${Math.round(fillPct(fill))}%`;
  view.litres = `${Math.round(fill.level).toLocaleString()} / ${Math.round(fill.capacity).toLocaleString()} L`;
  view.full = fillMax(fill) || ml?.reached === true || fill.level >= stop - 0.5 || free <= 0;
  if (view.full) view.more = "Full";
  else if (typeof perLoad === "number" && perLoad > 0) {
    const n = Math.ceil(free / perLoad);
    view.more = `≈ ${n} more ${n === 1 ? "load" : "loads"}`;
  }
  return view;
}

/**
 * The Target card, with a loader only: the vehicle nearby you're filling,
 * dimmed out of range; "Come near something to fill" before the first.
 * @type {import("./widget.js").CreateWidget}
 */
export function targetCard(store, opts = {}) {
  const tally = tallyFrom(opts, store);
  const head = cardHead("veh-target-headrow");
  head.label.textContent = "Target";
  const fullChip = h("span", { className: "veh-target-full", text: "Full" });
  head.el.append(fullChip);
  const badge = h("span", { className: "readout-badge veh-target-badge" });
  const name = h("b", { className: "veh-target-name" });
  const sub = h("span", { className: "veh-target-sub" });
  const more = h("b", { className: "veh-target-more" });
  const fillText = h("b");
  const litres = h("span");
  let meter = h("span", { className: "widget-meter fill-meter" });
  const meterSlot = h("div", { className: "veh-target-meter" }, meter);
  const weightText = h("span");
  const weightBar = h("span");
  const weight = h("div", { className: "veh-target-weight" },
    h("div", { className: "veh-target-row" }, h("b", { text: "Weight" }), weightText),
    h("span", { className: "widget-meter" }, weightBar));
  const fillEl = h("div", { className: "veh-target-fill" }, h("div", { className: "veh-target-row" }, fillText, litres), meterSlot);
  const body = h("div", { className: "veh-target-body" },
    h("div", { className: "veh-target-who" }, badge, h("div", { className: "veh-target-text" }, name, sub)),
    more, fillEl, weight);
  const none = h("p", { className: "veh-target-none", text: "Come near something to fill" });
  const root = h("section", { className: "veh-card veh-target" }, head.el, body, none);
  root.setAttribute("aria-label", "Target");
  if (opts.id) root.id = opts.id;

  let lastKind = "";
  let lastMeter = "";
  const render = () => {
    const v = controlledVehicle(store);
    root.hidden = !hasLoader(v);
    if (root.hidden) return;
    const carried = loadLines(v).reduce((sum, l) => sum + l.litres, 0);
    const view = targetView(v, carried > 0 ? carried : tally.lastLoad()?.litres, unitsOf(store));
    root.dataset.state = view.state;
    body.hidden = view.state === "none";
    none.hidden = view.state !== "none";
    fullChip.hidden = !view.full;
    if (view.state === "none") return;
    if (view.kind !== lastKind) badge.replaceChildren(icon((lastKind = view.kind || "trailer")));
    name.textContent = view.name || "";
    sub.textContent = view.sub || "";
    more.textContent = view.more || "";
    more.hidden = !view.more || view.full;
    fillEl.hidden = !view.meter;
    if (view.meter) {
      fillText.textContent = view.fill || "";
      litres.textContent = view.litres || "";
      const key = JSON.stringify(view.meter);
      if (key !== lastMeter) {
        lastMeter = key;
        const fresh = fillMeter(view.meter);
        meter.replaceWith(fresh);
        meter = fresh;
      }
    }
    weight.hidden = !view.weight;
    weightText.textContent = view.weight || "";
    weightBar.style.width = `${view.weightPct ?? 0}%`;
  };
  store.subscribe("vehicles", render);
  store.subscribe("cab", render);
  store.subscribe("env", render);
  return root;
}
