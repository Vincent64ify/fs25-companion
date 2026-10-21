// @ts-check
// The map background: the PDA overview image the client uploaded, placed
// with meta.json's world bounds. Without an image (not uploaded yet, or the
// map's files couldn't be read) a plain terrain rectangle stands in, so the
// vector layers still have a frame. Only the playable area ever shows: the
// view is kept inside it and the image is clipped to it.

import { HTTP_BASE } from "../connection.js";
import { constrainTo, terrainBounds, worldBoundsToLatLngBounds } from "./mapView.js";

/** @typedef {import("../types.js").MapMeta} MapMeta */
/** @typedef {import("../types.js").WorldBounds} WorldBounds */

const SMALL_SCREEN_PX = 1024;

/** Phones get the 2048 px image: a 4096² image costs 64 MB decoded. */
function imageName() {
  return Math.max(screen.width, screen.height) <= SMALL_SCREEN_PX
    ? "overview_2048.png" : "overview.png";
}

/**
 * CSS clip-path keeping the playable part of the image: inset(top right
 * bottom left), in % of the image. The image's top is its smallest z.
 * @param {WorldBounds} image
 * @param {WorldBounds} playable
 */
export function playableClip([ix0, iz0, ix1, iz1], [px0, pz0, px1, pz1]) {
  const w = ix1 - ix0, h = iz1 - iz0;
  const pct = (/** @type {number} */ v, /** @type {number} */ of) => `${Math.max(0, (v / of) * 100)}%`;
  return `inset(${pct(pz0 - iz0, h)} ${pct(ix1 - px1, w)} ${pct(iz1 - pz1, h)} ${pct(px0 - ix0, w)})`;
}

/**
 * @param {any} map L.Map
 * @param {import("../store.js").Store} store
 * @param {{onNewMap?: (playable: WorldBounds) => void}} [hooks]
 *   onNewMap runs once per map id, when its frame is first known
 */
export function createOverviewLayer(map, store, hooks = {}) {
  const group = L.layerGroup().addTo(map);
  /** @type {string|null} key of what is shown: "<mapId>/<hash>" or "<mapId>/plain" */
  let shown = null;
  /** @type {string|null} */
  let framedMapId = null;
  let generation = 0;

  /** @param {string} mapId @param {WorldBounds} playable */
  function frame(mapId, playable) {
    constrainTo(map, playable);
    if (framedMapId !== mapId) {
      framedMapId = mapId;
      hooks.onNewMap?.(playable);
    }
  }

  /** @param {string} mapId @param {number} terrainSize */
  function showPlain(mapId, terrainSize) {
    const key = `${mapId}/plain`;
    if (shown === key) return;
    shown = key;
    group.clearLayers();
    const playable = terrainBounds(terrainSize);
    L.rectangle(worldBoundsToLatLngBounds(playable), {
      className: "terrain-plain", stroke: false, fillOpacity: 1, interactive: false,
    }).addTo(group);
    frame(mapId, playable);
  }

  /** @param {string} mapId @param {string} hash */
  async function showImage(mapId, hash) {
    const key = `${mapId}/${hash}`;
    if (shown === key) return;
    const gen = ++generation;
    const base = `${HTTP_BASE}/api/maps/${encodeURIComponent(mapId)}/${hash}`;
    /** @type {MapMeta} */
    let meta;
    try {
      const res = await fetch(`${base}/meta.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      meta = await res.json();
    } catch (e) {
      console.warn(`map ${mapId}: no meta.json`, e);
      return;
    }
    if (gen !== generation) return;
    shown = key;
    group.clearLayers();
    const image = L.imageOverlay(`${base}/${imageName()}`, worldBoundsToLatLngBounds(meta.imageBounds), {
      className: "overview-image", interactive: false,
    }).addTo(group);
    // the view never leaves the playable area, but a pinch can overshoot
    // for a frame: show the background there, not the unplayable border
    image.getElement().style.clipPath = playableClip(meta.imageBounds, meta.playableBounds);
    frame(mapId, meta.playableBounds);
  }

  function update() {
    /** @type {import("../types.js").Hello|undefined} */
    const hello = store.get("hello");
    /** @type {import("../types.js").MapAssets|undefined} */
    const assets = store.get("mapAssets");
    if (!hello?.mapId) return;
    // never draw one map's positions on another map's image
    if (assets && assets.mapId === hello.mapId) {
      showImage(assets.mapId, assets.hash);
    } else if (!shown?.startsWith(`${hello.mapId}/`)) {
      ++generation;
      showPlain(hello.mapId, hello.terrainSize || 2048);
    }
  }

  store.subscribe("hello", update);
  store.subscribe("mapAssets", update);
  return { id: "overview", title: "Map", leafletLayer: group };
}
