// @ts-check
// About the screen itself, not the game: the full-screen button for a
// status bar (ui/screenMode.js). Hidden where the browser has no full
// screen (iPhones), and in the home-screen app, which already has none of
// the browser's bars.

import { fullscreenCloseButton, fullscreenOffered, isFullscreen, onFullscreenChange, toggleFullscreen } from "../ui/screenMode.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

/**
 * Pressed while in full screen; the icon turns to "leave". While in full
 * screen, the page's root carries data-fullscreen ("close-button" where
 * Safari draws its X top-left), so a theme can keep its corner clear.
 * @type {import("./widget.js").CreateWidget}
 */
export function fullscreen(_store, opts = {}) {
  const button = /** @type {HTMLButtonElement} */ (h("button", { className: "status-button fullscreen-button" }));
  button.type = "button";
  if (opts.id) button.id = opts.id;
  const render = () => {
    const on = isFullscreen();
    button.replaceChildren(icon(on ? "exitFullscreen" : "fullscreen"));
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "Leave full screen" : "Full screen";
    button.setAttribute("aria-label", "Full screen");
    const root = document.documentElement;
    if (on) root.dataset.fullscreen = fullscreenCloseButton() ? "close-button" : "on";
    else delete root.dataset.fullscreen;
  };
  render();
  button.hidden = !fullscreenOffered();
  onFullscreenChange(render);
  button.addEventListener("click", () => toggleFullscreen());
  return button;
}
