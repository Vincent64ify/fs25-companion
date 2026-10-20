// @ts-check
// Small DOM helpers shared by the panels.

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from index.html`);
  return el;
}

/**
 * @param {unknown} v
 * @param {number} [digits]
 */
export const fmt = (v, digits = 0) => (typeof v === "number" ? v.toFixed(digits) : "–");
