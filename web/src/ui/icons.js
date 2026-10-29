// @ts-check
// Our own icon set (docs/THEMES.md, Icons). Every icon is drawn on a
// 24 × 24 grid with 2 px strokes, round caps and joins, in currentColor, so
// a theme colours it with CSS `color`. Nothing comes from the game.
//
//   icon("beacon")                      // decorative, aria-hidden
//   icon("beacon", {title: "Beacon"})   // announced to screen readers

const SVG_NS = "http://www.w3.org/2000/svg";

// Shared parts, reused where two icons differ by one detail.
const LAMP = '<path d="M14 6c4.5 0 7 2.7 7 6s-2.5 6-7 6z"/>';
const IMPLEMENT = '<path d="M4 16h16M7 16v3.5M12 16v3.5M17 16v3.5"/>';
const TURN = '<path d="M3 12l7-7v4h10v6H10v4z"/>';
// the rear lift arm over the ground line (ISO hitch symbol)
const HITCH = '<path d="M4.6 18.8l7.8-7.8a2 2 0 0 0-2.8-2.8l-7.8 7.8a2 2 0 0 0 2.8 2.8zM6 21.5h9"/>';
/** A small splined gear: a toothed ring (six dashes) round a hub. */
const gear = (cx, cy) =>
  `<circle cx="${cx}" cy="${cy}" r="3.6" stroke-width="2.4" stroke-linecap="butt" pathLength="6" stroke-dasharray=".45 .55"/>` +
  `<circle cx="${cx}" cy="${cy}" r="2.2"/>`;
/** A filled dot with no stroke, for the point of a "!". */
const DOT = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="1.4" fill="currentColor" stroke="none"/>`;
// the engine block (ISO engine symbol): a neck on a round body
const ENGINE = '<path d="M9 7.2V3.5h6v3.7A7 7 0 1 1 9 7.2z"/>';
/** The same stroke markup turned round the centre n times, evenly. */
const around = (n, markup) =>
  Array.from({ length: n }, (_, i) => `<g transform="rotate(${(360 / n) * i} 12 12)">${markup}</g>`).join("");
// a cloud: one big puff between two small ones, flat underneath
const CLOUD = '<path d="M7 18.5h10.5a3.8 3.8 0 0 0 .3-7.6A5.6 5.6 0 0 0 6.9 11a3.75 3.75 0 0 0 .1 7.5z"/>';
/** The cloud raised by dy, for rain, fog and storm underneath. */
const cloudUp = (dy) => `<g transform="translate(0 ${-dy})">${CLOUD}</g>`;
// a dial open at the bottom, with ticks
const DIAL_RIM = '<path d="M6.3 18.7A8 8 0 1 1 17.7 18.7M12 7.5v1M17.5 13h-1M6.5 13h1"/>';
const DIAL = DIAL_RIM + '<circle cx="12" cy="13" r="1.6" fill="currentColor"/>';

/** Inner markup of each icon, in the 24 × 24 box. */
const PATHS = {
  // --- vehicle ----------------------------------------------------------
  speed: DIAL + '<path d="M12 13l3.6-4.4"/>',
  // the engine, turning: engine speed
  rpm: ENGINE + '<path d="M14.6 12.2A3 3 0 1 1 12.5 10.8M10.8 11.8l1.7-1 -1.3-1.5"/>',
  // the transmission menu's cog, with the shift arrow
  gear: '<circle cx="12" cy="12" r="9" stroke-width="2.4" stroke-linecap="butt" pathLength="12" stroke-dasharray=".45 .55"/>' +
    '<circle cx="12" cy="12" r="7"/><path d="M12 16V8.5M9.2 11.2L12 8.4l2.8 2.8"/>',
  // the fuel pump
  diesel: '<path d="M4.5 21V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13.5 5v16M3 21h12M7 7h4v4H7z"/>' +
    '<path d="M13.5 11h1.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 0 3 0V8l-2.5-3"/>',
  electric: '<path d="M13 2.5L5.5 13.5h6l-1 8 8-11h-6z"/>',
  // a gas cylinder with its valve
  methane: '<rect x="7" y="7" width="10" height="14.5" rx="4"/><path d="M10 7V3.5h4V7M7 12h10"/>',
  // a drop with its fill line: DEF (AdBlue)
  def: '<path d="M12 3c3.5 4.4 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.6 6-11z"/>' +
    '<path d="M8 14.5c1.3-.9 2.7-.9 4 0s2.7.9 4 0"/>',
  // a hopper with its fill line: a fill level (tank, trailer, grain tank)
  fill: '<path d="M3.5 4.5h17l-3.5 12H7z"/><path d="M5.3 10.5h13.4M10 16.5v3.5h4v-3.5"/>',
  engine: ENGINE,
  // a thermometer standing in the coolant: coolant temperature (ISO 7000)
  engineTemp: '<path d="M12 3v9.5M12 5.5h3M12 9h3"/><circle cx="12" cy="15" r="2.5"/>' +
    '<path d="M2.5 15.5c1.4-.9 2.8-.9 4.2 0M17.3 15.5c1.4-.9 2.8-.9 4.2 0' +
    'M2.5 20c1.6-1 3.2-1 4.8 0s3.2 1 4.8 0 3.2-1 4.8 0 3.2 1 4.6 0"/>',
  // an open-ended spanner
  wear: '<path d="M15.4 5.6l1.8-1.8A5 5 0 1 0 20.2 6.8l-1.8 1.8z"/><path d="M12 12L4.5 19.5"/>',
  // an hourglass: the hour meter
  hours: '<path d="M6.5 3h11M6.5 21h11M8 3c0 5 3 6 4 9-1 3-4 4-4 9M16 3c0 5-3 6-4 9 1 3 4 4 4 9"/>' +
    '<path d="M10 19h4" />',
  // a map pin
  position: '<path d="M12 21.5s-6.5-6-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11.2-6.5 11.2z"/><circle cx="12" cy="10.3" r="2.3"/>',
  // side view: cab, bonnet, exhaust, big rear wheel and small front wheel
  tractor: '<path d="M3 12.5V3.5h8l1.5 8h8V15M16.5 11.5V8"/><circle cx="7" cy="16.5" r="4.5"/>' +
    '<circle cx="7" cy="16.5" r="1" fill="currentColor"/><circle cx="18.5" cy="18" r="2.8"/>',

  // --- vehicle types: the Vehicle screen's card and implement rows --------
  // side view, facing right like the tractor: body, cab, reel over the
  // cutter bar, big front wheel
  harvester: '<path d="M2.5 12.5V6.5h7V3h5v9.5zM14.5 9.5h2.5M16.5 15.5h6"/><circle cx="19.5" cy="9.5" r="2.5"/>' +
    '<circle cx="10.5" cy="18" r="3"/><circle cx="4.5" cy="19" r="2"/>',
  // a wheel loader: cab, boom up front, the bucket raised
  loader: '<path d="M2.5 14V9.5h4V4H12v10zM12 11.5l4.5-5M15.5 3h6l-1 6h-3.5z"/>' +
    '<circle cx="6.5" cy="18.5" r="2.5"/><circle cx="16" cy="18.5" r="2.5"/>',
  // a tipping trailer on its drawbar
  trailer: '<path d="M7 5.5h14.5v9H7zM7 12.5l-4.5 2"/><circle cx="12" cy="18" r="2.5"/><circle cx="17.5" cy="18" r="2.5"/>',
  // a lorry: the box, then the cab with its window
  truck: '<path d="M2.5 5h11.5v10.5H2.5zM14 8.5h4.5l3 3.5v3.5H14M16.5 8.5v3.5h5"/>' +
    '<circle cx="6.5" cy="18.5" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/>',
  // any tool: a frame on its hitch, with tines
  implement: '<path d="M3 6h13.5v6.5H3zM16.5 9.25H21M5.5 12.5v6M9.75 12.5v6M14 12.5v6"/>',
  // a front weight: the classic weight with its handle
  weight: '<path d="M7.5 9h9l3 11.5h-15z"/><circle cx="12" cy="5.5" r="2.5"/>',

  // --- alerts -----------------------------------------------------------
  // the general warning: a "!" in a triangle (ISO 7010 W001)
  warn: '<path d="M10.3 4.1l-8 13.9A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-13.9a2 2 0 0 0-3.4 0z"/>' +
    '<path d="M12 9.5v4.5"/>' + DOT(12, 17.4),
  // the charge warning: battery with its terminals
  battery: '<rect x="2.5" y="7" width="19" height="13" rx="1.5"/><path d="M6 7V4.5h3V7M15 7V4.5h3V7M5.5 13.5h3.5M15 13.5h3.5M16.75 11.75v3.5"/>',
  // oil pressure: a drop in the engine, pressed from both sides
  oil: '<path d="M9.5 7.5V4h5v3.5A6 6 0 1 1 9.5 7.5z"/>' +
    '<path d="M12 9.8c-1.5 2-2.2 3.2-2.2 4.3a2.2 2.2 0 0 0 4.4 0c0-1.1-.7-2.3-2.2-4.3z"/>' +
    '<path d="M1.5 13H4M22.5 13H20M2.6 11.5L4 13l-1.4 1.5M21.4 11.5L20 13l1.4 1.5"/>',
  checkEngine: ENGINE + '<path d="M12 9.5v3.5"/>' + DOT(12, 16.6),
  // frost: a six-armed snowflake
  snow: around(6, '<path d="M12 12V2.8M9.6 4.6L12 7l2.4-2.4"/>'),

  // --- status bar -------------------------------------------------------
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2.2"/>',
  // a calendar page: the in-game day
  day: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>' +
    '<rect x="7" y="13" width="3.5" height="3.5" rx=".5" fill="currentColor" stroke="none"/>',
  // a leaf: the season
  season: '<path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14zM5 19l7.5-7.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/>' + around(8, '<path d="M12 2.8v2.2"/>'),
  cloudy: CLOUD,
  rain: cloudUp(4) + '<path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/>',
  fog: cloudUp(5) + '<path d="M4 17h12M8 20.5h12"/>',
  storm: cloudUp(4) + '<path d="M14 14.5l-3.5 4h4l-3 4"/>',
  // a thermometer: the air temperature
  temperature: '<path d="M10 14.6V5a2 2 0 0 1 4 0v9.6a3.6 3.6 0 1 1-4 0z"/><path d="M12 16.5V9M17 6h2.5M17 9.5h2.5"/>',
  // a wallet: the farm's balance, whatever the currency
  money: '<path d="M17.5 7.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5a2.5 2.5 0 0 0 0 5H19a1.5 1.5 0 0 1 1.5 1.5v8.5' +
    'A1.5 1.5 0 0 1 19 20.5H5.5A2.5 2.5 0 0 1 3 18V6.5"/><path d="M20.5 12.5h-3.5a2 2 0 0 0 0 4h3.5"/>',
  // the signal arcs of the terminal's connectivity status
  connection: '<path d="M8.5 15a4.95 4.95 0 0 1 7 0M5.5 12a9.2 9.2 0 0 1 13 0M2.5 9a13.4 13.4 0 0 1 19 0"/>' +
    '<circle cx="12" cy="18.5" r="1.6" fill="currentColor" stroke="none"/>',
  // sliders (the Settings button, T0)
  settings: '<path d="M4 7h3M11 7h9M4 12h9M17 12h3M4 17h1M9 17h11"/>' +
    '<circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="17" r="2"/>',
  // half lit, half dark: the Day / Night switch
  dayNight: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
  // four corners pointing out, then in: full screen and leaving it (T5)
  fullscreen: '<path d="M3.5 9V3.5H9M15 3.5h5.5V9M20.5 15v5.5H15M9 20.5H3.5V15"/>',
  exitFullscreen: '<path d="M9 3.5V9H3.5M20.5 9H15V3.5M15 20.5V15h5.5M3.5 15H9v5.5"/>',
  // an open eye: the screen stays on
  keepAwake: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',

  // --- map and tabs -----------------------------------------------------
  // a folded map: the Map tab
  map: '<path d="M3 6.5L9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20"/>',
  zoomIn: '<path d="M12 5v14M5 12h14"/>',
  zoomOut: '<path d="M5 12h14"/>',
  // the terminal's "centre on vehicle" crosshair
  recentre: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>' +
    '<circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  // a field fitted in the view's corners: show the whole map
  wholeMap: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><path d="M8 9.5l7.5-1.5 .5 7.5-8 .5z"/>',
  // stacked sheets: the map layers
  layers: '<path d="M12 3.5l9 4.5-9 4.5L3 8zM3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5"/>',

  // --- controls ---------------------------------------------------------
  lights: LAMP + '<path d="M10 8L4 10M10 12l-6 2M10 16l-6 2"/>',
  highBeam: LAMP + '<path d="M10 8H4M10 12H4M10 16H4"/>',
  beacon: '<path d="M8 18v-5a4 4 0 0 1 8 0v5M5 19h14M12 3v2.5M5.6 6.6l1.8 1.8M18.4 6.6l-1.8 1.8M3 13h2.5M21 13h-2.5"/>',
  hazard: '<path d="M12 3.5l9 16H3z"/><path d="M12 10l3.6 6.5H8.4z"/>',
  turnLeft: TURN,
  turnRight: `<g transform="matrix(-1 0 0 1 24 0)">${TURN}</g>`,
  // a speedometer held at its set point: the needle runs past the dial
  cruise: DIAL + '<path d="M12 13L5 6"/>',
  // the cruise dial with a minus or a plus: the set speed one step down or up
  cruiseDown: DIAL_RIM + '<path d="M9 14h6"/>',
  cruiseUp: DIAL_RIM + '<path d="M9 14h6M12 11v6"/>',
  // a folded implement from behind: the wings stand up on their hinges,
  // the dashed arcs are their swing down to work
  fold: '<path d="M8 18h8M8 18V9.5M16 18V9.5M10.5 18v2.5M13.5 18v2.5"/>' +
    '<path d="M8 9.5a8.5 8.5 0 0 0-6 2.5M16 9.5a8.5 8.5 0 0 1 6 2.5" stroke-dasharray="1.6 2"/>',
  // a ball on its bar, before a coupling ring open towards it: attach and
  // detach, traced from the game's own Attach Tool prompt (filled, no stroke)
  hitch: '<g fill="currentColor" stroke="none"><rect x="1" y="11" width="4" height="2"/>' +
    '<circle cx="7.2" cy="12" r="3.2"/>' +
    '<path d="M11 9.8A6 6 0 1 1 11 14.2H13.5A3.8 3.8 0 1 0 13.5 9.8z"/></g>',
  // the PTO housing over a splined shaft (ISO PTO symbol)
  pto: '<path d="M4 19.5V6h16v13.5"/>' + gear(12, 13.5),
  hitchUp: HITCH + '<path d="M19 15.5V4M15.5 7.5L19 4l3.5 3.5"/>',
  hitchDown: HITCH + '<path d="M19 4v11.5M15.5 12l3.5 3.5 3.5-3.5"/>',
  // a gear turning: the implement is working
  implementOn: '<path d="M18.9 8A8 8 0 1 1 15.2 4.7M16.1 7l2.8 1 .5-2.9"/>' + gear(12, 12),
  // a worker in a cap
  aiWorker: '<circle cx="12" cy="9.5" r="3.5"/><path d="M8.5 9.5a3.5 3.5 0 0 1 7 0zM15.5 9.5H18" fill="currentColor"/>' +
    '<path d="M5 20.5a7 7 0 0 1 14 0"/>',
  // the engine block (ISO engine symbol)
  engineOn: ENGINE,
  // the previous or next tool (G): a chevron over the implement's tines
  toolPrev: IMPLEMENT + '<path d="M14.5 3.5L9.5 8l5 4.5"/>',
  toolNext: IMPLEMENT + '<path d="M9.5 3.5l5 4.5-5 4.5"/>',
  // --- the Implement screen ---------------------------------------------
  // every tool down together (lit: one is lowered)
  lowerAll: IMPLEMENT + '<path d="M8 3.5v8M5 8.5l3 3 3-3M16 3.5v8M13 8.5l3 3 3-3"/>',
  // a combine's unloading pipe, grain falling from its end
  pipe: '<path d="M4 21V5.5h16v5H8.5V21"/>' + DOT(15.5, 14.5) + DOT(18.5, 16.5) + DOT(16, 19.5),
  // a tipping body, its load going down: unloading, tipping
  unload: '<path d="M3 13.5L15.5 6l3 5L6 18.5z"/><circle cx="9" cy="20" r="1.8"/>' +
    '<path d="M20 13.5v7M17.5 18l2.5 2.5 2.5-2.5"/>',
  // a swath of straw on the stubble, its stalks: the straw swath
  straw: '<path d="M3 18.5h18M4.5 18.5c1.5-5 13.5-5 15 0"/><path d="M8 13.5L6.5 6M12 13V4.5M16 13.5L17.5 6"/>',
  // a body under its rolled cover
  cover: '<path d="M3 11h18v7.5H3zM3 11c0-3.5 4-5.5 9-5.5s9 2 9 5.5M12 5.5V11"/>',
  // a padlock: the game's MAX, a tool at its weight limit
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  // the working width, wall to wall
  workWidth: '<path d="M3 6.5v11M21 6.5v11M3 12h18M6.5 8.5L3 12l3.5 3.5M17.5 8.5L21 12l-3.5 3.5"/>',
  // a hatched square: the area worked (ISO 7000)
  area: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M5 10.5L10.5 5M5 19L19 5M13.5 19l5.5-5.5"/>',
  // a tipper's body over the ground, the way it tips stepping on: the tip side
  tipSide: '<path d="M5 15.5h14l-2-6H7z"/><path d="M3 19.5h18M9 3.5l-3 3 3 3M15 3.5l3 3-3 3"/>',
  // turning over: a plow's rotate
  rotate: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19.5 3.5v4h-4"/>',
  // back to zero: a counter's reset
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v3.7h3.7"/><path d="M12 8.5V12l2.5 2"/>',
};

/** The icons by group, in the order the contact sheet shows them. */
export const ICON_GROUPS = {
  Vehicle: ["speed", "rpm", "gear", "diesel", "electric", "methane", "def", "fill", "engine", "engineTemp",
            "wear", "hours", "position", "tractor"],
  "Vehicle types": ["harvester", "loader", "trailer", "truck", "implement", "weight"],
  Alerts: ["warn", "battery", "oil", "checkEngine", "snow"],
  "Status bar": ["clock", "day", "season", "sun", "cloudy", "rain", "fog", "storm",
                 "temperature", "money", "connection", "settings", "dayNight",
                 "fullscreen", "exitFullscreen", "keepAwake"],
  "Map and tabs": ["map", "zoomIn", "zoomOut", "recentre", "wholeMap", "layers"],
  Controls: ["lights", "highBeam", "beacon", "hazard", "turnLeft", "turnRight", "cruise",
             "cruiseDown", "cruiseUp", "pto", "hitchUp", "hitchDown", "fold", "hitch", "implementOn",
             "aiWorker", "engineOn", "toolPrev", "toolNext"],
  "Implement screen": ["lowerAll", "pipe", "unload", "cover", "straw", "lock", "workWidth", "area"],
  "Vehicle page": ["tipSide", "rotate", "reset"],
};

/** @param {string} name */
export const hasIcon = (name) => Object.hasOwn(PATHS, name);

const warned = new Set();

/**
 * An inline <svg> for the icon. An unknown name gives an empty one of the
 * same size, so the layout never moves, and is logged once.
 * @param {string} name
 * @param {{title?: string}} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, { title } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", class: "icon",
  })) svg.setAttribute(k, v);
  svg.dataset.icon = name;
  if (hasIcon(name)) {
    svg.innerHTML = PATHS[/** @type {keyof typeof PATHS} */ (name)];
  } else if (!warned.has(name)) {
    warned.add(name);
    console.warn(`icon: no icon named "${name}"`);
  }
  if (title) {
    const t = document.createElementNS(SVG_NS, "title");
    t.textContent = title;
    svg.prepend(t);
    svg.setAttribute("role", "img");
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  return svg;
}
