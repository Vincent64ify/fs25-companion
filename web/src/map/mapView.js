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
 * @param {{zoomControl?: boolean}} [opts] zoomControl: Leaflet's +/- buttons,
 *   top-left (default true; a theme may draw its own)
 * @returns {any} L.Map
 */
export function createMapView(el, { zoomControl = true } = {}) {
  const map = L.map(el, {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 3,
    // no snapping: the zoom where the playable area just fills the map is
    // rarely a round step, and snapping would round "whole map" past it
    zoomSnap: 0,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120,
    attributionControl: false,
    zoomControl: false,
    // hard edges: no dragging or pinching past the bounds, even briefly
    maxBoundsViscosity: 1,
    bounceAtZoomLimits: false,
  });
  if (zoomControl) L.control.zoom({ position: "topleft" }).addTo(map);
  map.setView([0, 0], -2);
  // Leaflet only notices window resizes; the box also changes with the
  // layout (banner shown, panel below the map, ...)
  new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el);
  return map;
}

/**
 * The zoom at which the bounds just cover a view of this size (CRS.Simple:
 * 1 world meter = 2^zoom px), with 2 px to spare so rounding never shows an
 * edge.
 * @param {{x: number, y: number}} size view in px
 * @param {WorldBounds} bounds
 */
export function coverZoom(size, [minX, minZ, maxX, maxZ]) {
  return Math.log2(Math.max((size.x + 2) / (maxX - minX), (size.y + 2) / (maxZ - minZ)));
}

/**
 * Keep the view inside the bounds: panning stops at their edges and zooming
 * out stops when they just cover the map, so nothing outside them ever
 * shows. Kept up as the map's size changes.
 * @param {any} map L.Map
 * @param {WorldBounds} bounds
 */
export function constrainTo(map, bounds) {
  const fit = () => {
    const size = map.getSize();
    if (!size.x || !size.y) return;
    // Leaflet lets the view sit up to 1 px past maxBounds: pull them in by
    // 2 px at the widest zoom (a few meters of the map's edge)
    const m = 2 / 2 ** coverZoom(size, bounds);
    /** @type {WorldBounds} */
    const inner = [bounds[0] + m, bounds[1] + m, bounds[2] - m, bounds[3] - m];
    map.setMinZoom(Math.min(coverZoom(size, inner), map.getMaxZoom()));
    map.setMaxBounds(L.latLngBounds(worldBoundsToLatLngBounds(inner)));
  };
  if (map._constrainFit) map.off("resize", map._constrainFit);
  map._constrainFit = fit;
  map.on("resize", fit);
  fit();
}

/**
 * The one canvas that farmlands and fields share (pane "land", above the
 * overview image, below every marker). One canvas, so a click finds the
 * topmost shape of either layer: fields are drawn over farmlands.
 * @param {any} map L.Map
 * @returns {any} L.Canvas
 */
export function landRenderer(map) {
  if (!map._landRenderer) {
    map.createPane("land").style.zIndex = "410";
    map._landRenderer = L.canvas({ pane: "land", padding: 0.5 });
  }
  return map._landRenderer;
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
