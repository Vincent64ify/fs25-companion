// @ts-check
// Contracts (specs/0018-contracts.md): every number the Contracts page
// decides with, worked out here from the raw facts the mod sends (the
// contracts topic), so it's tested without the game and can change without
// a mod update. A number the game doesn't give stays undefined: never 0.
//
// The one home of the two tables the estimate rests on: which shop
// categories fit a contract type, and the overhead factor per job.

import { cabOf, controlledVehicle, rigOf } from "./selectors.js";

/** @typedef {import("../types.js").Contract} Contract */
/** @typedef {import("../types.js").ContractTool} ContractTool */
/** @typedef {import("../types.js").ContractVehicle} ContractVehicle */
/** @typedef {{field?: number, harvest?: number, bale?: number}} Factors */
/** @typedef {"lease"|"own"} Mode */
/** @typedef {"hour"|"net"|"left"|"km"} SortKey */

const num = (/** @type {unknown} */ v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * The jobs a work time is estimated for. `match`: what the game's type
 * name holds ("plowMission"); `categories`: the shop categories of the
 * tools that do it (names after FS25_BetterContracts' userint.lua,
 * unverified: a wrong one only means that tool isn't offered); `overhead`:
 * how much longer real work takes than width × speed (turns, overlaps,
 * refills, unloading), starting from BetterContracts' table. The live
 * check compares each with a real run.
 * @type {{kind: string, match: string[], categories: string[], overhead: number}[]}
 */
export const JOBS = [
  { kind: "harvest", match: ["harvest"], categories: ["CUTTERS", "CORNHEADERS"], overhead: 1.3 },
  { kind: "plow", match: ["plow", "plough"], categories: ["PLOWS"], overhead: 1.25 },
  { kind: "cultivate", match: ["cultivat"], categories: ["CULTIVATORS", "DISCHARROWS", "POWERHARROWS"], overhead: 1.2 },
  { kind: "sow", match: ["sow"], categories: ["SEEDERS", "PLANTERS"], overhead: 1.2 },
  { kind: "herbicide", match: ["herbicid", "spray"], categories: ["SPRAYERS"], overhead: 1.15 },
  { kind: "fertilize", match: ["fertiliz", "fertilis", "lime"], categories: ["FERTILIZERSPREADERS"], overhead: 1.15 },
  { kind: "weed", match: ["weed", "hoe"], categories: ["WEEDERS"], overhead: 1.2 },
  { kind: "mow", match: ["mow"], categories: ["MOWERS"], overhead: 1.3 },
];

/**
 * The job a contract type is, or undefined for one no time is estimated for.
 * @param {string|undefined} type the game's type name
 */
export function jobOf(type) {
  if (typeof type !== "string") return undefined;
  const name = type.toLowerCase();
  return JOBS.find((job) => job.match.some((m) => name.includes(m)));
}

/** Whether a contract has lease vehicles to take. @param {Contract} c */
export const hasLease = (c) => Array.isArray(c.vehicles) && c.vehicles.length > 0;

/**
 * Whether the numbers count the lease: for one of yours, whether you took
 * it; for an offer, the switch (and that there is one).
 * @param {Contract} c @param {Mode} mode
 */
export const withLease = (c, mode) => (c.mine ? c.leased === true : mode === "lease" && hasLease(c));

/**
 * Reward minus the lease, if leased.
 * @param {Contract} c @param {boolean} leased
 * @returns {number|undefined}
 */
export function net(c, leased) {
  const reward = num(c.reward);
  if (reward === undefined) return undefined;
  return reward - (leased ? num(c.vehicleCosts) ?? 0 : 0);
}

/**
 * The share of a contract that counts as done, read from the game: of the
 * expected litres for a harvest or baling contract, of the field for
 * field work.
 * @param {Contract} c @param {Factors|undefined} factors
 * @returns {number|undefined}
 */
export function successFactor(c, factors) {
  const type = (c.type || "").toLowerCase();
  if (type.includes("harvest")) return num(factors?.harvest);
  if (type.includes("bale")) return num(factors?.bale);
  return c.fieldId !== undefined ? num(factors?.field) : undefined;
}

/** Whether a contract is done by delivering litres. @param {Contract} c */
export const delivers = (c) => num(c.expectedLiters) !== undefined;

/** The litres the game asks for: the expected ones × the factor. @param {Contract} c @param {Factors} [factors] */
export function neededLiters(c, factors) {
  const expected = num(c.expectedLiters), factor = successFactor(c, factors);
  return expected === undefined || factor === undefined ? undefined : expected * factor;
}

/** The litres you keep: the expected ones the game doesn't ask for. @param {Contract} c @param {Factors} [factors] */
export function extraLiters(c, factors) {
  const expected = num(c.expectedLiters), factor = successFactor(c, factors);
  return expected === undefined || factor === undefined ? undefined : expected * (1 - factor);
}

/** What they're worth at the contract's sell point. @param {Contract} c @param {Factors} [factors] */
export function extraValue(c, factors) {
  const litres = extraLiters(c, factors), price = num(c.sellPoint?.price);
  return litres === undefined || price === undefined ? undefined : litres * price;
}

/** Litres still to deliver. @param {Contract} c @param {Factors} [factors] */
export function deliveredToGo(c, factors) {
  const needed = neededLiters(c, factors), deposited = num(c.depositedLiters);
  return needed === undefined || deposited === undefined ? undefined : Math.max(0, needed - deposited);
}

/** The share of the field worked: the game's completion × its factor. @param {Contract} c @param {Factors} [factors] */
export function fieldWorked(c, factors) {
  const completion = num(c.completion), factor = successFactor(c, factors);
  return completion === undefined || factor === undefined || delivers(c) ? undefined : completion * factor;
}

/**
 * Your tools that fit a contract: those of the job's shop categories, the
 * ones attached now first, then the widest.
 * @param {Contract} c @param {ContractTool[]|undefined} tools @param {Set<number|string>} [attached]
 * @returns {ContractTool[]}
 */
export function fittingTools(c, tools, attached = new Set()) {
  const job = jobOf(c.type);
  if (!job || !Array.isArray(tools)) return [];
  return tools.filter((t) => t && typeof t.category === "string" && job.categories.includes(t.category.toUpperCase()))
    .sort((a, b) => Number(attached.has(b.id)) - Number(attached.has(a.id))
      || (num(b.workingWidth) ?? 0) - (num(a.workingWidth) ?? 0));
}

/**
 * The leased tool the time is worked out with: the one of the job's
 * categories, else any with a working width; the widest.
 * @param {Contract} c
 * @returns {ContractVehicle|undefined}
 */
export function leaseTool(c) {
  const withWidth = (c.vehicles || []).filter((v) => num(v?.workingWidth) !== undefined);
  const job = jobOf(c.type);
  const fits = withWidth.filter((v) => job && typeof v.category === "string" && job.categories.includes(v.category.toUpperCase()));
  return (fits.length ? fits : withWidth).sort((a, b) => /** @type {number} */ (b.workingWidth) - /** @type {number} */ (a.workingWidth))[0];
}

/**
 * Hectares an hour: width × speed ÷ 10, the speed being the tool's own
 * limit, or the tractor's cruise top when lower.
 * @param {{workingWidth?: number, speedLimit?: number}|undefined} tool @param {number} [maxSpeed]
 */
export function workRate(tool, maxSpeed) {
  const width = num(tool?.workingWidth), limit = num(tool?.speedLimit), top = num(maxSpeed);
  const speed = limit !== undefined && top !== undefined && top > 0 ? Math.min(limit, top) : limit;
  return width === undefined || speed === undefined || !(width > 0) || !(speed > 0) ? undefined : (width * speed) / 10;
}

/**
 * The estimated work time in hours: area ÷ rate × the job's overhead.
 * @param {number|undefined} areaHa @param {{workingWidth?: number, speedLimit?: number}|undefined} tool
 * @param {string|undefined} type @param {number} [maxSpeed]
 * @returns {number|undefined}
 */
export function workHours(areaHa, tool, type, maxSpeed) {
  const area = num(areaHa), rate = workRate(tool, maxSpeed), job = jobOf(type);
  return area === undefined || rate === undefined || !job || !(area > 0) ? undefined : (area / rate) * job.overhead;
}

/** Money per hour of work. @param {number|undefined} amount @param {number|undefined} hours */
export function perHour(amount, hours) {
  const a = num(amount), h = num(hours);
  return a === undefined || h === undefined || !(h > 0) ? undefined : a / h;
}

/** Real minutes before the deadline at this game speed. @param {number|undefined} minutesLeft @param {number|undefined} timeScale */
export function realMinutesLeft(minutesLeft, timeScale) {
  const left = num(minutesLeft), scale = num(timeScale);
  return left === undefined || scale === undefined || !(scale > 0) ? undefined : left / scale;
}

/** Metres from a place to the contract's. @param {Contract} c @param {{x: number, z: number}|undefined} from */
export function distance(c, from) {
  const x = num(c.x), z = num(c.z);
  return x === undefined || z === undefined || !from ? undefined : Math.hypot(x - from.x, z - from.z);
}

/**
 * What the numbers are worked out with: the topic, the switch, your picks,
 * the game speed and where you are.
 * @typedef {Object} Context
 * @property {Mode} mode
 * @property {Factors} [factors]
 * @property {ContractTool[]} [tools]
 * @property {Set<number|string>} [attached] the tools on the rig you drive
 * @property {Record<string, number|string>} [picks] job kind → the tool of yours picked for it
 * @property {number} [timeScale]
 * @property {number} [maxSpeed] the cruise top of what you drive
 * @property {{x: number, z: number}} [from]
 */

/**
 * @typedef {Object} Figures
 * @property {boolean} leased whether the numbers count the lease
 * @property {number} [net]
 * @property {{workingWidth?: number, speedLimit?: number, name?: string, brand?: string, id?: number|string}} [tool]
 * @property {ContractTool[]} fits your tools that fit (own machines)
 * @property {number} [hours] the work time, estimated
 * @property {number} [perHour] net ÷ hours
 * @property {number} [extraLiters]
 * @property {number} [extra] what they're worth
 * @property {number} [total] net + extra
 * @property {number} [realMinutes] real time before the deadline
 * @property {number} [hoursToGo] the work still to do (a running contract)
 * @property {boolean} late the work takes longer than the real time left
 * @property {number} [metres] from you
 */

/**
 * Every number of one contract.
 * @param {Contract} c @param {Context} ctx
 * @returns {Figures}
 */
export function figures(c, ctx) {
  const leased = withLease(c, ctx.mode);
  const job = jobOf(c.type);
  // yours without the lease, or an offer with the switch on Own machines
  const own = c.mine ? !leased : ctx.mode === "own";
  const fits = own ? fittingTools(c, ctx.tools, ctx.attached) : [];
  const picked = job && ctx.picks ? fits.find((t) => t.id === ctx.picks?.[job.kind]) : undefined;
  const tool = own ? picked || fits[0] : leaseTool(c);
  const attachedNow = !!tool && "id" in tool && tool.id !== undefined && !!ctx.attached?.has(tool.id);
  const hours = workHours(c.areaHa, tool, c.type, attachedNow ? ctx.maxSpeed : undefined);
  const netNow = net(c, leased);
  const extra = extraValue(c, ctx.factors);
  const realMinutes = realMinutesLeft(c.minutesLeft, ctx.timeScale);
  const completion = num(c.completion);
  const hoursToGo = hours === undefined ? undefined
    : c.status === "running" && completion !== undefined ? hours * Math.max(0, 1 - Math.min(1, completion)) : hours;
  const open = c.status !== "finished";
  return {
    leased, fits, tool, hours, net: netNow,
    perHour: perHour(netNow, hours),
    extraLiters: extraLiters(c, ctx.factors), extra,
    total: netNow === undefined ? undefined : netNow + (extra ?? 0),
    realMinutes, hoursToGo,
    late: open && hoursToGo !== undefined && realMinutes !== undefined && hoursToGo * 60 > realMinutes,
    metres: distance(c, ctx.from),
  };
}

/** Your contracts: running and preparing first, the nearest deadline first, then the finished. @param {Contract[]} items */
export function yours(items) {
  const rank = (/** @type {Contract} */ c) => (c.status === "finished" ? 1 : 0);
  return items.filter((c) => c.mine === true && c.status !== "offer")
    .sort((a, b) => rank(a) - rank(b) || (num(a.minutesLeft) ?? Infinity) - (num(b.minutesLeft) ?? Infinity)
      || String(a.id).localeCompare(String(b.id)));
}

/** Yours that are being done now. @param {Contract[]} items */
export const running = (items) => yours(items).filter((c) => c.status === "running" || c.status === "preparing");

/**
 * The contracts on offer, sorted: by money per hour or net (the most
 * first), by time left or distance (the least first); one without the
 * number goes last.
 * @param {Contract[]} items @param {SortKey} key @param {Context} ctx
 */
export function offers(items, key, ctx) {
  const value = (/** @type {Contract} */ c) => {
    const f = figures(c, ctx);
    const v = { hour: f.perHour, net: f.net, left: num(c.minutesLeft), km: f.metres }[key];
    return v === undefined ? Infinity : key === "hour" || key === "net" ? -v : v;
  };
  return items.filter((c) => c.status === "offer").map((c) => ({ c, v: value(c) }))
    .sort((a, b) => (a.v === b.v ? String(a.c.id).localeCompare(String(b.c.id)) : a.v < b.v ? -1 : 1)).map((e) => e.c);
}

/** Your running contracts on a field. @param {Contract[]} items @param {number|undefined} fieldId */
export const onField = (items, fieldId) => (fieldId === undefined ? [] : running(items).filter((c) => c.fieldId === fieldId));

// --- the store's side -----------------------------------------------------

const PREFS_KEY = "fs25companion.contracts";
export const SORTS = /** @type {[SortKey, string][]} */ ([["hour", "Per hour"], ["net", "Net"], ["left", "Left"], ["km", "Distance"]]);

/**
 * The page's choices, remembered on this device: the switch, the sort and
 * the tool picked per job.
 * @typedef {{mode: Mode, sort: SortKey, picks: Record<string, number|string>}} Prefs
 */

/** @returns {Prefs} */
function loadPrefs() {
  /** @type {any} */
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch { /* private mode */ }
  return {
    mode: saved.mode === "own" ? "own" : "lease",
    sort: SORTS.some(([key]) => key === saved.sort) ? saved.sort : "hour",
    picks: saved.picks && typeof saved.picks === "object" ? saved.picks : {},
  };
}

/** The choices, kept in the store so the page, the map and the tab agree. @param {import("./selectors.js").StoreLike} store @returns {Prefs} */
export function prefsOf(store) {
  return store.get("contractPrefs") || loadPrefs();
}

/** @param {import("../store.js").Store} store @param {Partial<Prefs>} patch */
export function setPrefs(store, patch) {
  const next = { ...prefsOf(store), ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  store.set("contractPrefs", next);
}

/** The contracts topic's items, yours and the offers only. @param {import("./selectors.js").StoreLike} store @returns {Contract[]} */
export function contractsOf(store) {
  const items = store.get("contracts")?.items;
  return Array.isArray(items)
    ? items.filter((/** @type {any} */ c) => c && typeof c === "object" && c.id !== undefined && (c.status === "offer" || c.mine === true))
    : [];
}

/** @param {import("./selectors.js").StoreLike} store @returns {Context} */
export function contextOf(store) {
  const topic = store.get("contracts") || {};
  const prefs = prefsOf(store);
  const v = controlledVehicle(store);
  const attached = new Set(rigOf(cabOf(store)).filter((e) => e.depth > 0 && e.id !== undefined).map((e) => /** @type {number} */ (e.id)));
  for (const impl of Array.isArray(v?.implements) ? v.implements : []) if (impl?.id !== undefined) attached.add(impl.id);
  const player = store.get("player");
  const from = typeof v?.x === "number" && typeof v?.z === "number" ? { x: v.x, z: v.z }
    : typeof player?.x === "number" && typeof player?.z === "number" ? { x: player.x, z: player.z } : undefined;
  return {
    mode: prefs.mode, picks: prefs.picks, factors: topic.factors, tools: topic.tools, attached,
    timeScale: num(store.get("env")?.timeScale), maxSpeed: num(v?.cruise?.maxSpeed), from,
  };
}

/** How many contracts you're doing, and whether one won't make its deadline at this speed. @param {import("./selectors.js").StoreLike} store */
export function runningCount(store) {
  const ctx = contextOf(store);
  const list = running(contractsOf(store));
  return { count: list.length, warn: list.some((c) => figures(c, ctx).late) };
}

// --- words ------------------------------------------------------------------

/** "45 min", "1 h 25". @param {number} hours */
export function hoursText(hours) {
  const m = Math.max(0, Math.round(hours * 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

/** Game time left: "2 days 4 h", "5 h 10 min", "30 min". @param {number} minutes */
export function gameLeftText(minutes) {
  const min = Math.max(0, Math.round(minutes));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
  if (d) return `${d} ${d > 1 ? "days" : "day"} ${h} h`;
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

/** "44,000 l". @param {number} litres */
export const litresText = (litres) => `${Math.round(litres).toLocaleString()} l`;

/** "×5". @param {number} scale */
export const speedText = (scale) => `×${Math.round(scale * 1000) / 1000}`;

/** "87 %", the game's completion as the HUD's bar. @param {number} completion 0..1 */
export const pctText = (completion) => `${Math.round(Math.max(0, Math.min(1, completion)) * 100)} %`;

/** The crop or goods a contract is about, lower case: "wheat". @param {Contract} c */
export const goods = (c) => (typeof c.fillTitle === "string" && c.fillTitle ? c.fillTitle.toLowerCase() : undefined);

/** "Harvest · Barley". @param {Contract} c */
export function titleOf(c) {
  const title = c.title || c.type || "Contract";
  return typeof c.fillTitle === "string" && c.fillTitle ? `${title} · ${c.fillTitle}` : title;
}

/** Where it is: "Field 12", else the game's location text. @param {Contract} c */
export const placeOf = (c) => (c.fieldId !== undefined ? `Field ${c.fieldId}` : c.location || "");

/**
 * The field panels' row for one of your running contracts: "Contract ·
 * Plough · 87 %" and "1 day 0 h left · ≈ 4 h 50 at ×5".
 * @param {Contract} c @param {Context} ctx
 * @returns {{head: string, sub: string, late: boolean}}
 */
export function fieldRow(c, ctx) {
  const f = figures(c, ctx);
  const head = ["Contract", c.title || "", num(c.completion) !== undefined ? pctText(/** @type {number} */ (c.completion)) : ""];
  const sub = [];
  if (num(c.minutesLeft) !== undefined) sub.push(`${gameLeftText(/** @type {number} */ (c.minutesLeft))} left`);
  if (f.realMinutes !== undefined && ctx.timeScale !== undefined) sub.push(`≈ ${hoursText(f.realMinutes / 60)} at ${speedText(ctx.timeScale)}`);
  return { head: head.filter(Boolean).join(" · "), sub: sub.join(" · "), late: f.late };
}

/**
 * A contract's row of numbers, as the list shows it: each a lead, the
 * number and a tail ("Net", "£16,350", "").
 * @param {Contract} c @param {Context} ctx @param {import("./units.js").Units} units
 * @returns {{pre: string, v: string, post: string, tone?: "warn"|"extra"}[]}
 */
export function statLine(c, ctx, units) {
  const f = figures(c, ctx);
  const money = (/** @type {number} */ n) => units.currency + Math.round(n).toLocaleString();
  /** @type {{pre: string, v: string, post: string, tone?: "warn"|"extra"}[]} */
  const out = [];
  const left = num(c.minutesLeft);
  if (c.status === "offer") {
    if (f.net !== undefined) out.push({ pre: "Net ", v: money(f.net), post: f.leased ? " leased" : hasLease(c) ? " own" : "" });
    if (f.hours !== undefined) out.push({ pre: "≈ ", v: hoursText(f.hours), post: "" });
    else if (ctx.mode === "own" && jobOf(c.type) && !f.fits.length) out.push({ pre: "", v: "No tool of yours fits", post: ": with lease only" });
    if (f.perHour !== undefined) out.push({ pre: "", v: `${money(f.perHour)}/h`, post: "" });
    if (left !== undefined) out.push({ pre: "", v: gameLeftText(left), post: " left", tone: f.late ? "warn" : undefined });
    if (f.extra !== undefined && f.extra > 0) out.push({ pre: "+ ", v: money(f.extra), post: " extra", tone: "extra" });
    return out;
  }
  if (c.status === "finished") {
    if (f.net !== undefined) out.push({ pre: "Net ", v: money(finalSums(c).total), post: "" });
    return out;
  }
  const needed = neededLiters(c, ctx.factors), toGo = deliveredToGo(c, ctx.factors), worked = fieldWorked(c, ctx.factors);
  const factor = successFactor(c, ctx.factors);
  if (delivers(c) && num(c.depositedLiters) !== undefined) {
    out.push({ pre: "delivered ", v: litresText(/** @type {number} */ (c.depositedLiters)), post: needed !== undefined ? ` of ${litresText(needed)}` : "" });
    if (toGo !== undefined) out.push({ pre: "", v: litresText(toGo), post: " to go" });
  } else if (worked !== undefined && factor !== undefined) {
    out.push({ pre: "field ", v: pctText(worked), post: ` worked of ${pctText(factor)}` });
  }
  if (left !== undefined) out.push({ pre: "", v: gameLeftText(left), post: " left", tone: f.late ? "warn" : undefined });
  if (f.realMinutes !== undefined && ctx.timeScale !== undefined) {
    out.push({ pre: "≈ ", v: hoursText(f.realMinutes / 60), post: ` at ${speedText(ctx.timeScale)}`, tone: f.late ? "warn" : undefined });
  }
  return out;
}

/**
 * A finished contract's sums, as the game pays them when you dismiss it:
 * the reward only on success, the lease only if you took it.
 * @param {Contract} c
 */
export function finalSums(c) {
  const reward = c.finishState === "success" ? num(c.reward) ?? 0 : 0;
  const lease = c.leased === true ? num(c.vehicleCosts) ?? 0 : 0;
  const reimbursement = num(c.reimbursement) ?? 0;
  const penalty = num(c.stealingCost) ?? 0;
  return { reward, lease, reimbursement, penalty, total: reward - lease - penalty + reimbursement };
}

export const FINISH_WORDS = /** @type {Record<string, string>} */ ({
  success: "Success", failed: "Failed", timedOut: "Timed out", canceled: "Cancelled",
});
