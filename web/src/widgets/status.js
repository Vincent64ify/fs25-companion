// @ts-check
// The link to the game: the connection pill and the protocol-error banner.

import { connectionStatus } from "../data/selectors.js";
import { h } from "../ui/dom.js";

const STALE_MS = 5000;

/**
 * Live, waiting or offline; rechecked every second, since "waiting for
 * game" means no data arrived for a while.
 * @type {import("./widget.js").CreateWidget}
 */
export function connection(store, opts = {}) {
  const pill = h("div", { className: "conn disconnected", text: "disconnected" });
  if (opts.id) pill.id = opts.id;
  const render = () => {
    const { text, kind } = connectionStatus(store.get("connection"), Date.now() - store.lastTopicAt(), STALE_MS);
    pill.textContent = text;
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
  const banner = h("div", { hidden: true });
  if (opts.id) banner.id = opts.id;
  store.subscribe("protocolError", (message) => {
    banner.textContent = message || "";
    banner.hidden = !message;
  });
  return banner;
}
