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
 * refills, unloading), starting from BetterContracts' table; a job
 * without one gets your fitting tools and no time. The live check
 * compares each with a real run.
 *
 * Seen in the game (2026-11-15, the lease lists and Vincent's farm):
 * CUTTERS, POTATOHARVESTING, PLOWS, CULTIVATORS, POWERHARROWS, SEEDERS,
 * SPRAYERS, FERTILIZERSPREADERS, SLURRYTANKS, SLURRYTOOLS, MOWERS,
 * TEDDERS, BALERSROUND, BALEWRAPPERS. A fertilizing contract leases a
 * sprayer as often as a spreader.
 * @type {{kind: string, match: string[], categories: string[], overhead?: number}[]}
 */
export const JOBS = [
  // a harvest's own categories only count without a lease list: see fitCategories
  { kind: "harvest", match: ["harvest"], categories: ["CUTTERS", "CORNHEADERS"], overhead: 1.3 },
  { kind: "plow", match: ["plow", "plough"], categories: ["PLOWS"], overhead: 1.25 },
  { kind: "cultivate", match: ["cultivat"], categories: ["CULTIVATORS", "DISCHARROWS", "POWERHARROWS"], overhead: 1.2 },
  { kind: "sow", match: ["sow"], categories: ["SEEDERS", "PLANTERS"], overhead: 1.2 },
  { kind: "herbicide", match: ["herbicid", "spray"], categories: ["SPRAYERS"], overhead: 1.15 },
  { kind: "fertilize", match: ["fertiliz", "fertilis", "lime"],
    categories: ["FERTILIZERSPREADERS", "SPRAYERS", "SLURRYTANKS", "SLURRYTOOLS", "MANURESPREADERS"], overhead: 1.15 },
  { kind: "weed", match: ["weed", "hoe"], categories: ["WEEDERS"], overhead: 1.2 },
  { kind: "mow", match: ["mow"], categories: ["MOWERS"], overhead: 1.3 },
  // "baleWrapMission" before "baleMission": the first match wins
  { kind: "baleWrap", match: ["balewrap"], categories: ["BALEWRAPPERS"] },
  { kind: "bale", match: ["bale"], categories: ["BALERSROUND", "BALERSSQUARE"] },
  { kind: "ted", match: ["tedder"], categories: ["TEDDERS"] },
];

/** shop categories that carry or pull, whatever width the shop gives them */
const CARRIERS = /^(TRACTORS|TRAILERS|TRUCKS)/;

const categoryOf = (/** @type {{category?: string}|undefined} */ v) =>
  (typeof v?.category === "string" ? v.category.toUpperCase() : "");

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
 * The shop categories that do a contract. A harvest depends on its crop,
 * and its lease list says what the game harvests it with: the job's
 * categories found there (a grain header, or a corn header), else the
 * lease's own tools with a working width (a potato harvester). Without a
 * lease list, and for every other job, the job's categories.
 * @param {Contract} c
 * @returns {string[]}
 */
export function fitCategories(c) {
  const job = jobOf(c.type);
  if (!job) return [];
  if (job.kind !== "harvest" || !hasLease(c)) return job.categories;
  const leased = /** @type {ContractVehicle[]} */ (c.vehicles);
  const known = job.categories.filter((k) => leased.some((v) => categoryOf(v) === k));
  if (known.length) return known;
  return [...new Set(leased.filter((v) => num(v?.workingWidth) !== undefined && !CARRIERS.test(categoryOf(v))).map(categoryOf))]
    .filter(Boolean);
}

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
  const categories = fitCategories(c);
  if (!categories.length || !Array.isArray(tools)) return [];
  return tools.filter((t) => t && categories.includes(categoryOf(t)))
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
  const categories = fitCategories(c);
  const fits = withWidth.filter((v) => categories.includes(categoryOf(v)));
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
  const overhead = num(job?.overhead);
  return area === undefined || rate === undefined || overhead === undefined || !(area > 0) ? undefined : (area / rate) * overhead;
}

/**
 * A contract is more than its field work: you drive there, and you set up
 * and hand in. Both are guesses until the live check's real runs.
 */
export const TRAVEL_KMH = 30;
export const SETUP_MINUTES = 10;

/**
 * The whole job with one tool, in hours: the field work, the way there in
 * a straight line at TRAVEL_KMH, and the setup. The way starts where the
 * machines are: at the shop for a lease (the game puts them there), at
 * your own tool otherwise, and where you are when neither is known.
 * Nothing without a work time.
 * @param {Contract} c @param {Context} ctx
 * @param {{workingWidth?: number, speedLimit?: number, id?: number|string}|undefined} tool
 * @param {boolean} leased @param {number} [maxSpeed]
 * @returns {{work?: number, travel?: number, setup?: number, job?: number, from?: "shop"|"tool"|"you", metres?: number}}
 */
export function jobTime(c, ctx, tool, leased, maxSpeed) {
  const work = workHours(c.areaHa, tool, c.type, maxSpeed);
  if (work === undefined) return {};
  const parked = !leased && tool?.id !== undefined ? ctx.places?.get(tool.id) : undefined;
  const start = leased ? ctx.shop : parked;
  /** @type {"shop"|"tool"|"you"|undefined} */
  let from = start ? (leased ? "shop" : "tool") : undefined;
  let metres = distance(c, start);
  if (metres === undefined) {
    metres = distance(c, ctx.from);
    from = metres === undefined ? undefined : "you";
  }
  const travel = metres === undefined ? undefined : metres / 1000 / TRAVEL_KMH;
  const setup = SETUP_MINUTES / 60;
  return { work, travel, setup, job: work + (travel ?? 0) + setup, from, metres };
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
 * @property {{x: number, z: number}} [shop] where leased machines appear
 * @property {Map<number|string, {x: number, z: number}>} [places] where your vehicles are, by id
 */

/**
 * @typedef {Object} Figures
 * @property {boolean} leased whether the numbers count the lease
 * @property {number} [net]
 * @property {{workingWidth?: number, speedLimit?: number, name?: string, brand?: string, id?: number|string}} [tool]
 * @property {ContractTool[]} fits your tools that fit (own machines)
 * @property {number} [hours] the field work, estimated
 * @property {number} [travelHours] the way there
 * @property {"shop"|"tool"|"you"} [travelFrom] where it starts
 * @property {number} [travelMetres]
 * @property {number} [setupHours]
 * @property {number} [jobHours] the whole job: work + travel + setup
 * @property {number} [perHour] net ÷ the whole job
 * @property {number} [extraLiters]
 * @property {number} [extra] what they're worth
 * @property {number} [total] net + extra
 * @property {number} [realMinutes] real time before the deadline
 * @property {number} [hoursToGo] what's still to do: the whole job for an offer, the work left for a running contract
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
  const time = jobTime(c, ctx, tool, !own, attachedNow ? ctx.maxSpeed : undefined);
  const hours = time.work;
  const netNow = net(c, leased);
  const extra = extraValue(c, ctx.factors);
  const realMinutes = realMinutesLeft(c.minutesLeft, ctx.timeScale);
  const completion = num(c.completion);
  const hoursToGo = hours === undefined ? undefined
    : c.status === "running" && completion !== undefined ? hours * Math.max(0, 1 - Math.min(1, completion))
      : c.status === "offer" ? time.job : hours;
  const open = c.status !== "finished";
  return {
    leased, fits, tool, hours, net: netNow,
    travelHours: time.travel, travelFrom: time.from, travelMetres: time.metres, setupHours: time.setup, jobHours: time.job,
    perHour: perHour(netNow, time.job),
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
  return ranked(items, key, ctx).map((e) => e.c);
}

/**
 * The offers with what they sort by: the least first, Infinity without the number.
 * @param {Contract[]} items @param {SortKey} key @param {Context} ctx
 */
function ranked(items, key, ctx) {
  const value = (/** @type {Contract} */ c) => {
    const f = figures(c, ctx);
    const v = { hour: f.perHour, net: f.net, left: num(c.minutesLeft), km: f.metres }[key];
    return v === undefined ? Infinity : key === "hour" || key === "net" ? -v : v;
  };
  return items.filter((c) => c.status === "offer").map((c) => ({ c, v: value(c) }))
    .sort((a, b) => (a.v === b.v ? String(a.c.id).localeCompare(String(b.c.id)) : a.v < b.v ? -1 : 1));
}

/**
 * The offers by type (the game's type name, under the game's title for
 * it): inside a type by the sort, the types by their best contract. A type
 * where no contract has the number goes last, by name.
 * @param {Contract[]} items @param {SortKey} key @param {Context} ctx
 * @returns {{type: string, title: string, items: Contract[]}[]}
 */
export function offerGroups(items, key, ctx) {
  /** @type {Map<string, {type: string, title: string, items: Contract[], best: number}>} */
  const groups = new Map();
  for (const { c, v } of ranked(items, key, ctx)) {
    const type = c.type || c.title || "other";
    let group = groups.get(type);
    if (!group) groups.set(type, group = { type, title: c.title || c.type || "Other", items: [], best: v });
    group.items.push(c);
  }
  return [...groups.values()].sort((a, b) => (a.best === b.best ? a.title.localeCompare(b.title) : a.best < b.best ? -1 : 1))
    .map(({ type, title, items: list }) => ({ type, title, items: list }));
}

/** Your running contracts on a field. @param {Contract[]} items @param {number|undefined} fieldId */
export const onField = (items, fieldId) => (fieldId === undefined ? [] : running(items).filter((c) => c.fieldId === fieldId));

// --- the store's side -----------------------------------------------------

const PREFS_KEY = "fs25companion.contracts";
export const SORTS = /** @type {[SortKey, string][]} */ ([["hour", "Per hour"], ["net", "Net"], ["left", "Left"], ["km", "Distance"]]);

/**
 * The page's choices, remembered on this device: the switch, the sort,
 * the tool picked per job and the types folded in the On offer list.
 * @typedef {{mode: Mode, sort: SortKey, picks: Record<string, number|string>, closed: string[]}} Prefs
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
    closed: Array.isArray(saved.closed) ? saved.closed.filter((/** @type {unknown} */ t) => typeof t === "string") : [],
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
  /** @type {Map<number|string, {x: number, z: number}>} */
  const places = new Map();
  const all = store.get("vehicles")?.vehicles;
  for (const one of Array.isArray(all) ? all : []) {
    if (one?.id !== undefined && typeof one.x === "number" && typeof one.z === "number") places.set(one.id, { x: one.x, z: one.z });
  }
  const shop = typeof topic.shop?.x === "number" && typeof topic.shop?.z === "number" ? { x: topic.shop.x, z: topic.shop.z } : undefined;
  return {
    mode: prefs.mode, picks: prefs.picks, factors: topic.factors, tools: topic.tools, attached,
    timeScale: num(store.get("env")?.timeScale), maxSpeed: num(v?.cruise?.maxSpeed), from, shop, places,
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
 * Plough · 87 %" and "deadline 1 day 0 h game time · work left ≈ 6 min
 * real time".
 * @param {Contract} c @param {Context} ctx
 * @returns {{head: string, sub: string, late: boolean}}
 */
export function fieldRow(c, ctx) {
  const f = figures(c, ctx);
  const head = ["Contract", c.title || "", num(c.completion) !== undefined ? pctText(/** @type {number} */ (c.completion)) : ""];
  const sub = [];
  const times = timeStats(c, f);
  for (const s of [times.deadline, times.work]) if (s) sub.push(s.pre + s.v + s.post);
  return { head: head.filter(Boolean).join(" · "), sub: sub.join(" · "), late: f.late };
}

/**
 * A contract's two times, each named for what it counts in. The deadline
 * is the game's time left, in game time: the same words at any game
 * speed. The other is your own time, real time: the whole job for an
 * offer (work, travel and setup), the work left for a running contract. The real time before
 * the deadline is never written beside them; it only decides `late`.
 * @param {Contract} c @param {Figures} f
 * @returns {{deadline?: Stat, work?: Stat}}
 */
export function timeStats(c, f) {
  const left = num(c.minutesLeft);
  const tone = f.late ? /** @type {"warn"} */ ("warn") : undefined;
  const running = c.status !== "offer";
  const hours = running ? f.hoursToGo : f.jobHours;
  return {
    deadline: left === undefined ? undefined : { pre: "deadline ", v: gameLeftText(left), post: " game time", tone },
    work: hours === undefined ? undefined
      : { pre: running ? "work left ≈ " : "job ≈ ", v: hoursText(hours), post: " real time", tone: running ? tone : undefined },
  };
}

/** @typedef {{pre: string, v: string, post: string, tone?: "warn"|"extra"}} Stat */

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
  const times = timeStats(c, f);
  if (c.status === "offer") {
    if (f.net !== undefined) out.push({ pre: "Net ", v: money(f.net), post: f.leased ? " leased" : hasLease(c) ? " own" : "" });
    if (times.work) out.push(times.work);
    else if (ctx.mode === "own" && jobOf(c.type) && !f.fits.length) out.push({ pre: "", v: "No tool of yours fits", post: ": with lease only" });
    if (f.perHour !== undefined) out.push({ pre: "", v: `${money(f.perHour)}/h`, post: "" });
    if (times.deadline) out.push(times.deadline);
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
  if (times.deadline) out.push(times.deadline);
  if (times.work) out.push(times.work);
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

// --- accept, cancel, hand in (specs/0019-contract-actions.md) ----------------

/**
 * The one button a contract's detail has, by what it is: Accept on an
 * offer, Cancel contract on one of yours that's preparing or running, Hand
 * in on a finished one. `note` is the line beside the button: what the tap
 * does, or why it's faded. Cancel asks once more: `confirm` is the button
 * and the line then.
 * @typedef {Object} ContractAction
 * @property {"accept"|"cancel"|"handIn"} kind
 * @property {"contract.accept"|"contract.cancel"|"contract.handIn"} command
 * @property {number} [value] Accept's: 1 with lease, 0 own machines
 * @property {string} label
 * @property {string} note
 * @property {boolean} fill Accept and Hand in are filled, Cancel is plain
 * @property {boolean} faded it can't be pressed now; the note says why
 * @property {{label: string, note: string}} [confirm] Cancel's second ask
 */

/** "+£3,900", "−£450". @param {number} amount @param {import("./units.js").Units} units */
const signedMoney = (amount, units) => `${amount < 0 ? "−" : "+"}${units.currency}${Math.abs(Math.round(amount)).toLocaleString()}`;

/**
 * A contract's button. The rules are the dashboard's (the mod refuses on
 * its own anyway): the limit counts every one of yours, finished ones
 * until they're handed in; the game starts one at a time.
 * @param {Contract} c
 * @param {{limit?: number, items?: Contract[]}|undefined} topic the contracts topic
 * @param {{mode?: Mode}} prefs the page's With lease / Own machines switch
 * @param {import("./units.js").Units} units
 * @returns {ContractAction}
 */
export function action(c, topic, prefs, units) {
  const mine = yours(Array.isArray(topic?.items) ? topic.items : []);
  if (c.status === "finished") {
    const total = num(c.total);
    return { kind: "handIn", command: "contract.handIn", label: total && Math.round(total) !== 0 ? `Hand in · ${signedMoney(total, units)}` : "Hand in",
      note: "Books the game’s sum and frees a slot.", fill: true, faded: false };
  }
  if (c.mine === true) {
    return { kind: "cancel", command: "contract.cancel", label: "Cancel contract",
      note: c.status === "preparing" ? "The game is putting the machines at the shop." : "Ends it as cancelled. Asks once more.",
      fill: false, faded: false,
      confirm: { label: "Really cancel?", note: c.leased === true ? "The leased machines are taken back at once." : "The contract ends as cancelled." } };
  }
  const lease = withLease(c, prefs.mode === "own" ? "own" : "lease");
  const cost = num(c.vehicleCosts);
  /** @type {ContractAction} */
  const out = { kind: "accept", command: "contract.accept", value: lease ? 1 : 0,
    label: lease ? (cost !== undefined ? `Accept with lease · ${units.currency}${Math.round(cost).toLocaleString()}` : "Accept with lease")
      : "Accept, own machines",
    note: lease ? "The leased machines will stand at the shop." : "You bring your own machines.", fill: true, faded: false };
  const limit = num(topic?.limit);
  if (limit !== undefined && mine.length >= limit) {
    out.faded = true;
    out.note = `${mine.length} of ${limit} taken: hand one in first.`;
  } else if (mine.some((m) => m.status === "preparing")) {
    out.faded = true;
    out.note = "Another contract is still getting ready.";
  }
  return out;
}
