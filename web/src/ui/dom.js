// @ts-check
// Small DOM helpers shared by the themes, widgets and panels.

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from the page`);
  return el;
}

/**
 * @param {unknown} v
 * @param {number} [digits]
 */
export const fmt = (v, digits = 0) => (typeof v === "number" ? v.toFixed(digits) : "–");

/**
 * Create an element: h("div", {id: "x", className: "card"}, child, "text").
 * @param {string} tag
 * @param {{id?: string, className?: string, text?: string, hidden?: boolean}} [props]
 * @param {(Node|string)[]} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  if (props.id) el.id = props.id;
  if (props.className) el.className = props.className;
  if (props.text != null) el.textContent = props.text;
  if (props.hidden) el.hidden = true;
  el.append(...children);
  return el;
}
