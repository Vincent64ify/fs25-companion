// @ts-check
// The PDA's points of interest: sell points, buy and loading points,
// productions, shops, animals and the rest, one legend item per group
// (icons.js). Hidden hotspots (placeables nobody has bought) aren't drawn,
// as on the PDA. Hover or tap a symbol for its name.

import { worldToLatLng } from "../mapView.js";
import { HOTSPOT_GROUPS, hotspotGroup, hotspotIcon, hotspotSwatch } from "../icons.js";
import { myFarmId } from "../../store.js";

/** @typedef {import("../../types.js").Hotspot} Hotspot */

/**
 * @param {any} map L.Map
 * @param {import("../../store.js").Store} store
 */
export function createHotspotsLayer(map, store) {
  map.createPane("hotspots").style.zIndex = "610";
  /** @type {Record<string, any>} group id -> L.LayerGroup */
  const groups = Object.fromEntries(HOTSPOT_GROUPS.map((g) => [g.id, L.layerGroup()]));
  const root = L.layerGroup(Object.values(groups));
  let drawn = "";

  function render() {
    /** @type {Hotspot[]} */
    const list = store.get("hotspots")?.hotspots || [];
    const farmId = myFarmId(store);
    // sent every 10 s and nearly always unchanged
    const key = farmId + JSON.stringify(list);
    if (key === drawn) return;
    drawn = key;
    for (const g of Object.values(groups)) g.clearLayers();
    for (const h of list) {
      if (h.visible === false || typeof h.x !== "number" || typeof h.z !== "number") continue;
      const group = hotspotGroup(h.category);
      const marker = L.marker(worldToLatLng(h.x, h.z), {
        icon: hotspotIcon(group, h.farmId === farmId),
        pane: "hotspots",
        keyboard: false,
        title: h.name || group.label,
      });
      marker.bindTooltip(h.name || group.label, { direction: "top", offset: [0, -10] });
      groups[group.id].addLayer(marker);
    }
  }

  store.subscribe("hotspots", render);
  store.subscribe("hello", render);

  return {
    id: "hotspots",
    title: "Places",
    leafletLayer: root,
    legendItems: HOTSPOT_GROUPS.map((g) => ({
      id: g.id,
      label: g.label,
      swatch: hotspotSwatch(g),
      setVisible: (/** @type {boolean} */ on) => {
        if (on) root.addLayer(groups[g.id]);
        else root.removeLayer(groups[g.id]);
      },
    })),
  };
}
