// @ts-check
// Default's map controls, in the map's top-right corner: the Follow and
// Map buttons, then the Layers toggle over the legend panel.

const SMALL_SCREEN_PX = 800;

/**
 * @param {any} map L.Map
 * @param {import("../../map/followControl.js").Follow} follow
 */
export function addFollowButtons(map, follow) {
  const Control = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create("div", "leaflet-bar map-buttons");
      const followBtn = L.DomUtil.create("button", "", bar);
      followBtn.type = "button";
      followBtn.title = "Follow me";
      followBtn.textContent = "Follow";
      const fitBtn = L.DomUtil.create("button", "", bar);
      fitBtn.type = "button";
      fitBtn.title = "Show the whole map";
      fitBtn.textContent = "Map";
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(followBtn, "click", () => follow.setFollowing(!follow.following()));
      L.DomEvent.on(fitBtn, "click", () => follow.wholeMap());
      follow.onChange((on) => {
        followBtn.classList.toggle("active", on);
        followBtn.setAttribute("aria-pressed", String(on));
      });
      return bar;
    },
  });
  new Control({ position: "topright" }).addTo(map);
}

/**
 * @param {any} map L.Map
 * @param {import("../../map/legend.js").Legend} legend
 */
export function addLegendControl(map, legend) {
  const Control = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create("div", "leaflet-bar map-legend");
      const toggle = /** @type {HTMLButtonElement} */ (L.DomUtil.create("button", "legend-toggle", box));
      toggle.type = "button";
      toggle.textContent = "Layers";
      const { panel } = legend;
      box.append(panel);
      const setOpen = (/** @type {boolean} */ open) => {
        box.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", String(open));
      };
      setOpen(legend.wasOpen ?? window.innerWidth > SMALL_SCREEN_PX);
      toggle.addEventListener("click", () => {
        const open = !box.classList.contains("open");
        legend.rememberOpen(open);
        setOpen(open);
      });
      // the panel scrolls inside the map, whatever the map's height
      const fit = () => {
        const top = box.offsetTop || 0;
        panel.style.maxHeight = `${Math.max(100, map.getSize().y - top - 50)}px`;
      };
      map.on("resize", fit);
      requestAnimationFrame(fit);
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      return box;
    },
  });
  new Control({ position: "topright" }).addTo(map);
}
