// @ts-check
// FS25 Companion dashboard: vanilla ES modules, no build step.
//
// Data flow: connection.js -> store.js -> map layers and widgets, each
// subscribed to the topics it shows. Adding a map feature means adding a
// file under map/layers/ and registering it below. The theme (themes/)
// decides the chrome, the screens and where the map goes.

import { connect, roundTrips } from "./connection.js";
import { createStore } from "./store.js";
import { addCursorReadout, createMapView, remeasure } from "./map/mapView.js";
import { createMapFrame } from "./map/mapFrame.js";
import { createOverviewLayer } from "./map/overviewLayer.js";
import { createFollow } from "./map/followControl.js";
import { buildLegend } from "./map/legend.js";
import { keepPopupsInside } from "./map/popupPlacement.js";
import { fadeIdleControls } from "./map/idleControls.js";
import { createFarmlandsLayer } from "./map/layers/farmlandsLayer.js";
import { createFieldsLayer } from "./map/layers/fieldsLayer.js";
import { createHotspotsLayer } from "./map/layers/hotspotsLayer.js";
import { createVehiclesLayer } from "./map/layers/vehiclesLayer.js";
import { createPlayerLayer } from "./map/layers/playerLayer.js";
import { createFieldInfoPanel } from "./panels/fieldInfoPanel.js";
import { chooseTheme, saveChoice, savedChoice, THEMES, withoutParams } from "./themes/registry.js";
import { renderTheme } from "./themes/render.js";
import { addEdgeControls, TOOLBAR_INSET } from "./themes/newholland/mapControls.js";
import { createSettings } from "./ui/settings.js";
import { createKeepAwake } from "./ui/screenMode.js";
import { $ } from "./ui/dom.js";

const SCREEN_KEY = "fs25companion.screen";
const AUTO_PICK_KEY = "fs25companion.autoPick";

/** The Vehicle tab picks Tractor or Harvester by what you drive: on unless turned off here. */
const autoPick = {
  wanted() {
    try { return localStorage.getItem(AUTO_PICK_KEY) !== "off"; } catch { return true; }
  },
  set(/** @type {boolean} */ on) {
    try { localStorage.setItem(AUTO_PICK_KEY, on ? "on" : "off"); } catch { /* private mode */ }
  },
};

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
  keepAwake: createKeepAwake(),
  roundTrips,
  autoPick,
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
const rendered = renderTheme(theme, app, store, frame, settings, autoPick);

// the screen shown last on this device, per theme
/** @type {Record<string, string>} */
let screens = {};
const rememberScreen = () => {
  screens[theme.id] = app.dataset.screen || "";
  try { localStorage.setItem(SCREEN_KEY, JSON.stringify(screens)); } catch { /* private mode */ }
};
if (rendered.showScreen) {
  try { screens = JSON.parse(localStorage.getItem(SCREEN_KEY) || "{}") || {}; } catch { /* private mode */ }
  if (screens[theme.id] && app.querySelector(`.screen[data-screen="${screens[theme.id]}"]`)) {
    rendered.showScreen(screens[theme.id]);
  }
  // a tab, or a shared tab's menu
  app.addEventListener("click", (ev) => {
    if (/** @type {HTMLElement} */ (ev.target).closest(".tab-bar, .tab-menu")) rememberScreen();
  });
}

// --- map -------------------------------------------------------------------

const map = createMapView(frame.mapEl, { zoomControl: false });
frame.map = map;
// each theme's map slot keeps its own view (New Holland: zoom, follow, where you left it)
const follow = createFollow(map, {
  slotZoom: true,
  slot: `${theme.id}/${rendered.mapScreen || "map"}`,
  mapId: () => store.get("hello")?.mapId,
});
createOverviewLayer(map, store, { onNewMap: follow.onNewMap });
addCursorReadout(map);

const player = createPlayerLayer(map, store);
const vehicles = createVehiclesLayer(map, store);
// before the fields: a tap outside a field selects the farmland
const farmlands = createFarmlandsLayer(map, store);
/** @type {import("./types.js").MapLayer[]} in legend order */
const layers = [
  player,
  vehicles,
  createHotspotsLayer(map, store),
  createFieldsLayer(map, store, { farmlandAt: farmlands.farmlandAt }),
  farmlands,
];
for (const layer of layers) layer.leafletLayer.addTo(map);
const legend = buildLegend(map, layers);
addEdgeControls(map, follow, legend);
fadeIdleControls(map);

createFieldInfoPanel(store, frame.fieldInfo);

// Show on map (the Implement tab's details): the Map screen, following the vehicle
app.addEventListener("showonmap", () => {
  if (rendered.showScreen && rendered.mapScreen) {
    rendered.showScreen(rendered.mapScreen);
    rememberScreen();
  }
  follow.recentre();
});
// the Vehicle screen's rig tiles: the Implement tab, with the tool selected
app.addEventListener("showscreen", (ev) => {
  const id = /** @type {CustomEvent} */ (ev).detail;
  if (rendered.showScreen && typeof id === "string") {
    rendered.showScreen(id);
    rememberScreen();
  }
});
keepPopupsInside(map, { avoid: frame.fieldInfo, inset: TOOLBAR_INSET });

// --- animation -------------------------------------------------------------

function frameTick(/** @type {number} */ now) {
  follow.tick(player.tick(now));
  vehicles.tick(now);
  requestAnimationFrame(frameTick);
}
requestAnimationFrame(frameTick);

// the map container may change size with the layout (phone rotation)
new ResizeObserver(() => remeasure(map, { animate: false })).observe(frame.mapEl);

connect(store);
