// @ts-check
// The Vehicle screen's two cards (docs/THEMES.md, Vehicle): the readout
// card (what the vehicle is doing, the speed arc, gear and engine speed)
// and the vehicle card (its kind's icon, name, brand and category, and a
// button that shows it on the Map screen). The button dispatches a
// "showonmap" event that bubbles up to main.js.

import {
  activity, controlledVehicle, kindLabel, modelName, rpmPct, speedScale, vehicleBrand, vehicleKind,
} from "../data/selectors.js";
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
  const scaleMax = h("span", { className: "arc-max" });
  const arc = h("div", { className: "readout-arc" }, svg,
    h("div", { className: "readout-speed-box" }, speed, h("small", { text: "km/h" })),
    h("span", { className: "arc-min", text: "0" }), scaleMax);
  arc.setAttribute("role", "img");

  const gear = h("span", { className: "readout-gear" });
  const rpm = h("b");
  const rpmBar = h("span");
  const side = h("div", { className: "readout-side" },
    h("div", { className: "readout-gear-row" }, gear, label("Gear")),
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
  store.subscribe("vehicles", () => {
    const v = controlledVehicle(store);
    const what = activity(v);
    if (what.icon !== lastIcon) badge.replaceChildren(icon((lastIcon = what.icon)));
    title.textContent = what.text;
    sub.textContent = what.detail || "";
    sub.hidden = !what.detail;
    engine.hidden = typeof v?.engineOn !== "boolean";
    engine.dataset.on = String(!!v?.engineOn);
    /** @type {HTMLElement} */ (engine.lastChild).textContent = v?.engineOn ? "Engine on" : "Engine off";

    const kmh = typeof v?.speed === "number" ? v.speed : undefined;
    if (v?.id !== scaleFor) { scaleFor = v?.id; scale = 0; }
    scale = speedScale(kmh ?? 0, scale);
    speed.textContent = kmh === undefined ? "–" : fmt(kmh, 1);
    scaleMax.textContent = String(scale);
    const pct = kmh === undefined ? 0 : Math.min(100, (100 * kmh) / scale);
    fill.setAttribute("stroke-dasharray", `${pct} 100`);
    fill.style.opacity = pct > 0.5 ? "1" : "0";
    arc.setAttribute("aria-label", kmh === undefined ? "Speed unknown" : `Speed ${fmt(kmh, 1)} km/h`);

    gear.textContent = v?.gear == null ? "–" : String(v.gear);
    rpm.textContent = typeof v?.rpm === "number" ? Math.round(v.rpm).toLocaleString() : "–";
    rpmBar.style.width = `${rpmPct(v) ?? 0}%`;
    side.hidden = !v;
  });
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
