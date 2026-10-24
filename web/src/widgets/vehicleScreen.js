// @ts-check
// The Vehicle screen's two cards (docs/THEMES.md, Vehicle): the readout
// card (what the vehicle is doing, the speed arc, gear and engine speed)
// and the vehicle card (its kind's icon, name, brand and category, and a
// button that shows it on the Map screen). The button dispatches a
// "showonmap" event that bubbles up to main.js.

import {
  activity, controlledVehicle, gearName, kindLabel, modelName, rpmPct, speedScale, vehicleBrand, vehicleKind,
} from "../data/selectors.js";
import { speedUnit, speedValue, unitsOf } from "../data/units.js";
import { fmt, h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// the arc's path: a half circle over the number, in a 200 × 126 box
const ARC = "M20 106 A80 80 0 0 1 180 106";

/** @param {string} d @param {string} cls */
function arcPath(d, cls) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("class", cls);
  path.setAttribute("pathLength", "100");
  return path;
}

/**
 * Under the gear's label: its group and whether it shifts itself ("Range B
 * · Automatic"). The range only when the gear's name doesn't carry it: the
 * game names a ranged gear "3H", and mid-shift its group may still be the
 * old one.
 */
export function gearDetail(/** @type {import("../types.js").Vehicle|undefined} */ v) {
  const bare = /^-?\d+$/.test(String(v?.gear ?? ""));
  return [bare && typeof v?.gearGroup === "string" && v.gearGroup ? `Range ${v.gearGroup}` : "",
    v?.gearAutomatic === true ? "Automatic" : ""].filter(Boolean).join(" · ");
}

/** A small capitalised label over or beside a value. */
const label = (/** @type {string} */ text) => h("span", { className: "readout-label", text });

/**
 * The readout card: activity, speed arc, gear box and engine speed.
 * @type {import("./widget.js").CreateWidget}
 */
export function vehicleReadout(store, opts = {}) {
  const badge = h("span", { className: "readout-badge" });
  const title = h("b", { className: "readout-title" });
  const sub = h("span", { className: "readout-sub" });
  const engine = h("span", { className: "readout-engine" }, h("span", { className: "readout-dot" }), h("span"));

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 126");
  svg.setAttribute("aria-hidden", "true");
  const fill = arcPath(ARC, "arc-fill");
  // the fill's light-to-yellow gradient, left to right
  svg.innerHTML = '<defs><linearGradient id="arc-gradient" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#FFC72C"/></linearGradient></defs>';
  svg.append(arcPath(ARC, "arc-track"), fill);
  const speed = h("b", { className: "readout-speed" });
  const speedUnitEl = h("small", { text: "km/h" });
  const scaleMax = h("span", { className: "arc-max" });
  const arc = h("div", { className: "readout-arc" }, svg,
    h("div", { className: "readout-speed-box" }, speed, speedUnitEl),
    h("span", { className: "arc-min", text: "0" }), scaleMax);
  arc.setAttribute("role", "img");

  const gear = h("span", { className: "readout-gear" });
  const gearSub = h("span", { className: "readout-gear-sub" });
  const rpm = h("b");
  const rpmBar = h("span");
  const side = h("div", { className: "readout-side" },
    h("div", { className: "readout-gear-row" }, gear, h("div", { className: "readout-gear-what" }, label("Gear"), gearSub)),
    h("div", { className: "readout-rpm" },
      h("div", { className: "readout-rpm-row" }, label("Engine"), h("span", {}, rpm, h("small", { text: " rpm" }))),
      h("span", { className: "widget-meter" }, rpmBar)));

  const root = h("div", { className: "vehicle-readout" },
    h("div", { className: "readout-head" }, badge, h("div", { className: "readout-what" }, title, sub), engine),
    h("div", { className: "readout-body" }, arc, side));
  if (opts.id) root.id = opts.id;

  // the arc's scale, kept per vehicle once it grew
  /** @type {unknown} */
  let scaleFor = null;
  let scale = 0;
  let lastIcon = "";
  const render = () => {
    const v = controlledVehicle(store);
    const what = activity(v);
    if (what.icon !== lastIcon) badge.replaceChildren(icon((lastIcon = what.icon)));
    title.textContent = what.text;
    sub.textContent = what.detail || "";
    sub.hidden = !what.detail;
    engine.hidden = typeof v?.engineOn !== "boolean";
    engine.dataset.on = String(!!v?.engineOn);
    /** @type {HTMLElement} */ (engine.lastChild).textContent = v?.engineOn ? "Engine on" : "Engine off";

    // in the player's unit, km/h or mph; the scale follows it
    const units = unitsOf(store);
    const unit = speedUnit(units);
    const shown = typeof v?.speed === "number" ? speedValue(v.speed, units) : undefined;
    if (v?.id !== scaleFor || unit !== speedUnitEl.textContent) { scaleFor = v?.id; scale = 0; }
    speedUnitEl.textContent = unit;
    scale = speedScale(shown ?? 0, scale);
    speed.textContent = shown === undefined ? "–" : fmt(shown, 1);
    scaleMax.textContent = String(scale);
    const pct = shown === undefined ? 0 : Math.min(100, (100 * shown) / scale);
    fill.setAttribute("stroke-dasharray", `${pct} 100`);
    fill.style.opacity = pct > 0.5 ? "1" : "0";
    arc.setAttribute("aria-label", shown === undefined ? "Speed unknown" : `Speed ${fmt(shown, 1)} ${unit}`);

    gear.textContent = gearName(v) ?? "–";
    gearSub.textContent = gearDetail(v);
    rpm.textContent = typeof v?.rpm === "number" ? Math.round(v.rpm).toLocaleString() : "–";
    rpmBar.style.width = `${rpmPct(v) ?? 0}%`;
    side.hidden = !v;
  };
  store.subscribe("vehicles", render);
  store.subscribe("env", render);
  return root;
}

/**
 * The vehicle card: its kind's icon where the shop picture would be, the
 * name without its brand, "Brand · Category", and Show on map.
 * @type {import("./widget.js").CreateWidget}
 */
export function vehicleCard(store, opts = {}) {
  const figure = h("figure", { className: "vehicle-figure" });
  const name = h("b", { className: "vehicle-name" });
  const sub = h("span", { className: "vehicle-sub" });
  const show = h("button", { className: "show-on-map" }, icon("map"));
  show.setAttribute("type", "button");
  show.title = "Show on map";
  show.setAttribute("aria-label", "Show on the Map screen");
  show.addEventListener("click", () => show.dispatchEvent(new CustomEvent("showonmap", { bubbles: true })));
  const root = h("div", { className: "vehicle-card" }, figure,
    h("div", { className: "vehicle-foot" }, h("div", { className: "vehicle-text" }, name, sub), show));
  if (opts.id) root.id = opts.id;

  let lastKind = "";
  store.subscribe("vehicles", () => {
    const v = controlledVehicle(store);
    const kind = v ? vehicleKind(v) : "position";
    if (kind !== lastKind) figure.replaceChildren(icon((lastKind = kind)));
    name.textContent = modelName(v);
    sub.textContent = v ? [vehicleBrand(v), kindLabel(v)].filter(Boolean).join(" · ") : "Get in a vehicle to see it here";
    show.hidden = !v;
  });
  return root;
}
