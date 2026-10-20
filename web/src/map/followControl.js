// @ts-check
// "Follow me" keeps the player centred; dragging the map turns it off.
// "Whole map" zooms out to the terrain. The follow choice is remembered.

import { worldBoundsToLatLngBounds, worldToLatLng } from "./mapView.js";

const STORAGE_KEY = "fs25companion.follow";

function loadFollow() {
  try { return localStorage.getItem(STORAGE_KEY) !== "0"; } catch { return true; }
}

function saveFollow(/** @type {boolean} */ on) {
  try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/**
 * @param {any} map L.Map
 */
export function createFollowControl(map) {
  let following = loadFollow();
  /** @type {import("../types.js").WorldBounds|null} */
  let playable = null;
  /** @type {HTMLButtonElement|null} */
  let followBtn = null;
  // after a new map, the first followed pose also zooms in to the player
  let zoomToPlayer = false;
  const FOLLOW_ZOOM = 0;

  const render = () => {
    if (!followBtn) return;
    followBtn.classList.toggle("active", following);
    followBtn.setAttribute("aria-pressed", String(following));
  };
  const setFollowing = (/** @type {boolean} */ on) => {
    following = on;
    if (on) zoomToPlayer = true;
    saveFollow(on);
    render();
  };

  const Control = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create("div", "leaflet-bar map-buttons");
      followBtn = L.DomUtil.create("button", "", bar);
      followBtn.type = "button";
      followBtn.title = "Follow me";
      followBtn.textContent = "Follow";
      const fitBtn = L.DomUtil.create("button", "", bar);
      fitBtn.type = "button";
      fitBtn.title = "Show the whole map";
      fitBtn.textContent = "Map";
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(followBtn, "click", () => setFollowing(!following));
      L.DomEvent.on(fitBtn, "click", () => {
        setFollowing(false);
        fitAll();
      });
      render();
      return bar;
    },
  });
  new Control({ position: "topright" }).addTo(map);
  map.on("dragstart", () => { if (following) setFollowing(false); });

  function fitAll() {
    if (playable) map.fitBounds(worldBoundsToLatLngBounds(playable), { animate: true });
  }

  return {
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
        map.setView(at, Math.max(map.getZoom(), FOLLOW_ZOOM), { animate: false });
      } else {
        map.panTo(at, { animate: false });
      }
    },
  };
}
