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
import { chooseTheme, saveChoice, savedChoice, THEMES, withoutParams } from "./themes/registry.js";
import { renderTheme } from "./themes/render.js";
import { addFollowButtons, addLegendControl } from "./themes/default/mapControls.js";
import { addEdgeControls, TOOLBAR_INSET } from "./themes/newholland/mapControls.js";
import { createSettings } from "./ui/settings.js";
import { $ } from "./ui/dom.js";

const SCREEN_KEY = "fs25companion.screen";

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

// the device's choice; a URL override of the same key would win over it
const settings = createSettings({
  themes: THEMES, theme, palette,
  onTheme(id) {
    saveChoice("theme", id);
    location.search = withoutParams(location.search, ["theme", "palette"]);
  },
  onPalette(p) {
    saveChoice("palette", p);
    document.documentElement.dataset.palette = p;
    if (new URLSearchParams(location.search).has("palette")) {
      history.replaceState(null, "", location.pathname + withoutParams(location.search, ["palette"]) + location.hash);
    }
  },
});

const store = createStore();
const frame = createMapFrame(store);
const app = $("app");
const rendered = renderTheme(theme, app, store, frame, settings);

// the screen shown last on this device, per theme
if (rendered.showScreen) {
  /** @type {Record<string, string>} */
  let screens = {};
  try { screens = JSON.parse(localStorage.getItem(SCREEN_KEY) || "{}") || {}; } catch { /* private mode */ }
  if (screens[theme.id] && app.querySelector(`.screen[data-screen="${screens[theme.id]}"]`)) {
    rendered.showScreen(screens[theme.id]);
  }
  app.querySelector(".tab-bar")?.addEventListener("click", () => {
    screens[theme.id] = app.dataset.screen || "";
    try { localStorage.setItem(SCREEN_KEY, JSON.stringify(screens)); } catch { /* private mode */ }
  });
}

// --- map -------------------------------------------------------------------

const corners = theme.mapControls === "corners";
const map = createMapView(frame.mapEl, { zoomControl: corners });
frame.map = map;
const follow = createFollow(map, { slotZoom: !corners });
if (corners) addFollowButtons(map, follow);
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
if (corners) addLegendControl(map, legend);
else addEdgeControls(map, follow, legend);

createFieldInfoPanel(store, frame.fieldInfo);
keepPopupsInside(map, { avoid: frame.fieldInfo, inset: corners ? {} : TOOLBAR_INSET });

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
