// @ts-check
// "Follow me" keeps the player centred; dragging the map turns it off.
// "Whole map" zooms out to the terrain. The follow choice is remembered.
// This is the logic only: each theme draws its own buttons (New Holland:
// themes/newholland/mapControls.js) and listens with onChange.
//
// With slotZoom (New Holland style), following zooms to the slot's own
// zoom (mapView.js defaultZoom), and keeps it as the slot changes size
// until you zoom by hand; recentre goes back to it.
//
// With a slot name, the slot remembers its view on this device
// (fs25companion.mapSlots): whether it follows, your zoom, and where you
// left it when not following, on the same map.

import { defaultZoom, latLngToWorld, worldBoundsToLatLngBounds, worldToLatLng } from "./mapView.js";

const STORAGE_KEY = "fs25companion.follow";
const SLOTS_KEY = "fs25companion.mapSlots";

/**
 * A slot's view as saved: zoom only after zooming by hand, the centre
 * (world x, z) only when not following, on the map it was left on.
 * @typedef {{following: boolean, zoom?: number, centre?: [number, number], mapId?: string}} SlotView
 */

function loadFollow() {
  try { return localStorage.getItem(STORAGE_KEY) !== "0"; } catch { return true; }
}

function saveFollow(/** @type {boolean} */ on) {
  try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/** @returns {Record<string, SlotView>} */
function loadSlots() {
  try { return JSON.parse(localStorage.getItem(SLOTS_KEY) || "{}") || {}; } catch { return {}; }
}

/** @param {string} slot @param {SlotView} view */
function saveSlot(slot, view) {
  try {
    const all = loadSlots();
    all[slot] = view;
    localStorage.setItem(SLOTS_KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}

/**
 * @param {any} map L.Map
 * @param {{slotZoom?: boolean, slot?: string, mapId?: () => string|undefined}} [opts]
 *   slot: the name its view is saved under ("newholland/map"); mapId: the
 *   map shown, so a centre is only restored on the map it was left on
 */
export function createFollow(map, { slotZoom = false, slot, mapId = () => undefined } = {}) {
  /** @type {SlotView|undefined} */
  let saved = slot ? loadSlots()[slot] : undefined;
  let following = saved ? saved.following !== false : loadFollow();
  /** @type {import("../types.js").WorldBounds|null} */
  let playable = null;
  /** @type {Set<(following: boolean) => void>} */
  const listeners = new Set();
  // after a new map, the first followed pose also zooms in to the player
  let zoomToPlayer = false;
  // zoomed by hand since the last recentre: the slot's zoom no longer applies
  let userZoomed = typeof saved?.zoom === "number";
  /** @type {number|null} the zoom you chose, kept while following */
  let handZoom = userZoomed ? /** @type {number} */ (saved?.zoom) : null;
  // a zoom by hand is under way: its zoomend sets handZoom (a programmatic
  // zoom, like framing a new map, must not)
  let zoomingByHand = false;
  const byHand = () => { userZoomed = true; zoomingByHand = true; };
  const FOLLOW_ZOOM = 0;

  const remember = () => {
    if (!slot) return saveFollow(following);
    /** @type {SlotView} */
    const view = { following };
    if (!following) {
      const c = latLngToWorld(map.getCenter());
      view.centre = [Math.round(c.x), Math.round(c.z)];
      view.zoom = map.getZoom();
      view.mapId = mapId();
    } else if (userZoomed && handZoom !== null) {
      view.zoom = handZoom;
    }
    saveSlot(slot, view);
  };

  const setFollowing = (/** @type {boolean} */ on) => {
    following = on;
    if (on) zoomToPlayer = true;
    remember();
    for (const fn of listeners) fn(following);
  };

  map.on("dragstart", () => { if (following) setFollowing(false); });
  if (slotZoom) {
    // the ways a person zooms; programmatic zooms (follow, whole map, the
    // view kept inside the map) don't count
    const el = map.getContainer();
    el.addEventListener("wheel", byHand, { passive: true });
    el.addEventListener("touchstart", (/** @type {TouchEvent} */ e) => {
      if (e.touches.length > 1) byHand();
    }, { passive: true });
    map.on("dblclick boxzoomend", byHand);
    map.on("resize", () => { if (following && !userZoomed) zoomToPlayer = true; });
  }
  if (slot) {
    map.on("zoomend", () => {
      if (zoomingByHand) handZoom = map.getZoom();
      zoomingByHand = false;
      if (userZoomed || !following) remember();
    });
    // while following, the view moves every frame: only a still map is saved
    map.on("moveend", () => { if (!following && playable) remember(); });
  }

  /** the zoom a followed pose gets */
  const followZoom = () => {
    if (!slotZoom) return Math.max(map.getZoom(), FOLLOW_ZOOM);
    if (userZoomed) return handZoom ?? map.getZoom();
    return playable ? defaultZoom(map.getSize(), playable) : map.getZoom();
  };

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
      handZoom = null;
      setFollowing(true);
    },

    /** a zoom button was pressed: keep that zoom while following */
    userZoom: byHand,

    /** stop following and frame the playable area */
    wholeMap() {
      setFollowing(false);
      if (playable) map.fitBounds(worldBoundsToLatLngBounds(playable), { animate: true });
    },

    /**
     * A new map: frame all of it (following then zooms in to the player),
     * or go back to where this slot was left on it.
     * @param {import("../types.js").WorldBounds} bounds
     */
    onNewMap(bounds) {
      const back = saved && !following && saved.centre && saved.mapId === mapId() ? saved : undefined;
      // the saved view applies to the first map only
      saved = undefined;
      zoomingByHand = false;
      if (back?.centre && typeof back.zoom === "number") {
        map.setView(worldToLatLng(back.centre[0], back.centre[1]), back.zoom, { animate: false });
      } else {
        map.fitBounds(worldBoundsToLatLngBounds(bounds), { animate: false });
        zoomToPlayer = true;
      }
      playable = bounds;
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
