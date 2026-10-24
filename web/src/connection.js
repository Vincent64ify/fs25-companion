// @ts-check
// WebSocket to the backend: /ws?pair=<code>, reconnecting.
//
// URL parameters:
//   ?pair=123456   pairing code (optional with a local backend, which
//                  advertises its code at /api/info)
//   ?backend=...   backend WebSocket URL (default: this page's origin; the
//                  backend serves the dashboard)

import { createCommander } from "./commands.js";

/** @typedef {import("./store.js").Store} Store */

const params = new URLSearchParams(location.search);

export const BACKEND = params.get("backend") ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

/** HTTP base of the backend, for /api/... (same origin unless ?backend=) */
export const HTTP_BASE = params.get("backend")
  ? BACKEND.replace(/^ws/, "http").replace(/\/ws\/?$/, "").replace(/\/$/, "")
  : "";

/** @type {WebSocket|null} */
let socket = null;

const commander = createCommander((msg) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(msg));
  return true;
});

/**
 * Send a command to the game ("lights.toggle"); resolves with the mod's
 * answer, or a failure after 2 s without one.
 * @param {string} action
 * @returns {Promise<import("./commands.js").CommandResult>}
 */
export const sendCommand = (action) => commander.send(action);

async function resolvePairing() {
  const pair = (params.get("pair") || "").trim();
  if (pair) return pair;
  try {
    const res = await fetch(`${HTTP_BASE}/api/info`, { cache: "no-store" });
    return (await res.json()).localPairing || "";
  } catch {
    return "";
  }
}

/**
 * Connect and keep the store up to date. Store keys set here:
 *   connection    {backend: boolean, client: boolean, pairing: string}
 *   mapAssets     {mapId, hash} of the uploaded overview images
 *   protocolError string|null
 * @param {Store} store
 */
export async function connect(store) {
  const pairing = await resolvePairing();
  /** @type {string[]} */
  let topicKeys = [];
  const status = { backend: false, client: false, pairing };
  const setStatus = (/** @type {Partial<typeof status>} */ patch) => {
    Object.assign(status, patch);
    store.set("connection", { ...status });
  };
  setStatus({});
  if (!pairing) return;

  const open = () => {
    const ws = new WebSocket(`${BACKEND}/ws?pair=${encodeURIComponent(pairing)}`);
    socket = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", role: "viewer" }));
      setStatus({ backend: true });
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case "snapshot": {
          const topics = msg.topics || {};
          store.replaceTopics(topics, topicKeys);
          topicKeys = Object.keys(topics);
          break;
        }
        case "update":
          if (!topicKeys.includes(msg.envelope.topic)) topicKeys.push(msg.envelope.topic);
          store.applyUpdate(msg.envelope);
          break;
        case "map_assets":
          store.set("mapAssets", { mapId: msg.mapId, hash: msg.hash });
          break;
        case "client_status":
          setStatus({ client: !!msg.connected });
          break;
        case "protocol_error":
          store.set("protocolError", msg.message || null);
          break;
        case "command_ack":
          commander.ack(msg);
          break;
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      setStatus({ backend: false, client: false });
      setTimeout(open, 2000);
    };
    ws.onerror = () => ws.close();
  };
  open();
}
