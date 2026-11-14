// @ts-check
// Full screen, the Home Screen app and keep-awake (docs/THEMES.md,
// Responsive: browser bars). Each only where the browser allows it, and
// callers hide what isn't:
// - full screen: the Fullscreen API, but not on an iPad or iPhone, where
//   Safari leaves it on a swipe down; there the Home Screen app instead;
// - keep-awake: the Screen Wake Lock API, which needs a secure page (HTTPS
//   or localhost), so not a plain LAN address like http://192.168.1.20.
// The browser drops both when the page reloads (switching theme), and
// drops the wake lock whenever the page is hidden; we take it back when
// the page shows again.

const KEEP_AWAKE_KEY = "fs25companion.keepAwake";

/**
 * @typedef {Document & {
 *   webkitFullscreenEnabled?: boolean,
 *   webkitFullscreenElement?: Element|null,
 *   webkitExitFullscreen?: () => void,
 * }} AnyDocument
 */

/** @param {Document} [doc] */
export function fullscreenSupported(doc = document) {
  const d = /** @type {AnyDocument} */ (doc);
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

/** @param {Document} [doc] */
export function isFullscreen(doc = document) {
  const d = /** @type {AnyDocument} */ (doc);
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * @typedef {{userAgent: string, maxTouchPoints: number, standalone?: boolean}} NavLike
 * @typedef {(query: string) => {matches: boolean}} MediaLike matchMedia
 */

/**
 * An iPad or iPhone. iPadOS reports itself as a Mac, so a touch screen tells
 * them apart.
 * @param {NavLike} [nav]
 */
export function isAppleTouch(nav = navigator) {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/**
 * Opened from the home screen (manifest.json), without the browser's bars.
 * Safari also says so with navigator.standalone.
 * @param {MediaLike} [media]
 * @param {NavLike} [nav]
 */
export function isHomeScreenApp(media = (q) => matchMedia(q), nav = navigator) {
  return media("(display-mode: fullscreen), (display-mode: standalone)").matches || nav.standalone === true;
}

/**
 * Whether to offer full screen: the browser has it, this isn't the
 * home-screen app, which already opens without the browser's bars, and it
 * isn't an iPad or iPhone, where Safari leaves full screen on any swipe with
 * the finger moving down (tried 2026-11-14; no page can stop it).
 * @param {Document} [doc]
 * @param {MediaLike} [media]
 * @param {NavLike} [nav]
 */
export function fullscreenOffered(doc = document, media = (q) => matchMedia(q), nav = navigator) {
  if (isFullscreen(doc)) return true;
  return fullscreenSupported(doc) && !isHomeScreenApp(media, nav) && !isAppleTouch(nav);
}

/**
 * The status bar's screen button: "install" in Safari on an iPad or iPhone
 * (how to add it to the Home Screen; a page can't do it itself),
 * "fullscreen" where the browser's full screen works, "none" in the
 * home-screen app or where neither applies.
 * @param {Document} [doc]
 * @param {MediaLike} [media]
 * @param {NavLike} [nav]
 * @returns {"install"|"fullscreen"|"none"}
 */
export function screenButtonMode(doc = document, media = (q) => matchMedia(q), nav = navigator) {
  if (fullscreenOffered(doc, media, nav)) return "fullscreen";
  if (isAppleTouch(nav) && !isHomeScreenApp(media, nav)) return "install";
  return "none";
}

/**
 * Whether the browser draws its own close (X) button over the page's top-left
 * corner in full screen: Safari on iPad and iPhone does, and no page can hide
 * it.
 * @param {NavLike} [nav]
 */
export function fullscreenCloseButton(nav = navigator) {
  return isAppleTouch(nav);
}

/**
 * Into full screen (the whole page), or out of it. Must run from a click.
 * @param {Document} [doc]
 */
export async function toggleFullscreen(doc = document) {
  const d = /** @type {AnyDocument} */ (doc);
  const root = /** @type {HTMLElement & {webkitRequestFullscreen?: () => void}} */ (d.documentElement);
  try {
    if (isFullscreen(d)) {
      if (d.exitFullscreen) await d.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else if (root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: "hide" });
    } else {
      root.webkitRequestFullscreen?.();
    }
  } catch { /* refused: no click, or the browser said no */ }
}

/**
 * @param {() => void} fn called when the page enters or leaves full screen
 * @param {Document} [doc]
 */
export function onFullscreenChange(fn, doc = document) {
  doc.addEventListener("fullscreenchange", fn);
  doc.addEventListener("webkitfullscreenchange", fn);
}

/**
 * @typedef {Object} KeepAwake
 * @property {boolean} supported
 * @property {() => boolean} wanted the device's choice, saved
 * @property {(on: boolean) => void} set
 */

/**
 * Keep the screen on while the dashboard shows, if this device chose to.
 * @param {Object} [opts]
 * @param {Navigator} [opts.nav]
 * @param {Document} [opts.doc]
 * @param {Pick<Storage, "getItem"|"setItem">} [opts.storage]
 * @returns {KeepAwake}
 */
export function createKeepAwake({ nav = navigator, doc = document, storage = localStorage } = {}) {
  const supported = "wakeLock" in nav && !!nav.wakeLock;
  let wanted = false;
  try { wanted = storage.getItem(KEEP_AWAKE_KEY) === "on"; } catch { /* private mode */ }
  /** @type {WakeLockSentinel|null} */
  let lock = null;

  async function take() {
    if (!supported || !wanted || lock || doc.visibilityState !== "visible") return;
    try {
      lock = await nav.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } catch { /* refused: battery saver, or a policy */ }
  }

  if (supported) {
    doc.addEventListener("visibilitychange", take);
    take();
  }
  return {
    supported,
    wanted: () => wanted,
    set(on) {
      wanted = on;
      try { storage.setItem(KEEP_AWAKE_KEY, on ? "on" : "off"); } catch { /* private mode */ }
      if (on) take();
      else if (lock) {
        lock.release().catch(() => {});
        lock = null;
      }
    },
  };
}
