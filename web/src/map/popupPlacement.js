// @ts-check
// Keeps popups fully inside the map box. Leaflet's autoPan would pan the
// map to show them, but the view can't leave the playable area, so near
// its edges a popup would stay cut off (close button included). Instead
// the popup flips below the point when there's no room above, and slides
// sideways with its tip kept on the point. A box laid over the map (the
// field panel) gets the class "moved" when the popup lands on it; the
// theme's CSS says where it goes. The theme can also keep popups clear of
// a strip along the map's edges (New Holland's toolbar): inset.

const PAD = 8;
/** Leaflet's popup margin + tip, in px (leaflet.css, offset [0, 7]). */
const TIP = 20;
const BELOW_GAP = 13;

/** @typedef {{left: number, top: number, right: number, bottom: number}} Box */

/**
 * How to move a popup drawn above its point so it fits inside the map.
 * @param {Box} popup the popup's box as Leaflet first drew it (above the point)
 * @param {Box} map the map's box
 * @param {number} pointY the point's y (screen px)
 * @returns {{below: boolean, dx: number}}
 */
export function fitPopup(popup, map, pointY) {
  const height = popup.bottom - popup.top;
  // below only when that fits better than above
  const below = popup.top < map.top + PAD
    && pointY + BELOW_GAP + height <= map.bottom - PAD;
  let dx = 0;
  if (popup.left < map.left + PAD) dx = map.left + PAD - popup.left;
  else if (popup.right > map.right - PAD) dx = map.right - PAD - popup.right;
  // keep the tip on the popup, not past its rounded corners
  const room = Math.max(0, (popup.right - popup.left) / 2 - 24);
  dx = Math.max(-room, Math.min(room, dx));
  return { below, dx };
}

/**
 * The box with px taken off each edge.
 * @param {Box} box
 * @param {Partial<Box>} inset
 * @returns {Box}
 */
export function insetBox(box, inset) {
  return {
    left: box.left + (inset.left || 0),
    top: box.top + (inset.top || 0),
    right: box.right - (inset.right || 0),
    bottom: box.bottom - (inset.bottom || 0),
  };
}

/** @param {Box} a @param {Box} b */
export function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * @param {any} map L.Map
 * @param {{avoid?: HTMLElement, inset?: Partial<Box>}} [opts] avoid: box
 *   over the map that moves aside (class "moved") when an open popup lands
 *   on it; inset: px along each edge that popups keep clear of
 */
export function keepPopupsInside(map, opts = {}) {
  const { avoid, inset = {} } = opts;
  // every popup: Leaflet pans before "popupopen" fires
  L.Popup.prototype.options.autoPan = false;

  /** @param {any} popup L.Popup */
  function place(popup) {
    const el = popup.getElement();
    if (!el || !map.hasLayer(popup)) return;
    if (!popup._baseOffset) popup._baseOffset = L.point(popup.options.offset);
    const base = popup._baseOffset;
    // first as Leaflet draws it: above the point, centred
    el.classList.remove("popup-below");
    const tip = el.querySelector(".leaflet-popup-tip-container");
    if (tip) tip.style.marginLeft = "";
    popup.options.offset = base;
    popup.update();

    const box = el.getBoundingClientRect();
    const outer = map.getContainer().getBoundingClientRect();
    const mapBox = insetBox(outer, inset);
    const pointY = outer.top + map.latLngToContainerPoint(popup.getLatLng()).y;
    const { below, dx } = fitPopup(box, mapBox, pointY);
    if (below || dx) {
      const height = box.bottom - box.top;
      const y = below ? height + TIP + BELOW_GAP : base.y;
      el.classList.toggle("popup-below", below);
      if (tip) tip.style.marginLeft = `${-20 - dx}px`;
      popup.options.offset = L.point(base.x + dx, y);
      popup.update();
    }
    if (avoid && !avoid.hidden) {
      avoid.classList.remove("moved");
      if (overlaps(el.getBoundingClientRect(), avoid.getBoundingClientRect())) {
        avoid.classList.add("moved");
      }
    }
  }

  /** @type {any} */
  let open = null;
  map.on("popupopen", (/** @type {any} */ e) => {
    open = e.popup;
    // after this click's other handlers (the field panel opens on it too)
    requestAnimationFrame(() => place(e.popup));
  });
  map.on("popupclose", (/** @type {any} */ e) => {
    if (open === e.popup) open = null;
  });
  map.on("zoomend moveend resize", () => {
    if (open) place(open);
  });
}
