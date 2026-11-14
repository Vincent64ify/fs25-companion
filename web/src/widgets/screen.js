// @ts-check
// About the screen itself, not the game: the status bar's screen button
// (ui/screenMode.js). Full screen where the browser's full screen works;
// Install in Safari on an iPad or iPhone, where a swipe down leaves full
// screen, which shows how to add the dashboard to the Home Screen (no page
// can do that itself); hidden in the Home Screen app, which has none of the
// browser's bars.

import { fullscreenCloseButton, isFullscreen, onFullscreenChange, screenButtonMode, toggleFullscreen } from "../ui/screenMode.js";
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
  const mode = screenButtonMode();

  if (mode === "install") {
    button.replaceChildren(icon("install"));
    button.title = "Install on the Home Screen";
    button.setAttribute("aria-label", "Install");
    button.setAttribute("aria-haspopup", "dialog");
    /** @type {HTMLDialogElement|undefined} */
    let help;
    button.addEventListener("click", () => {
      if (!help) {
        help = createInstallHelp();
        document.body.append(help);
      }
      help.showModal();
    });
    return button;
  }

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
  button.hidden = mode === "none";
  onFullscreenChange(render);
  button.addEventListener("click", () => toggleFullscreen());
  return button;
}

/**
 * How to add the dashboard to the Home Screen, in Safari's own words: a
 * dialog with the three steps and Close. A tap on the backdrop closes it too.
 * @returns {HTMLDialogElement}
 */
export function createInstallHelp() {
  const close = /** @type {HTMLButtonElement} */ (h("button", { className: "install-close", text: "Close" }));
  close.type = "button";
  close.dataset.close = "";
  const dialog = /** @type {HTMLDialogElement} */ (h("dialog", { className: "install-help" },
    h("h2", { text: "Install on the Home Screen" }),
    h("ol", {},
      h("li", { text: "Tap Safari's Share button (on iPadOS 26 it can be under ⋯, next to the address)." }),
      h("li", { text: "Choose Add to Home Screen, keep Open as Web App on, and tap Add." }),
      h("li", { text: "Open FS25 Companion from its icon. It runs without Safari's bars, so a swipe just scrolls." })),
    h("p", { className: "settings-note",
      text: "Safari's full screen isn't offered here: a swipe down leaves it, and no page can stop that." }),
    close));
  dialog.setAttribute("aria-label", "Install on the Home Screen");
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  return dialog;
}
