// @ts-check
// FS25 Companion dashboard: vanilla ES modules, no build step.
//
// Data flow: connection.js -> store.js -> map layers and widgets, each
// subscribed to the topics it shows. Adding a map feature means adding a
// file under map/layers/ and registering it below. The theme (themes/)
// decides the chrome, the screens and where the map goes.

import { connect } from "./connection.js";
import { createStore } from "./store.js";
import { addCursorReadout, createMapView } from "./map/mapView.js";
import { createMapFrame } from "./map/mapFrame.js";
import { createOverviewLayer } from "./map/overviewLayer.js";
import { createFollow } from "./map/followControl.js";
import { buildLegend } from "./map/legend.js";
import { keepPopupsInside } from "./map/popupPlacement.js";
import { createFarmlandsLayer } from "./map/layers/farmlandsLayer.js";
import { createFieldsLayer } from "./map/layers/fieldsLayer.js";
import { createHotspotsLayer } from "./map/layers/hotspotsLayer.js";
import { createVehiclesLayer } from "./map/layers/vehiclesLayer.js";
import { createPlayerLayer } from "./map/layers/playerLayer.js";
import { createFieldInfoPanel } from "./panels/fieldInfoPanel.js";
import { chooseTheme, savedChoice } from "./themes/registry.js";
import { renderTheme } from "./themes/render.js";
import { addFollowButtons, addLegendControl } from "./themes/default/mapControls.js";
import { $ } from "./ui/dom.js";

/** @param {string} href resolves once loaded (or failed: the page still works) */
function loadStylesheet(href) {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = link.onerror = resolve;
    document.head.append(link);
  });
}

// --- theme -----------------------------------------------------------------

const { theme, palette } = chooseTheme(location.search, savedChoice());
document.documentElement.dataset.theme = theme.id;
if (palette) document.documentElement.dataset.palette = palette;
await loadStylesheet(theme.css);

const store = createStore();
const frame = createMapFrame(store);
renderTheme(theme, $("app"), store, frame);

// --- map -------------------------------------------------------------------

const map = createMapView(frame.mapEl, { zoomControl: theme.mapControls === "corners" });
frame.map = map;
const follow = createFollow(map);
if (theme.mapControls === "corners") addFollowButtons(map, follow);
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
const legend = buildLegend(map, layers);
if (theme.mapControls === "corners") addLegendControl(map, legend);

createFieldInfoPanel(store, frame.fieldInfo);
keepPopupsInside(map, { avoid: frame.fieldInfo });

// --- animation -------------------------------------------------------------

function frameTick(/** @type {number} */ now) {
  follow.tick(player.tick(now));
  vehicles.tick(now);
  requestAnimationFrame(frameTick);
}
requestAnimationFrame(frameTick);

// the map container may change size with the layout (phone rotation)
new ResizeObserver(() => map.invalidateSize({ animate: false })).observe(frame.mapEl);

connect(store);
