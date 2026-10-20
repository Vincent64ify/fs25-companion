// @ts-check
// The Leaflet map, in world meters. This file is the ONLY place that knows
// how world (x, z) relates to Leaflet's LatLng:
//
//   L.CRS.Simple: lng grows right, lat grows up, 1 unit = 1 px at zoom 0.
//   FS25:         x grows east (right), z grows south (down the PDA).
//   So            lng = x,  lat = -z.
//
// Headings (0 = north = -Z, clockwise) therefore map straight onto CSS
// rotate(): north is up on screen and no calibration exists anywhere.

/** @typedef {import("../types.js").WorldBounds} WorldBounds */

/**
 * @param {number} x
 * @param {number} z
 * @returns {[number, number]} [lat, lng]
 */
export function worldToLatLng(x, z) {
  return [-z, x];
}

/**
 * @param {{lat: number, lng: number}} latLng
 * @returns {{x: number, z: number}}
 */
export function latLngToWorld(latLng) {
  return { x: latLng.lng, z: -latLng.lat };
}

/**
 * @param {WorldBounds} bounds [minX, minZ, maxX, maxZ]
 * @returns {[[number, number], [number, number]]} [[south, west], [north, east]]
 */
export function worldBoundsToLatLngBounds([minX, minZ, maxX, maxZ]) {
  return [worldToLatLng(minX, maxZ), worldToLatLng(maxX, minZ)];
}

/**
 * World bounds of the terrain when there is no meta.json (no image): the
 * terrain is centred on the origin.
 * @param {number} terrainSize
 * @returns {WorldBounds}
 */
export function terrainBounds(terrainSize) {
  const h = terrainSize / 2;
  return [-h, -h, h, h];
}

/**
 * @param {HTMLElement} el
 * @returns {any} L.Map
 */
export function createMapView(el) {
  const map = L.map(el, {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 3,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
    attributionControl: false,
    zoomControl: false,
  });
  L.control.zoom({ position: "topleft" }).addTo(map);
  map.setView([0, 0], -2);
  return map;
}

/**
 * Keep the view on the map: limit panning to the bounds (plus a margin) and
 * zooming out to a little beyond the bounds filling the screen.
 * @param {any} map L.Map
 * @param {WorldBounds} bounds
 */
export function constrainTo(map, bounds) {
  const ll = L.latLngBounds(worldBoundsToLatLngBounds(bounds));
  map.setMaxBounds(ll.pad(0.25));
  map.setMinZoom(Math.min(map.getBoundsZoom(ll, false) - 1, map.getMaxZoom()));
}

/** Bottom-left readout of the world position under the cursor. */
export function addCursorReadout(/** @type {any} */ map) {
  const Readout = L.Control.extend({
    onAdd() {
      const div = L.DomUtil.create("div", "map-readout");
      div.hidden = true;
      map.on("mousemove", (/** @type {any} */ e) => {
        const { x, z } = latLngToWorld(e.latlng);
        div.hidden = false;
        div.textContent = `x ${x.toFixed(0)}  z ${z.toFixed(0)}`;
      });
      map.on("mouseout", () => { div.hidden = true; });
      return div;
    },
  });
  new Readout({ position: "bottomleft" }).addTo(map);
}
