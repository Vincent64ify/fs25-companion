// @ts-check
// The control column's buttons by id (ui/control.js), each reading its
// state from what the mod sends: the cab topic (sent the frame a switch
// changes) where it has the value, else the vehicles topic. A control with
// an action sends it on a tap (connection.js sendCommand). A theme lists
// them in labelled groups; on foot, or without the data, a control is
// unavailable.
//
// One button per switch (Controls C2): it shows the game's state and a tap
// sends the state it shows next (specs/0008: lights on, the next light
// stage, this tool raised), never a pair of on and off buttons; already
// there, the mod does nothing. The implement controls
// act as their keys do: on the tool the key's live event belongs to
// (cab.keys, Controls C3), which is usually the one selected in game (the
// group's label names it), but the game keeps an action only one tool has
// live whatever is selected (fold stays with the cultivator while the
// loader is selected), and the button then names that tool, by its model
// alone ("TERRIA 6040"). A control whose `moving` is true
// shows pending (a fold running) until the game reports the end state.

import { createControl } from "../ui/control.js";
import { cabOf, controlledVehicle, cruiseOf, entryModel, implementById, implementsOf, isLoaderGear, keyTool, lightsOf,
  liveTool, lowersInRig, ptoOf, rigOf, selectedInRig } from "../data/selectors.js";
import { sendCommand } from "../connection.js";
import { speedToKmh, speedUnit, speedValue, unitsOf } from "../data/units.js";
import { h } from "../ui/dom.js";

/** @typedef {import("../store.js").Store} Store */
/** @typedef {import("../ui/control.js").ControlState} ControlState */

/**
 * @typedef {Object} ControlDef
 * @property {string} label
 * @property {string} icon a name in ui/icons.js
 * @property {"ok"|"alarm"} [tint]
 * @property {(v: import("../types.js").Vehicle|undefined, cab: import("../types.js").Cab|undefined) => boolean|undefined} read
 *   on or off; undefined: unavailable. cab: the cab topic, when the mod
 *   sends it (mod 0.5.0 and later)
 * @property {string} [action] the command a tap sends (a key of the mod's
 *   Commands.ACTIONS); without one the control only shows the state
 * @property {(v: import("../types.js").Vehicle|undefined, cab: import("../types.js").Cab|undefined) => import("../ui/control.js").ControlDots|undefined} [dots]
 *   steps shown as dots under the label
 * @property {(v: import("../types.js").Vehicle|undefined, cab: import("../types.js").Cab|undefined) => boolean|undefined} [moving]
 *   the game is still getting there (a fold running): shown as pending
 * @property {{ms: number, key?: (v: any, cab: any) => string, hint?: string, quiet?: string[]}} [settle]
 *   stay pending after the ack until the game's state changes (key; by
 *   default the control's own state), at most ms (ui/control.js)
 * @property {(v: any, cab: any, units: import("../data/units.js").Units, store: Store) => string|undefined} [value]
 *   a value line under the label
 * @property {(v: any, cab: any) => {label: string, icon?: string}|undefined} [labels]
 *   the label (and icon) for the game's state: what a tap will do, as the
 *   game's help names it ("Raise" while lowered)
 * @property {boolean} [progressive] "Raising…" while its command runs
 * @property {-1|1} [hold] a held step: the cruise set speed down or up
 *   (cruise.set with the target, see cruiseStepper)
 * @property {(v: any, cab: any) => Sent} [send] what a tap sends with its
 *   action: the state it wants next (specs/0008) and the tool it's for
 *   (Detach: the selected tool's id as its value)
 */

/** @typedef {{value?: number, tool?: number}} Sent */

/** the light switches from the cab when the mod sends it, else from vehicles */
const lightsFrom = (/** @type {any} */ v, /** @type {any} */ cab) =>
  (cab ? (cab.inVehicle ? lightsOf(cab) : undefined) : lightsOf(v));

/** @param {keyof NonNullable<ReturnType<typeof lightsOf>>} key */
const light = (key) => (/** @type {any} */ v, /** @type {any} */ cab) => {
  const l = lightsFrom(v, cab);
  return l ? l[key] === true : undefined;
};

/**
 * The light key's stages as dots: one per stage the vehicle has (two to
 * six), lit up to the current one. None when the mod can't read them.
 * @returns {import("../ui/control.js").ControlDots|undefined}
 */
export function lightStageDots(/** @type {any} */ v, /** @type {any} */ cab) {
  const l = lightsFrom(v, cab);
  const stages = l && l.stages;
  if (!Number.isInteger(stages) || stages < 2 || stages > 6) return undefined;
  const stage = l.stage;
  if (Number.isInteger(stage) && stage >= 0 && stage <= stages) return { lit: stage, count: stages };
  // a stage the mod couldn't match: lit as far as it knows
  return { lit: l.on ? 1 : 0, count: stages };
}
const impls = (/** @type {any} */ v) => implementsOf(v);

/**
 * The implement the implement controls act on: the cab's selected one, or
 * (without the cab, older mods) the first in the vehicles topic.
 * @returns {import("../types.js").SelectedImplement|undefined}
 */
export function selectedImplement(/** @type {any} */ v, /** @type {any} */ cab) {
  if (cab) return cab.inVehicle ? cab.implement || undefined : undefined;
  const first = impls(v)[0];
  return first ? { name: first.name, lowered: first.lowered === true, turnedOn: first.turnedOn === true } : undefined;
}

/**
 * The tool an implement key acts on: the attached tool its live event
 * belongs to (cab.keys), else (no tool named: an older mod, the key's
 * event on the vehicle itself, or none the mod could see) the selected
 * implement, as in C2.
 * @param {"lower"|"fold"|"turnOn"} key
 * @returns {(v: any, cab: any) => import("../types.js").SelectedImplement|undefined}
 */
export const toolFor = (key) => (v, cab) => keyTool(cab, key) || selectedImplement(v, cab);

/**
 * The tool's model under the button when the key acts on another tool than
 * the one selected in game ("Fold" · "TERRIA 6040").
 * @param {"lower"|"fold"|"turnOn"} key
 */
export const toolNote = (key) => (/** @type {any} */ v, /** @type {any} */ cab) => {
  const tool = keyTool(cab, key);
  const selected = selectedInRig(cab);
  return tool && selected && tool.id !== selected.id ? entryModel(tool, v) : undefined;
};

/**
 * An Implement screen key (the pipe, unloading, the cover) on the rig
 * entries `has` accepts: on or off, from `on`; unavailable without such a
 * tool, and while the game has the key off (the help line doesn't offer
 * it) unless it's on. Its note names the tool when it isn't the selected
 * one.
 * @param {string} key cab.keys' name
 * @param {(e: import("../types.js").RigEntry) => boolean} has
 * @param {(e: any) => boolean} on
 */
function rigKey(key, has, on) {
  const tool = (/** @type {any} */ cab) => liveTool(cab, key, has);
  return {
    tool: (/** @type {any} */ cab) => tool(cab).tool,
    read: (/** @type {any} */ _v, /** @type {any} */ cab) => {
      const { tool: t, live } = tool(cab);
      if (!t) return undefined;
      const state = on(t) === true;
      return live || state ? state : undefined;
    },
    value: (/** @type {any} */ v, /** @type {any} */ cab) => {
      const t = tool(cab).tool;
      const selected = selectedInRig(cab);
      return t && selected && t.id !== selected.id ? entryModel(t, v) : undefined;
    },
  };
}
const pipeKey = rigKey("pipe", (e) => !!e.pipe, (e) => e.pipe.out);
const unloadKey = rigKey("unload", (e) => typeof e.discharging === "boolean" && (e.trailer === true || !!e.pipe),
  (e) => e.discharging);
const coverKey = rigKey("cover", (e) => !!e.cover, (e) => e.cover.open);
const strawKey = rigKey("straw", (e) => !!e.straw, (e) => e.straw.swath);

/** the tools Lower all moves: every one the game lets lower, not loader gear */
const lowerable = (/** @type {any} */ v, /** @type {any} */ cab) => rigOf(cab).filter((e) => lowersInRig(e, v));

/**
 * Whether the lower key's tool is a front loader or one of its tools: no
 * lowered or raised for those (specs/0002). The cab's selected implement
 * has no id, so it goes by the game's selection in the rig.
 */
const lowerKeyOnLoader = (/** @type {any} */ v, /** @type {any} */ cab) => {
  const tool = toolFor("lower")(v, cab);
  const entry = tool && typeof (/** @type {any} */ (tool).id) === "number" ? tool : selectedInRig(cab);
  return !!entry && isLoaderGear(/** @type {any} */ (entry), implementById(v, /** @type {any} */ (entry).id));
};

/** the name the Implement group's label shows: the game's selection */
export function selectedName(/** @type {any} */ v, /** @type {any} */ cab) {
  const selected = selectedInRig(cab);
  if (selected) return selected.name;
  return selectedImplement(v, cab)?.name;
}

/** a switch: the other state from the one it shows (1 on, 0 off) */
const flip = (/** @type {ControlDef["read"]} */ read) =>
  (/** @type {any} */ v, /** @type {any} */ cab) => ({ value: read(v, cab) ? 0 : 1 });

/**
 * The Lights button: the next stage after the one its dots show, off after
 * the last (the game's light key, C1); without stages, on or off.
 * @returns {Sent}
 */
export function nextLightStage(/** @type {any} */ v, /** @type {any} */ cab) {
  const l = lightsFrom(v, cab);
  if (l && Number.isInteger(l.stages) && Number.isInteger(l.stage)) return { value: (l.stage + 1) % (l.stages + 1) };
  return { value: l?.on ? 0 : 1 };
}

/** the rig id of the tool an implement key acts on, else the selected one */
const toolIdFor = (/** @type {"lower"|"fold"|"turnOn"} */ key, /** @type {any} */ cab) =>
  keyTool(cab, key)?.id ?? selectedInRig(cab)?.id;

/** the cab's value, or the vehicles topic's without the cab */
const either = (/** @type {any} */ v, /** @type {any} */ cab, /** @type {(src: any) => any} */ pick) =>
  (cab ? (cab.inVehicle ? pick(cab) : undefined) : (v ? pick(v) : undefined));
const bool = (/** @type {any} */ x) => (typeof x === "boolean" ? x : undefined);

/** what's attached, as a key that changes when an implement comes or goes */
function attachedSet(/** @type {any} */ v, /** @type {any} */ cab) {
  if (cab) return cab.inVehicle ? `${(cab.implements || []).length}:${cab.implement?.name ?? ""}` : "";
  return impls(v).map((/** @type {any} */ i) => i.name).join("|");
}

/**
 * The cruise control's set speed ("15 km/h"): the one the game holds when
 * cruise control is on. (There's no reverse one to show: live, vehicles
 * use this one in reverse, and the HUD's number while reversing is
 * something else; see mod/src/Commands.lua.)
 * @returns {string|undefined}
 */
export function cruiseSetSpeed(/** @type {any} */ v, /** @type {any} */ cab,
  /** @type {import("../data/units.js").Units} */ units, /** @type {Store|undefined} */ store = undefined) {
  const now = cruiseNow(v, cab);
  if (!now) return undefined;
  // while −/+ are held: the speed asked for, before the game confirms it
  const target = store?.get("cruiseTarget");
  const kmh = typeof target?.kmh === "number" ? target.kmh : now.kmh;
  return `${Math.round(speedValue(kmh, units))} ${speedUnit(units)}`;
}

/** the set speed (km/h) and the highest one */
function cruiseNow(/** @type {any} */ v, /** @type {any} */ cab) {
  const c = cab ? (cab.inVehicle ? cab.cruise : undefined) : cruiseOf(v);
  if (!c || typeof c.speed !== "number") return undefined;
  return { kmh: c.speed, max: typeof c.maxSpeed === "number" ? c.maxSpeed : 250 };
}

export const CRUISE_SEND_MS = 50;
export const CRUISE_SETTLE_MS = 1500;

/**
 * The cruise −/+ buttons, shared per store. Each tick moves a target one
 * step (1 km/h or 1 mph) from the set speed in use, shown at once on the
 * Cruise button (store key cruiseTarget, pending), and sends it as an
 * absolute cruise.set at most every 50 ms, one at a time, latest wins.
 * The target goes once the game's speed matches it after the release, or
 * 1.5 s after the last answer.
 * @param {Store} store
 * @param {(action: string, value?: number) => Promise<import("../commands.js").CommandResult>} send
 */
export function cruiseStepper(store, send) {
  /** @type {number|undefined} km/h */
  let target;
  let held = 0;
  let inflight = false;
  let dirty = false;
  let lastSent = -Infinity;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let sendTimer;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let clearTimer;
  const now = () => cruiseNow(controlledVehicle(store), cabOf(store));
  const publish = () => store.set("cruiseTarget", target === undefined ? undefined : { kmh: target });
  const drop = () => { clearTimeout(clearTimer); target = undefined; publish(); };
  const idle = () => !held && !inflight && !dirty;

  async function flush() {
    if (target === undefined) return;
    if (inflight) { dirty = true; return; }
    const wait = CRUISE_SEND_MS - (performance.now() - lastSent);
    if (wait > 0) {
      clearTimeout(sendTimer);
      sendTimer = setTimeout(flush, wait);
      return;
    }
    inflight = true;
    dirty = false;
    lastSent = performance.now();
    const result = await send("cruise.set", Math.round(target * 1000) / 1000);
    inflight = false;
    if (!result.ok) { dirty = false; drop(); return; }
    if (dirty) flush();
    else if (idle()) settle();
  }

  function settle() {
    clearTimeout(clearTimer);
    const cur = now();
    if (!cur || target === undefined || Math.abs(cur.kmh - target) < 0.05) { drop(); return; }
    clearTimer = setTimeout(drop, CRUISE_SETTLE_MS);
  }

  store.subscribe("cab", () => {
    if (target !== undefined && idle()) {
      const cur = now();
      if (cur && Math.abs(cur.kmh - target) < 0.05) drop();
    }
  });

  return {
    /** @param {-1|1} dir */
    tick(dir) {
      const cur = now();
      if (!cur) return;
      clearTimeout(clearTimer);
      const units = unitsOf(store);
      const shown = speedValue(target ?? cur.kmh, units);
      // one step from the number on the button, in the player's unit
      const next = Math.max(1, Math.round(shown) + dir);
      // never past the vehicle's top set speed: the game wouldn't go there
      target = Math.min(cur.max, speedToKmh(next, units));
      publish();
      flush();
    },
    start: () => { held += 1; },
    end() {
      held = Math.max(0, held - 1);
      if (idle()) settle();
    },
  };
}

/** @type {WeakMap<object, ReturnType<typeof cruiseStepper>>} */
const steppers = new WeakMap();

/** @type {Record<string, ControlDef>} */
export const CONTROLS = {
  lights: { label: "Lights", icon: "lights", read: light("on"), action: "lights.set", dots: lightStageDots,
    send: nextLightStage },
  highBeam: { label: "High beam", icon: "highBeam", read: light("high"), action: "highBeam.set", send: flip(light("high")) },
  beacon: { label: "Beacon", icon: "beacon", read: light("beacon"), action: "beacon.set", send: flip(light("beacon")) },
  hazard: { label: "Hazard", icon: "hazard", tint: "alarm", read: light("hazard"), action: "hazard.set",
    send: flip(light("hazard")) },
  turnLeft: { label: "Turn L", icon: "turnLeft", tint: "ok", read: light("left"), action: "turnLeft.set",
    send: flip(light("left")) },
  turnRight: { label: "Turn R", icon: "turnRight", tint: "ok", read: light("right"), action: "turnRight.set",
    send: flip(light("right")) },
  // starting takes a few seconds in game: pending until it runs (a tap
  // meanwhile asks for on again: already on its way)
  engineOn: { label: "Engine", icon: "engineOn", action: "engine.set",
    read: (v, cab) => either(v, cab, (src) => bool(src.engineOn)),
    send: (v, cab) => ({ value: CONTROLS.engineOn.read(v, cab) ? 0 : 1 }),
    moving: (v, cab) => cab?.inVehicle === true && cab.engineState === "starting",
    settle: { ms: 10000 } },
  cruise: { label: "Cruise", icon: "cruise", action: "cruiseOn.set", read: (v, cab) => {
    const c = cab ? (cab.inVehicle ? cab.cruise : undefined) : cruiseOf(v);
    return c ? c.state !== "off" : undefined;
  }, send: (v, cab) => ({ value: CONTROLS.cruise.read(v, cab) ? 0 : 1 }), value: cruiseSetSpeed },
  // held: the set speed down or up, a step per tick; never "on"
  cruiseDown: { label: "Cruise −", icon: "cruiseDown", action: "cruise.set", hold: -1,
    read: (v, cab) => (CONTROLS.cruise.read(v, cab) === undefined ? undefined : false) },
  cruiseUp: { label: "Cruise +", icon: "cruiseUp", action: "cruise.set", hold: 1,
    read: (v, cab) => (CONTROLS.cruise.read(v, cab) === undefined ? undefined : false) },
  aiWorker: { label: "AI worker", icon: "aiWorker", action: "ai.set",
    read: (v, cab) => either(v, cab, (src) => (cab ? bool(src.aiActive) : src.isAI === true)),
    send: (v, cab) => ({ value: CONTROLS.aiWorker.read(v, cab) ? 0 : 1 }) },
  // the selected implement
  // the label is what a tap will do, as the game's help says it; lit: the
  // state ("Raise", lit, while lowered)
  implementLowered: { label: "Lower", icon: "hitchDown", action: "tool.lower", progressive: true,
    read: (v, cab) => {
      const i = toolFor("lower")(v, cab);
      return i && i.canLower !== false && !lowerKeyOnLoader(v, cab) ? i.lowered === true : undefined;
    },
    labels: (v, cab) => (toolFor("lower")(v, cab)?.lowered
      ? { label: "Raise", icon: "hitchUp" } : { label: "Lower", icon: "hitchDown" }),
    send: (v, cab) => ({ value: toolFor("lower")(v, cab)?.lowered ? 0 : 1, tool: toolIdFor("lower", cab) }),
    value: toolNote("lower") },
  // value 1: folded
  fold: { label: "Unfold", icon: "fold", action: "tool.fold", progressive: true, read: (v, cab) => {
    const i = toolFor("fold")(v, cab);
    return i && i.foldable ? i.unfolded === true : undefined;
  }, moving: (v, cab) => toolFor("fold")(v, cab)?.foldMoving === true,
  value: toolNote("fold"),
  send: (v, cab) => ({ value: toolFor("fold")(v, cab)?.unfolded ? 1 : 0, tool: toolIdFor("fold", cab) }),
  labels: (v, cab) => {
    const i = toolFor("fold")(v, cab);
    // a fold started in game: which way it goes is a guess from where it was
    if (i?.foldMoving) return { label: i.unfolded ? "Folding…" : "Unfolding…" };
    return { label: i?.unfolded ? "Fold" : "Unfold" };
  } },
  implementOn: { label: "Work", icon: "implementOn", action: "tool.turnOn", read: (v, cab) => {
    const i = toolFor("turnOn")(v, cab);
    return i && (!cab || i.canTurnOn) ? i.turnedOn === true : undefined;
  }, value: toolNote("turnOn"),
  send: (v, cab) => ({ value: toolFor("turnOn")(v, cab)?.turnedOn ? 0 : 1, tool: toolIdFor("turnOn", cab) }) },
  // Attach (specs/0003): the attach key (Q), faded until the game has
  // something in reach (its own Attach prompt is up), then it attaches
  // that; pending until what's attached changes. Detaching is each card's.
  attach: { label: "Attach", icon: "hitch", action: "hitch.toggle",
    read: (v, cab) => (cab?.inVehicle && cab.attachable === true ? false : undefined),
    settle: { ms: 1500, key: attachedSet, hint: "None in reach", quiet: ["nothing in reach"] } },
  // a status, not a button: unavailable without an implement that has a PTO
  pto: { label: "PTO", icon: "pto", read: ptoOf },
  // the Implement screen's keys, each asking for the state its label names:
  // Ctrl+V lowers or raises every tool (lit while one is lowered), O the
  // pipe, I tips a trailer (Ctrl+I to the ground where only that is live),
  // N the cover (a one-shot), and the combine's straw
  lowerAll: { label: "Lower all", icon: "lowerAll", action: "implement.lowerAll", progressive: true,
    read: (v, cab) => {
      const tools = lowerable(v, cab);
      return tools.length ? tools.some((e) => e.lowered) : undefined;
    },
    labels: (v, cab) => (lowerable(v, cab).some((e) => e.lowered) ? { label: "Raise all" } : { label: "Lower all" }),
    send: (v, cab) => ({ value: lowerable(v, cab).some((e) => e.lowered) ? 0 : 1 }) },
  pipe: { label: "Pipe out", icon: "pipe", action: "tool.pipe", read: pipeKey.read, value: pipeKey.value,
    send: (v, cab) => {
      const t = pipeKey.tool(cab);
      return { value: t?.pipe?.out ? 0 : 1, tool: t?.id };
    },
    moving: (v, cab) => pipeKey.tool(cab)?.pipe?.moving === true,
    labels: (v, cab) => ({ label: pipeKey.tool(cab)?.pipe?.out ? "Pipe in" : "Pipe out" }) },
  unload: { label: "Unload", icon: "unload", action: "tool.tip", read: unloadKey.read, value: unloadKey.value,
    send: (v, cab) => {
      const t = unloadKey.tool(cab);
      return { value: t?.discharging ? 0 : 1, tool: t?.id };
    },
    labels: (v, cab) => ({ label: unloadKey.tool(cab)?.trailer ? "Tipping" : "Unload" }) },
  cover: { label: "Uncover", icon: "cover", action: "implement.cover", read: coverKey.read, value: coverKey.value,
    labels: (v, cab) => ({ label: coverKey.tool(cab)?.cover?.open ? "Cover" : "Uncover" }) },
  // a combine's threshing: its own turn on (B, as the game's help says
  // "Turn on harvester"), lit while it threshes
  thresher: { label: "Thresher", icon: "implementOn", action: "tool.turnOn", read: (v, cab) => {
    const head = rigOf(cab).find((e) => e.depth === 0);
    return head?.canTurnOn ? head.turnedOn === true : undefined;
  }, send: (v, cab) => {
    const head = rigOf(cab).find((e) => e.depth === 0);
    return { value: head?.turnedOn ? 0 : 1, tool: head?.id };
  } },
  // a combine's straw (the game's TOGGLE_CHOPPER): lit while it lays a swath
  straw: { label: "Straw swath", icon: "straw", action: "straw.set", read: strawKey.read,
    value: strawKey.value, send: (v, cab) => ({ value: strawKey.tool(cab)?.straw?.swath ? 0 : 1 }) },
  // the selected tool, from what it hangs on
  detach: { label: "Detach", icon: "hitch", action: "implement.detach",
    send: (v, cab) => ({ value: selectedInRig(cab)?.id }),
    read: (v, cab) => {
      const selected = selectedInRig(cab);
      return selected && selected.depth > 0 ? false : undefined;
    },
    settle: { ms: 1500, key: attachedSet } },
};

/**
 * A state tile (the Harvester screen's cards): a control from CONTROLS
 * grown into a tile, its caption, the icon and the state in big type. It
 * reads and sends what that control does; lit while on, unless `lit` is
 * false (Straw and Fold show which, not on or off).
 * @typedef {Object} TileDef
 * @property {string} control its id in CONTROLS
 * @property {string} caption "Thresher"
 * @property {string} [icon] in place of the control's
 * @property {(v: any, cab: any) => string} state "On", "In", "Swath"
 * @property {false} [lit]
 * @property {(v: any, cab: any) => boolean} [shown] hidden when false
 */

/** @type {Record<string, TileDef>} */
export const TILES = {
  thresher: { control: "thresher", caption: "Thresher",
    state: (v, cab) => (rigOf(cab).find((e) => e.depth === 0)?.turnedOn ? "On" : "Off") },
  pipe: { control: "pipe", caption: "Pipe", shown: (v, cab) => !!pipeKey.tool(cab),
    state: (v, cab) => {
      const p = pipeKey.tool(cab)?.pipe;
      return p?.moving ? "Moving" : p?.out ? "Out" : "In";
    } },
  // only a combine that can both swath and chop
  straw: { control: "straw", caption: "Straw", lit: false, shown: (v, cab) => !!strawKey.tool(cab),
    state: (v, cab) => (strawKey.tool(cab)?.straw?.swath ? "Swath" : "Chop") },
  header: { control: "implementLowered", caption: "Header", icon: "hitchDown",
    state: (v, cab) => (toolFor("lower")(v, cab)?.lowered ? "Down" : "Up") },
  fold: { control: "fold", caption: "Fold", lit: false, shown: (v, cab) => toolFor("fold")(v, cab)?.foldable === true,
    state: (v, cab) => {
      const i = toolFor("fold")(v, cab);
      return i?.foldMoving ? "Folding…" : i?.unfolded ? "Unfolded" : "Folded";
    } },
};

/** @typedef {(action: string, value?: number, tool?: number) => Promise<import("../commands.js").CommandResult>} Send */

/**
 * A control's tap: its action with what it sends now.
 * @param {ControlDef} def @param {Store} store @param {Send} send
 */
const pressOf = (def, store, send) => () => {
  const out = def.send?.(controlledVehicle(store), cabOf(store)) ?? {};
  return send(/** @type {string} */ (def.action), out.value, out.tool);
};

/**
 * State tiles, kept up to date: one tap sends the control's action.
 * @param {string[]} ids in TILES
 * @param {Store} store
 * @param {Send} [send]
 */
export function controlTiles(ids, store, send = sendCommand) {
  const items = ids.map((id) => {
    const tile = TILES[id];
    if (!tile) throw new Error(`no tile "${id}"`);
    const def = CONTROLS[tile.control];
    const press = def.action ? pressOf(def, store, send) : undefined;
    const ui = createControl({ label: tile.caption, icon: tile.icon || def.icon }, press);
    ui.el.classList.add("control-tile");
    ui.el.dataset.tile = id;
    return { tile, def, ui };
  });
  const el = h("div", { className: "control-tiles" }, ...items.map((i) => i.ui.el));

  const update = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    let shown = 0;
    for (const { tile, def, ui } of items) {
      ui.el.hidden = tile.shown ? !tile.shown(v, cab) : false;
      if (!ui.el.hidden) shown += 1;
      const on = def.read(v, cab);
      const moving = on !== undefined && def.moving?.(v, cab) === true;
      ui.setValue(on === undefined ? "–" : tile.state(v, cab));
      ui.set(on === undefined ? "unavailable" : moving ? "pending" : on && tile.lit !== false ? "on" : "off");
    }
    el.dataset.count = String(shown);
  };
  store.subscribe("vehicles", update);
  store.subscribe("cab", update);
  return el;
}

/**
 * @typedef {Object} ControlGroup
 * @property {string} label "Lights"
 * @property {string[]} controls ids in CONTROLS
 * @property {boolean} [implementName] add the selected implement's name to the label
 */

/**
 * One labelled group of controls, kept up to date.
 * @param {ControlGroup} group
 * @param {Store} store
 * @param {Send} [send]
 */
export function controlGroup(group, store, send = sendCommand) {
  let stepper = steppers.get(store);
  if (!stepper && group.controls.some((id) => CONTROLS[id]?.hold)) {
    stepper = cruiseStepper(store, send);
    steppers.set(store, stepper);
  }
  const title = h("h2", { className: "control-group-label", text: group.label });
  const items = group.controls.map((id) => {
    const def = CONTROLS[id];
    if (!def) throw new Error(`no control "${id}"`);
    const action = def.action;
    const settle = def.settle && {
      ms: def.settle.ms, hint: def.settle.hint, quiet: def.settle.quiet,
      key: () => {
        const v = controlledVehicle(store);
        const cab = cabOf(store);
        return def.settle?.key ? def.settle.key(v, cab) : String(def.read(v, cab));
      },
    };
    const dir = def.hold;
    const hold = dir && stepper ? {
      tick: () => stepper?.tick(dir),
      end: () => stepper?.end(),
    } : undefined;
    if (hold && stepper) {
      const tick = hold.tick;
      let down = false;
      hold.tick = () => { if (!down) { down = true; stepper?.start(); } tick(); };
      const end = hold.end;
      hold.end = () => { if (down) { down = false; end(); } };
    }
    const press = action && !hold ? pressOf(def, store, send) : undefined;
    const ui = createControl(def, press, settle, hold);
    // the theme can size one (Engine is two columns wide in Drive)
    ui.el.dataset.control = id;
    return { def, ui };
  });
  const el = h("section", { className: "control-group" }, title,
    h("div", { className: "control-grid" }, ...items.map((i) => i.ui.el)));

  const update = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    for (const { def, ui } of items) {
      const on = def.read(v, cab);
      if (def.dots) ui.setDots(on === undefined ? undefined : def.dots(v, cab));
      const moving = on !== undefined && (def.moving ? def.moving(v, cab) === true
        : def === CONTROLS.cruise ? store.get("cruiseTarget") !== undefined : false);
      if (def.value) ui.setValue(on === undefined ? undefined : def.value(v, cab, unitsOf(store), store));
      if (def.labels && on !== undefined) {
        const l = def.labels(v, cab);
        if (l) ui.setLabel(l.label, l.icon);
      }
      ui.set(on === undefined ? "unavailable" : moving ? "pending" : on ? "on" : "off");
    }
    if (group.implementName) {
      const name = selectedName(v, cab);
      title.textContent = name ? `${group.label} · ${name}` : group.label;
    }
  };
  store.subscribe("vehicles", update);
  store.subscribe("cab", update);
  store.subscribe("env", update);
  store.subscribe("cruiseTarget", update);
  return el;
}
