// @ts-check
// New Holland style, after the IntelliView 12 (docs/THEMES.md). Data only:
// themes/render.js draws it, theme.css styles it per palette and size
// class, mapControls.js puts the toolbar on the map's edge.

/** @type {import("../render.js").Theme} */
export default {
  id: "newholland",
  label: "New Holland style",
  note: "Inspired by the IntelliView 12. Not affiliated with New Holland.",
  palettes: ["day", "night"],
  mapControls: "edge",
  css: "src/themes/newholland/theme.css",
  chrome: {
    status: {
      start: [{ widget: "mapName", variant: "text" }, "alerts", "protocolError"],
      centre: ["dayClock"],
      end: ["weatherNow", { widget: "money", variant: "text" }, { widget: "connection", variant: "dot" }],
    },
    controls: [
      { label: "Lights", controls: ["lights", "highBeam", "beacon", "hazard", "turnLeft", "turnRight"] },
      { label: "Drive", controls: ["engineOn", "cruise", "aiWorker"] },
      { label: "Implement", implementName: true,
        controls: ["implementRaised", "implementLowered", "implementOn", "pto"] },
    ],
  },
  screens: [
    {
      id: "map", label: "Map", icon: "map",
      slots: [{ map: "full" }, { controls: true }],
      readout: [
        { widget: "speed", variant: "readout" },
        { widget: "gear", variant: "readout" },
        { widget: "rpm", variant: "readout" },
        { widget: "fuel", variant: "readout" },
        { widget: "engineTemp", variant: "readout" },
      ],
    },
    {
      // the hero readout, condition tiles and vehicle card come with T4
      id: "vehicle", label: "Vehicle", icon: "tractor",
      slots: [
        { widget: "vehicleName", variant: "title" },
        { widget: "speed", variant: "tile" },
        { widget: "rpm", variant: "tile" },
        { widget: "gear", variant: "tile" },
        { widget: "fuel", variant: "tile" },
        { widget: "engineTemp", variant: "tile" },
        { widget: "wear", variant: "tile" },
        { widget: "hours", variant: "tile" },
        { widget: "implements", variant: "card" },
      ],
    },
  ],
};
