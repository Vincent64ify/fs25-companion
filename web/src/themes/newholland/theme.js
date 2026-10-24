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
      end: ["weatherNow", { widget: "money", variant: "text" }, { widget: "connection", variant: "dot" },
        "fullscreen"],
    },
    controls: [
      { label: "Lights", controls: ["lights", "highBeam", "beacon", "hazard", "turnLeft", "turnRight"] },
      { label: "Drive", controls: ["cruiseDown", "cruise", "cruiseUp", "engineOn", "aiWorker"] },
      { label: "Implement", implementName: true,
        controls: ["implementLowered", "fold", "implementOn", "hitch"] },
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
        { widget: "fuelUsage", variant: "readout" },
        // only while cruise control holds a speed
        { widget: "cruiseSpeed", variant: "readout" },
      ],
    },
    {
      // the readout and vehicle cards, condition tiles and implements
      // (rows 296 | 116 | 1fr, columns 1fr | 300), then the controls
      id: "vehicle", label: "Vehicle", icon: "tractor",
      slots: [
        { group: "vehicle", slots: [
          { widget: "vehicleReadout" },
          { widget: "vehicleCard" },
          { group: "conditions", slots: [
            { widget: "fuel", variant: "condition", whenMissing: "dash" },
            { widget: "engineTemp", variant: "condition", whenMissing: "dash" },
            { widget: "wear", variant: "condition", whenMissing: "dash" },
            { widget: "hours", variant: "condition", whenMissing: "dash" },
            // only for engines with DEF, vehicles with a load
            { widget: "def", variant: "condition" },
            { widget: "load", variant: "condition" },
          ] },
          { widget: "implements", variant: "rows" },
        ] },
        { controls: true },
      ],
    },
  ],
};
