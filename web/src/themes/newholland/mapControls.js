// @ts-check
// New Holland style's map controls: one floating toolbar on the map's
// left edge (zoom in and out; recentre, which follows, and whole map;
// layers), the Layers panel beside it, and a scale bar bottom-right.

import { icon } from "../../ui/icons.js";

/** The toolbar's strip along the map's left edge, for popups to keep clear of. */
export const TOOLBAR_INSET = { left: 76 };

/**
 * @param {string} name icon
 * @param {string} label
 * @param {HTMLElement} parent
 */
function toolButton(name, label, parent) {
  const b = /** @type {HTMLButtonElement} */ (L.DomUtil.create("button", "tool", parent));
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(icon(name));
  return b;
}

/**
 * @param {any} map L.Map
 * @param {import("../../map/followControl.js").Follow} follow
 * @param {import("../../map/legend.js").Legend} legend
 */
export function addEdgeControls(map, follow, legend) {
  const Control = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create("div", "edge-controls");
      const bar = L.DomUtil.create("div", "edge-toolbar", box);
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", "Map");
      const zoomIn = toolButton("zoomIn", "Zoom in", bar);
      const zoomOut = toolButton("zoomOut", "Zoom out", bar);
      L.DomUtil.create("span", "tool-sep", bar);
      const recentre = toolButton("recentre", "Recentre and follow", bar);
      const whole = toolButton("wholeMap", "Whole map", bar);
      L.DomUtil.create("span", "tool-sep", bar);
      const layers = toolButton("layers", "Layers", bar);

      const panel = L.DomUtil.create("div", "edge-legend", box);
      panel.id = "map-layers";
      panel.append(legend.panel);
      layers.setAttribute("aria-controls", panel.id);
      const setOpen = (/** @type {boolean} */ open) => {
        panel.hidden = !open;
        layers.setAttribute("aria-expanded", String(open));
      };
      // starts closed: over the map it hides what you'd look at
      setOpen(false);

      L.DomEvent.on(zoomIn, "click", () => { follow.userZoom(); map.zoomIn(); });
      L.DomEvent.on(zoomOut, "click", () => { follow.userZoom(); map.zoomOut(); });
      L.DomEvent.on(recentre, "click", () => follow.recentre());
      L.DomEvent.on(whole, "click", () => follow.wholeMap());
      L.DomEvent.on(layers, "click", () => setOpen(panel.hidden));
      follow.onChange((on) => recentre.setAttribute("aria-pressed", String(on)));

      // the panel scrolls inside the map, whatever the map's height
      const fit = () => { panel.style.maxHeight = `${Math.max(120, map.getSize().y - 24)}px`; };
      map.on("resize", fit);
      requestAnimationFrame(fit);
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      return box;
    },
  });
  new Control({ position: "topleft" }).addTo(map);
  L.control.scale({ position: "bottomright", imperial: false, maxWidth: 120 }).addTo(map);
}
