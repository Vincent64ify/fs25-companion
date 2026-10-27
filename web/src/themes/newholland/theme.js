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
      // the Vehicle tab's default page (specs/0002 revision 2): the band
      // with the rig strip over Loads, full width, then the column with
      // Lights and Drive. The tools' buttons are on the Implement tab.
      id: "vehicle", label: "Vehicle", icon: "tractor", choice: "Vehicle",
      slots: [
        { group: "vehicle", slots: [
          { widget: "vehicleBand" },
          { widget: "loadCard", variant: "loads" },
        ] },
        { controls: true, omit: ["implementLowered", "fold", "implementOn", "hitch"] },
      ],
    },
    {
      // the Vehicle tab's page for a loader (specs/0002): the band with the
      // rig strip over the Load and Target cards (rows auto | 1fr, columns
      // 1fr | 1fr; Load full width without a loader), then the column as
      // on Vehicle
      id: "loader", label: "Loader", icon: "loader", tab: "vehicle", choice: "Loader", when: "loader",
      slots: [
        { group: "vehicle", slots: [
          { widget: "vehicleBand" },
          { widget: "loadCard" },
          { widget: "targetCard" },
        ] },
        { controls: true, omit: ["implementLowered", "fold", "implementOn", "hitch"] },
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
      // the Vehicle tab's other page, for a combine (specs/0001): the band
      // over the Combine and Header cards (rows 88 | 1fr, columns
      // 1.62fr | 1fr), then the column with Lights and Drive; the cards'
      // tiles are the combine's and the header's buttons
      id: "harvester", label: "Harvester", icon: "harvester", tab: "vehicle", choice: "Harvester", when: "harvester",
      slots: [
        { group: "harvester", slots: [
          { widget: "harvestBand" },
          { widget: "combineCard" },
          { widget: "headerCard" },
        ] },
        // Lower all and Hitch stay on the Implement tab
        { controls: true, omit: ["implementLowered", "fold", "implementOn", "hitch"] },
      ],
    },
  ],
};
