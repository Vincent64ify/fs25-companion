// @ts-check
// The legend: one checkbox per layer, or per item of a layer that has
// legend items (hotspot groups, vehicle kinds, farmland classes), plus a
// layer's drop-down and colour key (the fields' colour mode). Choices are
// remembered in localStorage, as is whether the panel is open.

/** @typedef {import("../types.js").MapLayer} MapLayer */

const STORAGE_KEY = "fs25companion.legend";
const SMALL_SCREEN_PX = 800;

/** @typedef {{open?: boolean, on?: Record<string, boolean>, choice?: Record<string, string>}} LegendState */

/** @returns {LegendState} */
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function save(/** @type {LegendState} */ state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

/**
 * @param {any} map L.Map
 * @param {MapLayer[]} layers in legend order; every leafletLayer is on the map
 */
export function createLegend(map, layers) {
  const state = load();
  state.on = state.on || {};
  const isOn = (/** @type {string} */ key, /** @type {boolean} */ fallback) =>
    typeof state.on?.[key] === "boolean" ? state.on[key] : fallback;

  /**
   * @param {HTMLElement} parent
   * @param {string} key
   * @param {string} label
   * @param {string} swatch trusted HTML (icons.js), may be empty
   * @param {boolean} on
   * @param {(on: boolean) => void} apply
   */
  function checkbox(parent, key, label, swatch, on, apply) {
    const row = L.DomUtil.create("label", "legend-item", parent);
    const input = /** @type {HTMLInputElement} */ (L.DomUtil.create("input", "", row));
    input.type = "checkbox";
    input.checked = on;
    if (swatch) L.DomUtil.create("span", "legend-swatch", row).innerHTML = swatch;
    L.DomUtil.create("span", "legend-label", row).textContent = label;
    input.addEventListener("change", () => {
      /** @type {Record<string, boolean>} */ (state.on)[key] = input.checked;
      save(state);
      apply(input.checked);
    });
    apply(on);
  }

  /**
   * @param {HTMLElement} parent
   * @param {string} layerId
   * @param {import("../types.js").LegendChoice} choice
   */
  function select(parent, layerId, choice) {
    const key = `${layerId}.${choice.id}`;
    const saved = state.choice?.[key];
    const value = choice.options.some((o) => o.id === saved) ? /** @type {string} */ (saved) : choice.defaultValue;
    const row = L.DomUtil.create("label", "legend-choice", parent);
    L.DomUtil.create("span", "legend-label", row).textContent = choice.label;
    const input = /** @type {HTMLSelectElement} */ (L.DomUtil.create("select", "", row));
    for (const o of choice.options) {
      const option = document.createElement("option");
      option.value = o.id;
      option.textContent = o.label;
      input.append(option);
    }
    input.value = value;
    input.addEventListener("change", () => {
      state.choice = { ...state.choice, [key]: input.value };
      save(state);
      choice.set(input.value);
    });
    choice.set(value);
  }

  const Control = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create("div", "leaflet-bar map-legend");
      const toggle = /** @type {HTMLButtonElement} */ (L.DomUtil.create("button", "legend-toggle", box));
      toggle.type = "button";
      toggle.textContent = "Layers";
      const panel = L.DomUtil.create("div", "legend-panel", box);
      const setOpen = (/** @type {boolean} */ open) => {
        box.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", String(open));
      };
      setOpen(state.open ?? window.innerWidth > SMALL_SCREEN_PX);
      toggle.addEventListener("click", () => {
        state.open = !box.classList.contains("open");
        save(state);
        setOpen(state.open);
      });

      for (const layer of layers) {
        const section = L.DomUtil.create("div", "legend-section", panel);
        if (!layer.legendItems?.length) {
          checkbox(section, layer.id, layer.title, "", isOn(layer.id, true), (on) => {
            if (on) map.addLayer(layer.leafletLayer);
            else map.removeLayer(layer.leafletLayer);
          });
          continue;
        }
        L.DomUtil.create("div", "legend-title", section).textContent = layer.title;
        for (const item of layer.legendItems) {
          const key = `${layer.id}.${item.id}`;
          checkbox(section, key, item.label, item.swatch || "", isOn(key, item.defaultOn !== false),
            item.setVisible);
        }
        if (layer.legendChoice) select(section, layer.id, layer.legendChoice);
        if (layer.legendExtra) section.append(layer.legendExtra);
      }
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
