// @ts-check
// Every vehicle on the map except the one the player drives (the player
// arrow is that one) and implements hitched to another vehicle (the PDA
// shows only what pulls them). Updates arrive twice a second; each marker
// glides between them. Tap a vehicle for its name and speed.

import { worldToLatLng } from "../mapView.js";
import { createGlide, showPose } from "../glide.js";
import { vehicleIcon, vehicleSwatch } from "../icons.js";
import { myFarmId } from "../../store.js";

/** @typedef {import("../../types.js").Vehicle} Vehicle */
/** @typedef {import("../icons.js").VehicleKind} VehicleKind */
/** @typedef {import("../glide.js").Pose} Pose */

/**
 * @typedef {Object} Track
 * @property {any} marker L.Marker
 * @property {ReturnType<typeof createGlide>} glide
 * @property {VehicleKind} kind
 * @property {boolean} ai
 * @property {Vehicle} data
 * @property {Pose|null} shown
 */

/** @type {{id: VehicleKind, label: string}[]} */
const KINDS = [
  { id: "own", label: "Your vehicles" },
  { id: "other", label: "Other farms' vehicles" },
  { id: "tools", label: "Implements & trailers" },
];

/** @param {Vehicle} v @param {number} farmId @returns {VehicleKind} */
function kindOf(v, farmId) {
  if (v.motorized === false) return "tools";
  return v.farmId === farmId ? "own" : "other";
}

/** @param {Vehicle} v */
function popupContent(v) {
  const div = document.createElement("div");
  div.className = "vehicle-popup";
  const name = document.createElement("strong");
  name.textContent = v.name || v.typeName || "Vehicle";
  div.append(name);
  const lines = [];
  if (v.isAI) lines.push("AI worker");
  if (typeof v.speed === "number") lines.push(`${Math.round(v.speed)} km/h`);
  if (v.typeName && v.name) lines.push(v.typeName);
  for (const text of lines) {
    const line = document.createElement("div");
    line.textContent = text;
    div.append(line);
  }
  return div;
}

/**
 * @param {any} map L.Map
 * @param {import("../../store.js").Store} store
 */
export function createVehiclesLayer(map, store) {
  map.createPane("vehicles").style.zIndex = "620";
  /** @type {Record<VehicleKind, any>} */
  const groups = { own: L.layerGroup(), other: L.layerGroup(), tools: L.layerGroup() };
  const root = L.layerGroup(Object.values(groups));
  /** @type {Map<string, Track>} */
  const tracks = new Map();

  store.subscribe("vehicles", (/** @type {{vehicles?: Vehicle[], controlledId?: any}|undefined} */ topic) => {
    const now = performance.now();
    const farmId = myFarmId(store);
    const seen = new Set();
    for (const v of topic?.vehicles || []) {
      if (typeof v.x !== "number" || typeof v.z !== "number") continue;
      if (v.id === topic?.controlledId || v.attached) continue;
      const key = String(v.id);
      seen.add(key);
      const kind = kindOf(v, farmId);
      const ai = !!v.isAI;
      let track = tracks.get(key);
      if (!track) {
        const marker = L.marker(worldToLatLng(v.x, v.z), {
          icon: vehicleIcon(kind, ai), pane: "vehicles", keyboard: false,
        });
        const t = /** @type {Track} */ ({ marker, glide: createGlide({ maxGlideMs: 700 }), kind, ai, data: v, shown: null });
        marker.bindPopup(() => popupContent(t.data), { offset: [0, -6] });
        groups[kind].addLayer(marker);
        tracks.set(key, t);
        track = t;
      } else if (track.kind !== kind || track.ai !== ai) {
        groups[track.kind].removeLayer(track.marker);
        track.marker.setIcon(vehicleIcon(kind, ai));
        groups[kind].addLayer(track.marker);
        track.kind = kind;
        track.ai = ai;
        track.shown = null; // a new icon element: rotate it again
      }
      track.data = v;
      track.glide.push(v, now);
      if (track.marker.isPopupOpen()) track.marker.setPopupContent(popupContent(v));
    }
    for (const [key, track] of tracks) {
      if (seen.has(key)) continue;
      groups[track.kind].removeLayer(track.marker);
      tracks.delete(key);
    }
  });

  /** Called every animation frame by main.js. */
  function tick(/** @type {number} */ now) {
    for (const track of tracks.values()) {
      const pose = track.glide.at(now);
      if (pose) track.shown = showPose(track.marker, pose, track.shown, worldToLatLng);
    }
  }

  return {
    id: "vehicles",
    title: "Vehicles",
    leafletLayer: root,
    tick,
    legendItems: KINDS.map((k) => ({
      id: k.id,
      label: k.label,
      swatch: vehicleSwatch(k.id),
      setVisible: (/** @type {boolean} */ on) => {
        if (on) root.addLayer(groups[k.id]);
        else root.removeLayer(groups[k.id]);
      },
    })),
  };
}
