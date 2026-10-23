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
// the engine block (ISO engine symbol): a neck on a round body
const ENGINE = '<path d="M9 7.2V3.5h6v3.7A7 7 0 1 1 9 7.2z"/>';
// a dial open at the bottom, with ticks
const DIAL = '<path d="M6.3 18.7A8 8 0 1 1 17.7 18.7M12 7.5v1M17.5 13h-1M6.5 13h1"/>' +
  '<circle cx="12" cy="13" r="1.6" fill="currentColor"/>';

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
  engine: ENGINE,
  // a thermometer beside the engine: coolant temperature
  engineTemp: '<path d="M5 3.5v11"/><circle cx="5" cy="17.5" r="2.5"/><path d="M5 7h1.5M5 10h1.5"/>' +
    '<path d="M13.5 9.2V6.5h5v2.7A5.5 5.5 0 1 1 13.5 9.2z"/><path d="M13 15.5c1-.8 2-.8 3 0s2 .8 3 0"/>',
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

  // --- controls ---------------------------------------------------------
  lights: LAMP + '<path d="M10 8L4 10M10 12l-6 2M10 16l-6 2"/>',
  highBeam: LAMP + '<path d="M10 8H4M10 12H4M10 16H4"/>',
  beacon: '<path d="M8 18v-5a4 4 0 0 1 8 0v5M5 19h14M12 3v2.5M5.6 6.6l1.8 1.8M18.4 6.6l-1.8 1.8M3 13h2.5M21 13h-2.5"/>',
  hazard: '<path d="M12 3.5l9 16H3z"/><path d="M12 10l3.6 6.5H8.4z"/>',
  turnLeft: TURN,
  turnRight: `<g transform="matrix(-1 0 0 1 24 0)">${TURN}</g>`,
  // a speedometer held at its set point: the needle runs past the dial
  cruise: DIAL + '<path d="M12 13L5 6"/>',
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
};

/** The icons by group, in the order the contact sheet shows them. */
export const ICON_GROUPS = {
  Vehicle: ["speed", "rpm", "gear", "diesel", "electric", "methane", "engine", "engineTemp",
            "wear", "hours", "position", "tractor"],
  Controls: ["lights", "highBeam", "beacon", "hazard", "turnLeft", "turnRight", "cruise",
             "pto", "hitchUp", "hitchDown", "implementOn", "aiWorker", "engineOn"],
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
