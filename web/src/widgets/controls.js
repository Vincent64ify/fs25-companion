// @ts-check
// The control column's buttons by id (ui/control.js), each reading its
// state from what the mod sends: the cab topic (sent the frame a switch
// changes) where it has the value, else the vehicles topic. A control with
// an action sends it on a tap (connection.js sendCommand). A theme lists
// them in labelled groups; on foot, or without the data, a control is
// unavailable.

import { createControl } from "../ui/control.js";
import { cabOf, controlledVehicle, cruiseOf, implementsOf, lightsOf, ptoOf } from "../data/selectors.js";
import { sendCommand } from "../connection.js";
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
 * @property {string} [action] the command a tap sends (backend
 *   protocol.COMMAND_ACTIONS); without one the control only shows the state
 * @property {(v: import("../types.js").Vehicle|undefined, cab: import("../types.js").Cab|undefined) => import("../ui/control.js").ControlDots|undefined} [dots]
 *   steps shown as dots under the label
 */

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
const anyImpl = (/** @type {(i: any) => boolean} */ test) => (/** @type {any} */ v) =>
  (impls(v).length ? impls(v).some(test) : undefined);

/** @type {Record<string, ControlDef>} */
export const CONTROLS = {
  lights: { label: "Lights", icon: "lights", read: light("on"), action: "lights.toggle", dots: lightStageDots },
  highBeam: { label: "High beam", icon: "highBeam", read: light("high") },
  beacon: { label: "Beacon", icon: "beacon", read: light("beacon") },
  hazard: { label: "Hazard", icon: "hazard", tint: "alarm", read: light("hazard") },
  turnLeft: { label: "Turn L", icon: "turnLeft", tint: "ok", read: light("left") },
  turnRight: { label: "Turn R", icon: "turnRight", tint: "ok", read: light("right") },
  engineOn: { label: "Engine", icon: "engineOn", read: (v, cab) => {
    const src = cab ? (cab.inVehicle ? cab : undefined) : v;
    return src && typeof src.engineOn === "boolean" ? src.engineOn : undefined;
  } },
  cruise: { label: "Cruise", icon: "cruise", read: (v, cab) => {
    const c = cab ? (cab.inVehicle ? cab.cruise : undefined) : cruiseOf(v);
    return c ? c.state !== "off" : undefined;
  } },
  aiWorker: { label: "AI worker", icon: "aiWorker", read: (v) => (v ? v.isAI === true : undefined) },
  implementRaised: { label: "Raise", icon: "hitchUp", read: anyImpl((i) => i.lowered === false) },
  implementLowered: { label: "Lower", icon: "hitchDown", read: anyImpl((i) => i.lowered === true) },
  implementOn: { label: "Work", icon: "implementOn", read: anyImpl((i) => i.turnedOn === true) },
  // unavailable without an implement that has a PTO
  pto: { label: "PTO", icon: "pto", read: ptoOf },
};

/**
 * @typedef {Object} ControlGroup
 * @property {string} label "Lights"
 * @property {string[]} controls ids in CONTROLS
 * @property {boolean} [implementName] add the first implement's name to the label
 */

/**
 * One labelled group of controls, kept up to date.
 * @param {ControlGroup} group
 * @param {Store} store
 * @param {(action: string) => Promise<import("../commands.js").CommandResult>} [send]
 */
export function controlGroup(group, store, send = sendCommand) {
  const title = h("h2", { className: "control-group-label", text: group.label });
  const items = group.controls.map((id) => {
    const def = CONTROLS[id];
    if (!def) throw new Error(`no control "${id}"`);
    const action = def.action;
    return { def, ui: createControl(def, action ? () => send(action) : undefined) };
  });
  const el = h("section", { className: "control-group" }, title,
    h("div", { className: "control-grid" }, ...items.map((i) => i.ui.el)));

  const update = () => {
    const v = controlledVehicle(store);
    const cab = cabOf(store);
    for (const { def, ui } of items) {
      const on = def.read(v, cab);
      if (def.dots) ui.setDots(on === undefined ? undefined : def.dots(v, cab));
      ui.set(on === undefined ? "unavailable" : on ? "on" : "off");
    }
    if (group.implementName) {
      const name = impls(v)[0]?.name;
      title.textContent = name ? `${group.label} · ${name}` : group.label;
    }
  };
  store.subscribe("vehicles", update);
  store.subscribe("cab", update);
  return el;
}
