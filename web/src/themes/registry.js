// @ts-check
// Which theme and palette this device shows: the URL wins
// (?theme=newholland&palette=night, for bookmarks), then the device's
// saved choice, then Default. Switching theme reloads the page.

import defaultTheme from "./default/theme.js";

/** @typedef {import("./render.js").Theme} Theme */

/** @type {Theme[]} */
export const THEMES = [defaultTheme];

export const STORAGE_KEYS = { theme: "fs25companion.theme", palette: "fs25companion.palette" };

/** @returns {{theme?: string, palette?: string}} the device's saved choice */
export function savedChoice() {
  try {
    return {
      theme: localStorage.getItem(STORAGE_KEYS.theme) || undefined,
      palette: localStorage.getItem(STORAGE_KEYS.palette) || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * @param {string} search location.search
 * @param {{theme?: string, palette?: string}} saved
 * @param {Theme[]} [themes]
 * @returns {{theme: Theme, palette: string|undefined}} palette: undefined
 *   for a theme with one look only
 */
export function chooseTheme(search, saved, themes = THEMES) {
  const params = new URLSearchParams(search);
  const byId = (/** @type {string|null|undefined} */ id) => themes.find((t) => t.id === id);
  const theme = byId(params.get("theme")) || byId(saved.theme) || themes[0];
  const palettes = theme.palettes;
  const palette = [params.get("palette"), saved.palette].find((p) => p && palettes.includes(p))
    || palettes[0];
  return { theme, palette: palette || undefined };
}
