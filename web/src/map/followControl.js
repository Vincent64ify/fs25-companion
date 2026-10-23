// @ts-check
// "Follow me" keeps the player centred; dragging the map turns it off.
// "Whole map" zooms out to the terrain. The follow choice is remembered.
// This is the logic only: each theme draws its own buttons (Default:
// themes/default/mapControls.js) and listens with onChange.
//
// With slotZoom (New Holland style), following zooms to the slot's own
// zoom (mapView.js defaultZoom), and keeps it as the slot changes size
// until you zoom by hand; recentre goes back to it.

import { defaultZoom, worldBoundsToLatLngBounds, worldToLatLng } from "./mapView.js";

const STORAGE_KEY = "fs25companion.follow";

function loadFollow() {
  try { return localStorage.getItem(STORAGE_KEY) !== "0"; } catch { return true; }
}

function saveFollow(/** @type {boolean} */ on) {
  try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/**
 * @param {any} map L.Map
 * @param {{slotZoom?: boolean}} [opts]
 */
export function createFollow(map, { slotZoom = false } = {}) {
  let following = loadFollow();
  /** @type {import("../types.js").WorldBounds|null} */
  let playable = null;
  /** @type {Set<(following: boolean) => void>} */
  const listeners = new Set();
  // after a new map, the first followed pose also zooms in to the player
  let zoomToPlayer = false;
  // zoomed by hand since the last recentre: the slot's zoom no longer applies
  let userZoomed = false;
  const FOLLOW_ZOOM = 0;

  const setFollowing = (/** @type {boolean} */ on) => {
    following = on;
    if (on) zoomToPlayer = true;
    saveFollow(on);
    for (const fn of listeners) fn(following);
  };

  map.on("dragstart", () => { if (following) setFollowing(false); });
  if (slotZoom) {
    // the ways a person zooms; programmatic zooms (follow, whole map, the
    // view kept inside the map) don't count
    const el = map.getContainer();
    el.addEventListener("wheel", () => { userZoomed = true; }, { passive: true });
    el.addEventListener("touchstart", (/** @type {TouchEvent} */ e) => {
      if (e.touches.length > 1) userZoomed = true;
    }, { passive: true });
    map.on("dblclick boxzoomend", () => { userZoomed = true; });
    map.on("resize", () => { if (following && !userZoomed) zoomToPlayer = true; });
  }

  /** the zoom a followed pose gets */
  const followZoom = () => (slotZoom && playable && !userZoomed
    ? defaultZoom(map.getSize(), playable)
    : Math.max(map.getZoom(), FOLLOW_ZOOM));

  return {
    following: () => following,
    setFollowing,

    /**
     * Call fn(following) now and whenever it changes.
     * @param {(following: boolean) => void} fn
     */
    onChange(fn) {
      listeners.add(fn);
      fn(following);
    },

    /** follow again, at the slot's own zoom */
    recentre() {
      userZoomed = false;
      setFollowing(true);
    },

    /** a zoom button was pressed: keep that zoom while following */
    userZoom() {
      userZoomed = true;
    },

    /** stop following and frame the playable area */
    wholeMap() {
      setFollowing(false);
      if (playable) map.fitBounds(worldBoundsToLatLngBounds(playable), { animate: true });
    },

    /** a new map: frame all of it (following then zooms in to the player) */
    onNewMap(/** @type {import("../types.js").WorldBounds} */ bounds) {
      playable = bounds;
      map.fitBounds(worldBoundsToLatLngBounds(bounds), { animate: false });
      zoomToPlayer = true;
    },

    /** every animation frame, with the player's shown pose */
    tick(/** @type {{x: number, z: number}|null} */ pose) {
      if (!following || !pose) return;
      const at = worldToLatLng(pose.x, pose.z);
      if (zoomToPlayer) {
        zoomToPlayer = false;
        map.setView(at, followZoom(), { animate: false });
      } else {
        map.panTo(at, { animate: false });
      }
    },
  };
}

/** @typedef {ReturnType<typeof createFollow>} Follow */
