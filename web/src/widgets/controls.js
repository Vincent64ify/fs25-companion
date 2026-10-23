// @ts-check
// The control column's buttons by id (ui/control.js), each reading its
// state from what the mod already sends. A theme lists them in labelled
// groups; on foot, or without the data, a control is unavailable.

import { createControl } from "../ui/control.js";
import { controlledVehicle, implementsOf, lightsOf } from "../data/selectors.js";
import { h } from "../ui/dom.js";

/** @typedef {import("../store.js").Store} Store */
/** @typedef {import("../ui/control.js").ControlState} ControlState */

/**
 * @typedef {Object} ControlDef
 * @property {string} label
 * @property {string} icon a name in ui/icons.js
 * @property {"ok"|"alarm"} [tint]
 * @property {(v: import("../types.js").Vehicle|undefined) => boolean|undefined} read
 *   on or off; undefined: unavailable
 */

/** @param {keyof NonNullable<ReturnType<typeof lightsOf>>} key */
const light = (key) => (/** @type {any} */ v) => {
  const l = lightsOf(v);
  return l ? l[key] === true : undefined;
};
const impls = (/** @type {any} */ v) => implementsOf(v);
const anyImpl = (/** @type {(i: any) => boolean} */ test) => (/** @type {any} */ v) =>
  (impls(v).length ? impls(v).some(test) : undefined);
// no data yet (T6): shown, but unavailable
const noData = () => undefined;

/** @type {Record<string, ControlDef>} */
export const CONTROLS = {
  lights: { label: "Lights", icon: "lights", read: light("on") },
  highBeam: { label: "High beam", icon: "highBeam", read: light("high") },
  beacon: { label: "Beacon", icon: "beacon", read: light("beacon") },
  hazard: { label: "Hazard", icon: "hazard", tint: "alarm", read: light("hazard") },
  turnLeft: { label: "Turn L", icon: "turnLeft", tint: "ok", read: light("left") },
  turnRight: { label: "Turn R", icon: "turnRight", tint: "ok", read: light("right") },
  engineOn: { label: "Engine", icon: "engineOn", read: (v) => (v && typeof v.engineOn === "boolean" ? v.engineOn : undefined) },
  cruise: { label: "Cruise", icon: "cruise", read: noData },
  aiWorker: { label: "AI worker", icon: "aiWorker", read: (v) => (v ? v.isAI === true : undefined) },
  implementRaised: { label: "Raise", icon: "hitchUp", read: anyImpl((i) => i.lowered === false) },
  implementLowered: { label: "Lower", icon: "hitchDown", read: anyImpl((i) => i.lowered === true) },
  implementOn: { label: "Work", icon: "implementOn", read: anyImpl((i) => i.turnedOn === true) },
  pto: { label: "PTO", icon: "pto", read: noData },
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
 */
export function controlGroup(group, store) {
  const title = h("h2", { className: "control-group-label", text: group.label });
  const items = group.controls.map((id) => {
    const def = CONTROLS[id];
    if (!def) throw new Error(`no control "${id}"`);
    return { def, ui: createControl(def) };
  });
  const el = h("section", { className: "control-group" }, title,
    h("div", { className: "control-grid" }, ...items.map((i) => i.ui.el)));

  store.subscribe("vehicles", () => {
    const v = controlledVehicle(store);
    for (const { def, ui } of items) {
      const on = def.read(v);
      ui.set(on === undefined ? "unavailable" : on ? "on" : "off");
    }
    if (group.implementName) {
      const name = impls(v)[0]?.name;
      title.textContent = name ? `${group.label} · ${name}` : group.label;
    }
  });
  return el;
}
