// @ts-check
// FS25 Companion dashboard: vanilla ES modules, no build step.
//
// Data flow: connection.js -> store.js -> map layers and panels, each
// subscribed to the topics it shows. Adding a map feature means adding a
// file under map/layers/ and registering it below.

import { connect } from "./connection.js";
import { createStore } from "./store.js";
import { addCursorReadout, createMapView } from "./map/mapView.js";
import { createOverviewLayer } from "./map/overviewLayer.js";
import { createFollowControl } from "./map/followControl.js";
import { createLegend } from "./map/legend.js";
import { createFarmlandsLayer } from "./map/layers/farmlandsLayer.js";
import { createFieldsLayer } from "./map/layers/fieldsLayer.js";
import { createHotspotsLayer } from "./map/layers/hotspotsLayer.js";
import { createVehiclesLayer } from "./map/layers/vehiclesLayer.js";
import { createPlayerLayer } from "./map/layers/playerLayer.js";
import { createVehiclePanel } from "./panels/vehiclePanel.js";
import { createEnvPanel } from "./panels/envPanel.js";
import { createFieldInfoPanel } from "./panels/fieldInfoPanel.js";
import { $ } from "./panels/dom.js";

const STALE_MS = 5000;

const store = createStore();
const map = createMapView($("map"));
const follow = createFollowControl(map);
createOverviewLayer(map, store, { onNewMap: follow.onNewMap });
addCursorReadout(map);

const player = createPlayerLayer(map, store);
const vehicles = createVehiclesLayer(map, store);
/** @type {import("./types.js").MapLayer[]} in legend order */
const layers = [
  player,
  vehicles,
  createHotspotsLayer(map, store),
  createFieldsLayer(map, store),
  createFarmlandsLayer(map, store),
];
for (const layer of layers) layer.leafletLayer.addTo(map);
createLegend(map, layers);

createVehiclePanel(store);
createEnvPanel(store);
createFieldInfoPanel(store);

// --- status --------------------------------------------------------------

const conn = $("connection");
const hint = $("map-hint");
const banner = $("banner");

function renderStatus() {
  const c = store.get("connection") || {};
  let text, kind;
  if (!c.pairing) [text, kind] = ["no pairing code (?pair=…)", "disconnected"];
  else if (!c.backend) [text, kind] = ["backend offline", "disconnected"];
  else if (!c.client) [text, kind] = ["companion offline", "disconnected"];
  else if (Date.now() - store.lastTopicAt() > STALE_MS) [text, kind] = ["waiting for game", "waiting"];
  else [text, kind] = ["live", "connected"];
  conn.textContent = text;
  conn.className = "conn " + kind;
  hint.hidden = !!store.get("hello");
}

store.subscribe("connection", renderStatus);
store.subscribe("hello", renderStatus);
store.subscribe("protocolError", (message) => {
  banner.textContent = message || "";
  banner.hidden = !message;
});
setInterval(renderStatus, 1000);

// --- animation -------------------------------------------------------------

function frame(/** @type {number} */ now) {
  follow.tick(player.tick(now));
  vehicles.tick(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// the map container may change size with the layout (phone rotation)
new ResizeObserver(() => map.invalidateSize({ animate: false })).observe($("map"));

connect(store);
