# Themes and layouts

> **Status:** plan accepted on 2026-10-22. Next: T0, the design in Claude Design.

## Goal

The user chooses how the dashboard looks. A theme recreates the in-cab
terminal of a tractor brand (layout, colours, feel) with a modern finish.
- **First theme:** New Holland style, after the IntelliView 12.
- **Default theme:** today's dashboard, which stays exactly as it is.

## Words used in this plan

| Word | Meaning |
|---|---|
| Theme | A complete look: chrome, screens, palettes. "Default", "New Holland style". |
| Palette | A theme's colours for day or for night. |
| Size class | compact, regular or wide. Layouts adapt to the screen's size, not to a device model. |
| Chrome | The parts around the screens: status bar, value column, control column, tab bar. |
| Screen | One page of the terminal, picked with a tab (the IntelliView's "run screens"): Map, Vehicle. |
| Slot | A place in the chrome or on a screen that holds a widget, a control or the map. |
| Widget | A live value or list: speed, fuel, implements, clock... |
| Control | A button for a game action. It shows state only until the "control the game" project wires it. |
| Map frame | The one Leaflet map plus its overlays (field panel, notes), moved into whichever map slot is visible. |

## Decisions

| Topic | Decision |
|---|---|
| Default theme | Today's layout, unchanged. Its only addition is a small Settings button at the header's left, which arrives with the second theme. |
| Settings entry | The same in every theme: a "Settings" button with the sliders icon, top-left, opening a panel that starts with Theme. The same button opens and closes it (shown pressed while open); the panel has no close button and sits in the main area, under the header, never over it (T0 review). |
| First theme | New Holland style, based on the IntelliView 12 (T7 LWB, T7 HD, T8, T9). |
| Naming | Brand + "style" in the selector, with the note "Inspired by the IntelliView 12. Not affiliated with New Holland." No logos, emblems or official artwork. Internal id: `newholland`. |
| What a theme changes | Everything: its own chrome and screens, not just colours. |
| Screens (v1) | Map and Vehicle. Implements, Fields and Farm screens come later. |
| Customising | Fixed layouts now. Layouts are stored as data, so an edit mode can come later. |
| Night mode | A manual Day / Night switch, saved per device. Nothing switches by itself. |
| Targets | Landscape tablets of any brand and second PC monitors. Phones keep working (compact class) but aren't a design target. |
| Look | Modern first. The IntelliView 12 gives the structure, colours and feel; dated parts are modernised. |
| Controls | Every theme reserves a control column now. Icons come from the game where possible. |
| Design tool | Claude Design, before any theme code. |
| Theme choice | Per device (localStorage), with a URL override for bookmarks. |

## Out of scope

These are left out of this project:
- Wiring controls to the game: that's the separate "control the game"
  project. This one only shows their state.
- Guidance lines, ISOBUS implement screens, camera feeds.
- Implements, Fields and Farm screens; layout editing; other brands. All of
  these are under **Later**.
- A light palette for the Default theme.

## Research: the IntelliView 12

- **Standard layout,** per New Holland's guide:
  - a dark top bar for machine and operation settings, with GNSS and
    connectivity status;
  - a left column of value tiles the user can set (fuel rate, wheel slip);
  - a central area for the selected run screen;
  - a bottom bar of run-screen buttons, seven of them preset and
    customisable.
- **A real run screen** (the photo in Sources):
  - **Left:** white tiles with a green icon, a small label, a big value and
    a unit. Then a transmission block with a big "N" in a blue box, gear
    ratios, and speed in km/h.
  - **Centre:** the map as a tall rectangle, with vertical toolbars of
    square blue icon buttons along both edges.
  - **Right:** control rows with a green icon, a label, a value, then blue
    arrow or −/+ buttons, some with a slider.
  - **Top:** a dark bar: icons on the left, the clock in a pill in the
    centre, and status icons plus a green on/off pill on the right.
  - **Bottom:** RUN 1–7 tabs, the active one underlined in blue.
- **InfoView,** the screen in the steering wheel of the Horizon Ultra cab:
  big digital readouts of speed, rpm and gear. It's the model for our "hero"
  readout.
- **Look:** a light grey and white work area under the dark bar, New Holland
  blue for buttons and selection, green for OK states, and yellow used
  sparingly. The 2023 brand identity is a rich dark blue, white and yellow,
  with no published colour values.
- **Not documented:**
  - the UI font: photos show a neutral sans;
  - whether there's a day/night mode;
  - exact colours.

  We choose our own values in T0.
- **GIANTS' in-game version:** the game ships readable textures of New
  Holland cab screens. `data/vehicles/newHolland/cr11/cr11Display_diffuse.dds`
  is the CR11's IntelliView; also `tk4/tk4Display_diffuse.dds` and
  `t8/t8DashboardBar*_diffuse.dds`. They show how players already see the
  terminal in game. They're viewed locally only and uploaded nowhere.
- **Sources:**
  - [IntelliView 12](https://agriculture.newholland.com/africa/en-za/precision-land-management/products/displays/intelliview-12-display)
  - [IntelliView IV](https://agriculture.newholland.com/apac/en/precision-land-management/products/displays/intelliview-iv-display)
  - [IntelliView 12 guide (Russells)](https://russells.uk.com/wp-content/uploads/2023/03/ata1087419-r1-nh-intelliview-12-guide-f2.pdf)
  - [FWI T7.300 test](https://www.fwi.co.uk/machinery/tractors/201-300hp/on-test-fresh-cab-makes-300hp-new-holland-the-best-t7-yet)
  - [Farmers Guide on InfoView](https://www.farmersguide.co.uk/machinery/tractors/latest-model-impresses-potential-customers/)
  - [New Holland identity 2023](https://agriculture.newholland.com/en-gb/europe/new-holland-world/news/2023/new-holland-of-the-future)
  - [run screen photo](https://media.sandhills.com/img.axd?id=10028904894&wid=4326205933&rwl=False&p=&ext=&w=614&h=460&t=&lp=&c=True&wt=False&sz=Max&rt=0&checksum=LfPvtNsn%2bRPkTxxY45H4VcrUI49ZutZ2vu3WMvGZiPw%3d)

## The New Holland style

### Regular layout (tablets)

```
┌──────────────────────────────── status bar ─────────────────────────────────┐
│ ⚙  ⚠ alerts          ( Day 6 · 09:44 )          ☁ 20°C   $999,999   ◉ live │
├───────────┬────────────────────────────────────────────────┬────────────────┤
│ value     │                                                │ controls       │
│ column    │                 main area                      │ (state only)   │
│           │        the selected screen fills it            │                │
│ speed     │                                                │ lights         │
│ gear      │   Map screen: the map in any shape, with a     │ high beam      │
│ rpm       │   toolbar on its edge (zoom, recentre,         │ beacon         │
│ fuel      │   whole map, layers)                           │ hazard         │
│ temp      │                                                │ implement ↓/↑  │
│ wear      │                                                │ implement on   │
├───────────┴────────────────────────────────────────────────┴────────────────┤
│   [ MAP ]   [ VEHICLE ]                                    room for 7 tabs  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Status bar:**
  - a settings button, which opens a sheet with the theme and Day / Night;
  - alerts (low fuel, hot engine), from data we already have;
  - the in-game day and time in a centre pill;
  - weather and temperature, and money;
  - the connection to the game (live, waiting or offline), in the place of
    the terminal's signal icons.
- **Value column:** big-number tiles, each with an icon, label, value and
  unit.
- **Control column:** the control zone (see Controls).
- **Tab bar:** one tab per screen. It's designed for up to seven, like the
  real terminal; v1 has two.

### Screens (v1)

- **Map:** the map fills the main area, whatever its shape. The field panel
  and farmland popups work as today.
- **Vehicle:**
  - an InfoView-style hero readout of speed, rpm and gear;
  - condition tiles: fuel, engine temp, wear, hours;
  - the attached implements, each lowered or raised, on or off, and its
    wear;
  - the vehicle card: its shop picture, name and brand, and a button that
    shows it on the Map screen. No mini-map: at that size it was too small
    to be useful (T0 review).
  - every tab shows its icon and label here, since this screen has no
    tab-bar readout.

### Compact and wide

- **Compact** (narrower than 900 px, or portrait):
  - a slimmer status bar;
  - the value column becomes a strip under it;
  - the controls move to a bottom row or a drawer;
  - the tabs sit at the bottom.
- **Wide** (1600 px and up): the side columns can hold two tile columns, and
  the main area grows. Showing Map and Vehicle side by side, like the
  terminal's dual display, is a design option for T0.

## The map in themes

- **Default:** unchanged. It keeps the square box, the corner buttons, and
  today's follow zoom.
- **Any shape:** in the New Holland style, a map slot can be any rectangle:
  tall, wide or square.
  - `constrainTo` and `coverZoom` in `map/mapView.js` already fit any box:
    the playable area covers the slot, and you pan along the long side.
  - The square-box CSS (`#map-wrap` aspect-ratio) moves into the Default
    theme's CSS.
- **Edge toolbar:** zoom, recentre, whole map and layers become a vertical
  icon toolbar on the map's edge.
- **Slot zoom:** the smaller the slot, the closer the default zoom, centred
  on the player or vehicle with follow on.
  - A pure `defaultZoom({x, y})` takes the slot's short side `s` and shows a
    span of `clamp(s² / 900, 80 m, whole map)` across it.
  - That's about 100 m across a 300 px mini-map, and about 1.1 km across a
    1000 px main area.
  - It never goes below the cover zoom. The numbers are tuned in T4.
- **Your zoom wins:**
  - You can zoom and pan any map slot.
  - Each slot remembers your zoom and whether follow is on.
  - Recentre turns follow on and goes back to the slot's default zoom.
  - When a slot changes size (rotation, window resize), it moves to the new
    default zoom, unless you zoomed by hand.
- **Small slots,** with a short side under about 400 px (none in v1; for
  later screens or a compact layout):
  - they keep zoom, pan and recentre, plus a button that opens the spot on
    the Map screen;
  - no Layers panel, field panel or popups, since those would cover the
    whole slot.
- **One map frame:**
  - There is one Leaflet map, with all layers, the legend, popups and the
    field panel. Its frame moves into the visible screen's map slot.
  - Rule: at most one map slot is visible at a time.
  - After every move, the map re-measures itself (`invalidateSize`).

## Icons

- **Game first.** These are readable DDS files in the game install (paths
  under `<game>/data/`):
  - `shared/assets/dashboardSymbols_diffuse.dds`: the cab warning-light and
    ISO symbol sheet (2048², RGBA). Verified in T0: about 110 white masks
    on a regular 128 px grid, so themes colour them from alpha. It's the
    only atlas `client/icon_atlas.json` uses (24 icons). The T8 sheet is
    irregular and cab-specific, and the marker sheet holds world markers,
    so neither is used.
  - `vehicles/newHolland/t8/t8InteriorSymbols_diffuse.dds`: the T8 cab's
    symbols (2048²).
  - `shared/assets/marker/markerIcons_diffuse.dds` (1024²), and the
    `mapIcon_*.dds` files beside map buildings.
- **Not readable:** the HUD, menu and key-glyph icons (the ones beside
  actions in the F1 help) are inside `<game>/dataS.gar`.
  - That file is encrypted like the DLC maps, and we don't decrypt it.
  - So the controls idea in PLAN.md can't take its icons from there; T0
    updates that note.
- **Pipeline (T2):**
  1. A mapping file, `client/icon_atlas.json`, written in T0, gives each
     icon name its atlas and rectangle.
  2. The client finds the game through `hello.gameDir` (confirmed live on
     Kinlaig).
  3. It crops the icons, keeps their alpha as a mask so themes can colour
     them, and packs them into one sprite plus an index.
  4. It content-hashes and caches the sprite, uploads it with the client
     token, and announces it with an `icon_assets` message.
  5. The dashboard asks for an icon by name with `icon("beacon")`.
- **Fallback:** we draw SVG icons in the game's style (flat glyphs, the same
  stroke weight and corner radius). They cover icons the game doesn't have,
  and every icon when the game files can't be read (macOS, replay), so the
  dashboard looks the same either way.
- **First icon set:**
  - **Vehicle:** speed, rpm, gear, diesel, electric charge, methane, engine
    temperature, wear, hours, engine on, position.
  - **Controls:** lights, high beam, beacon, hazard, turn left / right,
    cruise control, PTO, hitch up / down, implement on, AI worker.
  - **Status bar:** clock, day, season, the six weather states,
    temperature, money, connection, settings, day / night.
  - **Map toolbar:** zoom in / out, recentre, whole map, layers.
- **Rights:** icons are extracted at runtime from your own install and
  served only by your own backend, as the overview image already is.
  Nothing from the game is committed to the repo or uploaded to claude.ai.

## Vehicle pictures

- **Where:** the vehicle card on the Vehicle screen, beside the readout
  card: the same picture the in-game shop shows, with the vehicle's name
  and brand. It's decoration, never needed.
- **Source:** each vehicle's XML names its store image in
  `<storeData><image>`, shipped as a `.dds` next to the XML. Checked in
  T0: base game `data/vehicles/newHolland/t7/store_t7.dds`; mod
  `FS25_volvoL90.zip` → `vehicles/volvo/l90/store_l90.dds`.
- **Pipeline** (like the map overview and the game icons):
  1. The mod adds the store item's image path to each vehicle (from the
     store manager, by the vehicle's config file). Today it sends only the
     name.
  2. The client reads it from the game folder or the mod's zip, converts
     DDS → PNG, hashes, caches and uploads it with the client token.
  3. The dashboard shows it when it arrives.
- **No picture:** paid DLCs are encrypted, and a mod may have none. Then
  the vehicle card keeps its place and shows a large icon for the
  vehicle's category (tractor, harvester, loader...) with the name and
  brand, so the layout doesn't move.
- **Rights:** as with icons, pictures come from the user's own install,
  are served only by their own backend, and are never committed or
  uploaded to claude.ai.

## Controls (state only for now)

- **Component:** `web/src/ui/control.js`, an icon button with four states:
  off, on, pending, unavailable. Touch targets are at least 48 px.
- **First set,** from data the mod already sends:
  - lights, high beam, beacon, hazard, turn signals (`lights`);
  - engine on (`engineOn`);
  - implement lowered and implement on (`implements`).
- **Behaviour:** they show as indicators with no press feedback until the
  command channel exists. The controls project then wires them without
  changing the themes.

## Architecture (web)

- **Selectors** (`web/src/data/selectors.js`): pure functions moved out of
  the panels. Examples: `controlledVehicle(store)`, `fuelPct(v)`,
  `wearPct(v)`, `clock(env)`, `money(env, hello)`, `weatherName(env)`,
  `alerts(v)`.
- **Widgets** (`web/src/widgets/*.js`): one module per value or list. Each
  is `create(store, {variant})` and returns an element.
  - The variants (`row`, `tile`, `hero`, `strip`) differ in markup only;
    themes style them.
  - A widget hides itself when its data is missing.
- **Themes are data, rendered by one shared renderer**
  (`web/src/themes/render.js`):

  ```js
  // web/src/themes/newholland/theme.js
  export default {
    id: "newholland",
    label: "New Holland style",
    note: "Inspired by the IntelliView 12. Not affiliated with New Holland.",
    palettes: ["day", "night"],
    mapControls: "edge",                       // Default: "corners"
    chrome: {
      status: ["menu", "alerts", "clock", "weather", "money", "connection"],
      values: ["speed", "gear", "rpm", "fuel", "engineTemp", "wear"],
      controls: ["lights", "highBeam", "beacon", "hazard", "implementLowered", "implementOn"],
    },
    screens: [
      { id: "map", label: "Map", icon: "map", slots: [{ map: "full" }] },
      { id: "vehicle", label: "Vehicle", icon: "tractor", slots: [
        { widget: "speed", variant: "hero" }, /* ... */ { map: "mini" } ] },
    ],
  };
  ```

  - CSS lives in `themes/<id>/theme.css`, scoped to
    `[data-theme="<id>"][data-palette="day|night"]`, with a grid template
    per size class through container queries.
  - The data form is what makes a later layout editor possible.
- **Default is a theme with its own `build()`:** it recreates today's
  `index.html` markup exactly, so it can't drift. `index.html` shrinks to an
  empty `#app`.
- **Startup** (`main.js`):
  1. read the theme choice;
  2. build the chrome and screens;
  3. create the map frame in the visible map slot;
  4. add the layers, legend and follow as today;
  5. place the widgets;
  6. connect.

  Screens are built once and switched with `hidden`.
- **Split UI from logic,** so the New Holland style can put the controls on
  the map's edge:
  - `legend.js`: `buildLegend(map, layers)` returns the panel. Default wraps
    it in today's Leaflet control (same markup and classes); New Holland
    opens it from the edge toolbar.
  - `followControl.js`: the follow logic (state, `tick`, `onNewMap`, whole
    map, recentre) is separate from Default's corner buttons.
  - `createMapView(el, {zoomControl})`: New Holland draws its own zoom
    buttons.
- **Choice and persistence:**
  - localStorage keys:
    - `fs25companion.theme`: `default` or `newholland`
    - `fs25companion.palette`: `day` or `night`
    - `fs25companion.screen`: per theme
    - `fs25companion.mapSlots`: zoom and follow per theme and slot

    Every read and write goes through try/catch, as in `legend.js`.
  - The URL can override: `?theme=newholland&palette=night`, which combines
    with `?pair=` and `?backend=`.
  - Switching theme reloads the page.
- **Tokens:** move the hard-coded interface colours to tokens:
  - background, surfaces, text, muted, accent, second accent, ok, warn,
    alarm, active, border, radius, shadow, fonts;
  - Leaflet's controls and popups, the legend, the field panel.

  Default's token values are today's colours. Map colours (hotspots,
  farmland shading, crops, vehicle markers) stay the same in every theme, so
  the map always reads like the PDA.
- **Fonts:** chosen in T0. Either the system stack or a self-hosted OFL font
  in `web/vendor/fonts/`, never a CDN, because the dashboard may run on a
  LAN without internet. Live values use tabular numerals.
- **Browsers:** Safari 16+ (iPadOS 16), Chrome/Edge 110+ and Firefox 110+.
  They all support container queries, `dvh` and `:has`.

## Modern look (the design brief for T0)

- **Keep from the IntelliView 12:**
  - the structure: status bar, value column, main area, control column,
    tabs;
  - dark blue, white and yellow;
  - big-number tiles, ✓ states, icon toolbars on the map's edge.
- **Modernise:**
  - generous spacing and a clear type scale;
  - softer radii and subtle elevation instead of bevels and grid lines;
  - one colour per state (ok, warn, alarm, active);
  - short transitions;
  - gauges as clean arcs or bars, not dials;
  - one icon weight throughout;
  - night as a palette of its own, not an inversion.
- **Depth, not flat** (direction-board review, 2026-10-23): soft vertical
  gradients on surfaces, a light top highlight, a crisp edge and a real
  drop shadow; icons in colour-filled badges, like the IntelliView's menu
  cards.
- **Controls first** (same review): game controls are the main content of
  the chrome, as a button grid that reflows to its width. Speed, fuel and
  the other values are minor on the Map screen, a compact strip of chips;
  big hero numbers belong on the Vehicle screen.
- **Readable in a cab:** values readable at arm's length (hero numbers of
  40 px or more on tablets), WCAG AA contrast in both palettes, and touch
  targets of at least 48 px.
- **Light on older tablets:** no large blurs, and `prefers-reduced-motion`
  respected.
- **Check against** current car dashboards and the newest terminals
  (FendtONE, John Deere G5) for what "modern in a cab" looks like.

## Responsive (tablets vary a lot)

- **No standard tablet size.** Sizes in CSS pixels, landscape:

  | Device | Size |
  |---|---|
  | iPad mini | 1133×744 |
  | iPad 10.9" | 1180×820 |
  | iPad Pro 11" | 1194×834 |
  | iPad Pro 13" | 1376×1032 |
  | Android 16:10 tablets | about 1280×800 |
  | Monitors | 1366×768 up to 2560×1440, ultrawide 3440×1440 |

  Aspect ratios run from 4:3 to 21:9.
- **Fluid, not fixed:**
  - a CSS grid for the chrome;
  - `clamp()` for column widths and type;
  - container queries so each area adapts to its own size (tiles reflow,
    tabs go icon-only when narrow);
  - the map fills whatever box it gets.
- **Size classes, not devices:** compact below 900 px or portrait; regular
  for tablets; wide from 1600 px.
- **Browser bars:** a tablet browser's own bars take up part of the height
  (`dvh`, plus safe areas for the iPad home indicator). In T5:
  - a fullscreen button, where the browser allows it;
  - a web-app manifest, so the dashboard can be added to the home screen
    and open without browser bars;
  - keep-awake where the browser allows it. That needs HTTPS, so not on a
    plain LAN address.
- **Input:** touch and mouse both work everywhere.

## Phases

Each phase ends with:
- tests green;
- an "As built" note in `docs/THEMES.md`;
- a commit (pushed on request).

### T0: Design in Claude Design

1. Done: this plan is `docs/THEMES.md`. PLAN.md links to it in place of the
   "Screens and themes" idea, and its controls idea is corrected (no key
   glyphs from `dataS.gar`).
2. Inspect the game's atlases locally: convert them in the scratchpad and
   look. Then write `client/icon_atlas.json`.
3. **Direction board:** two or three directions side by side, each a
   palette (day and night swatches), a type pairing, and a sample of the
   chrome (a status bar, a value tile, a control, a tab). One direction is
   picked, or parts of several are combined, before the style frame.
   Picked on 2026-10-23: **C · Deep Blue** (Archivo, soft radii, depth,
   pill tabs with icon-only inactive screens, values as a slim readout in
   the tab bar). It's a direction, not a final design: later artboards
   keep refining it.
4. **Style frame:** the Map screen at 1180×820 in the day palette, in the
   chosen direction, reviewed and revised until the look is approved.
   Approved on 2026-10-23: status bar, map with a floating edge toolbar
   and field panel, a 268 px control column in labelled groups (Lights,
   Drive, Implement), and the tab bar with the slim readout.
5. Then the Vehicle screen, the night palette, the settings sheet, and
   Default's Theme button.
   Vehicle screen approved on 2026-10-23: InfoView-style readout card
   (speed arc, gear, rpm), four condition tiles, the attached implements
   list, and the same chrome as the Map screen (no tab-bar readout on this
   screen). Revised after review: the vehicle card with its shop picture
   replaces the mini-map, and every tab shows its label.
   Night palette approved on 2026-10-23 (Map and Vehicle): deep navy
   surfaces, faint highlights and dark shadows; "on" states and the
   selected tab turn yellow with dark text; brighter state colours; map
   colours unchanged, map overlays on dark glass.
   Settings approved on 2026-10-23: the Settings panel (Theme cards with
   layout thumbnails, Day / Night switch) in the main area under the
   header, toggled by the header's Settings button; in Default, the same
   Settings button at the header's left with a small Theme panel.
6. Then the other sizes: 1280×800, compact at about 800 px wide, and
   1920×1080 (wide).
7. Write the approved tokens, measurements and layout grid into
   `docs/THEMES.md`.

- **How reviewing works:**
  - The artboards live in a private Claude Design artifact on claude.ai.
  - Comments on the artboards drive the revisions.
  - Each artboard is approved explicitly before code follows it.
- **Reference images:** the artifact holds links, written notes and our own
  wireframes. It holds no photos or game textures, since those belong to New
  Holland and GIANTS.
- **Done when:** a direction is picked, every artboard is approved, and `docs/THEMES.md` has the
  tokens, layouts and icon map.

### T1: Foundation (web, no visible change)

- Add selectors, widgets, the theme contract and renderer, and Default as a
  theme with its own `build()`.
- Split the legend and follow logic from their UI, move the map frame, and
  turn the colours into tokens.
- `vehiclePanel.js` and `envPanel.js` become widgets. `fieldInfoPanel.js`
  stays, placed in the map frame.
- **Done when:** Default's layout boxes and styles match the reference taken
  before T1 (see Verification), and test.html and pytest are green.

### T2: Game icons (client, backend, web)

- Client: `client/icon_assets.py`, next to `map_assets.py`, reusing its DDS
  → PNG conversion, hashing, cache and upload. Add tests.
- Backend: an `/api/icons/{hash}/{name}` route in `assets.py`, and an
  `icon_assets` message relayed to viewers and included for late joiners,
  like `map_assets`. Add tests.
- Web: `ui/icons.js` with the game sprite and the SVG fallback set.
- This can run alongside T1, since it touches different files.

### T3: New Holland style: chrome and Map screen

- Status bar, value column, control column (indicators) and tab bar.
- The settings sheet with theme and Day / Night, and Default's Theme button.
- The Map screen: any shape, edge toolbar, slot zoom, and the Layers panel
  from the toolbar.
- `popupPlacement.js` gets the right box to avoid from the theme.
- **Done when:** the Map screen matches the approved artboards at all
  sizes, in both palettes.

### T4: Vehicle screen

- The hero readout, condition tiles and implements.
- The vehicle card with its shop picture (see Vehicle pictures) and its
  Show-on-map button.
- Per-slot map memory and recentre.
- Tune the slot-zoom numbers.
- **Done when:** it matches the artboards, and moving between screens keeps
  each map slot's view.

### T5: Responsive pass and tablet polish

- Run the viewport matrix (see Verification) and fix what it finds.
- The compact class, the fullscreen button and the home-screen manifest.
- **Done when:** the matrix passes in both palettes.

### T6: More data from the game (mod, can start any time)

- Fuel usage, cruise control, DEF/AdBlue, fill levels of the vehicle and
  implements, PTO, hitch position, AI worker state.
- Units and currency from the game's settings, falling back to metric.
- These build on the fuel work: consumer fill units with
  `getFillUnitFillLevel`, and the spike's `controlledDetail` dump.
- **Done when:** the values are in the stream, with tests. Widgets show them
  as they arrive.

### Later

- Implements, Fields and Farm screens.
- Layout editing.
- More brands: Fendt FendtONE, John Deere G5, Massey Ferguson Datatronic,
  Case IH AFS Pro, CLAAS CEMIS. Each is a theme folder plus a design pass.

## Files

- **Changed:** `web/index.html`, `web/style.css`, `web/src/main.js`,
  `web/src/panels/*`, `web/src/map/legend.js`, `map/followControl.js`,
  `map/mapView.js`, `map/popupPlacement.js`, `web/test.html`.
- **New:** `web/src/data/selectors.js`, `web/src/widgets/`,
  `web/src/themes/render.js`, `themes/default/`, `themes/newholland/`,
  `web/src/ui/icons.js`, `web/src/ui/control.js`.
- **Client and backend:** `client/icon_atlas.json`,
  `client/icon_assets.py`, `client/companion_client.py`,
  `backend/app/assets.py`, `backend/app/ws.py`, and their tests.
- **Docs:** `docs/THEMES.md` (this file), `docs/PLAN.md`.

## Verification

- **test.html:**
  - selectors;
  - theme registry, URL and localStorage parsing;
  - `defaultZoom`;
  - theme data checks: every widget id exists, and no screen has more than
    one map slot.
- **pytest:** icon extraction (crop, sprite, hash, cache), the backend icon
  route, and the `icon_assets` relay.
- **Browser pane,** with the `replay-solek` launch config:
  - **Sizes:** 1133×744, 1180×820, 1194×834, 1280×800, 1376×1032,
    1366×768, 1920×1080, 2560×1440, 3440×1440, one portrait and one phone
    size. Each in day and night.
  - **Layout:** nothing overflows, there's no horizontal scroll, and touch
    targets are 48 px or more.
  - **Map slots:** tall, wide and square slots fill with map. The edge
    toolbar works. The slot zoom gets closer as the slot shrinks, your zoom
    is kept per slot, and recentre resets it.
  - Popups stay inside the map and clear of the field panel.
  - Icons with the game sprite (live) and with the fallback (replay).
  - Each screen matches its artboard.
- **Default unchanged:**
  - Before T1, a script records the position and size of the header, map
    box, panel and each card, plus key computed styles, at 1280×800,
    1920×1080 and 390×844.
  - After each phase, the same script runs and is compared, alongside
    screenshots.
  - It compares geometry, not pixels, because the replay keeps moving.
- **Live:**
  - FS25 with the client, on a tablet over the LAN (`http://<PC IP>:8123`)
    and on a second monitor.
  - Drive a New Holland tractor and check the values, the indicators
    (lights, beacon, implement), the game icons and the Day / Night switch.

## Risks

| Risk | Handling |
|---|---|
| The symbol sheets lack icons we need | The SVG fallback covers gaps; the mapping is checked by hand in T0. |
| The game files can't be read (macOS path, replay) | The fallback set gives the same look. |
| Moving the map between slots breaks its size | Re-measure after every move; tested in T4. |
| The light day palette clashes with the map's PDA colours | Contrast checked in T0; map colours stay fixed. |
| Tablet browser bars eat height | Fullscreen and home-screen install in T5. |
| Older tablets are slow | Light effects, reduced motion, a test on the slowest tablet available. |
| Trademarks | Brand names as text only, with "Not affiliated"; no logos, photos or artwork in the app or the artifact. |
