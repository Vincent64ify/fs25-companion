// @ts-check
// Records the Default theme's layout: the box and key computed styles of
// the header, map, panel, cards and map controls. Run in the browser pane
// before and after a change, then diff the two (docs/THEMES.md,
// Verification: "Default unchanged"). Geometry, not pixels: the replay
// keeps moving.
//
//   const probe = await import("/tools/layoutProbe.js");
//   probe.record()                        // -> {viewport, items}
//   probe.diff(reference, probe.record()) // -> [] when nothing moved

const SELECTORS = [
  "header", "header h1", "#connection", "#banner", "main",
  "#map-wrap", "#map", "#map-hint", "#field-info",
  "#panel", "#panel .card", "#panel .card h2", "#panel .card h3",
  ".gauges", ".gauge span", ".gauge small", "#panel dl div", "#panel dt", "#panel dd", "#impl-card ul",
  ".leaflet-control-zoom", ".leaflet-control-zoom a", ".map-buttons", ".map-buttons button",
  ".map-legend", ".legend-toggle", ".legend-panel", ".legend-section", ".legend-title",
  ".legend-item", ".legend-choice select", ".legend-key-item", ".map-readout",
];

const STYLES = [
  "display", "position", "font-family", "font-size", "font-weight", "line-height", "color",
  "background-color", "background-image", "border-top-width", "border-top-style", "border-top-color",
  "border-bottom-color", "border-radius", "padding", "margin", "box-shadow", "text-transform",
  "letter-spacing", "opacity", "z-index",
];

/** @param {Element} el */
function styleOf(el) {
  const cs = getComputedStyle(el);
  return STYLES.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
}

export function record() {
  /** @type {Record<string, {box: number[], style: string}[]>} */
  const items = {};
  for (const sel of SELECTORS) {
    items[sel] = [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return { box: [r.x, r.y, r.width, r.height].map(Math.round), style: styleOf(el) };
    });
  }
  // the field panel is hidden until a field is tapped: its styles still count
  const info = document.getElementById("field-info");
  if (info) {
    const hidden = info.hidden;
    info.hidden = false;
    items["#field-info (shown)"] = [{ box: [], style: styleOf(info) }];
    info.hidden = hidden;
  }
  return { viewport: [innerWidth, innerHeight], items };
}

/**
 * What differs between two records (boxes may move by `tolerance` px).
 * @param {ReturnType<typeof record>} before
 * @param {ReturnType<typeof record>} after
 */
export function diff(before, after, tolerance = 1) {
  /** @type {string[]} */
  const out = [];
  for (const sel of Object.keys({ ...before.items, ...after.items })) {
    const a = before.items[sel] || [], b = after.items[sel] || [];
    if (a.length !== b.length) out.push(`${sel}: ${a.length} elements, now ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i].box.some((v, k) => Math.abs(v - b[i].box[k]) > tolerance)) {
        out.push(`${sel}[${i}] box ${a[i].box} -> ${b[i].box}`);
      }
      const sa = a[i].style.split(";"), sb = b[i].style.split(";");
      sa.forEach((s, k) => { if (s !== sb[k]) out.push(`${sel}[${i}] ${s} -> ${sb[k]}`); });
    }
  }
  return out;
}
