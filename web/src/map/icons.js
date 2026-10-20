// @ts-check
// Map symbols: hotspot categories (grouped like the PDA's legend) and the
// vehicle shapes. Everything is inline SVG coloured by CSS (style.css), so
// there are no image files to load.

/**
 * A legend group of PDA hotspots. `categories` are MapHotspot.CATEGORY_*
 * values (Phase 0): ANIMAL 2, MISSION 3, TOUR 4, UNLOADING 9, LOADING 10,
 * PRODUCTION 11, SHOP 12, OTHER 13.
 * @typedef {Object} HotspotGroup
 * @property {string} id
 * @property {string} label
 * @property {number[]} categories
 * @property {string} glyph SVG content drawn in white, viewBox -8 -8 16 16
 */

/** @type {HotspotGroup[]} */
export const HOTSPOT_GROUPS = [
  {
    id: "sell", label: "Sell points", categories: [9],
    glyph: `<text x="0" y="5" text-anchor="middle" font-size="14" font-weight="700">$</text>`,
  },
  {
    id: "loading", label: "Buy & loading points", categories: [10],
    glyph: `<path d="M-1.6,-6 H1.6 V-0.5 H5 L0,5.5 L-5,-0.5 H-1.6 Z" />`,
  },
  {
    id: "production", label: "Productions", categories: [11],
    glyph: `<path d="M-6,6 V-1 L-2,-4 V-1 L2,-4 V-1 L6,-4 V6 Z" />`,
  },
  {
    id: "shop", label: "Shops", categories: [12],
    glyph: `<path d="M-5,-1.5 H5 L4,6 H-4 Z" /><path d="M-2.5,-1.5 V-3 A2.5,2.5 0 0 1 2.5,-3 V-1.5"
      fill="none" stroke="#fff" stroke-width="1.6" />`,
  },
  {
    id: "animal", label: "Animals", categories: [2],
    glyph: `<circle cx="0" cy="2.6" r="3" /><circle cx="-4.2" cy="-1.4" r="1.5" />
      <circle cx="-1.5" cy="-4.6" r="1.5" /><circle cx="1.5" cy="-4.6" r="1.5" />
      <circle cx="4.2" cy="-1.4" r="1.5" />`,
  },
  {
    id: "mission", label: "Missions", categories: [3],
    glyph: `<rect x="-1.3" y="-6" width="2.6" height="8" rx="1" /><circle cx="0" cy="4.6" r="1.5" />`,
  },
  {
    id: "tour", label: "Tour", categories: [4],
    glyph: `<path d="M-4,6.5 V-6 H4.5 L2.5,-3 L4.5,0 H-2.4 V6.5 Z" />`,
  },
  {
    id: "other", label: "Other places", categories: [13],
    glyph: `<circle cx="0" cy="0" r="2.8" />`,
  },
];

/** @type {Map<number, HotspotGroup>} */
const GROUP_BY_CATEGORY = new Map(HOTSPOT_GROUPS.flatMap((g) => g.categories.map((c) => [c, g])));
const OTHER = /** @type {HotspotGroup} */ (HOTSPOT_GROUPS.find((g) => g.id === "other"));

/** The legend group of a category; unknown categories count as "other". */
export function hotspotGroup(/** @type {number} */ category) {
  return GROUP_BY_CATEGORY.get(category) || OTHER;
}

/** @param {HotspotGroup} group */
function hotspotSvg(group, size = 22) {
  return `<svg viewBox="-11 -11 22 22" width="${size}" height="${size}" aria-hidden="true">
    <circle class="badge" r="10" /><g fill="#fff">${group.glyph}</g></svg>`;
}

/**
 * @param {HotspotGroup} group
 * @param {boolean} mine owned by the viewer's farm
 */
export function hotspotIcon(group, mine) {
  return L.divIcon({
    className: `hotspot-marker hs-${group.id}${mine ? " mine" : ""}`,
    html: hotspotSvg(group),
    iconSize: [22, 22],
  });
}

/** Small swatch for the legend. */
export function hotspotSwatch(/** @type {HotspotGroup} */ group) {
  return `<span class="hotspot-marker hs-${group.id}">${hotspotSvg(group, 16)}</span>`;
}

// Vehicles point up (north) at heading 0, like the player arrow.
const VEHICLE_SVG = `<svg viewBox="-10 -10 20 20" width="20" height="20" aria-hidden="true">
  <path d="M0,-9 L6,-2 L6,8 L-6,8 L-6,-2 Z" /></svg>`;
const TOOL_SVG = `<svg viewBox="-10 -10 20 20" width="16" height="16" aria-hidden="true">
  <rect x="-5" y="-6" width="10" height="12" rx="2" /></svg>`;

/** @typedef {"own"|"other"|"tools"} VehicleKind */

/**
 * @param {VehicleKind} kind
 * @param {boolean} ai driven by an AI worker
 */
export function vehicleIcon(kind, ai) {
  const tool = kind === "tools";
  return L.divIcon({
    className: `vehicle-marker vk-${kind}${ai ? " ai" : ""}`,
    html: tool ? TOOL_SVG : VEHICLE_SVG,
    iconSize: tool ? [16, 16] : [20, 20],
  });
}

/** @param {VehicleKind} kind */
export function vehicleSwatch(kind) {
  return `<span class="vehicle-marker vk-${kind}">${kind === "tools" ? TOOL_SVG : VEHICLE_SVG}</span>`;
}

/** @param {string} cls farmland class: mine, other, sale */
export function farmlandSwatch(cls) {
  return `<span class="farmland-swatch fl-${cls}"></span>`;
}
