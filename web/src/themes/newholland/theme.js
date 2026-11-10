// @ts-check
// New Holland style, after the IntelliView 12 (docs/THEMES.md). Data only:
// themes/render.js draws it, theme.css styles it per palette and size
// class, mapControls.js puts the toolbar on the map's edge.

// the Vehicle and Loader pages' bottom bar (specs/0013): the tractor's
// numbers, as on the Map screen; rpm, fuel usage and the cruise speed stay
// the Map's (the Cruise button has its speed)
const VEHICLE_READOUT = [
  { widget: "speed", variant: "readout" },
  { widget: "gear", variant: "readout" },
  { widget: "fuel", variant: "readout" },
  { widget: "def", variant: "readout" },
  { widget: "wear", variant: "readout" },
  { widget: "engineTemp", variant: "readout" },
];

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
      // Attach last (specs/0016): on every screen, lit while the game has
      // something in reach
      { label: "Drive", controls: ["cruiseDown", "cruise", "cruiseUp", "engineOn", "aiWorker", "attach"] },
      // no Implement group: a tool is worked from its card (specs/0012)
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
      // the Vehicle tab's default page (specs/0003, the Implement tab
      // merged in; calm since specs/0013): the rig strip across the top,
      // under it a card per working thing and Also attached on the left, the
      // field panel on the right (gone with three working things: the cards
      // take the width); then the column with Lights, Drive and All tools
      // (with two working things or more). The tractor's numbers are in the
      // bottom bar, as on the Map screen. Attach is in Drive (specs/0016).
      id: "vehicle", label: "Vehicle", icon: "tractor", choice: "Vehicle",
      slots: [
        { group: "tools", slots: [
          { widget: "rigStrip" },
          { group: "work", slots: [
            { widget: "toolCards" },
            { widget: "toolsAlso" },
            { widget: "fieldPanel" },
          ] },
        ] },
        { controls: true, add: [{ widget: "toolsAll" }] },
      ],
      readout: VEHICLE_READOUT,
    },
    {
      // the Vehicle tab's page for a loader (specs/0002): the rig strip over
      // the Load and Target cards (rows auto | 1fr, columns 1fr | 1fr; Load
      // full width without a loader), then the column as on Vehicle; the
      // bottom bar's readout as on Vehicle (specs/0013)
      id: "loader", label: "Loader", icon: "loader", tab: "vehicle", choice: "Loader", when: "loader",
      slots: [
        { group: "vehicle", slots: [
          { widget: "rigStrip" },
          { widget: "loadCard" },
          { widget: "targetCard" },
        ] },
        { controls: true },
      ],
      readout: VEHICLE_READOUT,
    },
    {
      // the Vehicle tab's other page, for a combine (specs/0001): the band
      // over the Combine card (1.62fr) and, beside it, the Header card over
      // the field panel (1fr; revision 3: rows 88 | auto | 1fr), then the
      // column with Lights and Drive; the cards' tiles are the combine's and
      // the header's buttons. The field panel is the Vehicle page's without
      // its Needs row (the field you harvest needs harvesting).
      id: "harvester", label: "Harvester", icon: "harvester", tab: "vehicle", choice: "Harvester", when: "harvester",
      slots: [
        { group: "harvester", slots: [
          { widget: "harvestBand" },
          { widget: "combineCard" },
          { widget: "headerCard" },
          { widget: "fieldPanel", variant: "compact" },
        ] },
        // the header's buttons are on its card; Attach is in Drive
        { controls: true },
      ],
    },
  ],
};
