// @ts-check
// WebSocket to the companion that serves this page: /ws on the same
// origin, reconnecting.

import { createCommander } from "./commands.js";

/** @typedef {import("./store.js").Store} Store */

const SOCKET_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

/** @type {WebSocket|null} */
let socket = null;

const commander = createCommander((msg) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(msg));
  return true;
});

/**
 * Send a command to the game: the state it wants ("beacon.set" with 1,
 * "cruise.set" with km/h, "tool.lower" with 1 and the tool's rig id);
 * resolves with the mod's answer, or a failure after the timeout without one.
 * @param {string} action
 * @param {number} [value]
 * @param {number} [tool]
 * @returns {Promise<import("./commands.js").CommandResult>}
 */
export const sendCommand = (action, value, tool) => commander.send(action, value, tool);

/** the last commands' round trips, tap to the mod's answer (Settings) */
export const roundTrips = () => commander.roundTrips();

/**
 * Connect and keep the store up to date. Store keys set here:
 *   connection    {backend: boolean}: whether the socket is open
 *   mapAssets     {mapId, hash} of the map's overview images
 *   protocolError string|null
 * @param {Store} store
 */
export function connect(store) {
  /** @type {string[]} */
  let topicKeys = [];
  const setStatus = (/** @type {boolean} */ backend) => store.set("connection", { backend });
  setStatus(false);

  const open = () => {
    const ws = new WebSocket(SOCKET_URL);
    socket = ws;
    ws.onopen = () => {
      setStatus(true);
      // the backend says it again on connect if it still holds one
      store.set("protocolError", null);
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
        case "protocol_error": // message null: cleared
          store.set("protocolError", msg.message || null);
          break;
        case "command_ack":
          commander.ack(msg);
          break;
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      setStatus(false);
      setTimeout(open, 2000);
    };
    ws.onerror = () => ws.close();
  };
  open();
}
