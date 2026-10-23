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

/** Inner markup of each icon, in the 24 × 24 box. */
const PATHS = {
  // --- controls ---------------------------------------------------------
  lights: LAMP + '<path d="M10 8L4 10M10 12l-6 2M10 16l-6 2"/>',
  highBeam: LAMP + '<path d="M10 8H4M10 12H4M10 16H4"/>',
  beacon: '<path d="M8 18v-5a4 4 0 0 1 8 0v5M5 19h14M12 3v2.5M5.6 6.6l1.8 1.8M18.4 6.6l-1.8 1.8M3 13h2.5M21 13h-2.5"/>',
  hazard: '<path d="M12 3.5l9 16H3z"/><path d="M12 10l3.6 6.5H8.4z"/>',
  turnLeft: TURN,
  turnRight: `<g transform="matrix(-1 0 0 1 24 0)">${TURN}</g>`,
  // a speedometer held at its set point: the needle runs past the dial
  cruise: '<path d="M6.3 18.7A8 8 0 1 1 17.7 18.7M12 7.5v1M17.5 13h-1M6.5 13h1M15.9 9.1l-.7.7"/>' +
    '<path d="M12 13L5 6"/><circle cx="12" cy="13" r="1.6" fill="currentColor"/>',
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
  engineOn: '<path d="M9 7.2V3.5h6v3.7A7 7 0 1 1 9 7.2z"/>',
};

/** The icons by group, in the order the contact sheet shows them. */
export const ICON_GROUPS = {
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
