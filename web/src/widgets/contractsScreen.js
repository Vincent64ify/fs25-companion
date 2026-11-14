// @ts-check
// The Contracts page (specs/0018-contracts.md), read-only: on the left the
// switches (With lease / Own machines, the sort) over the list, Yours then
// On offer; beside them the detail of the row you tapped, in two columns
// (Money and Deadline; Progress or Work, then the vehicles). The numbers
// are data/contracts.js's. Under 900 wide or in portrait the detail opens
// over the list, with a Back button.
//
// The topic arrives every 2 s: the page is drawn again only when what it
// shows changed, and the list keeps its scroll. While another screen shows
// it does nothing (the player's place arrives ten times a second); it
// draws when it's shown again.

import {
  contextOf, contractsOf, deliveredToGo, delivers, fieldWorked, figures, finalSums, FINISH_WORDS, gameLeftText, goods,
  hasLease, hoursText, jobOf, litresText, neededLiters, offers, pctText, placeOf, prefsOf, setPrefs, SORTS, speedText,
  statLine, successFactor, titleOf, workRate, yours,
} from "../data/contracts.js";
import { areaText, areaUnit, areaValue, lengthText, moneyText, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").Contract} Contract */
/** @typedef {import("../types.js").ContractVehicle} ContractVehicle */
/** @typedef {import("../data/contracts.js").Context} Context */
/** @typedef {import("../data/contracts.js").Figures} Figures */
/** @typedef {import("../data/units.js").Units} Units */

const KM_PER_MILE = 1.609344;

/** "1.9 km" or "1.2 mi". @param {number} metres @param {Units} u */
export const distanceText = (metres, u) => (u.miles ? `${(metres / 1000 / KM_PER_MILE).toFixed(1)} mi` : `${(metres / 1000).toFixed(1)} km`);

/** @param {string} tag @param {string} className @param {string} [text] */
const el = (tag, className, text) => h(tag, text === undefined ? { className } : { className, text });

/** @param {string} className @param {string} label @param {boolean} pressed @param {() => void} onClick */
function pressButton(className, label, pressed, onClick) {
  const b = el("button", className, label);
  b.setAttribute("type", "button");
  b.setAttribute("aria-pressed", String(pressed));
  b.addEventListener("click", onClick);
  return b;
}

/** A bar of the game's completion. @param {number} completion 0..1 @param {boolean} [warn] */
function meter(completion, warn) {
  const bar = h("span", { className: "ct-meter" }, h("span"));
  /** @type {HTMLElement} */ (bar.firstChild).style.width = `${Math.max(0, Math.min(1, completion)) * 100}%`;
  if (warn) bar.dataset.tone = "warn";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", pctText(completion));
  return bar;
}

/** @param {string} text @param {"on"|"warn"|"off"} tone */
function chip(text, tone) {
  const c = el("span", "ct-chip", text);
  c.dataset.tone = tone;
  return c;
}

/**
 * The chip a contract wears: where it stands.
 * @param {Contract} c @param {Figures} f @param {Context} ctx
 * @returns {[string, "on"|"warn"|"off"]}
 */
function standing(c, f, ctx) {
  if (c.status === "running") return ["Running", "on"];
  if (c.status === "preparing") return ["Preparing", "on"];
  if (c.status === "finished") {
    return [FINISH_WORDS[c.finishState || ""] || "Finished", c.finishState === "success" ? "on" : "warn"];
  }
  return f.late && ctx.timeScale !== undefined ? [`Too late at ${speedText(ctx.timeScale)}`, "warn"] : ["On offer", "off"];
}

/** "Field 12 · 12.40 ha · for Hofgut Solek · 1.9 km". @param {Contract} c @param {Figures} f @param {Units} units @param {boolean} [far] */
function subLine(c, f, units, far) {
  return [placeOf(c), typeof c.areaHa === "number" ? areaText(c.areaHa, units) : "", c.npc ? `for ${c.npc}` : "",
    far && f.metres !== undefined ? distanceText(f.metres, units) : ""].filter(Boolean).join(" · ");
}

/** @param {{pre: string, v: string, post: string, tone?: string}[]} stats */
function statsEl(stats) {
  return h("span", { className: "ct-stats" }, ...stats.map((s) => {
    const span = h("span", {}, s.pre, h("b", { text: s.v }), s.post);
    if (s.tone) span.className = s.tone === "extra" ? "ct-extra" : "ct-warn";
    return span;
  }));
}

/** @param {string} k @param {string} v @param {{strong?: boolean, tone?: "ok"|"warn"}} [opts] */
function kv(k, v, opts = {}) {
  const row = h("div", { className: "ct-kv" }, el("span", "ct-k", k), el("span", "ct-v", v));
  if (opts.strong) row.dataset.strong = "true";
  if (opts.tone) row.dataset.tone = opts.tone;
  return row;
}

/** @param {string} label @param {...(Node|null|undefined|false)} children */
function section(label, ...children) {
  return h("div", { className: "ct-sec" }, el("span", "ct-label", label),
    .../** @type {Node[]} */ (children.filter(Boolean)));
}

/** The icon for a shop category. @param {string|undefined} category */
function vehicleIcon(category) {
  const name = (category || "").toUpperCase();
  if (name.includes("HARVESTER")) return "harvester";
  if (name.startsWith("TRACTOR")) return "tractor";
  if (name.includes("TRAILER")) return "trailer";
  if (name.includes("TRUCK")) return "truck";
  return "implement";
}

/** "Lemken Juwel 8". @param {ContractVehicle} v */
const vehicleName = (v) => [v.brand, v.name].filter(Boolean).join(" ") || v.categoryTitle || v.category || "Vehicle";

/** "Ploughs · 2.4 m · 12 km/h". @param {ContractVehicle} v @param {Units} units @param {string} [more] */
function vehicleSpec(v, units, more) {
  return [v.categoryTitle || v.category || "",
    typeof v.workingWidth === "number" ? lengthText(v.workingWidth, units) : "",
    typeof v.speedLimit === "number" ? `${Math.round(speedValue(v.speedLimit, units))} ${speedUnit(units)}` : "",
    more || ""].filter(Boolean).join(" · ");
}

/** @param {ContractVehicle} v @param {Units} units @param {string} [more] */
function vehicleRow(v, units, more) {
  return h("div", { className: "ct-veh" }, h("span", { className: "ct-icon" }, icon(vehicleIcon(v.category))),
    h("span", { className: "ct-veh-name" }, vehicleName(v), el("span", "ct-veh-spec", vehicleSpec(v, units, more))));
}

/** @type {import("./widget.js").CreateWidget} */
export function contractsScreen(store, opts = {}) {
  const machines = h("div", { className: "ct-well" });
  machines.setAttribute("role", "group");
  machines.setAttribute("aria-label", "Machines");
  const sorts = h("div", { className: "ct-well" });
  sorts.setAttribute("role", "group");
  sorts.setAttribute("aria-label", "Sort");
  const list = el("div", "ct-list");
  const detail = el("section", "ct-detail");
  detail.setAttribute("aria-label", "Contract");
  const root = h("section", { className: "contracts" },
    h("div", { className: "ct-side" }, h("div", { className: "ct-top" }, machines, sorts), list), detail);
  root.setAttribute("aria-label", "Contracts");
  if (opts.id) root.id = opts.id;

  /** the row whose detail shows; yours first, else the best offer */
  let selected = /** @type {string|undefined} */ (undefined);
  /** compact: the detail is over the list */
  let open = false;
  let drawn = "";
  /** the screen it's on, watched for being shown again */
  let watched = /** @type {Element|null} */ (null);

  const pick = (/** @type {string} */ id) => {
    selected = id;
    open = true;
    render();
  };

  /** @param {Contract} c @param {Context} ctx @param {Units} units */
  function row(c, ctx, units) {
    const f = figures(c, ctx);
    const b = pressButton("ct-row", "", c.id === selected, () => pick(c.id));
    b.dataset.id = c.id;
    b.dataset.status = c.status;
    const head = h("span", { className: "ct-row-head" }, el("span", "ct-title", titleOf(c)),
      el("span", "ct-sub", subLine(c, f, units, c.status === "offer")));
    if (c.status !== "offer") head.append(chip(...standing(c, f, ctx)));
    b.append(head);
    if (c.status !== "offer" && typeof c.completion === "number") {
      b.append(h("span", { className: "ct-progress" }, meter(c.completion, f.late), el("span", "ct-pct", pctText(c.completion))));
    }
    b.append(statsEl(statLine(c, ctx, units)));
    return b;
  }

  /** @param {Contract} c @param {Figures} f @param {Context} ctx @param {Units} units */
  function moneySection(c, f, ctx, units) {
    if (c.status === "finished") {
      const sums = finalSums(c);
      return section("Money",
        kv("Reward", moneyText(sums.reward, units)),
        sums.lease ? kv("Lease", `− ${moneyText(sums.lease, units)}`) : null,
        sums.reimbursement ? kv("Reimbursement", `+ ${moneyText(sums.reimbursement, units)}`) : null,
        sums.penalty ? kv("Penalty", `− ${moneyText(sums.penalty, units)}`, { tone: "warn" }) : null,
        kv("Total", moneyText(sums.total, units), { strong: true }),
        el("div", "ct-why", "Paid when you dismiss it in the game."));
    }
    const extra = f.extra !== undefined && f.extra > 0 ? f.extra : undefined;
    const factor = successFactor(c, ctx.factors);
    const price = c.sellPoint?.price;
    const why = extra !== undefined && f.extraLiters !== undefined && factor !== undefined && typeof price === "number"
      ? `You keep ${litresText(f.extraLiters)}${goods(c) ? ` ${goods(c)}` : ""} (the ${Math.round((1 - factor) * 100)} % the game `
        + `doesn’t ask for), worth ${moneyText(extra, units)}${c.sellPoint?.name ? ` at ${c.sellPoint.name}` : ""}, `
        + `${moneyText(price * 1000, units)}/1000 l.`
      : "";
    return section("Money",
      typeof c.reward === "number" ? kv("Reward", moneyText(c.reward, units)) : null,
      f.leased && typeof c.vehicleCosts === "number" ? kv("Lease", `− ${moneyText(c.vehicleCosts, units)}`) : null,
      f.net !== undefined ? kv("Net", moneyText(f.net, units), { strong: true }) : null,
      extra !== undefined ? kv("Extra", `+ ${moneyText(extra, units)}`, { tone: "ok" }) : null,
      extra !== undefined && f.total !== undefined ? kv("Total", moneyText(f.total, units), { strong: true }) : null,
      why ? el("div", "ct-why", why) : null);
  }

  /** @param {Contract} c @param {Figures} f @param {Context} ctx */
  function deadlineSection(c, f, ctx) {
    if (c.status === "finished" || typeof c.minutesLeft !== "number") return null;
    let why = "";
    if (f.realMinutes !== undefined && ctx.timeScale !== undefined) {
      why = `≈ ${hoursText(f.realMinutes / 60)} of real time at ${speedText(ctx.timeScale)}`
        + (f.late && f.hoursToGo !== undefined
          ? `. The work ${c.status === "offer" ? "takes" : "still takes"} ≈ ${hoursText(f.hoursToGo)}: you won’t make it at this speed.` : ".");
    }
    const whyEl = why ? el("div", "ct-why", why) : null;
    if (whyEl && f.late) whyEl.dataset.tone = "warn";
    return section("Deadline", kv("Time left", gameLeftText(c.minutesLeft), { strong: true, tone: f.late ? "warn" : undefined }), whyEl);
  }

  /** @param {Contract} c @param {Figures} f @param {Context} ctx @param {Units} units */
  function progressSection(c, f, ctx, units) {
    if (typeof c.completion !== "number") return null;
    const factor = successFactor(c, ctx.factors);
    const needed = neededLiters(c, ctx.factors), toGo = deliveredToGo(c, ctx.factors), worked = fieldWorked(c, ctx.factors);
    const rows = [];
    let why = "";
    if (delivers(c)) {
      if (factor !== undefined && typeof c.expectedLiters === "number") {
        why = `Delivered against what the game asks for: ${pctText(factor)} of the expected ${litresText(c.expectedLiters)}. `
          + "It finishes at 99.5 % of that.";
      }
      if (typeof c.depositedLiters === "number") {
        rows.push(kv("Delivered", litresText(c.depositedLiters) + (needed !== undefined ? ` of ${litresText(needed)}` : "")));
      }
      if (toGo !== undefined) rows.push(kv("To go", litresText(toGo)));
      if (c.sellPoint?.name) {
        const from = ctx.from && typeof c.sellPoint.x === "number" && typeof c.sellPoint.z === "number"
          ? Math.hypot(c.sellPoint.x - ctx.from.x, c.sellPoint.z - ctx.from.z) : undefined;
        rows.push(kv("Deliver to", c.sellPoint.name + (from !== undefined ? ` · ${distanceText(from, units)}` : "")));
      }
    } else if (worked !== undefined && factor !== undefined) {
      why = `Field ${pctText(worked)} worked of the ${pctText(factor)} that counts as done. The game finishes at 99.5 % of that.`;
      rows.push(kv("Worked", `${pctText(worked)} of ${pctText(factor)}`));
    }
    return section("Progress",
      h("div", { className: "ct-big" }, meter(c.completion, f.late), el("span", "ct-pct", pctText(c.completion))),
      why ? el("div", "ct-why", why) : null, ...rows);
  }

  /** @param {Contract} c @param {Figures} f @param {Context} ctx @param {Units} units */
  function workSection(c, f, ctx, units) {
    const job = jobOf(c.type);
    const rows = [];
    if (c.fieldId !== undefined) {
      rows.push(kv("Field", [`Field ${c.fieldId}`, typeof c.areaHa === "number" ? areaText(c.areaHa, units) : ""].filter(Boolean).join(" · ")));
    }
    if (f.hours !== undefined) rows.push(kv("Work time", `≈ ${hoursText(f.hours)}`, { strong: true }));
    if (f.perHour !== undefined) rows.push(kv("Per hour", `${moneyText(f.perHour, units)}/h`));
    let why = "";
    const rate = workRate(f.tool, undefined);
    if (f.hours !== undefined && f.tool && job && rate !== undefined) {
      const who = f.leased ? "The leased tool" : `Your ${vehicleName(f.tool)}`;
      why = `${who}: ${lengthText(/** @type {number} */ (f.tool.workingWidth), units)} at `
        + `${Math.round(speedValue(/** @type {number} */ (f.tool.speedLimit), units))} ${speedUnit(units)} = `
        + `${areaValue(rate, units).toFixed(1)} ${areaUnit(units)}/h, × ${job.overhead} for turns, overlaps and refills. An estimate.`;
    } else if (!job) {
      why = "No work time for this kind of contract yet.";
    } else if (!f.leased && !f.fits.length) {
      why = hasLease(c) ? "No tool of yours fits: with lease only." : "No tool of yours fits.";
    }
    const picker = !f.leased && f.fits.length > 0;
    const tools = picker ? h("div", { className: "ct-tools" }, ...f.fits.map((t) => {
      const hours = figures(c, { ...ctx, picks: { ...ctx.picks, [/** @type {{kind: string}} */ (job).kind]: t.id } }).hours;
      const b = pressButton("ct-tool", "", f.tool === t, () => {
        setPrefs(store, { picks: { ...prefsOf(store).picks, [/** @type {{kind: string}} */ (job).kind]: t.id } });
      });
      b.dataset.tool = String(t.id);
      b.append(h("span", { className: "ct-tool-name" }, vehicleName(t),
        el("span", "ct-tool-spec", vehicleSpec(t, units, ctx.attached?.has(t.id) ? "attached" : ""))),
      el("span", "ct-tool-time", hours !== undefined ? `≈ ${hoursText(hours)}` : ""));
      return b;
    })) : null;
    if (tools) {
      tools.setAttribute("role", "group");
      tools.setAttribute("aria-label", "Your tool for this job");
    }
    return section("Work", ...rows, why ? el("div", "ct-why", why) : null,
      picker ? el("span", "ct-label", "Tool") : null, tools);
  }

  /** @param {Contract} c @param {Figures} f @param {Units} units */
  function vehiclesSection(c, f, units) {
    const vehicles = c.vehicles || [];
    const cost = typeof c.vehicleCosts === "number" ? moneyText(c.vehicleCosts, units) : "";
    if (c.status !== "offer") {
      if (f.leased) return section("Leased vehicles", ...vehicles.map((v) => vehicleRow(v, units)));
      return section("Your own machines", f.tool ? vehicleRow(f.tool, units, "yours") : el("div", "ct-why", "No lease taken."));
    }
    if (!vehicles.length) return section("Lease vehicles", el("div", "ct-why", "No lease"));
    if (!f.leased) {
      // own machines: the lease list folds to one line, so the tool picker fits a small screen
      return section("Lease instead", el("div", "ct-why",
        `${vehicles.length} ${vehicles.length === 1 ? "vehicle" : "vehicles"}${cost ? ` for ${cost}` : ""}. With lease lists them.`));
    }
    return section(["Lease vehicles", cost].filter(Boolean).join(" · "), ...vehicles.map((v) => vehicleRow(v, units)));
  }

  /** @param {Contract} c @param {Context} ctx @param {Units} units */
  function drawDetail(c, ctx, units) {
    const f = figures(c, ctx);
    const back = el("button", "ct-btn ct-back", "Back");
    back.setAttribute("type", "button");
    back.addEventListener("click", () => {
      open = false;
      render();
    });
    const head = h("div", { className: "ct-d-head" }, back, h("div", { className: "ct-d-name" },
      h("div", { className: "ct-d-title" }, titleOf(c), chip(...standing(c, f, ctx))),
      el("div", "ct-d-sub", subLine(c, f, units))));
    if (typeof c.x === "number" && typeof c.z === "number") {
      const show = h("button", { className: "ct-btn ct-show" }, icon("map"), "Show on the map");
      show.setAttribute("type", "button");
      show.addEventListener("click", () => store.set("goto", { screen: "map", at: { x: c.x, z: c.z } }));
      head.append(show);
    }
    const left = h("div", { className: "ct-d-col" }, ...[moneySection(c, f, ctx, units), deadlineSection(c, f, ctx)]
      .filter((s) => s !== null));
    const right = h("div", { className: "ct-d-col" }, ...[
      c.status === "offer" ? workSection(c, f, ctx, units) : progressSection(c, f, ctx, units),
      vehiclesSection(c, f, units)].filter((s) => s !== null));
    detail.replaceChildren(head, h("div", { className: "ct-d-cols" }, left, right));
  }

  function render() {
    const screen = root.closest(".screen");
    if (screen && screen !== watched) {
      watched = screen;
      new MutationObserver(() => { if (!(/** @type {HTMLElement} */ (screen)).hidden) render(); })
        .observe(screen, { attributes: true, attributeFilter: ["hidden"] });
    }
    if (screen && /** @type {HTMLElement} */ (screen).hidden) return;
    const prefs = prefsOf(store);
    const ctx = contextOf(store);
    const units = unitsOf(store);
    const items = contractsOf(store);
    const mine = yours(items);
    const offered = offers(items, prefs.sort, ctx);
    const all = [...mine, ...offered];
    if (!all.some((c) => c.id === selected)) {
      selected = all[0]?.id;
      open = false;
    }
    // where you are only sorts and labels by distance: a tenth of a km is plenty
    const key = JSON.stringify([store.get("contracts"), prefs, units, ctx.timeScale, ctx.maxSpeed, [...(ctx.attached || [])],
      ctx.from && [Math.round(ctx.from.x / 100), Math.round(ctx.from.z / 100)], selected, open]);
    if (key === drawn) return;
    drawn = key;

    machines.replaceChildren(
      pressButton("ct-seg", "With lease", prefs.mode === "lease", () => setPrefs(store, { mode: "lease" })),
      pressButton("ct-seg", "Own machines", prefs.mode === "own", () => setPrefs(store, { mode: "own" })));
    sorts.replaceChildren(...SORTS.map(([id, label]) =>
      pressButton("ct-seg", label, prefs.sort === id, () => setPrefs(store, { sort: id }))));

    const limit = store.get("contracts")?.limit;
    const taken = typeof limit === "number" ? `${mine.length} of ${limit} taken` : "";
    const children = [];
    if (mine.length) {
      children.push(h("div", { className: "ct-group" }, el("span", "ct-label", "Yours"),
        el("span", "ct-note", [taken, mine.length > 1 ? "nearest deadline first" : ""].filter(Boolean).join(" · "))),
      ...mine.map((c) => row(c, ctx, units)));
    }
    children.push(h("div", { className: "ct-group" }, el("span", "ct-label", "On offer"),
      el("span", "ct-note", [String(offered.length), prefs.mode === "own" ? "with your own machines" : "with lease",
        mine.length ? "" : taken].filter(Boolean).join(" · "))),
    ...offered.map((c) => row(c, ctx, units)));
    if (!all.length) {
      children.push(el("p", "ct-empty", store.get("contracts") ? "No contracts on offer right now."
        : "No contracts from the game yet."));
    }
    list.replaceChildren(...children);

    const shown = all.find((c) => c.id === selected);
    root.dataset.open = String(open && !!shown);
    detail.hidden = !shown;
    if (shown) drawDetail(shown, ctx, units);
    else detail.replaceChildren();
  }

  for (const topic of ["contracts", "contractPrefs", "env", "vehicles", "cab", "player"]) store.subscribe(topic, render);
  // from the map's popup or a field panel's row: open on that contract
  store.subscribe("goto", (/** @type {any} */ go) => {
    if (go?.contract === undefined || go.contract === selected && open) return;
    if (!contractsOf(store).some((c) => c.id === go.contract)) return;
    pick(go.contract);
    // once drawn: the page may still be hidden now, and draws as it's shown
    setTimeout(() => list.querySelector(`.ct-row[data-id="${CSS.escape(String(go.contract))}"]`)
      ?.scrollIntoView({ block: "nearest" }), 0);
  });
  return root;
}
