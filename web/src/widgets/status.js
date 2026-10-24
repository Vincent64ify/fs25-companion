// @ts-check
// The link to the game: the connection pill and the protocol-error banner.

import { alerts as alertsOf, connectionStatus, controlledVehicle } from "../data/selectors.js";
import { unitsOf } from "../data/units.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

const STALE_MS = 5000;

/**
 * Live, waiting or offline; rechecked every second, since "waiting for
 * game" means no data arrived for a while. Variant "dot": a status dot
 * before the text, which starts with a capital ("Live").
 * @type {import("./widget.js").CreateWidget}
 */
export function connection(store, opts = {}) {
  const dot = opts.variant === "dot";
  const label = h("span");
  const pill = dot
    ? h("div", { className: "conn disconnected" }, h("span", { className: "conn-dot" }), label)
    : h("div", { className: "conn disconnected", text: "disconnected" });
  if (opts.id) pill.id = opts.id;
  const render = () => {
    const { text, kind } = connectionStatus(store.get("connection"), Date.now() - store.lastTopicAt(), STALE_MS);
    if (dot) label.textContent = text[0].toUpperCase() + text.slice(1);
    else pill.textContent = text;
    pill.className = "conn " + kind;
  };
  store.subscribe("connection", render);
  store.subscribe("hello", render);
  setInterval(render, 1000);
  return pill;
}

/**
 * The backend's protocol error (a mod and dashboard of different
 * versions), hidden while there is none.
 * @type {import("./widget.js").CreateWidget}
 */
export function protocolError(store, opts = {}) {
  const banner = h("div", { className: "protocol-error", hidden: true });
  if (opts.id) banner.id = opts.id;
  store.subscribe("protocolError", (message) => {
    banner.textContent = message || "";
    banner.hidden = !message;
  });
  return banner;
}

/**
 * Alert chips (low fuel or DEF, hot engine, worn): selectors.js alerts(), worst
 * first. Hidden while there are none.
 * @type {import("./widget.js").CreateWidget}
 */
export function alerts(store, opts = {}) {
  const root = h("div", { className: "alerts", hidden: true });
  root.setAttribute("role", "status");
  if (opts.id) root.id = opts.id;
  let last = "";
  const render = () => {
    const list = alertsOf(controlledVehicle(store), unitsOf(store));
    const key = JSON.stringify(list);
    if (key === last) return;
    last = key;
    root.hidden = list.length === 0;
    root.replaceChildren(...list.map((a) => {
      const chip = h("span", { className: "alert-chip" }, icon(a.icon), h("span", { text: a.text }));
      chip.dataset.level = a.level;
      return chip;
    }));
  };
  store.subscribe("vehicles", render);
  store.subscribe("env", render);
  return root;
}
