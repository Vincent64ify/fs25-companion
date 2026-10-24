// @ts-check
// Default: the dashboard as it has always looked. It draws itself (build)
// with the same markup the old index.html had, so it can't drift: header
// and connection pill, the banner, then the square map beside the panel of
// cards. Its additions are the Settings button at the header's left and a
// Controls card (Lights, the first control wired to the game).

import { createWidget } from "../../widgets/index.js";
import { controlGroup } from "../../widgets/controls.js";
import { h } from "../../ui/dom.js";

/** @type {import("../render.js").Theme} */
export default {
  id: "default",
  label: "Default",
  note: "Today's dashboard: map and side panel.",
  palettes: [],
  mapControls: "corners",
  css: "src/themes/default/theme.css",

  build(app, store, frame, settings) {
    /** @param {string} id @param {import("../../widgets/widget.js").WidgetOptions} [opts] */
    const w = (id, opts) => createWidget(id, store, { whenMissing: "dash", ...opts });
    // an id ending in "?" hides its row without data (DEF on an engine without it)
    /** @param {string} title @param {string[]} ids */
    const listCard = (title, ids) => h("div", { className: "card" },
      h("h3", { text: title }), h("dl", {}, ...ids.map((id) => (id.endsWith("?")
        ? w(id.slice(0, -1), { whenMissing: "hide" }) : w(id)))));

    const header = h("header", {}, ...(settings ? [settings.button] : []),
      h("h1", { text: "FS25 Companion" }), w("connection", { id: "connection" }));
    const panel = h("aside", { id: "panel" },
      h("div", { className: "card" },
        w("vehicleName"),
        h("div", { className: "gauges" }, w("speed"), w("rpm"), w("gear"))),
      h("div", { className: "card controls-card" },
        controlGroup({ label: "Controls", controls: ["lights"] }, store)),
      listCard("Vehicle", ["fuel", "fuelUsage?", "def?", "cruise?", "load?", "wear", "engineTemp", "hours", "position"]),
      listCard("Farm", ["weather", "temperature", "clock", "day", "money", "mapName", "playerName"]),
      w("implements", { variant: "card", id: "impl-card" }));
    const main = h("main", {}, panel, ...(settings ? [settings.layer] : []));
    app.replaceChildren(header, w("protocolError", { id: "banner" }), main);
    frame.moveTo(main);
    return {};
  },
};
