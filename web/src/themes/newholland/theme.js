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
      id: "vehicle", label: "Vehicle", icon: "tractor", choice: "Tractor",
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
        // the readout card's engine chip starts and stops the engine here
        { controls: true, omit: ["engineOn"] },
      ],
    },
    {
      // the rig band over the implement card and its details (rows
      // 132 | 1fr, columns 1fr | 250), then the controls: the band has the
      // Engine and the card the tool's buttons, so the column keeps Lights,
      // Drive and All implements
      id: "implement", label: "Implement", icon: "implement",
      slots: [
        { group: "implement", slots: [
          { widget: "rigBand" },
          { widget: "implementCard" },
          { widget: "implementDetails" },
        ] },
        { controls: true, omit: ["engineOn", "implementLowered", "fold", "implementOn", "hitch"],
          add: [{ label: "All implements", controls: ["lowerAll", "hitch"] }] },
      ],
    },
    {
      // the Vehicle tab's other page, for a combine (docs/THEMES.md,
      // Harvester screen): the rig band, the work card and grain tank
      // beside the details (rows 132 | 228 | 1fr, columns 1fr | 250), then
      // the controls with the combine's own keys
      id: "harvester", label: "Harvester", icon: "harvester", tab: "vehicle", choice: "Harvester", when: "harvester",
      slots: [
        { group: "harvester", slots: [
          { widget: "rigBand" },
          { widget: "harvestWork" },
          { widget: "grainTank" },
          { widget: "harvestDetails" },
        ] },
        { controls: true, omit: ["engineOn", "implementLowered", "fold", "implementOn", "hitch"],
          // Lower all and Hitch stay on the Implement tab: with Lights and
          // Drive, a third group of buttons wouldn't fit 820 px
          add: [{ label: "Harvester", controls: ["implementLowered", "thresher", "fold", "pipe", "unload", "straw"] }] },
      ],
    },
  ],
};
