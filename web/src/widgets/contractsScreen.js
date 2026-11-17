// @ts-check
// The Contracts page (specs/0018-contracts.md): on the left the switches
// (With lease / Own machines, the sort) over the list, Yours then On offer;
// beside them the detail of the row you tapped, in two columns (Money and
// Time; Progress or Work, then the vehicles). The numbers are
// data/contracts.js's. Under 900 wide or in portrait the detail opens over
// the list, with a Back button.
//
// At the detail's foot, from mod 0.20.0 (hello.commands.actions 4), one
// button by what the contract is (specs/0019-contract-actions.md): Accept,
// Cancel contract or Hand in, with a line beside it that says what the tap
// does or why it's faded. Pending from touch-down until the mod answers,
// "Failed" on the button when it says no; Cancel asks once more.
//
// The topic arrives every 2 s: the page is drawn again only when what it
// shows changed, and the list keeps its scroll. While another screen shows
// it does nothing (the player's place arrives ten times a second); it
// draws when it's shown again.

import {
  contextOf, contractsOf, deliveredToGo, delivers, fieldWorked, figures, finalSums, FINISH_WORDS, gameLeftText, goods,
  hasLease, hoursText, jobOf, litresText, neededLiters, offerGroups, SETUP_MINUTES, TRAVEL_KMH, pctText, placeOf, prefsOf, setPrefs, SORTS, speedText,
  statLine, successFactor, titleOf, workRate, yours, action,
} from "../data/contracts.js";
import { sendCommand } from "../connection.js";
import { ERROR_SHOWN_MS } from "../ui/control.js";
import { areaText, areaUnit, areaValue, lengthText, moneyText, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/** @typedef {import("../types.js").Contract} Contract */
/** @typedef {import("../types.js").ContractVehicle} ContractVehicle */
/** @typedef {import("../data/contracts.js").Context} Context */
/** @typedef {import("../data/contracts.js").Figures} Figures */
/** @typedef {import("../data/units.js").Units} Units */

const KM_PER_MILE = 1.609344;
/** how long "Really cancel?" waits for the second tap (specs/0019) */
export const CONFIRM_MS = 4000;
/**
 * how long a contract's button ignores taps after it turned into another
 * kind (Cancel contract into Hand in when the game's answer comes back): a
 * quick extra tap on "Really cancel?" must not hand it in (specs/0019)
 */
export const KIND_SETTLE_MS = 700;

/** "1.9 km" or "1.2 mi". @param {number} metres @param {Units} u */
export const distanceText = (metres, u) => (u.miles ? `${(metres / 1000 / KM_PER_MILE).toFixed(1)} mi` : `${(metres / 1000).toFixed(1)} km`);

/** @param {string} tag @param {string} className @param {string} [text] */
const el = (tag, className, text) => h(tag, text === undefined ? { className } : { className, text });

/**
 * The way there, for the Work section: "The way there ≈ 3 min (1.4 km
 * from the shop at 30 km/h). "; nothing without one.
 * @param {Figures} f @param {Units} units
 */
function travelWords(f, units) {
  if (f.travelHours === undefined || f.travelMetres === undefined) return "";
  const from = { shop: "from the shop", tool: "from your tool", you: "from you" }[f.travelFrom || "you"];
  const speed = `${Math.round(speedValue(TRAVEL_KMH, units))} ${speedUnit(units)}`;
  return `The way there ≈ ${hoursText(f.travelHours)} (${distanceText(f.travelMetres, units)} ${from} at ${speed}). `;
}

/**
 * The best of a type by the sort, for its header: "best £9,150/h",
 * "soonest 5 h 10 min", "nearest 0.8 km"; nothing without the number.
 * @param {Contract} c the type's first contract @param {string} sort @param {Context} ctx @param {Units} units
 */
function bestText(c, sort, ctx, units) {
  const f = figures(c, ctx);
  if (sort === "hour") return f.perHour !== undefined ? `best ${moneyText(f.perHour, units)}/h` : "";
  if (sort === "net") return f.net !== undefined ? `best ${moneyText(f.net, units)}` : "";
  if (sort === "left") return typeof c.minutesLeft === "number" ? `soonest ${gameLeftText(c.minutesLeft)}` : "";
  return f.metres !== undefined ? `nearest ${distanceText(f.metres, units)}` : "";
}

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
  /** @type {{send?: typeof sendCommand, confirmMs?: number, failedMs?: number, settleMs?: number}} */
  const o = /** @type {any} */ (opts);
  const send = o.send || sendCommand;
  const confirmMs = o.confirmMs ?? CONFIRM_MS;
  const failedMs = o.failedMs ?? ERROR_SHOWN_MS;
  const settleMs = o.settleMs ?? KIND_SETTLE_MS;
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
  // the action row (specs/0019): the contract whose command is out (no
  // tap on it until the answer, whatever its button turns into meanwhile),
  // the one asking "Really cancel?", the one whose tap failed (shown on
  // that kind of button only)
  let pendingId = /** @type {string|undefined} */ (undefined);
  let confirmId = /** @type {string|undefined} */ (undefined);
  let failed = /** @type {{id: string, kind: string, reason: string}|undefined} */ (undefined);
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let confirmTimer;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let failedTimer;
  /** the button drawn last: its contract, its kind, and since when that kind (0: since the contract was opened) */
  let shownKind = /** @type {{id: string, kind: string, at: number}|undefined} */ (undefined);
  /** whether the mod takes contract commands: hello.commands.actions 4 (mod 0.20.0) */
  const acts = () => {
    const n = store.get("hello")?.commands?.actions;
    return typeof n === "number" && n >= 4;
  };

  const pick = (/** @type {string} */ id) => {
    selected = id;
    open = true;
    render();
  };

  /**
   * A type's header in the On offer list: its name, how many, the best by
   * the sort. A tap folds its contracts away or shows them again; all are
   * shown until you fold one, and the choice is remembered.
   * @param {{type: string, title: string, items: Contract[]}} group @param {boolean} shut @param {string} best
   */
  function typeHeader(group, shut, best) {
    const b = h("button", { className: "ct-type" }, h("span", { className: "ct-type-mark" }),
      el("span", "ct-label", group.title), el("span", "ct-note", [String(group.items.length), best].filter(Boolean).join(" · ")));
    b.setAttribute("type", "button");
    b.setAttribute("aria-expanded", String(!shut));
    b.dataset.type = group.type;
    b.addEventListener("click", () => {
      const now = new Set(prefsOf(store).closed || []);
      if (now.has(group.type)) now.delete(group.type);
      else now.add(group.type);
      setPrefs(store, { closed: [...now] });
    });
    return b;
  }

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
        // from mod 0.20.0 the action row's Hand in says it (specs/0019)
        acts() ? null : el("div", "ct-why", "Paid when you dismiss it in the game."));
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
    // Two times, each named: the deadline in game time, the work still to
    // do in real time (an offer's whole work is in its Work section). The
    // real time before the deadline is only said when the work won't fit.
    const tone = f.late ? "warn" : undefined;
    const running = c.status !== "offer";
    const workLeft = running && f.hoursToGo !== undefined
      ? kv("Work left · real time", `≈ ${hoursText(f.hoursToGo)}`, { strong: true, tone }) : null;
    let why = "";
    if (f.late && f.hoursToGo !== undefined && f.realMinutes !== undefined && ctx.timeScale !== undefined) {
      why = `At ${speedText(ctx.timeScale)} the deadline is ≈ ${hoursText(f.realMinutes / 60)} of real time away, and the work `
        + `${running ? "still takes" : "takes"} ≈ ${hoursText(f.hoursToGo)}: you won’t make it at this speed.`;
    }
    const whyEl = why ? el("div", "ct-why", why) : null;
    if (whyEl) whyEl.dataset.tone = "warn";
    return section("Time", kv("Deadline · game time", gameLeftText(c.minutesLeft), { strong: true, tone }), workLeft, whyEl);
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
    if (f.jobHours !== undefined) rows.push(kv("Job · real time", `≈ ${hoursText(f.jobHours)}`, { strong: true }));
    if (f.perHour !== undefined) rows.push(kv("Per hour", `${moneyText(f.perHour, units)}/h`));
    let why = "";
    const rate = workRate(f.tool, undefined);
    if (f.hours !== undefined && f.tool && job && rate !== undefined) {
      const who = f.leased ? "The leased tool" : `Your ${vehicleName(f.tool)}`;
      why = `${who}: ${lengthText(/** @type {number} */ (f.tool.workingWidth), units)} at `
        + `${Math.round(speedValue(/** @type {number} */ (f.tool.speedLimit), units))} ${speedUnit(units)} = `
        + `${areaValue(rate, units).toFixed(1)} ${areaUnit(units)}/h, × ${job.overhead} for turns, overlaps and refills: `
        + `≈ ${hoursText(f.hours)} of work. ${travelWords(f, units)}${SETUP_MINUTES} min to set up and hand in. An estimate.`;
    } else if (job && !f.leased && !f.fits.length) {
      why = hasLease(c) ? "No tool of yours fits: with lease only." : "No tool of yours fits.";
    } else if (!job || job.overhead === undefined) {
      why = "No work time for this kind of contract yet.";
    }
    const picker = !f.leased && f.fits.length > 0;
    const tools = picker ? h("div", { className: "ct-tools" }, ...f.fits.map((t) => {
      const hours = figures(c, { ...ctx, picks: { ...ctx.picks, [/** @type {{kind: string}} */ (job).kind]: t.id } }).jobHours;
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

  /**
   * A tap on the action row's button: Cancel asks first; the others, and
   * Cancel's second tap, send the command and wait for the mod.
   * @param {Contract} c @param {import("../data/contracts.js").ContractAction} act
   */
  function tap(c, act) {
    if (act.faded || pendingId !== undefined) return;
    if (shownKind && shownKind.id === c.id && performance.now() - shownKind.at < settleMs) return;
    if (act.kind === "cancel" && confirmId !== c.id) {
      confirmId = c.id;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        confirmId = undefined;
        render();
      }, confirmMs);
      render();
      return;
    }
    confirmId = undefined;
    clearTimeout(confirmTimer);
    clearTimeout(failedTimer);
    failed = undefined;
    const id = c.id;
    pendingId = id;
    render();
    Promise.resolve(send(act.command, act.value, undefined, undefined, id))
      .catch((e) => ({ ok: false, reason: String(e) }))
      .then((result) => {
        pendingId = undefined;
        if (!result.ok) {
          failed = { id, kind: act.kind, reason: result.reason || "failed" };
          failedTimer = setTimeout(() => {
            failed = undefined;
            render();
          }, failedMs);
        }
        render();
      });
  }

  /**
   * The detail's foot: what the tap does, and the one button (always the
   * same size, so it never moves).
   * @param {Contract} c @param {Units} units
   */
  function actionRow(c, units) {
    const act = action(c, store.get("contracts"), prefsOf(store), units);
    if (!shownKind || shownKind.id !== c.id || shownKind.kind !== act.kind) {
      shownKind = { id: c.id, kind: act.kind, at: shownKind?.id === c.id ? performance.now() : 0 };
    }
    const asking = act.kind === "cancel" && confirmId === c.id ? act.confirm : undefined;
    const failedHere = failed !== undefined && failed.id === c.id && failed.kind === act.kind;
    const note = el("div", "ct-act-note", asking ? asking.note : act.note);
    if (asking) note.dataset.tone = "warn";
    const button = /** @type {HTMLButtonElement} */ (el("button", "ct-do", failedHere ? "Failed" : asking ? asking.label : act.label));
    button.type = "button";
    button.dataset.kind = asking ? "warn" : act.fill ? "go" : "plain";
    if (pendingId === c.id) button.dataset.state = "pending";
    else if (failedHere) button.dataset.state = "failed";
    if (failedHere && failed) button.title = failed.reason;
    if (act.faded) button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-label", `${button.textContent}${pendingId === c.id ? ", waiting for the game" : ""}`);
    // touch-down, not click: a tap must feel instant; the keyboard clicks with detail 0
    button.addEventListener("pointerdown", (ev) => { if (ev.button === 0) tap(c, act); });
    button.addEventListener("click", (ev) => { if (ev.detail === 0) tap(c, act); });
    return h("div", { className: "ct-act" }, note, button);
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
      show.addEventListener("click", () => store.set("goto", { screen: "map", at: { x: c.x, z: c.z }, pin: c.id }));
      head.append(show);
    }
    // an offer with your own machines: the lease's one line goes under Money
    // and Time, so the tool picker and the action row fit the mini
    // (specs/0019) unscrolled
    const leaseLine = c.status === "offer" && !f.leased && hasLease(c);
    const vehicles = vehiclesSection(c, f, units);
    const left = h("div", { className: "ct-d-col" }, ...[moneySection(c, f, ctx, units), deadlineSection(c, f, ctx),
      leaseLine ? vehicles : null].filter((s) => s !== null));
    const right = h("div", { className: "ct-d-col" }, ...[
      c.status === "offer" ? workSection(c, f, ctx, units) : progressSection(c, f, ctx, units),
      leaseLine ? null : vehicles].filter((s) => s !== null));
    detail.replaceChildren(head, h("div", { className: "ct-d-cols" }, left, right), ...(acts() ? [actionRow(c, units)] : []));
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
    const groups = offerGroups(items, prefs.sort, ctx);
    const closed = new Set(prefs.closed || []);
    const offered = groups.flatMap((g) => g.items);
    const all = [...mine, ...offered];
    if (!all.some((c) => c.id === selected)) {
      selected = all[0]?.id;
      open = false;
    }
    // where you are only sorts and labels by distance: a tenth of a km is plenty
    // where your tools are only moves the way there: a tenth of a km is plenty
    const parked = (ctx.tools || []).map((t) => ctx.places?.get(t.id)).map((at) => at && [Math.round(at.x / 100), Math.round(at.z / 100)]);
    const key = JSON.stringify([store.get("contracts"), prefs, units, ctx.timeScale, ctx.maxSpeed, [...(ctx.attached || [])], parked,
      ctx.from && [Math.round(ctx.from.x / 100), Math.round(ctx.from.z / 100)], selected, open,
      acts(), pendingId, confirmId, failed]);
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
    // one button for every type: Collapse all while any is open, then Open all
    const allShut = groups.length > 0 && groups.every((g) => closed.has(g.type));
    const foldAll = groups.length ? el("button", "ct-fold-all", allShut ? "Open all" : "Collapse all") : null;
    if (foldAll) {
      foldAll.setAttribute("type", "button");
      foldAll.addEventListener("click", () => setPrefs(store, { closed: allShut ? [] : groups.map((g) => g.type) }));
    }
    children.push(h("div", { className: "ct-group" }, el("span", "ct-label", "On offer"),
      el("span", "ct-note", [String(offered.length), prefs.mode === "own" ? "with your own machines" : "with lease",
        mine.length ? "" : taken].filter(Boolean).join(" · ")), foldAll));
    for (const group of groups) {
      const shut = closed.has(group.type);
      children.push(typeHeader(group, shut, bestText(group.items[0], prefs.sort, ctx, units)));
      if (!shut) children.push(...group.items.map((c) => row(c, ctx, units)));
    }
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

  for (const topic of ["contracts", "contractPrefs", "env", "vehicles", "cab", "player", "hello"]) store.subscribe(topic, render);
  // from the map's popup or a field panel's row: open on that contract
  store.subscribe("goto", (/** @type {any} */ go) => {
    if (go?.contract === undefined || go.contract === selected && open) return;
    const wanted = contractsOf(store).find((c) => c.id === go.contract);
    if (!wanted) return;
    // a contract in a folded type: its type opens again
    const prefs = prefsOf(store);
    const type = wanted.type || wanted.title || "other";
    if (wanted.status === "offer" && (prefs.closed || []).includes(type)) {
      setPrefs(store, { closed: prefs.closed.filter((t) => t !== type) });
    }
    pick(go.contract);
    // once drawn: the page may still be hidden now, and draws as it's shown
    setTimeout(() => list.querySelector(`.ct-row[data-id="${CSS.escape(String(go.contract))}"]`)
      ?.scrollIntoView({ block: "nearest" }), 0);
  });
  return root;
}
