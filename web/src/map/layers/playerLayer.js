// @ts-check
// The local player: an arrow pointing where the player (or the vehicle they
// drive) faces. Updates arrive 5-10 times a second; the marker glides
// between them so it moves smoothly.

import { worldToLatLng } from "../mapView.js";
import { createGlide, showPose } from "../glide.js";

/** @typedef {import("../../types.js").Player} Player */
/** @typedef {import("../glide.js").Pose} Pose */

const ARROW_SVG = `<svg viewBox="-12 -12 24 24" width="26" height="26" aria-hidden="true">
  <path d="M0,-11 L8,9 L0,4 L-8,9 Z" /></svg>`;

/**
 * @param {any} map L.Map
 * @param {import("../../store.js").Store} store
 */
export function createPlayerLayer(map, store) {
  map.createPane("player").style.zIndex = "650";
  const icon = L.divIcon({ className: "player-marker", html: ARROW_SVG, iconSize: [26, 26] });
  const marker = L.marker([0, 0], { icon, pane: "player", interactive: false, keyboard: false });
  const group = L.layerGroup([marker]);
  const glide = createGlide({ maxGlideMs: 500 });
  /** @type {Pose|null} */ let shown = null;

  store.subscribe("player", (/** @type {Player|undefined} */ p) => {
    if (!p || typeof p.x !== "number" || typeof p.z !== "number") {
      glide.clear();
      return;
    }
    glide.push(p, performance.now());
  });

  /** Called every animation frame by main.js; returns the shown pose. */
  function tick(/** @type {number} */ now) {
    const pose = glide.at(now);
    if (!pose) {
      if (shown) group.removeLayer(marker);
      shown = null;
      return null;
    }
    if (!shown) group.addLayer(marker);
    shown = showPose(marker, pose, shown, worldToLatLng);
    return pose;
  }

  return { id: "player", title: "Player", leafletLayer: group, tick };
}
