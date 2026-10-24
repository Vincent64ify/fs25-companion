// @ts-check
// The map's controls fade back while nobody uses them, so the corner they
// sit in stays readable. A pointer over or a tap on a control (or focus in
// one) brings them back at once; they fade again a few seconds after. An
// open panel (Layers) keeps them up. Faded controls still take taps: the
// first tap acts, it doesn't just wake them. Each theme's CSS says how
// faded looks (the map container's class "controls-idle").

const IDLE_MS = 3000;

/** @param {any} map L.Map */
export function fadeIdleControls(map) {
  const el = /** @type {HTMLElement} */ (map.getContainer());
  const corners = el.querySelector(".leaflet-control-container");
  if (!corners) return;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  let inside = false;

  function wake() {
    el.classList.remove("controls-idle");
    clearTimeout(timer);
    timer = setTimeout(rest, IDLE_MS);
  }
  function rest() {
    if (inside || corners?.querySelector('[aria-expanded="true"], .map-legend.open') ||
        corners?.contains(document.activeElement)) {
      timer = setTimeout(rest, IDLE_MS);
      return;
    }
    el.classList.add("controls-idle");
  }

  corners.addEventListener("pointerover", (e) => {
    if (!(/** @type {Element} */ (e.target)).closest(".leaflet-control")) return;
    inside = (/** @type {PointerEvent} */ (e)).pointerType === "mouse";
    wake();
  });
  corners.addEventListener("pointerout", (e) => {
    if (!(/** @type {PointerEvent} */ (e)).relatedTarget ||
        !(/** @type {Element} */ ((/** @type {PointerEvent} */ (e)).relatedTarget)).closest?.(".leaflet-control")) {
      inside = false;
    }
  });
  corners.addEventListener("pointerdown", wake);
  corners.addEventListener("focusin", wake);
  wake();
}
