// @ts-check
// The local player: an arrow pointing where the player (or the vehicle they
// drive) faces. Updates arrive 5-10 times a second; the marker glides
// between them so it moves smoothly.

import { worldToLatLng } from "../mapView.js";

/** @typedef {import("../../types.js").Player} Player */
/** @typedef {{x: number, z: number, heading: number}} Pose */

const MAX_GLIDE_MS = 500;
const TELEPORT_M = 150;

const ARROW_SVG = `<svg viewBox="-12 -12 24 24" width="26" height="26" aria-hidden="true">
  <path d="M0,-11 L8,9 L0,4 L-8,9 Z" /></svg>`;

/** @param {number} a @param {number} b @param {number} k */
const lerp = (a, b, k) => a + (b - a) * k;

/** shortest way round: 350 -> 10 turns 20 degrees, not 340 */
function lerpHeading(/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ k) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * k + 360) % 360;
}

/**
 * @param {any} map L.Map
 * @param {import("../../store.js").Store} store
 */
export function createPlayerLayer(map, store) {
  map.createPane("player").style.zIndex = "650";
  const icon = L.divIcon({ className: "player-marker", html: ARROW_SVG, iconSize: [26, 26] });
  const marker = L.marker([0, 0], { icon, pane: "player", interactive: false, keyboard: false });
  const group = L.layerGroup([marker]);

  /** @type {Pose|null} */ let from = null;
  /** @type {Pose|null} */ let to = null;
  let startedAt = 0;
  let glideMs = 0;
  let lastAt = 0;
  /** @type {Pose|null} */ let shown = null;

  /** @param {number} now */
  function poseAt(now) {
    if (!to) return null;
    if (!from || glideMs <= 0) return to;
    const k = Math.min(1, (now - startedAt) / glideMs);
    return {
      x: lerp(from.x, to.x, k),
      z: lerp(from.z, to.z, k),
      heading: lerpHeading(from.heading, to.heading, k),
    };
  }

  store.subscribe("player", (/** @type {Player|undefined} */ p) => {
    if (!p || typeof p.x !== "number" || typeof p.z !== "number") {
      to = from = null;
      return;
    }
    const now = performance.now();
    const current = poseAt(now);
    const next = { x: p.x, z: p.z, heading: typeof p.heading === "number" ? p.heading : current?.heading ?? 0 };
    const jump = current ? Math.hypot(next.x - current.x, next.z - current.z) : Infinity;
    from = jump < TELEPORT_M ? current : null;
    to = next;
    glideMs = Math.min(MAX_GLIDE_MS, now - lastAt);
    startedAt = lastAt = now;
  });

  /** Called every animation frame by main.js; returns the shown pose. */
  function tick(/** @type {number} */ now) {
    const pose = poseAt(now);
    if (!pose) {
      if (shown) group.removeLayer(marker);
      shown = null;
      return null;
    }
    if (!shown) group.addLayer(marker);
    if (!shown || shown.x !== pose.x || shown.z !== pose.z) {
      marker.setLatLng(worldToLatLng(pose.x, pose.z));
    }
    const el = marker.getElement()?.firstElementChild;
    if (el && (!shown || shown.heading !== pose.heading)) {
      el.style.transform = `rotate(${pose.heading}deg)`;
    }
    shown = pose;
    return pose;
  }

  return { id: "player", title: "Player", leafletLayer: group, tick };
}
